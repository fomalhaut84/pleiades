import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { fail, noContent } from '@/lib/api-response'

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
    return noContent()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 예산입니다.', 404)
    }
    console.error('[api/budgets/[id]] DELETE 실패:', error)
    return fail('예산 삭제에 실패했습니다.', 500)
  }
}
