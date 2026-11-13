// 도메인 등록(K-0) · 세션 시작 준비(K-1 · K-3) — #680 · 012 §7-2.
// 선언은 같은 체크아웃의 `apps/<dir>/domain.json`(계약 pleiades-domain/v0). 허용 도구 목록은 **배포된 읽기 경로의 tools/list** 가 정한다
// (012 §2-1 — 쓰기 도구는 그 경로에 등록되지 않는다). 이 체크아웃의 분류는 방어 한 겹 — 쓰기로 분류된 이름이 목록에 보이면 그 도메인을 쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { getPromptText, listTools, openSession } from "./mcp-client";

/** 통합 층이 붙는 도메인 디렉터리(apps/<dir>) — 도메인 #3(#240)은 여기에 한 줄 + 그 앱의 domain.json · 읽기 경로 */
export const DOMAIN_DIRS = ["finance", "fitness"] as const;
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

/** appsDir = 저장소의 apps/ (통합 층 cwd 의 부모) */
export function loadDomains(appsDir: string, env: NodeJS.ProcessEnv = process.env): DomainDecl[] {
  const out = DOMAIN_DIRS.map((dir) => parseDomain(fs.readFileSync(path.join(appsDir, dir, "domain.json"), "utf8"), env));
  const ids = new Set(out.map((d) => d.id));
  const keys = new Set(out.map((d) => d.serverKey));
  if (ids.size !== out.length || keys.size !== out.length) throw new Error("도메인 id · serverKey 가 겹친다");
  return out;
}

export const prefixOf = (d: Pick<DomainDecl, "serverKey">) => `mcp__${d.serverKey}__`;
export const readUrlOf = (d: Pick<DomainDecl, "port">) => `http://127.0.0.1:${d.port}${READ_PATH}`;

export type DomainReady =
  | { id: string; ok: true; decl: DomainDecl; allow: string[]; knowledge: string }
  | { id: string; ok: false; decl: DomainDecl; why: string };

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
    try {
      names = await listTools(s);
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
    return { id: decl.id, ok: true, decl, allow: names.map((n) => prefixOf(decl) + n), knowledge };
  } finally {
    await s.close();
  }
}
