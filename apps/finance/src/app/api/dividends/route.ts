import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateDividendInput, calcAmountKRW } from '@/lib/dividend-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const ticker = searchParams.get('ticker')
    const year = searchParams.get('year')
    const rawLimit = parseInt(searchParams.get('limit') ?? '50')
    const rawOffset = parseInt(searchParams.get('offset') ?? '0')
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200)
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (ticker) where.ticker = ticker
    if (year) {
      if (!/^\d{4}$/.test(year)) {
        return NextResponse.json({ error: '유효한 연도를 입력해주세요.' }, { status: 400 })
      }
      const y = parseInt(year)
      where.payDate = {
        gte: new Date(`${y}-01-01`),
        lt: new Date(`${y + 1}-01-01`),
      }
    }

    const [dividends, total] = await Promise.all([
      prisma.dividend.findMany({
        where,
        orderBy: [{ payDate: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: { account: { select: { name: true } } },
      }),
      prisma.dividend.count({ where }),
    ])

    return NextResponse.json({ dividends, total, limit, offset })
  } catch (error) {
    console.error('GET /api/dividends error:', error)
    return NextResponse.json(
      { error: '배당 내역을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const errors = validateDividendInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const { accountId, displayName, exDate, payDate, amountGross, amountNet, taxAmount, currency, fxRate, reinvested } = body
    const ticker = (body.ticker as string).toUpperCase().trim()

    // 옵션 필드 타입 검증
    if (exDate !== undefined && exDate !== null && (typeof exDate !== 'string' || isNaN(Date.parse(exDate)))) {
      return NextResponse.json({ error: '유효한 기준일을 입력해주세요.' }, { status: 400 })
    }
    if (taxAmount !== undefined && taxAmount !== null && (typeof taxAmount !== 'number' || !Number.isFinite(taxAmount) || taxAmount < 0)) {
      return NextResponse.json({ error: '세금은 0 이상이어야 합니다.' }, { status: 400 })
    }
    if (reinvested !== undefined && reinvested !== null && typeof reinvested !== 'boolean') {
      return NextResponse.json({ error: '재투자 여부는 true/false여야 합니다.' }, { status: 400 })
    }

    // 교차 검증
    if (amountNet > amountGross) {
      return NextResponse.json({ error: '세후 금액이 세전 금액을 초과할 수 없습니다.' }, { status: 400 })
    }
    if (taxAmount != null && taxAmount > amountGross) {
      return NextResponse.json({ error: '세금이 세전 금액을 초과할 수 없습니다.' }, { status: 400 })
    }

    // 서버 측 amountKRW 재계산 (클라이언트 값 대신 서버 계산값 사용)
    const serverAmountKRW = calcAmountKRW(amountNet, currency, fxRate)

    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const dividend = await prisma.dividend.create({
      data: {
        accountId,
        ticker,
        displayName,
        exDate: exDate ? new Date(exDate) : null,
        payDate: new Date(payDate),
        amountGross,
        amountNet,
        taxAmount: taxAmount ?? null,
        currency,
        fxRate: currency === 'USD' ? fxRate : null,
        amountKRW: serverAmountKRW,
        reinvested: reinvested ?? false,
      },
    })

    return NextResponse.json(dividend, { status: 201 })
  } catch (error) {
    console.error('POST /api/dividends error:', error)
    return NextResponse.json(
      { error: '배당 기록에 실패했습니다.' },
      { status: 500 }
    )
  }
}
