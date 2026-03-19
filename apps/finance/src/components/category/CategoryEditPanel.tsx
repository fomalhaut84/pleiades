'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CATEGORY_TYPES, CATEGORY_TYPE_LABELS } from '@/lib/category-utils'
import type { CategoryRow } from './CategoryTable'

interface CategoryEditPanelProps {
  category: CategoryRow
  onClose: () => void
}

export default function CategoryEditPanel({ category, onClose }: CategoryEditPanelProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(category.name)
  const [type, setType] = useState(category.type)
  const [icon, setIcon] = useState(category.icon ?? '')
  const [keywordsText, setKeywordsText] = useState(category.keywords.join(', '))
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))

  const hasLinkedData = category._count.transactions > 0 || category._count.budgets > 0

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    if (!name.trim()) {
      setError('카테고리 이름을 입력해주세요.')
      setIsSubmitting(false)
      return
    }

    const keywords = keywordsText
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)

    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          icon: icon.trim() || null,
          keywords,
          sortOrder: sortOrder.trim() === '' ? 0 : Number(sortOrder),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '수정에 실패했습니다.')
        return
      }

      onClose()
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClasses = 'w-full bg-surface-dim border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-bright placeholder-dim focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'
  const labelClasses = 'block text-[12px] font-semibold text-sub mb-1.5'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-bg-raised border-l border-border z-50 overflow-y-auto animate-slide-in">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-bright">카테고리 수정</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          {/* slug (읽기 전용) */}
          <div className="bg-card rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] text-dim">식별자 (slug)</span>
            <span className="text-[13px] font-mono text-muted">{category.slug}</span>
          </div>

          {/* 이름 */}
          <div>
            <label className={labelClasses}>이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className={inputClasses}
            />
          </div>

          {/* 유형 */}
          <div>
            <label className={labelClasses}>
              유형
              {hasLinkedData && (
                <span className="ml-2 text-[11px] font-normal text-dim">(거래 또는 예산이 있어 변경 불가)</span>
              )}
            </label>
            <div className="flex gap-2">
              {CATEGORY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => !hasLinkedData && setType(t)}
                  disabled={hasLinkedData}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                    type === t
                      ? 'bg-surface text-bright border-border-hover'
                      : 'border-border text-sub hover:bg-surface-dim'
                  } ${hasLinkedData ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {CATEGORY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* 아이콘 */}
          <div>
            <label className={labelClasses}>아이콘 (이모지)</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🍚"
              maxLength={4}
              className={`${inputClasses} w-20`}
            />
          </div>

          {/* 키워드 */}
          <div>
            <label className={labelClasses}>키워드 (쉼표로 구분)</label>
            <input
              type="text"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="점심, 저녁, 커피, 배달"
              className={inputClasses}
            />
            <p className="text-[11px] text-dim mt-1">텔레그램 자연어 입력 시 자동 분류에 사용됩니다.</p>
          </div>

          {/* 정렬 순서 */}
          <div>
            <label className={labelClasses}>정렬 순서</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              min="0"
              className={`${inputClasses} w-24`}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">{error}</div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all">
              취소
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-sodam/15 text-sodam border border-sodam/25 hover:bg-sodam/25 disabled:opacity-40 transition-all">
              {isSubmitting ? '수정 중...' : '수정'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  )
}
