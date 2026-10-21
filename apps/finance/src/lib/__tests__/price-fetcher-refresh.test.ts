/**
 * Codex #501 P2 회귀 — refreshPrices 가 전략 전용 지수 티커 (보유·관심 아님) 를
 * placeholder (US/USD) 가 아니라 야후 quote 메타 (KSC/KRW/KOSPI) 로 저장하는지.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const { quoteMock } = vi.hoisted(() => ({ quoteMock: vi.fn() }))

vi.mock('yahoo-finance2', () => {
  class YahooFinance {
    quote = quoteMock
  }
  return { default: YahooFinance }
})

vi.mock('../prisma', () => ({
  prisma: {
    priceCache: { upsert: vi.fn() },
    holding: { findMany: vi.fn() },
    watchlist: { findMany: vi.fn() },
    customStrategy: { findMany: vi.fn() },
  },
}))

import { refreshPrices } from '../price-fetcher'
import { prisma } from '../prisma'

beforeEach(() => {
  quoteMock.mockReset()
  vi.mocked(prisma.priceCache.upsert).mockReset().mockResolvedValue({} as never)
  vi.mocked(prisma.holding.findMany).mockReset().mockResolvedValue([] as never)
  vi.mocked(prisma.watchlist.findMany).mockReset().mockResolvedValue([] as never)
  vi.mocked(prisma.customStrategy.findMany).mockReset().mockResolvedValue([] as never)
})

function upsertArgFor(ticker: string) {
  const call = vi.mocked(prisma.priceCache.upsert).mock.calls.find((c) => c[0].where.ticker === ticker)
  expect(call, `upsert(${ticker}) 호출 없음`).toBeDefined()
  return call![0]
}

describe('refreshPrices — 전략 전용 지수 메타 (Codex #501 P2)', () => {
  it('활성 전략 자기 티커 ^KS11 은 quote 메타 (KR/KRW/KOSPI) 로 create/update', async () => {
    vi.mocked(prisma.customStrategy.findMany).mockResolvedValue([
      { ticker: '^KS11', conditions: [{ type: 'price', operator: '<', value: 6000 }] },
    ] as never)
    quoteMock.mockImplementation(async (ticker: string) =>
      ticker === '^KS11'
        ? { regularMarketPrice: 6717.28, exchange: 'KSC', currency: 'KRW', shortName: 'KOSPI Composite Index' }
        : { regularMarketPrice: 1380.5, exchange: 'CCY', currency: 'KRW', shortName: 'USD/KRW' },
    )

    const result = await refreshPrices()

    expect(result.failed).toBe(0)
    const arg = upsertArgFor('^KS11')
    expect(arg.create).toMatchObject({ market: 'KR', currency: 'KRW', displayName: 'KOSPI Composite Index' })
    expect(arg.update).toMatchObject({ market: 'KR', currency: 'KRW', displayName: 'KOSPI Composite Index' })
  })

  it('보유 종목 메타는 quote 와 달라도 그대로 (사용자 기록 우선)', async () => {
    vi.mocked(prisma.holding.findMany).mockResolvedValue([
      { ticker: '035720.KS', displayName: '카카오', market: 'KR', currency: 'KRW' },
    ] as never)
    quoteMock.mockResolvedValue({ regularMarketPrice: 33450, exchange: 'KSC', currency: 'KRW', shortName: 'Kakao Corp.' })

    await refreshPrices()

    expect(upsertArgFor('035720.KS').create).toMatchObject({ displayName: '카카오', market: 'KR', currency: 'KRW' })
  })
})
