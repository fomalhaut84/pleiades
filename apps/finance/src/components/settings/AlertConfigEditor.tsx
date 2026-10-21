'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ALERT_CATEGORIES,
  groupByCategory,
  type AlertCategory,
  type AlertCategoryKey,
  type AlertInputType,
} from '@/lib/alert-config/categories'
import { useToast } from '@/components/ui/Toast'

interface AlertConfig {
  key: string
  value: string
  label: string
  category: AlertCategoryKey
  inputType: AlertInputType
  description: string | null
}

/** 값 + 단위 표시 (숫자형) */
const UNIT_BY_TYPE: Record<AlertInputType, string> = {
  toggle: '',
  percent: '%',
  currency_krw: '원',
  hour: '시',
  day: '일',
  minutes: '분',
  integer: '',
  text: '',
}

/** 카테고리 색상 → tailwind 유틸 클래스 매핑 */
const COLOR_CLASS: Record<AlertCategory['color'], { icon: string; text: string }> = {
  sejin: { icon: 'bg-sejin/15 text-sejin', text: 'text-sejin' },
  sodam: { icon: 'bg-sodam/15 text-sodam', text: 'text-sodam' },
  dasom: { icon: 'bg-dasom/15 text-dasom', text: 'text-dasom' },
  amber: { icon: 'bg-amber-500/15 text-amber-400', text: 'text-amber-400' },
  sub: { icon: 'bg-surface text-sub', text: 'text-sub' },
}

