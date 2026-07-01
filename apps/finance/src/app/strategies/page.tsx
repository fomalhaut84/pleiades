import Header from '@/components/layout/Header'
import StrategiesClient from './StrategiesClient'

export const dynamic = 'force-dynamic'

export default function StrategiesPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1200px]">
      <Header
        title="커스텀 전략"
        sub="자연어로 등록한 조건을 시스템이 감시 → 텔레그램 알림"
      />
      <div className="mt-5">
        <StrategiesClient />
      </div>
    </div>
  )
}
