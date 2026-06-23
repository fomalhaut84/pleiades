import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const schedules = await prisma.rSUSchedule.findMany({
      orderBy: { vestingDate: 'asc' },
      include: { account: { select: { id: true, name: true } } },
    })

    return ok(schedules)
  } catch (error) {
    console.error('GET /api/rsu error:', error)
    return fail('RSU 스케줄을 불러올 수 없습니다.', 500)
  }
}

/**
 * POST /api/rsu — RSU 스케줄 추가
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }

    if (!body.accountId || typeof body.accountId !== 'string') {
      return fail('계좌를 선택해주세요.', 400)
    }
    if (!body.vestingDate || typeof body.vestingDate !== 'string') {
      return fail('베스팅일을 입력해주세요.', 400)
    }
    if (typeof body.shares !== 'number' || !Number.isInteger(body.shares) || body.shares <= 0) {
      return fail('수량은 1 이상의 정수여야 합니다.', 400)
    }
    if (typeof body.basisValue !== 'number' || body.basisValue < 0) {
      return fail('기준금액은 0 이상이어야 합니다.', 400)
    }

    const shares = body.shares as number
    if (typeof body.sellShares === 'number' && (body.sellShares < 0 || body.sellShares > shares)) {
      return fail('매도 예정 수량은 0 이상, 총 수량 이하여야 합니다.', 400)
    }
    if (typeof body.keepShares === 'number' && (body.keepShares < 0 || body.keepShares > shares)) {
      return fail('보유 예정 수량은 0 이상, 총 수량 이하여야 합니다.', 400)
    }

    const schedule = await prisma.rSUSchedule.create({
      data: {
        accountId: body.accountId as string,
        vestingDate: new Date(body.vestingDate as string),
        shares: body.shares as number,
        basisValue: body.basisValue as number,
        basisDate: body.basisDate ? new Date(body.basisDate as string) : null,
        basisPrice: typeof body.basisPrice === 'number' ? body.basisPrice : null,
        sellShares: typeof body.sellShares === 'number' ? body.sellShares : null,
        keepShares: typeof body.keepShares === 'number' ? body.keepShares : null,
        note: typeof body.note === 'string' ? body.note.trim() || null : null,
      },
      include: { account: { select: { id: true, name: true } } },
    })

    return ok(schedule, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return fail('존재하지 않는 계좌입니다.', 400)
    }
    console.error('POST /api/rsu error:', error)
    return fail('RSU 스케줄 생성에 실패했습니다.', 500)
  }
}
