// 도메인 등록(K-0) · 세션 시작 준비(K-1 · K-3) — #680 · 012 §7-2.
// 선언은 같은 체크아웃의 `apps/*/domain.json` 을 스캔해 찾는다(#841 · 015 V-2 AD-1 · 계약 pleiades-domain/v0). 허용 도구 목록은 **배포된 읽기 경로의 tools/list** 가 정한다
// (012 §2-1 — 쓰기 도구는 그 경로에 등록되지 않는다). 이 체크아웃의 분류는 방어 한 겹 — 쓰기로 분류된 이름이 목록에 보이면 그 도메인을 쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { getPromptText, listToolDefs, openSession } from "./mcp-client";

/** 선언 파일 이름 — 발견 루트(apps/) 바로 아래 디렉터리마다 이 파일이 있으면 제공자다(015 §4-1 · ops 루트는 V-5) */
export const DECLARATION_FILE = "domain.json";
export const CONTRACT = "pleiades-domain/v0";
export const READ_PATH = "/mcp/read"; // 012 §7-2 K-1 확정(#655)
export const KNOWLEDGE_PROMPT = "domain_knowledge"; // 012 §7-2 K-3 확정(#657)
/** 도메인 지식 상한 — 측정 fin 7,894 B · fit 12,513 B(012 [N10]) 의 여유. 넘으면 그 도메인을 쓰지 않는다(조용히 자르지 않는다) */
export const KNOWLEDGE_MAX_BYTES = 32_000;

const KEY = /^[a-z0-9_]{1,60}$/;
const SUFFIX = /^[A-Z0-9_]{1,40}$/;

