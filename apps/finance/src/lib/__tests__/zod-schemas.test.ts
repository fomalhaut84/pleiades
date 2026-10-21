import { describe, expect, it } from 'vitest'
import {
  paginationSchema,
  yearSchema,
  monthSchema,
  dateRangeSchema,
} from '../zod-schemas'

describe('paginationSchema', () => {
  it('정상 입력', () => {
    const r = paginationSchema.safeParse({ limit: '20', offset: '10' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toEqual({ limit: 20, offset: 10 })
    }
  })

  it('null/빈 문자열 → 기본값 (limit=50, offset=0)', () => {
    const r1 = paginationSchema.safeParse({ limit: null, offset: null })
    expect(r1.success).toBe(true)
    if (r1.success) {
      expect(r1.data).toEqual({ limit: 50, offset: 0 })
    }
    const r2 = paginationSchema.safeParse({ limit: '', offset: '' })
    expect(r2.success).toBe(true)
    if (r2.success) {
      expect(r2.data).toEqual({ limit: 50, offset: 0 })
    }
  })

  it('limit 최댓값 초과 → 실패', () => {
    const r = paginationSchema.safeParse({ limit: '201', offset: '0' })
    expect(r.success).toBe(false)
  })
  it('limit 200 → 성공 (경계)', () => {
    const r = paginationSchema.safeParse({ limit: '200', offset: '0' })
    expect(r.success).toBe(true)
  })

  it('limit 0 또는 음수 → 실패', () => {
    expect(paginationSchema.safeParse({ limit: '0', offset: '0' }).success).toBe(false)
    expect(paginationSchema.safeParse({ limit: '-10', offset: '0' }).success).toBe(false)
  })

  it('limit 실수 → 실패', () => {
    const r = paginationSchema.safeParse({ limit: '10.5', offset: '0' })
    expect(r.success).toBe(false)
  })

  it('limit 비숫자 → 실패', () => {
    const r = paginationSchema.safeParse({ limit: 'abc', offset: '0' })
    expect(r.success).toBe(false)
  })

  it('offset 음수 → 실패', () => {
    const r = paginationSchema.safeParse({ limit: '50', offset: '-1' })
    expect(r.success).toBe(false)
  })

  it('offset 오버플로우 → 실패', () => {
    const r = paginationSchema.safeParse({ limit: '50', offset: '99999999' })
    expect(r.success).toBe(false)
  })
})

describe('yearSchema', () => {
  it('정상 연도', () => {
    const r = yearSchema.safeParse('2026')
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toBe(2026)
  })
  it('null/빈 문자열 → undefined', () => {
    expect(yearSchema.safeParse(null).data).toBeUndefined()
    expect(yearSchema.safeParse('').data).toBeUndefined()
    expect(yearSchema.safeParse(undefined).data).toBeUndefined()
  })
  it('범위 외 → 실패', () => {
    expect(yearSchema.safeParse('1999').success).toBe(false)
    expect(yearSchema.safeParse('2101').success).toBe(false)
  })
  it('실수 → 실패', () => {
    expect(yearSchema.safeParse('2026.5').success).toBe(false)
  })
  it('비숫자 → 실패', () => {
    expect(yearSchema.safeParse('abcd').success).toBe(false)
  })
})

describe('monthSchema', () => {
  it('정상 월', () => {
    expect(monthSchema.safeParse('1').data).toBe(1)
    expect(monthSchema.safeParse('12').data).toBe(12)
  })
  it('null/빈 → undefined', () => {
    expect(monthSchema.safeParse(null).data).toBeUndefined()
    expect(monthSchema.safeParse('').data).toBeUndefined()
  })
  it('범위 외 → 실패', () => {
    expect(monthSchema.safeParse('0').success).toBe(false)
    expect(monthSchema.safeParse('13').success).toBe(false)
  })
  it('실수/비숫자 → 실패', () => {
    expect(monthSchema.safeParse('1.5').success).toBe(false)
    expect(monthSchema.safeParse('xyz').success).toBe(false)
  })
})

describe('dateRangeSchema', () => {
  it('정상 from/to', () => {
    const r = dateRangeSchema.safeParse({ from: '2026-01-01', to: '2026-06-30' })
    expect(r.success).toBe(true)
  })
  it('from 만 있어도 통과', () => {
    expect(dateRangeSchema.safeParse({ from: '2026-01-01' }).success).toBe(true)
  })
  it('to 만 있어도 통과', () => {
    expect(dateRangeSchema.safeParse({ to: '2026-06-30' }).success).toBe(true)
  })
  it('둘 다 null/빈 → 통과', () => {
    expect(dateRangeSchema.safeParse({ from: null, to: null }).success).toBe(true)
    expect(dateRangeSchema.safeParse({ from: '', to: '' }).success).toBe(true)
    expect(dateRangeSchema.safeParse({}).success).toBe(true)
  })
  it('무효 from → 실패', () => {
    const r = dateRangeSchema.safeParse({ from: 'bad-date' })
    expect(r.success).toBe(false)
  })
  it('무효 to → 실패', () => {
    const r = dateRangeSchema.safeParse({ to: 'bad-date' })
    expect(r.success).toBe(false)
  })
  it('from = to → 통과', () => {
    expect(dateRangeSchema.safeParse({ from: '2026-06-15', to: '2026-06-15' }).success).toBe(true)
  })
  it('의미 검증 (from > to) 은 라우트 책임 — schema 는 parse 만', () => {
    // schema 단계에서는 의미 모순을 차단하지 않는다 (timezone/inclusive-day 처리가 라우트마다 다름).
    expect(dateRangeSchema.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success).toBe(true)
  })
  it('positive timezone offset 도 통과', () => {
    // 예: from=KST 6/18 00:30 = UTC 6/17 15:30. raw prefix 비교 같은 timezone-naive 검증을 하지 않음.
    expect(
      dateRangeSchema.safeParse({
        from: '2026-06-18T00:30:00+09:00',
        to: '2026-06-17',
      }).success,
    ).toBe(true)
  })
})
