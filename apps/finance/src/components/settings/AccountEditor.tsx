'use client'

import { useState } from 'react'

interface Account {
  id: string
  name: string
  ownerAge: number | null
  strategy: string | null
  horizon: number | null
  benchmarkTicker: string | null
}

interface AccountEditorProps {
  accounts: Account[]
  onRefresh: () => void
}

const COLOR_MAP: Record<string, string> = {
  '세진': 'var(--sejin)',
  '소담': 'var(--sodam)',
  '다솜': 'var(--dasom)',
}

export default function AccountEditor({ accounts, onRefresh }: AccountEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', strategy: '', horizon: '', benchmarkTicker: '', ownerAge: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = (a: Account) => {
    setEditingId(a.id)
    setForm({
      name: a.name,
      strategy: a.strategy ?? '',
      horizon: a.horizon !== null ? String(a.horizon) : '',
      benchmarkTicker: a.benchmarkTicker ?? '',
      ownerAge: a.ownerAge !== null ? String(a.ownerAge) : '',
    })
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setError(null)
  }

  const handleSave = async (id: string) => {
    if (!form.name.trim()) { setError('계좌 이름을 입력해주세요.'); return }
    setSaving(true)
    setError(null)

    try {
      const parsedHorizon = form.horizon ? parseInt(form.horizon) : null
      const parsedAge = form.ownerAge ? parseInt(form.ownerAge) : null
      if (form.horizon && (isNaN(parsedHorizon!) || parsedHorizon! <= 0)) {
        setError('투자 기간은 양의 정수여야 합니다.')
        setSaving(false)
        return
      }
      if (form.ownerAge && (isNaN(parsedAge!) || parsedAge! < 0)) {
        setError('나이는 0 이상의 정수여야 합니다.')
        setSaving(false)
        return
      }

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        strategy: form.strategy.trim() || null,
        benchmarkTicker: form.benchmarkTicker.trim() || null,
        horizon: parsedHorizon,
        ownerAge: parsedAge,
      }

      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '수정에 실패했습니다.')
        return
      }

      setEditingId(null)
      onRefresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const inputClasses = 'bg-surface-dim border border-border rounded-lg px-3 py-2 text-[13px] text-bright font-medium focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'

  return (
    <div className="flex flex-col gap-3">
      {accounts.map((a) => {
        const color = COLOR_MAP[a.name] ?? 'var(--text)'
        const isEditing = editingId === a.id

        if (isEditing) {
          return (
            <div key={a.id} className="rounded-[14px] border border-sodam/25 bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-sodam/25 flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[15px] font-bold" style={{ color }}>{a.name}</span>
                <span className="text-[11px] text-sodam font-medium opacity-70">수정 중</span>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] font-semibold text-sub">이름</label>
                  <input className={`flex-1 ${inputClasses}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] font-semibold text-sub">전략</label>
                  <input className={`flex-1 ${inputClasses}`} value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} placeholder="혼합전략, 균형형 등" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] font-semibold text-sub">투자 기간</label>
                  <input type="number" className={`w-20 ${inputClasses}`} value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })} />
                  <span className="text-[12px] text-dim">년</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] font-semibold text-sub">벤치마크</label>
                  <input className={`flex-1 ${inputClasses}`} value={form.benchmarkTicker} onChange={(e) => setForm({ ...form, benchmarkTicker: e.target.value })} placeholder="SPY, QQQ 등" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] font-semibold text-sub">나이</label>
                  <input type="number" className={`w-20 ${inputClasses}`} value={form.ownerAge} onChange={(e) => setForm({ ...form, ownerAge: e.target.value })} />
                  <span className="text-[12px] text-dim">세</span>
                </div>

                {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-[12px] text-red-400">{error}</div>}

                <div className="flex gap-2.5 justify-end pt-1">
                  <button onClick={cancelEdit} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all">취소</button>
                  <button onClick={() => handleSave(a.id)} disabled={saving} className="px-5 py-1.5 rounded-lg text-[12px] font-bold text-sodam bg-sodam/15 border border-sodam/25 hover:bg-sodam/25 disabled:opacity-40 transition-all">
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          )
        }

        return (
          <div key={a.id} className="rounded-[14px] border border-border bg-card hover:border-border-hover transition-colors overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[15px] font-bold" style={{ color }}>{a.name}</span>
              </div>
              <button onClick={() => startEdit(a)} className="text-[12px] font-semibold text-sub bg-surface-dim border border-border rounded-md px-3 py-1.5 hover:bg-surface hover:text-bright transition-all">
                수정
              </button>
            </div>
            <div className="px-5 py-3">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[12px] text-dim">전략</span>
                <span className={`text-[13px] font-medium ${a.strategy ? 'text-bright' : 'text-dim italic'}`}>{a.strategy ?? '미설정'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-t border-white/[0.02]">
                <span className="text-[12px] text-dim">투자 기간</span>
                <span className={`text-[13px] font-medium ${a.horizon ? 'text-bright' : 'text-dim italic'}`}>{a.horizon ? `${a.horizon}년` : '미설정'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-t border-white/[0.02]">
                <span className="text-[12px] text-dim">벤치마크</span>
                <span className={`text-[13px] font-medium ${a.benchmarkTicker ? 'text-bright' : 'text-dim italic'}`}>{a.benchmarkTicker ?? '미설정'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-t border-white/[0.02]">
                <span className="text-[12px] text-dim">나이</span>
                <span className={`text-[13px] font-medium ${a.ownerAge !== null ? 'text-bright' : 'text-dim italic'}`}>{a.ownerAge !== null ? `${a.ownerAge}세` : '미설정'}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
