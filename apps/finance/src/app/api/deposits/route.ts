import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateDepositInput } from '@/lib/deposit-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const year = searchParams.get('year')
    const rawLimit = parseInt(searchParams.get('limit') ?? '50')
    const rawOffset = parseInt(searchParams.get('offset') ?? '0')
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200)
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (year) {
      if (!/^\d{4}$/.test(year)) {
        return NextResponse.json({ error: '유효한 연도를 입력해주세요.' }, { status: 400 })
      }
      const y = parseInt(year)
      where.depositedAt = {
        gte: new Date(`${y}-01-01`),
        lt: new Date(`${y + 1}-01-01`),
      }
    }

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: [{ depositedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: { account: { select: { name: true } } },
      }),
      prisma.deposit.count({ where }),
    ])

    return NextResponse.json({ deposits, total, limit, offset })
  } catch (error) {
    console.error('GET /api/deposits error:', error)
    return NextResponse.json(
      { error: '입금 내역을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }
    const errors = validateDepositInput(body as Record<string, unknown>)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const { accountId, amount, source, note, depositedAt } = body as Record<string, unknown>

    if (note !== undefined && note !== null && typeof note !== 'string') {
      return NextResponse.json({ error: '메모는 문자열이어야 합니다.' }, { status: 400 })
    }

    const account = await prisma.account.findUnique({ where: { id: accountId as string } })
    if (!account) {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const roundedAmount = Math.round(amount as number)
    if (roundedAmount <= 0) {
      return NextResponse.json({ error: '금액은 1원 이상이어야 합니다.' }, { status: 400 })
    }

    const deposit = await prisma.deposit.create({
      data: {
        accountId: accountId as string,
        amount: roundedAmount,
        source: (source as string).trim(),
        note: typeof note === 'string' ? (note.trim() || null) : null,
        depositedAt: new Date(depositedAt as string),
      },
    })

    return NextResponse.json(deposit, { status: 201 })
  } catch (error) {
    console.error('POST /api/deposits error:', error)
    return NextResponse.json(
      { error: '입금 기록에 실패했습니다.' },
      { status: 500 }
    )
  }
}
