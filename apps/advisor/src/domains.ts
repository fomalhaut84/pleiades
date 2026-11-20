// 도메인 등록(K-0) · 세션 시작 준비(K-1 · K-3) — #680 · 012 §7-2.
// 선언은 같은 체크아웃의 `apps/*/domain.json` 을 스캔해 찾는다(#841 · 015 V-2 AD-1 · 계약 v0 · v1 — #858 V-3). 허용 도구 목록은 **배포된 읽기 경로의 tools/list** 가 정한다
// (012 §2-1 — 쓰기 도구는 그 경로에 등록되지 않는다). 이 체크아웃의 분류는 방어 한 겹 — 쓰기로 분류된 이름이 목록에 보이면 그 도메인을 쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { LOCAL_INIT_MAX_MS } from "./local/host";
import type { Registry } from "./local/readers";
import { McpSession, getPromptText, listToolDefs, openSession, openStdioSession } from "./mcp-client";

/** 선언 파일 이름 — 발견 루트(apps/) 바로 아래 디렉터리마다 이 파일이 있으면 제공자다(015 §4-1) */
export const DECLARATION_FILE = "domain.json";
/** apps/ 밖의 선언 — 저장소 루트 기준 디렉터리(015 §4-1 · Q144 · #880 V-5). 수집기는 앱이 아니라 deploy/ops 에 있다 */
export const EXTRA_DECLARATION_DIRS: readonly string[] = ["deploy/ops"];
export const CONTRACT_V0 = "pleiades-domain/v0";
export const CONTRACT_V1 = "pleiades-domain/v1"; // 015 §3-2 (#858 V-3)
export const READ_PATH = "/mcp/read"; // 012 §7-2 K-1 확정(#655)
export const KNOWLEDGE_PROMPT = "domain_knowledge"; // 012 §7-2 K-3 확정(#657)
/** 도메인 지식 상한 — 측정 fin 7,894 B · fit 12,513 B(012 [N10]) 의 여유. 넘으면 그 도메인을 쓰지 않는다(조용히 자르지 않는다) */
export const KNOWLEDGE_MAX_BYTES = 32_000;
/** 제공자 요약 한 줄 상한 — 015 §0-3 X1 */
export const SUMMARY_MAX_BYTES = 200;

const KEY = /^[a-z0-9_]{1,60}$/;
const SUFFIX = /^[A-Z0-9_]{1,40}$/;
/** K-7 모델 핀 출처 — 앱 디렉터리 아래 `src/…ts` 만(`..` · 절대경로 없음) */
const MODELS_FILE = /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/;
const CONSTANT = /^[A-Za-z_][A-Za-z0-9_]{0,60}$/;
const V1_KEYS: ReadonlySet<string> = new Set(["$comment", "contract", "id", "name", "kind", "summary", "enabled", "keySuffix", "knowledge", "models", "mcp", "local", "tools"]);

export interface ModelsRef {
  /** 앱 디렉터리 기준 파일 */
  file: string;
  /** 그 파일의 고정 모델 상수 이름 */
  constant: string;
}

interface DeclBase {
  /** 발견 루트 아래 디렉터리 이름(apps/<dir>) — 모델 핀 파일을 여기서 찾는다 · apps 밖 선언은 빈 문자열 */
  dir: string;
  /** 선언 위치 — 저장소 루트 기준(`apps/<dir>` · `deploy/ops`). `local` 리더의 허용 선언 위치와 대조한다(015 §3-1 원칙 1 · #880) */
  origin: string;
  id: string;
  name: string;
  /** 지식 prompt 가 없을 때 지식 절이 되는 한 줄(v1 · ≤ SUMMARY_MAX_BYTES) · v0 는 빈 문자열 */
  summary: string;
  /** false 면 발견은 하되 쓰지 않는다 — 모델 안내에도 넣지 않는다(015 §4-1 E1 · 정상 끄기 경로) */
  enabled: boolean;
  /** K-4 채널 키 접미사 — v1 은 선택 */
  keySuffix: string | null;
  serverKey: string;
  /** 이 체크아웃의 쓰기 분류(접두 없는 이름) */
  write: ReadonlySet<string>;
  /** K-2 제안 분류(v1 신설 · v0 = 빈 집합) — 읽기 경로에 보이면 그 도메인을 쓰지 않는다 */
  propose: ReadonlySet<string>;
  /** K-3 — 참이면 `domain_knowledge` prompt 가 있어야 한다 · 거짓이면 summary 를 지식 절로(v0 는 늘 참) */
  knowledge: boolean;
  /** K-7 — 모델을 부르는 앱만 */
  models: ModelsRef | null;
}

