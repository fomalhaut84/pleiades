import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import CategoryClient from '@/components/category/CategoryClient'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { transactions: true, budgets: true } },
    },
  })

  const expenseCount = categories.filter((c) => c.type === 'expense').length
  const incomeCount = categories.filter((c) => c.type === 'income').length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header
        title="카테고리 관리"
        sub={`소비 ${expenseCount}개 · 수입 ${incomeCount}개`}
      />

      <div className="mt-5">
        <CategoryClient categories={categories} />
      </div>
    </div>
  )
}
