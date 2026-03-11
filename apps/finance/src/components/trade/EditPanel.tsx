'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatUSD } from '@/lib/format'

interface Trade {
  id: string
  ticker: string
  displayName: string
  market: string
  type: string
  shares: number
  price: number
  currency: string
  fxRate: number | null
  totalKRW: number
  note: string | null
  tradedAt: string
  account: { name: string }
}

interface EditPanelProps {
  trade: Trade
  onClose: () => void
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function EditPanel({ trade, onClose }: EditPanelProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [shares, setShares] = useState(String(trade.shares))
  const [price, setPrice] = useState(String(trade.price))
  const [fxRate, setFxRate] = useState(trade.fxRate ? String(trade.fxRate) : '')
  const [tradedAt, setTradedAt] = useState(trade.tradedAt.slice(0, 10))
  const [note, setNote] = useState(trade.note ?? '')

  const isUSD = trade.currency === 'USD'
  const rawShares = Number(shares)
  const parsedShares = Number.isInteger(rawShares) && rawShares > 0 ? rawShares : 0
  const sharesError = shares !== '' && parsedShares === 0
  const parsedPrice = parseFloat(price) || 0
  const parsedFxRate = parseFloat(fxRate) || 0

  const totalKRW = isUSD
    ? Math.round(parsedPrice * parsedShares * parsedFxRate)
    : Math.round(parsedPrice * parsedShares)

  // Close on Escape
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

    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shares: parsedShares,
          price: parsedPrice,
          fxRate: isUSD ? parsedFxRate : undefined,
          tradedAt,
          note: note || null,
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-bg-raised border-l border-border z-50 overflow-y-auto animate-slide-in">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-bright">거래 수정</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          {/* 고정 정보 */}
          <div className="bg-card rounded-lg px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">계좌</span>
              <span className={`text-[13px] font-semibold ${ACCOUNT_COLORS[trade.account.name] ?? 'text-muted'}`}>
                {trade.account.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">종목</span>
              <span className="text-[13px] font-semibold text-bright">
                {trade.displayName}
                <span className="text-dim ml-1 text-[11px]">{trade.ticker}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">유형</span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  trade.type === 'BUY'
                    ? 'bg-sejin/10 text-sejin'
                    : 'bg-red-500/10 text-red-500'
                }`}
              >
                {trade.type === 'BUY' ? '매수' : '매도'}
              </span>
            </div>
          </div>

          {/* 수량 */}
          <div>
            <label className={labelClasses}>수량</label>
            <div className="relative">
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                min="1"
                step="1"
                className={`${inputClasses} pr-8`}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">주</span>
            </div>
            {sharesError && (
              <p className="text-[11px] text-red-400 mt-1">1 이상의 정수를 입력해주세요.</p>
            )}
          </div>

          {/* 단가 */}
          <div>
            <label className={labelClasses}>단가</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">
                {isUSD ? '$' : '₩'}
              </span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0"
                step={isUSD ? '0.01' : '1'}
                className={`${inputClasses} pl-8`}
              />
            </div>
          </div>

          {/* 환율 */}
          {isUSD && (
            <div>
              <label className={labelClasses}>환율 (₩/$)</label>
              <input
                type="number"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                min="0"
                step="1"
                className={inputClasses}
              />
            </div>
          )}

          {/* 거래일 */}
          <div>
            <label className={labelClasses}>거래일</label>
            <input
              type="date"
              value={tradedAt}
              onChange={(e) => setTradedAt(e.target.value)}
              className={inputClasses}
            />
          </div>

          {/* 메모 */}
          <div>
            <label className={labelClasses}>메모</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="메모를 입력하세요"
              maxLength={200}
              className={inputClasses}
            />
          </div>

          {/* 예상 총액 */}
          <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-sub">수정 후 총액</span>
            <div className="text-right">
              <div className="text-[15px] font-bold text-bright tabular-nums">
                {totalKRW.toLocaleString('ko-KR')}원
              </div>
              {isUSD && (
                <div className="text-[11px] text-dim mt-0.5">
                  {formatUSD(parsedPrice * parsedShares)} × {parsedFxRate}원
                </div>
              )}
              {totalKRW !== Math.round(trade.totalKRW) && (
                <div className={`text-[11px] mt-0.5 ${totalKRW > trade.totalKRW ? 'text-sejin' : 'text-red-400'}`}>
                  {totalKRW > trade.totalKRW ? '+' : ''}{(totalKRW - Math.round(trade.totalKRW)).toLocaleString('ko-KR')}원
                </div>
              )}
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">
              {error}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-sodam/15 text-sodam border border-sodam/25 hover:bg-sodam/25 disabled:opacity-40 transition-all"
            >
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
