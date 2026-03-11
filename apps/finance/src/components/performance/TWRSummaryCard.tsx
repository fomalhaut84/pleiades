'use client'

import { formatPercent } from '@/lib/format'
import { BENCHMARK_DISPLAY_NAMES } from '@/lib/performance/constants'

interface TWRData {
  accountId: string
  accountName: string
  twr: number | null
  benchmarkReturn: number | null
  alpha: number | null
  benchmarkTicker: string | null
  snapshotCount: number
}

interface TWRSummaryCardProps {
  data: TWRData[]
  loading: boolean
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': '#34d399',
  '소담': '#60a5fa',
  '다솜': '#fb923c',
}

function returnColor(value: number | null): string {
  if (value === null) return 'text-dim'
  return value >= 0 ? 'text-green-400' : 'text-red-400'
}

export default function TWRSummaryCard({ data, loading }: TWRSummaryCardProps) {
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
        <div className="animate-pulse flex flex-col gap-3">
          <div className="h-4 bg-white/[0.04] rounded w-32" />
          <div className="h-20 bg-white/[0.04] rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
      <h3 className="text-[13px] font-bold text-bright mb-4">TWR 수익률</h3>

      <div className="grid gap-3">
        {data.map((item) => {
          const benchmarkName = item.benchmarkTicker
            ? (BENCHMARK_DISPLAY_NAMES[item.benchmarkTicker] ?? item.benchmarkTicker)
            : null

          return (
            <div
              key={item.accountId}
              className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-4 py-3 border border-white/[0.04]"
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: ACCOUNT_COLORS[item.accountName] ?? '#9494a8' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-bright">{item.accountName}</div>
                {benchmarkName && (
                  <div className="text-[10px] text-dim">vs {benchmarkName}</div>
                )}
              </div>

              {typeof item.twr === 'number' ? (
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-[10px] text-dim">TWR</div>
                    <div className={`text-[14px] font-bold tabular-nums ${returnColor(item.twr)}`}>
                      {formatPercent(item.twr)}
                    </div>
                  </div>
                  {typeof item.benchmarkReturn === 'number' && (
                    <div>
                      <div className="text-[10px] text-dim">벤치마크</div>
                      <div className={`text-[14px] font-bold tabular-nums ${returnColor(item.benchmarkReturn)}`}>
                        {formatPercent(item.benchmarkReturn)}
                      </div>
                    </div>
                  )}
                  {typeof item.alpha === 'number' && (
                    <div>
                      <div className="text-[10px] text-dim">알파</div>
                      <div className={`text-[14px] font-bold tabular-nums ${returnColor(item.alpha)}`}>
                        {formatPercent(item.alpha)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-dim">
                  스냅샷 {item.snapshotCount}개 (2개 이상 필요)
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
