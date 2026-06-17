import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCSV, csvResponse } from '@/lib/csv'
import { formatDate } from '@/lib/format'
import { yearSchema } from '@/lib/zod-schemas'
import { zodErrorsToValidation } from '@/lib/zod-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/exports/deposits?accountId=xxx&year=2025
 * 증여/입금 내역 CSV 다운로드 (홈택스 신고 근거자료용)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const yearResult = yearSchema.safeParse(searchParams.get('year'))
    if (!yearResult.success) {
      const errs = zodErrorsToValidation(yearResult.error)
      return NextResponse.json({ error: errs[0].message, errors: errs }, { status: 400 })
    }
    const year = yearResult.data

    const accountId = searchParams.get('accountId')

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (year !== undefined) {
      where.depositedAt = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      }
    }

    const deposits = await prisma.deposit.findMany({
      where,
      orderBy: [{ depositedAt: 'desc' }],
      take: 10000,
      include: {
        account: { select: { name: true } },
        asset: { select: { name: true } },
      },
    })

    const headers = ['입금일', '계좌/자산', '금액(원)', '구분', '메모']
    const rows = deposits.map((d) => [
      formatDate(d.depositedAt),
      d.account?.name ?? d.asset?.name ?? '',
      String(Math.round(d.amount)),
      d.source,
      d.note ?? '',
    ])

    const csv = toCSV(headers, rows)
    const suffix = accountId ? `_${deposits[0]?.account?.name ?? ''}` : ''
    const yearSuffix = year !== undefined ? String(year) : 'all'
    return csvResponse(csv, `deposits${suffix}_${yearSuffix}.csv`)
  } catch (error) {
    console.error('GET /api/exports/deposits error:', error)
    return new Response(JSON.stringify({ error: 'CSV 생성에 실패했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
