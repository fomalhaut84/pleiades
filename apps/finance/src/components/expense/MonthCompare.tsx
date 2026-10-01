'use client'

import { formatKRW } from '@/lib/format'

interface MonthCompareItem {
  groupId: string
  groupName: string
  groupIcon: string | null
  current: number
  previous: number
  change: number
  changePct: number
}

interface MonthCompareProps {
  data: MonthCompareItem[]
  currentMonth: number
  prevMonth: number
}

export default function MonthCompare({ data, currentMonth, prevMonth }: MonthCompareProps) {
  if (data.length === 0) return null

  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-bold text-bright">전월 대비 그룹별 변동</span>
        <span className="text-[11px] text-sub">{currentMonth}월 vs {prevMonth}월</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-dim">
              <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">그룹</th>
              <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">이번 달</th>
              <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">전월</th>
              <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">증감</th>
              <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">증감률</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const isUp = item.change > 0
              const isZero = item.change === 0
              const changeColor = isZero ? 'text-dim' : isUp ? 'text-red-400' : 'text-emerald-400'

              return (
                <tr key={item.groupId} className="border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
                  <td className="px-4 py-3 text-bright font-medium whitespace-nowrap">
                    {item.groupIcon ? `${item.groupIcon} ` : ''}{item.groupName}
                  </td>
                  <td className="px-4 py-3 text-right text-text font-medium tabular-nums">
                    {formatKRW(item.current)}
                  </td>
                  <td className="px-4 py-3 text-right text-sub tabular-nums">
                    {formatKRW(item.previous)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${changeColor}`}>
                    {isZero ? '0' : `${isUp ? '+' : ''}${formatKRW(item.change)}`}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${changeColor}`}>
                    {isZero ? '0%' : `${isUp ? '+' : ''}${item.changePct}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
