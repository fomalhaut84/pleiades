'use client'

import { useState } from 'react'
import CategoryTable, { type CategoryRow } from './CategoryTable'
import CategoryForm from './CategoryForm'

interface CategoryClientProps {
  categories: CategoryRow[]
}

type CategoryTab = 'expense' | 'income' | 'transfer'

function getInitialTab(categories: CategoryRow[]): CategoryTab {
  const hasExpense = categories.some((c) => c.type === 'expense')
  if (hasExpense) return 'expense'
  const hasIncome = categories.some((c) => c.type === 'income')
  if (hasIncome) return 'income'
  return 'transfer'
}

export default function CategoryClient({ categories }: CategoryClientProps) {
  const [activeTab, setActiveTab] = useState<CategoryTab>(() => getInitialTab(categories))
  const [showForm, setShowForm] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] sm:text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 카테고리 추가
        </button>
      </div>

      <CategoryTable
        categories={categories}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {showForm && (
        <CategoryForm onClose={() => setShowForm(false)} />
      )}
    </>
  )
}
