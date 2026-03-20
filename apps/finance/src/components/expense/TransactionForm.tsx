'use client'

import { useState, useEffect } from 'react'

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: 'expense' | 'income'
}

interface TransactionData {
  id: string
  amount: number
  description: string
  categoryId: string
  transactedAt: string
}

interface TransactionFormProps {
  mode: 'create' | 'edit'
  transaction?: TransactionData
  categories: CategoryOption[]
  onClose: () => void
  onSaved: () => void
}

function toDateInputValue(isoString?: string): string {
  if (!isoString) {
    // KST 기준 오늘 날짜
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return now.toISOString().slice(0, 10)
  }
  // UTC ISO 문자열에서 날짜 부분만 추출
  return isoString.slice(0, 10)
}

export default function TransactionForm({
  mode,
  transaction,
  categories,
  onClose,
  onSaved,
}: TransactionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [transactedAt, setTransactedAt] = useState(toDateInputValue(transaction?.transactedAt))

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const parsedAmount = parseInt(amount.replace(/,/g, ''))
    if (!parsedAmount || parsedAmount <= 0) {
      setError('금액을 입력해주세요.')
      setIsSubmitting(false)
      return
    }
    if (!description.trim()) {
      setError('내용을 입력해주세요.')
      setIsSubmitting(false)
      return
    }
    if (!categoryId) {
      setError('카테고리를 선택해주세요.')
      setIsSubmitting(false)
      return
    }

    try {
      const url = mode === 'edit'
        ? `/api/transactions/${transaction!.id}`
        : '/api/transactions'
      const method = mode === 'edit' ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
          description: description.trim(),
          categoryId,
          transactedAt: `${transactedAt}T00:00:00.000Z`,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '저장에 실패했습니다.')
        return
      }

      onSaved()
      onClose()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClasses = 'w-full bg-surface-dim border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-bright placeholder-dim focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'
  const labelClasses = 'block text-[12px] font-semibold text-sub mb-1.5'
  const isEdit = mode === 'edit'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-bg-raised border-l border-border z-50 overflow-y-auto animate-slide-in">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-bright">{isEdit ? '내역 수정' : '내역 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          {/* 금액 */}
          <div>
            <label className={labelClasses}>금액</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9,]/g, ''))}
              placeholder="0"
              className={inputClasses}
              autoFocus
            />
          </div>

          {/* 내용 */}
          <div>
            <label className={labelClasses}>내용</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="점심, 택시, 월급 등"
              maxLength={200}
              className={inputClasses}
            />
          </div>

          {/* 카테고리 */}
          <div>
            <label className={labelClasses}>카테고리</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`${inputClasses} appearance-none bg-[length:10px_6px] bg-[position:right_14px_center] bg-no-repeat cursor-pointer`}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              }}
            >
              <option value="">카테고리 선택</option>
              {expenseCategories.length > 0 && (
                <optgroup label="소비">
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ''}{c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {incomeCategories.length > 0 && (
                <optgroup label="수입">
                  {incomeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ''}{c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* 날짜 */}
          <div>
            <label className={labelClasses}>날짜</label>
            <input
              type="date"
              value={transactedAt}
              onChange={(e) => setTransactedAt(e.target.value)}
              className={inputClasses}
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
              {isSubmitting ? '저장 중...' : isEdit ? '수정' : '추가'}
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
