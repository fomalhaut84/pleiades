import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/rsu/[id] — pending 상태만 수정 가능
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 })
    }

    if (typeof body.shares === 'number' && (!Number.isInteger(body.shares) || body.shares <= 0)) {
      return NextResponse.json({ error: '수량은 1 이상의 정수여야 합니다.' }, { status: 400 })
    }
    if (typeof body.basisValue === 'number' && body.basisValue < 0) {
      return NextResponse.json({ error: '기준금액은 0 이상이어야 합니다.' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (body.vestingDate && typeof body.vestingDate === 'string') data.vestingDate = new Date(body.vestingDate)
    if (typeof body.shares === 'number') data.shares = body.shares
    if (typeof body.basisValue === 'number') data.basisValue = body.basisValue
    if (body.basisDate !== undefined) data.basisDate = body.basisDate ? new Date(body.basisDate as string) : null
    if (body.basisPrice !== undefined) data.basisPrice = typeof body.basisPrice === 'number' ? body.basisPrice : null
    if (body.sellShares !== undefined) data.sellShares = typeof body.sellShares === 'number' ? body.sellShares : null
    if (body.keepShares !== undefined) data.keepShares = typeof body.keepShares === 'number' ? body.keepShares : null
    if (body.note !== undefined) data.note = typeof body.note === 'string' ? body.note.trim() || null : null

    // 트랜잭션: pending 체크 + update 원자적 처리
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.rSUSchedule.findUnique({ where: { id } })
      if (!existing) throw new Error('NOT_FOUND')
      if (existing.status !== 'pending') throw new Error('NOT_PENDING')
      return tx.rSUSchedule.update({
        where: { id },
        data,
        include: { account: { select: { id: true, name: true } } },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return NextResponse.json({ error: '존재하지 않는 RSU 스케줄입니다.' }, { status: 404 })
      if (error.message === 'NOT_PENDING') return NextResponse.json({ error: '베스팅 완료된 스케줄은 수정할 수 없습니다.' }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 RSU 스케줄입니다.' }, { status: 404 })
    }
    console.error('PUT /api/rsu/[id] error:', error)
    return NextResponse.json({ error: 'RSU 스케줄 수정에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE /api/rsu/[id] — pending 상태만 삭제 가능
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // 트랜잭션: pending 체크 + delete 원자적 처리
    await prisma.$transaction(async (tx) => {
      const existing = await tx.rSUSchedule.findUnique({ where: { id } })
      if (!existing) throw new Error('NOT_FOUND')
      if (existing.status !== 'pending') throw new Error('NOT_PENDING')
      await tx.rSUSchedule.delete({ where: { id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return NextResponse.json({ error: '존재하지 않는 RSU 스케줄입니다.' }, { status: 404 })
      if (error.message === 'NOT_PENDING') return NextResponse.json({ error: '베스팅 완료된 스케줄은 삭제할 수 없습니다.' }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 RSU 스케줄입니다.' }, { status: 404 })
    }
    console.error('DELETE /api/rsu/[id] error:', error)
    return NextResponse.json({ error: 'RSU 스케줄 삭제에 실패했습니다.' }, { status: 500 })
  }
}
