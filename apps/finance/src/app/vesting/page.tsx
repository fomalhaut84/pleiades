import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import VestingCalendar from '@/components/vesting/VestingCalendar'
import VestingList from '@/components/vesting/VestingList'
import VestingDistribution from '@/components/vesting/VestingDistribution'
import Disclaimer from '@/components/ui/Disclaimer'
import { toVestingEvents, toKSTDateString, upcomingEvents, diffDaysKST } from '@/lib/vesting-events'

export const dynamic = 'force-dynamic'

const UPCOMING_DAYS = 90
const EXPIRING_SOON_DAYS = 90

export default async function VestingPage() {
  const [rsus, options] = await Promise.all([
    prisma.rSUSchedule.findMany({
      include: { account: { select: { name: true } } },
      orderBy: { vestingDate: 'asc' },
    }),
    prisma.stockOption.findMany({
      include: {
        account: { select: { name: true } },
        vestings: { orderBy: { vestingDate: 'asc' } },
      },
      orderBy: { grantDate: 'asc' },
    }),
  ])

  const events = toVestingEvents(rsus, options)
  const todayMs = Date.now()
  const todayKey = toKSTDateString(new Date(todayMs))
  const thisMonthPrefix = todayKey.slice(0, 7)
  const currentYear = todayKey.slice(0, 4)

  const thisMonthCount = events.filter((e) => e.date.startsWith(thisMonthPrefix)).length
  const upcomingCount = upcomingEvents(events, UPCOMING_DAYS, todayMs).length
  // YTD: 올해 완료된 베스팅만 (전체 누적 X)
  const ytdCompletedCount = events.filter(
    (e) =>
      (e.status === 'vested' || e.status === 'exercised') &&
      e.date.startsWith(currentYear),
  ).length

  // 만료 임박: 옵션 expiryDate D-90 이내 (오늘 포함) + remainingShares > 0 (행사 기회 임박).
  // 이미 만료된 옵션은 cron 이 vesting.status='expired' 만 처리하고 StockOption.remainingShares 는
  // 차감하지 않아 매년 누적되는 잘못된 메트릭이 됨 → 본 카드에서는 제외하고 임박만 표기.
  let expiringSoonCount = 0
  for (const opt of options) {
    if (opt.remainingShares <= 0) continue
    const days = diffDaysKST(toKSTDateString(opt.expiryDate), todayMs)
    if (days >= 0 && days <= EXPIRING_SOON_DAYS) expiringSoonCount += 1
  }

  const summaryCards: Array<{ label: string; value: string; sub?: string; color?: string }> = [
    { label: '이번 달 이벤트', value: `${thisMonthCount}건` },
    { label: '다가오는 이벤트', value: `${upcomingCount}건`, sub: `${UPCOMING_DAYS}일 이내` },
    { label: `${currentYear} 완료`, value: `${ytdCompletedCount}건`, color: 'text-sejin' },
    {
      label: '만료 임박',
      value: `${expiringSoonCount}건`,
      sub: `${EXPIRING_SOON_DAYS}일 이내`,
      color: 'text-amber-400',
    },
  ]

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1080px] flex flex-col gap-6">
      <Header title="베스팅 캘린더">
        <a
          href="/api/exports/vesting.ics"
          download="vesting.ics"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-sub border border-border hover:bg-surface hover:text-bright transition-colors"
        >
          📅 캘린더 내보내기
        </a>
      </Header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-card border border-border rounded-xl px-4 py-3.5 flex flex-col gap-1"
          >
            <span className="text-[10px] text-dim tracking-[1.2px] uppercase">{card.label}</span>
            <span className={`text-[20px] font-bold tabular-nums ${card.color ?? 'text-bright'}`}>
              {card.value}
            </span>
            {card.sub && <span className="text-[11px] text-sub">{card.sub}</span>}
          </div>
        ))}
      </section>

      <VestingCalendar events={events} todayMs={todayMs} />

      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-4">
        <VestingList events={events} todayMs={todayMs} days={UPCOMING_DAYS} />
        <div className="flex flex-col gap-4">
          <VestingDistribution events={events} todayMs={todayMs} days={UPCOMING_DAYS} />
          <Disclaimer>
            베스팅 정보는 입력 데이터 기반 예측이며, 실제 행사 가능일은 회사 정책에 따라 달라질 수 있습니다.
          </Disclaimer>
        </div>
      </section>
    </div>
  )
}
