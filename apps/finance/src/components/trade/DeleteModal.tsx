'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW, formatUSD, formatDate } from '@/lib/format'

interface Trade {
  id: string
  ticker: string
  displayName: string
  type: string
  shares: number
  price: number
  currency: string
  totalKRW: number
  tradedAt: string
  account: { name: string }
}

interface DeleteModalProps {
  trade: Trade
  onClose: () => void
}

export default function DeleteModal({ trade, onClose }: DeleteModalProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleDelete = async () => {
    setError(null)
    setIsDeleting(true)

    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '삭제에 실패했습니다.')
        return
      }

      onClose()
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 px-4">
        <div className="w-full max-w-[380px] bg-bg-raised border border-border rounded-[14px] overflow-hidden">
          <div className="px-6 py-5">
            <h2 className="text-[15px] font-bold text-bright mb-4">거래 삭제</h2>

            <div className="bg-white/[0.025] border border-white/[0.04] rounded-lg px-4 py-3 mb-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">종목</span>
                  <span className="text-[13px] font-semibold text-bright">{trade.displayName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">유형</span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      trade.type === 'BUY'
                        ? 'bg-sejin/10 text-sejin'
                        : 'bg-red-500/10 text-red-500'
                    }`}
                  >
                    {trade.type === 'BUY' ? '매수' : '매도'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">수량</span>
                  <span className="text-[13px] text-muted">{trade.shares}주</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">단가</span>
                  <span className="text-[13px] text-muted tabular-nums">
                    {trade.currency === 'USD' ? formatUSD(trade.price) : formatKRW(trade.price)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">거래일</span>
                  <span className="text-[13px] text-muted tabular-nums">{formatDate(trade.tradedAt)}</span>
                </div>
              </div>
            </div>

            <p className="text-[12px] text-sub leading-relaxed mb-1">
              이 거래를 삭제하면 보유종목의 평균단가가 재계산됩니다.
            </p>
            <p className="text-[12px] text-red-400/80 leading-relaxed">
              삭제된 거래는 복구할 수 없습니다.
            </p>

            {error && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-white/[0.06] hover:bg-white/[0.04] transition-all"
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 disabled:opacity-40 transition-all"
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
