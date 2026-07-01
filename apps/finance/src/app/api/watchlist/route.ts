import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'
import { fetchQuote } from '@/lib/price-fetcher'

export const dynamic = 'force-dynamic'

/**
 * GET /api/watchlist — 관심종목 목록 (현재가 포함)
 */
export async function GET() {
  try {
    const items = await prisma.watchlist.findMany({
      orderBy: { addedAt: 'desc' },
    })

    // PriceCache에서 현재가 조회
    const tickers = items.map((i) => i.ticker)
    const prices = tickers.length > 0
      ? await prisma.priceCache.findMany({
          where: { ticker: { in: tickers } },
          select: { ticker: true, price: true },
        })
      : []
    const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

    const serialized = items.map((i) => ({
      ...i,
      currentPrice: priceMap.get(i.ticker) ?? null,
      addedAt: i.addedAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    }))

    return ok(serialized)
  } catch (error) {
    console.error('[api/watchlist] GET 실패:', error)
    return fail('관심종목 조회에 실패했습니다.', 500)
  }
}

/**
 * POST /api/watchlist — 관심종목 추가
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return fail('유효한 JSON 형식이 아닙니다.', 400) }

    const ticker = typeof body.ticker === 'string' ? body.ticker.trim() : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const market = typeof body.market === 'string' ? body.market.trim() : ''

    if (!ticker) return fail('종목 티커를 입력해주세요.', 400)
    if (!displayName) return fail('종목명을 입력해주세요.', 400)

    const validMarkets = ['US', 'KR']
    if (!validMarkets.includes(market)) return fail('시장은 US 또는 KR만 허용됩니다.', 400)

    const validStrategies = ['long_hold', 'swing', 'momentum', 'value', 'scalp']
    const strategy = typeof body.strategy === 'string' && validStrategies.includes(body.strategy) ? body.strategy : 'swing'

    const targetBuy = typeof body.targetBuy === 'number' && body.targetBuy > 0 ? body.targetBuy : null
    const entryLow = typeof body.entryLow === 'number' && body.entryLow > 0 ? body.entryLow : null
    const entryHigh = typeof body.entryHigh === 'number' && body.entryHigh > 0 ? body.entryHigh : null

    if (entryLow !== null && entryHigh !== null && entryLow > entryHigh) {
      return fail('매수 구간 하한은 상한보다 작아야 합니다.', 400)
    }

    const item = await prisma.watchlist.create({
      data: {
        ticker: ticker.toUpperCase(),
        displayName,
        market,
        strategy,
        memo: typeof body.memo === 'string' ? body.memo.trim() || null : null,
        targetBuy,
        entryLow,
        entryHigh,
      },
    })

    // 시세 warm-up — 응답 전 priceCache 채우기 시도 (client refetch race 방지).
    // AbortSignal 로 5s 후 실제 yahoo fetch 를 abort → hang 시 PM2 process 안에서
    // 요청 leak 없음 (Promise.race 만으로는 await 만 멈추고 fetch 는 계속됨).
    const WARM_UP_TIMEOUT_MS = 5000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WARM_UP_TIMEOUT_MS)
    try {
      await fetchQuote(item.ticker, { signal: controller.signal })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // abort 는 정상 timeout — priceCache 는 다음 cron 사이클에서 채워짐
      if (controller.signal.aborted) {
        console.log(`[api/watchlist] warm-up timeout (${item.ticker}) — 배경 fetch 취소 후 응답 진행`)
      } else {
        console.error(`[api/watchlist] warm-up 실패 (${item.ticker}):`, msg)
      }
    } finally {
      clearTimeout(timer)
    }

    return ok(item, { status: 201 })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return fail('이미 등록된 종목입니다.', 409)
    }
    console.error('[api/watchlist] POST 실패:', error)
    return fail('관심종목 추가에 실패했습니다.', 500)
  }
}
