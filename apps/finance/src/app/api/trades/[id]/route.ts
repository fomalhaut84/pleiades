import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcHolding, validateTradedAt, validateFxRateForUSD } from '@/lib/trade-utils'
import { businessErrorResponse, isSafeBusinessError } from '@/lib/api-errors'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface HoldingSnapshot {
  shares: number
  avgPrice: number
  avgPriceFx: number | null
  avgFxRate: number | null
}

/**
 * 거래의 계좌+종목에 대해 남은 전체 거래로 Holding을 재계산한다.
 * 갱신된 holding 스냅샷을 반환한다 (전량 매도 시 null).
 */
async function recalcHoldingFromTrades(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  accountId: string,
  ticker: string,
  displayName: string,
  market: string,
  currency: string
): Promise<HoldingSnapshot | null> {
  const remainingTrades = await tx.trade.findMany({
    where: { accountId, ticker },
    orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
    select: { type: true, shares: true, price: true, currency: true, fxRate: true },
  })

  const holdingState = recalcHolding(remainingTrades)

  if (holdingState.shares > 0) {
    const upserted = await tx.holding.upsert({
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
    return {
      shares: upserted.shares,
      avgPrice: upserted.avgPrice,
      avgPriceFx: upserted.avgPriceFx,
      avgFxRate: upserted.avgFxRate,
    }
  }

  await tx.holding.deleteMany({ where: { accountId, ticker } })
  return null
}

export async function PUT(request: NextRequest, props: RouteParams) {
  const params = await props.params;
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
    if (fxRate !== undefined && trade.currency === 'USD') {
      const fxError = validateFxRateForUSD(fxRate)
      if (fxError) return NextResponse.json({ error: fxError }, { status: 400 })
    }
    if (tradedAt !== undefined) {
      if (typeof tradedAt !== 'string') {
        return NextResponse.json({ error: '유효한 거래일을 입력해주세요.' }, { status: 400 })
      }
      const tradedAtError = validateTradedAt(tradedAt)
      if (tradedAtError) {
        return NextResponse.json({ error: tradedAtError }, { status: 400 })
      }
    }

    const updatedShares = shares ?? trade.shares
    const updatedPrice = price ?? trade.price
    const updatedFxRate = fxRate !== undefined ? fxRate : trade.fxRate

    // USD는 최종 fxRate가 항상 양수 보장 — stored 값이 손상되었을 때 silent 0 차단
    if (trade.currency === 'USD') {
      const fxError = validateFxRateForUSD(updatedFxRate)
      if (fxError) return NextResponse.json({ error: fxError }, { status: 400 })
    }

    const updatedTotalKRW = trade.currency === 'USD'
      ? Math.round(updatedPrice * updatedShares * (updatedFxRate as number))
      : Math.round(updatedPrice * updatedShares)

    const result = await prisma.$transaction(async (tx) => {
      const priorHolding = await tx.holding.findUnique({
        where: { accountId_ticker: { accountId: trade.accountId, ticker: trade.ticker } },
      })
      const holdingBefore = priorHolding
        ? {
            shares: priorHolding.shares,
            avgPrice: priorHolding.avgPrice,
            avgPriceFx: priorHolding.avgPriceFx,
            avgFxRate: priorHolding.avgFxRate,
          }
        : null

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

      const holding = await recalcHoldingFromTrades(
        tx, trade.accountId, trade.ticker,
        trade.displayName, trade.market, trade.currency
      )

      return { trade: updated, holding, holdingBefore }
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json(result)
  } catch (error) {
    const businessResponse = businessErrorResponse(error)
    if (businessResponse) return businessResponse
    console.error('PUT /api/trades/[id] error:', error)
    return NextResponse.json({ error: '거래 수정에 실패했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, props: RouteParams) {
  const params = await props.params;
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

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (isSafeBusinessError(error) && error.message.startsWith('보유 수량 부족')) {
      return NextResponse.json({ error: '이 거래를 삭제하면 보유 수량이 음수가 됩니다.' }, { status: 400 })
    }
    console.error('DELETE /api/trades/[id] error:', error)
    return NextResponse.json({ error: '거래 삭제에 실패했습니다.' }, { status: 500 })
  }
}