export interface DomainDecl {
  id: string;
  name: string;
  keySuffix: string;
  serverKey: string;
  port: number;
  /** 이 체크아웃의 쓰기 분류(접두 없는 이름) */
  write: ReadonlySet<string>;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** domain.json 텍스트 → 선언. 형식이 다르면 던진다(계약 갱신이 필요하다는 뜻). 포트는 env `ADVISOR_MCP_PORT_<SUFFIX>` 가 이긴다. */
export function parseDomain(text: string, env: NodeJS.ProcessEnv): DomainDecl {
  const d: unknown = JSON.parse(text);
  if (!isObj(d) || d.contract !== CONTRACT) throw new Error("domain.json 계약이 다르다");
  const mcp = isObj(d.mcp) ? d.mcp : {};
  const tools = isObj(d.tools) ? d.tools : {};
  const { id, name, keySuffix } = d;
  const { serverKey, defaultPort } = mcp;
  if (typeof id !== "string" || !KEY.test(id) || typeof name !== "string" || !name || typeof keySuffix !== "string" || !SUFFIX.test(keySuffix)
    || typeof serverKey !== "string" || !KEY.test(serverKey) || !Array.isArray(tools.write) || !tools.write.every((n) => typeof n === "string")) {
    throw new Error("domain.json 형식이 다르다(id · name · keySuffix · mcp.serverKey · tools.write)");
  }
  const override = env[`ADVISOR_MCP_PORT_${keySuffix}`];
  const port = override !== undefined && override !== "" ? Number(override) : defaultPort;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${id}: MCP 포트가 정수가 아니다`);
  return { id, name, keySuffix, serverKey, port, write: new Set(tools.write as string[]) };
}

/** 선언 오류 — 그 제공자만 쓰지 않는다. id 는 `apps/<dir>`(선언 안의 id 는 믿을 수 없다) */
export interface BrokenDecl {
  id: string;
  why: string;
}

export interface Discovered {
  /** id 순 — readdir 순서는 보장되지 않는다 */
  decls: DomainDecl[];
  /** `apps/<dir>` 순 */
  broken: BrokenDecl[];
}

/** 로그 · probe 에 남는 사유 — 파일 오류는 코드만(EACCES 등 · 메시지의 절대경로를 남기지 않는다 · #841 9-1 info) */
const reason = (e: unknown) => {
  if (e instanceof SyntaxError) return "JSON";
  const code = (e as NodeJS.ErrnoException | null)?.code;
  if (typeof code === "string") return code;
  return e instanceof Error ? e.message : "알 수 없음";
};
const byKey = <T>(xs: T[], key: (x: T) => string) => [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/**
 * appsDir = 저장소의 apps/ (통합 층 cwd 의 부모). 바로 아래 디렉터리의 domain.json 을 모두 읽는다(#841 · AD-1).
 * 선언 하나의 오류는 그 제공자만 뺀다 — 예전에는 던져서 모든 질문이 거부됐다(015 V4).
 * id · serverKey · keySuffix(포트 override 키)가 겹치면 어느 쪽이 맞는지 모르므로 겹친 쪽 모두 뺀다.
 */
export function loadDomains(appsDir: string, env: NodeJS.ProcessEnv = process.env): Discovered {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return { decls: [], broken: [] };
  }
  const parsed: { label: string; decl: DomainDecl }[] = [];
  const broken: BrokenDecl[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(appsDir, e.name, DECLARATION_FILE);
    if (!fs.existsSync(file)) continue;
    const label = `apps/${e.name}`;
    try {
      parsed.push({ label, decl: parseDomain(fs.readFileSync(file, "utf8"), env) });
    } catch (err) {
      broken.push({ id: label, why: `선언 오류(${reason(err)})` });
    }
  }
  const count = (key: (d: DomainDecl) => string) => {
    const m = new Map<string, number>();
    for (const { decl } of parsed) m.set(key(decl), (m.get(key(decl)) ?? 0) + 1);
    return (d: DomainDecl) => (m.get(key(d)) ?? 0) > 1;
  };
  const dupId = count((d) => d.id);
  const dupServer = count((d) => d.serverKey);
  const dupSuffix = count((d) => d.keySuffix);
  const decls: DomainDecl[] = [];
  for (const { label, decl } of parsed) {
    if (dupId(decl) || dupServer(decl) || dupSuffix(decl)) broken.push({ id: label, why: "선언 오류(id · serverKey · keySuffix 가 겹친다)" });
    else decls.push(decl);
  }
  return { decls: byKey(decls, (d) => d.id), broken: byKey(broken, (b) => b.id) };
}

export const prefixOf = (d: Pick<DomainDecl, "serverKey">) => `mcp__${d.serverKey}__`;
export const readUrlOf = (d: Pick<DomainDecl, "port">) => `http://127.0.0.1:${d.port}${READ_PATH}`;

export type DomainReady =
  | { id: string; ok: true; decl: DomainDecl; allow: string[]; knowledge: string; /** tools/list 도구 정의 바이트 — probe 출력만 쓴다(#839) */ toolBytes: number }
  /** decl = null 은 선언 오류(#841) — 이름을 믿을 수 없어 모델의 "쓸 수 없는 도메인" 안내에 넣지 않는다(B) */
  | { id: string; ok: false; decl: DomainDecl | null; why: string };

/** 한 도메인의 읽기 경로에서 도구 목록과 지식을 받는다. 어느 하나라도 실패하면 그 도메인을 쓰지 않는다(012 R-바닥 정정 ②). */
export async function prepareDomain(decl: DomainDecl, timeoutMs: number): Promise<DomainReady> {
  const fail = (why: string): DomainReady => ({ id: decl.id, ok: false, decl, why });
  let s;
  try {
    s = await openSession(readUrlOf(decl), timeoutMs);
  } catch {
    return fail("읽기 경로 연결 실패");
  }
  try {
    let names: string[];
    let toolBytes: number;
    try {
      ({ names, bytes: toolBytes } = await listToolDefs(s));
    } catch {
      return fail("tools/list 실패");
    }
    if (!names.length) return fail("읽기 도구 0");
    if (names.some((n) => !KEY.test(n))) return fail("도구 이름 형식");
    if (names.some((n) => decl.write.has(n))) return fail("쓰기 분류 도구가 읽기 경로에 있다");
    let knowledge: string;
    try {
      knowledge = await getPromptText(s, KNOWLEDGE_PROMPT);
    } catch {
      return fail("prompts/get 실패");
    }
    if (Buffer.byteLength(knowledge, "utf8") > KNOWLEDGE_MAX_BYTES) return fail("지식 상한 초과");
    return { id: decl.id, ok: true, decl, allow: names.map((n) => prefixOf(decl) + n), knowledge, toolBytes };
  } finally {
    await s.close();
  }
}
