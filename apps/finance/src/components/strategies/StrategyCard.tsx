'use client'

import { conditionToString, validateCondition, type Condition } from '@/lib/custom-strategy/types'
import type { CustomStrategyRow } from './types'

const FREQUENCY_CHIP: Record<string, { label: string; icon: string; className: string }> = {
  once: { label: 'once', icon: '🎯', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  daily: { label: 'daily', icon: '🗓️', className: 'bg-sodam/15 text-sodam border-sodam/30' },
  always: { label: 'always', icon: '♾️', className: 'bg-dasom/15 text-dasom border-dasom/30' },
}

function extractConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(validateCondition)
}

function formatLastTriggered(iso: string | null): string {
  if (!iso) return '발동 이력 없음'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  if (diffMs < 0) return '방금'
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}일 전`
  return new Date(iso).toISOString().slice(0, 10)
}

interface StrategyCardProps {
  item: CustomStrategyRow
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function StrategyCard({ item, onToggle, onEdit, onDelete }: StrategyCardProps) {
  const conditions = extractConditions(item.conditions)
  const freq = FREQUENCY_CHIP[item.frequency] ?? FREQUENCY_CHIP.daily
  const createdDate = new Date(item.createdAt).toISOString().slice(0, 10)

  return (
    <div
      className={`p-4 space-y-3 rounded-xl border transition-all ${
        item.isActive
          ? 'border-border hover:border-border-hover bg-card hover:-translate-y-0.5'
          : 'border-border bg-card opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              item.isActive ? 'bg-sejin shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-dim'
            }`}
          />
          <div className="min-w-0">
            <div className="text-bright font-semibold text-sm truncate">{item.name}</div>
            <div className="text-sub text-xs">
              {item.ticker} · 등록 {createdDate}
            </div>
          </div>
        </div>
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={item.isActive}
          aria-label={item.isActive ? '전략 비활성화' : '전략 활성화'}
          className={`relative w-9 h-5 rounded-full border transition-colors flex-shrink-0 ${
            item.isActive ? 'bg-sejin/30 border-sejin/40' : 'bg-surface border-border'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
              item.isActive ? 'left-[18px] bg-sejin' : 'left-0.5 bg-sub'
            }`}
          />
        </button>
      </div>

      <div className="space-y-1.5">
        {conditions.length === 0 && <div className="text-dim text-xs italic">조건 파싱 오류</div>}
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 bg-surface-dim rounded-md px-2.5 py-1.5 text-xs font-mono text-muted">
              {conditionToString(c)}
            </div>
            {i < conditions.length - 1 && (
              <span className="text-sodam text-[10px] font-bold flex-shrink-0">{item.logic}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${freq.className}`}
          >
            <span>{freq.icon}</span>
            {freq.label}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border bg-surface text-sub">
            🎯 {formatLastTriggered(item.lastTriggeredAt)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="px-2 py-1 text-[11px] text-sub hover:text-bright hover:bg-surface rounded-md transition-colors"
            aria-label="편집"
          >
            ✏️
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
            aria-label="삭제"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}
