import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import TradeForm from '@/components/trade/TradeForm'

export default async function NewTradePage() {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      holdings: {
        select: {
          ticker: true,
          displayName: true,
          market: true,
          currency: true,
          shares: true,
        },
        orderBy: { displayName: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header title="새 거래">
        <Link
          href="/trades"
          className="text-[13px] text-sub hover:text-muted transition-colors"
        >
          ← 거래 내역
        </Link>
      </Header>

      <div className="mt-6">
        <TradeForm accounts={accounts} />
      </div>
    </div>
  )
}
