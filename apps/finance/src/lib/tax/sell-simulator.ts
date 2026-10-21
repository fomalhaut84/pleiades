/**
 * 매도 전 세금 미리보기 계산
 *
 * 보유 종목 매도 시 예상 양도소득세를 사전에 계산한다.
 * - 해외주식(US): 250만 공제 후 22%
 * - 국내 ETF(KR): 매매차익 15.4%
 */

import {
  FOREIGN_STOCK_DEDUCTION,
  FOREIGN_STOCK_TAX_RATE,
  KR_ETF_TAX_RATE,
} from './capital-gains-tax'

export interface SellSimulationInput {
  /** 시장 */
  market: string
  /** 통화 */
  currency: string
  /** 매도 수량 */
  sellShares: number
  /** 매도 단가 (원본 통화) */
  sellPrice: number
  /** 매도 환율 (USD 종목만) */
  sellFxRate: number | null
  /** 보유 평균단가 (KRW 기준) */
  avgPrice: number
  /** 보유 평균단가 (USD 원본 — USD 종목만) */
  avgPriceFx: number | null
  /** 보유 평균환율 (USD 종목만) */
  avgFxRate: number | null
  /** 올해 이미 실현된 해외주식 손익 (공제 잔여분 계산용) */
  ytdForeignGain: number
}

export interface SellSimulationResult {
  /** 매도 총액 (KRW) */
  proceedsKRW: number
  /** 매입 원가 (KRW) */
  costBasisKRW: number
  /** 실현 손익 (KRW) */
  realizedGainKRW: number
  /** 환율 변동 손익 (USD 종목만) */
  fxGainKRW: number | null
  /** 주가 변동 손익 (USD 종목만) */
  priceGainKRW: number | null
  /** 기본공제 적용 후 과세대상 (해외주식만) */
  taxableAmount: number
  /** 적용 세율 */
  taxRate: number
  /** 예상 세금 */
  estimatedTax: number
  /** 공제 잔여분 (해외주식만) */
  deductionRemaining: number
}

/**
 * 매도 시뮬레이션 계산
 */
export function simulateSellTax(input: SellSimulationInput): SellSimulationResult {
  const {
    market, currency, sellShares, sellPrice, sellFxRate,
    avgPrice, avgPriceFx, avgFxRate, ytdForeignGain,
  } = input

  // USD 종목은 환율 필수
  if (currency === 'USD' && (sellFxRate == null || sellFxRate <= 0)) {
    return {
      proceedsKRW: 0, costBasisKRW: 0, realizedGainKRW: 0,
      fxGainKRW: null, priceGainKRW: null,
      taxableAmount: 0, taxRate: 0, estimatedTax: 0, deductionRemaining: 0,
    }
  }

  // 매도 총액 (KRW)
  const proceedsKRW = currency === 'USD' && sellFxRate != null
    ? Math.round(sellPrice * sellShares * sellFxRate)
    : Math.round(sellPrice * sellShares)

  // 매입 원가 (KRW)
  const costBasisKRW = Math.round(avgPrice * sellShares)

  // 실현 손익
  const realizedGainKRW = proceedsKRW - costBasisKRW

  // USD 종목: 주가분 / 환율분 분리
  let fxGainKRW: number | null = null
  let priceGainKRW: number | null = null

  if (currency === 'USD' && avgPriceFx != null && avgFxRate != null && sellFxRate != null) {
    // 주가 변동분 = (매도가 - 평균단가) × 수량 × 매수환율
    priceGainKRW = Math.round((sellPrice - avgPriceFx) * sellShares * avgFxRate)
    // 환율 변동분 = 평균단가(USD) × 수량 × (매도환율 - 매수환율)
    fxGainKRW = Math.round(avgPriceFx * sellShares * (sellFxRate - avgFxRate))
  }

  // 세금 계산
  let taxableAmount = 0
  let taxRate = 0
  let estimatedTax = 0
  let deductionRemaining = 0

  if (market === 'US') {
    taxRate = FOREIGN_STOCK_TAX_RATE
    // 연간 누적 손익에 이번 매도 합산
    const totalYtdGain = ytdForeignGain + realizedGainKRW
    // 공제 후 과세대상 (기존 + 이번)
    const totalTaxable = Math.max(0, totalYtdGain - FOREIGN_STOCK_DEDUCTION)
    // 이미 과세된 부분 차감 → 이번 매도의 추가 세금
    const existingTaxable = Math.max(0, ytdForeignGain - FOREIGN_STOCK_DEDUCTION)
    taxableAmount = totalTaxable - existingTaxable
    estimatedTax = Math.round(taxableAmount * taxRate)
    deductionRemaining = Math.max(0, FOREIGN_STOCK_DEDUCTION - Math.max(0, totalYtdGain))
  } else if (market === 'KR') {
    taxRate = KR_ETF_TAX_RATE
    taxableAmount = Math.max(0, realizedGainKRW)
    estimatedTax = Math.round(taxableAmount * taxRate)
    deductionRemaining = 0
  }

  return {
    proceedsKRW,
    costBasisKRW,
    realizedGainKRW,
    fxGainKRW,
    priceGainKRW,
    taxableAmount,
    taxRate,
    estimatedTax,
    deductionRemaining,
  }
}
