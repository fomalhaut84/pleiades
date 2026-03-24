import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validateRecurringInput } from '@/lib/recurring-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recurring
 */
export async function GET() {
  try {
    const items = await prisma.recurringTransaction.findMany({
      orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
      include: {
        category: { select: { name: true, icon: true, type: true } },
      },
    })

    const serialized = items.map((r) => ({
      id: r.id,
      amount: r.amount,
      description: r.description,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      categoryIcon: r.category.icon,
      categoryType: r.category.type,
      frequency: r.frequency,
      dayOfMonth: r.dayOfMonth,
      dayOfWeek: r.dayOfWeek,
      monthOfYear: r.monthOfYear,
      isActive: r.isActive,
      nextRunAt: r.nextRunAt.toISOString(),
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ items: serialized })
  } catch (error) {
    console.error('[api/recurring] GET 실패:', error)
    return NextResponse.json({ error: '반복 거래 조회에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/recurring
 */
export async function POST(request: NextRequest) {
  try {
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

    const category = await prisma.category.findUnique({
      where: { id: body.categoryId as string },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }

    const nextRunAt = body.nextRunAt
      ? new Date(body.nextRunAt as string)
      : new Date()

    const item = await prisma.recurringTransaction.create({
      data: {
        amount: body.amount as number,
        description: (body.description as string).trim(),
        categoryId: body.categoryId as string,
        frequency: body.frequency as string,
        dayOfMonth: typeof body.dayOfMonth === 'number' ? body.dayOfMonth : null,
        dayOfWeek: typeof body.dayOfWeek === 'number' ? body.dayOfWeek : null,
        monthOfYear: typeof body.monthOfYear === 'number' ? body.monthOfYear : null,
        nextRunAt,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }
    console.error('[api/recurring] POST 실패:', error)
    return NextResponse.json({ error: '반복 거래 생성에 실패했습니다.' }, { status: 500 })
  }
}
