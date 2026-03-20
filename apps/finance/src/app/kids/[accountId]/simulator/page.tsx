import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import SimulatorClient from './SimulatorClient'

export const dynamic = 'force-dynamic'

export default async function KidsSimulatorPage({
  params,
}: {
  params: { accountId: string }
}) {
  const account = await prisma.account.findUnique({
    where: { id: params.accountId },
    include: { holdings: true },
  })

  if (!account) notFound()

  const fxCache = await prisma.priceCache.findUnique({ where: { ticker: 'USDKRW=X' } })
  const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

  const tickers = account.holdings.map((h) => h.ticker)
  const prices = tickers.length > 0
    ? await prisma.priceCache.findMany({ where: { ticker: { in: tickers } } })
    : []
  const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

  let currentValue = 0
  for (const h of account.holdings) {
    const cp = priceMap.get(h.ticker)
    if (cp != null) {
      currentValue += calcCurrentValueKRW(h, cp, h.currency === 'USD' ? fxRate : 1)
    } else if (h.currency === 'USD' && h.avgPriceFx != null) {
      currentValue += Math.round(h.avgPriceFx * h.shares * fxRate)
    } else {
      currentValue += calcCostKRW(h)
    }
  }

  const yearsToAdult = account.ownerAge != null ? Math.max(1, 20 - account.ownerAge) : 10

  return (
    <SimulatorClient
      accountId={account.id}
      accountName={account.name}
      ownerAge={account.ownerAge}
      currentValue={currentValue}
      yearsToAdult={yearsToAdult}
    />
  )
}
