import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
    return NextResponse.json({ groups })
  } catch (error) {
    console.error('[api/category-groups] GET 실패:', error)
    return NextResponse.json({ error: '그룹 조회에 실패했습니다.' }, { status: 500 })
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
      return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: '그룹 이름을 입력해주세요.' }, { status: 400 })
    }
    if (name.length > 50) {
      return NextResponse.json({ error: '이름은 50자 이내로 입력해주세요.' }, { status: 400 })
    }

    const icon = typeof body.icon === 'string' ? body.icon.trim() || null : null
    const sortOrder = typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)
      ? body.sortOrder : 0

    const group = await prisma.categoryGroup.create({
      data: { name, icon, sortOrder },
    })

    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: '이미 존재하는 그룹 이름입니다.' }, { status: 409 })
    }
    console.error('[api/category-groups] POST 실패:', error)
    return NextResponse.json({ error: '그룹 생성에 실패했습니다.' }, { status: 500 })
  }
}
