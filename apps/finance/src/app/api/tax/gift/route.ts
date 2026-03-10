import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcGiftTaxSummary, GIFT_SOURCES } from '@/lib/tax/gift-tax'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        name: true,
        ownerAge: true,
        deposits: {
          where: {
            source: { in: GIFT_SOURCES },
          },
          select: { amount: true, source: true, depositedAt: true },
          orderBy: { depositedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const summaries = accounts.map((account) => {
      const isMinor = account.ownerAge != null && account.ownerAge < 19
      const summary = calcGiftTaxSummary(account.deposits, isMinor)

      return {
        accountId: account.id,
        accountName: account.name,
        ownerAge: account.ownerAge,
        isMinor,
        ...summary,
        resetDate: summary.resetDate?.toISOString() ?? null,
        firstGiftDate: summary.firstGiftDate?.toISOString() ?? null,
      }
    })

    return NextResponse.json({ summaries })
  } catch (error) {
    console.error('GET /api/tax/gift error:', error)
    return NextResponse.json({ error: '증여세 현황을 불러올 수 없습니다.' }, { status: 500 })
  }
}
