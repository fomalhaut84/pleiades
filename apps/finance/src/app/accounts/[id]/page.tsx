import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { calcCostKRW, formatKRW } from '@/lib/format'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import HoldingsTable from '@/components/dashboard/HoldingsTable'
import AllocationChart from '@/components/dashboard/AllocationChart'
import Link from 'next/link'

interface PageProps {
  params: { id: string }
}

const COLOR_MAP: Record<string, { color: string; text: string; tagBg: string }> = {
  '세진': { color: '#34d399', text: 'text-sejin', tagBg: 'rgba(52,211,153,0.1)' },
  '소담': { color: '#60a5fa', text: 'text-sodam', tagBg: 'rgba(96,165,250,0.1)' },
  '다솜': { color: '#fb923c', text: 'text-dasom', tagBg: 'rgba(251,146,60,0.1)' },
}

/** 미성년 증여세 비과세 한도 (10년간) */
const GIFT_TAX_EXEMPT_MINOR = 20_000_000

function formatTotalShort(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 10_000).toFixed(0)}만`
  }
  return `${Math.round(amount).toLocaleString('ko-KR')}`
}

export default async function AccountDetailPage({ params }: PageProps) {
  const account = await prisma.account.findUnique({
    where: { id: params.id },
    include: {
      holdings: { orderBy: { avgPrice: 'desc' } },
      deposits: true,
    },
  })

  if (!account) {
    notFound()
  }

  const colors = COLOR_MAP[account.name] ?? {
    color: '#9494a8',
    text: 'text-sub',
    tagBg: 'rgba(148,148,168,0.1)',
  }

  const totalKRW = account.holdings.reduce(
    (sum, h) => sum + calcCostKRW(h),
    0
  )
  const usCount = account.holdings.filter((h) => h.market === 'US').length
  const krCount = account.holdings.filter((h) => h.market === 'KR').length
  const usTotalKRW = account.holdings
    .filter((h) => h.market === 'US')
    .reduce((s, h) => s + calcCostKRW(h), 0)
  const krTotalKRW = account.holdings
    .filter((h) => h.market === 'KR')
    .reduce((s, h) => s + calcCostKRW(h), 0)
  const usRatio = totalKRW > 0 ? (usTotalKRW / totalKRW) * 100 : 0
  const krRatio = totalKRW > 0 ? (krTotalKRW / totalKRW) * 100 : 0

  const depositTotal = account.deposits.reduce(
    (sum, d) => sum + d.amount,
    0
  )

  const chartData = account.holdings
    .map((h) => ({
      name: h.displayName,
      value: calcCostKRW(h),
    }))
    .sort((a, b) => b.value - a.value)

  const strategyText = account.strategy ?? '전략 미설정'
  const horizonText = account.horizon ? `${account.horizon}년+` : ''
  const headerSub = [strategyText, horizonText].filter(Boolean).join(' · ')

  return (
    <>
      <Header title={`${account.name} 포트폴리오`} sub={headerSub} />
      <div className="px-8 py-7 max-w-[960px]">
        {/* Back link */}
        <div className="mb-7">
          <Link
            href="/"
            className="text-[13px] text-sub hover:text-bright transition-colors inline-flex items-center gap-1"
          >
            ← 대시보드
          </Link>
          <div className={`text-[24px] font-black tracking-tight mt-4 ${colors.text}`}>
            {account.name}
            {account.ownerAge != null && (
              <span className="text-[16px] text-sub ml-2">
                {account.ownerAge}세
              </span>
            )}
          </div>
          <div className="flex gap-4 mt-2">
            <span
              className="text-[12px] font-semibold px-2.5 py-1 rounded"
              style={{ color: colors.color, background: colors.tagBg }}
            >
              {strategyText}
            </span>
            {horizonText && (
              <span className="text-[12px] font-semibold text-sub bg-white/[0.04] px-2.5 py-1 rounded">
                {horizonText}
              </span>
            )}
            <span className="text-[12px] font-semibold text-sub bg-white/[0.04] px-2.5 py-1 rounded">
              {account.holdings.length}종목
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
          <Card className="text-center py-4">
            <div className="text-[12px] text-sub tracking-wide mb-1.5">총 매입금</div>
            <div className={`text-[20px] font-extrabold tracking-tight ${colors.text}`}>
              {formatKRW(totalKRW)}
            </div>
          </Card>
          <Card className="text-center py-4">
            <div className="text-[12px] text-sub tracking-wide mb-1.5">미국주 비중</div>
            <div className="text-[20px] font-extrabold text-bright tracking-tight">
              {usRatio.toFixed(1)}%
            </div>
            <div className="text-[12px] text-sub mt-1">{usCount}종목</div>
          </Card>
          <Card className="text-center py-4">
            <div className="text-[12px] text-sub tracking-wide mb-1.5">한국주 비중</div>
            <div className="text-[20px] font-extrabold text-bright tracking-tight">
              {krRatio.toFixed(1)}%
            </div>
            <div className="text-[12px] text-sub mt-1">{krCount}종목</div>
          </Card>
        </div>

        {/* Show deposit info for child accounts */}
        {account.ownerAge != null && depositTotal > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
            <Card className="text-center py-4">
              <div className="text-[12px] text-sub tracking-wide mb-1.5">증여 누적</div>
              <div className="text-[20px] font-extrabold text-bright tracking-tight">
                {formatKRW(depositTotal)}
              </div>
              <div className="text-[12px] text-sub mt-1">
                비과세 한도 {((depositTotal / GIFT_TAX_EXEMPT_MINOR) * 100).toFixed(0)}%
              </div>
            </Card>
            {account.horizon && (
              <Card className="text-center py-4">
                <div className="text-[12px] text-sub tracking-wide mb-1.5">투자 기간</div>
                <div className="text-[20px] font-extrabold text-bright tracking-tight">
                  {account.horizon}년+
                </div>
                <div className="text-[12px] text-sub mt-1">
                  목표: {account.ownerAge + account.horizon}세
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Holdings Table + Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <HoldingsTable holdings={account.holdings} />
          <AllocationChart
            data={chartData}
            totalLabel={formatTotalShort(totalKRW)}
          />
        </div>
      </div>
    </>
  )
}
