import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import StockOptionDashboard from '@/components/stock-option/StockOptionDashboard'
import ExerciseSimulator from '@/components/stock-option/ExerciseSimulator'
import StockOptionCRUD from '@/components/stock-option/StockOptionCRUD'
import { calcStockOptionOverview } from '@/lib/stock-option-utils'
import type { StockOptionWithVestings } from '@/lib/stock-option-utils'

export const dynamic = 'force-dynamic'

export default async function StockOptionsPage() {
  const [stockOptions, accounts] = await Promise.all([
    prisma.stockOption.findMany({
      include: {
        vestings: { orderBy: { vestingDate: 'asc' } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { grantDate: 'asc' },
    }),
    prisma.account.findMany({ select: { id: true, name: true } }),
  ])

  // 카카오 현재가 조회
  const kakaoPrice = await prisma.priceCache.findUnique({
    where: { ticker: '035720.KS' },
    select: { price: true },
  })

  const currentPrice = kakaoPrice?.price ?? null

  // 직렬화 (Date → string)
  const serialized: StockOptionWithVestings[] = stockOptions.map((so) => ({
    id: so.id,
    ticker: so.ticker,
    displayName: so.displayName,
    grantDate: so.grantDate.toISOString(),
    expiryDate: so.expiryDate.toISOString(),
    strikePrice: so.strikePrice,
    totalShares: so.totalShares,
    cancelledShares: so.cancelledShares,
    exercisedShares: so.exercisedShares,
    adjustedShares: so.adjustedShares,
    remainingShares: so.remainingShares,
    vestings: so.vestings.map((v) => ({
      id: v.id,
      vestingDate: v.vestingDate.toISOString(),
      shares: v.shares,
      status: v.status,
    })),
  }))

  const overview = currentPrice != null
    ? calcStockOptionOverview(serialized, currentPrice)
    : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header title="스톡옵션" sub="카카오 스톡옵션 현황 · 행사 시뮬레이터" />

      <div className="mt-5 mb-4">
        <StockOptionCRUD
          stockOptions={stockOptions.map((so) => ({
            id: so.id,
            accountId: so.account?.id ?? '',
            ticker: so.ticker,
            displayName: so.displayName,
            grantDate: so.grantDate.toISOString(),
            expiryDate: so.expiryDate.toISOString(),
            strikePrice: so.strikePrice,
            totalShares: so.totalShares,
            note: so.note,
          }))}
          accounts={accounts}
        />
      </div>

      {currentPrice == null ? (
        <div className="mt-5 mb-8">
          <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
            <div className="text-[13px] text-sub">
              카카오 주가 데이터가 없습니다. 주가 갱신 후 다시 확인하세요.
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 대시보드 */}
          <div className="mt-5 mb-8">
            <h2 className="text-[14px] font-bold text-bright mb-3">현황</h2>
            {overview && <StockOptionDashboard overview={overview} currentPrice={currentPrice} />}
          </div>

          {/* 행사 시뮬레이터 */}
          <div className="mb-8">
            <h2 className="text-[14px] font-bold text-bright mb-3">행사 시뮬레이터</h2>
            <ExerciseSimulator stockOptions={serialized} currentPrice={currentPrice} />
          </div>
        </>
      )}

      <p className="text-[11px] text-dim">
        세금 정보는 참고용이며 법적 조언이 아닙니다. 행사 이익만 기준 추정이며, 기존 연봉 합산 시 세율이 달라질 수 있습니다.
      </p>
    </div>
  )
}
