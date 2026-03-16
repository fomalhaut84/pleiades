import { prisma } from '@/lib/prisma'
import { toolResult, toolError, formatMoney } from '../utils'

/**
 * get_spending_summary: 월별 소비/수입 요약 (DB 집계)
 */
export async function getSpendingSummary(args: {
  year: number
  month: number
}) {
  try {
    const { year, month } = args
    // UTC 기준 — 기존 API (src/app/api/transactions/route.ts)와 동일
    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate = new Date(Date.UTC(year, month, 1))

    // DB에서 카테고리별 집계
    const grouped = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        transactedAt: { gte: startDate, lt: endDate },
      },
      _sum: { amount: true },
      _count: { id: true },
    })

    if (grouped.length === 0) {
      return toolResult(`${year}년 ${month}월 거래 내역이 없습니다.`)
    }

    // 카테고리 정보 조회
    const categoryIds = grouped.map((g) => g.categoryId)
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, type: true },
    })
    const categoryMap = new Map(categories.map((c) => [c.id, c]))

    const allCategories = grouped.map((g) => ({
      name: categoryMap.get(g.categoryId)?.name ?? '기타',
      type: categoryMap.get(g.categoryId)?.type ?? 'expense',
      total: g._sum.amount ?? 0,
      count: g._count.id,
    }))

    const expenses = allCategories
      .filter((c) => c.type === 'expense')
      .sort((a, b) => b.total - a.total)

    const incomes = allCategories
      .filter((c) => c.type === 'income')
      .sort((a, b) => b.total - a.total)

    const totalExpense = expenses.reduce((s, c) => s + c.total, 0)
    const totalIncome = incomes.reduce((s, c) => s + c.total, 0)

    const lines = [`## ${year}년 ${month}월 소비/수입 요약`]

    if (expenses.length > 0) {
      lines.push(`\n### 소비 (${formatMoney(totalExpense, 'KRW')})`)
      for (const c of expenses) {
        const pct = totalExpense > 0 ? ((c.total / totalExpense) * 100).toFixed(1) : '0.0'
        lines.push(`- ${c.name}: ${formatMoney(c.total, 'KRW')} (${pct}%, ${c.count}건)`)
      }
    }

    if (incomes.length > 0) {
      lines.push(`\n### 수입 (${formatMoney(totalIncome, 'KRW')})`)
      for (const c of incomes) {
        lines.push(`- ${c.name}: ${formatMoney(c.total, 'KRW')} (${c.count}건)`)
      }
    }

    lines.push(`\n**순수입**: ${formatMoney(totalIncome - totalExpense, 'KRW')}`)

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
