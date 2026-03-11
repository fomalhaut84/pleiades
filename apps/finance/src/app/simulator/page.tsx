import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import SimulatorClient from './SimulatorClient'
import { GIFT_SOURCES } from '@/lib/tax/gift-tax'
import { DEFAULT_FX_RATE_USD_KRW } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function SimulatorPage() {
  // 계좌별 현재 평가액 계산
  const accounts = await prisma.account.findMany({
    include: {
      holdings: true,
      deposits: {
        where: {
          source: { in: GIFT_SOURCES },
          depositedAt: { gte: (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setFullYear(d.getFullYear() - 10); return d })() },
        },
        select: { amount: true },
      },
      rsuSchedules: {
        where: { status: 'pending' },
        select: { vestingDate: true, basisValue: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // 현재가 조회
  const allTickers = Array.from(
    new Set(accounts.flatMap((a) => a.holdings.map((h) => h.ticker))),
  )
  const priceCaches = await prisma.priceCache.findMany({
    where: { ticker: { in: [...allTickers, 'USDKRW=X'] } },
    select: { ticker: true, price: true },
  })
  const priceMap = new Map(priceCaches.map((p) => [p.ticker, p.price]))
  const fxRate = priceMap.get('USDKRW=X') ?? DEFAULT_FX_RATE_USD_KRW

  // 계좌별 데이터 구성
  const accountData = accounts.map((account) => {
    const currentValue = account.holdings.reduce((sum, h) => {
      const price = priceMap.get(h.ticker)
      if (price != null) {
        return sum + price * h.shares * (h.currency === 'USD' ? fxRate : 1)
      }
      // 가격 캐시 없으면 매입가 기준 (원화 환산)
      return sum + h.avgPrice * h.shares
    }, 0)

    const giftTotal = account.deposits.reduce((sum, d) => sum + d.amount, 0)

    // RSU 이벤트 (pending, 월 단위 오프셋, 최소 1개월)
    const now = new Date()
    const rsuEvents = account.rsuSchedules
      .filter((r) => new Date(r.vestingDate) > now)
      .map((r) => {
        const vestDate = new Date(r.vestingDate)
        const rawMonths = (vestDate.getFullYear() - now.getFullYear()) * 12
          + (vestDate.getMonth() - now.getMonth())
        return {
          monthOffset: Math.max(1, rawMonths),
          amount: Math.round(r.basisValue),
          label: 'RSU 베스팅',
        }
      })

    return {
      accountId: account.id,
      accountName: account.name,
      ownerAge: account.ownerAge,
      horizon: account.horizon,
      currentValue: Math.round(currentValue),
      giftTotal: Math.round(giftTotal),
      rsuEvents,
    }
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1100px]">
      <Header title="복리 시뮬레이터" sub="계좌별 미래 자산 예측 · 시나리오 비교" />
      <SimulatorClient accounts={accountData} />
      <p className="mt-6 text-[11px] text-dim">
        시뮬레이션 결과는 가정된 수익률에 기반한 참고용이며, 실제 수익을 보장하지 않습니다.
      </p>
    </div>
  )
}
