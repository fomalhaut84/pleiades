import { describe, expect, it } from 'vitest'
import {
  kstMidnightUtc,
  isSameOrFutureKstDay,
  kstDayDiff,
  formatKstDate,
  formatKstDateTime,
  formatKstDateTimeFull,
} from '../kst-date'

describe('kstMidnightUtc', () => {
  it('KST 자정 (UTC 15:00 전날) 을 그 UTC 값으로 반환', () => {
    // 2026-07-30 00:00 KST = 2026-07-29 15:00 UTC
    const d = new Date('2026-07-30T05:00:00Z')  // KST 14:00
    expect(new Date(kstMidnightUtc(d)).toISOString()).toBe('2026-07-29T15:00:00.000Z')
  })

  it('UTC 자정도 KST 09:00 → 같은 KST 캘린더 일', () => {
    const d = new Date('2026-07-30T00:00:00Z')  // KST 09:00
    const midnight = new Date('2026-07-30T05:00:00Z')  // KST 14:00 (같은 KST 날짜)
    expect(kstMidnightUtc(d)).toBe(kstMidnightUtc(midnight))
  })
})

describe('isSameOrFutureKstDay (Codex #426 P2 회귀 방지)', () => {
  it('yahoo earnings 값이 UTC 자정 (=KST 09:00) 인데 스캔이 KST 오후 → 같은 KST 날 → true', () => {
    const earnings = new Date('2026-07-30T00:00:00Z')  // KST 07-30 09:00
    const scanNow = new Date('2026-07-30T05:00:00Z')   // KST 07-30 14:00
    expect(isSameOrFutureKstDay(earnings, scanNow)).toBe(true)
  })

  it('어닝이 KST 어제 자정 → false', () => {
    const earnings = new Date('2026-07-29T20:00:00Z')  // KST 07-30 05:00 (같은 KST 날)
    const scanNow = new Date('2026-07-31T05:00:00Z')   // KST 07-31 14:00
    expect(isSameOrFutureKstDay(earnings, scanNow)).toBe(false)
  })

  it('어닝이 KST 내일 → true', () => {
    const earnings = new Date('2026-07-31T00:00:00Z')  // KST 07-31 09:00
    const scanNow = new Date('2026-07-30T05:00:00Z')   // KST 07-30
    expect(isSameOrFutureKstDay(earnings, scanNow)).toBe(true)
  })

  it('KST 자정 경계 정확도: now 가 KST 23:59, 어닝이 KST 다음날 00:00 → future', () => {
    const scanNow = new Date('2026-07-30T14:59:00Z')   // KST 07-30 23:59
    const earnings = new Date('2026-07-30T15:00:00Z')  // KST 07-31 00:00
    expect(isSameOrFutureKstDay(earnings, scanNow)).toBe(true)
  })
})

describe('kstDayDiff', () => {
  it('같은 KST 날 → 0 (시각 무관)', () => {
    const a = new Date('2026-07-30T00:00:00Z')  // KST 09:00
    const b = new Date('2026-07-30T14:00:00Z')  // KST 23:00
    expect(kstDayDiff(a, b)).toBe(0)
    expect(kstDayDiff(b, a)).toBe(0)
  })

  it('내일 vs 오늘 → +1 / -1', () => {
    const today = new Date('2026-07-30T00:00:00Z')
    const tomorrow = new Date('2026-07-31T00:00:00Z')
    expect(kstDayDiff(tomorrow, today)).toBe(1)
    expect(kstDayDiff(today, tomorrow)).toBe(-1)
  })

  it('3일 뒤 → 3', () => {
    const today = new Date('2026-07-30T00:00:00Z')
    const d3 = new Date('2026-08-02T20:00:00Z')  // KST 08-03 05:00 → 4일 뒤 아님, 3일 뒤 KST 8-2
    // 실제로 2026-07-30 (KST 07-30 09:00) → 2026-08-02T20:00Z (KST 08-03 05:00): 4일 뒤
    // 다른 예시 사용
    const d3proper = new Date('2026-08-01T20:00:00Z')  // KST 08-02 05:00 → 3일 뒤
    expect(kstDayDiff(d3proper, today)).toBe(3)
    // sanity
    expect(kstDayDiff(d3, today)).toBe(4)
  })
})

describe('formatKstDate / formatKstDateTime (#499)', () => {
  it('UTC → KST 변환 후 표기', () => {
    // 2026-09-17 06:30 UTC = 2026-09-17 15:30 KST (한국장 마감)
    const d = new Date('2026-09-17T06:30:00Z')
    expect(formatKstDate(d)).toBe('2026-09-17')
    expect(formatKstDateTime(d)).toBe('09-17 15:30 KST')
  })

  it('KST 자정 경계: UTC 15:00 = 다음날 KST 00:00', () => {
    const before = new Date('2026-09-17T14:59:00Z')  // KST 09-17 23:59
    const after = new Date('2026-09-17T15:00:00Z')   // KST 09-18 00:00
    expect(formatKstDate(before)).toBe('2026-09-17')
    expect(formatKstDateTime(before)).toBe('09-17 23:59 KST')
    expect(formatKstDate(after)).toBe('2026-09-18')
    expect(formatKstDateTime(after)).toBe('09-18 00:00 KST')
  })

  it('연말 경계: UTC 12-31 16:00 = KST 다음 해 01-01 01:00', () => {
    const d = new Date('2026-12-31T16:00:00Z')
    expect(formatKstDate(d)).toBe('2027-01-01')
    expect(formatKstDateTime(d)).toBe('01-01 01:00 KST')
  })
})

describe('formatKstDateTimeFull (#499 사전 리뷰 P1)', () => {
  it('연도를 포함해 YYYY-MM-DD HH:mm KST 로 표기', () => {
    expect(formatKstDateTimeFull(new Date('2026-09-17T06:30:00Z'))).toBe('2026-09-17 15:30 KST')
  })

  it('UTC 연말 자정 직전은 KST 로 다음 해', () => {
    expect(formatKstDateTimeFull(new Date('2025-12-31T15:00:00Z'))).toBe('2026-01-01 00:00 KST')
  })
})
