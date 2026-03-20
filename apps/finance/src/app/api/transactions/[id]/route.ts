import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
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
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '유효한 JSON 객체가 아닙니다.' }, { status: 400 })
    }
    const errors = validateTransactionInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const amount = body.amount as number
    const description = (body.description as string).trim()
    const categoryId = body.categoryId as string

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }

    // transactedAt 미전달 시 기존값 유지를 위해 사전 조회
    const existing = await prisma.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }

    const transactedAt = body.transactedAt
      ? new Date(body.transactedAt as string)
      : existing.transactedAt

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        amount,
        description,
        categoryId,
        transactedAt,
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
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
      }
      if (error.code === 'P2003') {
        return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
      }
    }
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
    await prisma.transaction.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }
    console.error('[api/transactions/[id]] DELETE 실패:', error)
    return NextResponse.json({ error: '내역 삭제에 실패했습니다.' }, { status: 500 })
  }
}
