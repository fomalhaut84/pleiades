'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { formatKRW } from '@/lib/format'
import type { AccountSimulation } from '@/lib/simulator/compound-engine'

/** 계좌 컬러 */
const ACCOUNT_COLORS: Record<string, string> = {
  세진: '#34d399',
  소담: '#60a5fa',
  다솜: '#fb923c',
}

/** 시나리오 선 스타일 */
const SCENARIO_STYLES: Record<string, { dash?: string; opacity: number }> = {
  비관: { dash: '4 4', opacity: 0.4 },
  기본: { opacity: 1 },
  낙관: { dash: '4 4', opacity: 0.4 },
}

interface SimulatorChartProps {
  simulations: AccountSimulation[]
  /** 선택된 시나리오 이름 (null = 전부 표시) */
  selectedScenario: string | null
}

/** 차트 데이터: 연 단위로 리샘플링 */
function buildChartData(simulations: AccountSimulation[], selectedScenario: string | null) {
  if (simulations.length === 0) return []

  const maxMonths = Math.max(
    ...simulations.flatMap((s) =>
      s.scenarios.map((sc) => sc.dataPoints.length - 1),
    ),
  )
  const maxYears = Math.ceil(maxMonths / 12)

  const data: Record<string, unknown>[] = []
  for (let y = 0; y <= maxYears; y++) {
    const point: Record<string, unknown> = { year: y }

    for (const sim of simulations) {
      const scenarios = selectedScenario
        ? sim.scenarios.filter((s) => s.scenarioName === selectedScenario)
        : sim.scenarios

      for (const sc of scenarios) {
        const m = Math.min(y * 12, sc.dataPoints.length - 1)
        const dp = sc.dataPoints[m]
        if (dp) {
          const key = selectedScenario
            ? sim.accountId
            : `${sim.accountId}_${sc.scenarioName}`
          point[key] = dp.value
        }
      }
    }

    data.push(point)
  }

  return data
}

function formatAxisValue(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`
  return String(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, displayNameMap }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-bg-raised border border-border rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] text-dim mb-1.5">{label}년 후</div>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center gap-2 text-[11px]">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-sub">{displayNameMap?.get(entry.name) ?? entry.name}</span>
          <span className="text-bright font-semibold tabular-nums ml-auto">
            {formatKRW(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SimulatorChart({
  simulations,
  selectedScenario,
}: SimulatorChartProps) {
  const data = buildChartData(simulations, selectedScenario)

  if (data.length === 0) return null

  // 라인 구성
  const lines: { key: string; color: string; dash?: string; opacity: number; displayName: string }[] = []

  // dataKey → 표시이름 매핑 (툴팁용)
  const displayNameMap = new Map<string, string>()

  for (const sim of simulations) {
    const color = ACCOUNT_COLORS[sim.accountName] ?? 'var(--sub)'
    const scenarios = selectedScenario
      ? sim.scenarios.filter((s) => s.scenarioName === selectedScenario)
      : sim.scenarios

    for (const sc of scenarios) {
      const key = selectedScenario
        ? sim.accountId
        : `${sim.accountId}_${sc.scenarioName}`
      const displayName = selectedScenario
        ? sim.accountName
        : `${sim.accountName} ${sc.scenarioName}`
      const style = SCENARIO_STYLES[sc.scenarioName] ?? { opacity: 1 }
      lines.push({ key, color, dash: style.dash, opacity: style.opacity, displayName })
    }
  }

  for (const line of lines) {
    displayNameMap.set(line.key, line.displayName)
  }

  // 마일스톤 참조선 (년 단위)
  const milestoneYears = simulations.flatMap((s) =>
    s.milestones.map((m) => ({
      year: Math.round(m.month / 12),
      label: `${s.accountName} ${m.label}`,
    })),
  )

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: 'var(--dim)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              unit="년"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--dim)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatAxisValue}
              width={50}
            />
            <Tooltip content={<CustomTooltip displayNameMap={displayNameMap} />} />

            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                strokeWidth={line.dash ? 1.5 : 2}
                strokeDasharray={line.dash}
                strokeOpacity={line.opacity}
                dot={false}
                connectNulls
              />
            ))}

            {milestoneYears.map((m, i) => (
              <ReferenceLine
                key={`${m.label}-${i}`}
                x={m.year}
                stroke="var(--border-hover)"
                strokeDasharray="3 3"
                label={{
                  value: m.label,
                  position: 'top',
                  fill: 'var(--sub)',
                  fontSize: 10,
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
