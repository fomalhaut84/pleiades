import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ok, fail, noContent } from '@/lib/api-response'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/watchlist/[id]
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return fail('유효한 JSON 형식이 아닙니다.', 400) }

    const data: Record<string, unknown> = {}
    if (typeof body.displayName === 'string') {
      const name = body.displayName.trim()
      if (!name) return fail('종목명을 입력해주세요.', 400)
      data.displayName = name
    }
    if (typeof body.market === 'string') {
      const validMarkets = ['US', 'KR']
      if (!validMarkets.includes(body.market.trim())) return fail('시장은 US 또는 KR만 허용됩니다.', 400)
      data.market = body.market.trim()
    }
    if (typeof body.strategy === 'string') {
      const validStrategies = ['long_hold', 'swing', 'momentum', 'value', 'scalp']
      if (!validStrategies.includes(body.strategy)) return fail('유효한 전략을 선택해주세요.', 400)
      data.strategy = body.strategy
    }
    if (body.memo !== undefined) data.memo = typeof body.memo === 'string' ? body.memo.trim() || null : null
    if (body.targetBuy !== undefined) data.targetBuy = typeof body.targetBuy === 'number' && body.targetBuy > 0 ? body.targetBuy : null
    if (body.entryLow !== undefined) data.entryLow = typeof body.entryLow === 'number' && body.entryLow > 0 ? body.entryLow : null
    if (body.entryHigh !== undefined) data.entryHigh = typeof body.entryHigh === 'number' && body.entryHigh > 0 ? body.entryHigh : null

    // entryLow/High 교차 검증 (둘 다 전달된 경우)
    const low = data.entryLow as number | null | undefined
    const high = data.entryHigh as number | null | undefined
    if (low !== undefined && high !== undefined && low !== null && high !== null && low > high) {
      return fail('매수 구간 하한은 상한보다 작아야 합니다.', 400)
    }

    const updated = await prisma.watchlist.update({ where: { id }, data })
    return ok(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 관심종목입니다.', 404)
    }
    console.error('[api/watchlist/[id]] PUT 실패:', error)
    return fail('관심종목 수정에 실패했습니다.', 500)
  }
}

/**
 * DELETE /api/watchlist/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    await prisma.watchlist.delete({ where: { id } })
    return noContent()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 관심종목입니다.', 404)
    }
    console.error('[api/watchlist/[id]] DELETE 실패:', error)
    return fail('관심종목 삭제에 실패했습니다.', 500)
  }
}
