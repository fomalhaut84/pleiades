/**
 * Phase 33-A (#416) — MCP tool: `list_alert_history`.
 * 텔레그램 AI 에서 최근 알림 발동 이력 조회.
 */

import { prisma } from '@/lib/prisma'
import { toolResult, toolError } from '../utils'
import type { Prisma } from '@prisma/client'

const KIND_LABELS: Record<string, string> = {
  surge: '🟢 급등',
  drop: '🔴 급락',
  fx: '💱 환율',
  target_hit: '🎯 목표가',
  stop_loss: '🛑 손절가',
  watch_buy: '💰 목표매수가',
  watch_zone: '🔔 매수구간',
  ta_signal: '📊 TA 시그널',
  custom_strategy: '🧠 커스텀 전략',
}

const STATUS_LABELS: Record<string, string> = {
  sent: '전송',
  partial: '일부 전송',
  failed: '실패',
}

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

/**
 * ISO 8601 문자열 → Date. 잘못된 형식이면 null.
 */
function parseISO(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface ListAlertHistoryArgs {
  kind?: string
  ticker?: string
  from?: string
  to?: string
  limit?: number
}

export async function listAlertHistory(args: ListAlertHistoryArgs = {}) {
  try {
    const where: Prisma.AlertHistoryWhereInput = {}
    if (args.kind) {
      if (!(args.kind in KIND_LABELS)) {
        return toolError(
          `알 수 없는 kind: ${args.kind}. 사용 가능: ${Object.keys(KIND_LABELS).join(', ')}`,
        )
      }
      where.kind = args.kind
    }
    // 티커 정규화 — MCP 호출자가 자연어로 소문자/공백 포함으로 넘길 수 있음.
    // Prisma 저장값은 대문자 정규화된 상태 (holdings/watchlist/priceCache 파이프라인).
    // 미정규화 exact match 는 rows 있어도 "이력 없음" 오탐 (Codex #423 P2).
    if (args.ticker) where.ticker = args.ticker.trim().toUpperCase()

    const from = parseISO(args.from)
    const to = parseISO(args.to)
    if (args.from && !from) return toolError(`from 이 ISO 8601 형식이 아닙니다: ${args.from}`)
    if (args.to && !to) return toolError(`to 가 ISO 8601 형식이 아닙니다: ${args.to}`)
    if (from || to) {
      where.firedAt = {}
      if (from) where.firedAt.gte = from
      if (to) where.firedAt.lte = to
    }

    const requested = args.limit ?? DEFAULT_LIMIT
    if (!Number.isFinite(requested) || requested <= 0) {
      return toolError('limit 은 양수여야 합니다.')
    }
    const limit = Math.min(Math.floor(requested), MAX_LIMIT)

    const rows = await prisma.alertHistory.findMany({
      where,
      orderBy: { firedAt: 'desc' },
      take: limit,
    })

    if (rows.length === 0) return toolResult('해당 조건의 알림 이력이 없습니다.')

    const lines: string[] = [
      `## 알림 이력 (${rows.length}건, 최신순, 최대 ${limit})`,
      '',
    ]
    for (const r of rows) {
      const time = r.firedAt.toISOString().replace('T', ' ').slice(0, 16)
      const kindLabel = KIND_LABELS[r.kind] ?? r.kind
      const statusLabel = STATUS_LABELS[r.deliveryStatus] ?? r.deliveryStatus
      const tickerPart = r.ticker ? ` [${r.ticker}]` : ''
      lines.push(`- ${time} · ${kindLabel}${tickerPart} · ${statusLabel}`)
      lines.push(`  ${r.message}`)
      // Phase 37-A (#444): 컨텍스트 요약 — AI 가 사후 진단할 때 참조.
      const ctx = summarizeContext(r.contextJson)
      if (ctx) lines.push(`  ↳ ${ctx}`)
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * contextJson 을 한 줄 요약으로 변환 (AI/텔레그램 표시용).
 * 알 수 없는 shape 이면 null → 라인 스킵.
 */
function summarizeContext(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const ctx = raw as Record<string, unknown>
  const type = ctx.type

  if (type === 'fx') {
    const rate = num(ctx.rate)
    const changeKrw = num(ctx.changeKrw)
    if (rate == null) return null
    return `환율 ${rate.toLocaleString('ko-KR')}원${changeKrw != null ? ` (${changeKrw > 0 ? '+' : ''}${changeKrw.toFixed(0)}원)` : ''}`
  }

  if (
    type === 'surge' || type === 'drop' ||
    type === 'target_hit' || type === 'stop_loss' ||
    type === 'watch_buy' || type === 'watch_zone'
  ) {
    const price = num(ctx.price)
    const changePct = num(ctx.changePercent)
    const threshold = num(ctx.threshold)
    const marketOpen = ctx.marketOpen
    const parts: string[] = []
    if (price != null) parts.push(`시세 ${price.toLocaleString('ko-KR')}`)
    if (changePct != null) parts.push(`${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`)
    if (threshold != null) parts.push(`기준 ${threshold.toLocaleString('ko-KR')}`)
    if (typeof marketOpen === 'boolean') parts.push(marketOpen ? '장중' : '장외')
    return parts.length > 0 ? parts.join(' · ') : null
  }

  if (type === 'ta_signal') {
    const rsi = num(ctx.rsi)
    const macd = str(ctx.macdCrossover)
    const bb = str(ctx.bbPosition)
    const signals = Array.isArray(ctx.signals) ? (ctx.signals as unknown[]).map(String) : []
    const parts: string[] = []
    if (rsi != null) parts.push(`RSI ${rsi.toFixed(1)}`)
    if (macd) parts.push(`MACD ${macd}`)
    if (bb) parts.push(`BB ${bb}`)
    if (signals.length > 0) parts.push(signals.join(','))
    return parts.length > 0 ? parts.join(' · ') : null
  }

  if (type === 'custom_strategy') {
    const name = str(ctx.strategyName)
    const logic = str(ctx.logic)
    const per = Array.isArray(ctx.perCondition) ? (ctx.perCondition as unknown[]) : []
    const matched = per.filter((p) => p && typeof p === 'object' && (p as { result?: unknown }).result === true).length
    return `전략 "${name ?? '?'}" ${logic ?? ''} — ${matched}/${per.length} 조건 매칭`
  }

  return null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}
