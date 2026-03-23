import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/category-groups/[id]
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

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: '그룹 이름을 입력해주세요.' }, { status: 400 })
      if (name.length > 50) return NextResponse.json({ error: '이름은 50자 이내로 입력해주세요.' }, { status: 400 })
      data.name = name
    }
    if (body.icon !== undefined) {
      data.icon = typeof body.icon === 'string' ? body.icon.trim() || null : null
    }
    if (typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)) {
      data.sortOrder = body.sortOrder
    }

    const group = await prisma.categoryGroup.update({
      where: { id },
      data,
    })

    return NextResponse.json(group)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return NextResponse.json({ error: '존재하지 않는 그룹입니다.' }, { status: 404 })
      if (error.code === 'P2002') return NextResponse.json({ error: '이미 존재하는 그룹 이름입니다.' }, { status: 409 })
    }
    console.error('[api/category-groups/[id]] PUT 실패:', error)
    return NextResponse.json({ error: '그룹 수정에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE /api/category-groups/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const [catCount, budgetCount] = await Promise.all([
      prisma.category.count({ where: { groupId: id } }),
      prisma.budget.count({ where: { groupId: id } }),
    ])
    if (catCount > 0 || budgetCount > 0) {
      const parts: string[] = []
      if (catCount > 0) parts.push(`${catCount}개의 카테고리`)
      if (budgetCount > 0) parts.push(`${budgetCount}개의 예산`)
      return NextResponse.json({ error: `${parts.join(', ')}이 연결되어 삭제할 수 없습니다.` }, { status: 400 })
    }

    await prisma.categoryGroup.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 그룹입니다.' }, { status: 404 })
    }
    console.error('[api/category-groups/[id]] DELETE 실패:', error)
    return NextResponse.json({ error: '그룹 삭제에 실패했습니다.' }, { status: 500 })
  }
}
