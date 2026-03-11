'use client'

import { useState, useEffect, useCallback } from 'react'
import PerformanceChart from '@/components/performance/PerformanceChart'
import TWRSummaryCard from '@/components/performance/TWRSummaryCard'
import ContributionTable from '@/components/performance/ContributionTable'
import { VALID_PERIODS } from '@/lib/performance/constants'

interface AccountInfo {
  id: string
  name: string
}

interface PerformanceClientProps {
  accounts: AccountInfo[]
  hasSnapshots: boolean
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': '#34d399',
  '소담': '#60a5fa',
  '다솜': '#fb923c',
}

const PERIOD_LABELS: Record<string, string> = {
  '1M': '1개월',
  '3M': '3개월',
  '6M': '6개월',
  '1Y': '1년',
  'ALL': '전체',
}

export default function PerformanceClient({ accounts, hasSnapshots }: PerformanceClientProps) {
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id ?? '')
  const [period, setPeriod] = useState('3M')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [snapshotData, setSnapshotData] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [twrData, setTwrData] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contributionData, setContributionData] = useState<any>(null)

  const [loadingChart, setLoadingChart] = useState(false)
  const [loadingTWR, setLoadingTWR] = useState(false)
  const [loadingContrib, setLoadingContrib] = useState(false)
  const [triggeringSnapshot, setTriggeringSnapshot] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  const fetchSnapshots = useCallback(async () => {
    if (!selectedAccount) return
    setLoadingChart(true)
    try {
      const res = await fetch(`/api/performance/snapshots?accountId=${selectedAccount}`)
      const data = await res.json()
      setSnapshotData(data)
    } catch (error) {
      console.error('Failed to fetch snapshots:', error)
    } finally {
      setLoadingChart(false)
    }
  }, [selectedAccount])

  const fetchTWR = useCallback(async () => {
    setLoadingTWR(true)
    try {
      const results = await Promise.all(
        accounts.map(async (a) => {
          const res = await fetch(`/api/performance/twr?accountId=${a.id}&period=${period}`)
          if (!res.ok) {
            return {
              accountId: a.id,
              accountName: a.name,
              twr: null,
              benchmarkReturn: null,
              alpha: null,
              benchmarkTicker: null,
              snapshotCount: 0,
            }
          }
          return res.json()
        })
      )
      setTwrData(results)
    } catch (error) {
      console.error('Failed to fetch TWR:', error)
    } finally {
      setLoadingTWR(false)
    }
  }, [accounts, period])

  const fetchContribution = useCallback(async () => {
    if (!selectedAccount) return
    setLoadingContrib(true)
    try {
      const res = await fetch(`/api/performance/contribution?accountId=${selectedAccount}&period=${period}`)
      const data = await res.json()
      setContributionData(data)
    } catch (error) {
      console.error('Failed to fetch contribution:', error)
    } finally {
      setLoadingContrib(false)
    }
  }, [selectedAccount, period])

  useEffect(() => {
    fetchSnapshots()
    fetchTWR()
    fetchContribution()
  }, [fetchSnapshots, fetchTWR, fetchContribution])

  const handleTriggerSnapshot = async () => {
    setTriggeringSnapshot(true)
    try {
      await fetch('/api/performance/snapshots', { method: 'POST' })
      fetchSnapshots()
      fetchTWR()
      fetchContribution()
    } catch (error) {
      console.error('Failed to trigger snapshot:', error)
    } finally {
      setTriggeringSnapshot(false)
    }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      await fetch('/api/performance/benchmark/backfill', { method: 'POST' })
      fetchSnapshots()
      fetchTWR()
    } catch (error) {
      console.error('Failed to backfill:', error)
    } finally {
      setBackfilling(false)
    }
  }

  const selectedAccountName = accounts.find((a) => a.id === selectedAccount)?.name ?? ''
  const accountColor = ACCOUNT_COLORS[selectedAccountName] ?? '#9494a8'

  if (!hasSnapshots) {
    return (
      <div className="mt-6">
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
          <div className="text-[14px] text-sub mb-3">
            스냅샷 수집 중입니다. 데이터가 쌓이면 수익률이 표시됩니다.
          </div>
          <div className="text-[12px] text-dim mb-5">
            매일 06:05 KST에 자동 수집되며, 아래 버튼으로 수동 생성할 수 있습니다.
          </div>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleTriggerSnapshot}
              disabled={triggeringSnapshot}
              className="px-4 py-2 text-[12px] font-semibold bg-white/[0.07] border border-white/[0.12] rounded-lg text-bright hover:bg-white/[0.1] transition-colors disabled:opacity-50"
            >
              {triggeringSnapshot ? '생성 중...' : '스냅샷 생성'}
            </button>
            <button
              type="button"
              onClick={handleBackfill}
              disabled={backfilling}
              className="px-4 py-2 text-[12px] font-semibold bg-white/[0.07] border border-white/[0.12] rounded-lg text-bright hover:bg-white/[0.1] transition-colors disabled:opacity-50"
            >
              {backfilling ? '수집 중...' : '벤치마크 수집'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 계좌 선택 */}
        <div className="flex gap-1">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedAccount(a.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                selectedAccount === a.id
                  ? 'bg-white/[0.07] border-white/[0.12] text-bright'
                  : 'bg-white/[0.02] border-white/[0.04] text-dim hover:text-sub'
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: ACCOUNT_COLORS[a.name] ?? '#9494a8' }}
              />
              {a.name}
            </button>
          ))}
        </div>

        {/* 기간 선택 */}
        <div className="flex gap-1 ml-auto">
          {VALID_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                period === p
                  ? 'bg-white/[0.07] border-white/[0.12] text-bright'
                  : 'bg-white/[0.02] border-white/[0.04] text-dim hover:text-sub'
              }`}
            >
              {PERIOD_LABELS[p] ?? p}
            </button>
          ))}
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleTriggerSnapshot}
            disabled={triggeringSnapshot}
            className="px-3 py-1.5 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.06] rounded-md text-sub hover:text-bright hover:bg-white/[0.07] transition-colors disabled:opacity-50"
          >
            {triggeringSnapshot ? '...' : '스냅샷'}
          </button>
          <button
            type="button"
            onClick={handleBackfill}
            disabled={backfilling}
            className="px-3 py-1.5 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.06] rounded-md text-sub hover:text-bright hover:bg-white/[0.07] transition-colors disabled:opacity-50"
          >
            {backfilling ? '...' : '벤치마크'}
          </button>
        </div>
      </div>

      {/* TWR 요약 */}
      <TWRSummaryCard data={twrData} loading={loadingTWR} />

      {/* 차트 */}
      {loadingChart ? (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-5">
          <div className="h-[320px] flex items-center justify-center">
            <div className="animate-pulse text-sub text-[13px]">로딩 중...</div>
          </div>
        </div>
      ) : (
        <PerformanceChart
          snapshots={snapshotData?.snapshots ?? []}
          benchmark={snapshotData?.benchmark ?? []}
          benchmarkName={snapshotData?.benchmarkName ?? null}
          accountColor={accountColor}
        />
      )}

      {/* 기여도 */}
      <ContributionTable data={contributionData} loading={loadingContrib} />
    </div>
  )
}
