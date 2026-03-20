'use client'

import { useState } from 'react'
import { formatKRW } from '@/lib/format'
import { getBudgetColor } from '@/lib/budget-utils'

interface CategoryBudget {
  id: string
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  amount: number
  spent: number
  remaining: number
  pct: number
}

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: string
}

interface CopyTarget {
  year: number
  month: number
}

interface BudgetManagerProps {
  categoryBudgets: CategoryBudget[]
  categories: CategoryOption[]
  totalBudgetAmount: number | null
  year: number
  month: number
  onRefresh: () => void
}

export default function BudgetManager({
  categoryBudgets,
  categories,
  totalBudgetAmount,
  year,
  month,
  onRefresh,
}: BudgetManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addCategoryId, setAddCategoryId] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copying, setCopying] = useState(false)

  // 예산 미설정 소비 카테고리
  const budgetedCatIds = new Set(categoryBudgets.map((b) => b.categoryId))
  const unsetCategories = categories.filter((c) => c.type === 'expense' && !budgetedCatIds.has(c.id))

  const handleEdit = (b: CategoryBudget) => {
    setEditingId(b.id)
    setEditAmount(String(b.amount))
  }

  const handleSave = async (categoryId: string) => {
    const parsed = parseInt(editAmount.replace(/,/g, ''))
    if (!parsed || parsed <= 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed, year, month, categoryId }),
      })
      if (res.ok) {
        setEditingId(null)
        onRefresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      onRefresh()
    }
  }

  const handleAdd = async () => {
    if (!addCategoryId) return
    const parsed = parseInt(addAmount.replace(/,/g, ''))
    if (!parsed || parsed <= 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed, year, month, categoryId: addCategoryId }),
      })
      if (res.ok) {
        setShowAdd(false)
        setAddCategoryId('')
        setAddAmount('')
        onRefresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    setCopying(true)
    const target = getNextMonth(year, month)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'copy',
          sourceYear: year,
          sourceMonth: month,
          targetYear: target.year,
          targetMonth: target.month,
        }),
      })
      if (res.ok) {
        setShowCopyModal(false)
        onRefresh()
      }
    } finally {
      setCopying(false)
    }
  }

  const nextMonth = getNextMonth(year, month)

  const colorMap = {
    green: 'bg-emerald-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400',
  }

  return (
    <>
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-bold text-bright">카테고리별 예산</span>
          <span className="text-[11px] text-sub">{categoryBudgets.length}개 설정됨</span>
        </div>

        {categoryBudgets.map((b) => {
          const color = getBudgetColor(b.pct)
          const isEditing = editingId === b.id

          if (isEditing) {
            return (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-surface-dim">
                <span className="text-[13px] text-bright font-medium w-[120px] shrink-0">
                  {b.categoryIcon ? `${b.categoryIcon} ` : ''}{b.categoryName}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                  className="w-28 bg-surface border border-border-hover rounded-md px-2.5 py-1 text-[13px] text-bright tabular-nums text-right focus:outline-none"
                  autoFocus
                />
                <span className="text-[12px] text-dim">원</span>
                <button
                  onClick={() => handleSave(b.categoryId)}
                  disabled={saving}
                  className="text-[11px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-[5px] px-2 py-1 disabled:opacity-40"
                >
                  저장
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-[11px] font-semibold text-sub border border-border rounded-[5px] px-2 py-1"
                >
                  취소
                </button>
              </div>
            )
          }

          return (
            <div key={b.id} className="grid grid-cols-[140px_1fr_100px_100px_40px] items-center gap-3 px-5 py-3.5 border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
              <span className="text-[13px] text-bright font-medium whitespace-nowrap">
                {b.categoryIcon ? `${b.categoryIcon} ` : ''}{b.categoryName}
              </span>
              <div className="flex flex-col gap-1">
                <div className="h-1.5 bg-surface-dim rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${colorMap[color]}`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-sub tabular-nums">
                  <span>예산 {formatKRW(b.amount)}</span>
                  <span className={b.pct >= 100 ? 'text-red-400' : b.pct >= 70 ? 'text-yellow-400' : ''}>
                    {b.pct}%{b.pct >= 100 ? ' 초과' : ''}
                  </span>
                </div>
              </div>
              <span className="text-[12px] font-semibold text-red-400 text-right tabular-nums whitespace-nowrap">
                {formatKRW(b.spent)}
              </span>
              <span className={`text-[12px] font-semibold text-right tabular-nums whitespace-nowrap ${b.remaining >= 0 ? (b.pct >= 70 ? 'text-yellow-400' : 'text-emerald-400') : 'text-red-400'}`}>
                {formatKRW(b.remaining)}
              </span>
              <div className="flex gap-0.5 justify-center">
                <button
                  onClick={() => handleEdit(b)}
                  className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-dim hover:text-text hover:bg-surface transition-all"
                  title="수정"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(b.id)}
                  className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="삭제"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}

        {/* 미설정 카테고리 */}
        {unsetCategories.slice(0, 3).map((c) => (
          <div key={c.id} className="grid grid-cols-[140px_1fr_40px] items-center gap-3 px-5 py-3.5 border-b border-border last:border-0">
            <span className="text-[13px] text-sub whitespace-nowrap">
              {c.icon ? `${c.icon} ` : ''}{c.name}
            </span>
            <span className="text-[12px] text-dim">예산 미설정</span>
            <button
              onClick={() => { setAddCategoryId(c.id); setAddAmount(''); setShowAdd(true) }}
              className="text-[12px] font-semibold text-sodam bg-sodam/15 border border-sodam/25 rounded-md px-2.5 py-1 hover:bg-sodam/25 transition-all whitespace-nowrap"
            >
              설정
            </button>
          </div>
        ))}

        {/* 추가 영역 */}
        {showAdd && (
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-surface-dim">
            <select
              value={addCategoryId}
              onChange={(e) => setAddCategoryId(e.target.value)}
              className="w-[140px] bg-surface-dim border border-border rounded-md px-2.5 py-1.5 text-[13px] text-bright focus:outline-none"
            >
              <option value="">카테고리 선택</option>
              {unsetCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9,]/g, ''))}
              placeholder="금액"
              className="w-28 bg-surface border border-border-hover rounded-md px-2.5 py-1.5 text-[13px] text-bright tabular-nums text-right focus:outline-none"
            />
            <span className="text-[12px] text-dim">원</span>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-[11px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-[5px] px-2 py-1 disabled:opacity-40"
            >
              추가
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="text-[11px] font-semibold text-sub border border-border rounded-[5px] px-2 py-1"
            >
              취소
            </button>
          </div>
        )}

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <button
            onClick={() => { setAddCategoryId(''); setAddAmount(''); setShowAdd(true) }}
            className="text-[12px] font-semibold text-sodam hover:text-bright transition-colors"
          >
            + 카테고리 예산 추가
          </button>
          {(totalBudgetAmount !== null || categoryBudgets.length > 0) && (
            <button
              onClick={() => setShowCopyModal(true)}
              className="text-[12px] font-semibold text-sodam bg-sodam/15 border border-sodam/25 rounded-md px-3 py-1.5 hover:bg-sodam/25 transition-all"
            >
              {nextMonth.month}월로 복사
            </button>
          )}
        </div>
      </div>

      {/* 예산 복사 모달 */}
      {showCopyModal && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowCopyModal(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 px-4">
            <div className="w-full max-w-[380px] bg-bg-raised border border-border rounded-[14px] overflow-hidden">
              <div className="px-6 py-5">
                <h2 className="text-[15px] font-bold text-bright mb-3">예산 복사</h2>
                <p className="text-[12px] text-sub mb-4 leading-relaxed">
                  {month}월 예산을 {nextMonth.month}월로 복사하시겠습니까?
                </p>
                <div className="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-1.5">
                  {totalBudgetAmount !== null && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-sub">전체 예산</span>
                      <span className="text-bright font-semibold tabular-nums">{formatKRW(totalBudgetAmount)}</span>
                    </div>
                  )}
                  {categoryBudgets.map((b) => (
                    <div key={b.id} className="flex justify-between text-[12px]">
                      <span className="text-sub">{b.categoryIcon ? `${b.categoryIcon} ` : ''}{b.categoryName}</span>
                      <span className="text-bright font-semibold tabular-nums">{formatKRW(b.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-border flex gap-3">
                <button
                  onClick={() => setShowCopyModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all"
                >
                  취소
                </button>
                <button
                  onClick={handleCopy}
                  disabled={copying}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-bold text-sodam bg-sodam/15 border border-sodam/25 hover:bg-sodam/25 disabled:opacity-40 transition-all"
                >
                  {copying ? '복사 중...' : '복사'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function getNextMonth(year: number, month: number): CopyTarget {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 }
}
