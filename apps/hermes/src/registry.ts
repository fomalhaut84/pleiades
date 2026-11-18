/**
 * 출처 레지스트리 · 인증(014 §3-D D1 · H-1a #791).
 *
 * 서버 비공개 파일(체크아웃 밖) — 출처마다 키의 SHA-256 만 둔다(평문 키 없음). 수정 시각이 바뀌면 다시 읽는다(재시작 불필요 ·
 * notify `platformEnv` 와 같다). 파일이 잘못되면 **fail-closed 503** — 401 이면 보내는 쪽이 재시도하지 않아 메시지를 잃는다.
 * 파일이 없으면 출처 0(전부 401).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { hasPii, hasToken } from "./checks";

export interface Source {
  readonly id: string;
  /** 메시지 첫 줄 `[표시 이름]`(#811 — username 은 hermes 고정). "discord" · "clyde" 금지는 옛 username 규칙의 흔적 — 그대로 둔다 */
  readonly name: string;
  readonly keySha256: string;
  readonly enabled: boolean;
  /** YYYY-MM-DD · 그날(KST) 끝까지 받는다 · null = 만료 없음 */
  readonly expires: string | null;
  readonly linkHosts: readonly string[];
  readonly ratePerMinute: number;
}

export type ParseResult = { ok: true; sources: readonly Source[] } | { ok: false; error: string };
export type AuthResult = { ok: true; source: Source } | { ok: false; status: 401 | 403 | 503 };

export interface RegistryStatus {
  readonly sources: number;
  readonly error: boolean;
  /** 7일 안(오늘 포함)에 만료하는 출처 id — 수집기 일일 요약(§3-G · H-3) */
  readonly expiringSoon: readonly string[];
}

export interface Registry {
  authenticate(authorization: string | undefined, now: number): AuthResult;
  status(now: number): RegistryStatus;
  /** 게시 때 표시 이름 · 링크 호스트 — 없거나 레지스트리 오류면 null(링크는 빼고 id 로 보낸다) */
  byId(id: string): Source | null;
}

/** 출처 키 형식(§3-H) — `hrm_` + base62 43자. 형식이 다르면 해시하지 않고 401 */
export const KEY_RE = /^hrm_[A-Za-z0-9]{43}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const FORBIDDEN_NAME_RE = /discord|clyde/i;
const SOURCE_FIELDS = new Set(["id", "name", "keySha256", "enabled", "expires", "linkHosts", "ratePerMinute"]);
const DEFAULT_RATE_PER_MINUTE = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_NOTICE_DAYS = 7;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseSource(raw: unknown, i: number): Source | string {
  const at = `sources[${i}]`;
  if (!isObject(raw)) return `${at}: 객체가 아니다`;
  const extra = Object.keys(raw).filter((k) => !SOURCE_FIELDS.has(k));
  if (extra.length > 0) return `${at}: 모르는 칸`;
  const { id, name, keySha256, enabled, expires, linkHosts, ratePerMinute } = raw;
  if (typeof id !== "string" || !ID_RE.test(id)) return `${at}.id: 형식`;
  if (typeof name !== "string" || [...name].length < 1 || [...name].length > 32 || name.trim() !== name || /[\n\r]/.test(name))
    return `${at}.name: 1~32자 한 줄`;
  if (FORBIDDEN_NAME_RE.test(name)) return `${at}.name: Discord 웹훅 이름에 쓸 수 없는 낱말`;
  // 이름은 모든 게시의 첫 줄에 들어간다 — 토큰 · 전화 · 이메일 모양이면 그 출처의 게시가 전부 막힌다. 등록 때 거부(#811 9-1 info)
  if (hasToken(name) || hasPii(name)) return `${at}.name: 토큰 · 전화번호 · 이메일 모양(게시 전 검사가 모든 게시를 막는다)`;
  if (typeof keySha256 !== "string" || !HEX64_RE.test(keySha256)) return `${at}.keySha256: 소문자 16진수 64자`;
  if (typeof enabled !== "boolean") return `${at}.enabled: 참/거짓`;
  if (expires !== undefined && expires !== null && (typeof expires !== "string" || !validDate(expires)))
    return `${at}.expires: YYYY-MM-DD`;
  if (linkHosts !== undefined && (!Array.isArray(linkHosts) || linkHosts.some((h) => typeof h !== "string")))
    return `${at}.linkHosts: 문자열 배열`;
  const hosts = ((linkHosts as string[] | undefined) ?? []).map((h) => h.toLowerCase());
  if (hosts.some((h) => !HOST_RE.test(h))) return `${at}.linkHosts: 호스트 이름`;
  const rate = ratePerMinute ?? DEFAULT_RATE_PER_MINUTE;
  if (typeof rate !== "number" || !Number.isInteger(rate) || rate < 1 || rate > 600)
    return `${at}.ratePerMinute: 1~600 정수`;
  return { id, name, keySha256, enabled, expires: (expires as string | undefined) ?? null, linkHosts: hosts, ratePerMinute: rate };
}

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 레지스트리 문서 → 출처들. 오류 문구에는 값을 담지 않는다(위치 · 칸만) */
export function parseRegistry(text: string): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 이 아니다" };
  }
  if (!isObject(doc) || !Array.isArray(doc.sources)) return { ok: false, error: "sources 배열이 없다" };
  const sources: Source[] = [];
  for (const [i, raw] of doc.sources.entries()) {
    const s = parseSource(raw, i);
    if (typeof s === "string") return { ok: false, error: s };
    if (sources.some((o) => o.id === s.id)) return { ok: false, error: `sources[${i}].id: 중복` };
    if (sources.some((o) => o.keySha256 === s.keySha256)) return { ok: false, error: `sources[${i}].keySha256: 중복` };
    sources.push(s);
  }
  return { ok: true, sources };
}

