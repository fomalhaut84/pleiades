'use client'

import { formatKRW, formatDate } from '@/lib/format'
import type { StockOptionOverview } from '@/lib/stock-option-utils'

interface StockOptionDashboardProps {
  overview: StockOptionOverview
  currentPrice: number
}

export default function StockOptionDashboard({ overview, currentPrice }: StockOptionDashboardProps) {
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
              {formatKRW(overview.totalIntrinsicValue)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-dim mb-0.5">행사 가능분</div>
            <div className="text-[15px] font-bold text-bright tabular-nums">
              {formatKRW(overview.totalExercisableValue)}
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
              {formatKRW(currentPrice)}
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
                <span className="text-[12px] text-muted tabular-nums">{formatKRW(opt.strikePrice)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">1주당 내가치</span>
                <span className={`text-[12px] tabular-nums ${
                  opt.perShareValue > 0 ? 'text-green-400' : 'text-dim'
                }`}>
                  {opt.perShareValue > 0 ? formatKRW(opt.perShareValue) : '-'}
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
                  {opt.intrinsicValue > 0 ? formatKRW(opt.intrinsicValue) : '-'}
                </span>
              </div>
            </div>

            {/* 베스팅 일정 */}
            {opt.vestings.length > 1 && (
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
                    <span className="text-[11px] text-muted tabular-nums">{v.shares}주</span>
                  </div>
                ))}
              </div>
            )}

            {/* 만료일 경고 */}
            {opt.daysToExpiry <= 365 && opt.daysToExpiry > 0 && (
              <div className="mt-3 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
                <span className="text-[11px] text-yellow-400/70">
                  만료까지 {opt.daysToExpiry}일 남았습니다.
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
