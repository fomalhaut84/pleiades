/**
 * 근로소득세 계산 유틸리티
 *
 * RSU 베스팅 시 근로소득 = 베스팅일 종가 × 수량
 * 회사에서 원천징수 (소득세율 적용)
 * 베스팅 직후 매도 시: 취득가 ≈ 매도가 → 양도차익 ≈ 0
 */

/** 근로소득세 누진세율 구간 (2024~2026년 동일) */
const INCOME_TAX_BRACKETS = [
  { limit: 14_000_000, rate: 0.06 },     // 1,400만 이하 6%
  { limit: 50_000_000, rate: 0.15 },     // 5,000만 이하 15%
  { limit: 88_000_000, rate: 0.24 },     // 8,800만 이하 24%
  { limit: 150_000_000, rate: 0.35 },    // 1.5억 이하 35%
  { limit: 300_000_000, rate: 0.38 },    // 3억 이하 38%
  { limit: 500_000_000, rate: 0.40 },    // 5억 이하 40%
  { limit: 1_000_000_000, rate: 0.42 },  // 10억 이하 42%
  { limit: Infinity, rate: 0.45 },        // 10억 초과 45%
] as const

/** 지방소득세율 (소득세의 10%) */
const LOCAL_TAX_RATE = 0.10

export interface RSUTaxEstimate {
  /** RSU ID */
  scheduleId: string
  /** 베스팅일 */
  vestingDate: string
  /** 수량 */
  shares: number
  /** 베스팅 가격 (1주당) */
  vestPrice: number | null
  /** 근로소득 (vestPrice × shares) */
  grossIncome: number
  /** 예상 소득세 (누진세율) */
  incomeTax: number
  /** 예상 지방소득세 */
  localTax: number
  /** 총 예상 세금 */
  totalTax: number
  /** 실효세율 */
  effectiveRate: number
  /** 상태 */
  status: string
}

export interface RSUTaxSummary {
  /** 개별 RSU 세금 추정 */
  estimates: RSUTaxEstimate[]
  /** 총 근로소득 */
  totalGrossIncome: number
  /** 총 예상 세금 */
  totalTax: number
}

interface RSUScheduleInput {
  id: string
  vestingDate: Date | string
  shares: number
  vestPrice: number | null
  basisPrice: number | null
  basisValue: number | null
  status: string
}

/**
 * 누진세율로 소득세 계산
 */
export function calcIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0

  let tax = 0
  let prev = 0

  for (const bracket of INCOME_TAX_BRACKETS) {
    const taxableInBracket = Math.min(taxableIncome, bracket.limit) - prev
    if (taxableInBracket <= 0) break
    tax += taxableInBracket * bracket.rate
    prev = bracket.limit
  }

  return Math.round(tax)
}

/**
 * RSU 스케줄 목록에서 세금 추정 계산
 * - vested: vestPrice 사용
 * - pending: basisPrice (예상가) 사용
 */
export function calcRSUTaxSummary(schedules: RSUScheduleInput[]): RSUTaxSummary {
  const estimates: RSUTaxEstimate[] = schedules.map((s) => {
    const basisFallback = s.basisPrice ?? (s.basisValue != null && s.shares > 0 ? s.basisValue / s.shares : null)
    const price = s.status === 'vested' ? s.vestPrice : (s.vestPrice ?? basisFallback)
    const grossIncome = price != null ? Math.round(price * s.shares) : 0

    const incomeTax = calcIncomeTax(grossIncome)
    const localTax = Math.round(incomeTax * LOCAL_TAX_RATE)
    const totalTax = incomeTax + localTax
    const effectiveRate = grossIncome > 0 ? totalTax / grossIncome : 0

    return {
      scheduleId: s.id,
      vestingDate: new Date(s.vestingDate).toISOString(),
      shares: s.shares,
      vestPrice: price,
      grossIncome,
      incomeTax,
      localTax,
      totalTax,
      effectiveRate,
      status: s.status,
    }
  })

  const totalGrossIncome = estimates.reduce((s, e) => s + e.grossIncome, 0)
  const totalTax = estimates.reduce((s, e) => s + e.totalTax, 0)

  return { estimates, totalGrossIncome, totalTax }
}
