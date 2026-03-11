import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  calcCostKRW, calcCurrentValueKRW, calcProfitLoss,
  formatKRW, formatPercent, formatSignedKRW,
  getLastUpdatedAt, DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import HoldingsTable from '@/components/dashboard/HoldingsTable'
import AllocationChart from '@/components/dashboard/AllocationChart'
import FxBanner from '@/components/dashboard/FxBanner'
import RefreshButton from '@/components/dashboard/RefreshButton'
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
  const [account, prices] = await Promise.all([
    prisma.account.findUnique({
      where: { id: params.id },
      include: {
        holdings: { orderBy: { avgPrice: 'desc' } },
        deposits: true,
      },
    }),
    prisma.priceCache.findMany(),
  ])

  if (!account) {
    notFound()
  }

  const priceMap = new Map(prices.map((p) => [p.ticker, p]))
  const fxData = priceMap.get('USDKRW=X')
  const currentFxRate = fxData?.price ?? DEFAULT_FX_RATE_USD_KRW
  const hasPriceData = account.holdings.some((h) => priceMap.has(h.ticker))

  const lastUpdatedAt = getLastUpdatedAt(prices)

  const colors = COLOR_MAP[account.name] ?? {
    color: 'var(--sub)',
    text: 'text-sub',
    tagBg: 'rgba(148,148,168,0.1)',
  }

  // 매입금 합산
  const totalCostKRW = account.holdings.reduce(
    (sum, h) => sum + calcCostKRW(h),
    0
  )

  // 평가금 합산
  const totalCurrentKRW = hasPriceData
    ? account.holdings.reduce((sum, h) => {
        const price = priceMap.get(h.ticker)
        if (!price) return sum + calcCostKRW(h)
        return sum + calcCurrentValueKRW(h, price.price, currentFxRate)
      }, 0)
    : totalCostKRW

  const totalPL = totalCurrentKRW - totalCostKRW
  const totalReturnPct = totalCostKRW > 0 ? (totalPL / totalCostKRW) * 100 : 0

  // 일일 변동
  const dailyChangeKRW = account.holdings.reduce((sum, h) => {
    const price = priceMap.get(h.ticker)
    if (!price || price.change == null) return sum
    if (h.currency === 'USD') {
      return sum + Math.round(price.change * h.shares * currentFxRate)
    }
    return sum + Math.round(price.change * h.shares)
  }, 0)

  // 환차손익 합산 (USD 종목만)
  const totalFxPL = account.holdings
    .filter((h) => h.currency === 'USD')
    .reduce((sum, h) => {
      const price = priceMap.get(h.ticker)
      if (!price) return sum
      const pl = calcProfitLoss(h, price.price, currentFxRate)
      return sum + pl.fxPL
    }, 0)

  // 시장별 비중
  const usCount = account.holdings.filter((h) => h.market === 'US').length
  const krCount = account.holdings.filter((h) => h.market === 'KR').length

  // 증여 현황
  const depositTotal = account.deposits.reduce(
    (sum, d) => sum + d.amount,
    0
  )

  // 차트 데이터 (평가금 기준)
  const chartData = account.holdings
    .map((h) => {
      const price = priceMap.get(h.ticker)
      const value = price
        ? calcCurrentValueKRW(h, price.price, currentFxRate)
        : calcCostKRW(h)
      return { name: h.displayName, value }
    })
    .sort((a, b) => b.value - a.value)

  const strategyText = account.strategy ?? '전략 미설정'
  const horizonText = account.horizon ? `${account.horizon}년+` : ''
  const headerSub = [strategyText, horizonText].filter(Boolean).join(' · ')

  const displayAmount = hasPriceData ? totalCurrentKRW : totalCostKRW

  return (
    <>
      <Header title={`${account.name} 포트폴리오`} sub={headerSub}>
        <RefreshButton lastUpdatedAt={lastUpdatedAt?.toISOString() ?? null} />
      </Header>
      <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
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
              <span className="text-[12px] font-semibold text-sub bg-surface-dim px-2.5 py-1 rounded">
                {horizonText}
              </span>
            )}
            <span className="text-[12px] font-semibold text-sub bg-surface-dim px-2.5 py-1 rounded">
              {account.holdings.length}종목
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className={`grid gap-3.5 mb-6 ${hasPriceData ? 'grid-cols-1 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
          <Card className="text-center py-4">
            <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">
              {hasPriceData ? '총 평가금' : '총 매입금'}
            </div>
            <div className={`text-[20px] font-extrabold tracking-tight ${colors.text}`}>
              {formatKRW(displayAmount)}
            </div>
            {hasPriceData && (
              <div className="text-[11px] text-dim mt-1">
                매입금 {formatKRW(totalCostKRW)}
              </div>
            )}
          </Card>
          {hasPriceData && (
            <Card className="text-center py-4">
              <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">수익률</div>
              <div className={`text-[20px] font-extrabold tracking-tight ${totalReturnPct >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                {formatPercent(totalReturnPct)}
              </div>
              <div className={`text-[11px] mt-1 ${totalPL >= 0 ? 'text-sejin/70' : 'text-red-500/70'}`}>
                {formatSignedKRW(totalPL)}
              </div>
            </Card>
          )}
          {hasPriceData && (
            <Card className="text-center py-4">
              <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">오늘 변동</div>
              <div className={`text-[20px] font-extrabold tracking-tight ${dailyChangeKRW >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                {formatSignedKRW(dailyChangeKRW)}
              </div>
            </Card>
          )}
          {hasPriceData && usCount > 0 && (
            <Card className="text-center py-4">
              <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">환차손익</div>
              <div className={`text-[20px] font-extrabold tracking-tight ${totalFxPL >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                {formatSignedKRW(totalFxPL)}
              </div>
              <div className="text-[11px] text-dim mt-1">
                환율 {currentFxRate.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}원
              </div>
            </Card>
          )}
          {!hasPriceData && (
            <>
              <Card className="text-center py-4">
                <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">미국주 비중</div>
                <div className="text-[20px] font-extrabold text-bright tracking-tight">
                  {usCount}종목
                </div>
              </Card>
              <Card className="text-center py-4">
                <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">한국주 비중</div>
                <div className="text-[20px] font-extrabold text-bright tracking-tight">
                  {krCount}종목
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Show deposit info for child accounts */}
        {account.ownerAge != null && depositTotal > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
            <Card className="text-center py-4">
              <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">증여 누적</div>
              <div className="text-[20px] font-extrabold text-bright tracking-tight">
                {formatKRW(depositTotal)}
              </div>
              <div className="text-[11px] text-dim mt-1">
                비과세 한도 {((depositTotal / GIFT_TAX_EXEMPT_MINOR) * 100).toFixed(0)}%
              </div>
            </Card>
            {account.horizon && (
              <Card className="text-center py-4">
                <div className="text-[11px] text-sub tracking-wide mb-1.5 uppercase">투자 기간</div>
                <div className="text-[20px] font-extrabold text-bright tracking-tight">
                  {account.horizon}년+
                </div>
                <div className="text-[11px] text-dim mt-1">
                  목표: {account.ownerAge + account.horizon}세
                </div>
              </Card>
            )}
          </div>
        )}

        {/* FX Banner */}
        {hasPriceData && usCount > 0 && (
          <FxBanner
            fxRate={fxData?.price ?? null}
            fxChange={fxData?.change ?? null}
            fxChangePercent={fxData?.changePercent ?? null}
          />
        )}

        {/* Holdings Table + Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <HoldingsTable
            holdings={account.holdings}
            priceMap={priceMap}
            currentFxRate={currentFxRate}
            hasPriceData={hasPriceData}
          />
          <AllocationChart
            data={chartData}
            totalLabel={formatTotalShort(displayAmount)}
            chartTitle={hasPriceData ? '평가금 비중' : '매입비중'}
            centerLabel={hasPriceData ? '평가금' : '총 매입'}
          />
        </div>
      </div>
    </>
  )
}
