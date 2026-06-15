/**
 * 배당금 유틸리티: 세율 상수, 입력 검증, 세금 자동 계산
 */

import { z } from 'zod'
import { validateFxRateForUSD } from './trade-utils'
import { zodErrorsToValidation, type ValidationError } from './zod-utils'

/** US 배당 원천징수 세율 15% */
export const US_DIVIDEND_TAX_RATE = 0.15

/** KR 배당소득세율 15.4% (소득세 14% + 지방소득세 1.4%) */
export const KR_DIVIDEND_TAX_RATE = 0.154

export type DividendValidationError = ValidationError

const DividendInputSchema = z
  .object({
    accountId: z
      .string({ message: '계좌를 선택해주세요.' })
      .min(1, { message: '계좌를 선택해주세요.' }),
    ticker: z
      .string({ message: '종목을 선택해주세요.' })
      .trim()
      .min(1, { message: '종목을 선택해주세요.' }),
    displayName: z
      .string({ message: '종목명을 입력해주세요.' })
      .trim()
      .min(1, { message: '종목명을 입력해주세요.' }),
    payDate: z
      .string({ message: '유효한 지급일을 입력해주세요.' })
      .refine((s) => !isNaN(Date.parse(s)), { message: '유효한 지급일을 입력해주세요.' }),
    amountGross: z
      .number({ message: '세전 금액은 0보다 커야 합니다.' })
      .positive({ message: '세전 금액은 0보다 커야 합니다.' })
      .finite({ message: '세전 금액은 0보다 커야 합니다.' }),
    amountNet: z
      .number({ message: '세후 금액은 0 이상이어야 합니다.' })
      .nonnegative({ message: '세후 금액은 0 이상이어야 합니다.' })
      .finite({ message: '세후 금액은 0 이상이어야 합니다.' }),
    currency: z.enum(['USD', 'KRW'], { message: '통화를 선택해주세요 (USD/KRW).' }),
    // fxRate 의 형식 검증은 USD 분기 + validateFxRateForUSD 헬퍼가 한국어 메시지로
    // 통일 처리. type-level 영문 메시지 누출 방지를 위해 unknown 으로 받는다.
    fxRate: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD') {
      const fxError = validateFxRateForUSD(data.fxRate, 'USD 배당')
      if (fxError) ctx.addIssue({ code: 'custom', path: ['fxRate'], message: fxError })
    }
  })

export function validateDividendInput(body: unknown): DividendValidationError[] {
  const result = DividendInputSchema.safeParse(body)
  if (result.success) return []
  return zodErrorsToValidation(result.error)
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
