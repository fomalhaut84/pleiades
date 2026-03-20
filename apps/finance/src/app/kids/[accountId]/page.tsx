import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import { getStockDescription, getDescriptionByName } from '@/lib/kids/stock-descriptions'
import { simulateAccount } from '@/lib/simulator/compound-engine'
import KidsClient from './KidsClient'

export const dynamic = 'force-dynamic'

interface HoldingData {
  ticker: string
  displayName: string
  emoji: string
  description: string
  valueKRW: number
  costKRW: number
  returnPct: number
  shares: number
}

function getLevel(age: number | null): { level: number; label: string; emoji: string } {
  if (age == null || age <= 8) return { level: 1, label: '씨앗', emoji: '🌱' }
  if (age <= 12) return { level: 2, label: '새싹', emoji: '🌿' }
  if (age <= 15) return { level: 3, label: '나무', emoji: '🌳' }
  return { level: 4, label: '산', emoji: '🏔️' }
}

export default async function KidsPage({
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

  let totalValue = 0
  let totalCost = 0

  const holdingData: HoldingData[] = account.holdings.map((h) => {
    const cost = calcCostKRW(h)
    const cp = priceMap.get(h.ticker)
    let value = cost
    if (cp != null) {
      value = calcCurrentValueKRW(h, cp, h.currency === 'USD' ? fxRate : 1)
    } else if (h.currency === 'USD' && h.avgPriceFx != null) {
      value = Math.round(h.avgPriceFx * h.shares * fxRate)
    }
    totalValue += value
    totalCost += cost
    const returnPct = cost > 0 ? ((value - cost) / cost) * 100 : 0

    const desc = getStockDescription(h.ticker)
    const nameDesc = desc.emoji === '🏢' ? getDescriptionByName(h.displayName) : desc

    return {
      ticker: h.ticker,
      displayName: h.displayName,
      emoji: nameDesc.emoji,
      description: nameDesc.desc,
      valueKRW: value,
      costKRW: cost,
      returnPct,
      shares: h.shares,
    }
  }).sort((a, b) => b.valueKRW - a.valueKRW)

  const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
  const level = getLevel(account.ownerAge)

  // 배당금 (올해)
  const yearStart = new Date(Date.UTC(new Date().getFullYear(), 0, 1))
  const dividends = await prisma.dividend.findMany({
    where: { accountId: account.id, payDate: { gte: yearStart } },
  })
  const dividendTotal = dividends.reduce((s, d) => s + d.amountKRW, 0)

  // 복리 미리보기
  const monthlyContribution = 50000
  const yearsToAdult = account.ownerAge != null ? Math.max(1, 20 - account.ownerAge) : 10
  const sim = simulateAccount({
    accountId: account.id,
    accountName: account.name,
    initialValue: totalValue,
    monthlyContribution,
    years: yearsToAdult,
    ownerAge: account.ownerAge,
  })
  const baseScenario = sim.scenarios.find((s) => s.scenarioName === '기본')

  return (
    <KidsClient
      accountName={account.name}
      ownerAge={account.ownerAge}
      level={level}
      totalValue={totalValue}
      totalCost={totalCost}
      totalReturn={totalReturn}
      holdings={holdingData}
      dividendTotal={dividendTotal}
      compoundFinalValue={baseScenario?.finalValue ?? totalValue}
      compoundYears={yearsToAdult}
      compoundMonthly={monthlyContribution}
    />
  )
}
