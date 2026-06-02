import YahooFinance from 'yahoo-finance2'
import { prisma } from './prisma'
import { normalizeMarket } from './market-hours'

const yahooFinance = new YahooFinance()

const FX_TICKER = 'USDKRW=X'

interface RefreshResult {
  success: number
  failed: number
  failedTickers: string[]
  updatedAt: Date
}

/** 유효한 시세를 가져올 수 없을 때 발생하는 에러 */
export class InvalidTickerError extends Error {
  constructor(ticker: string) {
    super(`유효한 시세를 가져올 수 없습니다: ${ticker}`)
    this.name = 'InvalidTickerError'
  }
}

/** 단일 종목 실시간 시세 조회 결과 */
export interface QuoteResult {
  ticker: string
  displayName: string
  price: number
  currency: string
  market: string
  change: number | null
  changePercent: number | null
}

/**
 * yahoo-finance2로 단일 종목 실시간 시세 조회.
 * 보유 종목이면 PriceCache도 갱신한다.
 */
export async function fetchQuote(ticker: string): Promise<QuoteResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quote: any
  try {
    quote = await yahooFinance.quote(ticker)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('not found') || message.includes('no data') || message.includes('invalid symbol') || message.includes('delisted')) {
      throw new InvalidTickerError(ticker)
    }
    throw error
  }
  const price = Number(quote?.regularMarketPrice)
  if (!Number.isFinite(price)) {
    throw new InvalidTickerError(ticker)
  }

  const change = quote.regularMarketChange != null ? Number(quote.regularMarketChange) : null
  const changePct = quote.regularMarketChangePercent != null ? Number(quote.regularMarketChangePercent) : null
  const currency = quote.currency ?? 'USD'
  // Yahoo의 raw exchange 코드(NCM/NYQ/KSC 등)를 정규화해 저장 — 비교 일관성 보장
  const market = normalizeMarket(quote.exchange ?? '', ticker)
  const displayName = quote.shortName ?? quote.longName ?? ticker

  // PriceCache upsert — 존재하면 갱신, 없으면 생성 (fallback 조회 시 캐시 적재)
  // market은 update 분기에도 포함 — 기존 raw 코드가 신규 정규화 코드로 자연 수렴되도록 보장
  try {
    await prisma.priceCache.upsert({
      where: { ticker },
      update: { price, change, changePercent: changePct, market },
      create: { ticker, displayName, market, currency, price, change, changePercent: changePct },
    })
  } catch (error) {
    console.error(`[price-fetcher] 캐시 갱신 실패 (${ticker}):`, error)
  }

  return { ticker, displayName, price, currency, market, change, changePercent: changePct }
}

/** yahoo-finance2 search API로 종목명 검색 (영문) */
export async function searchYahooByName(
  query: string,
  maxResults = 5
): Promise<{ symbol: string; shortname: string; exchange: string; quoteType: string }[]> {
  try {
    const result = await yahooFinance.search(query, {
      quotesCount: maxResults,
      newsCount: 0,
    })
    return (result.quotes ?? [])
      .filter((q: Record<string, unknown>) => q.isYahooFinance === true)
      .map((q: Record<string, unknown>) => ({
        symbol: (q.symbol as string) ?? '',
        shortname: (q.shortname as string) ?? (q.longname as string) ?? '',
        exchange: (q.exchDisp as string) ?? (q.exchange as string) ?? '',
        quoteType: (q.typeDisp as string) ?? (q.quoteType as string) ?? '',
      }))
  } catch {
    return []
  }
}

let isRefreshing = false

/**
 * DB의 Holding + Watchlist에서 고유 ticker 목록을 가져와
 * yahoo-finance2로 현재가를 조회하고 PriceCache에 upsert한다.
 * 프로세스 전역 mutex로 cron/API 동시 실행 방지.
 */
export async function refreshPrices(): Promise<RefreshResult> {
  if (isRefreshing) {
    console.log('[price-fetcher] 이미 갱신 진행 중, 스킵')
    return { success: 0, failed: 0, failedTickers: [], updatedAt: new Date() }
  }
  isRefreshing = true
  try {
    return await doRefreshPrices()
  } finally {
    isRefreshing = false
  }
}

async function doRefreshPrices(): Promise<RefreshResult> {
  // 1. 보유 종목의 고유 ticker + 메타 정보 조회
  const holdings = await prisma.holding.findMany({
    select: { ticker: true, displayName: true, market: true, currency: true },
    distinct: ['ticker'],
  })

  const tickerMeta = new Map(
    holdings.map((h) => [h.ticker, { displayName: h.displayName, market: h.market, currency: h.currency }])
  )

  // 관심종목 티커 추가 (보유 종목과 중복 시 보유 종목 메타 우선)
  const watchlistItems = await prisma.watchlist.findMany({
    select: { ticker: true, displayName: true, market: true },
  })
  for (const w of watchlistItems) {
    if (!tickerMeta.has(w.ticker)) {
      tickerMeta.set(w.ticker, {
        displayName: w.displayName,
        market: w.market,
        currency: w.market === 'US' ? 'USD' : 'KRW',
      })
    }
  }

  // FX 환율 추가
  tickerMeta.set(FX_TICKER, { displayName: 'USD/KRW', market: 'FX', currency: 'KRW' })

  const tickers = Array.from(tickerMeta.keys())

  // 2. 개별 ticker 조회 (하나 실패해도 나머지 정상 처리)
  let success = 0
  const failedTickers: string[] = []

  for (const ticker of tickers) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quote: any = await yahooFinance.quote(ticker)
      const meta = tickerMeta.get(ticker)!
      const price = Number(quote.regularMarketPrice)
      if (!price || isNaN(price)) {
        console.warn(`[price-fetcher] No valid price for ${ticker}, skipping upsert`)
        failedTickers.push(ticker)
        continue
      }
      const change = quote.regularMarketChange != null ? Number(quote.regularMarketChange) : null
      const changePct = quote.regularMarketChangePercent != null ? Number(quote.regularMarketChangePercent) : null

      const normalizedMarket = normalizeMarket(meta.market, ticker)
      await prisma.priceCache.upsert({
        where: { ticker },
        update: {
          price,
          change,
          changePercent: changePct,
          displayName: meta.displayName,
          market: normalizedMarket,
        },
        create: {
          ticker,
          displayName: meta.displayName,
          market: normalizedMarket,
          price,
          currency: meta.currency,
          change,
          changePercent: changePct,
        },
      })
      success++
    } catch (error) {
      console.error(`[price-fetcher] Failed to fetch ${ticker}:`, error)
      failedTickers.push(ticker)
    }
  }

  const updatedAt = new Date()
  console.log(
    `[price-fetcher] Refreshed ${success}/${tickers.length} tickers` +
    (failedTickers.length > 0 ? ` (failed: ${failedTickers.join(', ')})` : '')
  )

  return { success, failed: failedTickers.length, failedTickers, updatedAt }
}
