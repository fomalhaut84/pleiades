'use client'

import { useState, useEffect } from 'react'

interface AccountOption { id: string; name: string }

interface StockOptionData {
  id: string
  accountId: string
  ticker: string
  displayName: string
  grantDate: string
  expiryDate: string
  strikePrice: number
  totalShares: number
  note: string | null
}

interface StockOptionFormProps {
  mode: 'create' | 'edit'
  item?: StockOptionData
  accounts: AccountOption[]
  onClose: () => void
  onSaved: () => void
}

export default function StockOptionForm({ mode, item, accounts, onClose, onSaved }: StockOptionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState(item?.accountId ?? accounts[0]?.id ?? '')
  const [ticker, setTicker] = useState(item?.ticker ?? '')
  const [displayName, setDisplayName] = useState(item?.displayName ?? '')
  const [grantDate, setGrantDate] = useState(item?.grantDate?.slice(0, 10) ?? '')
  const [expiryDate, setExpiryDate] = useState(item?.expiryDate?.slice(0, 10) ?? '')
  const [strikePrice, setStrikePrice] = useState(item ? String(item.strikePrice) : '')
  const [totalShares, setTotalShares] = useState(item ? String(item.totalShares) : '')
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

    if (!ticker.trim()) { setError('종목 티커를 입력해주세요.'); setIsSubmitting(false); return }
    if (!displayName.trim()) { setError('종목명을 입력해주세요.'); setIsSubmitting(false); return }
    if (!grantDate) { setError('부여일을 입력해주세요.'); setIsSubmitting(false); return }
    if (!expiryDate) { setError('만료일을 입력해주세요.'); setIsSubmitting(false); return }
    const parsedStrike = parseFloat(strikePrice)
    if (isNaN(parsedStrike) || parsedStrike < 0) { setError('행사가격을 입력해주세요.'); setIsSubmitting(false); return }
    const parsedShares = parseInt(totalShares)
    if (!parsedShares || parsedShares <= 0) { setError('총부여수량을 입력해주세요.'); setIsSubmitting(false); return }

    try {
      const url = mode === 'edit' ? `/api/stock-options/${item!.id}` : '/api/stock-options'
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          ticker: ticker.trim(),
          displayName: displayName.trim(),
          grantDate: `${grantDate}T00:00:00.000Z`,
          expiryDate: `${expiryDate}T00:00:00.000Z`,
          strikePrice: parsedStrike,
          totalShares: parsedShares,
          note: note.trim() || null,
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
          <h2 className="text-[15px] font-bold text-bright">{isEdit ? '스톡옵션 수정' : '스톡옵션 추가'}</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>종목 티커</label>
              <input className={inputClasses} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="035720.KS" />
            </div>
            <div>
              <label className={labelClasses}>종목명</label>
              <input className={inputClasses} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="카카오" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>부여일</label>
              <input type="date" className={inputClasses} value={grantDate} onChange={(e) => setGrantDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClasses}>만료일</label>
              <input type="date" className={inputClasses} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>행사가격 (원)</label>
              <input type="number" className={inputClasses} value={strikePrice} onChange={(e) => setStrikePrice(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelClasses}>총부여수량 (주)</label>
              <input type="number" className={inputClasses} value={totalShares} onChange={(e) => setTotalShares(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className={labelClasses}>메모 (선택)</label>
            <input className={inputClasses} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" />
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
