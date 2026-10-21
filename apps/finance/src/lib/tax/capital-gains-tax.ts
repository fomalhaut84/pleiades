/**
 * 양도소득세 계산 유틸리티
 *
 * 해외주식: 연 250만원 기본공제, 초과분 22% (양도소득세 20% + 지방소득세 2%)
 * 국내 해외주식형 ETF: 매매차익 15.4% (배당소득세)
 * 손익통산: 해외주식 간 가능
 */

/** 해외주식 기본공제 (원) */
export const FOREIGN_STOCK_DEDUCTION = 2_500_000

/** 해외주식 양도소득세율 (20% + 지방소득세 2%) */
export const FOREIGN_STOCK_TAX_RATE = 0.22

/** 국내 ETF 배당소득세율 */
export const KR_ETF_TAX_RATE = 0.154

/** 금융소득종합과세 기준선 */
export const FINANCIAL_INCOME_THRESHOLD = 20_000_000

interface TradeRecord {
  id: string
  accountId: string
  ticker: string
  displayName: string
  market: string
  type: string       // "BUY" | "SELL"
  shares: number
  price: number      // 원본 통화 단가
  currency: string   // "USD" | "KRW"
  fxRate: number | null
  totalKRW: number
  tradedAt: Date | string
  createdAt: Date | string
}

export interface RealizedGain {
  tradeId: string
  ticker: string
  displayName: string
  market: string
  currency: string
  shares: number
  sellPrice: number       // 매도 단가 (원본 통화)
  avgCostPrice: number    // 매입 평균단가 (원본 통화)
  sellFxRate: number | null
  avgCostFxRate: number | null
  proceedsKRW: number    // 매도 총액 (원화)
  costBasisKRW: number   // 매입 총액 (원화)
  realizedGainKRW: number // 실현 손익 (원화)
  tradedAt: string
}

export interface CapitalGainsSummary {
  /** 해외주식 실현 손익 합계 */
  foreignStockGain: number
  /** 해외주식 공제 후 과세 대상 */
  foreignStockTaxable: number
  /** 해외주식 예상 세금 */
  foreignStockTax: number
  /** 국내 ETF 실현 이익 합계 */
  krEtfGain: number
  /** 국내 ETF 예상 세금 */
  krEtfTax: number
  /** 총 예상 세금 */
  totalEstimatedTax: number
  /** 개별 매도 거래별 실현 손익 */
  realizedGains: RealizedGain[]
}

/**
 * 이동평균법 기반 실현 손익 계산
 * trades: 해당 연도의 모든 관련 거래 (ticker 무관, tradedAt 오름차순)
 * 전체 거래 히스토리를 순회하여 각 SELL 시점의 avgPrice 추적
 */
export function calcRealizedGains(allTrades: TradeRecord[], year: number): RealizedGain[] {
  // accountId + ticker 단위로 그룹핑 (계좌별 평균단가 분리)
  const byKey = new Map<string, TradeRecord[]>()
  for (const t of allTrades) {
    const key = `${t.accountId}:${t.ticker}`
    const list = byKey.get(key) ?? []
    list.push(t)
    byKey.set(key, list)
  }

  const gains: RealizedGain[] = []

  for (const trades of Array.from(byKey.values())) {
    // tradedAt + createdAt 오름차순 정렬 (같은 날 BUY/SELL 순서 결정적)
    const sorted = [...trades].sort((a, b) => {
      const dateDiff = new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime()
      if (dateDiff !== 0) return dateDiff
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    let shares = 0
    let avgPriceFx = 0  // USD 원본 통화 평균단가
    let avgFxRate = 0   // 가중평균 환율
    let avgPrice = 0    // KRW 평균단가

    for (const trade of sorted) {
      if (trade.type === 'BUY') {
        if (trade.currency === 'USD') {
          const fxRate = trade.fxRate ?? 0
          const newShares = shares + trade.shares
          avgPriceFx = newShares > 0
            ? (shares * avgPriceFx + trade.shares * trade.price) / newShares
            : 0
          avgFxRate = newShares > 0
            ? (shares * avgFxRate + trade.shares * fxRate) / newShares
            : 0
          avgPrice = Math.round(avgPriceFx * avgFxRate)
          shares = newShares
        } else {
          const newShares = shares + trade.shares
          avgPrice = newShares > 0
            ? Math.round((shares * avgPrice + trade.shares * trade.price) / newShares)
            : 0
          shares = newShares
        }
      } else if (trade.type === 'SELL') {
        const tradedAt = new Date(trade.tradedAt)
        const tradeYear = tradedAt.getUTCFullYear()

        // 매도 시점의 손익 계산
        const proceedsKRW = trade.totalKRW
        const costBasisKRW = avgPrice * trade.shares

        // 해당 연도 매도만 결과에 포함
        if (tradeYear === year) {
          gains.push({
            tradeId: trade.id,
            ticker: trade.ticker,
            displayName: trade.displayName,
            market: trade.market,
            currency: trade.currency,
            shares: trade.shares,
            sellPrice: trade.price,
            avgCostPrice: trade.currency === 'USD' ? avgPriceFx : avgPrice,
            sellFxRate: trade.fxRate,
            avgCostFxRate: trade.currency === 'USD' ? avgFxRate : null,
            proceedsKRW,
            costBasisKRW,
            realizedGainKRW: proceedsKRW - costBasisKRW,
            tradedAt: tradedAt.toISOString(),
          })
        }

        // 수량 차감 (avgPrice 불변 — 이동평균법)
        shares -= trade.shares
      }
    }
  }

  // 매도일 기준 정렬
  gains.sort((a, b) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime())

  return gains
}

/**
 * 연간 양도소득세 요약 계산
 */
export function calcCapitalGainsSummary(realizedGains: RealizedGain[]): CapitalGainsSummary {
  // 해외주식 (US market): 손익통산 가능
  const foreignGains = realizedGains.filter((g) => g.market === 'US')
  const foreignStockGain = foreignGains.reduce((s, g) => s + g.realizedGainKRW, 0)
  const foreignStockTaxable = Math.max(0, foreignStockGain - FOREIGN_STOCK_DEDUCTION)
  const foreignStockTax = Math.round(foreignStockTaxable * FOREIGN_STOCK_TAX_RATE)

  // 국내 해외주식형 ETF (KR market): 이익에만 과세
  // 현재 KR 종목은 모두 해외주식형 ETF (SOL 다우존스, SOL 미국채혼합 등)
  // TODO: KR 일반주식 추가 시 ETF 여부 구분 필드 필요
  const krEtfGains = realizedGains.filter((g) => g.market === 'KR')
  const krEtfGain = Math.max(0, krEtfGains.reduce((s, g) => s + g.realizedGainKRW, 0))
  const krEtfTax = Math.round(krEtfGain * KR_ETF_TAX_RATE)

  return {
    foreignStockGain,
    foreignStockTaxable,
    foreignStockTax,
    krEtfGain,
    krEtfTax,
    totalEstimatedTax: foreignStockTax + krEtfTax,
    realizedGains,
  }
}
