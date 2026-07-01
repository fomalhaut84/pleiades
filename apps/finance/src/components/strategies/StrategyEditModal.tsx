'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CustomStrategyRow } from './types'

interface StrategyEditModalProps {
  item: CustomStrategyRow
  onClose: () => void
  onSaved: () => void
}

export default function StrategyEditModal({ item, onClose, onSaved }: StrategyEditModalProps) {
  const { show } = useToast()
  const [name, setName] = useState(item.name)
  const [frequency, setFrequency] = useState(item.frequency)
  const [logic, setLogic] = useState(item.logic)
  const [isActive, setIsActive] = useState(item.isActive)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const dirty =
    name.trim() !== item.name ||
    frequency !== item.frequency ||
    logic !== item.logic ||
    isActive !== item.isActive

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
      if (trimmedName !== item.name) body.name = trimmedName
      if (frequency !== item.frequency) body.frequency = frequency
      if (logic !== item.logic) body.logic = logic
      if (isActive !== item.isActive) body.isActive = isActive

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
        className="w-full max-w-md rounded-xl border border-border bg-bg-raised p-6 space-y-4"
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
          <div>
            <label className="text-sub text-xs">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full mt-1 bg-surface-dim border border-border rounded-lg px-3 py-2 text-sm text-bright focus:outline-none focus:border-sejin"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sub text-xs">발동 빈도</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full mt-1 bg-surface-dim border border-border rounded-lg px-3 py-2 text-sm text-bright focus:outline-none focus:border-sejin"
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
                onChange={(e) => setLogic(e.target.value)}
                className="w-full mt-1 bg-surface-dim border border-border rounded-lg px-3 py-2 text-sm text-bright focus:outline-none focus:border-sejin"
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

          <div className="rounded-lg bg-surface-dim border border-border px-3 py-2 text-xs text-sub">
            <div className="font-semibold text-amber-400 mb-1">⚠️ 조건 자체는 편집 불가</div>
            조건 (price/rsi/… ) 을 변경하려면 이 전략을 삭제 후 다시 등록해주세요.
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
