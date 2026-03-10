'use client'

import { formatKRW, formatDate } from '@/lib/format'

interface GiftTaxGaugeProps {
  accountName: string
  ownerAge: number | null
  isMinor: boolean
  totalGifted: number
  exemptLimit: number
  usageRate: number
  remaining: number
  estimatedTax: number
  resetDate: string | null
  firstGiftDate: string | null
}

const ACCOUNT_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  '세진': { bar: 'bg-sejin', text: 'text-sejin', bg: 'bg-sejin/10' },
  '소담': { bar: 'bg-sodam', text: 'text-sodam', bg: 'bg-sodam/10' },
  '다솜': { bar: 'bg-dasom', text: 'text-dasom', bg: 'bg-dasom/10' },
}

export default function GiftTaxGauge({
  accountName,
  ownerAge,
  isMinor,
  totalGifted,
  exemptLimit,
  usageRate,
  remaining,
  estimatedTax,
  resetDate,
  firstGiftDate,
}: GiftTaxGaugeProps) {
  const colors = ACCOUNT_COLORS[accountName] ?? { bar: 'bg-dim', text: 'text-muted', bg: 'bg-white/5' }
  const clampedRate = Math.min(usageRate, 1)
  const isOver = remaining < 0

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className={`text-[15px] font-bold ${colors.text}`}>{accountName}</span>
            {ownerAge != null && (
              <span className="text-[11px] text-dim px-1.5 py-0.5 rounded bg-white/[0.04]">
                {ownerAge}세 · {isMinor ? '미성년' : '성인'}
              </span>
            )}
          </div>
          <div className="text-right">
            <div className={`text-[13px] font-bold tabular-nums ${isOver ? 'text-red-400' : 'text-bright'}`}>
              {formatKRW(totalGifted)}
            </div>
            <div className="text-[11px] text-dim">
              / {formatKRW(exemptLimit)}
            </div>
          </div>
        </div>

        {/* Gauge Bar */}
        <div className="relative h-3 rounded-full bg-white/[0.04] overflow-hidden mb-3">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
              isOver ? 'bg-red-400/80' : colors.bar
            }`}
            style={{ width: `${Math.min(clampedRate * 100, 100)}%` }}
          />
          {isOver && (
            <div
              className="absolute inset-y-0 rounded-full bg-red-500/30"
              style={{ left: '100%', width: `${Math.min((usageRate - 1) * 100, 50)}%` }}
            />
          )}
        </div>

        {/* Usage percentage */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-[12px] font-semibold ${isOver ? 'text-red-400' : colors.text}`}>
            {(usageRate * 100).toFixed(1)}% 사용
          </span>
          <span className={`text-[12px] tabular-nums ${isOver ? 'text-red-400' : 'text-sub'}`}>
            {isOver ? `${formatKRW(Math.abs(remaining))} 초과` : `${formatKRW(remaining)} 잔여`}
          </span>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3">
          {firstGiftDate && (
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-dim mb-0.5">최초 증여일</div>
              <div className="text-[12px] text-muted tabular-nums">{formatDate(firstGiftDate)}</div>
            </div>
          )}
          {resetDate && (
            <div className="bg-white/[0.02] rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-dim mb-0.5">10년 리셋</div>
              <div className="text-[12px] text-muted tabular-nums">{formatDate(resetDate)}</div>
            </div>
          )}
        </div>

        {/* Estimated tax if over */}
        {isOver && estimatedTax > 0 && (
          <div className="mt-3 bg-red-500/10 border border-red-500/15 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] text-red-400/80">예상 증여세</span>
            <span className="text-[13px] font-bold text-red-400 tabular-nums">{formatKRW(estimatedTax)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
