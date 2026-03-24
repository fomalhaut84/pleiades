'use client'

import { useState, useEffect, useCallback } from 'react'
import RecurringTable, { type RecurringRow } from '@/components/expense/RecurringTable'
import RecurringForm from '@/components/expense/RecurringForm'
import RecurringDeleteModal from '@/components/expense/RecurringDeleteModal'

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: string
}

export default function RecurringClient() {
  const [items, setItems] = useState<RecurringRow[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<RecurringRow | null>(null)
  const [deletingItem, setDeletingItem] = useState<RecurringRow | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recurring')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
      }
    } catch (e) {
      console.error('[recurring] 조회 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.categories) setCategories(data.categories)
      })
      .catch(() => {})
  }, [])

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (res.ok) {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, isActive } : i))
      }
    } catch (e) {
      console.error('[recurring] 토글 실패:', e)
    }
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] sm:text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 반복 거래 추가
        </button>
      </div>

      <RecurringTable
        items={items}
        onEdit={setEditingItem}
        onDelete={setDeletingItem}
        onToggle={handleToggle}
      />

      {showForm && (
        <RecurringForm mode="create" categories={categories} onClose={() => setShowForm(false)} onSaved={fetchItems} />
      )}
      {editingItem && (
        <RecurringForm mode="edit" item={editingItem} categories={categories} onClose={() => setEditingItem(null)} onSaved={fetchItems} />
      )}
      {deletingItem && (
        <RecurringDeleteModal item={deletingItem} onClose={() => setDeletingItem(null)} onDeleted={fetchItems} />
      )}
    </div>
  )
}
