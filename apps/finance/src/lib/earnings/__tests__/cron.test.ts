import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customStrategy: { findMany: vi.fn() },
    watchlist: { findMany: vi.fn() },
    holding: { findMany: vi.fn() },
  },
}))

vi.mock('../fetcher', () => ({
  fetchEarningsMany: vi.fn(),
}))

vi.mock('../cache', () => ({
  upsertEarningsResults: vi.fn(),
}))

import { gatherTargetTickers, runEarningsScan } from '../cron'

describe('gatherTargetTickers', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.customStrategy.findMany).mockReset()
    vi.mocked(prisma.watchlist.findMany).mockReset()
    vi.mocked(prisma.holding.findMany).mockReset()
  })

  it('3소스 union, 중복 제거, 알파벳 정렬', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.customStrategy.findMany).mockResolvedValueOnce([
      { ticker: 'AAPL' }, { ticker: 'MSFT' },
    ] as never)
    vi.mocked(prisma.watchlist.findMany).mockResolvedValueOnce([
      { ticker: 'MSFT' }, { ticker: 'NVDA' },
    ] as never)
    vi.mocked(prisma.holding.findMany).mockResolvedValueOnce([
      { ticker: 'AAPL' }, { ticker: 'TSLA' },
    ] as never)

    const result = await gatherTargetTickers()
    expect(result).toEqual(['AAPL', 'MSFT', 'NVDA', 'TSLA'])
  })

  it('3소스 모두 비면 빈 배열', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.customStrategy.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.watchlist.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.holding.findMany).mockResolvedValueOnce([] as never)

    expect(await gatherTargetTickers()).toEqual([])
  })
})

describe('runEarningsScan', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.customStrategy.findMany).mockReset()
    vi.mocked(prisma.watchlist.findMany).mockReset()
    vi.mocked(prisma.holding.findMany).mockReset()
    const { fetchEarningsMany } = await import('../fetcher')
    const { upsertEarningsResults } = await import('../cache')
    vi.mocked(fetchEarningsMany).mockReset()
    vi.mocked(upsertEarningsResults).mockReset()
  })

  it('타깃 없으면 fetch/upsert 스킵', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.customStrategy.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.watchlist.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.holding.findMany).mockResolvedValueOnce([] as never)

    const { fetchEarningsMany } = await import('../fetcher')
    const { upsertEarningsResults } = await import('../cache')

    const r = await runEarningsScan()
    expect(r).toEqual({ attempted: 0, ok: 0, failed: 0 })
    expect(fetchEarningsMany).not.toHaveBeenCalled()
    expect(upsertEarningsResults).not.toHaveBeenCalled()
  })

  it('fetch 결과를 upsert 로 전달, 요약 반환', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.customStrategy.findMany).mockResolvedValueOnce([{ ticker: 'AAPL' }] as never)
    vi.mocked(prisma.watchlist.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.holding.findMany).mockResolvedValueOnce([] as never)

    const { fetchEarningsMany } = await import('../fetcher')
    const { upsertEarningsResults } = await import('../cache')
    vi.mocked(fetchEarningsMany).mockResolvedValueOnce([
      { ticker: 'AAPL', nextEarningsDate: new Date('2026-02-01T00:00:00Z') },
    ])
    vi.mocked(upsertEarningsResults).mockResolvedValueOnce({ ok: 1, failed: 0 })

    const r = await runEarningsScan()
    expect(r).toEqual({ attempted: 1, ok: 1, failed: 0 })
    expect(fetchEarningsMany).toHaveBeenCalledWith(['AAPL'], 5)
  })
})
