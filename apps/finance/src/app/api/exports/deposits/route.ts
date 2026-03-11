import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCSV, csvResponse } from '@/lib/csv'
import { formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * GET /api/exports/deposits?accountId=xxx&year=2025
 * 증여/입금 내역 CSV 다운로드 (홈택스 신고 근거자료용)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const year = searchParams.get('year')

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (year && /^\d{4}$/.test(year)) {
      const y = parseInt(year)
      where.depositedAt = {
        gte: new Date(`${y}-01-01`),
        lt: new Date(`${y + 1}-01-01`),
      }
    }

    const deposits = await prisma.deposit.findMany({
      where,
      orderBy: [{ depositedAt: 'desc' }],
      take: 10000,
      include: { account: { select: { name: true } } },
    })

    const headers = ['입금일', '계좌', '금액(원)', '구분', '메모']
    const rows = deposits.map((d) => [
      formatDate(d.depositedAt),
      d.account.name,
      String(Math.round(d.amount)),
      d.source,
      d.note ?? '',
    ])

    const csv = toCSV(headers, rows)
    const suffix = accountId ? `_${deposits[0]?.account.name ?? ''}` : ''
    const yearSuffix = year ?? 'all'
    return csvResponse(csv, `deposits${suffix}_${yearSuffix}.csv`)
  } catch (error) {
    console.error('GET /api/exports/deposits error:', error)
    return new Response(JSON.stringify({ error: 'CSV 생성에 실패했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
