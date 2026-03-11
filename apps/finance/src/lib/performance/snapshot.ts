import { prisma } from '@/lib/prisma'
import { DEFAULT_FX_RATE_USD_KRW, calcCurrentValueKRW, calcCostKRW } from '@/lib/format'

interface SnapshotResult {
  accountId: string
  accountName: string
  snapshotDate: Date
  totalValueKRW: number
  totalCostKRW: number
}

/**
 * 모든 계좌의 일일 스냅샷을 생성한다.
 * 이미 해당일 스냅샷이 있으면 upsert (갱신).
 */
export async function takeAllSnapshots(): Promise<SnapshotResult[]> {
  // KST 기준 오늘 날짜 → UTC midnight으로 저장
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const today = new Date(Date.UTC(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate()))

  const accounts = await prisma.account.findMany({
    include: { holdings: true },
  })

  const allTickers = Array.from(
    new Set(accounts.flatMap((a) => a.holdings.map((h) => h.ticker)))
  )
  const priceCaches = await prisma.priceCache.findMany({
    where: { ticker: { in: [...allTickers, 'USDKRW=X'] } },
    select: { ticker: true, price: true },
  })
  const priceMap = new Map(priceCaches.map((p) => [p.ticker, p.price]))
  const fxRate = priceMap.get('USDKRW=X') ?? DEFAULT_FX_RATE_USD_KRW

  const results: SnapshotResult[] = []

  for (const account of accounts) {
    const holdingData = account.holdings.map((h) => {
      const currentPrice = priceMap.get(h.ticker)
      const price = currentPrice ?? (h.currency === 'USD' ? (h.avgPriceFx ?? 0) : h.avgPrice)
      const valueKRW = calcCurrentValueKRW(h, price, fxRate)
      return {
        ticker: h.ticker,
        displayName: h.displayName,
        shares: h.shares,
        price,
        currency: h.currency,
        valueKRW,
      }
    })

    const totalValueKRW = holdingData.reduce((sum, h) => sum + h.valueKRW, 0)
    const totalCostKRW = account.holdings.reduce((sum, h) => sum + calcCostKRW(h), 0)

    await prisma.portfolioSnapshot.upsert({
      where: {
        accountId_snapshotDate: { accountId: account.id, snapshotDate: today },
      },
      update: {
        totalValueKRW,
        totalCostKRW,
        fxRate,
        holdingSnapshots: {
          deleteMany: {},
          create: holdingData,
        },
      },
      create: {
        accountId: account.id,
        snapshotDate: today,
        totalValueKRW,
        totalCostKRW,
        fxRate,
        holdingSnapshots: {
          create: holdingData,
        },
      },
    })

    results.push({
      accountId: account.id,
      accountName: account.name,
      snapshotDate: today,
      totalValueKRW,
      totalCostKRW,
    })
  }

  console.log(`[snapshot] ${results.length}개 계좌 스냅샷 생성 완료 (${today.toISOString().slice(0, 10)})`)
  return results
}
