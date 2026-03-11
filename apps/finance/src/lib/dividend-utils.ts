/**
 * 배당금 유틸리티: 세율 상수, 입력 검증, 세금 자동 계산
 */

/** US 배당 원천징수 세율 15% */
export const US_DIVIDEND_TAX_RATE = 0.15

/** KR 배당소득세율 15.4% (소득세 14% + 지방소득세 1.4%) */
export const KR_DIVIDEND_TAX_RATE = 0.154

export interface DividendValidationError {
  field: string
  message: string
}

export function validateDividendInput(body: {
  accountId?: string
  ticker?: string
  displayName?: string
  payDate?: string
  amountGross?: number
  amountNet?: number
  currency?: string
  fxRate?: number | null
}): DividendValidationError[] {
  const errors: DividendValidationError[] = []

  if (!body.accountId || typeof body.accountId !== 'string') errors.push({ field: 'accountId', message: '계좌를 선택해주세요.' })
  if (typeof body.ticker !== 'string' || !body.ticker.trim()) errors.push({ field: 'ticker', message: '종목을 선택해주세요.' })
  if (typeof body.displayName !== 'string' || !body.displayName.trim()) errors.push({ field: 'displayName', message: '종목명을 입력해주세요.' })
  if (!body.payDate || isNaN(Date.parse(body.payDate))) {
    errors.push({ field: 'payDate', message: '유효한 지급일을 입력해주세요.' })
  }
  if (typeof body.amountGross !== 'number' || !Number.isFinite(body.amountGross) || body.amountGross <= 0) {
    errors.push({ field: 'amountGross', message: '세전 금액은 0보다 커야 합니다.' })
  }
  if (typeof body.amountNet !== 'number' || !Number.isFinite(body.amountNet) || body.amountNet < 0) {
    errors.push({ field: 'amountNet', message: '세후 금액은 0 이상이어야 합니다.' })
  }
  if (!body.currency || !['USD', 'KRW'].includes(body.currency)) {
    errors.push({ field: 'currency', message: '통화를 선택해주세요 (USD/KRW).' })
  }
  if (body.currency === 'USD' && (typeof body.fxRate !== 'number' || !Number.isFinite(body.fxRate) || body.fxRate <= 0)) {
    errors.push({ field: 'fxRate', message: 'USD 배당은 유효한 환율을 입력해야 합니다.' })
  }

  return errors
}

/**
 * 세전 금액 + 통화로 세금/세후 금액 자동 계산
 */
export function calcDividendTax(amountGross: number, currency: string): {
  taxAmount: number
  amountNet: number
} {
  const rate = currency === 'USD' ? US_DIVIDEND_TAX_RATE : KR_DIVIDEND_TAX_RATE
  const taxAmount = currency === 'USD'
    ? Math.round(amountGross * rate * 100) / 100
    : Math.round(amountGross * rate)
  const amountNet = currency === 'USD'
    ? Math.round((amountGross - taxAmount) * 100) / 100
    : Math.round(amountGross - taxAmount)
  return { taxAmount, amountNet }
}

/**
 * 세후 금액의 원화 환산
 */
export function calcAmountKRW(amountNet: number, currency: string, fxRate?: number | null): number {
  if (currency === 'USD') {
    return Math.round(amountNet * (fxRate ?? 0))
  }
  return Math.round(amountNet)
}
