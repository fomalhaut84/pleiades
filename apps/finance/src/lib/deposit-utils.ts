/**
 * 입금/증여 유틸리티: 입력 검증, 출처 상수
 */

export const DEPOSIT_SOURCES = ['증여', '용돈', '배당재투자', '기타'] as const

export interface DepositValidationError {
  field: string
  message: string
}

export function validateDepositInput(body: Record<string, unknown>): DepositValidationError[] {
  const errors: DepositValidationError[] = []

  if (!body.accountId || typeof body.accountId !== 'string') {
    errors.push({ field: 'accountId', message: '계좌를 선택해주세요.' })
  }
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    errors.push({ field: 'amount', message: '금액은 0보다 커야 합니다.' })
  }
  if (typeof body.source !== 'string' || !body.source.trim()) {
    errors.push({ field: 'source', message: '출처를 입력해주세요.' })
  }
  if (!body.depositedAt || typeof body.depositedAt !== 'string' || isNaN(Date.parse(body.depositedAt))) {
    errors.push({ field: 'depositedAt', message: '유효한 입금일을 입력해주세요.' })
  }

  return errors
}
