import { formatKRW } from '@/lib/format'

interface MonthData {
  month: number
  totalNetKRW: number
  count: number
}

interface DividendCalendarProps {
  byMonth: MonthData[]
  year: number
}

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

export default function DividendCalendar({ byMonth, year }: DividendCalendarProps) {
  const maxAmount = Math.max(...byMonth.map((m) => m.totalNetKRW), 1)

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border">
        <div className="text-[13px] font-bold text-bright">{year}년 월별 배당</div>
      </div>
      <div className="p-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
        {byMonth.map((m, i) => {
          const intensity = m.totalNetKRW > 0 ? Math.max(0.1, m.totalNetKRW / maxAmount) : 0
          return (
            <div
              key={i}
              className="rounded-lg border border-border p-3 transition-all"
              style={{
                backgroundColor: intensity > 0 ? `rgba(96, 165, 250, ${intensity * 0.15})` : 'var(--surface-dim)',
              }}
            >
              <div className="text-[11px] font-semibold text-sub mb-1.5">{MONTH_LABELS[i]}</div>
              {m.count > 0 ? (
                <>
                  <div className="text-[13px] font-bold text-bright tabular-nums">
                    {formatKRW(m.totalNetKRW)}
                  </div>
                  <div className="text-[10px] text-dim mt-0.5">{m.count}건</div>
                </>
              ) : (
                <div className="text-[12px] text-dim">-</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
