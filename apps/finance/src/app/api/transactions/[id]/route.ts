import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validateTransactionInput } from '@/lib/transaction-utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/transactions/[id]
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
    const txType = (body.type as string | null) ?? null
    const linkedAssetId = (body.linkedAssetId as string | null) ?? null

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, type: true },
    })
    if (!category) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }
    if (txType && category.type !== 'transfer') {
      return NextResponse.json({ error: '출금/입금은 이체 카테고리에서만 사용할 수 있습니다.' }, { status: 400 })
    }
    if (!txType && category.type === 'transfer') {
      return NextResponse.json({ error: '이체 카테고리는 출금/입금 유형에서만 사용할 수 있습니다.' }, { status: 400 })
    }

    const existing = await prisma.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }

    const transactedAt = body.transactedAt
      ? new Date(body.transactedAt as string)
      : existing.transactedAt

    // 트랜잭션: 이전 자산 역산 → 업데이트 → 새 자산 적용
    const updated = await prisma.$transaction(async (tx) => {
      // 이전 transfer 효과 역산
      if (existing.linkedAssetId && existing.type) {
        const reverseDelta = existing.type === 'transfer_out' ? existing.amount : -existing.amount
        await tx.asset.update({
          where: { id: existing.linkedAssetId },
          data: { value: { increment: reverseDelta } },
        })
      }

      const result = await tx.transaction.update({
        where: { id },
        data: {
          amount,
          description,
          categoryId,
          transactedAt,
          type: txType,
          linkedAssetId,
        },
        include: {
          category: { select: { name: true, icon: true, type: true } },
          linkedAsset: { select: { id: true, name: true } },
        },
      })

      // 새 transfer 효과 적용
      if (linkedAssetId && txType) {
        const delta = txType === 'transfer_out' ? -amount : amount
        await tx.asset.update({
          where: { id: linkedAssetId },
          data: { value: { increment: delta } },
        })
      }

      return result
    })

    return NextResponse.json({
      id: updated.id,
      amount: updated.amount,
      description: updated.description,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      categoryIcon: updated.category.icon,
      categoryType: updated.category.type,
      type: updated.type,
      linkedAssetId: updated.linkedAssetId,
      linkedAssetName: updated.linkedAsset?.name ?? null,
      transactedAt: updated.transactedAt.toISOString(),
      currency: 'KRW',
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
      if (error.code === 'P2003') return NextResponse.json({ error: '존재하지 않는 카테고리 또는 자산입니다.' }, { status: 400 })
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

    // 트랜잭션: 자산 역산 + 삭제
    await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { id } })
      if (!existing) throw new Error('NOT_FOUND')

      // transfer 효과 역산
      if (existing.linkedAssetId && existing.type) {
        const reverseDelta = existing.type === 'transfer_out' ? existing.amount : -existing.amount
        await tx.asset.update({
          where: { id: existing.linkedAssetId },
          data: { value: { increment: reverseDelta } },
        })
      }

      await tx.transaction.delete({ where: { id } })
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 내역입니다.' }, { status: 404 })
    }
    console.error('[api/transactions/[id]] DELETE 실패:', error)
    return NextResponse.json({ error: '내역 삭제에 실패했습니다.' }, { status: 500 })
  }
}
