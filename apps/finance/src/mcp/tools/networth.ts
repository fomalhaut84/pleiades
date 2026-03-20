import { prisma } from '@/lib/prisma'
import {
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import { toolResult, toolError, formatMoney } from '../utils'

/**
 * get_networth: 현재 순자산 요약 (주식 + 비주식 - 부채)
 */
export async function getNetWorth() {
  try {
    const fxCache = await prisma.priceCache.findUnique({ where: { ticker: 'USDKRW=X' } })
    const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

    // 주식 평가액
    const holdings = await prisma.holding.findMany()
    const tickers = holdings.map((h) => h.ticker)
    const prices = tickers.length > 0
      ? await prisma.priceCache.findMany({ where: { ticker: { in: tickers } } })
      : []
    const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

    let stockValue = 0
    for (const h of holdings) {
      const cp = priceMap.get(h.ticker)
      if (cp != null) {
        stockValue += calcCurrentValueKRW(h, cp, h.currency === 'USD' ? fxRate : 1)
      } else if (h.currency === 'USD' && h.avgPriceFx != null) {
        stockValue += Math.round(h.avgPriceFx * h.shares * fxRate)
      } else {
        stockValue += Math.round(h.avgPrice * h.shares)
      }
    }

    // 비주식 자산 + 부채
    const assets = await prisma.asset.findMany()
    const assetValue = assets.filter((a) => !a.isLiability).reduce((s, a) => s + a.value, 0)
    const liabilityValue = assets.filter((a) => a.isLiability).reduce((s, a) => s + a.value, 0)
    const netWorth = stockValue + assetValue - liabilityValue

    // 카테고리별 breakdown
    const catLines: string[] = []
    const catMap = new Map<string, number>()
    catMap.set('주식', stockValue)
    for (const a of assets) {
      const label = a.isLiability ? `부채(${a.category})` : a.category
      catMap.set(label, (catMap.get(label) ?? 0) + a.value)
    }
    for (const [cat, val] of Array.from(catMap.entries())) {
      catLines.push(`- ${cat}: ${formatMoney(val, 'KRW')}`)
    }

    // 최근 스냅샷
    const snapshots = await prisma.netWorthSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 6,
    })

    const lines = [
      `## 순자산 현황`,
      `순자산: ${formatMoney(netWorth, 'KRW')}`,
      `주식: ${formatMoney(stockValue, 'KRW')}`,
      `비주식 자산: ${formatMoney(assetValue, 'KRW')}`,
      liabilityValue > 0 ? `부채: -${formatMoney(liabilityValue, 'KRW')}` : '',
      '',
      '카테고리별:',
      ...catLines,
    ].filter(Boolean)

    if (snapshots.length > 0) {
      lines.push('')
      lines.push('최근 스냅샷:')
      for (const s of snapshots) {
        lines.push(`- ${s.date.toISOString().slice(0, 7)}: ${formatMoney(s.netWorthKRW, 'KRW')}`)
      }
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
