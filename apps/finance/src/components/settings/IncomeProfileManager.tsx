'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatKRW } from '@/lib/format'

interface IncomeProfile {
  id: string
  year: number
  inputType: string
  grossSalary: number | null
  taxableIncome: number
  prepaidTax: number
  note: string | null
}

export default function IncomeProfileManager() {
  const [profiles, setProfiles] = useState<IncomeProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<IncomeProfile | null>(null)

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/income-profiles')
      if (res.ok) setProfiles(await res.json())
    } catch {}
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  const handleDelete = async (id: string) => {
    if (!confirm('근로소득 프로필을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/income-profiles/${id}`, { method: 'DELETE' })
      if (res.ok) fetchProfiles()
    } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all">
          + 프로필 추가
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {profiles.map((p) => (
          <div key={p.id} className="rounded-[14px] border border-border bg-card px-5 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-[15px] font-bold text-bright">{p.year}년</span>
                <span className="text-[11px] text-dim bg-surface-dim px-2 py-0.5 rounded">
                  {p.inputType === 'gross' ? '세전총급여' : '과세표준'}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => { setEditingItem(p); setShowForm(true) }}
                  className="p-1.5 rounded-md text-dim hover:text-text hover:bg-surface transition-all" title="수정">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" /></svg>
                </button>
                <button onClick={() => handleDelete(p.id)}
                  className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all" title="삭제">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" /></svg>
                </button>
              </div>
            </div>
            <div className="flex gap-6 text-[12px]">
              {p.grossSalary !== null && (
                <div><span className="text-dim">세전총급여:</span> <span className="text-text tabular-nums">{formatKRW(p.grossSalary)}</span></div>
              )}
              <div><span className="text-dim">과세표준:</span> <span className="text-text tabular-nums">{formatKRW(p.taxableIncome)}</span></div>
              <div><span className="text-dim">기납부세액:</span> <span className="text-text tabular-nums">{formatKRW(p.prepaidTax)}</span></div>
            </div>
            {p.note && <div className="text-[11px] text-dim mt-1">{p.note}</div>}
          </div>
        ))}
        {profiles.length === 0 && (
          <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[13px] text-sub">
            근로소득 프로필이 없습니다.
          </div>
        )}
      </div>

      {showForm && (
        <IncomeProfileForm
          item={editingItem}
          onClose={() => { setShowForm(false); setEditingItem(null) }}
          onSaved={fetchProfiles}
        />
      )}
    </div>
  )
}

function IncomeProfileForm({ item, onClose, onSaved }: { item: IncomeProfile | null; onClose: () => void; onSaved: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(item ? String(item.year) : String(new Date().getFullYear()))
  const [inputType, setInputType] = useState(item?.inputType ?? 'gross')
  const [grossSalary, setGrossSalary] = useState(item?.grossSalary !== null ? String(item?.grossSalary) : '')
  const [taxableIncome, setTaxableIncome] = useState(item ? String(item.taxableIncome) : '')
  const [prepaidTax, setPrepaidTax] = useState(item ? String(item.prepaidTax) : '0')
  const [note, setNote] = useState(item?.note ?? '')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const parsedYear = parseInt(year)
    if (!parsedYear || parsedYear < 1900 || parsedYear > 2100) { setError('유효한 연도를 입력해주세요.'); setIsSubmitting(false); return }

    const body: Record<string, unknown> = {
      year: parsedYear,
      inputType,
      prepaidTax: prepaidTax ? parseFloat(prepaidTax) : 0,
      note: note.trim() || null,
    }
    if (inputType === 'gross') {
      body.grossSalary = grossSalary ? parseFloat(grossSalary) : 0
    } else {
      body.taxableIncome = taxableIncome ? parseFloat(taxableIncome) : 0
    }

    try {
      const url = item ? `/api/income-profiles/${item.id}` : '/api/income-profiles'
      const method = item ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '저장에 실패했습니다.')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClasses = 'w-full bg-surface-dim border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-bright placeholder-dim focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'
  const labelClasses = 'block text-[12px] font-semibold text-sub mb-1.5'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-bg-raised border-l border-border z-50 overflow-y-auto animate-slide-in">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-bright">{item ? '프로필 수정' : '프로필 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-sub hover:text-bright hover:bg-surface transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          <div>
            <label className={labelClasses}>귀속 연도</label>
            <input type="number" className={inputClasses} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <label className={labelClasses}>입력 방식</label>
            <div className="flex gap-1">
              {[['gross', '세전 총급여'], ['taxable', '과세표준 직접 입력']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setInputType(v)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-all ${inputType === v ? 'bg-surface text-bright border-border-hover' : 'border-border text-sub'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {inputType === 'gross' ? (
            <div>
              <label className={labelClasses}>세전 총급여 (원)</label>
              <input type="number" className={inputClasses} value={grossSalary} onChange={(e) => setGrossSalary(e.target.value)} placeholder="0" />
            </div>
          ) : (
            <div>
              <label className={labelClasses}>과세표준 (원)</label>
              <input type="number" className={inputClasses} value={taxableIncome} onChange={(e) => setTaxableIncome(e.target.value)} placeholder="0" />
            </div>
          )}
          <div>
            <label className={labelClasses}>기납부 세액 (원)</label>
            <input type="number" className={inputClasses} value={prepaidTax} onChange={(e) => setPrepaidTax(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelClasses}>메모 (선택)</label>
            <input className={inputClasses} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" />
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">{error}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all">취소</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-sodam/15 text-sodam border border-sodam/25 hover:bg-sodam/25 disabled:opacity-40 transition-all">
              {isSubmitting ? '저장 중...' : item ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.2s ease-out; }
      `}</style>
    </>
  )
}
