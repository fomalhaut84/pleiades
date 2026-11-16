// 도메인 MCP 읽기 경로 클라이언트 — `tools/list` · `prompts/get` (#680 · 012 K-1 · K-3 · Q135).
// X1 `listTools`(StreamableHTTP · JSON 또는 SSE 응답)를 옮기고 prompts/get 을 더했다. SDK 를 싣지 않는다 — 요청 넷뿐이다.
// 호출은 세션 시작 때만이다(모델 턴 0). 통합 층은 DB·cwd 없이 도메인 지식을 이 경로로만 받는다.
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

export async function listTools(s: McpSession): Promise<string[]> {
  const names: string[] = [];
  let cursor: unknown;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await s.call("tools/list", typeof cursor === "string" ? { cursor } : {});
    for (const t of Array.isArray(res.tools) ? res.tools : []) if (isObj(t) && typeof t.name === "string") names.push(t.name);
    cursor = res.nextCursor;
    if (typeof cursor !== "string" || !cursor) return names;
  }
  throw new Error("tools/list 페이지가 너무 많다");
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
