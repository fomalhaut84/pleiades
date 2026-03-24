import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/whooing/mappings — 카테고리-후잉 매핑 조회
 */
export async function GET() {
  try {
    const mappings = await prisma.whooingCategoryMap.findMany({
      include: { category: { select: { name: true, icon: true } } },
    })
    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('[api/settings/whooing/mappings] GET 실패:', error)
    return NextResponse.json({ error: '매핑 조회에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * PUT /api/settings/whooing/mappings — 매핑 일괄 저장
 * Body: { mappings: [{ categoryId, whooingLeft, whooingRight? }] }
 */
export async function PUT(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 }) }

    if (!Array.isArray(body.mappings)) {
      return NextResponse.json({ error: 'mappings 배열이 필요합니다.' }, { status: 400 })
    }

    const mappings = body.mappings as { categoryId: string; whooingLeft: string; whooingRight?: string }[]

    // 트랜잭션: 전체 교체
    await prisma.$transaction(async (tx) => {
      await tx.whooingCategoryMap.deleteMany()
      for (const m of mappings) {
        if (!m.categoryId || !m.whooingLeft) continue
        await tx.whooingCategoryMap.create({
          data: {
            categoryId: m.categoryId,
            whooingLeft: m.whooingLeft.trim(),
            whooingRight: m.whooingRight?.trim() || null,
          },
        })
      }
    })

    const updated = await prisma.whooingCategoryMap.findMany({
      include: { category: { select: { name: true, icon: true } } },
    })

    return NextResponse.json({ mappings: updated })
  } catch (error) {
    console.error('[api/settings/whooing/mappings] PUT 실패:', error)
    return NextResponse.json({ error: '매핑 저장에 실패했습니다.' }, { status: 500 })
  }
}