export interface McpDecl extends DeclBase {
  kind: "mcp";
  port: number;
  /** 포트 override env 키 — 제공자 간 유일해야 한다(015 §3-2 K-0 · AU2:30) */
  portKey: string;
}

/** 통합 층이 띄우는 읽기 호스트(015 §3-1 P-b) — 질문 때는 CLI 가 · 준비 때는 prepare 가 같은 명령으로 띄운다(H-R3 · #873 V-4b) */
export interface LocalDecl extends DeclBase {
  kind: "local";
  reader: string;
  /** 선언 tools.read — 호스트가 등록한 이름은 이 안이어야 한다(쓰기 0 겹 ① · #873) */
  read: ReadonlySet<string>;
}

export type DomainDecl = McpDecl | LocalDecl;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isNames = (v: unknown): v is string[] => Array.isArray(v) && v.every((n) => typeof n === "string" && KEY.test(n));

function portOf(id: string, key: string, defaultPort: unknown, env: NodeJS.ProcessEnv): number {
  const override = env[key];
  const port = override !== undefined && override !== "" ? Number(override) : defaultPort;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${id}: MCP 포트가 정수가 아니다`);
  return port;
}

/** v0 — 012 §7-2 그대로(동작 무변경 · 형식 검사도 넓히지 않는다) */
function parseV0(d: Json, env: NodeJS.ProcessEnv, dir: string): McpDecl {
  const mcp = isObj(d.mcp) ? d.mcp : {};
  const tools = isObj(d.tools) ? d.tools : {};
  const { id, name, keySuffix } = d;
  const { serverKey, defaultPort } = mcp;
  if (typeof id !== "string" || !KEY.test(id) || typeof name !== "string" || !name || typeof keySuffix !== "string" || !SUFFIX.test(keySuffix)
    || typeof serverKey !== "string" || !KEY.test(serverKey) || !Array.isArray(tools.write) || !tools.write.every((n) => typeof n === "string")) {
    throw new Error("domain.json 형식이 다르다(id · name · keySuffix · mcp.serverKey · tools.write)");
  }
  const portKey = `ADVISOR_MCP_PORT_${keySuffix}`;
  return { kind: "mcp", dir, origin: `apps/${dir}`, id, name, summary: "", enabled: true, keySuffix, serverKey, port: portOf(id, portKey, defaultPort, env), portKey,
    write: new Set(tools.write as string[]), propose: new Set(), knowledge: true, models: null };
}

function parseModels(v: unknown): ModelsRef | null {
  if (v === undefined) return null;
  if (!isObj(v) || typeof v.file !== "string" || !MODELS_FILE.test(v.file) || typeof v.constant !== "string" || !CONSTANT.test(v.constant)) {
    throw new Error("domain.json models 형식이 다르다(file · constant)");
  }
  return { file: v.file, constant: v.constant };
}

/** v1 — 015 §3-2. 모르는 키 · 빠진 분류 · 종류에 맞지 않는 요소는 거부한다(fail-closed) */
function parseV1(d: Json, env: NodeJS.ProcessEnv, dir: string): DomainDecl {
  const bad = (what: string) => new Error(`domain.json v1 형식이 다르다(${what})`);
  const unknown = Object.keys(d).filter((k) => !V1_KEYS.has(k));
  if (unknown.length) throw bad(`모르는 키 ${unknown.length}`);
  const { id, name, kind, summary, enabled, keySuffix, knowledge } = d;
  if (typeof id !== "string" || !KEY.test(id) || typeof name !== "string" || !name) throw bad("id · name");
  if (typeof summary !== "string" || !summary || Buffer.byteLength(summary, "utf8") > SUMMARY_MAX_BYTES) throw bad("summary");
  if (enabled !== undefined && typeof enabled !== "boolean") throw bad("enabled");
  if (knowledge !== undefined && typeof knowledge !== "boolean") throw bad("knowledge");
  if (keySuffix !== undefined && (typeof keySuffix !== "string" || !SUFFIX.test(keySuffix))) throw bad("keySuffix");
  const tools = isObj(d.tools) ? d.tools : null;
  if (!tools || !isNames(tools.read) || !isNames(tools.write) || !isNames(tools.propose)) throw bad("tools.read · write · propose");
  const all = [...tools.read, ...tools.write, ...tools.propose];
  if (new Set(all).size !== all.length) throw bad("분류 중복");
  const base = { dir, origin: `apps/${dir}`, id, name, summary, enabled: enabled !== false, keySuffix: (keySuffix as string | undefined) ?? null,
    write: new Set(tools.write), propose: new Set(tools.propose), knowledge: knowledge === true, models: parseModels(d.models) };
  if (kind === "mcp") {
    if (d.local !== undefined || !isObj(d.mcp) || typeof d.mcp.serverKey !== "string" || !KEY.test(d.mcp.serverKey)) throw bad("mcp.serverKey");
    if (tools.propose.length) throw bad("mcp 는 propose 를 쓰지 않는다");
    const portKey = `ADVISOR_MCP_PORT_${base.keySuffix ?? id.toUpperCase()}`;
    return { ...base, kind, serverKey: d.mcp.serverKey, port: portOf(id, portKey, d.mcp.defaultPort, env), portKey };
  }
  if (kind === "local") {
    if (d.mcp !== undefined || !isObj(d.local) || typeof d.local.reader !== "string" || !KEY.test(d.local.reader)) throw bad("local.reader");
    if (tools.write.length) throw bad("local 은 write 가 늘 빈 배열");
    const serverKey = `pl_${id}`; // H-R2
    if (!KEY.test(serverKey)) throw bad("id 가 길다");
    return { ...base, kind, serverKey, reader: d.local.reader, read: new Set(tools.read) };
  }
  throw bad("kind");
}

/** domain.json 텍스트 → 선언. 형식이 다르면 던진다(계약 갱신이 필요하다는 뜻). 포트는 env `ADVISOR_MCP_PORT_<…>` 가 이긴다. */
export function parseDomain(text: string, env: NodeJS.ProcessEnv, dir = ""): DomainDecl {
  const d: unknown = JSON.parse(text);
  if (!isObj(d) || (d.contract !== CONTRACT_V0 && d.contract !== CONTRACT_V1)) throw new Error("domain.json 계약이 다르다");
  return d.contract === CONTRACT_V0 ? parseV0(d, env, dir) : parseV1(d, env, dir);
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
 * id · serverKey · keySuffix(채널 키) · 포트 override 키가 겹치면 어느 쪽이 맞는지 모르므로 겹친 쪽 모두 뺀다.
 * 심링크 디렉터리는 따라가지 않는다(#842 9-1 info) — 체크아웃 밖을 가리킬 수 있고, 저장소의 앱은 실제 디렉터리다.
 */
export function loadDomains(appsDir: string, env: NodeJS.ProcessEnv = process.env, extraDirs: readonly string[] = EXTRA_DECLARATION_DIRS): Discovered {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return { decls: [], broken: [] };
  }
  const parsed: { label: string; decl: DomainDecl }[] = [];
  const broken: BrokenDecl[] = [];
  const read = (label: string, file: string, dir: string) => {
    if (!fs.existsSync(file)) return;
    try {
      parsed.push({ label, decl: { ...parseDomain(fs.readFileSync(file, "utf8"), env, dir), origin: label } });
    } catch (err) {
      broken.push({ id: label, why: `선언 오류(${reason(err)})` });
    }
  };
  for (const e of entries) {
    if (!e.isDirectory()) continue; // Dirent 는 링크를 따라가지 않는다 — 심링크는 여기서 빠진다
    read(`apps/${e.name}`, path.join(appsDir, e.name, DECLARATION_FILE), e.name);
  }
  // apps 밖 — 저장소 루트(appsDir 의 부모) 기준 고정 위치만 · 심링크 디렉터리는 apps/ 와 같이 따라가지 않는다
  const repoRoot = path.dirname(path.resolve(appsDir));
  for (const rel of extraDirs) {
    const dir = path.join(repoRoot, rel);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(dir);
    } catch {
      continue;
    }
    if (st.isDirectory()) read(rel, path.join(dir, DECLARATION_FILE), "");
  }
  // 키가 없는 선언(keySuffix 없음 · local 의 포트 키)은 세지 않는다
  const count = (key: (d: DomainDecl) => string | null) => {
    const m = new Map<string, number>();
    for (const { decl } of parsed) {
      const k = key(decl);
      if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return (d: DomainDecl) => {
      const k = key(d);
      return k !== null && (m.get(k) ?? 0) > 1;
    };
  };
  const dups = [count((d) => d.id), count((d) => d.serverKey), count((d) => d.keySuffix), count((d) => (d.kind === "mcp" ? d.portKey : null))];
  const decls: DomainDecl[] = [];
  for (const { label, decl } of parsed) {
    if (dups.some((dup) => dup(decl))) broken.push({ id: label, why: "선언 오류(id · serverKey · keySuffix · 포트 키가 겹친다)" });
    else decls.push(decl);
  }
  return { decls: byKey(decls, (d) => d.id), broken: byKey(broken, (b) => b.id) };
}

export const prefixOf = (d: Pick<DomainDecl, "serverKey">) => `mcp__${d.serverKey}__`;
export const readUrlOf = (d: Pick<McpDecl, "port">) => `http://127.0.0.1:${d.port}${READ_PATH}`;

/** `local` 호스트를 띄우는 문맥 — 리더 레지스트리 · 실행 파일(H-R6 = process.execPath) · 앞 인자(호스트 번들) · 통합 층 비공개 루트 */
export interface LocalHostContext {
  registry: Registry;
  command: string;
  prefix: readonly string[];
  privateRoot: string;
  /** 기동 상한(기본 LOCAL_INIT_MAX_MS) — 시험이 정상 경로에서 넉넉히 둔다(느린 러너 · #873 9-1 info 1) */
  initMaxMs?: number;
}

export interface Launch {
  command: string;
  args: string[];
}

/**
 * 호스트 실행 명령 — prepare · probe · mcp-config 가 같은 것을 쓴다(H-R3). null = 이 선언은 그 리더를 고를 수 없다.
 * 리더가 레지스트리에 있고 그 리더의 허용 선언 위치가 이 선언의 위치(origin)여야 한다(015 §3-1 원칙 1).
 */
export function localLaunch(decl: LocalDecl, ctx: LocalHostContext): Launch | null {
  const reader = ctx.registry.get(decl.reader);
  if (!reader || reader.allowedDecl !== decl.origin) return null;
  const dir = reader.location(ctx.privateRoot);
  if (!path.isAbsolute(dir)) return null;
  return { command: ctx.command, args: [...ctx.prefix, "--reader", decl.reader, "--dir", dir] };
}

export type DomainReady =
  | { id: string; ok: true; decl: DomainDecl; allow: string[]; knowledge: string; /** tools/list 도구 정의 바이트 — probe 출력만 쓴다(#839) */ toolBytes: number;
      /** local 만 — 질문 때 mcp-config 에 쓸 명령(prepare 와 같다) · 기동 ms(probe) */ launch?: Launch; initMs?: number }
  /** decl = null 은 선언 오류(#841) — 이름을 믿을 수 없어 모델의 "쓸 수 없는 도메인" 안내에 넣지 않는다(B) */
  | { id: string; ok: false; decl: DomainDecl | null; why: string };

/** 열린 세션에서 도구 목록 · 지식 — 두 종류가 같은 검사를 탄다. local 은 이름이 선언 read 안이어야 한다(쓰기 0 겹 ①) */
async function readyFrom(decl: DomainDecl, s: McpSession, extra: { launch?: Launch; initMs?: number }): Promise<DomainReady> {
  const fail = (why: string): DomainReady => ({ id: decl.id, ok: false, decl, why });
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
  if (names.some((n) => decl.propose.has(n))) return fail("제안 분류 도구가 읽기 경로에 있다");
  if (decl.kind === "local" && names.some((n) => !decl.read.has(n))) return fail("선언에 없는 도구");
  // K-3 — 지식 prompt 를 선언한 제공자만 받는다 · 선언했는데 못 받으면 그 도메인을 쓰지 않는다(지금처럼) · 아니면 summary 한 줄(015 §3-2)
  let knowledge = decl.summary;
  if (decl.knowledge) {
    try {
      knowledge = await getPromptText(s, KNOWLEDGE_PROMPT);
    } catch {
      return fail("prompts/get 실패");
    }
  }
  if (Buffer.byteLength(knowledge, "utf8") > KNOWLEDGE_MAX_BYTES) return fail("지식 상한 초과");
  return { id: decl.id, ok: true, decl, allow: names.map((n) => prefixOf(decl) + n), knowledge, toolBytes, ...extra };
}

/** local — 호스트를 질문 때와 같은 명령으로 띄워 묻는다(H-R3). 기동이 상한을 넘으면 쓰지 않는다(질문마다 CLI 의 init 첫 줄이 늦어진다 · #868) */
async function prepareLocal(decl: LocalDecl, timeoutMs: number, ctx: LocalHostContext | undefined): Promise<DomainReady> {
  const fail = (why: string): DomainReady => ({ id: decl.id, ok: false, decl, why });
  let launch: Launch | null;
  try {
    launch = ctx ? localLaunch(decl, ctx) : null;
  } catch {
    launch = null;
  }
  if (!launch) return fail("reader-not-allowed");
  let s;
  try {
    s = await openStdioSession(launch.command, launch.args, timeoutMs);
  } catch {
    return fail("호스트 기동 실패");
  }
  try {
    if (s.initMs > (ctx?.initMaxMs ?? LOCAL_INIT_MAX_MS)) return fail("기동 지연");
    return await readyFrom(decl, s, { launch, initMs: s.initMs });
  } finally {
    await s.close();
  }
}

/** 한 도메인의 읽기 경로에서 도구 목록과 지식을 받는다. 어느 하나라도 실패하면 그 도메인을 쓰지 않는다(012 R-바닥 정정 ②). */
export async function prepareDomain(decl: DomainDecl, timeoutMs: number, local?: LocalHostContext): Promise<DomainReady> {
  const fail = (why: string): DomainReady => ({ id: decl.id, ok: false, decl, why });
  if (decl.kind === "local") return prepareLocal(decl, timeoutMs, local);
  let s;
  try {
    s = await openSession(readUrlOf(decl), timeoutMs);
  } catch {
    return fail("읽기 경로 연결 실패");
  }
  try {
    return await readyFrom(decl, s, {});
  } finally {
    await s.close();
  }
}
