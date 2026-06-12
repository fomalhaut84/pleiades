import { NextRequest, NextResponse } from 'next/server'
import { matchCategory, suggestByHistory } from '@/lib/category-matcher'

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
 * 2. 과거 거래 히스토리 (suggestByHistory 재사용)
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

    // 2. 히스토리 매칭 (단일 쿼리 — type optional)
    const excludeIds = keywordSuggestions.map((s) => s.categoryId)
    const historyMatches = await suggestByHistory(
      q,
      types.length === 1 ? types[0] : undefined,
      excludeIds
    )

    const historySuggestions: Suggestion[] = historyMatches.map((m) => ({
        categoryId: m.id,
        categoryName: m.name,
        categoryIcon: m.icon,
        source: 'history' as const,
        count: m.count,
      }))

    const suggestions = [...keywordSuggestions, ...historySuggestions].slice(0, MAX_SUGGESTIONS)

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('[suggest] error:', error)
    return NextResponse.json({ error: '추천 조회에 실패했습니다.' }, { status: 500 })
  }
}
