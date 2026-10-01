import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ok, fail, noContent } from '@/lib/api-response'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/stock-options/[id]
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return fail('유효한 JSON 형식이 아닙니다.', 400) }

    const data: Record<string, unknown> = {}
    if (typeof body.ticker === 'string') data.ticker = body.ticker.trim()
    if (typeof body.displayName === 'string') data.displayName = body.displayName.trim()
    if (typeof body.grantDate === 'string') data.grantDate = new Date(body.grantDate)
    if (typeof body.expiryDate === 'string') data.expiryDate = new Date(body.expiryDate)
    if (typeof body.strikePrice === 'number') data.strikePrice = body.strikePrice
    if (typeof body.totalShares === 'number') data.totalShares = body.totalShares
    if (typeof body.cancelledShares === 'number') data.cancelledShares = body.cancelledShares
    if (typeof body.adjustedShares === 'number') data.adjustedShares = body.adjustedShares
    if (body.note !== undefined) data.note = typeof body.note === 'string' ? body.note.trim() || null : null

    // remainingShares 재계산 (0 포함하므로 !== undefined 체크)
    if (data.totalShares !== undefined || data.cancelledShares !== undefined || data.adjustedShares !== undefined) {
      const existing = await prisma.stockOption.findUnique({ where: { id } })
      if (!existing) return fail('존재하지 않는 스톡옵션입니다.', 404)
      const total = (data.totalShares as number | undefined) ?? existing.totalShares
      const cancelled = (data.cancelledShares as number | undefined) ?? existing.cancelledShares
      const exercised = existing.exercisedShares
      const adjusted = (data.adjustedShares as number | undefined) ?? existing.adjustedShares
      data.remainingShares = total - cancelled - exercised - adjusted
    }

    const updated = await prisma.stockOption.update({
      where: { id },
      data,
      include: { vestings: { orderBy: { vestingDate: 'asc' } }, account: { select: { name: true } } },
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 스톡옵션입니다.', 404)
    }
    console.error('PUT /api/stock-options/[id] error:', error)
    return fail('스톡옵션 수정에 실패했습니다.', 500)
  }
}

/**
 * DELETE /api/stock-options/[id] — vestings도 cascade 삭제
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    await prisma.$transaction(async (tx) => {
      await tx.stockOptionVesting.deleteMany({ where: { stockOptionId: id } })
      await tx.stockOption.delete({ where: { id } })
    })
    return noContent()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 스톡옵션입니다.', 404)
    }
    console.error('DELETE /api/stock-options/[id] error:', error)
    return fail('스톡옵션 삭제에 실패했습니다.', 500)
  }
}
