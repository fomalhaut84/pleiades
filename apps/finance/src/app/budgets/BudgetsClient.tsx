'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import BudgetProgress from '@/components/expense/BudgetProgress'
import BudgetManager from '@/components/expense/BudgetManager'

interface TotalBudget {
  id: string
  amount: number
  spent: number
}

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

interface BudgetData {
  year: number
  month: number
  totalBudget: TotalBudget | null
  categoryBudgets: CategoryBudget[]
}

function getCurrentYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default function BudgetsClient() {
  const [year, setYear] = useState(() => getCurrentYearMonth().year)
  const [month, setMonth] = useState(() => getCurrentYearMonth().month)
  const [data, setData] = useState<BudgetData | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const fetchBudgets = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(`/api/budgets?year=${year}&month=${month}`, { signal: controller.signal })
      if (res.ok) {
        setData(await res.json())
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('[budgets] 조회 실패:', e)
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [year, month])

  useEffect(() => {
    fetchBudgets()
  }, [fetchBudgets])

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.ok ? res.json() : null)
      .then((d) => {
        if (d?.categories) {
          setCategories(d.categories)
        }
      })
      .catch(() => {})
  }, [])

  const handlePrev = () => {
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
  }

  const handleNext = () => {
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handlePrev}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-sub hover:bg-surface-dim hover:text-bright transition-all"
        >
          &lsaquo;
        </button>
        <span className="text-[15px] font-bold text-bright min-w-[120px] text-center">
          {year}년 {month}월
        </span>
        <button
          onClick={handleNext}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-sub hover:bg-surface-dim hover:text-bright transition-all"
        >
          &rsaquo;
        </button>
      </div>

      {data && (
        <>
          <BudgetProgress
            totalBudget={data.totalBudget}
            year={year}
            month={month}
            onSaved={fetchBudgets}
          />

          <BudgetManager
            categoryBudgets={data.categoryBudgets}
            categories={categories}
            totalBudgetAmount={data.totalBudget?.amount ?? null}
            year={year}
            month={month}
            onRefresh={fetchBudgets}
          />
        </>
      )}
    </div>
  )
}
