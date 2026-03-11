'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface Account {
  id: string
  name: string
}

interface TradeFiltersProps {
  accounts: Account[]
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function TradeFilters({ accounts }: TradeFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeAccountId = searchParams.get('accountId') ?? ''
  const activeType = searchParams.get('type') ?? ''

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      // Reset offset when filter changes
      params.delete('offset')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const segmentBase = 'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer'
  const segmentActive = 'bg-surface text-bright'
  const segmentInactive = 'text-sub hover:text-muted hover:bg-surface-dim'

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* 계좌 필터 */}
      <div className="flex items-center gap-1 bg-card rounded-lg p-1 border border-border">
        <button
          onClick={() => updateFilter('accountId', '')}
          className={`${segmentBase} ${!activeAccountId ? segmentActive : segmentInactive}`}
        >
          전체
        </button>
        {accounts.map((account) => (
          <button
            key={account.id}
            onClick={() => updateFilter('accountId', account.id)}
            className={`${segmentBase} ${
              activeAccountId === account.id ? segmentActive : segmentInactive
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                activeAccountId === account.id
                  ? (ACCOUNT_COLORS[account.name]?.replace('text-', 'bg-') ?? 'bg-dim')
                  : 'bg-dim'
              }`} />
              {account.name}
            </span>
          </button>
        ))}
      </div>

      {/* 유형 필터 */}
      <div className="flex items-center gap-1 bg-card rounded-lg p-1 border border-border">
        <button
          onClick={() => updateFilter('type', '')}
          className={`${segmentBase} ${!activeType ? segmentActive : segmentInactive}`}
        >
          전체
        </button>
        <button
          onClick={() => updateFilter('type', 'BUY')}
          className={`${segmentBase} ${activeType === 'BUY' ? 'bg-sejin/10 text-sejin' : segmentInactive}`}
        >
          매수
        </button>
        <button
          onClick={() => updateFilter('type', 'SELL')}
          className={`${segmentBase} ${activeType === 'SELL' ? 'bg-red-500/10 text-red-500' : segmentInactive}`}
        >
          매도
        </button>
      </div>
    </div>
  )
}
