'use client'

import { useState, useEffect, useCallback } from 'react'
import WatchlistTable, { type WatchlistRow } from '@/components/watchlist/WatchlistTable'
import WatchlistForm from '@/components/watchlist/WatchlistForm'

export default function WatchlistClient() {
  const [items, setItems] = useState<WatchlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<WatchlistRow | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/watchlist')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
      }
    } catch (e) {
      console.error('[watchlist] 조회 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleDelete = async (item: WatchlistRow) => {
    if (!confirm(`${item.displayName} (${item.ticker})을 삭제하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/watchlist/${item.id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) fetchItems()
    } catch {}
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] sm:text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 관심종목 추가
        </button>
      </div>

      <WatchlistTable
        items={items}
        onEdit={setEditingItem}
        onDelete={handleDelete}
      />

      {showForm && (
        <WatchlistForm mode="create" onClose={() => setShowForm(false)} onSaved={fetchItems} />
      )}
      {editingItem && (
        <WatchlistForm mode="edit" item={editingItem} onClose={() => setEditingItem(null)} onSaved={fetchItems} />
      )}
    </div>
  )
}
