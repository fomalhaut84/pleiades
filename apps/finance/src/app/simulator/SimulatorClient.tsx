'use client'

import { useState, useMemo } from 'react'
import SimulatorChart from '@/components/simulator/SimulatorChart'
import SimulatorControls from '@/components/simulator/SimulatorControls'
import SimulatorSummary from '@/components/simulator/SimulatorSummary'
import { simulateAccount, type SimulationEvent } from '@/lib/simulator/compound-engine'

interface AccountData {
  accountId: string
  accountName: string
  ownerAge: number | null
  horizon: number | null
  currentValue: number
  giftTotal: number
  rsuEvents: SimulationEvent[]
}

interface SimulatorClientProps {
  accounts: AccountData[]
}

export default function SimulatorClient({ accounts }: SimulatorClientProps) {
  const [years, setYears] = useState(() => {
    if (accounts.length === 0) return 15
    const maxHorizon = Math.max(...accounts.map((a) => a.horizon ?? 15))
    return Math.min(maxHorizon, 20)
  })

  const [selectedScenario, setSelectedScenario] = useState<string | null>('기본')

  const [monthlyContributions, setMonthlyContributions] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const account of accounts) {
      // 기본 월 적립금: 미성년 50만, 성인 100만
      initial[account.accountId] = account.ownerAge != null && account.ownerAge < 19
        ? 500_000
        : 1_000_000
    }
    return initial
  })

  const handleMonthlyChange = (accountId: string, value: number) => {
    setMonthlyContributions((prev) => ({ ...prev, [accountId]: value }))
  }

  const simulations = useMemo(() => {
    return accounts.map((account) =>
      simulateAccount({
        accountId: account.accountId,
        accountName: account.accountName,
        initialValue: account.currentValue,
        monthlyContribution: monthlyContributions[account.accountId] ?? 0,
        years,
        events: account.rsuEvents,
        ownerAge: account.ownerAge,
        giftTotal: account.giftTotal,
      }),
    )
  }, [accounts, monthlyContributions, years])

  const controlAccounts = accounts.map((a) => ({
    accountId: a.accountId,
    accountName: a.accountName,
    monthlyContribution: monthlyContributions[a.accountId] ?? 0,
    currentValue: a.currentValue,
  }))

  return (
    <div className="mt-6 flex flex-col lg:flex-row gap-6">
      {/* 좌측: 컨트롤 */}
      <div className="lg:w-[320px] flex-shrink-0">
        <SimulatorControls
          accounts={controlAccounts}
          years={years}
          selectedScenario={selectedScenario}
          onMonthlyChange={handleMonthlyChange}
          onYearsChange={setYears}
          onScenarioChange={setSelectedScenario}
        />
      </div>

      {/* 우측: 차트 + 요약 */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        <SimulatorChart
          simulations={simulations}
          selectedScenario={selectedScenario}
        />
        <SimulatorSummary
          simulations={simulations}
          years={years}
        />
      </div>
    </div>
  )
}
