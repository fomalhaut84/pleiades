import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import PerformanceClient from './PerformanceClient'

export const dynamic = 'force-dynamic'

export default async function PerformancePage() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })

  const snapshotCount = await prisma.portfolioSnapshot.count()

  return (
    <div className="px-8 py-7 max-w-[1100px]">
      <Header title="수익률 분석" sub="TWR 기반 운용 성과 · 벤치마크 비교 · 종목 기여도" />
      <PerformanceClient
        accounts={accounts}
        hasSnapshots={snapshotCount >= 2}
      />
      <p className="mt-6 text-[11px] text-dim">
        수익률은 TWR(시간가중수익률) 기반 참고용이며, 실제 투자 성과와 다를 수 있습니다.
      </p>
    </div>
  )
}
