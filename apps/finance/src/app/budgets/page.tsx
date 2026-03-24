import Header from '@/components/layout/Header'
import BudgetsClient from './BudgetsClient'

export const dynamic = 'force-dynamic'

export default function BudgetsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[900px]">
      <Header title="예산" sub="월별 예산 설정 및 소비 현황" />
      <div className="mt-5">
        <BudgetsClient />
      </div>
    </div>
  )
}
