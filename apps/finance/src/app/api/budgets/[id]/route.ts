import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * DELETE /api/budgets/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    await prisma.budget.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 예산입니다.' }, { status: 404 })
    }
    console.error('[api/budgets/[id]] DELETE 실패:', error)
    return NextResponse.json({ error: '예산 삭제에 실패했습니다.' }, { status: 500 })
  }
}
