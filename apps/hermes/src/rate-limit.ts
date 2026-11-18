/**
 * 출처별 속도 제한 — 토큰 버킷(분당 N · 최대 N 개 쌓임 · H-1a #791). 넘으면 `429` + `Retry-After`(초 · 올림).
 * 메모리에만 둔다 — 재시작하면 가득 찬 상태로 돌아온다(받기 쪽 보호라 그걸로 충분하다).
 */
export type TakeResult = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  take(source: string, perMinute: number, now: number): TakeResult;
}

const MINUTE_MS = 60_000;

export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    take(source, perMinute, now) {
      const prev = buckets.get(source) ?? { tokens: perMinute, at: now };
      const refilled = Math.min(perMinute, prev.tokens + ((now - prev.at) * perMinute) / MINUTE_MS);
      if (refilled >= 1) {
        buckets.set(source, { tokens: refilled - 1, at: now });
        return { ok: true };
      }
      // 거절은 버킷을 건드리지 않는다 — 소수 누적 오차로 경계가 밀리지 않게
      buckets.set(source, prev);
      const waitMs = ((1 - refilled) * MINUTE_MS) / perMinute;
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) };
    },
  };
}
