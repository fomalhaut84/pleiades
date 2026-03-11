'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatUSD } from '@/lib/format'
import { calcDividendTax, calcAmountKRW } from '@/lib/dividend-utils'
import type { DividendRow } from './DividendTable'

interface DividendEditPanelProps {
  dividend: DividendRow
  onClose: () => void
}

const ACCOUNT_COLORS: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function DividendEditPanel({ dividend, onClose }: DividendEditPanelProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [exDate, setExDate] = useState(dividend.exDate ? dividend.exDate.slice(0, 10) : '')
  const [payDate, setPayDate] = useState(dividend.payDate.slice(0, 10))
  const [amountGross, setAmountGross] = useState(String(dividend.amountGross))
  const [amountNet, setAmountNet] = useState(String(dividend.amountNet))
  const [taxAmount, setTaxAmount] = useState(dividend.taxAmount != null ? String(dividend.taxAmount) : '')
  const [fxRate, setFxRate] = useState(dividend.fxRate ? String(dividend.fxRate) : '')
  const [reinvested, setReinvested] = useState(dividend.reinvested)

  const isUSD = dividend.currency === 'USD'

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Auto-calc tax when gross changes (skip initial mount to preserve existing values)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const gross = parseFloat(amountGross)
    if (!Number.isFinite(gross) || gross <= 0) return
    const result = calcDividendTax(gross, dividend.currency)
    setTaxAmount(String(result.taxAmount))
    setAmountNet(String(result.amountNet))
  }, [amountGross, dividend.currency])

  const parsedNetRaw = parseFloat(amountNet)
  const parsedNet = Number.isFinite(parsedNetRaw) ? parsedNetRaw : 0
  const parsedFxRateRaw = parseFloat(fxRate)
  const parsedFxRate = Number.isFinite(parsedFxRateRaw) ? parsedFxRateRaw : 0
  const amountKRW = calcAmountKRW(parsedNet, dividend.currency, parsedFxRate)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const parsedGross = parseFloat(amountGross)
    const parsedTax = parseFloat(taxAmount)
    if (!Number.isFinite(parsedGross) || parsedGross <= 0) {
      setError('세전 금액은 0보다 커야 합니다.')
      setIsSubmitting(false)
      return
    }
    if (!Number.isFinite(parsedNet) || parsedNet < 0) {
      setError('세후 금액은 0 이상이어야 합니다.')
      setIsSubmitting(false)
      return
    }
    if (isUSD && (!Number.isFinite(parsedFxRate) || parsedFxRate <= 0)) {
      setError('유효한 환율을 입력해주세요.')
      setIsSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/dividends/${dividend.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exDate: exDate || null,
          payDate,
          amountGross: parsedGross,
          amountNet: parsedNet,
          taxAmount: Number.isFinite(parsedTax) ? parsedTax : 0,
          fxRate: isUSD ? parsedFxRate : undefined,
          amountKRW,
          reinvested,
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
          <h2 className="text-[15px] font-bold text-bright">배당 수정</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
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
              <span className={`text-[13px] font-semibold ${ACCOUNT_COLORS[dividend.account.name] ?? 'text-muted'}`}>
                {dividend.account.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">종목</span>
              <span className="text-[13px] font-semibold text-bright">
                {dividend.displayName}
                <span className="text-dim ml-1 text-[11px]">{dividend.ticker}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>기준일 (선택)</label>
              <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} className={inputClasses} />
            </div>
            <div>
              <label className={labelClasses}>지급일</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClasses} />
            </div>
          </div>

          <div>
            <label className={labelClasses}>세전 배당금</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">{isUSD ? '$' : '₩'}</span>
              <input type="number" value={amountGross} onChange={(e) => setAmountGross(e.target.value)} min="0" step={isUSD ? '0.01' : '1'} className={`${inputClasses} pl-8`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses}>세금</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">{isUSD ? '$' : '₩'}</span>
                <input
                  type="number"
                  value={taxAmount}
                  onChange={(e) => {
                    setTaxAmount(e.target.value)
                    const gross = parseFloat(amountGross) || 0
                    const tax = parseFloat(e.target.value) || 0
                    setAmountNet(String(isUSD ? Math.round((gross - tax) * 100) / 100 : Math.round(gross - tax)))
                  }}
                  min="0"
                  step={isUSD ? '0.01' : '1'}
                  className={`${inputClasses} pl-8`}
                />
              </div>
            </div>
            <div>
              <label className={labelClasses}>세후</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">{isUSD ? '$' : '₩'}</span>
                <input type="number" value={amountNet} onChange={(e) => setAmountNet(e.target.value)} min="0" step={isUSD ? '0.01' : '1'} className={`${inputClasses} pl-8`} />
              </div>
            </div>
          </div>

          {isUSD && (
            <div>
              <label className={labelClasses}>환율 (₩/$)</label>
              <input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} min="0" step="1" className={inputClasses} />
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={reinvested} onChange={(e) => setReinvested(e.target.checked)} className="w-4 h-4 rounded border-border-hover bg-surface-dim text-sodam focus:ring-sodam/30" />
            <span className="text-[13px] text-sub">배당 재투자</span>
          </label>

          {/* 수정 후 원화 */}
          <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-sub">수정 후 원화</span>
            <div className="text-right">
              <div className="text-[15px] font-bold text-bright tabular-nums">{amountKRW.toLocaleString('ko-KR')}원</div>
              {isUSD && <div className="text-[11px] text-dim mt-0.5">{formatUSD(parsedNet)} × {parsedFxRate}원</div>}
            </div>
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
