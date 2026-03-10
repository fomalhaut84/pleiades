import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import DepositForm from '@/components/deposit/DepositForm'

export default async function NewDepositPage() {
  const accounts = await prisma.account.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header title="입금 기록">
        <Link
          href="/deposits"
          className="text-[13px] text-sub hover:text-muted transition-colors"
        >
          ← 입금 내역
        </Link>
      </Header>

      <div className="mt-6">
        <DepositForm accounts={accounts} />
      </div>
    </div>
  )
}
