'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DEPOSIT_SOURCES } from '@/lib/deposit-utils'
import type { DepositRow } from './DepositTable'

interface DepositEditPanelProps {
  deposit: DepositRow
  onClose: () => void
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function DepositEditPanel({ deposit, onClose }: DepositEditPanelProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(String(deposit.amount))
  const [source, setSource] = useState(
    (DEPOSIT_SOURCES as readonly string[]).includes(deposit.source) ? deposit.source : '기타'
  )
  const [customSource, setCustomSource] = useState(
    (DEPOSIT_SOURCES as readonly string[]).includes(deposit.source) ? '' : deposit.source
  )
  const [note, setNote] = useState(deposit.note ?? '')
  const [depositedAt, setDepositedAt] = useState(deposit.depositedAt.slice(0, 10))

  const parsedAmount = Math.floor(Number(amount)) || 0
  const effectiveSource = source === '기타' ? customSource.trim() : source

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

    if (parsedAmount <= 0) {
      setError('금액은 0보다 커야 합니다.')
      setIsSubmitting(false)
      return
    }
    if (!effectiveSource) {
      setError('출처를 입력해주세요.')
      setIsSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/deposits/${deposit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
          source: effectiveSource,
          note: note || null,
          depositedAt,
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
          <h2 className="text-[15px] font-bold text-bright">입금 수정</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          {/* 고정 정보 */}
          <div className="bg-card rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] text-dim">계좌</span>
            <span className={`text-[13px] font-semibold ${ACCOUNT_COLORS[deposit.account.name] ?? 'text-muted'}`}>
              {deposit.account.name}
            </span>
          </div>

          {/* 금액 */}
          <div>
            <label className={labelClasses}>금액</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">₩</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="1"
                className={`${inputClasses} pl-8`}
              />
            </div>
          </div>

          {/* 출처 */}
          <div>
            <label className={labelClasses}>출처</label>
            <div className="flex flex-wrap gap-2">
              {DEPOSIT_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                    source === s
                      ? 'bg-surface text-bright border-border-hover'
                      : 'border-border text-sub hover:bg-surface-dim'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {source === '기타' && (
              <input
                type="text"
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                placeholder="출처를 입력하세요"
                className={`${inputClasses} mt-2`}
                maxLength={50}
              />
            )}
          </div>

          {/* 입금일 */}
          <div>
            <label className={labelClasses}>입금일</label>
            <input
              type="date"
              value={depositedAt}
              onChange={(e) => setDepositedAt(e.target.value)}
              className={inputClasses}
            />
          </div>

          {/* 메모 */}
          <div>
            <label className={labelClasses}>메모 (선택)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="메모를 입력하세요"
              maxLength={200}
              className={inputClasses}
            />
          </div>

          {/* 요약 */}
          {parsedAmount > 0 && (
            <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-[12px] text-sub">수정 후 금액</span>
              <div className="text-[15px] font-bold text-bright tabular-nums">
                {parsedAmount.toLocaleString('ko-KR')}원
              </div>
            </div>
          )}

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
