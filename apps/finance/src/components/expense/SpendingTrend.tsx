'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatKRW } from '@/lib/format'

interface TrendGroup {
  groupId: string
  groupName: string
  groupIcon: string | null
  values: number[]
  avg: number
  anomalies: boolean[]
}

interface TrendMonth {
  year: number
  month: number
}

interface SpendingTrendProps {
  months: TrendMonth[]
  groups: TrendGroup[]
}

const LINE_COLORS = ['#f87171', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa']

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="text-[12px] font-semibold text-bright mb-2">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
          <span className="text-sub">{entry.name}</span>
          <span className="ml-auto font-bold text-bright tabular-nums">{formatKRW(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function SpendingTrend({ months, groups }: SpendingTrendProps) {
  const [period, setPeriod] = useState<3 | 6>(3)
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')

  if (groups.length === 0) return null

  const displayMonths = period === 3 ? months.slice(-3) : months
  const startIdx = period === 3 ? months.length - 3 : 0

  // 차트 데이터 구성
  const chartData = displayMonths.map((m, i) => {
    const row: Record<string, unknown> = { name: `${m.month}월` }
    for (const g of groups) {
      row[g.groupName] = g.values[startIdx + i] ?? 0
    }
    return row
  })

  // 테이블용 데이터
  const tableGroups = groups.map((g) => {
    const displayValues = g.values.slice(startIdx)
    const nonZero = displayValues.filter((v) => v > 0)
    const avg = nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0
    const latest = displayValues[displayValues.length - 1] ?? 0
    const vsAvg = avg > 0 ? Math.round(((latest - avg) / avg) * 1000) / 10 : 0
    return { ...g, displayValues, displayAvg: avg, latest, vsAvg }
  })

  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <span className="text-[13px] font-bold text-bright">지출 트렌드</span>
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5 bg-card border border-border rounded-md p-0.5">
            <button
              onClick={() => setPeriod(3)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${period === 3 ? 'bg-surface text-bright' : 'text-sub'}`}
            >
              3개월
            </button>
            <button
              onClick={() => setPeriod(6)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${period === 6 ? 'bg-surface text-bright' : 'text-sub'}`}
            >
              6개월
            </button>
          </div>
          <div className="flex gap-0.5 bg-card border border-border rounded-md p-0.5">
            <button
              onClick={() => setViewMode('chart')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${viewMode === 'chart' ? 'bg-surface text-bright' : 'text-sub'}`}
            >
              차트
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${viewMode === 'table' ? 'bg-surface text-bright' : 'text-sub'}`}
            >
              테이블
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="p-5">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--dim)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--dim)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => {
                    if (v >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(0)}억`
                    if (v >= 1_0000) return `${Math.round(v / 1_0000)}만`
                    return String(v)
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                {groups.map((g, i) => (
                  <Line
                    key={g.groupId}
                    type="monotone"
                    dataKey={g.groupName}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {groups.map((g, i) => (
              <div key={g.groupId} className="flex items-center gap-2 text-[11px] text-sub">
                <div className="w-4 h-0.5 rounded" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                <span>{g.groupIcon ? `${g.groupIcon} ` : ''}{g.groupName}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-dim">
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">그룹</th>
                {displayMonths.map((m) => (
                  <th key={`${m.year}-${m.month}`} className="px-4 py-2.5 text-right text-dim font-semibold">
                    {m.month}월
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-dim font-semibold">평균</th>
                <th className="px-4 py-2.5 text-right text-dim font-semibold">vs 평균</th>
              </tr>
            </thead>
            <tbody>
              {tableGroups.map((g) => (
                <tr key={g.groupId} className="border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
                  <td className="px-4 py-3 text-bright font-medium whitespace-nowrap">
                    {g.groupIcon ? `${g.groupIcon} ` : ''}{g.groupName}
                  </td>
                  {g.displayValues.map((v, i) => {
                    const isAnomaly = g.displayAvg > 0 && v > g.displayAvg * 1.5
                    return (
                      <td
                        key={i}
                        className={`px-4 py-3 text-right tabular-nums ${isAnomaly ? 'text-red-400 font-bold' : 'text-text'}`}
                      >
                        {formatKRW(v)}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right text-sub tabular-nums">
                    {formatKRW(g.displayAvg)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    Math.abs(g.vsAvg) < 5 ? 'text-dim' : g.vsAvg > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {g.vsAvg === 0 ? '0%' : `${g.vsAvg > 0 ? '+' : ''}${g.vsAvg}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
