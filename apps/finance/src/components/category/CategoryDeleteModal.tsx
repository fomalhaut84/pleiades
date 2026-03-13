'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { CategoryRow } from './CategoryTable'

interface CategoryDeleteModalProps {
  category: CategoryRow
  onClose: () => void
}

export default function CategoryDeleteModal({ category, onClose }: CategoryDeleteModalProps) {
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
      const res = await fetch(`/api/categories/${category.id}`, { method: 'DELETE' })
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
            <h2 className="text-[15px] font-bold text-bright mb-4">카테고리 삭제</h2>

            <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">이름</span>
                  <span className="text-[13px] font-semibold text-bright">
                    {category.icon && <span className="mr-1">{category.icon}</span>}
                    {category.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">유형</span>
                  <span className="text-[13px] text-muted">
                    {category.type === 'expense' ? '소비' : '수입'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">연결된 거래</span>
                  <span className="text-[13px] text-muted tabular-nums">
                    {category._count.transactions}건
                  </span>
                </div>
              </div>
            </div>

            {category._count.transactions > 0 || category._count.budgets > 0 ? (
              <p className="text-[12px] text-red-400/80 leading-relaxed">
                {category._count.transactions > 0 && `${category._count.transactions}건의 거래`}
                {category._count.transactions > 0 && category._count.budgets > 0 && ', '}
                {category._count.budgets > 0 && `${category._count.budgets}건의 예산`}
                이 연결되어 삭제할 수 없습니다.
              </p>
            ) : (
              <p className="text-[12px] text-red-400/80 leading-relaxed">
                삭제된 카테고리는 복구할 수 없습니다.
              </p>
            )}

            {error && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">{error}</div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all">
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting || category._count.transactions > 0 || category._count.budgets > 0}
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
