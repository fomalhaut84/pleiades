'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface SnapshotPoint {
  date: string
  normalizedValue: number
  totalValueKRW: number
}

interface BenchmarkPoint {
  date: string
  normalizedValue: number
}

interface PerformanceChartProps {
  snapshots: SnapshotPoint[]
  benchmark: BenchmarkPoint[]
  benchmarkName: string | null
  accountColor: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] text-dim mb-1.5">{label}</div>
      {payload
        .filter((entry: { value: unknown }) => typeof entry.value === 'number')
        .map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center gap-2 text-[11px]">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-sub">{entry.name}</span>
          <span className="text-bright font-semibold tabular-nums ml-auto">
            {entry.value.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PerformanceChart({
  snapshots,
  benchmark,
  benchmarkName,
  accountColor,
}: PerformanceChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
        <div className="h-[320px] flex items-center justify-center text-sub text-[13px]">
          스냅샷 데이터가 없습니다.
        </div>
      </div>
    )
  }

  // 차트 데이터 합성
  const benchmarkMap = new Map(benchmark.map((b) => [b.date, b.normalizedValue]))
  const chartData = snapshots.map((s) => ({
    date: s.date,
    portfolio: s.normalizedValue,
    benchmark: benchmarkMap.get(s.date) ?? null,
  }))

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6e6e82' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6e6e82' }}
              tickLine={false}
              axisLine={false}
              width={45}
              domain={['dataMin - 2', 'dataMax + 2']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#9494a8' }}
            />
            <Line
              name="포트폴리오"
              type="monotone"
              dataKey="portfolio"
              stroke={accountColor}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            {benchmarkName && (
              <Line
                name={benchmarkName}
                type="monotone"
                dataKey="benchmark"
                stroke="#9494a8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
