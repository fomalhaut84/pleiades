'use client'

import { useState } from 'react'
import AssetTable, { type AssetRow } from '@/components/asset/AssetTable'
import AssetForm from '@/components/asset/AssetForm'
import AssetDeleteModal from '@/components/asset/AssetDeleteModal'

type OwnerTab = '전체' | '세진' | '소담' | '다솜' | '공동'

interface AssetsClientProps {
  assets: AssetRow[]
}

export default function AssetsClient({ assets }: AssetsClientProps) {
  const [activeTab, setActiveTab] = useState<OwnerTab>('전체')
  const [showForm, setShowForm] = useState(false)
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null)
  const [deletingAsset, setDeletingAsset] = useState<AssetRow | null>(null)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] sm:text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 자산 추가
        </button>
      </div>

      <AssetTable
        assets={assets}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onEdit={setEditingAsset}
        onDelete={setDeletingAsset}
      />

      {showForm && (
        <AssetForm mode="create" onClose={() => setShowForm(false)} />
      )}

      {editingAsset && (
        <AssetForm mode="edit" asset={editingAsset} onClose={() => setEditingAsset(null)} />
      )}

      {deletingAsset && (
        <AssetDeleteModal asset={deletingAsset} onClose={() => setDeletingAsset(null)} />
      )}
    </>
  )
}
