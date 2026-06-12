import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { validateCategoryInput, generateSlug } from '@/lib/category-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type')

    const where: Record<string, unknown> = {}
    if (type === 'expense' || type === 'income' || type === 'transfer') {
      where.type = type
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        group: { select: { id: true, name: true, icon: true } },
        _count: { select: { transactions: true, budgets: true } },
      },
    })

    return NextResponse.json({ categories })
  } catch (error) {
    console.error('GET /api/categories error:', error)
    return NextResponse.json(
      { error: '카테고리를 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }

    const errors = validateCategoryInput(body as Record<string, unknown>)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const { name, type, icon, keywords, sortOrder, groupId } = body as Record<string, unknown>
    const trimmedName = (name as string).trim()

    const cleanedKeywords = Array.isArray(keywords)
      ? Array.from(new Set((keywords as string[]).map((k) => k.trim()).filter(Boolean)))
      : []

    // slug 충돌 시 최대 3회 재시도
    const MAX_SLUG_RETRIES = 3
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      let slug = generateSlug(trimmedName)
      if (!slug) slug = 'cat'
      if (attempt > 0) slug = `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      try {
        const category = await prisma.category.create({
          data: {
            slug,
            name: trimmedName,
            type: type as string,
            icon: typeof icon === 'string' ? (icon.trim() || null) : null,
            keywords: cleanedKeywords,
            sortOrder: typeof sortOrder === 'number' ? Math.round(sortOrder) : 0,
            groupId: typeof groupId === 'string' ? groupId : null,
          },
        })
        return NextResponse.json(category, { status: 201 })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            const target = (error.meta?.target as string[]) ?? []
            if (target.includes('name')) {
              return NextResponse.json({ error: '이미 존재하는 카테고리 이름입니다.' }, { status: 409 })
            }
            // slug 충돌 → 다음 attempt에서 suffix 추가
            if (attempt === MAX_SLUG_RETRIES - 1) {
              return NextResponse.json({ error: '카테고리 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 409 })
            }
            continue
          }
          if (error.code === 'P2003') {
            return NextResponse.json({ error: '존재하지 않는 그룹입니다.' }, { status: 400 })
          }
        }
        throw error
      }
    }

    return NextResponse.json({ error: '카테고리 생성에 실패했습니다.' }, { status: 500 })
  } catch (error) {
    console.error('POST /api/categories error:', error)
    return NextResponse.json(
      { error: '카테고리 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
