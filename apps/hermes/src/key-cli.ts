/**
 * 출처 키 관리(014 §3-D · H-2 #800) — `hermes key add|list|disable|enable|remove`.
 *
 * 키 발급 · 회수는 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 레지스트리에는 키의 SHA-256 만 쓴다 — 평문 키는
 * `add` 때 **한 번만** 출력하고 어디에도 저장하지 않는다. 쓰기 전에 `parseRegistry` 로 결과를 다시 검증하고(받기 쪽과 같은
 * 규칙) 임시 파일 → rename 으로 원자적으로 · 0600 으로 쓴다. 받기 쪽은 수정 시각으로 다시 읽는다(재시작 불필요).
 * 키 모양(§3-H): `hrm_` + base62 43자 · 16진수 밖 글자 · 숫자 · 영문 모두 — 수집기 일반 토큰 검사가 잡는 모양.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { KEY_RE, parseRegistry, type Source } from "./registry";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function newKey(random: (n: number) => Buffer = randomBytes): string {
  for (;;) {
    let body = "";
    for (const b of random(64)) {
      if (b < 248) body += BASE62[b % 62]; // 248 = 62 × 4 — 치우침 없이
      if (body.length === 43) break;
    }
    if (body.length === 43 && /[g-zG-Z]/.test(body) && /\d/.test(body) && /[A-Za-z]/.test(body)) {
      const key = `hrm_${body}`;
      if (KEY_RE.test(key)) return key;
    }
  }
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export interface Io {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

type Doc = { sources: Source[] };

function load(file: string): Doc | string {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { sources: [] };
    return "레지스트리를 읽지 못했다";
  }
  const r = parseRegistry(text);
  return r.ok ? { sources: [...r.sources] } : `레지스트리 오류 — ${r.error}(손으로 고친 뒤 다시)`;
}

function save(file: string, doc: Doc): string | null {
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  const check = parseRegistry(text);
  if (!check.ok) return `쓰지 않았다 — ${check.error}`;
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
  return null;
}

/** `--name 값` 꼴 옵션 — 같은 이름이 여러 번이면 모두(link-host) */
function opts(args: readonly string[]): { pos: string[]; flags: Map<string, string[]> } | string {
  const pos: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) return `${a} 에 값이 없다`;
    flags.set(a, [...(flags.get(a) ?? []), v]);
    i++;
  }
  return { pos, flags };
}

const USAGE = [
  "사용: hermes key add <id> --name <표시 이름> [--expires YYYY-MM-DD] [--link-host <호스트>]… [--rate <분당>]",
  "      hermes key list",
  "      hermes key disable <id> | enable <id> | remove <id>",
  "      hermes key rotate <id>        (새 키 발급 · 옛 키는 바로 무효)",
];

export function runKeyCli(args: readonly string[], registryFile: string, io: Io): number {
  const parsed = opts(args);
  if (typeof parsed === "string") {
    io.err(parsed);
    return 2;
  }
  const [cmd, id] = parsed.pos;
  const f = parsed.flags;
  const one = (k: string) => f.get(k)?.at(-1);
  const known = new Set(["--name", "--expires", "--link-host", "--rate"]);
  const unknown = [...f.keys()].filter((k) => !known.has(k));
  if (cmd === undefined || unknown.length > 0) {
    USAGE.forEach(io.err);
    return 2;
  }
  const doc = load(registryFile);
  if (typeof doc === "string") {
    io.err(doc);
    return 1;
  }
  const find = () => doc.sources.findIndex((s) => s.id === id);
  const write = (next: Doc, msg: string): number => {
    const e = save(registryFile, next);
    if (e !== null) {
      io.err(e);
      return 1;
    }
    io.out(msg);
    return 0;
  };

  switch (cmd) {
    case "list": {
      if (doc.sources.length === 0) io.out("출처 없음");
      for (const s of doc.sources) {
        io.out(
          `${s.id} · ${s.name} · ${s.enabled ? "켜짐" : "꺼짐"} · 만료 ${s.expires ?? "없음"} · 링크 ${s.linkHosts.join(",") || "없음"} · 분당 ${s.ratePerMinute}`,
        );
      }
      return 0;
    }
    case "add": {
      if (id === undefined || one("--name") === undefined) {
        USAGE.forEach(io.err);
        return 2;
      }
      if (find() >= 0) {
        io.err(`이미 있다: ${id}(키를 바꾸려면 rotate)`);
        return 1;
      }
      const key = newKey();
      const rate = one("--rate");
      const src = {
        id,
        name: one("--name"),
        keySha256: sha256(key),
        enabled: true,
        ...(one("--expires") !== undefined ? { expires: one("--expires") } : {}),
        linkHosts: f.get("--link-host") ?? [],
        ...(rate !== undefined ? { ratePerMinute: Number(rate) } : {}),
      } as unknown as Source;
      const rc = write({ sources: [...doc.sources, src] }, `추가: ${id}`);
      if (rc === 0) printKey(io, id, key);
      return rc;
    }
    case "rotate": {
      const i = find();
      if (id === undefined || i < 0) {
        io.err(`없다: ${id ?? "(id 없음)"}`);
        return 1;
      }
      const key = newKey();
      const next = doc.sources.map((s, j) => (j === i ? { ...s, keySha256: sha256(key) } : s));
      const rc = write({ sources: next }, `새 키: ${id}(옛 키는 지금부터 401)`);
      if (rc === 0) printKey(io, id, key);
      return rc;
    }
    case "disable":
    case "enable": {
      const i = find();
      if (id === undefined || i < 0) {
        io.err(`없다: ${id ?? "(id 없음)"}`);
        return 1;
      }
      const next = doc.sources.map((s, j) => (j === i ? { ...s, enabled: cmd === "enable" } : s));
      return write({ sources: next }, `${cmd === "enable" ? "켬" : "끔"}: ${id}`);
    }
    case "remove": {
      const i = find();
      if (id === undefined || i < 0) {
        io.err(`없다: ${id ?? "(id 없음)"}`);
        return 1;
      }
      return write({ sources: doc.sources.filter((_, j) => j !== i) }, `삭제: ${id}`);
    }
    default:
      USAGE.forEach(io.err);
      return 2;
  }
}

function printKey(io: Io, id: string, key: string): void {
  io.out(`키(${id} · 지금 한 번만 보인다 — 출처 쪽 설정에 넣고 이 화면은 닫는다):`);
  io.out(key);
}
