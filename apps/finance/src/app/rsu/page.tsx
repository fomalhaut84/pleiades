import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import RSUDashboard from '@/components/rsu/RSUDashboard'

export const dynamic = 'force-dynamic'

export default async function RSUPage() {
  const schedules = await prisma.rSUSchedule.findMany({
    orderBy: { vestingDate: 'asc' },
    include: { account: { select: { id: true, name: true } } },
  })

  const serialized = schedules.map((s) => ({
    ...s,
    vestingDate: s.vestingDate.toISOString(),
    basisDate: s.basisDate?.toISOString() ?? null,
    vestedAt: s.vestedAt?.toISOString() ?? null,
  }))

  const pendingCount = schedules.filter((s) => s.status === 'pending').length
  const vestedCount = schedules.filter((s) => s.status === 'vested').length

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header
        title="RSU 관리"
        sub={`총 ${schedules.length}건 (대기 ${pendingCount} · 완료 ${vestedCount})`}
      />

      <div className="mt-5">
        <RSUDashboard schedules={serialized} />
      </div>
    </div>
  )
}
