/**
 * #499 회귀 — fetchQuote 의 지수 티커 캐시 skip + 시세 기준 시각 매핑.
 *
 * 지수 (^KS11 등) 는 보유·관심종목이 아니라 주가 갱신 cron 의 refresh 대상이 아니다.
 * PriceCache 에 적재하면 영구 stale 행이 되어 fallback 이 옛 값을 조용히 반환한다.
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
  },
}))

import { fetchQuote } from '../price-fetcher'
import { prisma } from '../prisma'

const KR_CLOSE_EPOCH_SEC = Math.floor(Date.parse('2026-09-17T06:30:00Z') / 1000)

beforeEach(() => {
  quoteMock.mockReset()
  vi.mocked(prisma.priceCache.upsert).mockReset()
  vi.mocked(prisma.priceCache.upsert).mockResolvedValue({} as never)
})

describe('fetchQuote — skipCache 옵션 (#499)', () => {
  it('skipCache: true 면 PriceCache upsert 를 호출하지 않는다', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 6717.28,
      currency: 'KRW',
      exchange: 'KSC',
      shortName: 'KOSPI Composite Index',
      marketState: 'CLOSED',
      regularMarketTime: KR_CLOSE_EPOCH_SEC,
    })

    const quote = await fetchQuote('^KS11', { skipCache: true })

    expect(vi.mocked(prisma.priceCache.upsert)).not.toHaveBeenCalled()
    expect(quote.price).toBe(6717.28)
  })

  it('옵션 없이 지수를 조회하면 기존대로 upsert (관심종목 warm-up 경로 보존)', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 6717.28,
      currency: 'KRW',
      exchange: 'KSC',
      shortName: 'KOSPI Composite Index',
      marketState: 'CLOSED',
      regularMarketTime: KR_CLOSE_EPOCH_SEC,
    })

    await fetchQuote('^KS11')

    expect(vi.mocked(prisma.priceCache.upsert)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(prisma.priceCache.upsert).mock.calls[0][0].where).toEqual({ ticker: '^KS11' })
  })

  it('일반 종목은 기존대로 upsert 한다 (하위호환)', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 252.82,
      currency: 'USD',
      exchange: 'NMS',
      shortName: 'Apple Inc.',
      marketState: 'REGULAR',
      regularMarketTime: new Date('2026-09-16T20:00:00Z'),
    })

    await fetchQuote('AAPL')

    expect(vi.mocked(prisma.priceCache.upsert)).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(prisma.priceCache.upsert).mock.calls[0][0]
    expect(arg.where).toEqual({ ticker: 'AAPL' })
  })
})

describe('fetchQuote — marketTime / marketState 매핑 (#499)', () => {
  it('epoch seconds 응답을 Date 로 정규화', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 6717.28,
      currency: 'KRW',
      exchange: 'KSC',
      marketState: 'CLOSED',
      regularMarketTime: KR_CLOSE_EPOCH_SEC,
    })

    const quote = await fetchQuote('^KS11')

    expect(quote.marketTime?.toISOString()).toBe('2026-09-17T06:30:00.000Z')
    expect(quote.marketState).toBe('CLOSED')
  })

  it('Date 응답은 그대로 사용', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 252.82,
      currency: 'USD',
      exchange: 'NMS',
      marketState: 'REGULAR',
      regularMarketTime: new Date('2026-09-16T20:00:00Z'),
    })

    const quote = await fetchQuote('AAPL')

    expect(quote.marketTime?.toISOString()).toBe('2026-09-16T20:00:00.000Z')
  })

  it('regularMarketTime / marketState 가 없으면 null', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 100,
      currency: 'USD',
      exchange: 'NMS',
    })

    const quote = await fetchQuote('AAPL')

    expect(quote.marketTime).toBeNull()
    expect(quote.marketState).toBeNull()
  })
})

// #615: 야후가 준 시간외 값과 시총을 QuoteResult 로 넘긴다 (실측 2026-11-12 NVDA POSTPOST 형태)
describe('fetchQuote — 시간외 · 시총 (#615)', () => {
  it('정규장 뒤 postMarket 값을 extended 로 · marketCap 을 그대로', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 173.73,
      regularMarketChangePercent: 2.92305,
      currency: 'USD',
      exchange: 'NMS',
      shortName: 'NVIDIA Corporation',
      marketState: 'POSTPOST',
      regularMarketTime: new Date('2026-11-11T21:00:00Z'),
      hasPrePostMarketData: true,
      postMarketPrice: 158.78,
      postMarketChange: -14.949997,
      postMarketChangePercent: -8.605306,
      postMarketTime: new Date('2026-11-12T01:00:00Z'),
      marketCap: 4195058188288,
    })
    const q = await fetchQuote('NVDA', { skipCache: true })
    expect(q.extended).toEqual({ session: 'post', price: 158.78, change: -14.949997, changePercent: -8.605306, time: new Date('2026-11-12T01:00:00Z') })
    expect(q.marketCap).toBe(4195058188288)
  })

  it('한국 종목(pre/post 없음)은 extended null', async () => {
    quoteMock.mockResolvedValueOnce({
      regularMarketPrice: 210250, currency: 'KRW', exchange: 'KSC', shortName: 'SamsungElec',
      marketState: 'REGULAR', regularMarketTime: new Date('2026-11-12T01:15:49Z'), hasPrePostMarketData: false,
    })
    const q = await fetchQuote('005930.KS', { skipCache: true })
    expect(q.extended).toBeNull()
    expect(q.marketCap).toBeNull()
  })
})
