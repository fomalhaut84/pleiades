/**
 * Phase 33-B (#417) — 알림 kind 메타 (라벨/색상).
 * Server (`route.ts`) 와 UI 모두 참조 가능한 pure 상수. AlertConfig 카테고리와는 별도
 * (kind 는 발동 종류, alert-config category 는 설정 그룹).
 */

export type AlertKind =
  | 'surge' | 'drop' | 'fx'
  | 'target_hit' | 'stop_loss'
  | 'watch_buy' | 'watch_zone'
  | 'ta_signal' | 'custom_strategy'

export interface KindMeta {
  key: AlertKind
  label: string
  icon: string
  /** Tailwind 배경/텍스트 짝 (뱃지·차트 색상용) */
  colorClass: string
  /** Recharts 등 SVG 용 hex */
  hex: string
}

export const KIND_META: KindMeta[] = [
  { key: 'surge',           label: '급등',        icon: '🟢', colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', hex: '#34d399' },
  { key: 'drop',            label: '급락',        icon: '🔴', colorClass: 'bg-red-500/15 text-red-400 border-red-500/30',              hex: '#f87171' },
  { key: 'fx',              label: '환율',        icon: '💱', colorClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',              hex: '#38bdf8' },
  { key: 'target_hit',      label: '목표가',      icon: '🎯', colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', hex: '#34d399' },
  { key: 'stop_loss',       label: '손절가',      icon: '🛑', colorClass: 'bg-red-500/15 text-red-400 border-red-500/30',              hex: '#ef4444' },
  { key: 'watch_buy',       label: '목표매수가',  icon: '💰', colorClass: 'bg-sejin/15 text-sejin border-sejin/30',                    hex: '#34d399' },
  { key: 'watch_zone',      label: '매수구간',    icon: '🔔', colorClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',        hex: '#fbbf24' },
  { key: 'ta_signal',       label: 'TA 시그널',   icon: '📊', colorClass: 'bg-violet-500/15 text-violet-400 border-violet-500/30',     hex: '#a78bfa' },
  { key: 'custom_strategy', label: '커스텀 전략', icon: '🧠', colorClass: 'bg-dasom/15 text-dasom border-dasom/30',                    hex: '#fb923c' },
]

export const KIND_BY_KEY: Record<AlertKind, KindMeta> = Object.fromEntries(
  KIND_META.map((m) => [m.key, m]),
) as Record<AlertKind, KindMeta>

export function kindMetaOf(key: string): KindMeta | undefined {
  return KIND_BY_KEY[key as AlertKind]
}

export const STATUS_META: Record<string, { label: string; colorClass: string }> = {
  sent:    { label: '전송',       colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  partial: { label: '일부 전송',  colorClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  failed:  { label: '실패',       colorClass: 'bg-red-500/15 text-red-400 border-red-500/30' },
}
