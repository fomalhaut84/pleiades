/**
 * 원화 금액 포맷: 1234567 → "1,234,567원"
 */
export function formatKRW(amount: number): string {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`
}

/**
 * 달러 금액 포맷: 123.456 → "$123.46"
 */
export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/** 기본 환율 (USD→KRW). avgFxRate가 없는 경우 폴백용. */
export const DEFAULT_FX_RATE_USD_KRW = 1450

/**
 * Holding의 매입금(KRW)을 계산
 * USD 종목: avgPrice × shares × avgFxRate
 * KRW 종목: avgPrice × shares
 */
export function calcCostKRW(holding: {
  avgPrice: number
  shares: number
  currency: string
  avgFxRate?: number | null
}): number {
  if (holding.currency === 'USD') {
    return Math.round(holding.avgPrice * holding.shares * (holding.avgFxRate ?? DEFAULT_FX_RATE_USD_KRW))
  }
  return Math.round(holding.avgPrice * holding.shares)
}
