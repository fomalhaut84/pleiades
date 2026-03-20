/**
 * 예산(Budget) 유틸리티: 입력 검증
 */

export interface BudgetValidationError {
  field: string
  message: string
}

export function validateBudgetInput(body: Record<string, unknown>): BudgetValidationError[] {
  const errors: BudgetValidationError[] = []

  if (body.amount === undefined || body.amount === null) {
    errors.push({ field: 'amount', message: '금액을 입력해주세요.' })
  } else if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
    errors.push({ field: 'amount', message: '금액은 1 이상의 정수여야 합니다.' })
  } else if (body.amount > 2_147_483_647) {
    errors.push({ field: 'amount', message: '금액이 허용 범위를 초과했습니다.' })
  }

  if (body.year === undefined || body.year === null) {
    errors.push({ field: 'year', message: '연도를 입력해주세요.' })
  } else if (typeof body.year !== 'number' || !Number.isInteger(body.year) || body.year < 1900 || body.year > 2100) {
    errors.push({ field: 'year', message: '유효한 연도를 입력해주세요. (1900~2100)' })
  }

  if (body.month === undefined || body.month === null) {
    errors.push({ field: 'month', message: '월을 입력해주세요.' })
  } else if (typeof body.month !== 'number' || !Number.isInteger(body.month) || body.month < 1 || body.month > 12) {
    errors.push({ field: 'month', message: '유효한 월을 입력해주세요. (1~12)' })
  }

  if (body.categoryId !== undefined && body.categoryId !== null && typeof body.categoryId !== 'string') {
    errors.push({ field: 'categoryId', message: '카테고리 ID는 문자열이어야 합니다.' })
  }

  return errors
}

/**
 * 진행률 색상 결정
 */
export function getBudgetColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 100) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}
