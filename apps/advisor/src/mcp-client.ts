// 도메인 MCP 읽기 경로 클라이언트 — `tools/list` · `prompts/get` (#680 · 012 K-1 · K-3 · Q135).
// X1 `listTools`(StreamableHTTP · JSON 또는 SSE 응답)를 옮기고 prompts/get 을 더했다. SDK 를 싣지 않는다 — 요청 넷뿐이다.
// 호출은 세션 시작 때만이다(모델 턴 0). 통합 층은 DB·cwd 없이 도메인 지식을 이 경로로만 받는다.
import { spawn } from "node:child_process";
import http from "node:http";

export interface HttpResponse {
  status: number;
  contentType: string;
  sessionId: string | undefined;
  text: string;
}

/** 응답 본문 상한 — tools/list 수십 개 · 지식 32 KB 의 여유. 넘으면 실패로 끝낸다 */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * body === null 이면 DELETE(세션 닫기).
 * 요청 전체에 고정 기한을 둔다 — `timeout` 옵션은 유휴 소켓 기준이라, 헤더 뒤 서버가 끊기거나(배포 재기동) SSE 가 열린 채 남으면
 * 울리지 않아 Promise 가 영원히 남고 통합 층이 busy 에 갇힌다(#680 9-1 major M1). 응답 중단 · 오류 · 본문 상한도 실패로 끝낸다.
 */
export function post(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (f: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      f();
    };
    const fail = (why: string) => done(() => {
      req.destroy();
      reject(new Error(why));
    });
    const req = http.request(
      url,
      {
        method: body === null ? "DELETE" : "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      },
      (res) => {
        let s = "";
        let bytes = 0;
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          bytes += Buffer.byteLength(c, "utf8");
          if (bytes > MAX_BODY_BYTES) fail("응답 본문 상한 초과");
          else s += c;
        });
        res.on("error", () => fail("응답 오류"));
        res.on("close", () => {
          if (!res.complete) fail("응답이 도중에 끊겼다");
        });
        res.on("end", () => {
          const sid = res.headers["mcp-session-id"];
          done(() => resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers["content-type"] ?? ""),
            sessionId: typeof sid === "string" ? sid : undefined,
            text: s,
          }));
        });
      },
    );
    const deadline = setTimeout(() => fail("기한 초과"), timeoutMs);
    req.on("error", () => fail("연결 오류"));
    req.end(body === null ? undefined : JSON.stringify(body));
  });
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** 응답에서 id 에 맞는 JSON-RPC result — 없거나 error 면 던진다(메시지에 응답 본문을 싣지 않는다) */
export function rpcResult(res: HttpResponse, id: number): Json {
  const parse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const msgs = /text\/event-stream/.test(res.contentType)
    ? res.text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => parse(l.slice(5)))
    : [parse(res.text)];
  const m = msgs.find((x) => isObj(x) && x.id === id);
  if (res.status !== 200 || !isObj(m) || !isObj(m.result)) throw new Error(`rpc ${id} 실패 (status ${res.status})`);
  return m.result;
}

export interface McpSession {
  call(method: string, params: Json): Promise<Json>;
  close(): Promise<void>;
}

export async function openSession(url: string, timeoutMs: number): Promise<McpSession> {
  const init = await post(
    url,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "pleiades-advisor", version: "1" } },
    },
    {},
    timeoutMs,
  );
  const r = rpcResult(init, 1);
  const headers: Record<string, string> = {
    ...(init.sessionId ? { "mcp-session-id": init.sessionId } : {}),
    ...(typeof r.protocolVersion === "string" ? { "mcp-protocol-version": r.protocolVersion } : {}),
  };
  try {
    await post(url, { jsonrpc: "2.0", method: "notifications/initialized" }, headers, timeoutMs);
  } catch (e) {
    // 열린 서버 세션을 남기지 않는다(9-1 info 9)
    if (init.sessionId) await post(url, null, headers, timeoutMs).catch(() => undefined);
    throw e;
  }
  let next = 2;
  return {
    async call(method, params) {
      const id = next++;
      return rpcResult(await post(url, { jsonrpc: "2.0", id, method, params }, headers, timeoutMs), id);
    },
    async close() {
      // 무활동 정리를 기다리지 않는다 — 실패는 무시(세션은 서버가 결국 지운다)
      if (init.sessionId) await post(url, null, headers, timeoutMs).catch(() => undefined);
    },
  };
}

const MAX_PAGES = 48;

export interface ToolDefs {
  names: string[];
  /** 이름 있는 도구 정의(name · description · inputSchema …)의 UTF-8 JSON 바이트 합 — 모델에 실리는 도구 정의 크기의 근사(#839 · 015 V-1) */
  bytes: number;
}

