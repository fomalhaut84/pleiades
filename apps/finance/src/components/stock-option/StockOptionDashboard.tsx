'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW, formatUSD, formatDate } from '@/lib/format'
import type { StockOptionOverview } from '@/lib/stock-option-utils'
import Notice from '@/components/ui/Notice'

interface StockOptionDashboardProps {
  overview: StockOptionOverview
  currentPrice: number
  currency?: string
}

function fmt(value: number, currency: string): string {
  return currency === 'USD' ? formatUSD(value) : formatKRW(value)
}

export default function StockOptionDashboard({ overview, currentPrice, currency = 'KRW' }: StockOptionDashboardProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)

  const handleStatusChange = async (optionId: string, vestingId: string, newStatus: string) => {
    setUpdating(vestingId)
    try {
      const res = await fetch(`/api/stock-options/${optionId}/vestings/${vestingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        router.refresh()
      }
    } catch {
      // 무시
    } finally {
      setUpdating(null)
    }
  }
  if (overview.options.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
        <div className="text-[13px] text-sub">스톡옵션이 없습니다</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 총 요약 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card px-5 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[11px] text-dim mb-0.5">총 내가치</div>
            <div className={`text-[17px] font-bold tabular-nums ${
              overview.totalIntrinsicValue > 0 ? 'text-green-400' : 'text-muted'
            }`}>
              {fmt(overview.totalIntrinsicValue, currency)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-dim mb-0.5">행사 가능분</div>
            <div className="text-[15px] font-bold text-bright tabular-nums">
              {fmt(overview.totalExercisableValue, currency)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-dim mb-0.5">잔여 주수</div>
            <div className="text-[15px] font-semibold text-muted tabular-nums">
              {overview.totalRemainingShares}주
            </div>
          </div>
          <div>
            <div className="text-[11px] text-dim mb-0.5">현재 주가</div>
            <div className="text-[15px] font-semibold text-muted tabular-nums">
              {fmt(currentPrice, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* 부여별 카드 */}
      {overview.options.map((opt) => (
        <div key={opt.id} className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-bright">
                  {formatDate(opt.grantDate)} 부여
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  opt.inTheMoney
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {opt.inTheMoney ? 'ITM' : 'OTM'}
                </span>
              </div>
              <span className="text-[11px] text-dim tabular-nums">
                만료 D-{opt.daysToExpiry}
              </span>
            </div>

            {/* 상세 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">행사가</span>
                <span className="text-[12px] text-muted tabular-nums">{fmt(opt.strikePrice, currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">1주당 내가치</span>
                <span className={`text-[12px] tabular-nums ${
                  opt.perShareValue > 0 ? 'text-green-400' : 'text-dim'
                }`}>
                  {opt.perShareValue > 0 ? fmt(opt.perShareValue, currency) : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">잔여 / 행사 가능</span>
                <span className="text-[12px] text-muted tabular-nums">
                  {opt.remainingShares}주 / {opt.exercisableShares}주
                </span>
              </div>
              <div className="h-px bg-surface-dim" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-sub">내가치 (전체)</span>
                <span className={`text-[14px] font-bold tabular-nums ${
                  opt.intrinsicValue > 0 ? 'text-green-400' : 'text-dim'
                }`}>
                  {opt.intrinsicValue > 0 ? fmt(opt.intrinsicValue, currency) : '-'}
                </span>
              </div>
            </div>

            {/* 베스팅 일정 */}
            {opt.vestings.length > 0 && (
              <div className="mt-3 bg-card rounded-lg px-3 py-2.5">
                <div className="text-[11px] text-dim mb-1.5">베스팅 일정</div>
                {opt.vestings.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted tabular-nums">{formatDate(v.vestingDate)}</span>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                        v.status === 'exercisable' ? 'bg-green-500/10 text-green-400'
                          : v.status === 'exercised' ? 'bg-blue-500/10 text-blue-400'
                          : v.status === 'expired' ? 'bg-red-500/10 text-red-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}>
                        {v.status === 'exercisable' ? '행사 가능'
                          : v.status === 'exercised' ? '행사 완료'
                          : v.status === 'expired' ? '만료'
                          : '대기'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted tabular-nums">{v.shares}주</span>
                      {v.status === 'exercisable' && (
                        <button
                          onClick={() => handleStatusChange(opt.id, v.id, 'exercised')}
                          disabled={updating === v.id}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-40 transition-all"
                        >
                          {updating === v.id ? '...' : '행사'}
                        </button>
                      )}
                      {v.status === 'pending' && (() => {
                        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
                        const todayEnd = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1))
                        return new Date(v.vestingDate) < todayEnd
                      })() && (
                        <button
                          onClick={() => handleStatusChange(opt.id, v.id, 'exercisable')}
                          disabled={updating === v.id}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 transition-all"
                        >
                          {updating === v.id ? '...' : '활성화'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 만료일 경고 */}
            {opt.daysToExpiry <= 365 && opt.daysToExpiry > 0 && (
              <Notice variant="warning" className="mt-3">
                만료까지 {opt.daysToExpiry}일 남았습니다.
              </Notice>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
