import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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
    try { body = await request.json() } catch { return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 }) }

    // parent 검증
    const existing = await prisma.stockOptionVesting.findUnique({ where: { id: vid } })
    if (!existing || existing.stockOptionId !== id) {
      return NextResponse.json({ error: '존재하지 않는 행사 스케줄입니다.' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (typeof body.vestingDate === 'string') data.vestingDate = new Date(body.vestingDate)
    if (typeof body.shares === 'number') data.shares = body.shares
    if (body.note !== undefined) data.note = typeof body.note === 'string' ? body.note.trim() || null : null

    const updated = await prisma.stockOptionVesting.update({ where: { id: vid }, data })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 행사 스케줄입니다.' }, { status: 404 })
    }
    console.error('PUT /api/stock-options/[id]/vestings/[vid] error:', error)
    return NextResponse.json({ error: '행사 스케줄 수정에 실패했습니다.' }, { status: 500 })
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
      return NextResponse.json({ error: '존재하지 않는 행사 스케줄입니다.' }, { status: 404 })
    }

    await prisma.stockOptionVesting.delete({ where: { id: vid } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 행사 스케줄입니다.' }, { status: 404 })
    }
    console.error('DELETE /api/stock-options/[id]/vestings/[vid] error:', error)
    return NextResponse.json({ error: '행사 스케줄 삭제에 실패했습니다.' }, { status: 500 })
  }
}
