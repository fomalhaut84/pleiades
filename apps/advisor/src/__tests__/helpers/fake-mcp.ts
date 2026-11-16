// 가짜 도메인 MCP 읽기 경로 — StreamableHTTP 의 요청 넷만(initialize · notifications · tools/list · prompts/get · DELETE).
import http from "node:http";
import { AddressInfo } from "node:net";

export interface FakeMcpOptions {
  tools: string[];
  /** null 이면 prompts/get 이 JSON-RPC 오류 */
  knowledge: string | null;
  /** tools/list 를 SSE 로 답한다(StreamableHTTP 의 다른 응답 형식) */
  sse?: boolean;
  failToolsList?: boolean;
}

export interface FakeMcp {
  port: number;
  /** 실행 중에 바꿀 수 있다 — 배포로 도구가 바뀐 상황 */
  opts: FakeMcpOptions;
  calls: string[];
  close(): Promise<void>;
}

export async function startFakeMcp(o: FakeMcpOptions): Promise<FakeMcp> {
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    if (req.url !== "/mcp/read") {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "DELETE") {
      calls.push("DELETE");
      res.writeHead(200).end();
      return;
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const m = JSON.parse(body) as { id?: number; method: string };
      calls.push(m.method);
      const send = (payload: unknown, sse = false, headers: Record<string, string> = {}) => {
        if (sse) {
          res.writeHead(200, { "content-type": "text/event-stream", ...headers }).end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
        } else {
          res.writeHead(200, { "content-type": "application/json", ...headers }).end(JSON.stringify(payload));
        }
      };
      if (m.method === "initialize") {
        send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "fake", version: "1" } } }, false,
          { "mcp-session-id": "sid-1" });
      } else if (m.method === "notifications/initialized") {
        res.writeHead(202).end();
      } else if (m.method === "tools/list") {
        if (o.failToolsList) send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "x" } });
        else send({ jsonrpc: "2.0", id: m.id, result: { tools: o.tools.map((name) => ({ name, inputSchema: { type: "object" } })) } }, o.sse);
      } else if (m.method === "prompts/get") {
        if (o.knowledge === null) send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "x" } });
        else send({ jsonrpc: "2.0", id: m.id, result: { messages: [{ role: "user", content: { type: "text", text: o.knowledge } }] } });
      } else {
        send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "x" } });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as AddressInfo).port,
    opts: o,
    calls,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
