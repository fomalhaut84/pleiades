import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateTradeInput } from '@/lib/trade-utils'
import { createTrade } from '@/lib/trade-service'

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

    // 계좌 존재 확인
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const result = await createTrade({
      accountId,
      ticker,
      displayName,
      market,
      type,
      shares,
      price,
      currency,
      fxRate,
      note,
      tradedAt: new Date(tradedAt),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('초과합니다') ||
      error.message.startsWith('보유 수량 부족') ||
      error.message.includes('이미')
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/trades error:', error)
    return NextResponse.json(
      { error: '거래 기록에 실패했습니다.' },
      { status: 500 }
    )
  }
}
