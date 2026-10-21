import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    earningsCache: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { getEarnings, getEarningsMany, upsertEarningsResults } from '../cache'

describe('getEarnings', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.findUnique).mockReset()
  })

  it('row 있음 → snapshot 반환', async () => {
    const { prisma } = await import('@/lib/prisma')
    const date = new Date('2026-02-01T00:00:00Z')
    vi.mocked(prisma.earningsCache.findUnique).mockResolvedValueOnce({
      ticker: 'AAPL',
      nextEarningsDate: date,
      lastFetchedAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const r = await getEarnings('AAPL')
    expect(r?.ticker).toBe('AAPL')
    expect(r?.nextEarningsDate).toEqual(date)
  })

  it('row 없음 → null', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.findUnique).mockResolvedValueOnce(null)
    expect(await getEarnings('UNKNOWN')).toBeNull()
  })
})

describe('getEarningsMany', () => {
  it('빈 배열 입력 → 빈 Map, findMany 호출 없음', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.findMany).mockReset()
    const r = await getEarningsMany([])
    expect(r.size).toBe(0)
    expect(prisma.earningsCache.findMany).not.toHaveBeenCalled()
  })

  it('여러 티커 조회 → ticker 별 Map', async () => {
    const { prisma } = await import('@/lib/prisma')
    const d1 = new Date('2026-02-01T00:00:00Z')
    const d2 = new Date('2026-03-01T00:00:00Z')
    vi.mocked(prisma.earningsCache.findMany).mockResolvedValueOnce([
      { ticker: 'AAPL', nextEarningsDate: d1, lastFetchedAt: new Date(), updatedAt: new Date() },
      { ticker: 'MSFT', nextEarningsDate: d2, lastFetchedAt: new Date(), updatedAt: new Date() },
    ] as never)

    const r = await getEarningsMany(['AAPL', 'MSFT'])
    expect(r.get('AAPL')?.nextEarningsDate).toEqual(d1)
    expect(r.get('MSFT')?.nextEarningsDate).toEqual(d2)
  })
})

describe('upsertEarningsResults', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.upsert).mockReset()
    vi.mocked(prisma.earningsCache.updateMany).mockReset()
  })

  it('성공 결과 → upsert 호출, ok 카운트', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.upsert).mockResolvedValue({} as never)

    const r = await upsertEarningsResults([
      { ticker: 'AAPL', nextEarningsDate: new Date('2026-02-01T00:00:00Z') },
      { ticker: 'MSFT', nextEarningsDate: null },
    ])
    expect(r).toEqual({ ok: 2, failed: 0 })
    expect(prisma.earningsCache.upsert).toHaveBeenCalledTimes(2)
  })

  it('error 결과 → updateMany 로 lastFetchedAt 만 갱신, failed 카운트', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.updateMany).mockResolvedValueOnce({ count: 1 } as never)

    const r = await upsertEarningsResults([
      { ticker: 'BAD', nextEarningsDate: null, error: '404' },
    ])
    expect(r).toEqual({ ok: 0, failed: 1 })
    expect(prisma.earningsCache.upsert).not.toHaveBeenCalled()
    expect(prisma.earningsCache.updateMany).toHaveBeenCalledWith({
      where: { ticker: 'BAD' },
      data: expect.objectContaining({ lastFetchedAt: expect.any(Date) }),
    })
  })

  it('성공 + 실패 혼합', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.earningsCache.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.earningsCache.updateMany).mockResolvedValue({ count: 0 } as never)

    const r = await upsertEarningsResults([
      { ticker: 'AAPL', nextEarningsDate: new Date() },
      { ticker: 'BAD', nextEarningsDate: null, error: 'timeout' },
    ])
    expect(r).toEqual({ ok: 1, failed: 1 })
  })
})
