'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import { DEPOSIT_SOURCES } from '@/lib/deposit-utils'

interface Account {
  id: string
  name: string
}

interface DepositFormProps {
  accounts: Account[]
}

const ACCOUNT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  '세진': { border: 'border-sejin', bg: 'bg-sejin/10', text: 'text-sejin' },
  '소담': { border: 'border-sodam', bg: 'bg-sodam/10', text: 'text-sodam' },
  '다솜': { border: 'border-dasom', bg: 'bg-dasom/10', text: 'text-dasom' },
}

export default function DepositForm({ accounts }: DepositFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('증여')
  const [customSource, setCustomSource] = useState('')
  const [note, setNote] = useState('')
  const [depositedAt, setDepositedAt] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  const parsedAmount = Math.floor(Number(amount)) || 0
  const effectiveSource = source === '기타' ? customSource.trim() : source

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          amount: parsedAmount,
          source: effectiveSource,
          note: note || undefined,
          depositedAt,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '입금 기록에 실패했습니다.')
        return
      }

      router.push('/deposits')
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
    <Card className="max-w-[560px] mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* 계좌 선택 */}
        <div>
          <label className={labelClasses}>계좌</label>
          <div className="grid grid-cols-3 gap-2">
            {accounts.map((account) => {
              const colors = ACCOUNT_COLORS[account.name]
              const isActive = accountId === account.id
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setAccountId(account.id)}
                  className={`py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                    isActive
                      ? `${colors?.bg} ${colors?.border} ${colors?.text}`
                      : 'border-border text-sub hover:bg-surface-dim hover:text-muted'
                  }`}
                >
                  {account.name}
                </button>
              )
            })}
          </div>
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
              placeholder="0"
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
            <span className="text-[12px] text-sub">입금액</span>
            <div className="text-[15px] font-bold text-bright tabular-nums">
              {parsedAmount.toLocaleString('ko-KR')}원
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-40 bg-sodam/20 text-sodam hover:bg-sodam/30 border border-sodam/30"
        >
          {isSubmitting ? '처리 중...' : '입금 기록'}
        </button>
      </form>
    </Card>
  )
}
