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
