import { isIndexTicker } from './price-fetcher-utils'

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

/**
 * 지수 포인트 포맷: 6717.28 → "6,717.28" (#499)
 * 지수는 통화가 아니므로 기호/`원` 을 붙이지 않는다.
 */
export function formatIndexPoint(value: number): string {
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * 시세 값 표기 규칙 (#499 → #500 공용화).
 *
 * 지수 티커 (`^KS11`, `^GSPC`) 는 통화 단위가 아니라 포인트이므로 통화 기호/`원` 을
 * 붙이지 않는다. 이 분기를 MCP·봇이 각자 구현하면 한쪽만 고쳐져 표기가 갈리므로
 * (실제로 #499 가 MCP 만 고쳐 `/주가 ^KS11` 이 `₩6,717` 로 남았다) 규칙은 여기 하나만 둔다.
 *
 * 통화 표기 스타일은 호출자마다 다르다 (MCP `1,234원` · 봇 `₩1,234`). 통일하면 봇 UI 가
 * 통째로 바뀌므로 통화 포맷터를 주입받는다.
 */
export function formatQuoteValue(
  ticker: string,
  value: number,
  formatCurrencyValue: (value: number) => string,
): string {
  return isIndexTicker(ticker) ? formatIndexPoint(value) : formatCurrencyValue(value)
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
 * 날짜 포맷: "2024.03.15" (UTC 기준 — DB 날짜는 date-only로 저장되므로 UTC 사용)
 */
export function formatDate(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
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
