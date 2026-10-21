/**
 * 카테고리 유틸리티: 입력 검증, 상수
 */

export const CATEGORY_TYPES = ['expense', 'income', 'transfer'] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  expense: '소비',
  income: '수입',
  transfer: '이체',
}

export interface CategoryValidationError {
  field: string
  message: string
}

export function validateCategoryInput(body: Record<string, unknown>): CategoryValidationError[] {
  const errors: CategoryValidationError[] = []

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push({ field: 'name', message: '카테고리 이름을 입력해주세요.' })
  } else if (body.name.trim().length > 50) {
    errors.push({ field: 'name', message: '이름은 50자 이내로 입력해주세요.' })
  }

  if (!body.type || typeof body.type !== 'string' || !(CATEGORY_TYPES as readonly string[]).includes(body.type)) {
    errors.push({ field: 'type', message: '유형을 선택해주세요. (소비, 수입 또는 이체)' })
  }

  if (body.icon !== undefined && body.icon !== null && typeof body.icon !== 'string') {
    errors.push({ field: 'icon', message: '아이콘은 문자열이어야 합니다.' })
  }

  if (body.keywords !== undefined && body.keywords !== null) {
    if (!Array.isArray(body.keywords)) {
      errors.push({ field: 'keywords', message: '키워드는 배열이어야 합니다.' })
    } else if (body.keywords.some((k: unknown) => typeof k !== 'string')) {
      errors.push({ field: 'keywords', message: '키워드는 문자열 배열이어야 합니다.' })
    }
  }

  if (body.sortOrder !== undefined && body.sortOrder !== null) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder)) {
      errors.push({ field: 'sortOrder', message: '정렬 순서는 정수여야 합니다.' })
    } else if (body.sortOrder < 0 || body.sortOrder > 999) {
      errors.push({ field: 'sortOrder', message: '정렬 순서는 0~999 범위여야 합니다.' })
    }
  }

  return errors
}

/**
 * slug 자동 생성: 이름 → 소문자, 공백→하이픈, 특수문자 제거
 */
export function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
