import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validateRecurringInput } from '@/lib/recurring-utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/recurring/[id] — 전체 수정
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '유효한 JSON 객체가 아닙니다.' }, { status: 400 })
    }

    const errors = validateRecurringInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const nextRunAt = body.nextRunAt
      ? new Date(body.nextRunAt as string)
      : undefined

    const item = await prisma.recurringTransaction.update({
      where: { id },
      data: {
        amount: body.amount as number,
        description: (body.description as string).trim(),
        categoryId: body.categoryId as string,
        frequency: body.frequency as string,
        dayOfMonth: typeof body.dayOfMonth === 'number' ? body.dayOfMonth : null,
        dayOfWeek: typeof body.dayOfWeek === 'number' ? body.dayOfWeek : null,
        monthOfYear: typeof body.monthOfYear === 'number' ? body.monthOfYear : null,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    })

    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return NextResponse.json({ error: '존재하지 않는 반복 거래입니다.' }, { status: 404 })
      if (error.code === 'P2003') return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }
    console.error('[api/recurring/[id]] PUT 실패:', error)
    return NextResponse.json({ error: '반복 거래 수정에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * PATCH /api/recurring/[id] — 활성 토글
 * Body: { isActive: boolean }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 })
    }

    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive는 boolean이어야 합니다.' }, { status: 400 })
    }

    const item = await prisma.recurringTransaction.update({
      where: { id },
      data: { isActive: body.isActive },
    })

    return NextResponse.json({ id: item.id, isActive: item.isActive })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 반복 거래입니다.' }, { status: 404 })
    }
    console.error('[api/recurring/[id]] PATCH 실패:', error)
    return NextResponse.json({ error: '상태 변경에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE /api/recurring/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    await prisma.recurringTransaction.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 반복 거래입니다.' }, { status: 404 })
    }
    console.error('[api/recurring/[id]] DELETE 실패:', error)
    return NextResponse.json({ error: '반복 거래 삭제에 실패했습니다.' }, { status: 500 })
  }
}
