'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatKRW } from '@/lib/format'

interface MonthlyData {
  month: number
  expense: number
  income: number
}

interface MonthlyChartProps {
  data: MonthlyData[]
  year: number
}

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
          <span className="ml-auto font-bold text-bright tabular-nums">
            {formatKRW(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function MonthlyChart({ data, year }: MonthlyChartProps) {
  const chartData = data.map((d) => ({
    name: `${d.month}월`,
    소비: d.expense,
    수입: d.income,
  }))

  return (
    <div className="rounded-[14px] border border-border bg-card p-5">
      <div className="text-[13px] font-bold text-bright mb-4">
        {year}년 월별 소비/수입 추이
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2}>
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
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-dim)', opacity: 0.5 }} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: 'var(--sub)' }}
            />
            <Bar dataKey="소비" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="수입" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
