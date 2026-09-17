import YahooFinance from 'yahoo-finance2'
import { prisma } from './prisma'
import { normalizeMarket } from './market-hours'
import { collectStrategyRefreshTickers } from './custom-strategy/evaluator'
import { mergeCrossTickersIntoMeta, normalizeMarketTime, resolveRefreshMeta } from './price-fetcher-utils'
export { mergeCrossTickersIntoMeta } from './price-fetcher-utils'

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
  /** 시세가 찍힌 시각 (야후 `regularMarketTime`). 해석 불가 시 null (#499) */
  marketTime: Date | null
  /** 장 상태 (야후 `marketState`: REGULAR/CLOSED/PRE/POST/…). 없으면 null (#499) */
  marketState: string | null
}

/** `fetchQuote` 옵션 */
export interface FetchQuoteOptions {
  signal?: AbortSignal
  /**
   * PriceCache 적재 생략 (#499). 기본 false — 기존 호출자 (관심종목 warm-up 등) 동작 보존.
   *
   * 호출자가 stale 캐시를 원치 않는 조회 (예: MCP get_prices 의 지수 조회) 에서 켠다.
   * (전역으로 `^` 를 막으면 관심종목에 지수를 등록한 경우 GET 이 PriceCache 만 읽어
   *  시세가 비는 회귀가 생긴다 — 사전 리뷰 P1.)
   */
  skipCache?: boolean
}

/**
 * yahoo-finance2로 단일 종목 실시간 시세 조회.
 * `skipCache` 를 켜지 않으면 PriceCache도 갱신한다.
 */
export async function fetchQuote(ticker: string, options?: FetchQuoteOptions): Promise<QuoteResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quote: any
  try {
    // yahoo-finance2 는 3번째 인자 moduleOptions.fetchOptions.signal 로 AbortSignal 지원.
    // signal 전달 시 abort 후 fetch 가 중단되어 process 안에서 hang 방지.
    quote = await yahooFinance.quote(
      ticker,
      {},
      options?.signal ? { fetchOptions: { signal: options.signal } } : {},
    )
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
  // #499: 시세 기준 시각/장 상태 — 반환값이 언제 기준인지 판별 가능하게 함께 전달
  const marketTime = normalizeMarketTime(quote.regularMarketTime)
  const marketState = typeof quote.marketState === 'string' ? quote.marketState : null

  // PriceCache upsert — 존재하면 갱신, 없으면 생성 (fallback 조회 시 캐시 적재)
  // market은 update 분기에도 포함 — 기존 raw 코드가 신규 정규화 코드로 자연 수렴되도록 보장
  //
  // #499: `skipCache` 호출자 (get_prices 의 지수 조회) 는 적재하지 않는다. 지수는 주가 갱신
  // cron 의 refresh 대상이 아니라서 캐시에 넣으면 영구 stale 행이 되고, 실시간 실패 시
  // fallback 이 오래된 값을 조용히 반환한다. 미적재 → fallback 미스 → '조회 실패' 로 정직하게 표시.
  if (!options?.skipCache) {
    try {
      await prisma.priceCache.upsert({
        where: { ticker },
        update: { price, change, changePercent: changePct, market },
        create: { ticker, displayName, market, currency, price, change, changePercent: changePct },
      })
    } catch (error) {
      console.error(`[price-fetcher] 캐시 갱신 실패 (${ticker}):`, error)
    }
  }

  return {
    ticker,
    displayName,
    price,
    currency,
    market,
    change,
    changePercent: changePct,
    marketTime,
    marketState,
  }
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

  // Phase 34-B follow-up (Codex #428 P2): 크로스-티커 조건이 참조하는 벤치마크
  // (SPY / VIX 등) 를 관심종목 등록 없이도 PriceCache 에 유지. 커스텀 전략 활성화된
  // 것만 대상. 메타는 mergeCrossTickersIntoMeta 로 placeholder 삽입 → upsert 시점에
  // quote.exchange 로 market 이 정확 값으로 자연 갱신.
  // Codex #501 P2 (#499): 전략 자기 티커도 포함 — checkCustomStrategies 가 PriceCache 에서
  // 읽으므로 보유·관심종목이 아닌 티커(지수 ^DJI 등)의 전략이 stale 로 평가되지 않게.
  const activeStrategies = await prisma.customStrategy.findMany({
    where: { isActive: true },
    select: { ticker: true, conditions: true },
  })
  mergeCrossTickersIntoMeta(tickerMeta, collectStrategyRefreshTickers(activeStrategies))

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

      // Codex #501 P2: placeholder 메타 (전략 전용 지수 등) 는 quote 메타로 대체.
      // currency 는 update 에도 포함 — 과거 placeholder 로 잘못 생성된 행이 자연 교정되도록.
      const resolved = resolveRefreshMeta(meta, quote, ticker)
      await prisma.priceCache.upsert({
        where: { ticker },
        update: {
          price,
          change,
          changePercent: changePct,
          displayName: resolved.displayName,
          market: resolved.market,
          currency: resolved.currency,
        },
        create: {
          ticker,
          displayName: resolved.displayName,
          market: resolved.market,
          price,
          currency: resolved.currency,
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
