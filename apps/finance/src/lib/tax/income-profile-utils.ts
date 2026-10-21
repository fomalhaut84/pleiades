/**
 * 근로소득 프로필 유틸리티
 *
 * 근로소득공제 계산 (2024~2026년 동일):
 *   500만 이하: 70%
 *   1,500만 이하: 350만 + 초과분 40%
 *   4,500만 이하: 750만 + 초과분 15%
 *   1억 이하: 1,200만 + 초과분 5%
 *   1억 초과: 1,475만 + 초과분 2%
 *
 * 과세표준 = 총급여 - 근로소득공제
 * (인적공제·특별공제 등은 미반영, 참고용)
 */

/** 근로소득공제 구간 */
const EARNED_INCOME_DEDUCTION_BRACKETS = [
  { limit: 5_000_000, rate: 0.70, base: 0 },
  { limit: 15_000_000, rate: 0.40, base: 3_500_000 },
  { limit: 45_000_000, rate: 0.15, base: 7_500_000 },
  { limit: 100_000_000, rate: 0.05, base: 12_000_000 },
  { limit: Infinity, rate: 0.02, base: 14_750_000 },
] as const

/**
 * 세전 총급여로 근로소득공제 계산
 */
export function calcEarnedIncomeDeduction(grossSalary: number): number {
  if (grossSalary <= 0) return 0

  let prevLimit = 0
  for (const bracket of EARNED_INCOME_DEDUCTION_BRACKETS) {
    if (grossSalary <= bracket.limit) {
      return Math.round(bracket.base + (grossSalary - prevLimit) * bracket.rate)
    }
    prevLimit = bracket.limit
  }

  return 0
}

/**
 * 세전 총급여 → 과세표준 계산
 */
export function calcTaxableFromGross(grossSalary: number): {
  earnedDeduction: number
  taxableIncome: number
} {
  const earnedDeduction = calcEarnedIncomeDeduction(grossSalary)
  const taxableIncome = Math.max(0, grossSalary - earnedDeduction)
  return { earnedDeduction, taxableIncome }
}

export interface IncomeProfileInput {
  year: number
  inputType: string       // "gross" | "taxable"
  grossSalary?: number    // inputType=gross 시 필수
  taxableIncome?: number  // inputType=taxable 시 필수
  prepaidTax?: number
  note?: string
}

interface ValidationError {
  field: string
  message: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateIncomeProfileInput(input: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    errors.push({ field: '_', message: '유효한 객체 형식이 아닙니다.' })
    return errors
  }

  const maxYear = new Date().getFullYear() + 1
  if (!Number.isInteger(input.year) || input.year < 2020 || input.year > maxYear) {
    errors.push({ field: 'year', message: `연도는 2020~${maxYear} 사이여야 합니다.` })
  }

  if (input.inputType !== 'gross' && input.inputType !== 'taxable') {
    errors.push({ field: 'inputType', message: '입력 유형은 gross 또는 taxable이어야 합니다.' })
  }

  if (input.inputType === 'gross') {
    if (input.grossSalary == null || typeof input.grossSalary !== 'number' || !Number.isFinite(input.grossSalary) || input.grossSalary < 0) {
      errors.push({ field: 'grossSalary', message: '세전 총급여는 0 이상의 숫자여야 합니다.' })
    }
  }

  if (input.inputType === 'taxable') {
    if (input.taxableIncome == null || typeof input.taxableIncome !== 'number' || !Number.isFinite(input.taxableIncome) || input.taxableIncome < 0) {
      errors.push({ field: 'taxableIncome', message: '과세표준은 0 이상의 숫자여야 합니다.' })
    }
  }

  if (input.prepaidTax != null && (!Number.isFinite(input.prepaidTax) || input.prepaidTax < 0)) {
    errors.push({ field: 'prepaidTax', message: '기납부 세액은 0 이상의 숫자여야 합니다.' })
  }

  if (input.note != null && typeof input.note !== 'string') {
    errors.push({ field: 'note', message: '메모는 문자열이어야 합니다.' })
  }

  return errors
}
