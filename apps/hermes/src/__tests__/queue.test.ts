// 014 §3-C C3 — SQLite outbox 대기열(H-1a · #791)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openQueue, type Queue } from "../queue";

const DAY = 24 * 60 * 60 * 1000;
const msg = (over: Partial<Parameters<Queue["enqueue"]>[0]> = {}) => ({
  source: "orders",
  text: "주문 #1",
  level: "info" as const,
  ...over,
});

describe("openQueue", () => {
  let dir: string;
  let q: Queue;
  const file = () => path.join(dir, "hermes.db");

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-q-"));
    q = openQueue(file());
  });
  afterEach(() => {
    q.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("넣은 순서대로 꺼낸다 · 꺼내도 상태는 queued", () => {
    const a = q.enqueue(msg({ text: "a" }), 1000);
    const b = q.enqueue(msg({ text: "b" }), 1000);
    expect(a.duplicate).toBe(false);
    expect(q.nextDue(2000)?.id).toBe(a.id);
    expect(q.nextDue(2000)?.id).toBe(a.id);
    q.markSent(a.id, 2000);
    expect(q.nextDue(2000)?.id).toBe(b.id);
    expect(q.counts()).toEqual({ queued: 1, sent: 1, dead: 0, blocked: 0 });
  });

  it("필드를 그대로 돌려준다", () => {
    const { id } = q.enqueue(
      msg({ title: "새 주문", link: { label: "보기", url: "https://a.example/x" }, level: "warn", idempotencyKey: "k1" }),
      5,
    );
    expect(q.nextDue(5)).toEqual({
      id,
      source: "orders",
      idempotencyKey: "k1",
      title: "새 주문",
      text: "주문 #1",
      link: { label: "보기", url: "https://a.example/x" },
      level: "warn",
      attempts: 0,
      receivedAt: 5,
    });
  });

  it("같은 출처 · 같은 Idempotency-Key 는 7일 안 중복 — 같은 id", () => {
    const a = q.enqueue(msg({ idempotencyKey: "k" }), 0);
    const b = q.enqueue(msg({ idempotencyKey: "k", text: "다른 글" }), 7 * DAY - 1);
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(q.counts().queued).toBe(1);
  });

  it("다른 출처의 같은 키는 중복이 아니다 · 키 없음은 늘 새 행", () => {
    q.enqueue(msg({ idempotencyKey: "k" }), 0);
    expect(q.enqueue(msg({ source: "weather", idempotencyKey: "k" }), 0).duplicate).toBe(false);
    q.enqueue(msg(), 0);
    expect(q.enqueue(msg(), 0).duplicate).toBe(false);
    expect(q.counts().queued).toBe(4);
  });

  it("7일이 지난 같은 키는 새 메시지 — 옛 행의 키를 비운다", () => {
    const a = q.enqueue(msg({ idempotencyKey: "k" }), 0);
    q.markSent(a.id, 1);
    const b = q.enqueue(msg({ idempotencyKey: "k" }), 7 * DAY);
    expect(b.duplicate).toBe(false);
    expect(b.id).not.toBe(a.id);
  });

  it("markRetry — 시도 수가 늘고 다음 시각 전에는 꺼내지 않는다", () => {
    const { id } = q.enqueue(msg(), 0);
    q.markRetry(id, 5000);
    expect(q.nextDue(4999)).toBeNull();
    expect(q.nextDue(5000)).toMatchObject({ id, attempts: 1 });
  });

  it("dead · blocked 는 다시 꺼내지 않고 수치에 든다", () => {
    const a = q.enqueue(msg(), 0);
    const b = q.enqueue(msg(), 0);
    q.markDead(a.id, "attempts", 10);
    q.markBlocked(b.id, "token", 10);
    expect(q.nextDue(100)).toBeNull();
    expect(q.counts()).toEqual({ queued: 0, sent: 0, dead: 1, blocked: 1 });
  });

  it("purge — 끝난 행만 보존 기간(30일) 뒤 지운다 · queued 는 남는다", () => {
    const a = q.enqueue(msg(), 0);
    q.enqueue(msg(), 0);
    q.markSent(a.id, 0);
    expect(q.purge(30 * DAY - 1)).toBe(0);
    expect(q.purge(30 * DAY)).toBe(1);
    expect(q.counts()).toEqual({ queued: 1, sent: 0, dead: 0, blocked: 0 });
  });

  it("다시 열어도 남아 있다(디스크)", () => {
    const { id } = q.enqueue(msg({ idempotencyKey: "k" }), 0);
    q.close();
    q = openQueue(file());
    expect(q.nextDue(0)?.id).toBe(id);
    expect(q.enqueue(msg({ idempotencyKey: "k" }), 1).duplicate).toBe(true);
  });

  it("WAL 모드로 연다", () => {
    expect(q.journalMode()).toBe("wal");
  });
});
