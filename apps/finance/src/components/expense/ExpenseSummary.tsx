import Card from '@/components/ui/Card'
import { formatKRW } from '@/lib/format'

interface PrevMonthData {
  totalExpense: number
  totalIncome: number
  count: number
}

interface ExpenseSummaryProps {
  totalExpense: number
  totalIncome: number
  net: number
  count: number
  year: number
  month?: number
  prevMonth?: PrevMonthData
}

function CompareBadge({ current, previous, invertColor }: { current: number; previous: number; invertColor?: boolean }) {
  if (previous === 0 && current === 0) return null
  const diff = current - previous
  if (diff === 0) {
    return <div className="text-[11px] font-semibold text-dim mt-1.5 tabular-nums">— 변동 없음</div>
  }
  const isUp = diff > 0
  // invertColor: 소비 증가 = bad(red), 수입 증가 = good(green)
  const isBad = invertColor ? isUp : !isUp
  const color = isBad ? 'text-red-400' : 'text-emerald-400'
  const arrow = isUp ? '▲' : '▼'

  // previous가 0이거나 음수 → 퍼센트 대신 금액 차이만 표시
  if (previous <= 0) {
    const absDiff = Math.abs(diff)
    return (
      <div className={`text-[11px] font-semibold mt-1.5 tabular-nums ${color}`}>
        {arrow} {isUp ? '+' : '-'}{formatKRW(absDiff)} 전월 대비
      </div>
    )
  }

  const pct = ((diff / previous) * 100).toFixed(1)

  return (
    <div className={`text-[11px] font-semibold mt-1.5 tabular-nums ${color}`}>
      {arrow} {isUp ? '+' : ''}{pct}% 전월 대비
    </div>
  )
}

export default function ExpenseSummary({
  totalExpense,
  totalIncome,
  net,
  count,
  year,
  month,
  prevMonth,
}: ExpenseSummaryProps) {
  const periodLabel = month ? `${year}년 ${month}월` : `${year}년`
  const prevNet = prevMonth ? prevMonth.totalIncome - prevMonth.totalExpense : undefined

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          {periodLabel} 소비
        </div>
        <div className="text-[20px] font-extrabold text-red-400 tabular-nums">
          {formatKRW(totalExpense)}
        </div>
        {month && prevMonth && (
          <CompareBadge current={totalExpense} previous={prevMonth.totalExpense} invertColor />
        )}
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          {periodLabel} 수입
        </div>
        <div className="text-[20px] font-extrabold text-emerald-400 tabular-nums">
          {formatKRW(totalIncome)}
        </div>
        {month && prevMonth && (
          <CompareBadge current={totalIncome} previous={prevMonth.totalIncome} />
        )}
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          순수익
        </div>
        <div className={`text-[20px] font-extrabold tabular-nums ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {net >= 0 ? '+' : ''}{formatKRW(net)}
        </div>
        {month && prevMonth && prevNet !== undefined && (
          <CompareBadge current={net} previous={prevNet} />
        )}
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          건수
        </div>
        <div className="text-[20px] font-extrabold text-bright tabular-nums">
          {count}건
        </div>
        {month && prevMonth && (
          <div className={`text-[11px] font-semibold mt-1.5 tabular-nums ${count - prevMonth.count > 0 ? 'text-dim' : count - prevMonth.count < 0 ? 'text-dim' : 'text-dim'}`}>
            {count - prevMonth.count === 0 ? '— 변동 없음' :
              `${count > prevMonth.count ? '▲' : '▼'} ${count > prevMonth.count ? '+' : ''}${count - prevMonth.count}건 전월 대비`}
          </div>
        )}
      </Card>
    </div>
  )
}
