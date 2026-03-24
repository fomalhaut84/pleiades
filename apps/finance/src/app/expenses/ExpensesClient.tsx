'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ExpenseSummary from '@/components/expense/ExpenseSummary'
import MonthlyChart from '@/components/expense/MonthlyChart'
import CategoryPieChart from '@/components/expense/CategoryPieChart'
import TransactionTable, { type TransactionRow } from '@/components/expense/TransactionTable'
import TransactionForm from '@/components/expense/TransactionForm'
import TransactionDeleteModal from '@/components/expense/TransactionDeleteModal'
import RecurringForm, { type RecurringPrefill } from '@/components/expense/RecurringForm'
import MonthCompare from '@/components/expense/MonthCompare'
import SpendingTrend from '@/components/expense/SpendingTrend'

interface MonthlyData {
  month: number
  expense: number
  income: number
}

type TransactionType = 'expense' | 'income'

interface CategoryData {
  categoryId: string
  categoryName: string
  icon: string | null
  type: TransactionType
  total: number
  count: number
}

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: 'expense' | 'income'
}

interface ApiResponse {
  transactions: TransactionRow[]
  total: number
  offset: number
  limit: number
  summary: {
    totalExpense: number
    totalIncome: number
    net: number
    count: number
  }
  byMonth: MonthlyData[]
  byCategory: CategoryData[]
  year: number
}

interface ExpensesClientProps {
  initialData: ApiResponse
}

type TabType = 'all' | 'expense' | 'income'

