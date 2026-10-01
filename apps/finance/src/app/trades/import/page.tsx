import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import ImportWizard from '@/components/trade/import/ImportWizard'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const accounts = await prisma.account.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header title="CSV 가져오기" sub="증권사 거래내역 일괄 등록">
        <Link
          href="/trades"
          className="text-[13px] text-sub hover:text-muted transition-colors"
        >
          ← 거래 내역
        </Link>
      </Header>

      <div className="mt-6">
        <ImportWizard accounts={accounts} />
      </div>
    </div>
  )
}
