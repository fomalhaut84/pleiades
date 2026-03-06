import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcHolding, calcTotalKRW, validateTradeInput } from '@/lib/trade-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const ticker = searchParams.get('ticker')
    const type = searchParams.get('type')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const rawLimit = parseInt(searchParams.get('limit') ?? '50')
    const rawOffset = parseInt(searchParams.get('offset') ?? '0')
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200)
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (ticker) where.ticker = ticker
    if (type && ['BUY', 'SELL'].includes(type)) where.type = type
    if (from || to) {
      const fromDate = from ? Date.parse(from) : NaN
      const toDate = to ? Date.parse(to) : NaN
      where.tradedAt = {}
      if (!isNaN(fromDate)) (where.tradedAt as Record<string, unknown>).gte = new Date(fromDate)
      if (!isNaN(toDate)) {
        // to 날짜의 다음날 00:00 미만으로 설정하여 해당 날짜 장중 거래 포함
        const nextDay = new Date(toDate)
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)
        ;(where.tradedAt as Record<string, unknown>).lt = nextDay
      }
      if (Object.keys(where.tradedAt as object).length === 0) delete where.tradedAt
    }

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: [{ tradedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: { account: { select: { name: true } } },
      }),
      prisma.trade.count({ where }),
    ])

    return NextResponse.json({ trades, total, limit, offset })
  } catch (error) {
    console.error('GET /api/trades error:', error)
    return NextResponse.json(
      { error: '거래 내역을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const errors = validateTradeInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const { accountId, displayName, market, type, shares, price, currency, fxRate, note, tradedAt } = body
    const ticker = (body.ticker as string).toUpperCase().trim()
    const totalKRW = calcTotalKRW(price, shares, currency, fxRate)

    // 계좌 존재 확인
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 기존 거래와 market/currency 일관성 검증
    const existingTrade = await prisma.trade.findFirst({
      where: { accountId, ticker },
      select: { market: true, currency: true },
    })
    if (existingTrade && (existingTrade.market !== market || existingTrade.currency !== currency)) {
      return NextResponse.json(
        { error: `${ticker}은(는) 이미 ${existingTrade.market}/${existingTrade.currency}로 등록되어 있습니다.` },
        { status: 400 }
      )
    }

    // Transaction: Trade 생성 + Holding 업데이트 (SELL 검증도 tx 내부에서)
    const result = await prisma.$transaction(async (tx) => {
      // SELL: 보유수량 확인 (트랜잭션 내부에서 동시성 안전)
      if (type === 'SELL') {
        const holding = await tx.holding.findUnique({
          where: { accountId_ticker: { accountId, ticker } },
        })
        if (!holding || holding.shares < shares) {
          const current = holding?.shares ?? 0
          throw new Error(`보유 수량(${current}주)을 초과합니다.`)
        }
      }

      // 시드 Holding 기준선 보존: 기존 Holding이 있지만 Trade가 없는 경우
      // 기존 보유분을 대표하는 기준선 BUY 거래를 자동 생성
      const existingTradeCount = await tx.trade.count({ where: { accountId, ticker } })
      if (existingTradeCount === 0) {
        const existingHolding = await tx.holding.findUnique({
          where: { accountId_ticker: { accountId, ticker } },
        })
        if (existingHolding && existingHolding.shares > 0) {
          const baselinePrice = existingHolding.currency === 'USD'
            ? (existingHolding.avgPriceFx ?? existingHolding.avgPrice)
            : existingHolding.avgPrice
          const baselineTotalKRW = Math.round(existingHolding.avgPrice * existingHolding.shares)
          await tx.trade.create({
            data: {
              accountId,
              ticker: existingHolding.ticker,
              displayName: existingHolding.displayName,
              market: existingHolding.market,
              type: 'BUY',
              shares: existingHolding.shares,
              price: baselinePrice,
              currency: existingHolding.currency,
              fxRate: existingHolding.avgFxRate,
              totalKRW: baselineTotalKRW,
              note: '시드 데이터 기준선',
              tradedAt: new Date('2024-01-01'),
            },
          })
        }
      }

      const trade = await tx.trade.create({
        data: {
          accountId,
          ticker,
          displayName,
          market,
          type,
          shares,
          price,
          currency,
          fxRate: currency === 'USD' ? fxRate : null,
          totalKRW,
          note: note || null,
          tradedAt: new Date(tradedAt),
        },
      })

      // 해당 계좌+종목의 전체 거래로 Holding 재계산
      const allTrades = await tx.trade.findMany({
        where: { accountId, ticker },
        orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, shares: true, price: true, currency: true, fxRate: true },
      })

      const holdingState = recalcHolding(allTrades)

      let holding = null
      if (holdingState.shares > 0) {
        holding = await tx.holding.upsert({
          where: { accountId_ticker: { accountId, ticker } },
          update: {
            shares: holdingState.shares,
            avgPrice: holdingState.avgPrice,
            avgPriceFx: holdingState.avgPriceFx,
            avgFxRate: holdingState.avgFxRate,
          },
          create: {
            accountId,
            ticker,
            displayName,
            market,
            shares: holdingState.shares,
            avgPrice: holdingState.avgPrice,
            currency,
            avgPriceFx: holdingState.avgPriceFx,
            avgFxRate: holdingState.avgFxRate,
          },
        })
      } else {
        // 전량 매도 → Holding 삭제
        await tx.holding.deleteMany({
          where: { accountId, ticker },
        })
      }

      return { trade, holding }
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message.includes('초과합니다')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof Error && error.message.startsWith('보유 수량 부족')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/trades error:', error)
    return NextResponse.json(
      { error: '거래 기록에 실패했습니다.' },
      { status: 500 }
    )
  }
}
