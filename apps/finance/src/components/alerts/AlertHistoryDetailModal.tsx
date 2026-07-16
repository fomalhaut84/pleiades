'use client'

/**
 * Phase 37-A (#444) — 알림 발동 이력 상세 모달.
 *
 * `AlertHistory.contextJson` 을 kind 별로 렌더 분기.
 * 컨텍스트가 없는 (v1) row 는 안내 문구 노출.
 */

import { useEffect } from 'react'
import { STATUS_META, kindMetaOf } from '@/app/alerts/history/kinds'
import { formatFiredAt, messageForDisplay } from '@/app/alerts/history/client-utils'
import { conditionToString, type Condition } from '@/lib/custom-strategy/types'

// 상세 모달이 필요로 하는 최소 필드셋. AlertHistoryClient 의 HistoryRow 와 호환.
export interface AlertHistoryDetailRow {
  id: string
  firedAt: string
  kind: string
  ticker: string | null
  price: number | null
  changePercent: number | null
  message: string
  deliveryStatus: string
  recipientCount: number
  errorMessage: string | null
  context: unknown
}

interface Props {
  row: AlertHistoryDetailRow
  onClose: () => void
}

export default function AlertHistoryDetailModal({ row, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const meta = kindMetaOf(row.kind)
  const status =
    STATUS_META[row.deliveryStatus] ??
    { label: row.deliveryStatus, colorClass: 'bg-surface text-sub border-border' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-bg-raised p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="알림 상세"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded border font-semibold text-[11px] ${
                  meta?.colorClass ?? 'bg-surface text-sub border-border'
                }`}
              >
                {meta?.icon} {meta?.label ?? row.kind}
              </span>
              {row.ticker && (
                <span className="px-2 py-0.5 rounded bg-surface-dim border border-border text-bright font-mono text-[11px]">
                  {row.ticker}
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded border font-semibold text-[11px] ${status.colorClass}`}
              >
                {status.label} · {row.recipientCount}명
              </span>
            </div>
            <div className="text-[11px] text-sub tabular-nums">{formatFiredAt(row.firedAt)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sub hover:text-bright hover:bg-surface rounded-md transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Message */}
        <div className="rounded-lg bg-surface-dim border border-border p-3">
          <div className="text-[11px] text-sub mb-1">알림 메시지</div>
          <div className="text-[13px] text-bright whitespace-pre-line">
            {messageForDisplay(row.message, row.kind)}
          </div>
          {row.errorMessage && (
            <div className="mt-2 pt-2 border-t border-border text-[11px] text-red-400 font-mono">
              에러: {row.errorMessage}
            </div>
          )}
        </div>

        {/* Context (kind 별 분기) */}
        <ContextSection kind={row.kind} context={row.context} />
      </div>
    </div>
  )
}

// ─── 렌더러 ──────────────────────────────────────────

function ContextSection({ kind, context }: { kind: string; context: unknown }) {
  if (!context || typeof context !== 'object') {
    return (
      <div className="rounded-lg bg-surface-dim border border-border p-3 text-[12px] text-sub">
        컨텍스트 없음 (v1 데이터 · Phase 37-A 이전 기록)
      </div>
    )
  }

  const ctx = context as Record<string, unknown>
  const t = typeof ctx.type === 'string' ? ctx.type : kind

  if (
    t === 'surge' || t === 'drop' ||
    t === 'target_hit' || t === 'stop_loss' ||
    t === 'watch_buy' || t === 'watch_zone'
  ) {
    return <PriceContextView ctx={ctx} />
  }
  if (t === 'fx') return <FxContextView ctx={ctx} />
  if (t === 'ta_signal') return <TaContextView ctx={ctx} />
  if (t === 'custom_strategy') return <CustomStrategyContextView ctx={ctx} />

  return (
    <div className="rounded-lg bg-surface-dim border border-border p-3 text-[12px] text-sub">
      알 수 없는 컨텍스트 타입: <span className="font-mono">{String(t)}</span>
    </div>
  )
}

