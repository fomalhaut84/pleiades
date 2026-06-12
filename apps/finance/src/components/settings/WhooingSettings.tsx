'use client'

import { useState, useEffect, Fragment } from 'react'

interface WhooingConfig {
  webhookUrl: string | null
  isActive: boolean
  defaultRight: string | null
}

interface CategoryMapping {
  categoryId: string
  whooingLeft: string
  whooingRight: string | null
  category: { name: string; icon: string | null }
}

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  type: string
}

export default function WhooingSettings() {
  const [, setConfig] = useState<WhooingConfig>({ webhookUrl: null, isActive: false, defaultRight: null })
  const [, setMappings] = useState<CategoryMapping[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')
  const [defaultRight, setDefaultRight] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingMappings, setSavingMappings] = useState(false)
  const [localMappings, setLocalMappings] = useState<Record<string, { left: string; right: string }>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/whooing').then((r) => r.ok ? r.json() : null),
      fetch('/api/settings/whooing/mappings').then((r) => r.ok ? r.json() : null),
      fetch('/api/categories').then((r) => r.ok ? r.json() : null),
    ]).then(([cfg, maps, cats]) => {
      if (cfg) {
        setConfig(cfg)
        setWebhookUrl(cfg.webhookUrl ?? '')
        setDefaultRight(cfg.defaultRight ?? '')
        setIsActive(cfg.isActive)
      }
      if (maps?.mappings) {
        setMappings(maps.mappings)
        const local: Record<string, { left: string; right: string }> = {}
        for (const m of maps.mappings as CategoryMapping[]) {
          local[m.categoryId] = { left: m.whooingLeft, right: m.whooingRight ?? '' }
        }
        setLocalMappings(local)
      }
      if (cats?.categories) {
        setCategories(cats.categories)
      }
    }).catch(() => {})
  }, [])

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/whooing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() || null, isActive, defaultRight: defaultRight.trim() || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMappings = async () => {
    setSavingMappings(true)
    try {
      const arr = Object.entries(localMappings)
        .filter(([, v]) => v.left.trim())
        .map(([categoryId, v]) => ({ categoryId, whooingLeft: v.left.trim(), whooingRight: v.right.trim() || undefined }))
      const res = await fetch('/api/settings/whooing/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: arr }),
      })
      if (res.ok) {
        const data = await res.json()
        setMappings(data.mappings)
      }
    } finally {
      setSavingMappings(false)
    }
  }

  const updateMapping = (catId: string, field: 'left' | 'right', value: string) => {
    setLocalMappings((prev) => ({
      ...prev,
      [catId]: { ...prev[catId] ?? { left: '', right: '' }, [field]: value },
    }))
  }

  const inputClasses = 'bg-surface-dim border border-border rounded-lg px-3 py-2 text-[13px] text-bright focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'

  return (
    <div className="flex flex-col gap-6">
      {/* 웹훅 설정 */}
      <div className="rounded-[14px] border border-border bg-card px-5 py-4">
        <div className="text-[13px] font-bold text-bright mb-4">후잉 웹훅 설정</div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-sub mb-1.5">웹훅 URL</label>
            <input className={`w-full ${inputClasses}`} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://whooing.com/webhook/s/xxxx-xxxx-..." />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-sub mb-1.5">기본 결제수단 (right 항목)</label>
            <input className={`w-64 ${inputClasses}`} value={defaultRight} onChange={(e) => setDefaultRight(e.target.value)}
              placeholder="현금, 신한카드 등" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-sub cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-border" />
              활성화
            </label>
            <button onClick={handleSaveConfig} disabled={saving}
              className="text-[12px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-lg px-4 py-1.5 hover:bg-sodam/25 disabled:opacity-40 transition-all">
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 카테고리 매핑 */}
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-bold text-bright">카테고리 → 후잉 항목 매핑</span>
          <button onClick={handleSaveMappings} disabled={savingMappings}
            className="text-[12px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-lg px-4 py-1.5 hover:bg-sodam/25 disabled:opacity-40 transition-all">
            {savingMappings ? '저장 중...' : '매핑 저장'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface-dim">
                <th className="px-4 py-2.5 text-left text-dim font-semibold">카테고리</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold">후잉 Left (항목)</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold">후잉 Right (결제수단)</th>
              </tr>
            </thead>
            <tbody>
              {(['expense', 'income', 'transfer'] as const).map((type) => {
                const grouped = categories.filter((c) => c.type === type)
                if (grouped.length === 0) return null
                return (
                  <Fragment key={type}>
                    <tr className="bg-surface-dim">
                      <td colSpan={3} className="px-4 py-2 text-[11px] font-bold text-sub uppercase tracking-wide">
                        {type === 'expense' ? '소비' : type === 'income' ? '수입' : '이체'}
                      </td>
                    </tr>
                    {grouped.map((cat) => {
                      const m = localMappings[cat.id] ?? { left: '', right: '' }
                      return (
                        <tr key={cat.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5 text-bright font-medium whitespace-nowrap">
                            {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                          </td>
                          <td className="px-4 py-2">
                            <input className={`w-full ${inputClasses} py-1.5`} value={m.left}
                              onChange={(e) => updateMapping(cat.id, 'left', e.target.value)} placeholder={type === 'expense' ? '식료품' : type === 'income' ? '급여' : '적금'} />
                          </td>
                          <td className="px-4 py-2">
                            <input className={`w-full ${inputClasses} py-1.5`} value={m.right}
                              onChange={(e) => updateMapping(cat.id, 'right', e.target.value)} placeholder="기본값 사용" />
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 text-[11px] text-dim">
          Right가 비어있으면 기본 결제수단이 사용됩니다. Left가 비어있는 카테고리는 매핑에서 제외됩니다.
        </div>
      </div>
    </div>
  )
}
