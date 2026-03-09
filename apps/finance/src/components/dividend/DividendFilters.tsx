'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface Account {
  id: string
  name: string
}

interface DividendFiltersProps {
  accounts: Account[]
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function DividendFilters({ accounts }: DividendFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeAccountId = searchParams.get('accountId') ?? ''
  const activeYear = searchParams.get('year') ?? ''

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('offset')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  const segmentBase = 'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer'
  const segmentActive = 'bg-white/[0.07] text-bright'
  const segmentInactive = 'text-sub hover:text-muted hover:bg-white/[0.03]'

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* 계좌 필터 */}
      <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-1 border border-white/[0.04]">
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

      {/* 연도 필터 */}
      <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-1 border border-white/[0.04]">
        <button
          onClick={() => updateFilter('year', '')}
          className={`${segmentBase} ${!activeYear ? segmentActive : segmentInactive}`}
        >
          전체
        </button>
        {years.map((year) => (
          <button
            key={year}
            onClick={() => updateFilter('year', String(year))}
            className={`${segmentBase} ${activeYear === String(year) ? segmentActive : segmentInactive}`}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  )
}
