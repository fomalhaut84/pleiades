// 014 §3-C 동작 규칙 · §3-F — 게시 루프 한 걸음(H-1b · #794). 실제 대기열 · 가짜 fetch
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPoster, MAX_ATTEMPTS, MAX_AGE_MS, type PosterDeps } from "../poster";
import { openQueue, type Queue } from "../queue";
import type { Source } from "../registry";

const HOOK = "https://discord.com/api/" + "webhooks/1/" + "abcdefABCDEF12345678";
const SRC: Source = {
  id: "orders",
  name: "주문",
  keySha256: "0".repeat(64),
  enabled: true,
  expires: null,
  linkHosts: [],
  ratePerMinute: 30,
};

type Call = { url: string; body: Record<string, unknown> };

describe("createPoster.step", () => {
  let dir: string;
  let q: Queue;
  let now: number;
  let calls: Call[];
  let reply: () => Response | Promise<Response>;
  let deps: PosterDeps;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-post-"));
    q = openQueue(path.join(dir, "hermes.db"));
    now = 1_000_000;
    calls = [];
    reply = () => new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    deps = {
      queue: q,
      sourceOf: (id) => (id === "orders" ? SRC : null),
      webhook: () => HOOK,
      secrets: () => ({ ok: true, values: [] }),
      now: () => now,
      fetch: (async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return reply();
      }) as typeof fetch,
    };
  });
  afterEach(() => {
    q.close();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("보낼 것이 없으면 idle", async () => {
    expect(await createPoster(deps).step()).toEqual({ kind: "idle" });
  });

  it("보내고 sent — wait=true · 멘션 차단 · username · 본문", async () => {
    const { id } = q.enqueue({ source: "orders", text: "주문 #1", title: "새 주문", level: "info" }, now);
    expect(await createPoster(deps).step()).toEqual({ kind: "sent", id });
    expect(calls).toEqual([
      {
        url: `${HOOK}?wait=true`,
        body: { content: "**새 주문**\n주문 #1", username: "hermes·주문", allowed_mentions: { parse: [] }, flags: 4 },
      },
    ]);
    expect(q.counts()).toMatchObject({ queued: 0, sent: 1 });
  });

  it("검사에 걸리면 원문 대신 고정 문구를 보내고 blocked", async () => {
    const { id } = q.enqueue({ source: "orders", text: "연락처 010-1234-5678", level: "info" }, now);
    expect(await createPoster(deps).step()).toEqual({ kind: "blocked", id, reason: "pii" });
    expect(calls[0].body.content).toBe("[hermes] 게시 차단 · orders · 사유 pii");
    expect(JSON.stringify(calls)).not.toContain("010-1234");
    expect(q.counts()).toMatchObject({ blocked: 1 });
  });

  it("비밀 대조 재료와 같은 값 → secret-match", async () => {
    deps = { ...deps, secrets: () => ({ ok: true, values: ["topsecret-123"] }) };
    q.enqueue({ source: "orders", text: "값 topsecret-123", level: "info" }, now);
    expect(await createPoster(deps).step()).toMatchObject({ kind: "blocked", reason: "secret-match" });
  });

  it("웹훅 없음 · 형식 오류 → paused(보내지 않는다 · 행은 그대로)", async () => {
    q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    expect(await createPoster({ ...deps, webhook: () => undefined }).step()).toEqual({ kind: "paused", why: "webhook" });
    expect(await createPoster({ ...deps, webhook: () => "http://x" }).step()).toEqual({ kind: "paused", why: "webhook" });
    expect(calls).toEqual([]);
    expect(q.counts().queued).toBe(1);
  });

  it("비밀 재료를 못 읽으면 paused(fail-closed · 원문을 검사 없이 보내지 않는다)", async () => {
    q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    expect(await createPoster({ ...deps, secrets: () => ({ ok: false, values: [] }) }).step()).toEqual({
      kind: "paused",
      why: "secrets",
    });
    expect(calls).toEqual([]);
  });

  it("Discord 429 → retry_after 뒤 재시도(시도 수 증가)", async () => {
    const { id } = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    reply = () => new Response(JSON.stringify({ retry_after: 2.5, global: false }), { status: 429 });
    expect(await createPoster(deps).step()).toEqual({ kind: "retry", id, delayMs: 2500 });
    expect(q.nextDue(now + 2499)).toBeNull();
    expect(q.nextDue(now + 2500)).toMatchObject({ id, attempts: 1 });
  });

  it("5xx · 연결 실패 → 지수 백오프(5 s · 10 s … 상한 10 분)", async () => {
    const { id } = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    reply = () => new Response("", { status: 502 });
    const p = createPoster(deps);
    expect(await p.step()).toEqual({ kind: "retry", id, delayMs: 5_000 });
    now += 5_000;
    reply = () => Promise.reject(new TypeError("fetch failed"));
    expect(await p.step()).toEqual({ kind: "retry", id, delayMs: 10_000 });
  });

  // 회귀: #794 9-1 major — 실패한 행 뒤의 행이 앞지르면 받은 순서 · 429 가 깨진다
  it("실패 뒤에는 그 시각까지 아무것도 보내지 않고 같은 행부터 다시", async () => {
    const a = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    const b = q.enqueue({ source: "orders", text: "b", level: "info" }, now);
    reply = () => new Response(JSON.stringify({ retry_after: 3 }), { status: 429 });
    const p = createPoster(deps);
    expect(await p.step()).toMatchObject({ kind: "retry", id: a.id });
    now += 1_000;
    expect(await p.step()).toEqual({ kind: "wait", ms: 2_000 });
    expect(calls.length).toBe(1);
    now += 2_000;
    reply = () => new Response("{}", { status: 200 });
    expect(await p.step()).toEqual({ kind: "sent", id: a.id });
    expect(await p.step()).toEqual({ kind: "sent", id: b.id });
  });

  // 회귀: #795 Codex P2 — 대기 시각은 디스크(맨 앞 행 next_at)에서 온다. 재기동한 poster 도 뒤 행을 먼저 보내지 않는다
  it("재기동 뒤에도 맨 앞 행의 대기 시각 전에는 뒤 행을 보내지 않는다", async () => {
    const a = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    q.enqueue({ source: "orders", text: "b", level: "info" }, now);
    reply = () => new Response(JSON.stringify({ retry_after: 60 }), { status: 429 });
    expect(await createPoster(deps).step()).toMatchObject({ kind: "retry", id: a.id });
    now += 1_000;
    reply = () => new Response("{}", { status: 200 });
    expect(await createPoster(deps).step()).toEqual({ kind: "wait", ms: 59_000 });
    expect(calls.length).toBe(1);
  });

  // 회귀: #794 9-1 major — 웹훅이 지워져도 메시지가 죽지 않는다
  it.each([401, 403, 404])("웹훅 %i → paused(시도 수 그대로 · 행 보존 · 1분 뒤 다시)", async (status) => {
    const { id } = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    reply = () => new Response("{}", { status });
    const p = createPoster(deps);
    expect(await p.step()).toEqual({ kind: "paused", why: "webhook" });
    expect(q.nextDue(now)).toMatchObject({ id, attempts: 0 });
    now += 59_999;
    expect((await p.step()).kind).toBe("wait");
    now += 1;
    reply = () => new Response("{}", { status: 200 });
    expect(await p.step()).toEqual({ kind: "sent", id });
  });

  // 회귀: #794 9-1 major — 형식이 바꾸거나 자른 값도 원문으로 잡는다
  it("원문 칸 검사 — 링크 주소 속 비밀 값 · 2000자 뒤에 잘려 나갈 토큰", async () => {
    const secret = "secret_value_with_underscore";
    const p = createPoster({ ...deps, sourceOf: () => ({ ...SRC, linkHosts: ["a.example"] }), secrets: () => ({ ok: true, values: [secret] }) });
    q.enqueue({ source: "orders", text: "a", level: "info", link: { label: "x", url: `https://a.example/${secret}` } }, now);
    expect(await p.step()).toMatchObject({ kind: "blocked", reason: "secret-match" });
    q.enqueue({ source: "orders", text: "가".repeat(1990) + " " + "gK7".repeat(14) + "a", level: "info" }, now);
    expect(await p.step()).toMatchObject({ kind: "blocked", reason: "token" });
  });

  it("Discord 400 → 바로 dead(같은 본문은 다시 보내도 같다)", async () => {
    const { id } = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    reply = () => new Response("{}", { status: 400 });
    expect(await createPoster(deps).step()).toEqual({ kind: "dead", id, reason: "discord-400" });
  });

  it("시도 한도 · 경과 24 h → dead", async () => {
    const a = q.enqueue({ source: "orders", text: "a", level: "info" }, now);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) q.markRetry(a.id, now);
    reply = () => new Response("", { status: 503 });
    expect(await createPoster(deps).step()).toEqual({ kind: "dead", id: a.id, reason: "attempts" });

    const b = q.enqueue({ source: "orders", text: "b", level: "info" }, now);
    now += MAX_AGE_MS;
    expect(await createPoster(deps).step()).toEqual({ kind: "dead", id: b.id, reason: "age" });
    expect(calls.length).toBe(1); // 24 h 넘은 것은 보내 보지도 않는다
  });

  it("레지스트리에서 빠진 출처 — 링크는 빼고 id 이름으로 보낸다", async () => {
    q.enqueue({ source: "gone", text: "a", level: "info", link: { label: "x", url: "https://a.example/" } }, now);
    await createPoster(deps).step();
    expect(calls[0].body).toMatchObject({ content: "a", username: "hermes·gone" });
  });

  it("로그에 본문 · 웹훅 주소를 남기지 않는다", async () => {
    const log = vi.spyOn(console, "log");
    q.enqueue({ source: "orders", text: "비밀 주문 본문", level: "info" }, now);
    reply = () => new Response("", { status: 502 });
    await createPoster(deps).step();
    const all = [...log.mock.calls, ...(console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls]
      .map((c) => c.join(" "))
      .join("\n");
    expect(all).not.toContain("비밀 주문");
    expect(all).not.toContain("abcdefABCDEF");
  });
});

describe("lastLinkDropped", () => {
  it("허용 밖 링크를 빼고 보낸 직후만 참", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hermes-post2-"));
    const q = openQueue(path.join(dir, "hermes.db"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const p = createPoster({
      queue: q,
      sourceOf: () => SRC,
      webhook: () => HOOK,
      secrets: () => ({ ok: true, values: [] }),
      now: () => 1,
      fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    });
    q.enqueue({ source: "orders", text: "a", level: "info", link: { label: "x", url: "https://evil.example/" } }, 1);
    q.enqueue({ source: "orders", text: "b", level: "info" }, 1);
    await p.step();
    expect(p.lastLinkDropped()).toBe(true);
    await p.step();
    expect(p.lastLinkDropped()).toBe(false);
    q.close();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });
});
