'use client'

import { formatKRW } from '@/lib/format'
import type { AccountSimulation } from '@/lib/simulator/compound-engine'

const ACCOUNT_COLORS: Record<string, string> = {
  세진: '#34d399',
  소담: '#60a5fa',
  다솜: '#fb923c',
}

interface SimulatorSummaryProps {
  simulations: AccountSimulation[]
  years: number
}

export default function SimulatorSummary({ simulations, years }: SimulatorSummaryProps) {
  if (simulations.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {simulations.map((sim) => {
        const base = sim.scenarios.find((s) => s.scenarioName === '기본')
        const pessimistic = sim.scenarios.find((s) => s.scenarioName === '비관')
        const optimistic = sim.scenarios.find((s) => s.scenarioName === '낙관')

        if (!base) return null

        const color = ACCOUNT_COLORS[sim.accountName] ?? 'var(--sub)'

        return (
          <div
            key={sim.accountId}
            className="relative overflow-hidden rounded-[14px] border border-border bg-card"
          >
            {/* 상단 컬러바 */}
            <div className="h-1" style={{ background: color }} />

            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-bold text-bright">
                  {sim.accountName}
                </span>
                <span className="text-[11px] text-dim tabular-nums">
                  {years}년 후 예상
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {/* 시나리오별 최종 자산 */}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">현재 자산</span>
                  <span className="text-[12px] text-muted tabular-nums">
                    {formatKRW(sim.initialValue)}
                  </span>
                </div>

                <div className="h-px bg-surface-dim" />

                {pessimistic && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-dim">비관 (5%)</span>
                    <span className="text-[12px] text-dim tabular-nums">
                      {formatKRW(pessimistic.finalValue)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-sub">기본 (8%)</span>
                  <span className="text-[15px] font-bold text-bright tabular-nums">
                    {formatKRW(base.finalValue)}
                  </span>
                </div>
                {optimistic && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-dim">낙관 (10%)</span>
                    <span className="text-[12px] text-dim tabular-nums">
                      {formatKRW(optimistic.finalValue)}
                    </span>
                  </div>
                )}

                <div className="h-px bg-surface-dim" />

                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">투입금 합계</span>
                  <span className="text-[12px] text-muted tabular-nums">
                    {formatKRW(base.totalContributed)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">예상 수익</span>
                  <span className={`text-[12px] tabular-nums ${base.totalGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {base.totalGrowth >= 0 ? '+' : ''}{formatKRW(base.totalGrowth)}
                  </span>
                </div>

                {/* 마일스톤 */}
                {sim.milestones.length > 0 && (
                  <>
                    <div className="h-px bg-surface-dim" />
                    <div className="text-[11px] text-dim font-semibold mb-0.5">마일스톤</div>
                    {sim.milestones.map((m) => (
                      <div key={m.label} className="flex items-center justify-between">
                        <span className="text-[12px] text-sub">{m.label}</span>
                        <span className="text-[12px] text-muted tabular-nums">
                          {formatKRW(m.estimatedValue)}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {/* 증여세 한도 */}
                {sim.giftLimitMonth != null && (
                  <>
                    <div className="h-px bg-surface-dim" />
                    {sim.giftLimitMonth === 0 ? (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                        <span className="text-[11px] text-red-400">
                          증여세 비과세 한도 (2,000만원) 초과
                        </span>
                      </div>
                    ) : (
                      <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-1.5">
                        <span className="text-[11px] text-yellow-400/70">
                          현재 적립 속도 기준 약 {Math.floor(sim.giftLimitMonth / 12)}년{' '}
                          {sim.giftLimitMonth % 12 > 0 ? `${sim.giftLimitMonth % 12}개월` : ''} 후
                          증여세 비과세 한도 도달 예상
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
