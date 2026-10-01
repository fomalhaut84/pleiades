import Header from '@/components/layout/Header'
import RecurringClient from './RecurringClient'

export const dynamic = 'force-dynamic'

export default function RecurringPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      <Header title="반복 거래" sub="자동 생성되는 정기 내역" />
      <div className="mt-5">
        <RecurringClient />
      </div>
    </div>
  )
}
