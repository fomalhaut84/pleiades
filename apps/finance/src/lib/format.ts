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
 * PriceCache 배열에서 가장 최근 updatedAt을 반환
 */
export function getLastUpdatedAt(prices: { updatedAt: Date }[]): Date | null {
  if (prices.length === 0) return null
  return prices.reduce(
    (latest, p) => (p.updatedAt > latest ? p.updatedAt : latest),
    prices[0].updatedAt
  )
}

/**
 * 수익률 포맷: 8.5 → "+8.5%", -12.0 → "-12.0%"
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * 부호 포함 원화 포맷: 1234567 → "+1,234,567원", -500000 → "-500,000원"
 */
export function formatSignedKRW(amount: number): string {
  const sign = amount >= 0 ? '+' : ''
  return `${sign}${Math.round(amount).toLocaleString('ko-KR')}원`
}

/**
 * Holding의 매입금(KRW)을 계산
 * avgPrice는 모든 종목에서 원화 기준 평균단가 (USD 종목은 avgPriceFx × avgFxRate로 저장됨)
 */
export function calcCostKRW(holding: {
  avgPrice: number
  shares: number
}): number {
  return Math.round(holding.avgPrice * holding.shares)
}

/**
 * Holding의 현재 평가금(KRW)을 계산
 * USD 종목: currentPrice × shares × currentFxRate
 * KRW 종목: currentPrice × shares
 */
export function calcCurrentValueKRW(
  holding: { shares: number; currency: string },
  currentPrice: number,
  currentFxRate: number
): number {
  if (holding.currency === 'USD') {
    return Math.round(currentPrice * holding.shares * currentFxRate)
  }
  return Math.round(currentPrice * holding.shares)
}

interface ProfitLoss {
  totalPL: number      // 총 손익 (KRW)
  pricePL: number      // 주가 변동분 (KRW)
  fxPL: number         // 환율 변동분 (KRW, USD 종목만)
  returnPct: number    // 수익률 (%)
}

/**
 * Holding의 손익 계산
 * USD 종목: avgPriceFx(USD 매입단가)를 사용하여 주가분/환율분 분리
 * KRW 종목: 주가분만 (fxPL = 0)
 */
export function calcProfitLoss(
  holding: {
    avgPrice: number
    shares: number
    currency: string
    avgPriceFx?: number | null
    avgFxRate?: number | null
  },
  currentPrice: number,
  currentFxRate: number
): ProfitLoss {
  const costKRW = calcCostKRW(holding)
  const currentValueKRW = calcCurrentValueKRW(holding, currentPrice, currentFxRate)
  const totalPL = currentValueKRW - costKRW
  const returnPct = costKRW > 0 ? (totalPL / costKRW) * 100 : 0

  if (holding.currency === 'USD') {
    const avgFxRate = holding.avgFxRate ?? DEFAULT_FX_RATE_USD_KRW
    // avgPriceFx가 없으면 avgPrice(KRW)를 avgFxRate로 역산
    const avgPriceUSD = holding.avgPriceFx ?? (avgFxRate > 0 ? holding.avgPrice / avgFxRate : 0)
    // 주가 변동분: (현재가USD - 매입가USD) × 매수환율 × 수량
    const pricePL = Math.round((currentPrice - avgPriceUSD) * avgFxRate * holding.shares)
    // 환율 변동분: 총손익 - 주가분
    const fxPL = totalPL - pricePL
    return { totalPL, pricePL, fxPL, returnPct }
  }

  return { totalPL, pricePL: totalPL, fxPL: 0, returnPct }
}
