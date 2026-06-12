'use client'

import { useState, useEffect } from 'react'
import type { RecurringRow } from './RecurringTable'

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: string
}

export interface RecurringPrefill {
  amount: number
  description: string
  categoryId: string
}

interface RecurringFormProps {
  mode: 'create' | 'edit'
  item?: RecurringRow
  prefill?: RecurringPrefill
  categories: CategoryOption[]
  onClose: () => void
  onSaved: () => void
}

type Frequency = 'monthly' | 'weekly' | 'yearly'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function RecurringForm({ mode, item, prefill, categories, onClose, onSaved }: RecurringFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(item ? String(item.amount) : prefill ? String(prefill.amount) : '')
  const [description, setDescription] = useState(item?.description ?? prefill?.description ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? prefill?.categoryId ?? '')
  const [frequency, setFrequency] = useState<Frequency>((item?.frequency as Frequency) ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(item?.dayOfMonth ?? 1)
  const [dayOfWeek, setDayOfWeek] = useState(item?.dayOfWeek ?? 1)
  const [monthOfYear, setMonthOfYear] = useState(item?.monthOfYear ?? 1)
  const [nextRunAt, setNextRunAt] = useState(() => {
    if (item?.nextRunAt) return item.nextRunAt.slice(0, 10)
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 10)
  })

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
    if (!parsedAmount || parsedAmount <= 0) { setError('금액을 입력해주세요.'); setIsSubmitting(false); return }
    if (!description.trim()) { setError('내용을 입력해주세요.'); setIsSubmitting(false); return }
    if (!categoryId) { setError('카테고리를 선택해주세요.'); setIsSubmitting(false); return }

    const body: Record<string, unknown> = {
      amount: parsedAmount,
      description: description.trim(),
      categoryId,
      frequency,
      nextRunAt: `${nextRunAt}T00:00:00.000Z`,
    }
    if (frequency === 'monthly') body.dayOfMonth = dayOfMonth
    if (frequency === 'weekly') body.dayOfWeek = dayOfWeek
    if (frequency === 'yearly') { body.monthOfYear = monthOfYear; body.dayOfMonth = dayOfMonth }

    try {
      const url = mode === 'edit' ? `/api/recurring/${item!.id}` : '/api/recurring'
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          <h2 className="text-[15px] font-bold text-bright">{isEdit ? '반복 거래 수정' : '반복 거래 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          <div>
            <label className={labelClasses}>금액</label>
            <input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9,]/g, ''))} placeholder="0" className={inputClasses} autoFocus />
          </div>

          <div>
            <label className={labelClasses}>내용</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="관리비, 넷플릭스 등" maxLength={200} className={inputClasses} />
          </div>

          <div>
            <label className={labelClasses}>카테고리</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className={`${inputClasses} appearance-none cursor-pointer`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
              <option value="">카테고리 선택</option>
              {expenseCategories.length > 0 && <optgroup label="소비">{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}</optgroup>}
              {incomeCategories.length > 0 && <optgroup label="수입">{incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}</optgroup>}
            </select>
          </div>

          {/* 주기 */}
          <div>
            <label className={labelClasses}>주기</label>
            <div className="flex gap-0.5 bg-card border border-border rounded-lg p-1">
              {(['monthly', 'weekly', 'yearly'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFrequency(f)}
                  className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all ${frequency === f ? 'bg-surface text-bright' : 'text-sub'}`}>
                  {f === 'monthly' ? '매월' : f === 'weekly' ? '매주' : '매년'}
                </button>
              ))}
            </div>
          </div>

          {/* 실행일 */}
          <div>
            <label className={labelClasses}>실행일</label>
            {frequency === 'monthly' && (
              <>
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  className={`${inputClasses} w-[120px] appearance-none cursor-pointer`}
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}일</option>)}
                </select>
                <p className="text-[11px] text-dim mt-1.5">매월 {dayOfMonth}일에 자동 생성됩니다.</p>
              </>
            )}
            {frequency === 'weekly' && (
              <>
                <div className="flex gap-1">
                  {DAY_NAMES.map((name, i) => (
                    <button key={i} type="button" onClick={() => setDayOfWeek(i)}
                      className={`flex-1 py-2 rounded-md text-[12px] font-semibold border transition-all ${
                        dayOfWeek === i ? 'bg-sodam/15 text-sodam border-sodam/25' : 'bg-surface-dim border-border text-sub'
                      }`}>
                      {name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-dim mt-1.5">매주 {DAY_NAMES[dayOfWeek]}요일에 자동 생성됩니다.</p>
              </>
            )}
            {frequency === 'yearly' && (
              <>
                <div className="flex gap-2">
                  <select value={monthOfYear} onChange={(e) => setMonthOfYear(Number(e.target.value))}
                    className={`${inputClasses} w-[100px] appearance-none cursor-pointer`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
                  </select>
                  <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className={`${inputClasses} w-[80px] appearance-none cursor-pointer`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                    {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}일</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-dim mt-1.5">매년 {monthOfYear}월 {dayOfMonth}일에 자동 생성됩니다.</p>
              </>
            )}
          </div>

          <div>
            <label className={labelClasses}>시작일 (첫 실행일)</label>
            <input type="date" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} className={inputClasses} />
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">{error}</div>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all">취소</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-sodam/15 text-sodam border border-sodam/25 hover:bg-sodam/25 disabled:opacity-40 transition-all">
              {isSubmitting ? '저장 중...' : isEdit ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.2s ease-out; }
      `}</style>
    </>
  )
}
