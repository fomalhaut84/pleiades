import Link from 'next/link'
import { formatKRW } from '@/lib/format'
import { diffDaysKST, upcomingEvents, type VestingEvent } from '@/lib/vesting-events'

interface Props {
  events: VestingEvent[]
  todayMs: number
  days: number
}

function formatDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${m}월 ${d}일`
}

function dayLabel(diff: number): string {
  if (diff === 0) return '오늘'
  if (diff === 1) return '내일'
  return `D-${diff}`
}

function statusBadge(event: VestingEvent): { text: string; cls: string } | null {
  if (event.status === 'exercisable') return { text: '행사 가능', cls: 'bg-sodam/15 text-sodam' }
  if (event.status === 'vested') return { text: '베스팅 완료', cls: 'bg-sejin/15 text-sejin' }
  return null
}

function formatShares(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function VestingList({ events, todayMs, days }: Props) {
  const upcoming = upcomingEvents(events, days, todayMs)
  const totalShares = upcoming.reduce((sum, e) => sum + e.shares, 0)

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <h3 className="text-[14px] font-bold text-bright">다가오는 {days}일</h3>
        <span className="text-[11px] text-sub tabular-nums">
          {upcoming.length}건 · {formatShares(totalShares)}주
        </span>
      </div>
      {upcoming.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12px] text-dim">다가오는 베스팅이 없습니다.</p>
      ) : (
        <ul className="flex flex-col">
          {upcoming.map((ev) => {
            const diff = diffDaysKST(ev.date, todayMs)
            const accent = ev.type === 'RSU' ? 'bg-sejin' : 'bg-sodam'
            const typeLabel = ev.type === 'RSU' ? 'RSU' : 'OPT'
            const typeColor = ev.type === 'RSU' ? 'text-sejin' : 'text-sodam'
            const badge = statusBadge(ev)
            return (
              <li key={ev.id}>
                <Link
                  href={ev.link}
                  className="flex items-stretch gap-3 px-5 py-3 border-b border-border last:border-b-0 hover:bg-surface transition-colors"
                >
                  <span className={`w-[3px] rounded-full ${accent}`} />
                  <div className="flex-1 flex items-center gap-4 min-w-0">
                    <div className="flex flex-col w-[88px] shrink-0">
                      <span className="text-[13px] font-bold text-bright tabular-nums">
                        {formatDateLabel(ev.date)}
                      </span>
                      <span className="text-[10px] text-dim tabular-nums tracking-wide">
                        {dayLabel(diff)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold tracking-[1.2px] uppercase ${typeColor}`}>
                          {typeLabel}
                        </span>
                        <span className="text-[13px] font-semibold text-bright truncate">
                          {ev.displayName}
                        </span>
                      </div>
                      <span className="text-[11px] text-sub">
                        {ev.accountName} · {formatShares(ev.shares)}주
                        {ev.meta?.strikePrice
                          ? ` · 행사가 ${formatKRW(ev.meta.strikePrice)}`
                          : ''}
                      </span>
                    </div>
                    {badge && (
                      <span className={`px-1.5 py-px rounded text-[10px] font-bold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
