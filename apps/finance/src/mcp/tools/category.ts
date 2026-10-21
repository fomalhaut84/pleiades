import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { CATEGORY_TYPES, generateSlug } from '@/lib/category-utils'
import { toolResult, toolError } from '../utils'

const TYPE_LABELS: Record<string, string> = {
  expense: '소비',
  income: '수입',
  transfer: '이체',
}

/**
 * create_category: 카테고리 생성
 */
export async function createCategory(args: {
  name: string
  type: string
  icon?: string
  keywords?: string[]
}) {
  try {
    const name = args.name?.trim()
    if (!name) return toolError('카테고리 이름을 입력해주세요.')
    if (name.length > 50) return toolError('이름은 50자 이내로 입력해주세요.')
    if (!(CATEGORY_TYPES as readonly string[]).includes(args.type)) {
      return toolError(`유효한 유형: ${CATEGORY_TYPES.join(', ')}`)
    }

    const slug = generateSlug(name)
    if (!slug) return toolError('유효한 이름을 입력해주세요.')

    const category = await prisma.category.create({
      data: {
        slug,
        name,
        type: args.type,
        icon: args.icon?.trim() || null,
        keywords: args.keywords?.map((k) => k.trim()).filter(Boolean) ?? [],
      },
    })

    const typeLabel = TYPE_LABELS[category.type] ?? category.type
    return toolResult(
      `✅ 카테고리 생성: ${category.icon ? category.icon + ' ' : ''}${category.name} (${typeLabel})\n` +
      `- slug: ${category.slug}` +
      (category.keywords.length > 0 ? `\n- 키워드: ${category.keywords.join(', ')}` : '')
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[]) ?? []
      if (target.includes('slug')) return toolError('유사한 이름의 카테고리가 이미 존재합니다. 다른 이름을 사용해주세요.')
      return toolError('이미 존재하는 카테고리 이름입니다.')
    }
    return toolError(error)
  }
}

/**
 * update_category: 카테고리 부분 수정 (name으로 식별)
 */
export async function updateCategory(args: {
  name: string
  newName?: string
  type?: string
  icon?: string | null
  keywords?: string[]
}) {
  try {
    const name = args.name?.trim()
    if (!name) return toolError('대상 카테고리 이름이 필요합니다.')

    const candidates = await prisma.category.findMany({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: { _count: { select: { transactions: true, budgets: true } } },
    })
    if (candidates.length === 0) return toolError(`카테고리를 찾을 수 없습니다: ${name}`)
    // 다중 매칭 시 정확한 대소문자 매칭으로 좁히기
    let existing = candidates[0]
    if (candidates.length > 1) {
      const exact = candidates.find((c) => c.name === name)
      if (!exact) {
        const names = candidates.map((c) => `"${c.name}"`).join(', ')
        return toolError(`여러 카테고리가 매칭됩니다: ${names}. 정확한 이름을 지정해주세요.`)
      }
      existing = exact
    }

    if (args.type !== undefined && !(CATEGORY_TYPES as readonly string[]).includes(args.type)) {
      return toolError(`유효한 유형: ${CATEGORY_TYPES.join(', ')}`)
    }

    const data: Record<string, unknown> = {}
    if (args.newName !== undefined) {
      const trimmed = args.newName.trim()
      if (!trimmed || trimmed.length > 50) return toolError('이름은 1~50자여야 합니다.')
      data.name = trimmed
    }
    if (args.type !== undefined) {
      data.type = args.type
      // 그룹은 expense 전용 — expense 외 타입으로 변경 시 groupId 초기화
      if (args.type !== 'expense') data.groupId = null
    }
    if (args.icon !== undefined) data.icon = args.icon === null ? null : args.icon.trim() || null
    if (args.keywords !== undefined) data.keywords = args.keywords.map((k) => k.trim()).filter(Boolean)

    if (Object.keys(data).length === 0) return toolError('변경할 필드가 없습니다.')

    // 타입 변경 시 Serializable 트랜잭션으로 연결 데이터 재확인
    const isTypeChange = args.type !== undefined && args.type !== existing.type
    let updated
    if (isTypeChange) {
      updated = await prisma.$transaction(async (tx) => {
        const fresh = await tx.category.findUnique({
          where: { id: existing.id },
          include: { _count: { select: { transactions: true, budgets: true } } },
        })
        if (!fresh) throw new Error('NOT_FOUND')
        if (fresh._count.transactions > 0 || fresh._count.budgets > 0) {
          throw new Error('HAS_LINKED_DATA')
        }
        return tx.category.update({ where: { id: existing.id }, data })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } else {
      updated = await prisma.category.update({ where: { id: existing.id }, data })
    }

    const typeLabel = TYPE_LABELS[updated.type] ?? updated.type
    return toolResult(
      `✅ 카테고리 수정: ${updated.icon ? updated.icon + ' ' : ''}${updated.name} (${typeLabel})`
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return toolError('카테고리를 찾을 수 없습니다.')
    if (error instanceof Error && error.message === 'HAS_LINKED_DATA') return toolError('거래 또는 예산이 연결된 카테고리의 유형은 변경할 수 없습니다.')
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return toolError('이미 존재하는 카테고리 이름입니다.')
    return toolError(error)
  }
}

/**
 * delete_category: 카테고리 삭제 (name으로 식별, 연결 데이터 있으면 거부)
 */
export async function deleteCategory(args: { name: string }) {
  try {
    const name = args.name?.trim()
    if (!name) return toolError('카테고리 이름이 필요합니다.')

    const candidates = await prisma.category.findMany({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: { _count: { select: { transactions: true, budgets: true } } },
    })
    if (candidates.length === 0) return toolError(`카테고리를 찾을 수 없습니다: ${name}`)
    // 다중 매칭 시 정확한 대소문자 매칭으로 좁히기
    let existing = candidates[0]
    if (candidates.length > 1) {
      const exact = candidates.find((c) => c.name === name)
      if (!exact) {
        const names = candidates.map((c) => `"${c.name}"`).join(', ')
        return toolError(`여러 카테고리가 매칭됩니다: ${names}. 정확한 이름을 지정해주세요.`)
      }
      existing = exact
    }

    if (existing._count.transactions > 0) {
      return toolError(`${existing._count.transactions}건의 거래가 연결되어 삭제할 수 없습니다.`)
    }
    if (existing._count.budgets > 0) {
      return toolError(`${existing._count.budgets}건의 예산이 연결되어 삭제할 수 없습니다.`)
    }

    await prisma.category.delete({ where: { id: existing.id } })
    return toolResult(`🗑️ 카테고리 삭제: ${existing.icon ? existing.icon + ' ' : ''}${existing.name}`)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return toolError('연결된 데이터(반복거래, 후잉 매핑 등)가 있어 삭제할 수 없습니다.')
    }
    return toolError(error)
  }
}
