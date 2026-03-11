import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const yearStr = searchParams.get('year')
    const accountId = searchParams.get('accountId')
    if (yearStr && !/^\d{4}$/.test(yearStr)) {
      return NextResponse.json({ error: '유효한 연도를 입력해주세요.' }, { status: 400 })
    }
    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear()

    const where: Record<string, unknown> = {
      payDate: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    }
    if (accountId) where.accountId = accountId

    const dividends = await prisma.dividend.findMany({
      where,
      include: { account: { select: { name: true } } },
    })

    const totalNetKRW = dividends.reduce((sum, d) => sum + d.amountKRW, 0)
    const totalTaxKRW = dividends.reduce((sum, d) => {
      if (!d.taxAmount) return sum
      if (d.currency === 'USD') return sum + Math.round(d.taxAmount * (d.fxRate ?? 0))
      return sum + Math.round(d.taxAmount)
    }, 0)
    const reinvestedCount = dividends.filter((d) => d.reinvested).length

    // byAccount
    const accountMap = new Map<string, { name: string; totalNetKRW: number; count: number }>()
    for (const d of dividends) {
      const key = d.accountId
      const entry = accountMap.get(key) ?? { name: d.account.name, totalNetKRW: 0, count: 0 }
      entry.totalNetKRW += d.amountKRW
      entry.count += 1
      accountMap.set(key, entry)
    }
    const byAccount = Array.from(accountMap.entries()).map(([accountId, v]) => ({
      accountId,
      ...v,
    }))

    // byTicker
    const tickerMap = new Map<string, { displayName: string; totalNetKRW: number; count: number }>()
    for (const d of dividends) {
      const entry = tickerMap.get(d.ticker) ?? { displayName: d.displayName, totalNetKRW: 0, count: 0 }
      entry.totalNetKRW += d.amountKRW
      entry.count += 1
      tickerMap.set(d.ticker, entry)
    }
    const byTicker = Array.from(tickerMap.entries())
      .map(([ticker, v]) => ({ ticker, ...v }))
      .sort((a, b) => b.totalNetKRW - a.totalNetKRW)

    // byMonth (1~12)
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      totalNetKRW: 0,
      count: 0,
    }))
    for (const d of dividends) {
      const month = new Date(d.payDate).getUTCMonth()
      byMonth[month].totalNetKRW += d.amountKRW
      byMonth[month].count += 1
    }

    return NextResponse.json({
      year,
      totalNetKRW: Math.round(totalNetKRW),
      totalTaxKRW: Math.round(totalTaxKRW),
      reinvestedCount,
      totalCount: dividends.length,
      byAccount,
      byTicker,
      byMonth,
    })
  } catch (error) {
    console.error('GET /api/dividends/summary error:', error)
    return NextResponse.json(
      { error: '배당 요약을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}
