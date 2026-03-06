import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcHolding } from '@/lib/trade-utils'

interface RouteParams {
  params: { id: string }
}

/**
 * 거래의 계좌+종목에 대해 남은 전체 거래로 Holding을 재계산한다.
 */
async function recalcHoldingFromTrades(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  accountId: string,
  ticker: string,
  displayName: string,
  market: string,
  currency: string
) {
  const remainingTrades = await tx.trade.findMany({
    where: { accountId, ticker },
    orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
    select: { type: true, shares: true, price: true, currency: true, fxRate: true },
  })

  const holdingState = recalcHolding(remainingTrades)

  if (holdingState.shares > 0) {
    await tx.holding.upsert({
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
    await tx.holding.deleteMany({ where: { accountId, ticker } })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } })
    if (!trade) {
      return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 })
    }

    const body = await request.json()
    const { shares, price, fxRate, note, tradedAt } = body

    if (shares !== undefined && (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0 || !Number.isInteger(shares))) {
      return NextResponse.json({ error: '수량은 1 이상의 정수여야 합니다.' }, { status: 400 })
    }
    if (price !== undefined && (typeof price !== 'number' || !Number.isFinite(price) || price <= 0)) {
      return NextResponse.json({ error: '단가는 0보다 큰 숫자여야 합니다.' }, { status: 400 })
    }
    if (fxRate !== undefined && trade.currency === 'USD' && (typeof fxRate !== 'number' || !Number.isFinite(fxRate) || fxRate <= 0)) {
      return NextResponse.json({ error: 'USD 종목은 유효한 환율이 필요합니다.' }, { status: 400 })
    }
    if (tradedAt !== undefined && (typeof tradedAt !== 'string' || isNaN(Date.parse(tradedAt)))) {
      return NextResponse.json({ error: '유효한 거래일을 입력해주세요.' }, { status: 400 })
    }

    const updatedShares = shares ?? trade.shares
    const updatedPrice = price ?? trade.price
    const updatedFxRate = fxRate !== undefined ? fxRate : trade.fxRate
    const updatedTotalKRW = trade.currency === 'USD'
      ? Math.round(updatedPrice * updatedShares * (updatedFxRate ?? 0))
      : Math.round(updatedPrice * updatedShares)

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.trade.update({
        where: { id: params.id },
        data: {
          shares: updatedShares,
          price: updatedPrice,
          fxRate: updatedFxRate,
          totalKRW: updatedTotalKRW,
          note: note !== undefined ? (note || null) : trade.note,
          tradedAt: tradedAt ? new Date(tradedAt) : trade.tradedAt,
        },
      })

      await recalcHoldingFromTrades(
        tx, trade.accountId, trade.ticker,
        trade.displayName, trade.market, trade.currency
      )

      return updated
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('보유 수량 부족')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('PUT /api/trades/[id] error:', error)
    return NextResponse.json({ error: '거래 수정에 실패했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } })
    if (!trade) {
      return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.trade.delete({ where: { id: params.id } })

      await recalcHoldingFromTrades(
        tx, trade.accountId, trade.ticker,
        trade.displayName, trade.market, trade.currency
      )
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('보유 수량 부족')) {
      return NextResponse.json({ error: '이 거래를 삭제하면 보유 수량이 음수가 됩니다.' }, { status: 400 })
    }
    console.error('DELETE /api/trades/[id] error:', error)
    return NextResponse.json({ error: '거래 삭제에 실패했습니다.' }, { status: 500 })
  }
}
