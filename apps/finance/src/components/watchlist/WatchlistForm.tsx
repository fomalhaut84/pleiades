'use client'

import { useState, useEffect } from 'react'
import type { WatchlistRow } from './WatchlistTable'

interface WatchlistFormProps {
  mode: 'create' | 'edit'
  item?: WatchlistRow
  onClose: () => void
  onSaved: () => void
}

const STRATEGIES = ['swing', 'momentum', 'value', 'scalp'] as const

export default function WatchlistForm({ mode, item, onClose, onSaved }: WatchlistFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ticker, setTicker] = useState(item?.ticker ?? '')
  const [displayName, setDisplayName] = useState(item?.displayName ?? '')
  const [market, setMarket] = useState(item?.market ?? 'US')
  const [strategy, setStrategy] = useState(item?.strategy ?? 'swing')
  const [targetBuy, setTargetBuy] = useState(item?.targetBuy !== null ? String(item?.targetBuy) : '')
  const [entryLow, setEntryLow] = useState(item?.entryLow !== null ? String(item?.entryLow) : '')
  const [entryHigh, setEntryHigh] = useState(item?.entryHigh !== null ? String(item?.entryHigh) : '')
  const [memo, setMemo] = useState(item?.memo ?? '')

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

    try {
      const url = mode === 'edit' ? `/api/watchlist/${item!.id}` : '/api/watchlist'
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim(),
          displayName: displayName.trim(),
          market,
          strategy,
          targetBuy: targetBuy ? parseFloat(targetBuy) : null,
          entryLow: entryLow ? parseFloat(entryLow) : null,
          entryHigh: entryHigh ? parseFloat(entryHigh) : null,
          memo: memo.trim() || null,
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
          <h2 className="text-[15px] font-bold text-bright">{isEdit ? '관심종목 수정' : '관심종목 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>종목 티커</label>
              <input className={inputClasses} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL, 005930.KS" disabled={isEdit} />
            </div>
            <div>
              <label className={labelClasses}>종목명</label>
              <input className={inputClasses} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="애플, 삼성전자" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>시장</label>
              <div className="flex gap-1">
                {['US', 'KR'].map((m) => (
                  <button key={m} type="button" onClick={() => setMarket(m)}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-all ${market === m ? 'bg-surface text-bright border-border-hover' : 'border-border text-sub'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClasses}>전략</label>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value)}
                className={`${inputClasses} appearance-none cursor-pointer`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e82' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClasses}>목표 매수가</label>
            <input type="number" className={inputClasses} value={targetBuy} onChange={(e) => setTargetBuy(e.target.value)} placeholder="선택" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>매수 구간 하한</label>
              <input type="number" className={inputClasses} value={entryLow} onChange={(e) => setEntryLow(e.target.value)} placeholder="선택" />
            </div>
            <div>
              <label className={labelClasses}>매수 구간 상한</label>
              <input type="number" className={inputClasses} value={entryHigh} onChange={(e) => setEntryHigh(e.target.value)} placeholder="선택" />
            </div>
          </div>
          <div>
            <label className={labelClasses}>메모</label>
            <input className={inputClasses} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" />
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
