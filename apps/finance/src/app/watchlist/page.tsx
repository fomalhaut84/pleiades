import Header from '@/components/layout/Header'
import WatchlistClient from './WatchlistClient'

export const dynamic = 'force-dynamic'

export default function WatchlistPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1100px]">
      <Header title="관심종목" sub="관심 종목 관리 및 현재가 모니터링" />
      <div className="mt-5">
        <WatchlistClient />
      </div>
    </div>
  )
}
