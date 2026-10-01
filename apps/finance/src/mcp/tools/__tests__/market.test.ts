/**
 * #499 회귀 — get_prices 출력의 지수 포인트 표기 + 시세 기준 시각.
 *
 * 1) 지수 (^KS11) 가 "6,717원" 처럼 통화로 표기되면 안 된다.
 * 2) 반환값이 언제 기준인지 (marketTime/marketState) 출력에 드러나야 한다.
 * 3) marketTime 이 없으면 거짓 시각을 만들지 않고 표기를 생략한다.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    priceCache: { findUnique: vi.fn(), findMany: vi.fn() },
    holding: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/price-fetcher', () => ({ fetchQuote: vi.fn() }))

import { getPrices } from '../market'
import { fetchQuote } from '@/lib/price-fetcher'
import { prisma } from '@/lib/prisma'

// 2026-09-17 15:30 KST = 2026-09-17 06:30 UTC (한국장 마감)
const KR_CLOSE = new Date('2026-09-17T06:30:00Z')

function kospiQuote(overrides: Record<string, unknown> = {}) {
  return {
    ticker: '^KS11',
    displayName: 'KOSPI Composite Index',
    price: 6717.28,
    currency: 'KRW',
    market: 'KR',
    change: -12.3,
    changePercent: -0.18,
    marketTime: KR_CLOSE,
    marketState: 'CLOSED',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(fetchQuote).mockReset()
  vi.mocked(prisma.priceCache.findUnique).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getPrices — 지수 티커 표기 (#499)', () => {
  it('지수는 원화가 아니라 포인트로 표기', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce(kospiQuote())

    const result = await getPrices({ tickers: ['^KS11'] })
    const text = result.content[0].text

    expect(text).toContain('6,717.28')
    expect(text).not.toContain('원')
    expect(text).not.toContain('$')
  })

  it('시세 기준 시각 + 장 상태 라벨을 표기', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce(kospiQuote())

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('시세 기준: 2026-09-17 15:30 KST (마감)')
    // 호출 시각 라인은 별개 의미로 유지
    expect(text).toContain('조회 시각:')
  })

  it('작년 시세 시각 (거래정지 등) 은 연도가 드러나 올해 값으로 오인되지 않음 (Codex #501 P2)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T06:40:00Z'))
    vi.mocked(fetchQuote).mockResolvedValueOnce(
      kospiQuote({ marketTime: new Date('2025-05-01T06:30:00Z'), marketState: 'CLOSED' }),
    )

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('시세 기준: 2025-05-01 15:30 KST (마감)')
    expect(text).not.toContain('시세 기준: 05-01')
  })

  it('marketTime 이 없으면 시세 기준 라인을 생략', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce(
      kospiQuote({ marketTime: null, marketState: null }),
    )

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).not.toContain('시세 기준')
    expect(text).toContain('조회 시각:')
  })

  it('기준 시각이 종목별로 다르면 라인별로 표기', async () => {
    vi.mocked(fetchQuote)
      .mockResolvedValueOnce(kospiQuote())
      .mockResolvedValueOnce({
        ticker: 'AAPL',
        displayName: 'Apple Inc.',
        price: 252.82,
        currency: 'USD',
        market: 'US',
        change: 1.1,
        changePercent: 0.44,
        marketTime: new Date('2026-09-16T20:00:00Z'), // 09-17 05:00 KST
        marketState: 'REGULAR',
      })

    const text = (await getPrices({ tickers: ['^KS11', 'AAPL'] })).content[0].text

    expect(text).toContain('· 시세 기준 2026-09-17 15:30 KST (마감)')
    expect(text).toContain('· 시세 기준 2026-09-17 05:00 KST (장중)')
    expect(text).not.toContain('\n시세 기준:')
    expect(text).toContain('$252.82')
  })

  it('지수 실시간 실패 + 캐시 미스 → 조회 실패 (stale 캐시 유입 없음)', async () => {
    vi.mocked(fetchQuote).mockRejectedValueOnce(new Error('network'))
    vi.mocked(prisma.priceCache.findUnique).mockResolvedValueOnce(null)

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('^KS11: 조회 실패')
  })
})

describe('getPrices — 캐시 fallback 가드 (#499 사전 리뷰 P1)', () => {
  it('지수는 잔존 캐시 행이 있어도 읽지 않고 조회 실패', async () => {
    vi.mocked(fetchQuote).mockRejectedValueOnce(new Error('network'))
    // 구버전이 적재해 둔 stale 행이 남아 있는 상황
    vi.mocked(prisma.priceCache.findUnique).mockResolvedValueOnce({
      ticker: '^KS11',
      displayName: 'KOSPI Composite Index',
      price: 3200.11,
      currency: 'KRW',
      market: 'KR',
      change: null,
      changePercent: null,
      updatedAt: new Date('2026-05-01T06:30:00Z'),
    } as never)

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('^KS11: 조회 실패')
    expect(text).not.toContain('[캐시')
    expect(text).not.toContain('3,200.11')
    expect(vi.mocked(prisma.priceCache.findUnique)).not.toHaveBeenCalled()
  })

  it('일반 종목 캐시 fallback 은 기록 시각을 KST 로 표기', async () => {
    vi.mocked(fetchQuote).mockRejectedValueOnce(new Error('network'))
    vi.mocked(prisma.priceCache.findUnique).mockResolvedValueOnce({
      ticker: 'AAPL',
      displayName: 'Apple Inc.',
      price: 252.82,
      currency: 'USD',
      market: 'US',
      change: null,
      changePercent: null,
      updatedAt: new Date('2026-09-17T06:30:00Z'),
    } as never)

    const text = (await getPrices({ tickers: ['AAPL'] })).content[0].text

    expect(text).toContain('[캐시 2026-09-17 15:30 KST 기록]')
  })

  it('1년 넘게 갱신되지 않은 캐시 행은 연도가 드러나 최근 값으로 오인되지 않음 (사전 리뷰 P1)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T06:40:00Z'))
    vi.mocked(fetchQuote).mockRejectedValueOnce(new Error('network'))
    vi.mocked(prisma.priceCache.findUnique).mockResolvedValueOnce({
      ticker: 'TSLA',
      displayName: 'Tesla, Inc.',
      price: 180.5,
      currency: 'USD',
      market: 'US',
      change: null,
      changePercent: null,
      // 보유·관심종목이 아닌 일회성 조회 행은 cron refresh 대상이 아니라 영구 stale 가능
      updatedAt: new Date('2025-05-01T03:00:00Z'),
    } as never)

    const text = (await getPrices({ tickers: ['TSLA'] })).content[0].text

    expect(text).toContain('[캐시 2025-05-01 12:00 KST 기록]')
    expect(text).not.toContain('[캐시 05-01 12:00 KST 기록]')
  })
})

describe('getPrices — 지수 조회는 캐시에 적재하지 않음 (#499 사전 리뷰 P1)', () => {
  it('fetchQuote 에 skipCache 를 티커별로 전달', async () => {
    vi.mocked(fetchQuote)
      .mockResolvedValueOnce(kospiQuote())
      .mockResolvedValueOnce(kospiQuote({ ticker: 'AAPL', displayName: 'Apple Inc.', currency: 'USD' }))

    await getPrices({ tickers: ['^KS11', 'AAPL'] })

    expect(vi.mocked(fetchQuote).mock.calls[0]).toEqual(['^KS11', { skipCache: true }])
    expect(vi.mocked(fetchQuote).mock.calls[1]).toEqual(['AAPL', { skipCache: false }])
  })
})

describe('getPrices — 조회 시각 KST (#499 사전 리뷰 P1)', () => {
  it('미국장 클로징 시각 (전날 UTC) 에도 KST 날짜로 표기', async () => {
    // 2026-09-17 22:15 UTC = 2026-09-18 07:15 KST (미국장 클로징 cron)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T22:15:00Z'))
    vi.mocked(fetchQuote).mockResolvedValueOnce(kospiQuote({ marketTime: null, marketState: null }))

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('조회 시각: 09-18 07:15 KST')
    expect(text).not.toContain('2026.09.17')
  })
})

describe('getPrices — 보유종목 전체 분기 갱신 시각 KST (#499)', () => {
  it('PriceCache updatedAt 을 KST 로 표기 (UTC 날짜 밀림 없음)', async () => {
    vi.mocked(prisma.holding.findMany).mockResolvedValueOnce([{ ticker: 'AAPL' }] as never)
    vi.mocked(prisma.priceCache.findMany).mockResolvedValueOnce([
      {
        ticker: 'AAPL',
        displayName: 'Apple Inc.',
        price: 252.82,
        currency: 'USD',
        market: 'US',
        change: 1.2,
        changePercent: 0.48,
        // 2026-09-17 22:15 UTC = 2026-09-18 07:15 KST
        updatedAt: new Date('2026-09-17T22:15:00Z'),
      },
    ] as never)

    const text = (await getPrices({})).content[0].text

    expect(text).toContain('갱신: 2026-09-18 07:15 KST')
    expect(text).not.toContain('2026.09.17')
  })
})

describe('getPrices — 장 상태 라벨 시장별 분기 (#500)', () => {
  it('미국 종목의 POST 는 애프터마켓이 진행 중이므로 (시간외)', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce({
      ticker: 'AAPL',
      displayName: 'Apple Inc.',
      price: 252.82,
      currency: 'USD',
      market: 'US',
      change: 1.1,
      changePercent: 0.44,
      marketTime: new Date('2026-09-16T20:00:00Z'),
      marketState: 'POST',
    })

    const text = (await getPrices({ tickers: ['AAPL'] })).content[0].text

    expect(text).toContain('(시간외)')
    expect(text).not.toContain('장 마감 후')
  })

  it('POSTPOST 도 미국 종목이면 (시간외) — raw exchange 코드는 정규화 누락 시 방어층', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce({
      ticker: 'AAPL',
      displayName: 'Apple Inc.',
      price: 252.82,
      currency: 'USD',
      // 현재 호출부는 정규화된 'US' 를 넘긴다. 호출부가 야후 raw 코드를 넘기도록
      // 바뀌어도 라벨이 조용히 틀리지 않는지 확인하는 방어층 테스트.
      market: 'NMS',
      change: null,
      changePercent: null,
      marketTime: new Date('2026-09-17T01:00:00Z'),
      marketState: 'POSTPOST',
    })

    const text = (await getPrices({ tickers: ['AAPL'] })).content[0].text

    expect(text).toContain('(시간외)')
  })

  it('한국 종목의 POST 는 마감 후 거래가 없으므로 (장 마감 후)', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce(kospiQuote({ marketState: 'POST' }))

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('(장 마감 후)')
    expect(text).not.toContain('시간외')
  })

  it('market 이 미지정이면 기본 라벨 (장 마감 후)', async () => {
    vi.mocked(fetchQuote).mockResolvedValueOnce(kospiQuote({ market: '', marketState: 'POST' }))

    const text = (await getPrices({ tickers: ['^KS11'] })).content[0].text

    expect(text).toContain('(장 마감 후)')
  })

  it('PRE 계열은 시장과 무관하게 동일 라벨', async () => {
    vi.mocked(fetchQuote)
      .mockResolvedValueOnce(kospiQuote({ marketState: 'PREPRE' }))
      .mockResolvedValueOnce(
        kospiQuote({
          ticker: 'AAPL',
          displayName: 'Apple Inc.',
          currency: 'USD',
          market: 'US',
          marketTime: new Date('2026-09-16T20:00:00Z'),
          marketState: 'PREPRE',
        }),
      )

    const text = (await getPrices({ tickers: ['^KS11', 'AAPL'] })).content[0].text

    expect(text.match(/\(장 시작 전\)/g)).toHaveLength(2)
  })
})
