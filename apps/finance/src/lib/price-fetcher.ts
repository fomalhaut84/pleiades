import YahooFinance from 'yahoo-finance2'
import { prisma } from './prisma'

const yahooFinance = new YahooFinance()

const FX_TICKER = 'USDKRW=X'

interface RefreshResult {
  success: number
  failed: number
  failedTickers: string[]
  updatedAt: Date
}

let isRefreshing = false

/**
 * DB의 Holding에서 고유 ticker 목록을 가져와
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

      await prisma.priceCache.upsert({
        where: { ticker },
        update: {
          price,
          change,
          changePercent: changePct,
          displayName: meta.displayName,
        },
        create: {
          ticker,
          displayName: meta.displayName,
          market: meta.market,
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
