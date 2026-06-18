'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import type { AssetRow } from './AssetTable'

const CATEGORIES = [
  { value: 'cash', label: '입출금' },
  { value: 'savings', label: '적금/예금' },
  { value: 'insurance', label: '보험' },
  { value: 'real_estate', label: '부동산' },
  { value: 'pension', label: '연금' },
  { value: 'loan', label: '대출' },
  { value: 'other', label: '기타' },
]

const OWNERS = ['세진', '소담', '다솜', '공동']

interface AssetFormProps {
  mode: 'create' | 'edit'
  asset?: AssetRow
  onClose: () => void
}

export default function AssetForm({ mode, asset, onClose }: AssetFormProps) {
  const router = useRouter()
  const { show } = useToast()
  const isEdit = mode === 'edit'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(asset?.name ?? '')
  const [category, setCategory] = useState(asset?.category ?? 'cash')
  const [owner, setOwner] = useState(asset?.owner ?? '세진')
  const [value, setValue] = useState(asset ? String(asset.value) : '')
  const [isLiability, setIsLiability] = useState(asset?.isLiability ?? false)
  const [interestRate, setInterestRate] = useState(asset?.interestRate != null ? String(asset.interestRate) : '')
  const [maturityDate, setMaturityDate] = useState(asset?.maturityDate?.slice(0, 10) ?? '')
  const [note, setNote] = useState(asset?.note ?? '')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    if (!name.trim()) { setError('자산명을 입력해주세요.'); setIsSubmitting(false); return }
    const parsedValue = parseInt(value.replace(/,/g, ''))
    if (!Number.isFinite(parsedValue) || parsedValue < 0) { setError('유효한 금액을 입력해주세요.'); setIsSubmitting(false); return }

    const body: Record<string, unknown> = {
      name: name.trim(),
      category,
      owner,
      value: parsedValue,
      isLiability,
      note: note.trim() || null,
    }

    if (interestRate.trim()) {
      const rate = parseFloat(interestRate)
      if (!Number.isFinite(rate)) { setError('유효한 이율을 입력해주세요.'); setIsSubmitting(false); return }
      body.interestRate = rate
    } else if (isEdit) {
      body.interestRate = null
    }

    if (maturityDate.trim()) {
      body.maturityDate = maturityDate
    } else if (isEdit) {
      body.maturityDate = null
    }

    try {
      const url = mode === 'edit' ? `/api/assets/${asset!.id}` : '/api/assets'
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
      show({
        variant: 'success',
        title: isEdit ? '자산이 수정되었습니다' : '자산이 추가되었습니다',
      })
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
  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-bg-raised border-l border-border z-50 overflow-y-auto animate-slide-in">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-bright">{isEdit ? '자산 수정' : '자산 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          <div>
            <label className={labelClasses}>자산명</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="신한 적금" maxLength={100} className={inputClasses} autoFocus />
          </div>

          <div>
            <label className={labelClasses}>카테고리</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className={`${inputClasses} appearance-none cursor-pointer`} style={selectStyle}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClasses}>소유자</label>
            <div className="flex gap-2">
              {OWNERS.map((o) => (
                <button key={o} type="button" onClick={() => setOwner(o)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                    owner === o ? 'bg-surface text-bright border-border-hover' : 'border-border text-sub hover:bg-surface-dim'
                  }`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClasses}>금액 (원)</label>
            <input type="text" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9,]/g, ''))} placeholder="0" className={inputClasses} />
          </div>

          <div>
            <label className="flex items-center gap-2 text-[13px] text-sub cursor-pointer">
              <input type="checkbox" checked={isLiability} onChange={(e) => setIsLiability(e.target.checked)} className="rounded border-border" />
              부채 (대출 등)
            </label>
          </div>

          <div>
            <label className={labelClasses}>이율 (%)</label>
            <input type="text" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="3.5" className={`${inputClasses} w-24`} />
          </div>

          <div>
            <label className={labelClasses}>만기일</label>
            <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={inputClasses} />
          </div>

          <div>
            <label className={labelClasses}>메모</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" maxLength={200} className={inputClasses} />
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
