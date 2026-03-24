import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    return NextResponse.json({ items: serialized })
  } catch (error) {
    console.error('[api/watchlist] GET 실패:', error)
    return NextResponse.json({ error: '관심종목 조회에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/watchlist — 관심종목 추가
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 }) }

    const ticker = typeof body.ticker === 'string' ? body.ticker.trim() : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const market = typeof body.market === 'string' ? body.market.trim() : ''

    if (!ticker) return NextResponse.json({ error: '종목 티커를 입력해주세요.' }, { status: 400 })
    if (!displayName) return NextResponse.json({ error: '종목명을 입력해주세요.' }, { status: 400 })

    const validMarkets = ['US', 'KR']
    if (!validMarkets.includes(market)) return NextResponse.json({ error: '시장은 US 또는 KR만 허용됩니다.' }, { status: 400 })

    const validStrategies = ['swing', 'momentum', 'value', 'scalp']
    const strategy = typeof body.strategy === 'string' && validStrategies.includes(body.strategy) ? body.strategy : 'swing'

    const targetBuy = typeof body.targetBuy === 'number' && body.targetBuy > 0 ? body.targetBuy : null
    const entryLow = typeof body.entryLow === 'number' && body.entryLow > 0 ? body.entryLow : null
    const entryHigh = typeof body.entryHigh === 'number' && body.entryHigh > 0 ? body.entryHigh : null

    if (entryLow !== null && entryHigh !== null && entryLow > entryHigh) {
      return NextResponse.json({ error: '매수 구간 하한은 상한보다 작아야 합니다.' }, { status: 400 })
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

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: '이미 등록된 종목입니다.' }, { status: 409 })
    }
    console.error('[api/watchlist] POST 실패:', error)
    return NextResponse.json({ error: '관심종목 추가에 실패했습니다.' }, { status: 500 })
  }
}
