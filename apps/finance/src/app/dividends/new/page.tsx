import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import DividendForm from '@/components/dividend/DividendForm'

export default async function NewDividendPage() {
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
        },
        orderBy: { displayName: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header title="배당 기록">
        <Link
          href="/dividends"
          className="text-[13px] text-sub hover:text-muted transition-colors"
        >
          ← 배당 내역
        </Link>
      </Header>

      <div className="mt-6">
        <DividendForm accounts={accounts} />
      </div>
    </div>
  )
}
