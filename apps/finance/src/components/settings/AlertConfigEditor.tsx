'use client'

import { useState, useEffect } from 'react'

interface AlertConfig {
  id: string
  key: string
  value: string
  label: string
}

export default function AlertConfigEditor() {
  const [configs, setConfigs] = useState<AlertConfig[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/alerts/config')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.configs) setConfigs(data.configs) })
      .catch(() => {})
  }, [])

  const startEdit = (config: AlertConfig) => {
    setEditingKey(config.key)
    setEditValue(config.value)
  }

  const handleSave = async (key: string) => {
    if (!editValue.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/alerts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValue.trim() }),
      })
      if (res.ok) {
        setConfigs((prev) => prev.map((c) => c.key === key ? { ...c, value: editValue.trim() } : c))
        setEditingKey(null)
      }
    } finally {
      setSaving(false)
    }
  }

  const inputClasses = 'bg-surface-dim border border-border rounded-lg px-3 py-2 text-[13px] text-bright font-medium focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'

  return (
    <div className="flex flex-col gap-2">
      {configs.map((config) => (
        <div key={config.key} className="rounded-[14px] border border-border bg-card px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-bright">{config.label}</div>
            <div className="text-[11px] text-dim">{config.key}</div>
          </div>
          {editingKey === config.key ? (
            <div className="flex items-center gap-2">
              <input
                className={`w-24 ${inputClasses}`}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
              <button onClick={() => handleSave(config.key)} disabled={saving}
                className="text-[11px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-md px-2.5 py-1 disabled:opacity-40">
                저장
              </button>
              <button onClick={() => setEditingKey(null)}
                className="text-[11px] font-semibold text-sub border border-border rounded-md px-2.5 py-1">
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[15px] font-bold text-bright tabular-nums">{config.value}</span>
              <button onClick={() => startEdit(config)}
                className="text-[12px] font-semibold text-sub bg-surface-dim border border-border rounded-md px-3 py-1.5 hover:bg-surface hover:text-bright transition-all">
                수정
              </button>
            </div>
          )}
        </div>
      ))}
      {configs.length === 0 && (
        <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[13px] text-sub">
          알림 설정이 없습니다.
        </div>
      )}
    </div>
  )
}
