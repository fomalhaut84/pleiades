import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * GET /api/networth — 현재 순자산 계산
 *
 * 주식 포트폴리오 (실시간) + 비주식 자산 - 부채 = 순자산
 */
export async function GET() {
  try {
    // 환율
    const fxCache = await prisma.priceCache.findUnique({
      where: { ticker: 'USDKRW=X' },
    })
    const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

    // 주식 포트폴리오 평가액
    const holdings = await prisma.holding.findMany()
    const tickers = holdings.map((h) => h.ticker)
    const prices = tickers.length > 0
      ? await prisma.priceCache.findMany({ where: { ticker: { in: tickers } } })
      : []
    const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

    let stockValueKRW = 0
    for (const h of holdings) {
      const currentPrice = priceMap.get(h.ticker)
      if (currentPrice != null) {
        const currentFxRate = h.currency === 'USD' ? fxRate : 1
        stockValueKRW += calcCurrentValueKRW(h, currentPrice, currentFxRate)
      } else if (h.currency === 'USD' && h.avgPriceFx != null) {
        // USD 종목 시세 없음 → 매입 USD 단가 × 현재 환율
        stockValueKRW += Math.round(h.avgPriceFx * h.shares * fxRate)
      } else {
        // KRW 종목 시세 없음 → 매입금 기준
        stockValueKRW += Math.round(h.avgPrice * h.shares)
      }
    }

    // 비주식 자산 + 부채
    const assets = await prisma.asset.findMany()
    const assetValueKRW = assets
      .filter((a) => !a.isLiability)
      .reduce((sum, a) => sum + a.value, 0)
    const liabilityKRW = assets
      .filter((a) => a.isLiability)
      .reduce((sum, a) => sum + a.value, 0)

    const netWorthKRW = stockValueKRW + assetValueKRW - liabilityKRW

    // 카테고리별 breakdown
    const breakdown: Record<string, number> = { stock: stockValueKRW }
    for (const a of assets) {
      const key = a.isLiability ? `liability_${a.category}` : a.category
      breakdown[key] = (breakdown[key] ?? 0) + a.value
    }

    // 전월 스냅샷 (현재 월 제외, 직전 월)
    const now = new Date()
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const latestSnapshot = await prisma.netWorthSnapshot.findFirst({
      where: { date: { lt: firstOfMonth } },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({
      netWorthKRW,
      stockValueKRW,
      assetValueKRW,
      liabilityKRW,
      breakdown,
      fxRate,
      previousSnapshot: latestSnapshot
        ? {
            date: latestSnapshot.date,
            netWorthKRW: latestSnapshot.netWorthKRW,
            change: netWorthKRW - latestSnapshot.netWorthKRW,
            changePct: latestSnapshot.netWorthKRW > 0
              ? ((netWorthKRW - latestSnapshot.netWorthKRW) / latestSnapshot.netWorthKRW) * 100
              : 0,
          }
        : null,
    })
  } catch (error) {
    console.error('GET /api/networth error:', error)
    return NextResponse.json({ error: '순자산을 계산할 수 없습니다.' }, { status: 500 })
  }
}
