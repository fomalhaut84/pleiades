import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/stock-options/[id]/vestings — 행사 스케줄 추가
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: stockOptionId } = await params
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 }) }

    if (!body.vestingDate || typeof body.vestingDate !== 'string') {
      return NextResponse.json({ error: '행사가능일을 입력해주세요.' }, { status: 400 })
    }
    if (typeof body.shares !== 'number' || !Number.isInteger(body.shares) || body.shares <= 0) {
      return NextResponse.json({ error: '수량은 1 이상의 정수여야 합니다.' }, { status: 400 })
    }

    const vesting = await prisma.stockOptionVesting.create({
      data: {
        stockOptionId,
        vestingDate: new Date(body.vestingDate as string),
        shares: body.shares as number,
        note: typeof body.note === 'string' ? body.note.trim() || null : null,
      },
    })

    return NextResponse.json(vesting, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: '존재하지 않는 스톡옵션입니다.' }, { status: 400 })
    }
    console.error('POST /api/stock-options/[id]/vestings error:', error)
    return NextResponse.json({ error: '행사 스케줄 추가에 실패했습니다.' }, { status: 500 })
  }
}
