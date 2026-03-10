'use client'

import { formatKRW, formatDate, formatPercent } from '@/lib/format'
import type { RSUTaxEstimate } from '@/lib/tax/income-tax'

interface RSUTaxCardProps {
  estimates: RSUTaxEstimate[]
  totalGrossIncome: number
  totalTax: number
}

export default function RSUTaxCard({ estimates, totalGrossIncome, totalTax }: RSUTaxCardProps) {
  if (estimates.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
        <div className="text-[13px] text-sub">RSU 베스팅 스케줄이 없습니다</div>
      </div>
    )
  }

  const totalEffectiveRate = totalGrossIncome > 0 ? (totalTax / totalGrossIncome) * 100 : 0

  return (
    <div className="flex flex-col gap-4">
      {/* 개별 RSU */}
      {estimates.map((e) => (
        <div key={e.scheduleId} className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-bright">
                  RSU 베스팅
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  e.status === 'vested'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {e.status === 'vested' ? '베스팅 완료' : '대기중'}
                </span>
              </div>
              <span className="text-[12px] text-dim tabular-nums">
                {formatDate(e.vestingDate)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">수량</span>
                <span className="text-[12px] text-muted tabular-nums">{e.shares}주</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">
                  {e.status === 'vested' ? '베스팅가' : '예상가'}
                </span>
                <span className="text-[12px] text-muted tabular-nums">
                  {e.vestPrice != null ? formatKRW(e.vestPrice) : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">근로소득</span>
                <span className="text-[13px] font-semibold text-bright tabular-nums">
                  {formatKRW(e.grossIncome)}
                </span>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">소득세</span>
                <span className="text-[12px] text-muted tabular-nums">{formatKRW(e.incomeTax)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">지방소득세</span>
                <span className="text-[12px] text-dim tabular-nums">{formatKRW(e.localTax)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-sub">예상 세금</span>
                <div className="text-right">
                  <span className="text-[14px] font-bold text-bright tabular-nums">{formatKRW(e.totalTax)}</span>
                  <span className="text-[11px] text-dim ml-1.5">
                    ({formatPercent(e.effectiveRate * 100)})
                  </span>
                </div>
              </div>
            </div>

            {e.status === 'pending' && e.vestPrice == null && e.grossIncome === 0 && (
              <div className="mt-3 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
                <span className="text-[11px] text-dim">
                  예상 베스팅가 미설정. RSU 관리에서 기준가를 입력하면 세금이 추정됩니다.
                </span>
              </div>
            )}
            {e.status === 'pending' && e.grossIncome > 0 && (
              <div className="mt-3 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
                <span className="text-[11px] text-yellow-400/70">
                  베스팅 전 예상치입니다. 실제 세금은 베스팅일 종가에 따라 변동됩니다.
                </span>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 합계 */}
      {estimates.length > 1 && totalTax > 0 && (
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.02] px-5 py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-sub">총 근로소득</span>
              <span className="text-[13px] font-semibold text-muted tabular-nums">{formatKRW(totalGrossIncome)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-sub">총 예상 세금</span>
              <div className="text-right">
                <span className="text-[17px] font-bold text-bright tabular-nums">{formatKRW(totalTax)}</span>
                <span className="text-[11px] text-dim ml-1.5">
                  (실효 {totalEffectiveRate.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
