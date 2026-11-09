'use client'

import { formatPercent } from '@/lib/format'

// pleiades#554 · 010 — 현금흐름 보정값. null = 분모가 너무 작아 계산하지 않음("—")
interface HoldingContribution {
  ticker: string
  displayName: string
  weightStart: number
  weightEnd: number
  returnPct: number | null
  contribution: number | null
}

interface ContributionData {
  accountName: string
  holdings: HoldingContribution[]
  totalReturn: number | null
  hasData: boolean
}

const DASH = '—'

interface ContributionTableProps {
  data: ContributionData | null
  loading: boolean
}

function returnColor(value: number | null): string {
  if (value === null) return 'text-dim'
  return value >= 0 ? 'text-green-400' : 'text-red-400'
}

function signedPercent(value: number | null, digits: number): string {
  if (value === null) return DASH
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

export default function ContributionTable({ data, loading }: ContributionTableProps) {
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
        <div className="animate-pulse flex flex-col gap-3">
          <div className="h-4 bg-surface-dim rounded w-32" />
          <div className="h-40 bg-surface-dim rounded" />
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
          기간 수익률 {data.totalReturn === null ? DASH : formatPercent(data.totalReturn)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-dim border-b border-border">
              <th className="text-left py-2 font-medium">종목</th>
              <th className="text-right py-2 font-medium">비중</th>
              <th className="text-right py-2 font-medium">수익률</th>
              <th className="text-right py-2 font-medium">기여도</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr key={h.ticker} className="border-b border-border">
                <td className="py-2.5 text-bright font-medium">{h.displayName}</td>
                <td className="py-2.5 text-right text-sub tabular-nums">
                  {h.weightStart.toFixed(1)}%
                </td>
                <td className={`py-2.5 text-right tabular-nums font-semibold ${returnColor(h.returnPct)}`}>
                  {h.returnPct === null ? DASH : formatPercent(h.returnPct)}
                </td>
                <td className={`py-2.5 text-right tabular-nums font-semibold ${returnColor(h.contribution)}`}>
                  {signedPercent(h.contribution, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-dim">
        현금흐름 보정값입니다 — 기간 중 매수·매도·vest 는 빼고 세후 배당은 더했습니다. 위 TWR 과 다를 수 있습니다.
        ‘{DASH}’ 는 분모가 너무 작아 계산하지 않은 값이고, 주식 분할은 매매로 보일 수 있습니다.
      </p>
    </div>
  )
}
