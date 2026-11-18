/**
 * 게시 전 검사(014 §3-F F1 · H-1b #794) — 완성된 Discord 본문에 건다. 걸리면 본문 대신 고정 문구(사유 코드만).
 *
 * ② 토큰 형식 · ③ 길이 · ① 비밀 대조는 수집기(`deploy/ops/collect.cjs` checkPost)와 같은 규칙이다 — 토큰 형식은 공통 벡터
 * `tools/ops/token_vectors.json` 을 세 판(승격 검사기 · 수집기 · 여기)이 함께 시험한다. 고치면 세 곳을 같이 고친다.
 * ① 의 재료는 플랫폼 설정 + hermes 자기 env 뿐(D13 — 두 앱 `.env` 는 읽지 않는다 · 앱 비밀 모양은 ② 가 덮는다).
 * 개인정보(D11): 전화번호 · 이메일 패턴. 이름 · 주소는 기계로 못 잡는다 — 출처 등록 런북의 체크 항목(§3-I).
 */
import { readFileSync } from "node:fs";
import { findPlatformEnvFile, parsePlatformEnv } from "@pleiades/notify";

export type BlockReason = "length" | "token" | "secret-match" | "pii";

/** ③ Discord 메시지 한 건 상한 */
export const POST_MAX = 2000;
/** ① 대조 최소 길이 — 짧은 값은 문구 · 숫자와 우연히 맞는다(거짓 차단) */
const SECRET_MIN = 8;
/** ① 대조할 키 — 수집기 SECRET_KEY 와 같다 */
const SECRET_KEY = /TOKEN|SECRET|PASSWORD|EMAIL|WEBHOOK|_KEY(?:_|$)|_PIN$|^DATABASE_URL$/;

const W = "A-Za-z0-9_";
/** ② 토큰 형식 — 수집기 TOKEN_RES 와 같다 */
const TOKEN_RES = [
  new RegExp(`(?<![${W}])(?:bot)?\\d{6,}:[A-Za-z0-9_-]{30,}`),
  new RegExp(`(?<![${W}-])[MNO][A-Za-z\\d_-]{20,}\\.[A-Za-z\\d_-]{5,}\\.[A-Za-z\\d_-]{25,}`),
  new RegExp(`(?<![${W}-])eyJ[${W}-]{10,}\\.[${W}-]{10,}\\.[${W}-]{10,}`),
  new RegExp(`(?<![${W}])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[${W}]{20,})`),
  new RegExp(`(?<![${W}-])sk-[A-Za-z0-9_-]{20,}`),
  new RegExp(`(?<![${W}])AKIA[0-9A-Z]{16}(?![${W}])`),
  new RegExp(`(?<![${W}])xox[abposr]-[A-Za-z0-9-]{4,}`),
  /\/(?:webhooks|interactions)\/[^/\s]*\/[A-Za-z0-9_-]{20,}/,
];
const GENERIC_TOKEN = new RegExp(`(?<![${W}-])[${W}-]{32,}(?![${W}-])`, "g");
const MIN_TOKEN_PIECE = 16;

/** 개인정보 — 국내 휴대폰 · 지역 번호 · +82 · 이메일. 앞뒤가 숫자면 아니다(주문 번호 · 날짜 안의 숫자열) */
const PHONE_RE = /(?<![\d])(?:\+82[ -]?|0)(?:1[016789]|2|[3-6][1-5]|70)[ -]?\d{3,4}[ -]?\d{4}(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

const isGenericToken = (s: string): boolean =>
  !/^[0-9a-fA-F]+$/.test(s) &&
  /\d/.test(s) &&
  /[A-Za-z]/.test(s) &&
  Math.max(...s.split(/[-_]/).map((p) => p.length)) >= MIN_TOKEN_PIECE;

export const hasToken = (s: string): boolean =>
  TOKEN_RES.some((re) => re.test(s)) || [...s.matchAll(GENERIC_TOKEN)].some((m) => isGenericToken(m[0]));

const hasPii = (s: string): boolean => PHONE_RE.test(s) || EMAIL_RE.test(s);

/** escape 가 넣은 `\` 가 값을 끊는다 — 대조는 벗긴 본문으로도 한다 */
const unescapeMd = (s: string): string => s.replace(/\\(.)/g, "$1");

/** null = 통과 · 아니면 사유 코드 */
export function checkContent(content: string, secrets: readonly string[]): BlockReason | null {
  if (content.length > POST_MAX) return "length";
  const plain = unescapeMd(content);
  if (hasToken(content) || hasToken(plain)) return "token";
  if (secrets.some((v) => content.includes(v) || plain.includes(v))) return "secret-match";
  if (hasPii(content) || hasPii(plain)) return "pii";
  return null;
}

/** ① 재료 — 비밀 키의 8자 이상 값만 · 중복 없이(값은 메모리에만) */
export function collectSecrets(
  platform: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const out = new Set<string>();
  for (const src of [platform, env]) {
    for (const [k, v] of Object.entries(src)) {
      if (v !== undefined && SECRET_KEY.test(k) && v.length >= SECRET_MIN) out.add(v);
    }
  }
  return [...out];
}

/**
 * 플랫폼 설정 파일 + 프로세스 env 에서 ① 재료를 읽는다. 파일이 없으면 env 만(설정 전) · 있는데 못 읽으면 ok=false(fail-closed —
 * 게시 루프가 멈춘다).
 */
export function loadSecrets(): { ok: boolean; values: string[] } {
  const file = findPlatformEnvFile();
  let platform: Record<string, string> = {};
  if (file !== undefined) {
    try {
      platform = parsePlatformEnv(readFileSync(file, "utf8")).values;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return { ok: false, values: [] };
    }
  }
  return { ok: true, values: collectSecrets(platform, process.env) };
}
