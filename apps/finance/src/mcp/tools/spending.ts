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

/**
 * get_transactions: 개별 거래 내역 조회 (기간/카테고리/타입 필터)
 */
export async function getTransactions(args: {
  days?: number
  category?: string
  type?: string
}) {
  try {
    const days = Math.min(args.days ?? 7, 365)
    // KST 기준 날짜 경계로 앵커 (자정 기준)
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))

    // 카테고리 ID 후보 수집 (category + type 교집합)
    let categoryIds: string[] | null = null

    if (args.type && ['expense', 'income', 'transfer'].includes(args.type)) {
      const typeCats = await prisma.category.findMany({
        where: { type: args.type },
        select: { id: true },
      })
      categoryIds = typeCats.map((c) => c.id)
    }

    if (args.category) {
      const matched = await prisma.category.findMany({
        where: { name: { contains: args.category, mode: 'insensitive' } },
        select: { id: true },
      })
      if (matched.length === 0) {
        return toolResult(`'${args.category}' 카테고리를 찾을 수 없습니다.`)
      }
      const matchedIds = matched.map((c) => c.id)
      categoryIds = categoryIds
        ? categoryIds.filter((id) => matchedIds.includes(id))
        : matchedIds
    }

    const where: Record<string, unknown> = {
      transactedAt: { gte: since },
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: { select: { name: true, icon: true, type: true } },
      },
      orderBy: [{ transactedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    })

    if (transactions.length === 0) {
      return toolResult(`최근 ${days}일간 해당 조건의 거래 내역이 없습니다.`)
    }

    let totalExpense = 0
    let totalIncome = 0
    for (const tx of transactions) {
      if (tx.category.type === 'expense') totalExpense += tx.amount
      else if (tx.category.type === 'income') totalIncome += tx.amount
    }
    const summaryParts = [`${transactions.length}건`]
    if (totalExpense > 0) summaryParts.push(`소비 ${formatMoney(totalExpense, 'KRW')}`)
    if (totalIncome > 0) summaryParts.push(`수입 ${formatMoney(totalIncome, 'KRW')}`)

    const lines = [`## 거래 내역 (최근 ${days}일, ${summaryParts.join(', ')})\n`]

    for (const tx of transactions) {
      const date = tx.transactedAt.toISOString().slice(0, 10)
      const icon = tx.category.icon ? `${tx.category.icon} ` : ''
      let sign = ''
      if (tx.category.type === 'expense') sign = '-'
      else if (tx.category.type === 'income') sign = '+'
      else if (tx.type === 'transfer_out') sign = '↑'
      else if (tx.type === 'transfer_in') sign = '↓'
      lines.push(`- ${date} | ${icon}${tx.category.name} | ${tx.description} | ${sign}${formatMoney(tx.amount, 'KRW')}`)
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
