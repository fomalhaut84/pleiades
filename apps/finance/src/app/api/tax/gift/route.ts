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

    // 비주식 자산 증여 (owner별)
    const assetDeposits = await prisma.deposit.findMany({
      where: {
        assetId: { not: null },
        source: { in: GIFT_SOURCES },
      },
      select: { amount: true, source: true, depositedAt: true, asset: { select: { owner: true } } },
      orderBy: { depositedAt: 'asc' },
    })

    const assetDepositsByOwner = new Map<string, { amount: number; source: string; depositedAt: Date }[]>()
    for (const d of assetDeposits) {
      const owner = d.asset?.owner ?? ''
      if (!owner) continue
      const list = assetDepositsByOwner.get(owner) ?? []
      list.push({ amount: d.amount, source: d.source, depositedAt: d.depositedAt })
      assetDepositsByOwner.set(owner, list)
    }

    const summaries = accounts.map((account) => {
      const isMinor = account.ownerAge != null && account.ownerAge < 19
      const ownerAssetDeposits = assetDepositsByOwner.get(account.name) ?? []
      const allDeposits = [...account.deposits, ...ownerAssetDeposits]
        .sort((a, b) => new Date(a.depositedAt).getTime() - new Date(b.depositedAt).getTime())

      const summary = calcGiftTaxSummary(allDeposits, isMinor)

      return {
        accountId: account.id,
        accountName: account.name,
        ownerAge: account.ownerAge,
        isMinor,
        ...summary,
        resetDate: summary.resetDate?.toISOString() ?? null,
        firstGiftDate: summary.firstGiftDate?.toISOString() ?? null,
        accountGifted: account.deposits.reduce((s, d) => s + d.amount, 0),
        assetGifted: ownerAssetDeposits.reduce((s, d) => s + d.amount, 0),
      }
    })

    return NextResponse.json({ summaries })
  } catch (error) {
    console.error('GET /api/tax/gift error:', error)
    return NextResponse.json({ error: '증여세 현황을 불러올 수 없습니다.' }, { status: 500 })
  }
}
