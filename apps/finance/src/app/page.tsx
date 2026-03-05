import { prisma } from '@/lib/prisma'
import { calcCostKRW } from '@/lib/format'
import Header from '@/components/layout/Header'
import FamilyTotalCard from '@/components/dashboard/FamilyTotalCard'
import AccountSummaryCard from '@/components/dashboard/AccountSummaryCard'

export default async function DashboardPage() {
  const accounts = await prisma.account.findMany({
    include: {
      holdings: { orderBy: { avgPrice: 'desc' } },
      _count: { select: { holdings: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const accountSummaries = accounts.map((account) => {
    const totalKRW = account.holdings.reduce(
      (sum, h) => sum + calcCostKRW(h),
      0
    )
    const usCount = account.holdings.filter((h) => h.market === 'US').length
    const krCount = account.holdings.filter((h) => h.market === 'KR').length

    return {
      id: account.id,
      name: account.name,
      ownerAge: account.ownerAge,
      strategy: account.strategy,
      totalKRW,
      holdingsCount: account._count.holdings,
      usCount,
      krCount,
    }
  })

  return (
    <>
      <Header
        title="대시보드"
        sub="가족 포트폴리오 현황"
        badge="Phase 1 · 매입 데이터 기준"
      />
      <div className="px-8 py-7 max-w-[960px]">
        <FamilyTotalCard
          accounts={accountSummaries.map((a) => ({
            name: a.name,
            totalKRW: a.totalKRW,
            holdingsCount: a.holdingsCount,
          }))}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {accountSummaries.map((account) => (
            <AccountSummaryCard key={account.id} {...account} />
          ))}
        </div>
      </div>
    </>
  )
}
