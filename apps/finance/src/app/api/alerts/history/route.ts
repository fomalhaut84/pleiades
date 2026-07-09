/**
 * Phase 33-B (#417) — 알림 발동 이력 조회 API.
 * GET /api/alerts/history?kind=&ticker=&from=&to=&limit=&offset=
 * envelope: paginated({ items, meta })
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { paginated, fail } from '@/lib/api-response'
import type { Prisma } from '@prisma/client'
import { parseISOOrNull, parseKindsParam, resolveTimeWindow } from './shared'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const DEFAULT_LOOKBACK_DAYS = 7

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const { kinds, invalid } = parseKindsParam(url.searchParams)
    const rawTicker = url.searchParams.get('ticker')?.trim() || undefined
    const fromStr = url.searchParams.get('from')?.trim() || undefined
    const toStr = url.searchParams.get('to')?.trim() || undefined
    const limitStr = url.searchParams.get('limit')
    const offsetStr = url.searchParams.get('offset')

    if (invalid.length > 0) {
      return fail(`알 수 없는 kind: ${invalid.join(', ')}`, 400)
    }
    const from = parseISOOrNull(fromStr)
    const to = parseISOOrNull(toStr)
    if (fromStr && !from) return fail('from 이 ISO 8601 형식이 아닙니다.', 400)
    if (toStr && !to) return fail('to 가 ISO 8601 형식이 아닙니다.', 400)

    let limit = limitStr ? parseInt(limitStr, 10) : DEFAULT_LIMIT
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
    limit = Math.min(limit, MAX_LIMIT)

    let offset = offsetStr ? parseInt(offsetStr, 10) : 0
    if (!Number.isFinite(offset) || offset < 0) offset = 0

    // 기본 기간: `to` anchored (Codex #428 P2 fix). from/to 조합별 규칙은 resolveTimeWindow 참고.
    const { effectiveFrom, effectiveTo } = resolveTimeWindow(from, to, DEFAULT_LOOKBACK_DAYS)

    const where: Prisma.AlertHistoryWhereInput = {
      firedAt: { gte: effectiveFrom, lte: effectiveTo },
    }
    if (kinds.length === 1) where.kind = kinds[0]
    else if (kinds.length > 1) where.kind = { in: kinds }
    if (rawTicker) where.ticker = rawTicker.toUpperCase()

    const [rows, total] = await Promise.all([
      prisma.alertHistory.findMany({
        where,
        // Codex P2 (#417 PR #424): 동일 firedAt (배치 발송 시 다수 이벤트) 에서 page skip
        // 순서가 비결정적 → 페이지 넘김 시 rows 누락/중복. id 로 tiebreak.
        orderBy: [{ firedAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
      }),
      prisma.alertHistory.count({ where }),
    ])

    return paginated(
      rows.map((r) => ({
        id: r.id,
        firedAt: r.firedAt.toISOString(),
        kind: r.kind,
        ticker: r.ticker,
        price: r.price,
        changePercent: r.changePercent,
        message: r.message,
        deliveryStatus: r.deliveryStatus,
        recipientCount: r.recipientCount,
        errorMessage: r.errorMessage,
      })),
      total,
      limit,
      offset,
    )
  } catch (error) {
    console.error('GET /api/alerts/history error:', error)
    return fail('알림 이력 조회에 실패했습니다.', 500)
  }
}
