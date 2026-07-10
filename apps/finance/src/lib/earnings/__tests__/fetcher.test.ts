import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { quoteSummaryMock } = vi.hoisted(() => ({ quoteSummaryMock: vi.fn() }))

vi.mock('yahoo-finance2', () => {
  class YahooFinance {
    quoteSummary = quoteSummaryMock
  }
  return { default: YahooFinance }
})

import { fetchEarnings, fetchEarningsMany } from '../fetcher'

const FIXED_NOW = Date.parse('2026-07-08T00:00:00Z')

beforeEach(() => {
  quoteSummaryMock.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchEarnings', () => {
  it('array of ISO strings → 미래 중 가장 이른 date 반환', async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: ['2026-07-30T20:00:00.000Z', '2026-10-30T20:00:00.000Z'] },
      },
    })
    const r = await fetchEarnings('AAPL')
    expect(r.ticker).toBe('AAPL')
    expect(r.nextEarningsDate?.toISOString()).toBe('2026-07-30T20:00:00.000Z')
    expect(r.error).toBeUndefined()
  })

  it('array of Date 인스턴스 도 파싱', async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: [new Date('2026-08-01T20:00:00Z')] },
      },
    })
    const r = await fetchEarnings('MSFT')
    expect(r.nextEarningsDate?.toISOString()).toBe('2026-08-01T20:00:00.000Z')
  })

  it('단일 Date (배열 아님) 도 정규화하여 파싱', async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: new Date('2026-09-01T00:00:00Z') },
      },
    })
    const r = await fetchEarnings('GOOG')
    expect(r.nextEarningsDate?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('과거 date 만 있으면 nextEarningsDate = null (미래 없음)', async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: ['2025-01-01T00:00:00Z', '2026-06-01T00:00:00Z'] },
      },
    })
    const r = await fetchEarnings('OLD')
    expect(r.nextEarningsDate).toBeNull()
    expect(r.error).toBeUndefined()
  })

  it('어닝 UTC 자정 (=KST 09:00) 이고 스캔이 같은 KST 날 오후 → 놓치지 않음 (Codex #426 P2)', async () => {
    // FIXED_NOW = 2026-07-08T00:00:00Z (KST 07-08 09:00) — 오전. 어닝을 이후 시간대로.
    // KST 07-08 스캔이 KST 07-08 오후에 실행되고, 어닝 timestamp 가 그 스캔 시각보다 이전이지만
    // 같은 KST 날짜 이면 유지되어야 함.
    vi.setSystemTime(new Date('2026-07-08T05:00:00Z')) // KST 14:00
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: ['2026-07-08T00:00:00Z'] }, // KST 09:00 (5h 이전 raw)
      },
    })
    const r = await fetchEarnings('AAPL')
    expect(r.nextEarningsDate?.toISOString()).toBe('2026-07-08T00:00:00.000Z')
  })

  it('KST 어제로 넘어간 어닝은 제외', async () => {
    vi.setSystemTime(new Date('2026-07-09T05:00:00Z')) // KST 07-09 14:00
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: ['2026-07-07T15:00:00Z'] }, // KST 07-08 00:00 (어제)
      },
    })
    const r = await fetchEarnings('AAPL')
    expect(r.nextEarningsDate).toBeNull()
  })

  it('과거 + 미래 혼합 → 미래 중 가장 이른 것', async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: [
          '2026-06-01T00:00:00Z',            // 과거
          '2026-10-01T00:00:00Z',            // 미래
          '2026-07-30T20:00:00Z',            // 미래 (더 가까움)
        ] },
      },
    })
    const r = await fetchEarnings('MIX')
    expect(r.nextEarningsDate?.toISOString()).toBe('2026-07-30T20:00:00.000Z')
  })

  it('calendarEvents 자체가 없어도 crash X → null 반환', async () => {
    quoteSummaryMock.mockResolvedValueOnce({})
    const r = await fetchEarnings('NONE')
    expect(r.nextEarningsDate).toBeNull()
    expect(r.error).toBeUndefined()
  })

  it('parseable date 가 아닌 문자열 skip', async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      calendarEvents: {
        earnings: { earningsDate: ['not-a-date', '2026-08-15T00:00:00Z'] },
      },
    })
    const r = await fetchEarnings('BAD')
    expect(r.nextEarningsDate?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })

  it('quoteSummary 가 throw → error 필드로 반환 (예외 전파 X)', async () => {
    quoteSummaryMock.mockRejectedValueOnce(new Error('rate limit'))
    const r = await fetchEarnings('FAIL')
    expect(r.ticker).toBe('FAIL')
    expect(r.nextEarningsDate).toBeNull()
    expect(r.error).toContain('rate limit')
  })
})

describe('fetchEarningsMany', () => {
  it('여러 티커 순회, 각 결과 반환 (실패 포함)', async () => {
    quoteSummaryMock
      .mockResolvedValueOnce({
        calendarEvents: { earnings: { earningsDate: ['2026-08-01T00:00:00Z'] } },
      })
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({
        calendarEvents: { earnings: { earningsDate: ['2026-09-01T00:00:00Z'] } },
      })

    const results = await fetchEarningsMany(['A', 'B', 'C'], 2)
    expect(results).toHaveLength(3)
    const byTicker = Object.fromEntries(results.map((r) => [r.ticker, r]))
    expect(byTicker.A.nextEarningsDate?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(byTicker.B.error).toContain('404')
    expect(byTicker.C.nextEarningsDate?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('빈 tickers → 빈 배열, quoteSummary 호출 없음', async () => {
    const results = await fetchEarningsMany([], 5)
    expect(results).toEqual([])
    expect(quoteSummaryMock).not.toHaveBeenCalled()
  })
})
