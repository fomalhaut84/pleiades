// 회귀: #680 9-1 major M1 — MCP 응답이 도중에 끊기거나 열린 채 남으면 post() 가 끝나지 않아 통합 층이 busy 에 갇혔다.
import http from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, post } from "../mcp-client";

let server: http.Server | null = null;
afterEach(async () => {
  if (server) await new Promise((r) => server!.close(() => r(undefined)));
  server = null;
});

async function serve(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/read`;
}

describe("post — 끝나지 않는 응답", () => {
  it("헤더 뒤 소켓이 끊기면 실패로 끝난다(배포 재기동)", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await expect(post(url, {}, {}, 5000)).rejects.toThrow(/끊겼다|오류/);
  });

  it("SSE 가 열린 채 남으면 기한에 실패로 끝난다", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("event: message\n");
      const t = setInterval(() => res.write(": ping\n"), 50); // 유휴가 아니라 유휴 timeout 으로는 안 끝난다
      res.on("close", () => clearInterval(t));
    });
    const t0 = Date.now();
    await expect(post(url, {}, {}, 300)).rejects.toThrow(/기한/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("본문 상한을 넘으면 실패", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("x".repeat(MAX_BODY_BYTES + 1));
    });
    await expect(post(url, {}, {}, 5000)).rejects.toThrow(/상한/);
  });

  it("연결 거부도 실패로 끝난다 · 정상 응답은 그대로", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "s1" }).end('{"ok":1}');
    });
    await expect(post(url, {}, {}, 2000)).resolves.toMatchObject({ status: 200, sessionId: "s1", text: '{"ok":1}' });
    await new Promise((r) => server!.close(() => r(undefined)));
    server = null;
    await expect(post(url, {}, {}, 2000)).rejects.toThrow(/연결/);
  });
});
