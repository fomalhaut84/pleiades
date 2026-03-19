import Header from '@/components/layout/Header'
import ExpensesClient from './ExpensesClient'

export const dynamic = 'force-dynamic'

async function fetchInitialData() {
  const currentYear = new Date().getFullYear()
  const { prisma } = await import('@/lib/prisma')

  const dateFrom = new Date(Date.UTC(currentYear, 0, 1))
  const dateTo = new Date(Date.UTC(currentYear + 1, 0, 1))
  const dateRange = { gte: dateFrom, lt: dateTo }

  const allCategories = await prisma.category.findMany({
    select: { id: true, name: true, icon: true, type: true },
  })
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]))

  const [transactions, total, annualTransactions, categoryAgg] = await Promise.all([
    prisma.transaction.findMany({
      where: { transactedAt: dateRange },
      orderBy: [{ transactedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      include: {
        category: { select: { name: true, icon: true, type: true } },
      },
    }),
    prisma.transaction.count({
      where: { transactedAt: dateRange },
    }),
    prisma.transaction.findMany({
      where: { transactedAt: dateRange },
      select: { amount: true, transactedAt: true, categoryId: true },
    }),
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { transactedAt: dateRange },
      _sum: { amount: true },
      _count: true,
    }),
  ])

  // byMonth
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    expense: 0,
    income: 0,
  }))

  for (const tx of annualTransactions) {
    const m = tx.transactedAt.getUTCMonth()
    const cat = categoryMap.get(tx.categoryId)
    if (!cat) continue
    if (cat.type === 'expense') {
      byMonth[m].expense += tx.amount
    } else {
      byMonth[m].income += tx.amount
    }
  }

  // summary + byCategory
  let totalExpense = 0
  let totalIncome = 0
  let filteredCount = 0

  const byCategory = categoryAgg
    .map((row) => {
      const cat = categoryMap.get(row.categoryId)
      if (!cat) return null
      const amount = row._sum.amount ?? 0
      if (cat.type === 'expense') totalExpense += amount
      else totalIncome += amount
      filteredCount += row._count
      return {
        categoryId: row.categoryId,
        categoryName: cat.name,
        icon: cat.icon,
        type: cat.type as 'expense' | 'income',
        total: amount,
        count: row._count,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.total - a.total)

  const serialized = transactions.map((tx) => ({
    id: tx.id,
    amount: tx.amount,
    description: tx.description,
    categoryId: tx.categoryId,
    categoryName: tx.category.name,
    categoryIcon: tx.category.icon,
    categoryType: tx.category.type as 'expense' | 'income',
    transactedAt: tx.transactedAt.toISOString(),
    currency: 'KRW' as const,
  }))

  return {
    transactions: serialized,
    total,
    offset: 0,
    limit: 20,
    summary: {
      totalExpense,
      totalIncome,
      net: totalIncome - totalExpense,
      count: filteredCount,
    },
    byMonth,
    byCategory,
    year: currentYear,
  }
}

export default async function ExpensesPage() {
  const initialData = await fetchInitialData()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1100px]">
      <Header title="가계부" sub={`${initialData.year}년 거래 ${initialData.summary.count}건`} />

      <div className="mt-5">
        <ExpensesClient initialData={initialData} />
      </div>
    </div>
  )
}
