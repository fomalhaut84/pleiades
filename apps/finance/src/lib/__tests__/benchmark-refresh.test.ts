/**
 * 회귀: pleiades#261 사전 리뷰 major 2건 —
 *  ① 고정 1개월 범위면 크론이 한 달 넘게 멈췄을 때 공백이 남아 3M·6M 알파가 null 대신 틀린 값이 된다
 *  ② 티커 하나가 Yahoo 에서 실패하면 나머지 티커 적재가 전부 멈춘다
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { historical, findMany, findFirst, upsert } = vi.hoisted(() => ({
  historical: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/yahoo-client', () => ({ createYahooFinance: () => ({ historical }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { account: { findMany }, benchmarkPrice: { findFirst, upsert } },
}))

import { refreshAllBenchmarks, refreshMonths } from '../performance/benchmark'

const NOW = new Date('2026-10-27T21:15:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

describe('refreshMonths', () => {
  it('시세가 없으면 12개월 (웹 버튼과 같은 범위)', () => {
    expect(refreshMonths(null, NOW)).toBe(12)
  })

  it('매일 돌면 1개월', () => {
    expect(refreshMonths(daysAgo(1), NOW)).toBe(2)
    expect(refreshMonths(daysAgo(0), NOW)).toBe(1)
  })

  it('한 달 넘게 멈췄으면 마지막 적재일까지 덮는다', () => {
    // 6/1 → 10/27 ≈ 148일 → 28일 단위 6 + 1 = 7개월
    expect(refreshMonths(new Date('2026-06-01T00:00:00Z'), NOW)).toBe(7)
  })

  it('12개월을 넘지 않는다', () => {
    expect(refreshMonths(daysAgo(1000), NOW)).toBe(12)
  })

  it('미래 날짜여도 1개월 이상', () => {
    expect(refreshMonths(daysAgo(-3), NOW)).toBe(1)
  })
})

describe('refreshAllBenchmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    findMany.mockResolvedValue([{ benchmarkTicker: '^KS11' }, { benchmarkTicker: '^GSPC' }, { benchmarkTicker: '^GSPC' }])
    findFirst.mockResolvedValue({ priceDate: daysAgo(1) })
    upsert.mockResolvedValue({})
  })

  it('첫 티커가 실패해도 다음 티커를 적재한다 — 실패는 결과에 담는다', async () => {
    historical
      .mockRejectedValueOnce(new Error('Too Many Requests'))
      .mockResolvedValueOnce([{ date: '2026-10-27', close: 6000 }])
    const results = await refreshAllBenchmarks(NOW)
    expect(historical).toHaveBeenCalledTimes(2)
    expect(results).toEqual([
      { ticker: '^KS11', inserted: 0, skipped: 0, months: 2, error: 'Too Many Requests' },
      { ticker: '^GSPC', inserted: 1, skipped: 0, months: 2 },
    ])
  })

  it('티커별 마지막 적재일로 범위를 정한다', async () => {
    findFirst.mockImplementation(async ({ where }: { where: { ticker: string } }) =>
      where.ticker === '^KS11' ? null : { priceDate: new Date('2026-06-01T00:00:00Z') },
    )
    historical.mockResolvedValue([])
    const results = await refreshAllBenchmarks(NOW)
    expect(results.map((r) => [r.ticker, r.months])).toEqual([['^KS11', 12], ['^GSPC', 7]])
  })

  it('설정된 벤치마크가 없으면 아무것도 부르지 않는다', async () => {
    findMany.mockResolvedValue([])
    expect(await refreshAllBenchmarks(NOW)).toEqual([])
    expect(historical).not.toHaveBeenCalled()
  })
})
