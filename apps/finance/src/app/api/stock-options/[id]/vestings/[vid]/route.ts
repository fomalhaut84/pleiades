import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ok, fail, noContent } from '@/lib/api-response'

interface RouteParams {
  params: Promise<{ id: string; vid: string }>
}

/**
 * PUT /api/stock-options/[id]/vestings/[vid]
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, vid } = await params
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return fail('유효한 JSON 형식이 아닙니다.', 400) }

    // parent 검증
    const existing = await prisma.stockOptionVesting.findUnique({ where: { id: vid } })
    if (!existing || existing.stockOptionId !== id) {
      return fail('존재하지 않는 행사 스케줄입니다.', 404)
    }

    const data: Record<string, unknown> = {}
    if (typeof body.vestingDate === 'string') data.vestingDate = new Date(body.vestingDate)
    if (typeof body.shares === 'number') data.shares = body.shares
    if (body.note !== undefined) data.note = typeof body.note === 'string' ? body.note.trim() || null : null

    const updated = await prisma.stockOptionVesting.update({ where: { id: vid }, data })
    return ok(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 행사 스케줄입니다.', 404)
    }
    console.error('PUT /api/stock-options/[id]/vestings/[vid] error:', error)
    return fail('행사 스케줄 수정에 실패했습니다.', 500)
  }
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['exercisable'],
  exercisable: ['exercised', 'expired'],
}

/**
 * PATCH /api/stock-options/[id]/vestings/[vid] — 베스팅 상태 변경
 * Body: { status: "exercisable" | "exercised" | "expired" }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, vid } = await params

    let body: Record<string, unknown>
    try { body = await request.json() } catch { return fail('유효한 JSON 형식이 아닙니다.', 400) }

    const newStatus = body.status
    if (typeof newStatus !== 'string') {
      return fail('status를 지정해주세요.', 400)
    }

    const vesting = await prisma.stockOptionVesting.findUnique({ where: { id: vid } })
    if (!vesting || vesting.stockOptionId !== id) {
      return fail('베스팅을 찾을 수 없습니다.', 404)
    }

    const allowed = ALLOWED_TRANSITIONS[vesting.status]
    if (!allowed || !allowed.includes(newStatus)) {
      return fail(`'${vesting.status}' → '${newStatus}' 전환은 허용되지 않습니다.`, 400)
    }

    // pending → exercisable: 베스팅일 도래 검증 (KST 일 단위)
    if (vesting.status === 'pending' && newStatus === 'exercisable') {
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
      const todayEnd = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1))
      if (vesting.vestingDate >= todayEnd) {
        return fail('베스팅일이 아직 도래하지 않았습니다.', 400)
      }
    }

    if (newStatus === 'exercised') {
      const updated = await prisma.$transaction(async (tx) => {
        // 트랜잭션 내부에서 최신 상태 + shares 재조회 (동시 수정 방지)
        const fresh = await tx.stockOptionVesting.findUniqueOrThrow({ where: { id: vid } })
        if (fresh.status !== 'exercisable') {
          throw new Error('ALREADY_PROCESSED')
        }
        await tx.stockOptionVesting.update({
          where: { id: vid },
          data: { status: 'exercised', exercisedAt: new Date() },
        })
        await tx.stockOption.update({
          where: { id },
          data: {
            exercisedShares: { increment: fresh.shares },
            remainingShares: { decrement: fresh.shares },
          },
        })
        return tx.stockOptionVesting.findUniqueOrThrow({ where: { id: vid } })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      return ok(updated)
    }

    // 기타 상태 전환도 조건부 업데이트
    const result = await prisma.stockOptionVesting.updateMany({
      where: { id: vid, status: vesting.status },
      data: { status: newStatus },
    })
    if (result.count === 0) {
      return fail('이미 처리된 요청입니다.', 409)
    }
    const updated = await prisma.stockOptionVesting.findUniqueOrThrow({ where: { id: vid } })
    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_PROCESSED') {
      return fail('이미 처리된 요청입니다.', 409)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return fail('동시 요청이 감지되었습니다. 다시 시도해주세요.', 409)
    }
    console.error('PATCH /api/stock-options/[id]/vestings/[vid] error:', error)
    return fail('상태 변경에 실패했습니다.', 500)
  }
}

/**
 * DELETE /api/stock-options/[id]/vestings/[vid]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, vid } = await params

    // parent 검증
    const existing = await prisma.stockOptionVesting.findUnique({ where: { id: vid } })
    if (!existing || existing.stockOptionId !== id) {
      return fail('존재하지 않는 행사 스케줄입니다.', 404)
    }

    await prisma.stockOptionVesting.delete({ where: { id: vid } })
    return noContent()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 행사 스케줄입니다.', 404)
    }
    console.error('DELETE /api/stock-options/[id]/vestings/[vid] error:', error)
    return fail('행사 스케줄 삭제에 실패했습니다.', 500)
  }
}
