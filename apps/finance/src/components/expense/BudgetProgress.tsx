'use client'

import { useState } from 'react'
import { formatKRW } from '@/lib/format'
import { getBudgetColor } from '@/lib/budget-utils'

interface BudgetProgressProps {
  totalBudget: { id: string; amount: number; spent: number } | null
  year: number
  month: number
  onSaved: () => void
}

export default function BudgetProgress({ totalBudget, year, month, onSaved }: BudgetProgressProps) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(totalBudget ? String(totalBudget.amount) : '')
  const [saving, setSaving] = useState(false)

  const budget = totalBudget?.amount ?? 0
  const spent = totalBudget?.spent ?? 0
  const remaining = budget - spent
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0
  const color = getBudgetColor(pct)

  const colorClass = {
    green: 'bg-emerald-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400',
  }[color]

  const handleSave = async () => {
    const parsed = parseInt(amount.replace(/,/g, ''))
    if (!parsed || parsed <= 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed, year, month, categoryId: null }),
      })
      if (res.ok) {
        setEditing(false)
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-semibold text-dim tracking-wide uppercase">전체 예산</span>
        {!editing && (
          <button
            onClick={() => { setAmount(totalBudget ? String(totalBudget.amount) : ''); setEditing(true) }}
            className="text-[12px] font-semibold text-sub bg-surface-dim border border-border rounded-md px-2.5 py-1 hover:bg-surface hover:text-bright transition-all"
          >
            {totalBudget ? '금액 수정' : '예산 설정'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-48 bg-surface-dim border border-border-hover rounded-lg px-3.5 py-2 text-[15px] text-bright font-bold tabular-nums focus:outline-none focus:bg-surface transition-colors"
            autoFocus
            placeholder="0"
          />
          <span className="text-[13px] text-dim">원</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-[12px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-md px-3 py-1.5 hover:bg-sodam/25 disabled:opacity-40 transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-[12px] font-semibold text-sub border border-border rounded-md px-3 py-1.5 hover:bg-surface-dim transition-all"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="text-[28px] font-extrabold text-bright tabular-nums mb-4">
          {totalBudget ? formatKRW(budget) : '미설정'}
        </div>
      )}

      {totalBudget && (
        <>
          <div className="flex gap-6 mb-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-dim">소비</span>
              <span className="text-[15px] font-bold text-red-400 tabular-nums">{formatKRW(spent)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-dim">잔여</span>
              <span className={`text-[15px] font-bold tabular-nums ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatKRW(remaining)}
              </span>
            </div>
          </div>
          <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div className="text-[11px] text-sub text-right mt-1.5 tabular-nums">{pct}% 소진</div>
        </>
      )}
    </div>
  )
}
