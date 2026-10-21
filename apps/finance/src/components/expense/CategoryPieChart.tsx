'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { formatKRW } from '@/lib/format'

interface CategoryData {
  categoryId: string
  categoryName: string
  icon: string | null
  total: number
  count: number
}

interface GroupData {
  groupId: string
  groupName: string
  groupIcon: string | null
  total: number
}

interface CategoryPieChartProps {
  data: CategoryData[]
  title: string
  type: 'expense' | 'income'
  groupData?: GroupData[]
}

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#94a3b8',
]

export default function CategoryPieChart({ data, title, type, groupData }: CategoryPieChartProps) {
  const [viewMode, setViewMode] = useState<'category' | 'group'>('category')
  const hasGroups = groupData && groupData.length > 0

  const isGroupView = viewMode === 'group' && hasGroups
  const chartItems = isGroupView
    ? groupData!.map((g) => ({ id: g.groupId, name: g.groupIcon ? `${g.groupIcon} ${g.groupName}` : g.groupName, total: g.total }))
    : data.map((d) => ({ id: d.categoryId, name: d.icon ? `${d.icon} ${d.categoryName}` : d.categoryName, total: d.total }))

  const total = chartItems.reduce((sum, d) => sum + d.total, 0)
  const chartData = chartItems.map((d) => ({ name: d.name, value: d.total }))

  if (data.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-5 flex flex-col items-center justify-center min-h-[280px]">
        <div className="text-[13px] font-bold text-bright mb-4 self-start">{title}</div>
        <div className="text-[13px] text-sub">
          {type === 'expense' ? '소비' : '수입'} 내역이 없습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-5 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-5">
        <div className="text-[13px] font-bold text-bright">{title}</div>
        {hasGroups && (
          <div className="flex gap-0.5 bg-card border border-border rounded-md p-0.5">
            <button
              onClick={() => setViewMode('category')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${viewMode === 'category' ? 'bg-surface text-bright' : 'text-sub'}`}
            >
              카테고리별
            </button>
            <button
              onClick={() => setViewMode('group')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${viewMode === 'group' ? 'bg-surface text-bright' : 'text-sub'}`}
            >
              그룹별
            </button>
          </div>
        )}
      </div>

      <div className="relative w-[180px] h-[180px] mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-[11px] text-sub tracking-wide">합계</div>
          <div className="text-[14px] font-extrabold text-bright tracking-tight">
            {formatKRW(total)}
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col gap-2">
        {chartItems.map((item, index) => (
          <div key={item.id} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: COLORS[index % COLORS.length] }}
              />
              <span className="text-muted">{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sub tabular-nums">{formatKRW(item.total)}</span>
              <span className="font-bold text-sub tabular-nums w-[40px] text-right">
                {total > 0 ? ((item.total / total) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
