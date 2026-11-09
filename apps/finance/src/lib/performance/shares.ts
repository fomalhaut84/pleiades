/**
 * 수량 변동 판정 (pleiades#262 B → 010 A1 의 스냅샷 차분 흐름 · `flows.ts`).
 *
 * prisma 를 부르지 않는다 — 순수 함수.
 * 부동소수 합산 오차(같은 티커 여러 줄 합산)는 변동으로 보지 않는다.
 * (#546 의 "수량 변동" 표시·포맷은 #554 에서 현금흐름 보정값으로 대체돼 지웠다 · 010 Q2)
 */

export const SHARES_DIGITS = 6
export const SHARES_EPSILON = 10 ** -SHARES_DIGITS

export function sharesDiffer(start: number, end: number): boolean {
  return Math.abs(end - start) > SHARES_EPSILON
}
