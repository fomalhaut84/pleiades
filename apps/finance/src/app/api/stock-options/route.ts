import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stock-options — 스톡옵션 목록 조회
 * Query: accountId (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')

    const where = accountId ? { accountId } : {}

    const stockOptions = await prisma.stockOption.findMany({
      where,
      include: {
        vestings: {
          orderBy: { vestingDate: 'asc' },
        },
        account: {
          select: { name: true },
        },
      },
      orderBy: { grantDate: 'asc' },
    })

    return NextResponse.json({ stockOptions })
  } catch (err) {
    console.error('GET /api/stock-options error:', err)
    return NextResponse.json({ error: '스톡옵션 조회 실패' }, { status: 500 })
  }
}

/**
 * POST /api/stock-options — 스톡옵션 추가
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 }) }

    if (!body.accountId || typeof body.accountId !== 'string') return NextResponse.json({ error: '계좌를 선택해주세요.' }, { status: 400 })
    if (!body.ticker || typeof body.ticker !== 'string') return NextResponse.json({ error: '종목 티커를 입력해주세요.' }, { status: 400 })
    if (!body.displayName || typeof body.displayName !== 'string') return NextResponse.json({ error: '종목명을 입력해주세요.' }, { status: 400 })
    if (!body.grantDate || typeof body.grantDate !== 'string') return NextResponse.json({ error: '부여일을 입력해주세요.' }, { status: 400 })
    if (!body.expiryDate || typeof body.expiryDate !== 'string') return NextResponse.json({ error: '만료일을 입력해주세요.' }, { status: 400 })
    if (typeof body.strikePrice !== 'number' || body.strikePrice < 0) return NextResponse.json({ error: '행사가격은 0 이상이어야 합니다.' }, { status: 400 })
    if (typeof body.totalShares !== 'number' || !Number.isInteger(body.totalShares) || body.totalShares <= 0) return NextResponse.json({ error: '총부여수량은 1 이상의 정수여야 합니다.' }, { status: 400 })

    const option = await prisma.stockOption.create({
      data: {
        accountId: body.accountId as string,
        ticker: (body.ticker as string).trim(),
        displayName: (body.displayName as string).trim(),
        grantDate: new Date(body.grantDate as string),
        expiryDate: new Date(body.expiryDate as string),
        strikePrice: body.strikePrice as number,
        totalShares: body.totalShares as number,
        remainingShares: body.totalShares as number,
        note: typeof body.note === 'string' ? body.note.trim() || null : null,
      },
      include: { vestings: true, account: { select: { name: true } } },
    })

    return NextResponse.json(option, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: '존재하지 않는 계좌입니다.' }, { status: 400 })
    }
    console.error('POST /api/stock-options error:', error)
    return NextResponse.json({ error: '스톡옵션 생성에 실패했습니다.' }, { status: 500 })
  }
}
