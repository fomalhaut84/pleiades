import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import DividendFilters from '@/components/dividend/DividendFilters'
import DividendTable from '@/components/dividend/DividendTable'
import DividendSummary from '@/components/dividend/DividendSummary'
import DividendCalendar from '@/components/dividend/DividendCalendar'

export const dynamic = 'force-dynamic'

interface DividendsPageProps {
  searchParams: {
    accountId?: string | string[]
    year?: string | string[]
    offset?: string | string[]
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function DividendsPage({ searchParams }: DividendsPageProps) {
  const accountId = first(searchParams.accountId)
  const yearStr = first(searchParams.year)
  const rawOffset = parseInt(first(searchParams.offset) ?? '0')
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset
  const limit = 20

  const currentYear = new Date().getFullYear()
  const year = yearStr && /^\d{4}$/.test(yearStr) ? parseInt(yearStr) : undefined

  const where: Record<string, unknown> = {}
  if (accountId) where.accountId = accountId
  if (year) {
    where.payDate = {
      gte: new Date(`${year}-01-01`),
      lt: new Date(`${year + 1}-01-01`),
    }
  }

  const [total, accounts] = await Promise.all([
    prisma.dividend.count({ where }),
    prisma.account.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Clamp offset to valid range
  const clampedOffset = total > 0 && offset >= total
    ? Math.max(0, Math.floor((total - 1) / limit) * limit)
    : offset

  const dividends = await prisma.dividend.findMany({
    where,
    orderBy: [{ payDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    skip: clampedOffset,
    include: { account: { select: { name: true } } },
  })

  // Summary for the selected year (or current year)
  const summaryYear = year ?? currentYear
  const summaryWhere: Record<string, unknown> = {
    payDate: {
      gte: new Date(`${summaryYear}-01-01`),
      lt: new Date(`${summaryYear + 1}-01-01`),
    },
  }
  if (accountId) summaryWhere.accountId = accountId

  const summaryDividends = await prisma.dividend.findMany({ where: summaryWhere })
  const totalNetKRW = Math.round(summaryDividends.reduce((s, d) => s + d.amountKRW, 0))
  const totalTaxKRW = Math.round(summaryDividends.reduce((s, d) => {
    if (!d.taxAmount) return s
    if (d.currency === 'USD') return s + Math.round(d.taxAmount * (d.fxRate ?? 0))
    return s + Math.round(d.taxAmount)
  }, 0))
  const reinvestedCount = summaryDividends.filter((d) => d.reinvested).length

  // byMonth
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, totalNetKRW: 0, count: 0 }))
  for (const d of summaryDividends) {
    const month = new Date(d.payDate).getUTCMonth()
    byMonth[month].totalNetKRW += d.amountKRW
    byMonth[month].count += 1
  }

  const serialized = dividends.map((d) => ({
    ...d,
    payDate: d.payDate.toISOString(),
    exDate: d.exDate?.toISOString() ?? null,
    createdAt: undefined,
  }))

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header title="배당금" sub={`총 ${total}건`}>
        <Link
          href="/dividends/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 배당 기록
        </Link>
      </Header>

      <div className="mt-5 mb-4">
        <DividendFilters accounts={accounts} />
      </div>

      <div className="mb-4">
        <DividendSummary
          totalNetKRW={totalNetKRW}
          totalTaxKRW={totalTaxKRW}
          reinvestedCount={reinvestedCount}
          totalCount={summaryDividends.length}
          year={summaryYear}
        />
      </div>

      <div className="mb-4">
        <DividendCalendar byMonth={byMonth} year={summaryYear} />
      </div>

      <DividendTable
        dividends={serialized as Parameters<typeof DividendTable>[0]['dividends']}
        total={total}
        limit={limit}
        offset={clampedOffset}
      />

      <p className="text-[11px] text-dim mt-4">
        배당소득세 정보는 참고용이며 법적 조언이 아닙니다.
      </p>
    </div>
  )
}
