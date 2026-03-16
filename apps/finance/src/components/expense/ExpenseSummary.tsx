import Card from '@/components/ui/Card'
import { formatKRW } from '@/lib/format'

interface ExpenseSummaryProps {
  totalExpense: number
  totalIncome: number
  net: number
  count: number
  year: number
  month?: number
}

export default function ExpenseSummary({
  totalExpense,
  totalIncome,
  net,
  count,
  year,
  month,
}: ExpenseSummaryProps) {
  const periodLabel = month ? `${year}년 ${month}월` : `${year}년`

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          {periodLabel} 소비
        </div>
        <div className="text-[20px] font-extrabold text-red-400 tabular-nums">
          {formatKRW(totalExpense)}
        </div>
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          {periodLabel} 수입
        </div>
        <div className="text-[20px] font-extrabold text-emerald-400 tabular-nums">
          {formatKRW(totalIncome)}
        </div>
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          순수익
        </div>
        <div className={`text-[20px] font-extrabold tabular-nums ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {net >= 0 ? '+' : ''}{formatKRW(net)}
        </div>
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          거래 건수
        </div>
        <div className="text-[20px] font-extrabold text-bright tabular-nums">
          {count}건
        </div>
      </Card>
    </div>
  )
}
