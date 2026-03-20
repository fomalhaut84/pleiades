import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateTransactionInput } from '@/lib/transaction-utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/transactions/[id]
 *
 * Body: { amount: number, description: string, categoryId: string, transactedAt?: string }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()
    const errors = validateTransactionInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const existing = await prisma.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }

    const category = await prisma.category.findUnique({
      where: { id: body.categoryId },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        amount: body.amount,
        description: body.description.trim(),
        categoryId: body.categoryId,
        transactedAt: body.transactedAt ? new Date(body.transactedAt) : existing.transactedAt,
      },
      include: {
        category: { select: { name: true, icon: true, type: true } },
      },
    })

    return NextResponse.json({
      id: updated.id,
      amount: updated.amount,
      description: updated.description,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      categoryIcon: updated.category.icon,
      categoryType: updated.category.type,
      transactedAt: updated.transactedAt.toISOString(),
      currency: 'KRW',
    })
  } catch (error) {
    console.error('[api/transactions/[id]] PUT 실패:', error)
    return NextResponse.json({ error: '내역 수정에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE /api/transactions/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const existing = await prisma.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }

    await prisma.transaction.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[api/transactions/[id]] DELETE 실패:', error)
    return NextResponse.json({ error: '내역 삭제에 실패했습니다.' }, { status: 500 })
  }
}
