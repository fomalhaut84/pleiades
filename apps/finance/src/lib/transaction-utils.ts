/**
 * 거래(Transaction) 유틸리티: 입력 검증
 */

import { z } from 'zod'
import { zodErrorsToValidation, type ValidationError } from './zod-utils'

export type TransactionValidationError = ValidationError

const INT32_MAX = 2_147_483_647

const TransactionInputSchema = z
  .object({
    // amount 는 누락 vs 형식 오류 vs 오버플로우 메시지가 모두 달라 schema 일반 검증 대신
    // superRefine 에서 인라인 분기로 보존한다. amount 키 자체 누락도 한국어 메시지로
    // 처리해야 하므로 .optional() 로 schema 통과시킨다.
    amount: z.unknown().optional(),
    description: z
      .string({ message: '내용을 입력해주세요.' })
      .trim()
      .min(1, { message: '내용을 입력해주세요.' })
      .max(200, { message: '내용은 200자 이내로 입력해주세요.' }),
    categoryId: z
      .string({ message: '카테고리를 선택해주세요.' })
      .min(1, { message: '카테고리를 선택해주세요.' }),
    type: z
      .enum(['transfer_out', 'transfer_in'], {
        message: '유형은 transfer_out 또는 transfer_in만 허용됩니다.',
      })
      .nullable()
      .optional(),
    linkedAssetId: z.string().nullable().optional(),
    transactedAt: z
      .string({ message: '날짜는 문자열이어야 합니다.' })
      .refine((s) => !isNaN(new Date(s).getTime()), { message: '유효한 날짜 형식이 아닙니다.' })
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amount === undefined || data.amount === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: '금액을 입력해주세요.' })
    } else if (
      typeof data.amount !== 'number' ||
      !Number.isInteger(data.amount) ||
      data.amount <= 0
    ) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: '금액은 1 이상의 정수여야 합니다.' })
    } else if (data.amount > INT32_MAX) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: '금액이 허용 범위를 초과했습니다.' })
    }

    if (data.type) {
      if (!data.linkedAssetId || typeof data.linkedAssetId !== 'string') {
        ctx.addIssue({
          code: 'custom',
          path: ['linkedAssetId'],
          message: '출금/입금 시 연결 자산을 선택해주세요.',
        })
      }
    }
  })

export function validateTransactionInput(body: unknown): TransactionValidationError[] {
  const result = TransactionInputSchema.safeParse(body)
  if (result.success) return []
  return zodErrorsToValidation(result.error)
}
