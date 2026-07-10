'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CustomStrategyRow } from './types'
import { conditionToString } from '@/lib/custom-strategy/types'
import type {
  Condition, LogicOp, Frequency, ParsedStrategy,
} from '@/lib/custom-strategy/types'
import type { StrategyDiff } from '@/lib/custom-strategy/diff'

interface StrategyEditModalProps {
  item: CustomStrategyRow
  onClose: () => void
  onSaved: () => void
}

interface NLPreview {
  before: ParsedStrategy
  after: ParsedStrategy
  diff: StrategyDiff
}

export default function StrategyEditModal({ item, onClose, onSaved }: StrategyEditModalProps) {
  const { show } = useToast()
  const [name, setName] = useState(item.name)
  const [frequency, setFrequency] = useState<Frequency>(item.frequency as Frequency)
  const [logic, setLogic] = useState<LogicOp>(item.logic as LogicOp)
  const [isActive, setIsActive] = useState(item.isActive)
  const [saving, setSaving] = useState(false)

  // Phase 35-B (#434) — 자연어 편집
  const [nlInput, setNlInput] = useState('')
  const [nlPreview, setNlPreview] = useState<NLPreview | null>(null)
  const [nlLoading, setNlLoading] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const dirtyBasics =
    name.trim() !== item.name ||
    frequency !== item.frequency ||
    logic !== item.logic ||
    isActive !== item.isActive
  const dirty = dirtyBasics || nlPreview !== null
  // self-review P1 (#434): 미리보기 활성 시 기본 필드는 잠금.
  // 원래 로직은 nlPreview 있으면 nlPreview.after 값을 우선 → 사용자가 name 을
  // 수동 편집해도 무시. 시각적 disable 로 혼란 방지.
  const basicsLocked = nlPreview !== null

  const handlePreview = async () => {
    if (!nlInput.trim() || nlLoading) return
    // Codex #440 P2: preview 요청은 DB 상태 (before) 만 참조 → 로컬에서 name/logic/
    // frequency 수동 편집 상태 후 preview 하면 `after` 가 DB 값 기준이라 save 시
    // 사용자의 수동 변경이 사일런트 드롭됨. dirty 시 preview 차단해 순서 강제.
    if (dirtyBasics) {
      show({
        variant: 'error',
        title: '기본 필드 변경 사항이 있습니다. 먼저 저장하거나 되돌린 뒤 미리보기 해주세요.',
      })
      return
    }
    setNlLoading(true)
    setNlPreview(null)
    try {
      const res = await fetch(`/api/custom-strategies/${item.id}/nl-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: nlInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        show({ variant: 'error', title: json?.error ?? '미리보기 실패' })
        return
      }
      setNlPreview(json.data as NLPreview)
    } catch (e) {
      console.error('[strategies] nl-edit preview 실패:', e)
      show({ variant: 'error', title: '미리보기 요청 중 오류가 발생했습니다.' })
    } finally {
      setNlLoading(false)
    }
  }

  const clearPreview = () => {
    setNlPreview(null)
    setNlInput('')
  }

  const handleSave = async () => {
    if (!dirty || saving) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      show({ variant: 'error', title: '이름을 입력해주세요.' })
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      const eff = nlPreview?.after
      // NL 편집 반영: after 값을 기본 필드에도 적용
      const effName = eff?.name ?? trimmedName
      const effFreq = eff?.frequency ?? frequency
      const effLogic = eff?.logic ?? logic

      if (effName !== item.name) body.name = effName
      if (effFreq !== item.frequency) body.frequency = effFreq
      if (effLogic !== item.logic) body.logic = effLogic
      if (isActive !== item.isActive) body.isActive = isActive
      // Codex #440 재리뷰 P2: conditions 는 실제 조건 변경이 있을 때만 포함.
      // preview 가 이름만 바꿔도 항상 conditions 를 넘기면 서버가 lastTriggeredAt
      // 을 리셋할 수 있어 `once` 가 재무장. diff 에서 실제 add/remove 있을 때만.
      const conditionsChanged = nlPreview
        && (nlPreview.diff.conditionsAdded.length > 0 || nlPreview.diff.conditionsRemoved.length > 0)
      if (conditionsChanged && eff?.conditions) {
        body.conditions = eff.conditions
      }

      const res = await fetch(`/api/custom-strategies/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        show({ variant: 'error', title: json?.error ?? '전략 수정에 실패했습니다.' })
        return
      }
      show({ variant: 'success', title: '전략 수정 완료' })
      onSaved()
      onClose()
    } catch (e) {
      console.error('[strategies] edit 실패:', e)
      show({ variant: 'error', title: '수정 요청 중 오류가 발생했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-bg-raised p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-bright font-bold text-base">전략 편집</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 text-sub hover:text-bright hover:bg-surface rounded-md transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {basicsLocked && (
            <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-1.5">
              🔒 자연어 미리보기 활성 — 기본 필드는 잠금. 수동 편집하려면 위에서 &quot;미리보기 취소&quot;.
            </div>
          )}

          <div>
            <label className="text-sub text-xs">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              disabled={basicsLocked}
              className="w-full mt-1 bg-surface-dim border border-border rounded-lg px-3 py-2 text-sm text-bright focus:outline-none focus:border-sejin disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sub text-xs">발동 빈도</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                disabled={basicsLocked}
                className="w-full mt-1 bg-surface-dim border border-border rounded-lg px-3 py-2 text-sm text-bright focus:outline-none focus:border-sejin disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="once">한 번만 (once)</option>
                <option value="daily">매일 1회 (daily)</option>
                <option value="always">매 스캔 (always)</option>
              </select>
            </div>
            <div>
              <label className="text-sub text-xs">조건 결합</label>
              <select
                value={logic}
                onChange={(e) => setLogic(e.target.value as LogicOp)}
                disabled={basicsLocked}
                className="w-full mt-1 bg-surface-dim border border-border rounded-lg px-3 py-2 text-sm text-bright focus:outline-none focus:border-sejin disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="AND">AND (모두)</option>
                <option value="OR">OR (하나)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between bg-surface-dim rounded-lg p-3 border border-border">
            <div className="text-sm">
              <div className="text-bright font-semibold">활성 상태</div>
              <div className="text-sub text-xs">비활성 시 감시 중단</div>
            </div>
            <button
              onClick={() => setIsActive((v) => !v)}
              role="switch"
              aria-checked={isActive}
              aria-label={isActive ? '비활성화' : '활성화'}
              className={`relative w-9 h-5 rounded-full border transition-colors flex-shrink-0 ${
                isActive ? 'bg-sejin/30 border-sejin/40' : 'bg-surface border-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                  isActive ? 'left-[18px] bg-sejin' : 'left-0.5 bg-sub'
                }`}
              />
            </button>
          </div>

          {/* Phase 35-B — 자연어 편집 */}
          <div className="rounded-lg bg-surface-dim border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-bright font-semibold text-sm">🧠 자연어 편집</div>
              {nlPreview && (
                <button
                  onClick={clearPreview}
                  className="text-[11px] text-sub hover:text-bright"
                >
                  미리보기 취소
                </button>
              )}
            </div>
            <div className="text-[11px] text-sub">
              예: &quot;SPY 조건 빼줘&quot; · &quot;어닝 5일로 완화&quot; · &quot;OR 로 바꿔&quot;
            </div>
            <textarea
              value={nlInput}
              onChange={(e) => {
                setNlInput(e.target.value)
                // Codex #440 P2: 지시 텍스트가 편집되면 이전 preview 는 stale.
                // 사용자가 preview 재실행 없이 save 하면 이전 지시의 after 로 저장돼
                // 화면 텍스트와 실제 저장이 어긋남. 텍스트 변경 시 preview 무효화.
                if (nlPreview) setNlPreview(null)
              }}
              placeholder="편집 지시를 자연어로 입력..."
              rows={2}
              maxLength={500}
              disabled={nlLoading}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-bright placeholder:text-dim focus:outline-none focus:border-sejin disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-dim">{nlInput.length}/500</div>
              <button
                onClick={handlePreview}
                disabled={!nlInput.trim() || nlLoading || dirtyBasics}
                title={dirtyBasics ? '기본 필드 변경 사항이 있어 미리보기 차단 (먼저 저장/되돌리기)' : ''}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-sejin/40 bg-sejin/15 text-sejin hover:bg-sejin/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {nlLoading ? '분석 중…' : '미리보기'}
              </button>
            </div>

            {nlPreview && (
              <div className="mt-2 space-y-2 border-t border-border pt-2">
                <div className="text-[12px] font-semibold text-bright">변경 사항</div>
                <DiffView diff={nlPreview.diff} />
                {!hasAnyDiff(nlPreview.diff) && (
                  <div className="text-[12px] text-amber-400">
                    ⚠️ 변경 사항이 감지되지 않았습니다. 지시를 더 명확히 해주세요.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-sub hover:text-bright hover:bg-surface rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-bright text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function hasAnyDiff(d: StrategyDiff): boolean {
  return !!(d.nameChanged || d.logicChanged || d.frequencyChanged || d.tickerChanged
    || d.conditionsAdded.length > 0 || d.conditionsRemoved.length > 0)
}

function DiffView({ diff }: { diff: StrategyDiff }) {
  return (
    <div className="text-[12px] space-y-1">
      {diff.nameChanged && (
        <Line label="이름" from={diff.nameChanged.from} to={diff.nameChanged.to} />
      )}
      {diff.tickerChanged && (
        <Line label="티커" from={diff.tickerChanged.from} to={diff.tickerChanged.to} />
      )}
      {diff.logicChanged && (
        <Line label="Logic" from={diff.logicChanged.from} to={diff.logicChanged.to} />
      )}
      {diff.frequencyChanged && (
        <Line label="빈도" from={diff.frequencyChanged.from} to={diff.frequencyChanged.to} />
      )}
      {diff.conditionsRemoved.map((c: Condition, i: number) => (
        <div key={`r-${i}`} className="flex items-start gap-2">
          <span className="text-red-400 font-mono">−</span>
          <span className="text-red-400 font-mono">{conditionToString(c)}</span>
        </div>
      ))}
      {diff.conditionsAdded.map((c: Condition, i: number) => (
        <div key={`a-${i}`} className="flex items-start gap-2">
          <span className="text-emerald-400 font-mono">+</span>
          <span className="text-emerald-400 font-mono">{conditionToString(c)}</span>
        </div>
      ))}
    </div>
  )
}

function Line({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="flex items-center gap-1 text-sub">
      <span className="text-dim w-14">{label}</span>
      <span className="text-red-400 font-mono">{from}</span>
      <span className="text-dim">→</span>
      <span className="text-emerald-400 font-mono">{to}</span>
    </div>
  )
}
