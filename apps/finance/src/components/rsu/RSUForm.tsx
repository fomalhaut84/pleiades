'use client'

import { useState, useEffect } from 'react'

interface AccountOption {
  id: string
  name: string
}

interface RSUData {
  id: string
  accountId: string
  vestingDate: string
  shares: number
  basisValue: number
  basisDate: string | null
  sellShares: number | null
  keepShares: number | null
  note: string | null
}

interface RSUFormProps {
  mode: 'create' | 'edit'
  item?: RSUData
  accounts: AccountOption[]
  onClose: () => void
  onSaved: () => void
}

export default function RSUForm({ mode, item, accounts, onClose, onSaved }: RSUFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState(item?.accountId ?? accounts[0]?.id ?? '')
  const [vestingDate, setVestingDate] = useState(item?.vestingDate?.slice(0, 10) ?? '')
  const [shares, setShares] = useState(item ? String(item.shares) : '')
  const [basisValue, setBasisValue] = useState(item ? String(item.basisValue) : '')
  const [basisDate, setBasisDate] = useState(item?.basisDate?.slice(0, 10) ?? '')
  const [sellShares, setSellShares] = useState(item?.sellShares !== null ? String(item?.sellShares) : '')
  const [keepShares, setKeepShares] = useState(item?.keepShares !== null ? String(item?.keepShares) : '')
  const [note, setNote] = useState(item?.note ?? '')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    if (!vestingDate) { setError('베스팅일을 입력해주세요.'); setIsSubmitting(false); return }
    const parsedShares = parseInt(shares)
    if (!parsedShares || parsedShares <= 0) { setError('수량을 입력해주세요.'); setIsSubmitting(false); return }
    const parsedBasis = parseFloat(basisValue)
    if (isNaN(parsedBasis) || parsedBasis < 0) { setError('기준금액을 입력해주세요.'); setIsSubmitting(false); return }

    const body: Record<string, unknown> = {
      accountId,
      vestingDate: `${vestingDate}T00:00:00.000Z`,
      shares: parsedShares,
      basisValue: parsedBasis,
      basisDate: basisDate ? `${basisDate}T00:00:00.000Z` : null,
      sellShares: sellShares ? parseInt(sellShares) : null,
      keepShares: keepShares ? parseInt(keepShares) : null,
      note: note.trim() || null,
    }

    try {
      const url = mode === 'edit' ? `/api/rsu/${item!.id}` : '/api/rsu'
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
          <h2 className="text-[15px] font-bold text-bright">{isEdit ? 'RSU 수정' : 'RSU 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          <div>
            <label className={labelClasses}>계좌</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className={`${inputClasses} appearance-none cursor-pointer`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
              disabled={isEdit}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClasses}>베스팅일</label>
            <input type="date" value={vestingDate} onChange={(e) => setVestingDate(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className={labelClasses}>수량 (주)</label>
            <input type="number" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="0" className={inputClasses} />
          </div>
          <div>
            <label className={labelClasses}>기준금액 (원)</label>
            <input type="number" value={basisValue} onChange={(e) => setBasisValue(e.target.value)} placeholder="0" className={inputClasses} />
          </div>
          <div>
            <label className={labelClasses}>기준일 (선택)</label>
            <input type="date" value={basisDate} onChange={(e) => setBasisDate(e.target.value)} className={inputClasses} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>매도 예정</label>
              <input type="number" value={sellShares} onChange={(e) => setSellShares(e.target.value)} placeholder="주" className={inputClasses} />
            </div>
            <div>
              <label className={labelClasses}>보유 예정</label>
              <input type="number" value={keepShares} onChange={(e) => setKeepShares(e.target.value)} placeholder="주" className={inputClasses} />
            </div>
          </div>
          <div>
            <label className={labelClasses}>메모 (선택)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" className={inputClasses} />
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
