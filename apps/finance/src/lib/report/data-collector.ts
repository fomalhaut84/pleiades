/**
 * 분기 리포트 데이터 수집
 *
 * 수익률, 배당, 거래, 세금, 증여 등 분기 데이터를 수집하여
 * AI 분석과 PDF 생성의 입력으로 사용.
 */

import { prisma } from '@/lib/prisma'
import { calcGiftTaxSummary } from '@/lib/tax/gift-tax'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'

export interface QuarterlyData {
  year: number
  quarter: number
  period: { start: Date; end: Date }
  portfolio: {
    totalValueKRW: number
    totalCostKRW: number
    returnPct: number
    accounts: {
      name: string
      valueKRW: number
      costKRW: number
      returnPct: number
      holdingCount: number
    }[]
  }
  trades: {
    total: number
    buys: number
    sells: number
  }
  dividends: {
    totalKRW: number
    count: number
  }
  giftTax: {
    accountName: string
    totalGifted: number
    exemptLimit: number
    usageRate: number
    remaining: number
  }[]
  fxRate: number
}

function getQuarterDates(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 1)),
  }
}

export async function collectQuarterlyData(
  year: number,
  quarter: number
): Promise<QuarterlyData> {
  const { start, end } = getQuarterDates(year, quarter)

  // 환율
  const fxCache = await prisma.priceCache.findUnique({ where: { ticker: 'USDKRW=X' } })
  const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

  // 계좌별 포트폴리오
  const accounts = await prisma.account.findMany({
    include: { holdings: true },
    orderBy: { createdAt: 'asc' },
  })

  const allTickers = accounts.flatMap((a) => a.holdings.map((h) => h.ticker))
  const prices = allTickers.length > 0
    ? await prisma.priceCache.findMany({ where: { ticker: { in: allTickers } } })
    : []
  const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

  let totalValueKRW = 0
  let totalCostKRW = 0
  const accountSummaries = accounts.map((account) => {
    let valueKRW = 0
    let costKRW = 0
    for (const h of account.holdings) {
      const cost = calcCostKRW(h)
      costKRW += cost
      const cp = priceMap.get(h.ticker)
      if (cp != null) {
        valueKRW += calcCurrentValueKRW(h, cp, h.currency === 'USD' ? fxRate : 1)
      } else if (h.currency === 'USD' && h.avgPriceFx != null) {
        valueKRW += Math.round(h.avgPriceFx * h.shares * fxRate)
      } else {
        valueKRW += cost
      }
    }
    totalValueKRW += valueKRW
    totalCostKRW += costKRW
    return {
      name: account.name,
      valueKRW,
      costKRW,
      returnPct: costKRW > 0 ? ((valueKRW - costKRW) / costKRW) * 100 : 0,
      holdingCount: account.holdings.length,
    }
  })

  // 분기 거래
  const trades = await prisma.trade.findMany({
    where: { tradedAt: { gte: start, lt: end } },
    select: { type: true },
  })

  // 분기 배당
  const dividends = await prisma.dividend.findMany({
    where: { payDate: { gte: start, lt: end } },
    select: { amountKRW: true },
  })
  const dividendTotal = dividends.reduce((s, d) => s + d.amountKRW, 0)

  // 증여세 현황
  const childAccounts = accounts.filter((a) => a.ownerAge != null && a.ownerAge < 19)
  const giftTaxData = await Promise.all(
    childAccounts.map(async (account) => {
      const deposits = await prisma.deposit.findMany({
        where: { accountId: account.id },
        select: { amount: true, source: true, depositedAt: true },
      })
      const summary = calcGiftTaxSummary(deposits, true, end)
      return {
        accountName: account.name,
        totalGifted: summary.totalGifted,
        exemptLimit: summary.exemptLimit,
        usageRate: summary.usageRate,
        remaining: summary.remaining,
      }
    })
  )

  return {
    year,
    quarter,
    period: { start, end },
    portfolio: {
      totalValueKRW,
      totalCostKRW,
      returnPct: totalCostKRW > 0 ? ((totalValueKRW - totalCostKRW) / totalCostKRW) * 100 : 0,
      accounts: accountSummaries,
    },
    trades: {
      total: trades.length,
      buys: trades.filter((t) => t.type === 'BUY').length,
      sells: trades.filter((t) => t.type === 'SELL').length,
    },
    dividends: {
      totalKRW: dividendTotal,
      count: dividends.length,
    },
    giftTax: giftTaxData,
    fxRate,
  }
}
