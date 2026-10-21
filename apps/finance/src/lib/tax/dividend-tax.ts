/**
 * 배당소득세 추적 유틸리티
 *
 * - 미국주 배당: 원천징수 15% (Dividend.taxAmount에 기록됨)
 * - 국내 ETF 배당: 배당소득세 15.4% (Dividend.taxAmount에 기록됨)
 * - 금융소득종합과세: 연간 금융소득 2,000만원 초과 시 종합과세 대상
 */

/** 금융소득종합과세 기준선 */
export const FINANCIAL_INCOME_THRESHOLD = 20_000_000

interface DividendRecord {
  ticker: string
  displayName: string
  currency: string
  amountGross: number
  amountNet: number
  taxAmount: number | null
  fxRate: number | null
  amountKRW: number
}

export interface DividendTaxByTicker {
  ticker: string
  displayName: string
  currency: string
  /** 세전 배당 합계 (원본 통화) */
  totalGross: number
  /** 세후 배당 합계 (원본 통화) */
  totalNet: number
  /** 원천징수 합계 (원본 통화) */
  totalTax: number
  /** 세후 배당 합계 (KRW) */
  totalNetKRW: number
  /** 건수 */
  count: number
}

export interface DividendTaxSummary {
  /** 세전 배당 합계 (KRW 환산) */
  totalGrossKRW: number
  /** 세후 배당 합계 (KRW) */
  totalNetKRW: number
  /** 원천징수 합계 (KRW 환산) */
  totalTaxKRW: number
  /** 금융소득종합과세 기준선 */
  threshold: number
  /** 기준선 대비 사용률 (0~1+) */
  usageRate: number
  /** 기준선 잔여 */
  remaining: number
  /** 기준선 초과 여부 */
  exceeded: boolean
  /** 종목별 합산 */
  byTicker: DividendTaxByTicker[]
  /** 총 배당 건수 */
  totalCount: number
}

/**
 * 연간 배당소득세 요약 계산
 */
export function calcDividendTaxSummary(dividends: DividendRecord[]): DividendTaxSummary {
  // 종목별 집계
  const tickerMap = new Map<string, DividendTaxByTicker>()

  let totalGrossKRW = 0
  let totalNetKRW = 0
  let totalTaxKRW = 0

  for (const d of dividends) {
    const tax = d.taxAmount ?? 0
    // amountKRW는 서버에서 정확히 계산된 세후 원화 금액
    // grossKRW: amountNet > 0이면 비율 역산, 아니면 amountKRW 사용
    const grossKRW = d.amountNet > 0
      ? Math.round(d.amountKRW * (d.amountGross / d.amountNet))
      : d.amountKRW
    const taxKRW = grossKRW - d.amountKRW

    totalGrossKRW += grossKRW
    totalNetKRW += d.amountKRW
    totalTaxKRW += taxKRW

    const key = `${d.ticker}:${d.currency}`
    const existing = tickerMap.get(key)
    if (existing) {
      tickerMap.set(key, {
        ...existing,
        totalGross: existing.totalGross + d.amountGross,
        totalNet: existing.totalNet + d.amountNet,
        totalTax: existing.totalTax + tax,
        totalNetKRW: existing.totalNetKRW + d.amountKRW,
        count: existing.count + 1,
      })
    } else {
      tickerMap.set(key, {
        ticker: d.ticker,
        displayName: d.displayName,
        currency: d.currency,
        totalGross: d.amountGross,
        totalNet: d.amountNet,
        totalTax: tax,
        totalNetKRW: d.amountKRW,
        count: 1,
      })
    }
  }

  const byTicker = Array.from(tickerMap.values())
    .sort((a, b) => b.totalNetKRW - a.totalNetKRW)

  const usageRate = FINANCIAL_INCOME_THRESHOLD > 0
    ? totalGrossKRW / FINANCIAL_INCOME_THRESHOLD
    : 0

  return {
    totalGrossKRW,
    totalNetKRW,
    totalTaxKRW,
    threshold: FINANCIAL_INCOME_THRESHOLD,
    usageRate,
    remaining: Math.max(0, FINANCIAL_INCOME_THRESHOLD - totalGrossKRW),
    exceeded: totalGrossKRW > FINANCIAL_INCOME_THRESHOLD,
    byTicker,
    totalCount: dividends.length,
  }
}
