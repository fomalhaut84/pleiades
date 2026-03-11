import Card from '@/components/ui/Card'
import { formatKRW } from '@/lib/format'

interface DividendSummaryProps {
  totalNetKRW: number
  totalTaxKRW: number
  reinvestedCount: number
  totalCount: number
  year: number
}

export default function DividendSummary({
  totalNetKRW,
  totalTaxKRW,
  reinvestedCount,
  totalCount,
  year,
}: DividendSummaryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          {year}년 세후 배당금
        </div>
        <div className="text-[20px] font-extrabold text-bright tabular-nums">
          {formatKRW(totalNetKRW)}
        </div>
        <div className="text-[11px] text-sub mt-1">{totalCount}건</div>
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          원천징수 세금
        </div>
        <div className="text-[20px] font-extrabold text-bright tabular-nums">
          {formatKRW(totalTaxKRW)}
        </div>
        <div className="text-[11px] text-sub mt-1">배당소득세</div>
      </Card>

      <Card>
        <div className="text-[11px] text-dim font-semibold tracking-wide uppercase mb-2">
          재투자
        </div>
        <div className="text-[20px] font-extrabold text-bright tabular-nums">
          {reinvestedCount}건
        </div>
        <div className="text-[11px] text-sub mt-1">
          {totalCount > 0 ? `${Math.round((reinvestedCount / totalCount) * 100)}%` : '0%'}
        </div>
      </Card>
    </div>
  )
}
