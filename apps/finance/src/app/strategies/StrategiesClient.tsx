'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import StrategyRegisterForm from '@/components/strategies/StrategyRegisterForm'
import StrategyCard from '@/components/strategies/StrategyCard'
import StrategyEditModal from '@/components/strategies/StrategyEditModal'
import StrategyDeleteModal from '@/components/strategies/StrategyDeleteModal'
import { useToast } from '@/components/ui/Toast'
import type { CustomStrategyRow } from '@/components/strategies/types'

type Filter = 'all' | 'active' | 'inactive'

export default function StrategiesClient() {
  const { show } = useToast()
  const [items, setItems] = useState<CustomStrategyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<CustomStrategyRow | null>(null)
  const [deleting, setDeleting] = useState<CustomStrategyRow | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/custom-strategies')
      const json = await res.json()
      if (!res.ok) {
        show({ variant: 'error', title: json?.error ?? '전략 조회에 실패했습니다.' })
        return
      }
      setItems(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      console.error('[strategies] 조회 실패:', e)
      show({ variant: 'error', title: '전략 조회 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }, [show])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const filtered = useMemo(() => {
    if (filter === 'active') return items.filter((s) => s.isActive)
    if (filter === 'inactive') return items.filter((s) => !s.isActive)
    return items
  }, [items, filter])

  const activeCount = items.filter((s) => s.isActive).length
  const inactiveCount = items.length - activeCount

  const handleToggle = async (item: CustomStrategyRow) => {
    // Optimistic UI
    setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, isActive: !s.isActive } : s)))
    try {
      const res = await fetch(`/api/custom-strategies/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? '전략 수정 실패')
      show({ variant: 'success', title: `${!item.isActive ? '활성' : '비활성'}으로 변경했습니다.` })
    } catch (e) {
      // Rollback
      setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, isActive: item.isActive } : s)))
      show({ variant: 'error', title: e instanceof Error ? e.message : '전략 수정에 실패했습니다.' })
    }
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity space-y-8' : 'transition-opacity space-y-8'}>
      <StrategyRegisterForm activeCount={activeCount} onCreated={fetchItems} />

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-bright font-bold text-base">등록된 전략</h2>
            <p className="text-sub text-xs mt-1">
              활성 {activeCount}개 · 비활성 {inactiveCount}개
            </p>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="bg-surface-dim border border-app rounded-lg px-3 py-2 text-sm text-app focus:outline-none focus:border-sejin"
          >
            <option value="all">전체</option>
            <option value="active">활성만</option>
            <option value="inactive">비활성만</option>
          </select>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="card p-10 text-center border border-app rounded-xl bg-card">
            <div className="text-4xl mb-3">🧠</div>
            <h3 className="text-bright font-bold text-lg">
              {items.length === 0 ? '아직 등록된 전략이 없습니다' : '조건에 맞는 전략이 없습니다'}
            </h3>
            <p className="text-sub text-sm mt-2">
              {items.length === 0 ? '위 등록 폼에서 자연어로 첫 전략을 만들어보세요.' : '필터를 변경하거나 새 전략을 등록해주세요.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <StrategyCard
                key={item.id}
                item={item}
                onToggle={() => handleToggle(item)}
                onEdit={() => setEditing(item)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-dim text-xs pt-4">
        커스텀 전략 알림은 참고용이며 매매 결정은 본인 판단입니다.
      </p>

      {editing && (
        <StrategyEditModal item={editing} onClose={() => setEditing(null)} onSaved={fetchItems} />
      )}
      {deleting && (
        <StrategyDeleteModal item={deleting} onClose={() => setDeleting(null)} onDeleted={fetchItems} />
      )}
    </div>
  )
}
