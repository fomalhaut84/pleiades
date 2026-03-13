'use client'

import { useState } from 'react'
import CategoryEditPanel from './CategoryEditPanel'
import CategoryDeleteModal from './CategoryDeleteModal'

export interface CategoryRow {
  id: string
  slug: string
  name: string
  type: string
  icon: string | null
  keywords: string[]
  sortOrder: number
  _count: { transactions: number; budgets: number }
}

interface CategoryTableProps {
  categories: CategoryRow[]
  activeTab: 'expense' | 'income'
  onTabChange: (tab: 'expense' | 'income') => void
}

export default function CategoryTable({ categories, activeTab, onTabChange }: CategoryTableProps) {
  const [editItem, setEditItem] = useState<CategoryRow | null>(null)
  const [deleteItem, setDeleteItem] = useState<CategoryRow | null>(null)

  const filtered = categories.filter((c) => c.type === activeTab)

  return (
    <>
      {/* Tab */}
      <div className="flex gap-1 mb-4">
        {([['expense', '소비'], ['income', '수입']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => onTabChange(value)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition-all ${
              activeTab === value
                ? 'bg-surface text-bright border-border-hover'
                : 'border-transparent text-sub hover:bg-surface-dim'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
          <div className="text-[13px] font-bold text-bright">
            {activeTab === 'expense' ? '소비' : '수입'} 카테고리
          </div>
          <div className="text-[12px] text-sub">{filtered.length}개</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-[14px] text-sub">
            카테고리가 없습니다
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['순서', '아이콘', '이름', '키워드', '거래 수', ''].map((col, i) => (
                      <th
                        key={i}
                        className={`px-3 py-2.5 text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card ${
                          i === 0 || i === 4 ? 'text-center' : 'text-left'
                        } ${i === 0 ? 'pl-4 w-16' : ''} ${i === 5 ? 'pr-4 w-16' : ''}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-card">
                      <td className="pl-4 px-3 py-3 text-[13px] text-dim border-b border-border text-center tabular-nums">
                        {c.sortOrder}
                      </td>
                      <td className="px-3 py-3 text-[16px] border-b border-border">
                        {c.icon ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-bright border-b border-border">
                        {c.name}
                      </td>
                      <td className="px-3 py-3 border-b border-border">
                        <div className="flex flex-wrap gap-1">
                          {c.keywords.length > 0 ? (
                            c.keywords.map((k, idx) => (
                              <span
                                key={`${k}-${idx}`}
                                className="px-1.5 py-0.5 rounded bg-surface-dim text-[11px] text-dim"
                              >
                                {k}
                              </span>
                            ))
                          ) : (
                            <span className="text-[12px] text-dim">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-muted border-b border-border text-center tabular-nums">
                        {c._count.transactions}
                      </td>
                      <td className="pr-4 px-3 py-3 border-b border-border">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditItem(c)}
                            className="p-1.5 rounded-md text-dim hover:text-muted hover:bg-surface transition-all"
                            title="수정"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteItem(c)}
                            className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="삭제"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="sm:hidden divide-y divide-border">
              {filtered.map((c) => (
                <div key={c.id} className="px-4 py-3.5 hover:bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">{c.icon ?? '📦'}</span>
                      <span className="text-[13px] font-bold text-bright">{c.name}</span>
                      {c._count.transactions > 0 && (
                        <span className="text-[11px] text-dim px-1.5 py-0.5 rounded bg-surface-dim">
                          {c._count.transactions}건
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditItem(c)}
                        className="p-1.5 rounded-md text-dim hover:text-muted hover:bg-surface transition-all"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteItem(c)}
                        className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {c.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.keywords.map((k) => (
                        <span
                          key={k}
                          className="px-1.5 py-0.5 rounded bg-surface-dim text-[11px] text-dim"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {editItem && (
        <CategoryEditPanel category={editItem} onClose={() => setEditItem(null)} />
      )}
      {deleteItem && (
        <CategoryDeleteModal category={deleteItem} onClose={() => setDeleteItem(null)} />
      )}
    </>
  )
}
