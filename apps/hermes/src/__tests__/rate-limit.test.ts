// 014 §2 429 — 출처별 속도 제한(H-1a · #791)
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../rate-limit";

describe("createRateLimiter", () => {
  it("분당 N건까지 받고 그다음은 Retry-After(초 · 올림)", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) expect(rl.take("a", 3, 0)).toEqual({ ok: true });
    expect(rl.take("a", 3, 0)).toEqual({ ok: false, retryAfterSec: 20 });
  });

  it("시간이 지나면 다시 찬다 · 출처끼리 따로", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) rl.take("a", 3, 0);
    expect(rl.take("b", 3, 0).ok).toBe(true);
    expect(rl.take("a", 3, 19_999).ok).toBe(false);
    expect(rl.take("a", 3, 20_000).ok).toBe(true);
  });

  it("시계가 뒤로 가도 잠기지 않는다(9-1 info)", () => {
    const rl = createRateLimiter();
    rl.take("a", 3, 100_000);
    const r = rl.take("a", 3, 0);
    expect(r.ok).toBe(true);
  });

  it("한도를 넘게 쌓지 않는다", () => {
    const rl = createRateLimiter();
    rl.take("a", 2, 0);
    let n = 0;
    while (rl.take("a", 2, 3_600_000).ok) n++;
    expect(n).toBe(2);
  });
});
