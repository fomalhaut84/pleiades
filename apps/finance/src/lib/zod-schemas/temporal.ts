/**
 * GET 쿼리 파라미터 — 시간/날짜 공통 schema.
 * year/month 범위 검증, date range from <= to 교차 검증.
 */

import { z } from 'zod'

const YEAR_MIN = 2000
const YEAR_MAX = 2100

/**
 * 연도 schema. null/빈 문자열 입력 시 undefined 로 normalize (호출 측이 기본값 처리).
 * 명시적으로 값이 들어오면 2000~2100 정수만 허용.
 */
export const yearSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === '' ? undefined : Number(v)))
  .pipe(
    z
      .number({ message: 'year 은 2000~2100 정수여야 합니다.' })
      .int({ message: 'year 은 2000~2100 정수여야 합니다.' })
      .min(YEAR_MIN, { message: `year 은 ${YEAR_MIN} 이상이어야 합니다.` })
      .max(YEAR_MAX, { message: `year 은 ${YEAR_MAX} 이하여야 합니다.` })
      .optional(),
  )

/**
 * 월 schema. null/빈 문자열 입력 시 undefined.
 * 명시적으로 값이 들어오면 1~12 정수만 허용.
 */
export const monthSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === '' ? undefined : Number(v)))
  .pipe(
    z
      .number({ message: 'month 은 1~12 정수여야 합니다.' })
      .int({ message: 'month 은 1~12 정수여야 합니다.' })
      .min(1, { message: 'month 은 1 이상이어야 합니다.' })
      .max(12, { message: 'month 은 12 이하이어야 합니다.' })
      .optional(),
  )

export const yearMonthSchema = z.object({
  year: yearSchema,
  month: monthSchema,
})

/**
 * 날짜 범위 schema. schema 단계에서는 from/to 각각의 parse 가능 여부만 검증.
 * 둘 다 optional.
 *
 * from > to 같은 의미 검증은 라우트 책임 — inclusive-day 확장(예: trades 의 to+1day),
 * timezone offset 처리 방식이 라우트마다 달라 schema 가 일반화하면 false negative 가
 * 발생한다. 도메인 의미는 호출 측이 알아서 처리.
 */
export const dateRangeSchema = z
  .object({
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.from && isNaN(Date.parse(d.from))) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: '유효한 시작일을 입력해주세요.',
      })
    }
    if (d.to && isNaN(Date.parse(d.to))) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: '유효한 종료일을 입력해주세요.',
      })
    }
  })
