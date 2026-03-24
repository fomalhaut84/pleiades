'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StockOptionForm from './StockOptionForm'
import StockOptionDeleteModal from './StockOptionDeleteModal'

interface StockOptionItem {
  id: string
  accountId: string
  ticker: string
  displayName: string
  grantDate: string
  expiryDate: string
  strikePrice: number
  totalShares: number
  note: string | null
}

interface StockOptionCRUDProps {
  stockOptions: StockOptionItem[]
  accounts: { id: string; name: string }[]
}

export default function StockOptionCRUD({ stockOptions, accounts }: StockOptionCRUDProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<StockOptionItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<StockOptionItem | null>(null)

  const refresh = () => router.refresh()

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {stockOptions.map((so) => (
            <div key={so.id} className="inline-flex items-center gap-1.5 text-[12px] text-sub bg-surface-dim border border-border rounded-lg px-3 py-1.5">
              <span className="text-bright font-medium">{so.displayName}</span>
              <span>{so.totalShares}주</span>
              <button
                onClick={() => setEditingItem(so)}
                className="p-0.5 rounded text-dim hover:text-text transition-all"
                title="수정"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" /></svg>
              </button>
              <button
                onClick={() => setDeletingItem(so)}
                className="p-0.5 rounded text-dim hover:text-red-400 transition-all"
                title="삭제"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" /></svg>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all shrink-0"
        >
          + 스톡옵션 추가
        </button>
      </div>

      {showForm && (
        <StockOptionForm mode="create" accounts={accounts} onClose={() => setShowForm(false)} onSaved={refresh} />
      )}
      {editingItem && (
        <StockOptionForm mode="edit" item={editingItem} accounts={accounts} onClose={() => setEditingItem(null)} onSaved={refresh} />
      )}
      {deletingItem && (
        <StockOptionDeleteModal item={deletingItem} onClose={() => setDeletingItem(null)} onDeleted={refresh} />
      )}
    </>
  )
}
