import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import AssetsClient from './AssetsClient'
import { formatKRW } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function AssetsPage() {
  const assets = await prisma.asset.findMany({
    orderBy: [{ isLiability: 'asc' }, { owner: 'asc' }, { category: 'asc' }, { name: 'asc' }],
  })

  const totalAssets = assets.filter((a) => !a.isLiability).reduce((s, a) => s + a.value, 0)
  const totalLiabilities = assets.filter((a) => a.isLiability).reduce((s, a) => s + a.value, 0)

  const serialized = assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    owner: a.owner,
    value: a.value,
    isLiability: a.isLiability,
    interestRate: a.interestRate,
    maturityDate: a.maturityDate?.toISOString() ?? null,
    note: a.note,
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header
        title="자산 관리"
        sub={`${assets.length}개 · 자산 ${formatKRW(totalAssets)} · 부채 ${formatKRW(totalLiabilities)}`}
      />

      <div className="mt-5">
        <AssetsClient assets={serialized} />
      </div>
    </div>
  )
}
