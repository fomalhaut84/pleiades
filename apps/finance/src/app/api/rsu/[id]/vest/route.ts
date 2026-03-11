import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcHolding, calcTotalKRW } from '@/lib/trade-utils'

const RSU_TICKER = '035720.KS'
const RSU_DISPLAY_NAME = '카카오'
const RSU_MARKET = 'KR'
const RSU_CURRENCY = 'KRW'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: '유효한 JSON 요청을 보내주세요.' },
        { status: 400 }
      )
    }

    const { vestPrice, autoSell } = body as {
      vestPrice: number
      autoSell: boolean
    }

    // 입력 검증
    if (typeof vestPrice !== 'number' || !Number.isFinite(vestPrice) || vestPrice <= 0) {
      return NextResponse.json(
        { error: '베스팅일 종가는 0보다 큰 숫자여야 합니다.' },
        { status: 400 }
      )
    }
    if (typeof autoSell !== 'boolean') {
      return NextResponse.json(
        { error: 'autoSell은 boolean이어야 합니다.' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      // 스케줄 조회 + 상태 확인
      const schedule = await tx.rSUSchedule.findUnique({ where: { id } })
      if (!schedule) {
        throw new Error('NOT_FOUND')
      }
      if (schedule.status !== 'pending') {
        throw new Error('ALREADY_VESTED')
      }

      // sellShares 정합성 검증
      if (schedule.sellShares != null && (schedule.sellShares < 0 || schedule.sellShares > schedule.shares)) {
        throw new Error('INVALID_SELL_SHARES')
      }

      const accountId = schedule.accountId
      const now = new Date()

      // 1. BUY Trade 생성 (베스팅 = 취득)
      const buyTotalKRW = calcTotalKRW(vestPrice, schedule.shares, RSU_CURRENCY)
      await tx.trade.create({
        data: {
          accountId,
          ticker: RSU_TICKER,
          displayName: RSU_DISPLAY_NAME,
          market: RSU_MARKET,
          type: 'BUY',
          shares: schedule.shares,
          price: vestPrice,
          currency: RSU_CURRENCY,
          totalKRW: buyTotalKRW,
          note: `RSU 베스팅 (${schedule.note ?? ''})`,
          tradedAt: schedule.vestingDate,
        },
      })

      // 2. autoSell이면 SELL Trade 생성
      if (autoSell && schedule.sellShares && schedule.sellShares > 0) {
        const sellTotalKRW = calcTotalKRW(vestPrice, schedule.sellShares, RSU_CURRENCY)
        await tx.trade.create({
          data: {
            accountId,
            ticker: RSU_TICKER,
            displayName: RSU_DISPLAY_NAME,
            market: RSU_MARKET,
            type: 'SELL',
            shares: schedule.sellShares,
            price: vestPrice,
            currency: RSU_CURRENCY,
            totalKRW: sellTotalKRW,
            note: `RSU 베스팅 직후 매도 (${schedule.note ?? ''})`,
            tradedAt: schedule.vestingDate,
          },
        })
      }

      // 3. Holding 재계산
      const allTrades = await tx.trade.findMany({
        where: { accountId, ticker: RSU_TICKER },
        orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, shares: true, price: true, currency: true, fxRate: true },
      })

      const holdingState = recalcHolding(allTrades)

      let holding = null
      if (holdingState.shares > 0) {
        holding = await tx.holding.upsert({
          where: { accountId_ticker: { accountId, ticker: RSU_TICKER } },
          update: {
            shares: holdingState.shares,
            avgPrice: holdingState.avgPrice,
            avgPriceFx: holdingState.avgPriceFx,
            avgFxRate: holdingState.avgFxRate,
          },
          create: {
            accountId,
            ticker: RSU_TICKER,
            displayName: RSU_DISPLAY_NAME,
            market: RSU_MARKET,
            shares: holdingState.shares,
            avgPrice: holdingState.avgPrice,
            currency: RSU_CURRENCY,
            avgPriceFx: holdingState.avgPriceFx,
            avgFxRate: holdingState.avgFxRate,
          },
        })
      } else {
        await tx.holding.deleteMany({
          where: { accountId, ticker: RSU_TICKER },
        })
      }

      // 4. RSUSchedule 상태 업데이트
      const updated = await tx.rSUSchedule.update({
        where: { id },
        data: {
          status: 'vested',
          vestPrice,
          vestedAt: now,
        },
      })

      return { schedule: updated, holding }
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') {
        return NextResponse.json(
          { error: 'RSU 스케줄을 찾을 수 없습니다.' },
          { status: 404 }
        )
      }
      if (error.message === 'ALREADY_VESTED') {
        return NextResponse.json(
          { error: '이미 베스팅 처리된 스케줄입니다.' },
          { status: 400 }
        )
      }
      if (error.message === 'INVALID_SELL_SHARES') {
        return NextResponse.json(
          { error: '매도 수량이 베스팅 수량을 초과합니다.' },
          { status: 400 }
        )
      }
    }
    // Prisma Serializable 충돌 (P2034)
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2034'
    ) {
      return NextResponse.json(
        { error: '동시 요청이 충돌했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 409 }
      )
    }
    console.error('POST /api/rsu/[id]/vest error:', error)
    return NextResponse.json(
      { error: '베스팅 처리에 실패했습니다.' },
      { status: 500 }
    )
  }
}
