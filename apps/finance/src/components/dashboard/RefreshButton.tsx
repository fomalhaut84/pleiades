'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface RefreshButtonProps {
  lastUpdatedAt: string | null
}

export default function RefreshButton({ lastUpdatedAt }: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()

  const formattedTime = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul',
      })
    : null

  async function handleRefresh() {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/prices/refresh', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Price refresh failed:', data?.error ?? res.statusText)
      }
      router.refresh()
    } catch (error) {
      console.error('Price refresh failed:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {formattedTime && (
        <div className="flex items-center gap-1.5 text-[11px] text-dim">
          <span className="w-[5px] h-[5px] rounded-full bg-sejin animate-pulse" />
          {formattedTime} 갱신
        </div>
      )}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        title="주가 새로고침"
        className="w-8 h-8 rounded-lg border border-border bg-card text-sub hover:bg-card-hover hover:text-bright hover:border-border-hover transition-all flex items-center justify-center disabled:opacity-50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className={isRefreshing ? 'animate-spin' : ''}
        >
          <path d="M1.5 8a6.5 6.5 0 0 1 11.3-4.4M14.5 8a6.5 6.5 0 0 1-11.3 4.4" />
          <path d="M13 1v3.5h-3.5M3 15v-3.5h3.5" />
        </svg>
      </button>
    </div>
  )
}
