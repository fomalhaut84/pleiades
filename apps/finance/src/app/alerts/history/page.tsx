import Header from '@/components/layout/Header'
import AlertHistoryClient from './AlertHistoryClient'

export const dynamic = 'force-dynamic'

export default function AlertHistoryPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1200px]">
      <Header
        title="알림 이력"
        sub="텔레그램으로 발송된 알림 히스토리 (기간·종류·티커 필터)"
      />
      <div className="mt-5">
        <AlertHistoryClient />
      </div>
    </div>
  )
}
