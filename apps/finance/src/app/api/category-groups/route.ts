import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/category-groups
 */
export async function GET() {
  try {
    const groups = await prisma.categoryGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { categories: true } } },
    })
    return ok(groups)
  } catch (error) {
    console.error('[api/category-groups] GET 실패:', error)
    return fail('그룹 조회에 실패했습니다.', 500)
  }
}

/**
 * POST /api/category-groups
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return fail('그룹 이름을 입력해주세요.', 400)
    }
    if (name.length > 50) {
      return fail('이름은 50자 이내로 입력해주세요.', 400)
    }

    const icon = typeof body.icon === 'string' ? body.icon.trim() || null : null
    const sortOrder = typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)
      ? body.sortOrder : 0

    const group = await prisma.categoryGroup.create({
      data: { name, icon, sortOrder },
    })

    return ok(group, { status: 201 })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return fail('이미 존재하는 그룹 이름입니다.', 409)
    }
    console.error('[api/category-groups] POST 실패:', error)
    return fail('그룹 생성에 실패했습니다.', 500)
  }
}
