/**
 * GET 쿼리 파라미터 — 페이지네이션 공통 schema.
 * limit/offset 의 정수/범위/오버플로우 검증을 일관 처리.
 */

import { z } from 'zod'

const PAGE_LIMIT_DEFAULT = 50
const PAGE_LIMIT_MAX = 200
const OFFSET_MAX = 1_000_000

export const paginationSchema = z.object({
  limit: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null || v === '' ? PAGE_LIMIT_DEFAULT : Number(v)))
    .pipe(
      z
        .number({ message: 'limit 은 1 이상의 정수여야 합니다.' })
        .int({ message: 'limit 은 1 이상의 정수여야 합니다.' })
        .min(1, { message: 'limit 은 1 이상의 정수여야 합니다.' })
        .max(PAGE_LIMIT_MAX, { message: `limit 은 ${PAGE_LIMIT_MAX} 이하여야 합니다.` }),
    ),
  offset: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null || v === '' ? 0 : Number(v)))
    .pipe(
      z
        .number({ message: 'offset 은 0 이상의 정수여야 합니다.' })
        .int({ message: 'offset 은 0 이상의 정수여야 합니다.' })
        .nonnegative({ message: 'offset 은 0 이상의 정수여야 합니다.' })
        .max(OFFSET_MAX, { message: `offset 은 ${OFFSET_MAX.toLocaleString('ko-KR')} 이하여야 합니다.` }),
    ),
})

export type PaginationInput = z.infer<typeof paginationSchema>