// ─── 개별 renderer ────────────────────────────────────

function PriceContextView({ ctx }: { ctx: Record<string, unknown> }) {
  const price = num(ctx.price)
  const changePct = num(ctx.changePercent)
  const threshold = num(ctx.threshold)
  const marketOpen = typeof ctx.marketOpen === 'boolean' ? ctx.marketOpen : null

  return (
    <div className="rounded-lg bg-surface-dim border border-border p-3 space-y-2">
      <div className="text-[11px] text-sub">시세 스냅샷</div>
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <Stat label="현재가" value={price != null ? price.toLocaleString('ko-KR') : '—'} />
        <Stat
          label="변동률"
          value={changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
          tone={changePct == null ? 'sub' : changePct >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="기준값"
          value={threshold != null ? threshold.toLocaleString('ko-KR') : '—'}
        />
        <Stat
          label="시장"
          value={marketOpen == null ? '—' : marketOpen ? '장중' : '장외'}
          tone={marketOpen == null ? 'sub' : marketOpen ? 'up' : 'sub'}
        />
      </div>
    </div>
  )
}

function FxContextView({ ctx }: { ctx: Record<string, unknown> }) {
  const rate = num(ctx.rate)
  const changeKrw = num(ctx.changeKrw)
  const changePct = num(ctx.changePercent)

  return (
    <div className="rounded-lg bg-surface-dim border border-border p-3 space-y-2">
      <div className="text-[11px] text-sub">환율 스냅샷</div>
      <div className="grid grid-cols-3 gap-3 text-[13px]">
        <Stat label="USDKRW" value={rate != null ? `${rate.toLocaleString('ko-KR')}원` : '—'} />
        <Stat
          label="변동"
          value={changeKrw != null ? `${changeKrw > 0 ? '+' : ''}${changeKrw.toFixed(0)}원` : '—'}
          tone={changeKrw == null ? 'sub' : changeKrw >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="변동률"
          value={changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
          tone={changePct == null ? 'sub' : changePct >= 0 ? 'up' : 'down'}
        />
      </div>
    </div>
  )
}

function TaContextView({ ctx }: { ctx: Record<string, unknown> }) {
  const price = num(ctx.price)
  const changePct = num(ctx.changePercent)
  const rsi = num(ctx.rsi)
  const macdCrossover = str(ctx.macdCrossover)
  const bbPosition = str(ctx.bbPosition)
  const smaGolden = typeof ctx.smaGoldenCross === 'boolean' ? ctx.smaGoldenCross : null
  const smaDead = typeof ctx.smaDeathCross === 'boolean' ? ctx.smaDeathCross : null
  const volumeSurge = typeof ctx.volumeSurge === 'boolean' ? ctx.volumeSurge : null
  const overall = str(ctx.overall)
  const signals = Array.isArray(ctx.signals) ? (ctx.signals as unknown[]).map(String) : []

  return (
    <div className="rounded-lg bg-surface-dim border border-border p-3 space-y-3">
      <div className="text-[11px] text-sub">TA 지표 스냅샷</div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <Stat label="현재가" value={price != null ? price.toLocaleString('ko-KR') : '—'} />
        <Stat
          label="변동률"
          value={changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
          tone={changePct == null ? 'sub' : changePct >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {rsi != null && (
          <Badge color="violet" label={`RSI ${rsi.toFixed(1)}`} />
        )}
        {macdCrossover && (
          <Badge color={macdCrossover === 'GOLDEN' ? 'emerald' : 'red'} label={`MACD ${macdCrossover}`} />
        )}
        {bbPosition && (
          <Badge color="sky" label={`BB ${bbPosition}`} />
        )}
        {smaGolden && <Badge color="emerald" label="SMA GOLDEN" />}
        {smaDead && <Badge color="red" label="SMA DEAD" />}
        {volumeSurge && <Badge color="amber" label="거래량 급증" />}
        {overall && (
          <Badge
            color={overall.includes('BUY') ? 'emerald' : overall.includes('SELL') ? 'red' : 'sub'}
            label={`종합 ${overall}`}
          />
        )}
      </div>

      {signals.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-[11px] text-sub mb-1">발동된 시그널</div>
          <div className="flex flex-wrap gap-1">
            {signals.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded border border-border bg-surface text-bright font-mono text-[11px]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CustomStrategyContextView({ ctx }: { ctx: Record<string, unknown> }) {
  const strategyName = str(ctx.strategyName)
  const strategyTicker = str(ctx.strategyTicker)
  const logic = str(ctx.logic)
  const perCondition = Array.isArray(ctx.perCondition)
    ? (ctx.perCondition as Array<{ condition?: unknown; result?: unknown }>)
    : []
  const snapshot = ctx.snapshot && typeof ctx.snapshot === 'object'
    ? (ctx.snapshot as Record<string, unknown>)
    : null

  return (
    <div className="rounded-lg bg-surface-dim border border-border p-3 space-y-3">
      <div className="text-[11px] text-sub">커스텀 전략 스냅샷</div>

      <div className="text-[13px]">
        <div className="text-bright font-semibold">{strategyName ?? '(이름 없음)'}</div>
        <div className="text-sub text-[11px] mt-0.5">
          티커 <span className="font-mono">{strategyTicker ?? '?'}</span> · 결합 {logic ?? '?'}
        </div>
      </div>

      {perCondition.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="text-[11px] text-sub mb-1">조건별 결과</div>
          <ul className="space-y-1 text-[12px] font-mono">
            {perCondition.map((p, i) => {
              const result = p.result === true
              const label = p.condition ? conditionToString(p.condition as Condition) : '?'
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className={result ? 'text-emerald-400' : 'text-red-400'}>
                    {result ? '✅' : '❌'}
                  </span>
                  <span className={result ? 'text-bright' : 'text-sub'}>{label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {snapshot && (
        <StrategySnapshotView snapshot={snapshot} />
      )}
    </div>
  )
}

function StrategySnapshotView({ snapshot }: { snapshot: Record<string, unknown> }) {
  const macd = str(snapshot.macdCrossover)
  const bb = str(snapshot.bbPosition)
  const rsi = num(snapshot.rsi)
  return (
    <div className="border-t border-border pt-2">
      <div className="text-[11px] text-sub mb-1">평가 시점 시세</div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <Stat label="현재가" value={fmtNum(snapshot.price)} />
        <Stat label="변동률" value={fmtPct(snapshot.changePercent)} />
        {rsi != null && <Stat label="RSI" value={rsi.toFixed(1)} />}
        {macd && <Stat label="MACD" value={macd} />}
        {bb && <Stat label="BB" value={bb} />}
      </div>
    </div>
  )
}

// ─── UI primitives ──────────────────────────────────

function Stat({
  label,
  value,
  tone = 'bright',
}: {
  label: string
  value: string
  tone?: 'bright' | 'up' | 'down' | 'sub'
}) {
  const toneClass = {
    bright: 'text-bright',
    up: 'text-emerald-400',
    down: 'text-red-400',
    sub: 'text-sub',
  }[tone]
  return (
    <div>
      <div className="text-[11px] text-sub">{label}</div>
      <div className={`${toneClass} font-semibold tabular-nums`}>{value}</div>
    </div>
  )
}

type BadgeColor = 'emerald' | 'red' | 'sky' | 'violet' | 'amber' | 'sub'

function Badge({ color, label }: { color: BadgeColor; label: string }) {
  const cls: Record<BadgeColor, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    sub: 'bg-surface border-border text-sub',
  }
  return (
    <span className={`px-2 py-0.5 rounded border font-semibold ${cls[color]}`}>{label}</span>
  )
}

// ─── helpers ──────────────────────────────────

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}
function fmtNum(v: unknown, decimals = 0): string {
  const n = num(v)
  if (n == null) return '—'
  return decimals > 0 ? n.toFixed(decimals) : n.toLocaleString('ko-KR')
}
function fmtPct(v: unknown): string {
  const n = num(v)
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
