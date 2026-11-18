// 014 §3-G — 상태 파일(수치만 · 수집기가 읽는다 · H-1b #794)
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openQueue, type Queue } from "../queue";
import { buildState, writeState } from "../state";

// 2026-11-18 12:00 KST
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
const KST_MIDNIGHT = Date.UTC(2026, 10, 17, 15, 0, 0);

describe("상태 파일", () => {
  let dir: string;
  let q: Queue;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-state-"));
    q = openQueue(path.join(dir, "hermes.db"));
  });
  afterEach(() => {
    q.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("오늘(KST) dead · blocked · 누적 dead · 마지막 성공 · 웹훅 · 레지스트리", () => {
    const ids = [0, 1, 2, 3, 4].map((i) => q.enqueue({ source: "o", text: String(i), level: "info" }, 0).id);
    q.markDead(ids[0], "age", KST_MIDNIGHT - 1); // 어제
    q.markDead(ids[1], "attempts", KST_MIDNIGHT);
    q.markBlocked(ids[2], "pii", NOW - 10);
    q.markSent(ids[3], NOW - 5);
    const st = buildState(q, NOW, {
      webhook: true,
      paused: null,
      registry: { sources: 2, error: false, expiringSoon: ["o"] },
      linkDroppedToday: 1,
    });
    expect(st).toEqual({
      updatedAt: new Date(NOW).toISOString(),
      queued: 1,
      oldestQueuedAt: new Date(0).toISOString(),
      dead: 2,
      deadToday: 1,
      blockedToday: 1,
      linkDroppedToday: 1,
      lastSentAt: new Date(NOW - 5).toISOString(),
      webhook: true,
      paused: null,
      registrySources: 2,
      registryError: false,
      expiringSoon: ["o"],
    });
  });

  it("원자적 쓰기 · 0600 · 임시 파일을 남기지 않는다 · 본문 없음", () => {
    q.enqueue({ source: "o", text: "본문 비밀", level: "info" }, 0);
    const file = path.join(dir, "state.json");
    writeState(file, buildState(q, NOW, { webhook: false, paused: "webhook", registry: { sources: 0, error: false, expiringSoon: [] }, linkDroppedToday: 0 }));
    const text = readFileSync(file, "utf8");
    expect(JSON.parse(text)).toMatchObject({ queued: 1, webhook: false, paused: "webhook", lastSentAt: null });
    expect(text).not.toContain("본문 비밀");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir).filter((n) => n.startsWith("state.json."))).toEqual([]);
  });
});
