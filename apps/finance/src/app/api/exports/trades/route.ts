import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCSV, csvResponse } from '@/lib/csv'
import { formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * GET /api/exports/trades?accountId=xxx&year=2025
 * 거래내역 CSV 다운로드
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const type = searchParams.get('type')
    const year = searchParams.get('year')

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (type && ['BUY', 'SELL'].includes(type)) where.type = type
    if (year && /^\d{4}$/.test(year)) {
      const y = parseInt(year)
      where.tradedAt = {
        gte: new Date(`${y}-01-01`),
        lt: new Date(`${y + 1}-01-01`),
      }
    }

    const trades = await prisma.trade.findMany({
      where,
      orderBy: [{ tradedAt: 'desc' }],
      take: 10000,
      include: { account: { select: { name: true } } },
    })

    const headers = ['거래일', '계좌', '종목명', '티커', '시장', '유형', '수량', '단가', '통화', '환율', '총액(원)', '메모']
    const rows = trades.map((t) => [
      formatDate(t.tradedAt),
      t.account.name,
      t.displayName,
      t.ticker,
      t.market,
      t.type === 'BUY' ? '매수' : '매도',
      String(t.shares),
      String(t.price),
      t.currency,
      t.fxRate != null ? String(t.fxRate) : '',
      String(Math.round(t.totalKRW)),
      t.note ?? '',
    ])

    const csv = toCSV(headers, rows)
    const suffix = accountId ? `_${trades[0]?.account.name ?? ''}` : ''
    const yearSuffix = year ?? 'all'
    return csvResponse(csv, `trades${suffix}_${yearSuffix}.csv`)
  } catch (error) {
    console.error('GET /api/exports/trades error:', error)
    return new Response(JSON.stringify({ error: 'CSV 생성에 실패했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
