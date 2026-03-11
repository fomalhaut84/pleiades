'use client'

import { formatKRW } from '@/lib/format'

interface AccountInput {
  accountId: string
  accountName: string
  monthlyContribution: number
  currentValue: number
}

interface SimulatorControlsProps {
  accounts: AccountInput[]
  years: number
  selectedScenario: string | null
  onMonthlyChange: (accountId: string, value: number) => void
  onYearsChange: (years: number) => void
  onScenarioChange: (scenario: string | null) => void
}

const ACCOUNT_COLORS: Record<string, string> = {
  세진: '#34d399',
  소담: '#60a5fa',
  다솜: '#fb923c',
}

const inputClasses = 'w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-bright tabular-nums outline-none focus:border-white/[0.12] transition-colors'

export default function SimulatorControls({
  accounts,
  years,
  selectedScenario,
  onMonthlyChange,
  onYearsChange,
  onScenarioChange,
}: SimulatorControlsProps) {
  const scenarioOptions = [
    { label: '전체', value: null },
    { label: '비관 5%', value: '비관' },
    { label: '기본 8%', value: '기본' },
    { label: '낙관 10%', value: '낙관' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* 시뮬레이션 기간 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold text-bright">시뮬레이션 설정</span>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] text-sub mb-1.5 block">기간</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={30}
                value={years}
                onChange={(e) => onYearsChange(Number(e.target.value))}
                className="flex-1 accent-white/60"
              />
              <span className="text-[13px] font-bold text-bright tabular-nums w-12 text-right">
                {years}년
              </span>
            </div>
          </div>

          {/* 시나리오 선택 */}
          <div>
            <label className="text-[12px] text-sub mb-1.5 block">시나리오</label>
            <div className="flex gap-1">
              {scenarioOptions.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onScenarioChange(opt.value)}
                  className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                    selectedScenario === opt.value
                      ? 'bg-white/[0.07] border-white/[0.12] text-bright'
                      : 'bg-white/[0.02] border-white/[0.04] text-dim hover:text-sub'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 계좌별 월 적립금 */}
      {accounts.map((account) => (
        <div
          key={account.accountId}
          className="relative overflow-hidden rounded-[14px] border border-border bg-card px-5 py-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: ACCOUNT_COLORS[account.accountName] ?? '#9494a8' }}
            />
            <span className="text-[13px] font-bold text-bright">{account.accountName}</span>
            <span className="text-[11px] text-dim ml-auto tabular-nums">
              현재 {formatKRW(account.currentValue)}
            </span>
          </div>

          <div>
            <label className="text-[12px] text-sub mb-1.5 block">월 적립금 (원)</label>
            <input
              type="number"
              value={account.monthlyContribution || ''}
              onChange={(e) => {
                const parsed = Number(e.target.value)
                onMonthlyChange(account.accountId, Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 100_000_000)) : 0)
              }}
              placeholder="0"
              min={0}
              step={10000}
              className={inputClasses}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
