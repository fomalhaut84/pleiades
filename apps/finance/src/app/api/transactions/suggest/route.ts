import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchCategory } from '@/lib/category-matcher'

export const dynamic = 'force-dynamic'

interface Suggestion {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  source: 'keyword' | 'history'
  count?: number
}

const MAX_SUGGESTIONS = 5

const VALID_TYPES = new Set(['expense', 'income'])
const MAX_QUERY_LENGTH = 100

/**
 * GET /api/transactions/suggest?q=점심&type=expense
 *
 * description 기반 카테고리 추천.
 * 1. 키워드 매칭 (category-matcher.ts 재사용)
 * 2. 과거 거래 히스토리 (description ILIKE → categoryId별 count)
 * 3. 중복 제거 (keyword 우선), 최대 5개
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const q = sp.get('q')?.trim()?.slice(0, MAX_QUERY_LENGTH)
    if (!q || q.length < 2) {
      return NextResponse.json({ suggestions: [] })
    }

    const rawType = sp.get('type')
    if (rawType && !VALID_TYPES.has(rawType)) {
      return NextResponse.json({ error: 'type은 expense 또는 income이어야 합니다.' }, { status: 400 })
    }
    const types: Array<'expense' | 'income'> =
      rawType ? [rawType as 'expense' | 'income'] : ['expense', 'income']

    // 1. 키워드 매칭
    const keywordMatchResults = await Promise.all(
      types.map((t) => matchCategory(q, t))
    )

    const keywordSuggestions: Suggestion[] = keywordMatchResults.flat().map((m) => ({
      categoryId: m.id,
      categoryName: m.name,
      categoryIcon: m.icon,
      source: 'keyword' as const,
    }))

    // 2. 히스토리 매칭: 최근 6개월 거래에서 description 유사 → categoryId별 count
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const historyRows = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        description: { contains: q, mode: 'insensitive' },
        transactedAt: { gte: sixMonthsAgo },
        ...(types.length === 1 ? { category: { type: types[0] } } : {}),
      },
      _count: { categoryId: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: MAX_SUGGESTIONS * 3,
    })

    const keywordCategoryIds = new Set(keywordSuggestions.map((s) => s.categoryId))

    let historySuggestions: Suggestion[] = []
    if (historyRows.length > 0) {
      const categoryIds = historyRows
        .filter((r) => !keywordCategoryIds.has(r.categoryId))
        .map((r) => r.categoryId)

      if (categoryIds.length > 0) {
        const categories = await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, icon: true },
        })
        const catMap = new Map(categories.map((c) => [c.id, c]))

        historySuggestions = historyRows
          .filter((r) => !keywordCategoryIds.has(r.categoryId))
          .reduce<Suggestion[]>((acc, r) => {
            const cat = catMap.get(r.categoryId)
            if (cat) {
              acc.push({
                categoryId: r.categoryId,
                categoryName: cat.name,
                categoryIcon: cat.icon,
                source: 'history',
                count: r._count.categoryId,
              })
            }
            return acc
          }, [])
      }
    }

    const suggestions = [...keywordSuggestions, ...historySuggestions].slice(0, MAX_SUGGESTIONS)

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('[suggest] error:', error)
    return NextResponse.json({ error: '추천 조회에 실패했습니다.' }, { status: 500 })
  }
}
