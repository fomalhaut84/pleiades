// 014 §2 — POST /v1/messages · GET /v1/health(H-1a · #791). 실제 HTTP · 실제 대기열(임시 디렉터리)
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openQueue, type Queue } from "../queue";
import { createRateLimiter } from "../rate-limit";
import { createRegistry } from "../registry";
import { createHermesServer, MAX_BODY_BYTES, type HermesServer } from "../server";

const KEY = "hrm_" + "aZ09".repeat(10) + "xYz";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("hermes 받기 API", () => {
  let dir: string;
  let q: Queue;
  let srv: HermesServer;
  let base: string;
  let now: number;
  let log: ReturnType<typeof vi.spyOn>;

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-srv-"));
    const reg = path.join(dir, "sources.json");
    writeFileSync(
      reg,
      JSON.stringify({
        sources: [{ id: "orders", name: "주문", keySha256: sha(KEY), enabled: true, linkHosts: [], ratePerMinute: 5 }],
      }),
    );
    q = openQueue(path.join(dir, "hermes.db"));
    now = Date.UTC(2026, 10, 18, 3, 0, 0);
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    srv = createHermesServer({ registry: createRegistry(reg), queue: q, limiter: createRateLimiter(), now: () => now });
    await new Promise<void>((r) => srv.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(srv.server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await srv.close();
    q.close();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("health — 인증 없이 {ok:true} 뿐", async () => {
    const r = await fetch(`${base}/v1/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("202 · 대기열에 들어간다 · 같은 Idempotency-Key 는 duplicate", async () => {
    const r1 = await post({ text: "주문 #1" }, { "idempotency-key": "o-1" });
    expect(r1.status).toBe(202);
    const b1 = (await r1.json()) as { id: string; duplicate: boolean };
    expect(b1.duplicate).toBe(false);
    expect(q.nextDue(now)).toMatchObject({ id: b1.id, source: "orders", text: "주문 #1", idempotencyKey: "o-1" });
    const r2 = await post({ text: "주문 #1" }, { "idempotency-key": "o-1" });
    expect(await r2.json()).toEqual({ id: b1.id, duplicate: true });
  });

  it("401 · 403 은 본문을 읽기 전에", async () => {
    expect((await post({ text: "a" }, { authorization: "Bearer hrm_x" })).status).toBe(401);
    const r = await fetch(`${base}/v1/messages`, { method: "POST", body: "{}" });
    expect(r.status).toBe(401);
  });

  it("400 은 사유 코드만", async () => {
    const r = await post({ text: "a", link: { label: "x", url: "http://a.com" } });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid", reason: "link" });
    expect((await post("{")).status).toBe(400);
    expect((await post({ text: "a" }, { "idempotency-key": "a b" })).status).toBe(400);
    expect((await post({ text: "a" }, { "content-type": "text/plain" })).status).toBe(415);
  });

  it("413 — 본문 상한", async () => {
    const r = await post({ text: "a".repeat(MAX_BODY_BYTES) });
    expect(r.status).toBe(413);
  });

  it("429 + Retry-After — 출처 속도(분당 5)", async () => {
    for (let i = 0; i < 5; i++) expect((await post({ text: String(i) })).status).toBe(202);
    const r = await post({ text: "6" });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("12");
  });

  it("503 — 대기열 쓰기 실패(보내는 쪽 재시도)", async () => {
    q.close();
    const r = await post({ text: "a" });
    expect(r.status).toBe(503);
    q = openQueue(path.join(dir, "hermes.db"));
  });

  it("잘못된 UTF-8 → 400 json(9-1 info)", async () => {
    const r = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: Buffer.concat([Buffer.from('{"text":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid", reason: "json" });
  });

  it("404 · 405", async () => {
    expect((await fetch(`${base}/v2/messages`)).status).toBe(404);
    expect((await fetch(`${base}/v1/messages`)).status).toBe(405);
  });

  it("로그에 본문 · 키를 남기지 않는다(출처 · 상태 · 길이만)", async () => {
    await post({ text: "비밀 주문 내용" });
    const lines = log.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(lines).toContain("source=orders status=202");
    expect(lines).not.toContain("비밀 주문");
    expect(lines).not.toContain(KEY);
  });

  it("닫는 중에는 503", async () => {
    srv.beginShutdown();
    expect((await post({ text: "a" })).status).toBe(503);
  });
});
