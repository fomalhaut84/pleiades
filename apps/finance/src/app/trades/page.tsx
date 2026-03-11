import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import ExportButton from '@/components/ui/ExportButton'
import TradeFilters from '@/components/trade/TradeFilters'
import TradeTable from '@/components/trade/TradeTable'

export const dynamic = 'force-dynamic'

interface TradesPageProps {
  searchParams: {
    accountId?: string | string[]
    type?: string | string[]
    offset?: string | string[]
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const accountId = first(searchParams.accountId)
  const type = first(searchParams.type)
  const rawOffset = parseInt(first(searchParams.offset) ?? '0')
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset
  const limit = 20

  const where: Record<string, unknown> = {}
  if (accountId) where.accountId = accountId
  if (type && ['BUY', 'SELL'].includes(type)) where.type = type

  const [trades, total, accounts] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ tradedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
      include: { account: { select: { name: true } } },
    }),
    prisma.trade.count({ where }),
    prisma.account.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const serialized = trades.map((t) => ({
    ...t,
    tradedAt: t.tradedAt.toISOString(),
    createdAt: undefined,
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header title="거래 내역" sub={`총 ${total}건`}>
        <ExportButton
          href={`/api/exports/trades${accountId || type ? '?' : ''}${accountId ? `accountId=${accountId}` : ''}${accountId && type ? '&' : ''}${type ? `type=${type}` : ''}`}
          label="CSV 내보내기"
        />
        <Link
          href="/trades/import"
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-white/[0.04] text-sub text-[12px] sm:text-[13px] font-semibold border border-white/[0.06] hover:bg-white/[0.08] transition-all"
        >
          <span className="hidden sm:inline">CSV</span> 가져오기
        </Link>
        <Link
          href="/trades/new"
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sejin/15 text-sejin text-[12px] sm:text-[13px] font-semibold border border-sejin/25 hover:bg-sejin/25 transition-all"
        >
          + <span className="hidden sm:inline">새 거래</span><span className="sm:hidden">추가</span>
        </Link>
      </Header>

      <div className="mt-5 mb-4">
        <TradeFilters accounts={accounts} />
      </div>

      <TradeTable
        trades={serialized as Parameters<typeof TradeTable>[0]['trades']}
        total={total}
        limit={limit}
        offset={offset}
      />
    </div>
  )
}
