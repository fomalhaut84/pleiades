'use client'

import { formatKRW, formatUSD } from '@/lib/format'
import type { DividendTaxSummary } from '@/lib/tax/dividend-tax'

interface DividendTaxCardProps {
  summary: DividendTaxSummary
  year: number
}

export default function DividendTaxCard({ summary, year }: DividendTaxCardProps) {
  if (summary.totalCount === 0) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
        <div className="text-[13px] text-sub">{year}년 배당 수령 내역이 없습니다</div>
      </div>
    )
  }

  const gaugePercent = Math.min(summary.usageRate * 100, 100)
  const formatByCurrency = (amount: number, currency: string) =>
    currency === 'USD' ? formatUSD(amount) : formatKRW(amount)

  return (
    <div className="flex flex-col gap-4">
      {/* 요약 카드 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-4">
          {/* 3열 요약 */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-[11px] text-dim mb-0.5">세전 배당 (YTD)</div>
              <div className="text-[15px] font-bold text-bright tabular-nums">
                {formatKRW(summary.totalGrossKRW)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-dim mb-0.5">원천징수 합계</div>
              <div className="text-[15px] font-bold text-muted tabular-nums">
                {formatKRW(summary.totalTaxKRW)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-dim mb-0.5">세후 수령 합계</div>
              <div className="text-[15px] font-bold text-green-400 tabular-nums">
                {formatKRW(summary.totalNetKRW)}
              </div>
            </div>
          </div>

          {/* 금융소득종합과세 게이지 */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-sub">금융소득종합과세 기준선 (배당소득 기준)</span>
              <span className="text-[11px] text-dim tabular-nums">
                {formatKRW(summary.totalGrossKRW)} / {formatKRW(summary.threshold)}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  summary.exceeded
                    ? 'bg-red-400'
                    : summary.usageRate > 0.8
                      ? 'bg-yellow-400'
                      : 'bg-green-400'
                }`}
                style={{ width: `${gaugePercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={`text-[10px] font-bold ${
                summary.exceeded
                  ? 'text-red-400'
                  : summary.usageRate > 0.8
                    ? 'text-yellow-400'
                    : 'text-green-400/70'
              }`}>
                {(summary.usageRate * 100).toFixed(1)}%
              </span>
              {summary.exceeded ? (
                <span className="text-[10px] text-red-400">
                  기준선 초과 — 종합과세 대상
                </span>
              ) : (
                <span className="text-[10px] text-dim">
                  잔여 {formatKRW(summary.remaining)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 종목별 배당소득세 내역 */}
      {summary.byTicker.length > 0 && (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
            <div className="text-[13px] font-bold text-bright">종목별 배당소득</div>
            <div className="text-[12px] text-sub">{summary.totalCount}건</div>
          </div>

          <div className="divide-y divide-white/[0.025]">
            {summary.byTicker.map((t) => (
              <div key={`${t.ticker}:${t.currency}`} className="px-5 py-3 hover:bg-white/[0.015]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-bright">{t.displayName}</span>
                    <span className="text-[10px] text-dim px-1 py-0.5 rounded bg-white/[0.04]">
                      {t.currency === 'USD' ? 'USD' : 'KRW'}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold text-green-400 tabular-nums">
                    {formatKRW(t.totalNetKRW)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-dim">
                  <span className="tabular-nums">
                    세전 {formatByCurrency(t.totalGross, t.currency)} · 세금 {formatByCurrency(t.totalTax, t.currency)} · {t.count}건
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.exceeded && (
        <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-2.5">
          <span className="text-[11px] text-red-400/70">
            연간 금융소득이 2,000만원을 초과하면 종합소득세 신고 대상입니다. 세무사 상담을 권장합니다.
          </span>
        </div>
      )}
    </div>
  )
}
