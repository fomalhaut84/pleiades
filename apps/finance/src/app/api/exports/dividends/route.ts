import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCSV, csvResponse } from '@/lib/csv'
import { formatDate } from '@/lib/format'
import { yearSchema } from '@/lib/zod-schemas'
import { zodErrorsToValidation } from '@/lib/zod-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/exports/dividends?accountId=xxx&year=2025
 * 배당내역 CSV 다운로드
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
      where.payDate = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      }
    }

    const dividends = await prisma.dividend.findMany({
      where,
      orderBy: [{ payDate: 'desc' }],
      take: 10000,
      include: { account: { select: { name: true } } },
    })

    const headers = ['지급일', '계좌', '종목명', '티커', '세전금액', '세후금액', '세금', '통화', '환율', '원화금액', '재투자']
    const rows = dividends.map((d) => [
      formatDate(d.payDate),
      d.account.name,
      d.displayName,
      d.ticker,
      String(d.amountGross),
      String(d.amountNet),
      d.taxAmount != null ? String(d.taxAmount) : '',
      d.currency,
      d.fxRate != null ? String(d.fxRate) : '',
      String(Math.round(d.amountKRW)),
      d.reinvested ? 'Y' : 'N',
    ])

    const csv = toCSV(headers, rows)
    const suffix = accountId ? `_${dividends[0]?.account.name ?? ''}` : ''
    const yearSuffix = year !== undefined ? String(year) : 'all'
    return csvResponse(csv, `dividends${suffix}_${yearSuffix}.csv`)
  } catch (error) {
    console.error('GET /api/exports/dividends error:', error)
    return new Response(JSON.stringify({ error: 'CSV 생성에 실패했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
