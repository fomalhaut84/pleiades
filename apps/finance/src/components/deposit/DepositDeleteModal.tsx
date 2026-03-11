'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW, formatDate } from '@/lib/format'
import type { DepositRow } from './DepositTable'

interface DepositDeleteModalProps {
  deposit: DepositRow
  onClose: () => void
}

export default function DepositDeleteModal({ deposit, onClose }: DepositDeleteModalProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const res = await fetch(`/api/deposits/${deposit.id}`, { method: 'DELETE' })
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 px-4">
        <div className="w-full max-w-[380px] bg-bg-raised border border-border rounded-[14px] overflow-hidden">
          <div className="px-6 py-5">
            <h2 className="text-[15px] font-bold text-bright mb-4">입금 삭제</h2>

            <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">계좌</span>
                  <span className="text-[13px] font-semibold text-bright">{deposit.account.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">금액</span>
                  <span className="text-[13px] text-muted tabular-nums">{formatKRW(deposit.amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">출처</span>
                  <span className="text-[13px] text-muted">{deposit.source}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">입금일</span>
                  <span className="text-[13px] text-muted tabular-nums">{formatDate(deposit.depositedAt)}</span>
                </div>
              </div>
            </div>

            <p className="text-[12px] text-red-400/80 leading-relaxed">
              삭제된 입금 기록은 복구할 수 없습니다.
            </p>

            {error && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">{error}</div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all">
              취소
            </button>
            <button onClick={handleDelete} disabled={isDeleting} className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 disabled:opacity-40 transition-all">
              {isDeleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
