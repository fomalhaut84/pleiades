import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import GiftTaxGauge from '@/components/tax/GiftTaxGauge'
import CapitalGainsSummary from '@/components/tax/CapitalGainsSummary'
import RealizedGainsTable from '@/components/tax/RealizedGainsTable'
import RSUTaxCard from '@/components/tax/RSUTaxCard'
import { calcGiftTaxSummary, GIFT_SOURCES } from '@/lib/tax/gift-tax'
import { calcRealizedGains, calcCapitalGainsSummary } from '@/lib/tax/capital-gains-tax'
import { calcRSUTaxSummary } from '@/lib/tax/income-tax'

export const dynamic = 'force-dynamic'

interface TaxPageProps {
  searchParams: {
    year?: string | string[]
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function TaxPage({ searchParams }: TaxPageProps) {
  const currentYear = new Date().getFullYear()
  const yearStr = first(searchParams.year)
  const year = yearStr && /^\d{4}$/.test(yearStr) ? parseInt(yearStr) : currentYear

  // 증여세 데이터
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      ownerAge: true,
      deposits: {
        where: { source: { in: GIFT_SOURCES } },
        select: { amount: true, source: true, depositedAt: true },
        orderBy: { depositedAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const giftSummaries = accounts.map((account) => {
    const isMinor = account.ownerAge != null && account.ownerAge < 19
    const summary = calcGiftTaxSummary(account.deposits, isMinor)
    return {
      accountId: account.id,
      accountName: account.name,
      ownerAge: account.ownerAge,
      isMinor,
      ...summary,
      resetDate: summary.resetDate?.toISOString() ?? null,
      firstGiftDate: summary.firstGiftDate?.toISOString() ?? null,
    }
  })

  const minorAccounts = giftSummaries.filter((s) => s.isMinor)
  const adultGiftAccounts = giftSummaries.filter((s) => !s.isMinor && s.totalGifted > 0)

  // 양도소득세 데이터: 매도 거래가 있는 종목의 전체 거래 히스토리
  // 해당 연도에 매도한 계좌+종목 조합 조회
  const sellPairs = await prisma.trade.findMany({
    where: {
      type: 'SELL',
      tradedAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    select: { accountId: true, ticker: true },
    distinct: ['accountId', 'ticker'],
  })

  // 각 계좌+종목의 전체 거래 히스토리 (해당 연도 말까지만)
  const allTrades = sellPairs.length > 0
    ? await prisma.trade.findMany({
        where: {
          OR: sellPairs.map((p) => ({
            accountId: p.accountId,
            ticker: p.ticker,
          })),
          tradedAt: { lt: new Date(`${year + 1}-01-01`) },
        },
        orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
      })
    : []

  const realizedGains = calcRealizedGains(allTrades, year)
  const capitalGainsSummary = calcCapitalGainsSummary(realizedGains)

  // RSU 근로소득세 데이터: 해당 연도 베스팅 스케줄
  const rsuSchedules = await prisma.rSUSchedule.findMany({
    where: {
      vestingDate: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    orderBy: { vestingDate: 'asc' },
  })

  const rsuTaxSummary = calcRSUTaxSummary(
    rsuSchedules.map((s) => ({
      id: s.id,
      vestingDate: s.vestingDate,
      shares: s.shares,
      vestPrice: s.vestPrice,
      basisPrice: s.basisPrice,
      basisValue: s.basisValue,
      status: s.status,
    }))
  )

  // 연도 선택 옵션
  const years = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header title="세금 센터" sub="양도세 · RSU 근로소득세 · 증여세 · 배당소득세" />

      {/* 연도 선택 */}
      <div className="mt-5 mb-6 flex items-center gap-1 bg-white/[0.02] rounded-lg p-1 border border-white/[0.04] w-fit">
        {years.map((y) => (
          <a
            key={y}
            href={`/tax?year=${y}`}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all ${
              year === y
                ? 'bg-white/[0.07] text-bright'
                : 'text-sub hover:text-muted hover:bg-white/[0.03]'
            }`}
          >
            {y}
          </a>
        ))}
      </div>

      {/* 양도소득세 섹션 */}
      <div className="mb-8">
        <h2 className="text-[14px] font-bold text-bright mb-3">양도소득세 ({year}년)</h2>
        <CapitalGainsSummary
          year={year}
          foreignStockGain={capitalGainsSummary.foreignStockGain}
          foreignStockTaxable={capitalGainsSummary.foreignStockTaxable}
          foreignStockTax={capitalGainsSummary.foreignStockTax}
          krEtfGain={capitalGainsSummary.krEtfGain}
          krEtfTax={capitalGainsSummary.krEtfTax}
          totalEstimatedTax={capitalGainsSummary.totalEstimatedTax}
          hasSales={realizedGains.length > 0}
        />

        {realizedGains.length > 0 && (
          <div className="mt-4">
            <RealizedGainsTable gains={realizedGains} />
          </div>
        )}
      </div>

      {/* RSU 근로소득세 섹션 */}
      <div className="mb-8">
        <h2 className="text-[14px] font-bold text-bright mb-3">RSU 근로소득세 ({year}년)</h2>
        <RSUTaxCard
          estimates={rsuTaxSummary.estimates}
          totalGrossIncome={rsuTaxSummary.totalGrossIncome}
          totalTax={rsuTaxSummary.totalTax}
        />
      </div>

      {/* 증여세 섹션 */}
      <div className="mb-8">
        <h2 className="text-[14px] font-bold text-bright mb-3">증여세 현황</h2>

        {minorAccounts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {minorAccounts.map((s) => (
              <GiftTaxGauge
                key={s.accountId}
                accountName={s.accountName}
                ownerAge={s.ownerAge}
                isMinor={s.isMinor}
                totalGifted={s.totalGifted}
                exemptLimit={s.exemptLimit}
                usageRate={s.usageRate}
                remaining={s.remaining}
                estimatedTax={s.estimatedTax}
                resetDate={s.resetDate}
                firstGiftDate={s.firstGiftDate}
              />
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
            <div className="text-[13px] text-sub">미성년 계좌의 증여 기록이 없습니다</div>
          </div>
        )}

        {adultGiftAccounts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[12px] font-semibold text-sub mb-2">성인 계좌</h3>
            <div className="flex flex-col gap-4">
              {adultGiftAccounts.map((s) => (
                <GiftTaxGauge
                  key={s.accountId}
                  accountName={s.accountName}
                  ownerAge={s.ownerAge}
                  isMinor={s.isMinor}
                  totalGifted={s.totalGifted}
                  exemptLimit={s.exemptLimit}
                  usageRate={s.usageRate}
                  remaining={s.remaining}
                  estimatedTax={s.estimatedTax}
                  resetDate={s.resetDate}
                  firstGiftDate={s.firstGiftDate}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Placeholder */}
      <div className="mb-6">
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.04] bg-white/[0.015] px-5 py-4">
          <span className="text-[13px] text-dim">배당소득세 추적 — Phase 4-F에서 추가 예정</span>
        </div>
      </div>

      <p className="text-[11px] text-dim">
        세금 정보는 참고용이며 법적 조언이 아닙니다. 정확한 세금 계산은 세무사에게 문의하세요.
      </p>
    </div>
  )
}
