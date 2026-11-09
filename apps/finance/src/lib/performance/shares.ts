/**
 * 기여도의 수량 변동 판정·표시 (pleiades#262 B).
 *
 * prisma 를 부르지 않는다 — 웹 클라이언트 컴포넌트도 이 파일을 import 한다.
 * 판정 임계값과 표시 자릿수를 같은 단위로 묶는다: 차이가 SHARES_EPSILON(=10^-SHARES_DIGITS)보다 크면
 * 반올림한 두 값도 반드시 다르다 — "1→1주" 같은 모순된 표시가 나오지 않는다(9-1 info).
 */

export const SHARES_DIGITS = 6
export const SHARES_EPSILON = 10 ** -SHARES_DIGITS

/** 부동소수 합산 오차는 변동으로 보지 않는다 */
export function sharesDiffer(start: number, end: number): boolean {
  return Math.abs(end - start) > SHARES_EPSILON
}

/** 정수면 소수점 없이 · 소수 주(해외)는 SHARES_DIGITS 자리까지 */
export function formatShares(shares: number): string {
  return String(Number(shares.toFixed(SHARES_DIGITS)))
}

/** MCP 텍스트(AI 입력)와 웹 각주가 함께 쓰는 원인 설명 — 매수·매도로 단정하지 않는다(vest·이체·분할도 수량을 바꾼다) */
export const SHARES_CHANGED_CAUSE = '매수·매도·vest·이체·분할 등'