export async function listToolDefs(s: McpSession): Promise<ToolDefs> {
  const names: string[] = [];
  let bytes = 0;
  let cursor: unknown;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await s.call("tools/list", typeof cursor === "string" ? { cursor } : {});
    for (const t of Array.isArray(res.tools) ? res.tools : []) {
      if (!isObj(t) || typeof t.name !== "string") continue;
      names.push(t.name);
      bytes += Buffer.byteLength(JSON.stringify(t), "utf8");
    }
    cursor = res.nextCursor;
    if (typeof cursor !== "string" || !cursor) return { names, bytes };
  }
  throw new Error("tools/list 페이지가 너무 많다");
}

export async function listTools(s: McpSession): Promise<string[]> {
  return (await listToolDefs(s)).names;
}

/** prompts/get — user/assistant 메시지의 text 를 이어 붙인다. text 가 하나도 없으면 던진다. */
export async function getPromptText(s: McpSession, name: string): Promise<string> {
  const res = await s.call("prompts/get", { name, arguments: {} });
  const texts = (Array.isArray(res.messages) ? res.messages : [])
    .map((m) => (isObj(m) && isObj(m.content) && m.content.type === "text" && typeof m.content.text === "string" ? m.content.text : ""))
    .filter(Boolean);
  if (!texts.length) throw new Error(`prompts/get ${name}: text 없음`);
  return texts.join("\n\n");
}

// ── stdio 전송 (#872 · 015 V-4a · H-R3) ─────────────────────────────
// `local` 호스트를 prepare · probe 가 직접 띄워 묻는다 — CLI 가 질문 때 띄우는 것과 같은 실행 파일 · 같은 args(V-4b).
// 줄 단위 JSON-RPC. 요청마다 기한 · 응답 줄 상한 · 자식이 끝나면 대기 중 요청은 실패. close 는 stdin 을 닫고(H-R4) 기다렸다가 SIGKILL.

export interface StdioSession extends McpSession {
  /** 자식을 띄운 뒤 initialize 응답까지 ms — V-4b 의 기동 상한 판정 */
  initMs: number;
}

/** close 때 자식이 stdin EOF 로 스스로 끝나기를 기다리는 시간 */
export const STDIO_CLOSE_GRACE_MS = 1000;

export async function openStdioSession(command: string, args: readonly string[], timeoutMs: number): Promise<StdioSession> {
  const t0 = Date.now();
  // env 는 비운다 — 호스트는 위치를 args 로만 받는다(015 §3-1 원칙 1) · 상속한 플랫폼 키가 자식에 가지 않는다
  const child = spawn(command, [...args], { stdio: ["pipe", "pipe", "ignore"], env: {} });
  const waiting = new Map<number, { resolve: (m: Json) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  let dead: Error | null = null;
  let buf = "";
  const failAll = (e: Error) => {
    dead ??= e;
    for (const [id, w] of waiting) {
      clearTimeout(w.timer);
      waiting.delete(id);
      w.reject(dead);
    }
  };
  const exited = new Promise<void>((r) => child.once("close", () => r()));
  child.on("error", () => failAll(new Error("호스트를 띄우지 못했다")));
  child.on("close", () => failAll(new Error("호스트가 끝났다")));
  child.stdin.on("error", () => undefined);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c: string) => {
    buf += c;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const s = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let m: unknown;
      try {
        m = JSON.parse(s);
      } catch {
        continue;
      }
      if (!isObj(m) || typeof m.id !== "number") continue;
      const w = waiting.get(m.id);
      if (!w) continue;
      clearTimeout(w.timer);
      waiting.delete(m.id);
      if (isObj(m.result)) w.resolve(m.result);
      else w.reject(new Error(`rpc ${m.id} 실패`)); // 오류 본문을 싣지 않는다
    }
    if (Buffer.byteLength(buf, "utf8") > MAX_BODY_BYTES) {
      buf = "";
      child.kill("SIGKILL");
      failAll(new Error("응답 본문 상한 초과"));
    }
  });
  const send = (msg: Json) => {
    if (dead) throw dead;
    child.stdin.write(`${JSON.stringify(msg)}\n`);
  };
  let next = 1;
  const call = (method: string, params: Json): Promise<Json> => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    const id = next++;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("기한 초과"));
    }, timeoutMs);
    waiting.set(id, { resolve, reject, timer });
    try {
      send({ jsonrpc: "2.0", id, method, params });
    } catch (e) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(e as Error);
    }
  });
  const close = async () => {
    child.stdin.end();
    const grace = setTimeout(() => child.kill("SIGKILL"), STDIO_CLOSE_GRACE_MS);
    // SIGKILL 뒤에도 파이프를 물려받은 손자가 있으면 close 가 오지 않는다 — 유예 두 배에서 기다림을 끝낸다(#872 9-1 I1)
    let cap: NodeJS.Timeout | undefined;
    await Promise.race([exited, new Promise<void>((r) => { cap = setTimeout(r, STDIO_CLOSE_GRACE_MS * 2); })]);
    clearTimeout(grace);
    clearTimeout(cap);
  };
  try {
    await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "pleiades-advisor", version: "1" } });
    const initMs = Date.now() - t0;
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    return { call, close, initMs };
  } catch (e) {
    await close();
    throw e;
  }
}
