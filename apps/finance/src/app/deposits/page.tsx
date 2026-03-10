import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import DepositFilters from '@/components/deposit/DepositFilters'
import DepositTable from '@/components/deposit/DepositTable'

export const dynamic = 'force-dynamic'

interface DepositsPageProps {
  searchParams: {
    accountId?: string | string[]
    year?: string | string[]
    offset?: string | string[]
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function DepositsPage({ searchParams }: DepositsPageProps) {
  const accountId = first(searchParams.accountId)
  const yearStr = first(searchParams.year)
  const rawOffset = parseInt(first(searchParams.offset) ?? '0')
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset
  const limit = 20

  const year = yearStr && /^\d{4}$/.test(yearStr) ? parseInt(yearStr) : undefined

  const where: Record<string, unknown> = {}
  if (accountId) where.accountId = accountId
  if (year) {
    where.depositedAt = {
      gte: new Date(`${year}-01-01`),
      lt: new Date(`${year + 1}-01-01`),
    }
  }

  const [total, accounts] = await Promise.all([
    prisma.deposit.count({ where }),
    prisma.account.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Clamp offset to valid range
  const clampedOffset = total > 0 && offset >= total
    ? Math.max(0, Math.floor((total - 1) / limit) * limit)
    : offset

  const deposits = await prisma.deposit.findMany({
    where,
    orderBy: [{ depositedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    skip: clampedOffset,
    include: { account: { select: { name: true } } },
  })

  // Summary: total amount via DB aggregate
  const agg = await prisma.deposit.aggregate({
    _sum: { amount: true },
    where,
  })
  const totalAmount = agg._sum.amount ?? 0

  const serialized = deposits.map((d) => ({
    ...d,
    depositedAt: d.depositedAt.toISOString(),
    createdAt: undefined,
  }))

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header title="입금/증여" sub={`총 ${total}건`}>
        <Link
          href="/deposits/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 입금 기록
        </Link>
      </Header>

      <div className="mt-5 mb-4">
        <DepositFilters accounts={accounts} />
      </div>

      {/* 총 입금액 요약 */}
      {totalAmount > 0 && (
        <div className="mb-4 relative overflow-hidden rounded-[14px] border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">
              {year ? `${year}년` : '전체'} 입금 총액
            </span>
            <span className="text-[17px] font-bold text-bright tabular-nums">
              {totalAmount.toLocaleString('ko-KR')}원
            </span>
          </div>
        </div>
      )}

      <DepositTable
        deposits={serialized as Parameters<typeof DepositTable>[0]['deposits']}
        total={total}
        limit={limit}
        offset={clampedOffset}
      />

      <p className="text-[11px] text-dim mt-4">
        증여세 정보는 참고용이며 법적 조언이 아닙니다.
      </p>
    </div>
  )
}
