'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface CategorySuggestion {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  source: 'keyword' | 'history'
  count?: number
}

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: 'expense' | 'income' | 'transfer'
}

interface AssetOption {
  id: string
  name: string
  category: string
  value: number
  isLiability: boolean
}

interface TransactionData {
  id: string
  amount: number
  description: string
  categoryId: string
  transactedAt: string
  type?: string | null
  linkedAssetId?: string | null
}

type TxType = 'expense' | 'income' | 'transfer_out' | 'transfer_in'

interface TransactionFormProps {
  mode: 'create' | 'edit'
  transaction?: TransactionData
  categories: CategoryOption[]
  assets?: AssetOption[]
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

function inferTxType(transaction?: TransactionData): TxType {
  if (transaction?.type === 'transfer_out') return 'transfer_out'
  if (transaction?.type === 'transfer_in') return 'transfer_in'
  return 'expense'
}

export default function TransactionForm({
  mode,
  transaction,
  categories,
  assets = [],
  onClose,
  onSaved,
}: TransactionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [txType, setTxType] = useState<TxType>(() => inferTxType(transaction))
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [linkedAssetId, setLinkedAssetId] = useState(transaction?.linkedAssetId ?? '')
  const [transactedAt, setTransactedAt] = useState(toDateInputValue(transaction?.transactedAt))

  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback((query: string, type: TxType) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (query.trim().length < 2 || type === 'transfer_out' || type === 'transfer_in') {
      setSuggestions([])
      return
    }

    const catType = type === 'income' ? 'income' : 'expense'

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(
          `/api/transactions/suggest?q=${encodeURIComponent(query.trim())}&type=${catType}`,
          { signal: controller.signal }
        )
        if (res.ok) {
          const data = await res.json()
          setSuggestions(data.suggestions ?? [])
        } else {
          setSuggestions([])
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSuggestions([])
      }
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const isTransfer = txType === 'transfer_out' || txType === 'transfer_in'
  const selectedAsset = assets.find((a) => a.id === linkedAssetId)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')
  const transferCategories = categories.filter((c) => c.type === 'transfer')

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
    if (isTransfer && !linkedAssetId) {
      setError('연결 자산을 선택해주세요.')
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
          type: isTransfer ? txType : null,
          linkedAssetId: isTransfer ? linkedAssetId : null,
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
          {/* 유형 */}
          <div>
            <label className={labelClasses}>유형</label>
            <div className="flex gap-0.5 bg-card border border-border rounded-lg p-1">
              {([
                { value: 'expense' as TxType, label: '소비', activeClass: 'bg-red-500/12 text-red-400' },
                { value: 'income' as TxType, label: '수입', activeClass: 'bg-emerald-500/12 text-emerald-400' },
                { value: 'transfer_out' as TxType, label: '출금', activeClass: 'bg-sodam/15 text-sodam' },
                { value: 'transfer_in' as TxType, label: '입금', activeClass: 'bg-teal-500/12 text-teal-400' },
              ]).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    const wasTransfer = txType === 'transfer_out' || txType === 'transfer_in'
                    const willBeTransfer = t.value === 'transfer_out' || t.value === 'transfer_in'
                    setTxType(t.value)
                    if (wasTransfer !== willBeTransfer) setCategoryId('')
                    if (description.trim().length >= 2) {
                      fetchSuggestions(description, t.value)
                    } else {
                      setSuggestions([])
                    }
                  }}
                  className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all ${
                    txType === t.value ? t.activeClass : 'text-sub'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

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
              onChange={(e) => {
                setDescription(e.target.value)
                fetchSuggestions(e.target.value, txType)
              }}
              placeholder="점심, 택시, 월급 등"
              maxLength={200}
              className={inputClasses}
            />
          </div>

          {/* 카테고리 */}
          <div>
            <label className={labelClasses}>카테고리</label>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {suggestions.map((s) => (
                  <button
                    key={s.categoryId}
                    type="button"
                    onClick={() => {
                      if (timerRef.current) clearTimeout(timerRef.current)
                      if (abortRef.current) abortRef.current.abort()
                      setCategoryId(s.categoryId)
                      setSuggestions([])
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all ${
                      categoryId === s.categoryId
                        ? 'bg-sodam/15 border-sodam/30 text-sodam'
                        : 'bg-surface border-border text-sub hover:text-bright hover:border-border-hover'
                    }`}
                  >
                    {s.categoryIcon && <span>{s.categoryIcon}</span>}
                    <span>{s.categoryName}</span>
                    {s.source === 'history' && s.count && (
                      <span className="text-dim text-[11px]">({s.count}건)</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`${inputClasses} appearance-none bg-[length:10px_6px] bg-[position:right_14px_center] bg-no-repeat cursor-pointer`}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              }}
            >
              <option value="">카테고리 선택</option>
              {isTransfer ? (
                transferCategories.length > 0 && (
                  <optgroup label="이체">
                    {transferCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon ? `${c.icon} ` : ''}{c.name}
                      </option>
                    ))}
                  </optgroup>
                )
              ) : (
                <>
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
                </>
              )}
            </select>
          </div>

          {/* 자산 (transfer 유형만) */}
          {isTransfer && assets.length > 0 && (
            <div className={`border rounded-[10px] p-3 ${txType === 'transfer_out' ? 'border-sodam/25 bg-sodam/[0.04]' : 'border-teal-500/25 bg-teal-500/[0.04]'}`}>
              <label className={labelClasses}>연결 자산</label>
              <select
                value={linkedAssetId}
                onChange={(e) => setLinkedAssetId(e.target.value)}
                className={`${inputClasses} appearance-none cursor-pointer`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
              >
                <option value="">자산 선택</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} [{a.category}] {a.value.toLocaleString('ko-KR')}원
                  </option>
                ))}
              </select>
              {selectedAsset && amount && (
                <div className="mt-2 bg-surface-dim border border-border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[12px] tabular-nums">
                    <span className="text-sub">{selectedAsset.name}:</span>
                    <span className="text-text">{selectedAsset.value.toLocaleString('ko-KR')}원</span>
                    <span className="text-dim">→</span>
                    <span className="text-bright font-bold">
                      {(txType === 'transfer_out'
                        ? selectedAsset.value - parseInt(amount.replace(/,/g, '') || '0')
                        : selectedAsset.value + parseInt(amount.replace(/,/g, '') || '0')
                      ).toLocaleString('ko-KR')}원
                    </span>
                    <span className={`text-[11px] font-semibold ${txType === 'transfer_out' ? 'text-emerald-400' : 'text-sodam'}`}>
                      ({txType === 'transfer_out' ? '-' : '+'}{parseInt(amount.replace(/,/g, '') || '0').toLocaleString('ko-KR')})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

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
