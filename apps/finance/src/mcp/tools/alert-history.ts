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
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