/** KST 날짜(YYYY-MM-DD) */
const kstDate = (now: number): string => new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
const expired = (s: Source, now: number): boolean => s.expires !== null && kstDate(now) > s.expires;

type Loaded = { mtimeMs: number | null; result: ParseResult };

export function createRegistry(file: string): Registry {
  let loaded: Loaded | null = null;

  const current = (): ParseResult => {
    let mtimeMs: number | null;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        return { ok: false, error: "레지스트리 상태를 읽지 못했다" };
      }
      mtimeMs = null;
    }
    if (loaded !== null && loaded.mtimeMs === mtimeMs) return loaded.result;
    let result: ParseResult;
    if (mtimeMs === null) {
      result = { ok: true, sources: [] };
    } else {
      try {
        result = parseRegistry(readFileSync(file, "utf8"));
      } catch {
        result = { ok: false, error: "레지스트리를 읽지 못했다" };
      }
    }
    if (!result.ok) console.warn(`[hermes] 레지스트리 오류 — 받기를 503 으로 멈춘다: ${result.error}`);
    loaded = { mtimeMs, result };
    return result;
  };

  return {
    authenticate(authorization, now) {
      const reg = current();
      if (!reg.ok) return { ok: false, status: 503 };
      const m = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
      if (m === null || !KEY_RE.test(m[1])) return { ok: false, status: 401 };
      const digest = createHash("sha256").update(m[1]).digest();
      // 모든 출처와 견준다(맞은 위치로 시간이 갈리지 않게)
      let found: Source | null = null;
      for (const s of reg.sources) {
        if (timingSafeEqual(digest, Buffer.from(s.keySha256, "hex")) && found === null) found = s;
      }
      if (found === null) return { ok: false, status: 401 };
      if (!found.enabled || expired(found, now)) return { ok: false, status: 403 };
      return { ok: true, source: found };
    },
    byId(id) {
      const reg = current();
      return reg.ok ? (reg.sources.find((s) => s.id === id) ?? null) : null;
    },
    status(now) {
      const reg = current();
      if (!reg.ok) return { sources: 0, error: true, expiringSoon: [] };
      const limit = kstDate(now + (EXPIRY_NOTICE_DAYS - 1) * DAY_MS);
      const today = kstDate(now);
      const expiringSoon = reg.sources
        .filter((s) => s.enabled && s.expires !== null && s.expires >= today && s.expires <= limit)
        .map((s) => s.id);
      return { sources: reg.sources.length, error: false, expiringSoon };
    },
  };
}
