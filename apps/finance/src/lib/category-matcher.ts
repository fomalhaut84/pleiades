/**
 * 키워드 기반 카테고리 자동 매칭.
 * Category.keywords 배열에서 description과 부분 일치를 검색한다.
 */

import { prisma } from './prisma'

export interface MatchedCategory {
  id: string
  name: string
  icon: string | null
  type: string
  count?: number
}

/**
 * description에 매칭되는 카테고리를 찾는다.
 *
 * 매칭 로직:
 * 1. 해당 type의 모든 카테고리를 조회
 * 2. 각 카테고리의 keywords 배열에서 description에 포함된 키워드 검색
 * 3. 매칭된 카테고리 목록 반환 (중복 제거)
 *
 * @returns 매칭된 카테고리 배열 (0개 = 미매칭)
 */
export async function matchCategory(
  description: string,
  type: 'expense' | 'income'
): Promise<MatchedCategory[]> {
  const categories = await prisma.category.findMany({
    where: { type },
    select: { id: true, name: true, icon: true, type: true, keywords: true },
    orderBy: { sortOrder: 'asc' },
  })

  const lowerDesc = description.toLowerCase()
  const matched: MatchedCategory[] = []

  for (const cat of categories) {
    const isMatch = cat.keywords.some((keyword) =>
      lowerDesc.includes(keyword.toLowerCase())
    )
    if (isMatch) {
      matched.push({ id: cat.id, name: cat.name, icon: cat.icon, type: cat.type })
    }
  }

  return matched
}

const MAX_HISTORY_SUGGESTIONS = 5

/**
 * 과거 거래 히스토리 기반 카테고리 추천.
 * 최근 6개월 거래에서 description 유사도(ILIKE) → categoryId별 count 순 정렬.
 */
export async function suggestByHistory(
  description: string,
  type?: 'expense' | 'income',
  excludeIds?: string[]
): Promise<MatchedCategory[]> {
  const trimmed = description.trim().slice(0, 100)
  if (trimmed.length < 2) return []

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const historyRows = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      description: { contains: trimmed, mode: 'insensitive' },
      transactedAt: { gte: sixMonthsAgo },
      ...(type ? { category: { type } } : {}),
    },
    _count: { categoryId: true },
    orderBy: { _count: { categoryId: 'desc' } },
    take: MAX_HISTORY_SUGGESTIONS * 3,
  })

  const excludeSet = new Set(excludeIds ?? [])
  const categoryIds = historyRows
    .filter((r) => !excludeSet.has(r.categoryId))
    .map((r) => r.categoryId)

  if (categoryIds.length === 0) return []

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, icon: true, type: true },
  })

  const catMap = new Map(categories.map((c) => [c.id, c]))

  return historyRows
    .filter((r) => !excludeSet.has(r.categoryId) && catMap.has(r.categoryId))
    .slice(0, MAX_HISTORY_SUGGESTIONS)
    .map((r) => {
      const cat = catMap.get(r.categoryId)!
      return { id: cat.id, name: cat.name, icon: cat.icon, type: cat.type, count: r._count.categoryId }
    })
}

/**
 * 해당 type의 모든 카테고리를 반환한다 (InlineKeyboard 선택용).
 */
export async function getAllCategories(
  type: 'expense' | 'income'
): Promise<MatchedCategory[]> {
  const categories = await prisma.category.findMany({
    where: { type },
    select: { id: true, name: true, icon: true, type: true },
    orderBy: { sortOrder: 'asc' },
  })

  return categories
}
