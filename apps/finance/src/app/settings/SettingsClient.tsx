'use client'

import { useState, useEffect, useCallback } from 'react'
import AccountEditor from '@/components/settings/AccountEditor'

interface Account {
  id: string
  name: string
  ownerAge: number | null
  strategy: string | null
  horizon: number | null
  benchmarkTicker: string | null
}

type SettingsTab = 'accounts' | 'alerts' | 'income' | 'whooing'

const TABS: { value: SettingsTab; label: string }[] = [
  { value: 'accounts', label: '계좌' },
  { value: 'alerts', label: '알림' },
  { value: 'income', label: '근로소득' },
  { value: 'whooing', label: '후잉 연동' },
]

export default function SettingsClient() {
  const [tab, setTab] = useState<SettingsTab>('accounts')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('[settings] 계좌 조회 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const segmentBase = 'flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer text-center'
  const segmentActive = 'bg-surface text-bright'
  const segmentInactive = 'text-sub hover:text-text'

  return (
    <div>
      {/* 탭 바 */}
      <div className="flex gap-0.5 bg-card border border-border rounded-[10px] p-1 mb-6">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`${segmentBase} ${tab === t.value ? segmentActive : segmentInactive}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {tab === 'accounts' && (
          <AccountEditor accounts={accounts} onRefresh={fetchAccounts} />
        )}
        {tab === 'alerts' && (
          <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[13px] text-sub">
            알림 설정 (17-E에서 구현 예정)
          </div>
        )}
        {tab === 'income' && (
          <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[13px] text-sub">
            근로소득 프로필 (17-E에서 구현 예정)
          </div>
        )}
        {tab === 'whooing' && (
          <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[13px] text-sub">
            후잉 연동 설정 (17-E에서 구현 예정)
          </div>
        )}
      </div>
    </div>
  )
}
