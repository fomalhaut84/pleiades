'use client'

import { formatPercent } from '@/lib/format'

interface HoldingContribution {
  ticker: string
  displayName: string
  weightStart: number
  weightEnd: number
  returnPct: number
  contribution: number
}

interface ContributionData {
  accountName: string
  holdings: HoldingContribution[]
  totalReturn: number
  hasData: boolean
}

interface ContributionTableProps {
  data: ContributionData | null
  loading: boolean
}

function returnColor(value: number): string {
  return value >= 0 ? 'text-green-400' : 'text-red-400'
}

export default function ContributionTable({ data, loading }: ContributionTableProps) {
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
        <div className="animate-pulse flex flex-col gap-3">
          <div className="h-4 bg-white/[0.04] rounded w-32" />
          <div className="h-40 bg-white/[0.04] rounded" />
        </div>
      </div>
    )
  }

  if (!data || !data.hasData) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
        <h3 className="text-[13px] font-bold text-bright mb-3">종목별 기여도</h3>
        <div className="text-[12px] text-dim text-center py-6">
          스냅샷이 2개 이상 쌓이면 종목별 기여도가 표시됩니다.
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-bold text-bright">종목별 기여도</h3>
        <span className={`text-[12px] font-bold tabular-nums ${returnColor(data.totalReturn)}`}>
          전체 {formatPercent(data.totalReturn)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-dim border-b border-white/[0.06]">
              <th className="text-left py-2 font-medium">종목</th>
              <th className="text-right py-2 font-medium">비중</th>
              <th className="text-right py-2 font-medium">수익률</th>
              <th className="text-right py-2 font-medium">기여도</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr key={h.ticker} className="border-b border-white/[0.03]">
                <td className="py-2.5 text-bright font-medium">{h.displayName}</td>
                <td className="py-2.5 text-right text-sub tabular-nums">
                  {h.weightStart.toFixed(1)}%
                </td>
                <td className={`py-2.5 text-right tabular-nums font-semibold ${returnColor(h.returnPct)}`}>
                  {formatPercent(h.returnPct)}
                </td>
                <td className={`py-2.5 text-right tabular-nums font-semibold ${returnColor(h.contribution)}`}>
                  {h.contribution >= 0 ? '+' : ''}{h.contribution.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
