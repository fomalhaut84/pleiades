// 게시 루프 판정(#807)
import { describe, expect, it } from "vitest";
import { nextPaused, pauseAfter } from "../loop";

describe("nextPaused", () => {
  it("paused 는 그 사유로 · 할 일 없음 · 기다림 · 루프 오류는 이어간다", () => {
    expect(nextPaused({ kind: "paused", why: "webhook" }, null)).toBe("webhook");
    expect(nextPaused({ kind: "idle" }, "webhook")).toBe("webhook");
    expect(nextPaused({ kind: "wait", ms: 10 }, "secrets")).toBe("secrets");
    expect(nextPaused(null, "webhook")).toBe("webhook");
  });

  // 회귀: #807 9-1 major — 웹훅 없음 + 오래된 메시지 여러 건 → 멈춤이 풀렸다 다시 걸려 경고가 건마다 나갔다
  it("나이 만료 dead 는 멈춤을 풀지 않는다 — 웹훅 없음 + 만료 2건 → 전환 1번", () => {
    const seq = [
      { kind: "paused", why: "webhook" },
      { kind: "dead", id: "a", reason: "age" },
      { kind: "dead", id: "b", reason: "age" },
      { kind: "paused", why: "webhook" },
    ] as const;
    let p: ReturnType<typeof nextPaused> = null;
    let transitions = 0;
    for (const r of seq) {
      const n = nextPaused(r, p);
      if (n !== p && n !== null) transitions++;
      p = n;
    }
    expect(transitions).toBe(1);
  });

  it("보낸 결과 · 다른 dead 는 멈춤을 푼다", () => {
    expect(nextPaused({ kind: "sent", id: "a" }, "webhook")).toBeNull();
    expect(nextPaused({ kind: "blocked", id: "a", reason: "pii" }, "webhook")).toBeNull();
    expect(nextPaused({ kind: "dead", id: "a", reason: "discord-400" }, "webhook")).toBeNull();
    expect(nextPaused({ kind: "retry", id: "a", delayMs: 1 }, "webhook")).toBeNull();
  });
});

describe("pauseAfter", () => {
  it("결과별 쉼", () => {
    expect(pauseAfter(null)).toBe(5_000);
    expect(pauseAfter({ kind: "idle" })).toBe(1_000);
    expect(pauseAfter({ kind: "wait", ms: 60_000 })).toBe(5_000);
    expect(pauseAfter({ kind: "retry", id: "a", delayMs: 300 })).toBe(300);
    expect(pauseAfter({ kind: "dead", id: "a", reason: "age" })).toBe(0);
  });
});
