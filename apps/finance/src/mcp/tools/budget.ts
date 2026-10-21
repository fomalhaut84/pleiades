import { prisma } from '@/lib/prisma'
import { toolResult, toolError, formatMoney } from '../utils'

/** 카테고리명으로 단일 카테고리 매칭 */
async function resolveCategory(name: string) {
  const candidates = await prisma.category.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true, type: true },
  })
  if (candidates.length === 0) return { error: `'${name}' 카테고리를 찾을 수 없습니다.` }
  if (candidates.length === 1) return { category: candidates[0] }
  const exact = candidates.filter((c) => c.name === name)
  if (exact.length !== 1) {
    const names = candidates.map((c) => `"${c.name}"`).join(', ')
    return { error: `여러 카테고리가 매칭됩니다: ${names}. 정확한 이름을 지정해주세요.` }
  }
  return { category: exact[0] }
}

/**
 * list_budgets: 연/월 예산 목록
 */
export async function listBudgets(args: { year?: number; month?: number }) {
  try {
    const where: Record<string, unknown> = {}
    if (args.year != null) where.year = args.year
    if (args.month != null) where.month = args.month

    const budgets = await prisma.budget.findMany({
      where,
      include: { category: { select: { name: true } }, group: { select: { name: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    if (budgets.length === 0) return toolResult('예산이 없습니다.')

    const lines = [`## 예산 목록 (${budgets.length}개)\n`]
    for (const b of budgets) {
      const target = b.category?.name ?? b.group?.name ?? '미분류'
      lines.push(`- ${b.year}.${String(b.month).padStart(2, '0')} | ${target}: ${formatMoney(b.amount, 'KRW')} (id: ${b.id})`)
    }
    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * set_budget: 카테고리별 월 예산 upsert
 */
export async function setBudget(args: {
  categoryName: string
  year: number
  month: number
  amount: number
}) {
  try {
    if (!Number.isInteger(args.year) || args.year < 2000 || args.year > 2100) return toolError('year는 2000~2100 범위여야 합니다.')
    if (!Number.isInteger(args.month) || args.month < 1 || args.month > 12) return toolError('month는 1~12 범위여야 합니다.')
    if (!Number.isFinite(args.amount) || args.amount < 0) return toolError('금액은 0 이상이어야 합니다.')

    const result = await resolveCategory(args.categoryName)
    if ('error' in result) return toolError(result.error)
    if (result.category.type !== 'expense') {
      return toolError(`예산은 지출 카테고리에만 설정 가능합니다. '${result.category.name}'은 ${result.category.type} 카테고리입니다.`)
    }

    const amount = Math.round(args.amount)
    const budget = await prisma.budget.upsert({
      where: { categoryId_year_month: { categoryId: result.category.id, year: args.year, month: args.month } },
      update: { amount },
      create: { categoryId: result.category.id, year: args.year, month: args.month, amount },
    })

    return toolResult(
      `✅ 예산 설정: ${result.category.name} ${args.year}.${String(args.month).padStart(2, '0')} → ${formatMoney(amount, 'KRW')}\n` +
      `- ID: ${budget.id}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_budget: 예산 삭제 (ID 기반)
 */
export async function deleteBudget(args: { id: string }) {
  try {
    const existing = await prisma.budget.findUnique({
      where: { id: args.id },
      include: { category: { select: { name: true } } },
    })
    if (!existing) return toolError(`예산을 찾을 수 없습니다: ${args.id}`)

    await prisma.budget.delete({ where: { id: args.id } })
    return toolResult(
      `🗑️ 예산 삭제: ${existing.category?.name ?? '미분류'} ${existing.year}.${String(existing.month).padStart(2, '0')}`
    )
  } catch (error) {
    return toolError(error)
  }
}
