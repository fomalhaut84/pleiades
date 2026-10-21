'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CustomStrategyRow } from './types'

interface StrategyDeleteModalProps {
  item: CustomStrategyRow
  onClose: () => void
  onDeleted: () => void
}

export default function StrategyDeleteModal({ item, onClose, onDeleted }: StrategyDeleteModalProps) {
  const { show } = useToast()
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/custom-strategies/${item.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}))
        show({ variant: 'error', title: json?.error ?? '삭제에 실패했습니다.' })
        return
      }
      show({ variant: 'success', title: `${item.name} 삭제 완료` })
      onDeleted()
      onClose()
    } catch (e) {
      console.error('[strategies] delete 실패:', e)
      show({ variant: 'error', title: '삭제 요청 중 오류가 발생했습니다.' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-bg-raised p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center text-lg">🗑️</div>
          <div>
            <h3 className="text-bright font-bold text-base">전략 삭제</h3>
            <p className="text-sub text-xs">이 작업은 되돌릴 수 없습니다.</p>
          </div>
        </div>

        <div className="rounded-lg bg-surface-dim border border-border px-3 py-2">
          <div className="text-bright font-semibold text-sm">{item.name}</div>
          <div className="text-sub text-xs">
            {item.ticker} · {item.frequency}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-3 py-1.5 text-sm text-sub hover:text-bright hover:bg-surface rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  )
}