const currentYear = new Date().getFullYear()
const YEARS = [currentYear, currentYear - 1, currentYear - 2]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function ExpensesClient({ initialData }: ExpensesClientProps) {
  const [data, setData] = useState<ApiResponse>(initialData)
  const [year, setYear] = useState(initialData.year)
  const [month, setMonth] = useState<number | undefined>(undefined)
  const [tab, setTab] = useState<TabType>('all')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const isInitialMount = useRef(true)

  // 분석 데이터
  const [analysisData, setAnalysisData] = useState<{
    monthCompare: { groupId: string; groupName: string; groupIcon: string | null; current: number; previous: number; change: number; changePct: number }[]
    prevMonthSummary: { totalExpense: number; totalIncome: number; count: number }
    trend: { months: { year: number; month: number }[]; groups: { groupId: string; groupName: string; groupIcon: string | null; values: number[]; avg: number; anomalies: boolean[] }[] }
  } | null>(null)

  // CRUD 상태
  const [showForm, setShowForm] = useState(false)
  const [editingTx, setEditingTx] = useState<TransactionRow | null>(null)
  const [deletingTx, setDeletingTx] = useState<TransactionRow | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [assets, setAssets] = useState<{ id: string; name: string; category: string; value: number; isLiability: boolean }[]>([])
  const [recurringPrefill, setRecurringPrefill] = useState<RecurringPrefill | null>(null)

  // 카테고리 + 자산 목록 fetch (폼 select용)
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const cats = data?.categories
        if (Array.isArray(cats)) {
          setCategories(cats.map((c: { id: string; name: string; icon: string | null; type: string }) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            type: c.type as 'expense' | 'income',
          })))
        }
      })
      .catch(() => {})
    fetch('/api/assets')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const list = data?.assets ?? data
        if (Array.isArray(list)) setAssets(list)
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async (y: number, m: number | undefined, t: TabType) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ year: String(y), offset: '0' })
      if (m) params.set('month', String(m))
      if (t !== 'all') params.set('type', t)

      const res = await fetch(`/api/transactions?${params}`, { signal: controller.signal })
      if (res.ok) {
        const json: ApiResponse = await res.json()
        setData(json)
        setOffset(0)
      }
      // 월 선택 시 분석 데이터도 조회 (소비 탭 또는 전체 탭에서만)
      if (m && t !== 'income') {
        try {
          const analysisRes = await fetch(`/api/transactions/analysis?year=${y}&month=${m}`, { signal: controller.signal })
          if (analysisRes.ok) {
            setAnalysisData(await analysisRes.json())
          } else {
            setAnalysisData(null)
          }
        } catch (ae) {
          if (ae instanceof DOMException && ae.name === 'AbortError') return
          setAnalysisData(null)
        }
      } else {
        setAnalysisData(null)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('[expenses] 데이터 조회 실패:', e)
      setAnalysisData(null)
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  // 필터(year/month/tab) 변경 → 전체 조회
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    fetchData(year, month, tab)
  }, [year, month, tab, fetchData])

  // offset만 변경 → 목록만 조회 (성공 시에만 offset 반영)
  const handlePageChange = useCallback(async (newOffset: number) => {
    const prevOffset = offset
    setOffset(newOffset)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: String(year), offset: String(newOffset), listOnly: 'true',
      })
      if (month) params.set('month', String(month))
      if (tab !== 'all') params.set('type', tab)

      const res = await fetch(`/api/transactions?${params}`, { signal: controller.signal })
      if (res.ok) {
        const json = await res.json()
        setData((prev) => ({
          ...prev,
          transactions: json.transactions,
          total: json.total,
        }))
      } else {
        setOffset(prevOffset)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('[expenses] 페이지 이동 실패:', e)
      setOffset(prevOffset)
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [year, month, tab, offset])

  const handleYearChange = (y: number) => setYear(y)
  const handleMonthChange = (m: number | undefined) => setMonth(m)
  const handleTabChange = (t: TabType) => setTab(t)

  const handleSaved = () => {
    fetchData(year, month, tab)
  }

  const handleEdit = (tx: TransactionRow) => {
    setEditingTx(tx)
  }

  const handleDelete = (tx: TransactionRow) => {
    setDeletingTx(tx)
  }

  const handleRegisterRecurring = (tx: TransactionRow) => {
    if (tx.type === 'transfer_in' || tx.type === 'transfer_out') return
    setShowForm(false)
    setEditingTx(null)
    setRecurringPrefill({
      amount: tx.amount,
      description: tx.description,
      categoryId: tx.categoryId,
    })
  }

  const segmentBase = 'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer'
  const segmentActive = 'bg-surface text-bright'
  const segmentInactive = 'text-sub hover:text-muted hover:bg-surface-dim'

  const expenseCategories = data.byCategory.filter((c) => c.type === 'expense')
  const incomeCategories = data.byCategory.filter((c) => c.type === 'income')

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {/* 헤더 + 추가 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] sm:text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 내역 추가
        </button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        {/* 연도 */}
        <div className="flex items-center gap-1 bg-card rounded-lg p-1 border border-border">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => handleYearChange(y)}
              className={`${segmentBase} ${year === y ? segmentActive : segmentInactive}`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* 월 */}
        <div className="flex items-center gap-1 bg-card rounded-lg p-1 border border-border">
          <button
            onClick={() => handleMonthChange(undefined)}
            className={`${segmentBase} ${!month ? segmentActive : segmentInactive}`}
          >
            전체
          </button>
          {MONTHS.map((m) => (
            <button
              key={m}
              onClick={() => handleMonthChange(m)}
              className={`${segmentBase} ${month === m ? segmentActive : segmentInactive}`}
            >
              {m}월
            </button>
          ))}
        </div>

        {/* 타입 */}
        <div className="flex items-center gap-1 bg-card rounded-lg p-1 border border-border">
          <button
            onClick={() => handleTabChange('all')}
            className={`${segmentBase} ${tab === 'all' ? segmentActive : segmentInactive}`}
          >
            전체
          </button>
          <button
            onClick={() => handleTabChange('expense')}
            className={`${segmentBase} ${tab === 'expense' ? segmentActive : segmentInactive}`}
          >
            소비
          </button>
          <button
            onClick={() => handleTabChange('income')}
            className={`${segmentBase} ${tab === 'income' ? segmentActive : segmentInactive}`}
          >
            수입
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mb-5">
        <ExpenseSummary
          totalExpense={data.summary.totalExpense}
          totalIncome={data.summary.totalIncome}
          net={data.summary.net}
          count={data.summary.count}
          year={year}
          month={month}
          prevMonth={tab === 'all' ? analysisData?.prevMonthSummary : undefined}
        />
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <div className="lg:col-span-2">
          <MonthlyChart data={data.byMonth} year={year} />
        </div>
        <div>
          {tab === 'income' ? (
            <CategoryPieChart
              data={incomeCategories}
              title="수입 카테고리별 비율"
              type="income"
            />
          ) : (
            <CategoryPieChart
              data={expenseCategories}
              title="소비 카테고리별 비율"
              type="expense"
            />
          )}
        </div>
      </div>

      {/* 분석 섹션 (월 선택 + 전체/소비 탭) */}
      {analysisData && month && tab !== 'income' && (
        <div className="flex flex-col gap-5 mb-5">
          <MonthCompare
            data={analysisData.monthCompare}
            currentMonth={month}
            prevMonth={month === 1 ? 12 : month - 1}
          />
          <SpendingTrend
            months={analysisData.trend.months}
            groups={analysisData.trend.groups}
          />
        </div>
      )}

      {/* 내역 테이블 */}
      <TransactionTable
        transactions={data.transactions}
        total={data.total}
        limit={data.limit}
        offset={offset}
        onPageChange={handlePageChange}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRegisterRecurring={handleRegisterRecurring}
      />

      {/* 내역 추가 폼 */}
      {showForm && (
        <TransactionForm
          mode="create"
          categories={categories}
          assets={assets}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}

      {/* 내역 수정 폼 */}
      {editingTx && (
        <TransactionForm
          mode="edit"
          assets={assets}
          transaction={{
            id: editingTx.id,
            amount: editingTx.amount,
            description: editingTx.description,
            categoryId: editingTx.categoryId,
            transactedAt: editingTx.transactedAt,
            type: editingTx.type,
            linkedAssetId: editingTx.linkedAssetId,
          }}
          categories={categories}
          onClose={() => setEditingTx(null)}
          onSaved={handleSaved}
        />
      )}

      {/* 내역 삭제 모달 */}
      {deletingTx && (
        <TransactionDeleteModal
          transaction={deletingTx}
          onClose={() => setDeletingTx(null)}
          onDeleted={handleSaved}
        />
      )}

      {/* 반복 거래 등록 폼 */}
      {recurringPrefill && (
        <RecurringForm
          key={`${recurringPrefill.description}-${recurringPrefill.amount}`}
          mode="create"
          prefill={recurringPrefill}
          categories={categories}
          onClose={() => setRecurringPrefill(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
