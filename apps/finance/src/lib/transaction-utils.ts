/**
 * 거래(Transaction) 유틸리티: 입력 검증
 */

export interface TransactionValidationError {
  field: string
  message: string
}

export function validateTransactionInput(body: Record<string, unknown>): TransactionValidationError[] {
  const errors: TransactionValidationError[] = []

  if (body.amount === undefined || body.amount === null) {
    errors.push({ field: 'amount', message: '금액을 입력해주세요.' })
  } else if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
    errors.push({ field: 'amount', message: '금액은 1 이상의 정수여야 합니다.' })
  } else if (body.amount > 2_147_483_647) {
    errors.push({ field: 'amount', message: '금액이 허용 범위를 초과했습니다.' })
  }

  if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
    errors.push({ field: 'description', message: '내용을 입력해주세요.' })
  } else if (body.description.trim().length > 200) {
    errors.push({ field: 'description', message: '내용은 200자 이내로 입력해주세요.' })
  }

  if (!body.categoryId || typeof body.categoryId !== 'string') {
    errors.push({ field: 'categoryId', message: '카테고리를 선택해주세요.' })
  }

  if (body.transactedAt !== undefined && body.transactedAt !== null) {
    if (typeof body.transactedAt !== 'string') {
      errors.push({ field: 'transactedAt', message: '날짜는 문자열이어야 합니다.' })
    } else {
      const d = new Date(body.transactedAt)
      if (isNaN(d.getTime())) {
        errors.push({ field: 'transactedAt', message: '유효한 날짜 형식이 아닙니다.' })
      }
    }
  }

  return errors
}
