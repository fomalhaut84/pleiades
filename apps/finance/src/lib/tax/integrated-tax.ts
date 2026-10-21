/**
 * 통합 근로소득세 시뮬레이션
 *
 * 근로소득 과세표준(연봉) + RSU 베스팅 소득 + 스톡옵션 행사 이익
 * → 합산 과세표준 → 누진세율 → 소득세 + 지방소득세
 * → 기납부 세액 차감 → 추가 납부 예상액
 *
 * 주의: 참고용 추정치. 인적공제·특별공제 등 미반영.
 */

import { calcIncomeTax } from '@/lib/tax/income-tax'

/** 지방소득세율 (소득세의 10%) */
const LOCAL_TAX_RATE = 0.10

export interface IntegratedTaxInput {
  /** 연봉 과세표준 (IncomeProfile.taxableIncome) */
  baseTaxableIncome: number
  /** RSU 근로소득 합계 */
  rsuIncome: number
  /** 스톡옵션 행사 이익 합계 */
  stockOptionGain: number
  /** 기납부 세액 (원천징수 합계) */
  prepaidTax: number
}

export interface IntegratedTaxResult {
  /** 연봉 과세표준 */
  baseTaxableIncome: number
  /** RSU 근로소득 */
  rsuIncome: number
  /** 스톡옵션 행사 이익 */
  stockOptionGain: number
  /** 합산 과세표준 */
  combinedTaxable: number
  /** 합산 소득세 (누진세율) */
  incomeTax: number
  /** 합산 지방소득세 */
  localTax: number
  /** 총 세금 (소득세 + 지방소득세) */
  totalTax: number
  /** 기납부 세액 */
  prepaidTax: number
  /** 추가 납부 예상액 (음수 = 환급) */
  additionalTax: number
  /** 실효세율 (합산 기준) */
  effectiveRate: number

  /** 연봉만 기준 세금 (비교용) */
  baseOnlyTax: number
  /** RSU/스톡옵션으로 인한 증분 세금 */
  incrementalTax: number
}

/**
 * 통합 근로소득세 시뮬레이션 계산
 */
export function calcIntegratedTax(input: IntegratedTaxInput): IntegratedTaxResult {
  const baseTaxable = Math.max(0, input.baseTaxableIncome)
  const rsu = Math.max(0, input.rsuIncome)
  const so = Math.max(0, input.stockOptionGain)
  const prepaid = Math.max(0, input.prepaidTax)

  const combinedTaxable = baseTaxable + rsu + so

  const incomeTax = calcIncomeTax(combinedTaxable)
  const localTax = Math.round(incomeTax * LOCAL_TAX_RATE)
  const totalTax = incomeTax + localTax

  const additionalTax = totalTax - prepaid

  const effectiveRate = combinedTaxable > 0 ? totalTax / combinedTaxable : 0

  // 연봉만 기준 세금 (비교용)
  const baseIncomeTax = calcIncomeTax(baseTaxable)
  const baseLocalTax = Math.round(baseIncomeTax * LOCAL_TAX_RATE)
  const baseOnlyTax = baseIncomeTax + baseLocalTax

  const incrementalTax = totalTax - baseOnlyTax

  return {
    baseTaxableIncome: baseTaxable,
    rsuIncome: rsu,
    stockOptionGain: so,
    combinedTaxable,
    incomeTax,
    localTax,
    totalTax,
    prepaidTax: prepaid,
    additionalTax,
    effectiveRate,
    baseOnlyTax,
    incrementalTax,
  }
}
