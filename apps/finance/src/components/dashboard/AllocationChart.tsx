'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface ChartData {
  name: string
  value: number
}

interface AllocationChartProps {
  data: ChartData[]
  totalLabel: string
  chartTitle?: string
  centerLabel?: string
}

const COLORS = [
  '#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb923c',
  '#f87171', 'var(--sub)', 'var(--dim)', '#c084fc', '#22d3ee',
]

export default function AllocationChart({ data, totalLabel, chartTitle = '매입비중', centerLabel = '총 매입' }: AllocationChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="relative overflow-visible rounded-[14px] border border-border bg-card p-5 flex flex-col items-center">
      <div className="text-[13px] font-bold text-bright mb-5 self-start">
        {chartTitle}
      </div>

      <div className="relative w-[180px] h-[180px] mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-[11px] text-sub tracking-wide">{centerLabel}</div>
          <div className="text-[16px] font-extrabold text-bright tracking-tight">
            {totalLabel}
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col gap-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: COLORS[index % COLORS.length] }}
              />
              <span className="text-muted">{item.name}</span>
            </div>
            <span className="font-bold text-sub tabular-nums">
              {total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