export default function AlertConfigEditor() {
  const { show } = useToast()
  const [configs, setConfigs] = useState<AlertConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALERT_CATEGORIES.map((c) => [c.key, true])),
  )

  const fetchConfigs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/alerts/config')
      const json = await res.json()
      if (!res.ok) {
        show({ variant: 'error', title: json?.error ?? '알림 설정 조회에 실패했습니다.' })
        return
      }
      setConfigs(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      console.error('[alerts/config] 조회 실패:', e)
      show({ variant: 'error', title: '알림 설정 조회 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => groupByCategory(configs), [configs])

  const activeToggleCount = useMemo(
    () => configs.filter((c) => c.inputType === 'toggle' && c.value.toLowerCase() === 'on').length,
    [configs],
  )
  const inactiveToggleCount = useMemo(
    () => configs.filter((c) => c.inputType === 'toggle' && c.value.toLowerCase() === 'off').length,
    [configs],
  )

  const saveConfig = async (key: string, value: string) => {
    setSavingKey(key)
    // Optimistic
    const prev = configs.find((c) => c.key === key)?.value
    setConfigs((cs) => cs.map((c) => (c.key === key ? { ...c, value } : c)))
    try {
      const res = await fetch('/api/alerts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Rollback
        if (prev !== undefined) {
          setConfigs((cs) => cs.map((c) => (c.key === key ? { ...c, value: prev } : c)))
        }
        show({ variant: 'error', title: json?.error ?? '설정 저장에 실패했습니다.' })
        return
      }
      show({ variant: 'success', title: '저장 완료' })
    } catch (e) {
      if (prev !== undefined) {
        setConfigs((cs) => cs.map((c) => (c.key === key ? { ...c, value: prev } : c)))
      }
      console.error('[alerts/config] 저장 실패:', e)
      show({ variant: 'error', title: '저장 요청 중 오류가 발생했습니다.' })
    } finally {
      setSavingKey(null)
    }
  }

  const handleToggle = (c: AlertConfig) => {
    const next = c.value.toLowerCase() === 'on' ? 'off' : 'on'
    saveConfig(c.key, next)
  }

  const startEdit = (c: AlertConfig) => {
    setEditingKey(c.key)
    setEditValue(c.value)
  }

  const commitEdit = async (c: AlertConfig) => {
    const trimmed = editValue.trim()
    if (!trimmed) {
      show({ variant: 'error', title: '값을 입력해주세요.' })
      return
    }
    await saveConfig(c.key, trimmed)
    setEditingKey(null)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const toggleSection = (catKey: AlertCategoryKey) => {
    setOpenCategories((s) => ({ ...s, [catKey]: !s[catKey] }))
  }

  const renderValueControl = (c: AlertConfig) => {
    if (c.inputType === 'toggle') {
      const isOn = c.value.toLowerCase() === 'on'
      return (
        <button
          onClick={() => handleToggle(c)}
          disabled={savingKey === c.key}
          role="switch"
          aria-checked={isOn}
          aria-label={isOn ? '비활성화' : '활성화'}
          className={`relative w-10 h-[22px] rounded-full border transition-colors flex-shrink-0 disabled:opacity-50 ${
            isOn ? 'bg-sejin/30 border-sejin/40' : 'bg-surface border-border'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
              isOn ? 'left-[20px] bg-sejin' : 'left-0.5 bg-sub'
            }`}
          />
        </button>
      )
    }

    const isText = c.inputType === 'text'

    if (editingKey === c.key) {
      return (
        <div className="flex items-center gap-2">
          <input
            type={isText ? 'text' : 'number'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit(c)
              if (e.key === 'Escape') cancelEdit()
            }}
            autoFocus
            className={`bg-surface-dim border border-border rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-bright focus:outline-none focus:border-sejin ${
              isText ? 'w-56' : 'w-20 text-right tabular-nums'
            }`}
          />
          {UNIT_BY_TYPE[c.inputType] && (
            <span className="text-[11px] text-sub">{UNIT_BY_TYPE[c.inputType]}</span>
          )}
          <button
            onClick={() => commitEdit(c)}
            disabled={savingKey === c.key}
            className="text-[11px] font-bold text-sodam bg-sodam/15 border border-sodam/25 rounded-md px-2.5 py-1 disabled:opacity-40"
          >
            저장
          </button>
          <button
            onClick={cancelEdit}
            className="text-[11px] font-semibold text-sub border border-border rounded-md px-2.5 py-1 hover:text-bright hover:bg-surface"
          >
            취소
          </button>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`text-[15px] font-bold text-bright ${isText ? 'truncate max-w-[280px]' : 'tabular-nums'}`}
          title={isText ? c.value : undefined}
        >
          {c.value || <span className="text-dim">(비어 있음)</span>}
          {UNIT_BY_TYPE[c.inputType] && (
            <span className="text-[11px] text-sub ml-0.5">{UNIT_BY_TYPE[c.inputType]}</span>
          )}
        </span>
        <button
          onClick={() => startEdit(c)}
          className="text-[12px] font-semibold text-sub bg-surface-dim border border-border rounded-md px-3 py-1.5 hover:bg-surface hover:text-bright transition-all flex-shrink-0"
        >
          수정
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[13px] text-sub">
        불러오는 중…
      </div>
    )
  }

  const toggleTotal = activeToggleCount + inactiveToggleCount

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[22px] font-extrabold text-bright tabular-nums">{configs.length}</div>
          <div className="text-[11px] text-sub mt-0.5">전체 알림 설정</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[22px] font-extrabold text-sejin tabular-nums">{activeToggleCount}</div>
          <div className="text-[11px] text-sub mt-0.5">활성 (on)</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className={`text-[22px] font-extrabold tabular-nums ${inactiveToggleCount > 0 ? 'text-dim' : 'text-dim'}`}>
            {inactiveToggleCount}
          </div>
          <div className="text-[11px] text-sub mt-0.5">비활성 (off) / 전체 {toggleTotal}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[22px] font-extrabold text-sodam tabular-nums">{grouped.length}</div>
          <div className="text-[11px] text-sub mt-0.5">카테고리</div>
        </div>
      </div>

      {/* Category sections */}
      {grouped.map(({ category, items }) => {
        const colors = COLOR_CLASS[category.color]
        const isOpen = openCategories[category.key] ?? true
        // Header 는 toggle 버튼 + 옵션 Link 를 flex 로 분리 — <a> in <button> nesting 회피 (invalid HTML).
        return (
          <section key={category.key} className="rounded-[14px] border border-border bg-card overflow-hidden">
            <div className="flex items-stretch bg-surface-dim border-b border-border">
              <button
                type="button"
                onClick={() => toggleSection(category.key)}
                className="flex-1 flex items-center gap-3 px-5 py-4 hover:bg-surface transition-colors text-left"
                aria-expanded={isOpen}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${colors.icon}`}>
                  {category.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-bright font-bold text-sm">{category.label}</div>
                  <div className="text-sub text-xs mt-0.5">
                    {category.description} <span className="text-dim">· {items.length}개 키</span>
                  </div>
                </div>
                <span className={`text-sub transition-transform ${isOpen ? '' : '-rotate-90'}`}>▾</span>
              </button>
              {category.pageLink && (
                <Link
                  href={category.pageLink.href}
                  className="flex items-center gap-1 px-4 border-l border-border text-[11px] font-semibold text-sub hover:text-bright hover:bg-surface transition-colors whitespace-nowrap"
                >
                  {category.pageLink.label} →
                </Link>
              )}
            </div>
            {isOpen && (
              <div>
                {items.map((c) => (
                  <div
                    key={c.key}
                    className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-surface-dim transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-bright">{c.label}</div>
                      <div className="text-[11px] text-dim font-mono">{c.key}</div>
                      {c.description && (
                        <div className="text-[11px] text-sub mt-1">{c.description}</div>
                      )}
                    </div>
                    {renderValueControl(c)}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <p className="text-center text-dim text-xs pt-2">
        알림 임계값 변경은 다음 스캔 주기부터 반영됩니다.
      </p>
    </div>
  )
}
