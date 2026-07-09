/**
 * Phase 33-B (#417) — 알림 이력 통계.
 * GET /api/alerts/history/stats?kind=&ticker=&from=&to=
 * 반환: total, byStatus, byKind, byDay (KST 기준 날짜 버킷).
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'
import type { Prisma } from '@prisma/client'
import { parseISOOrNull, parseKindsParam, buildKstDayBuckets, kstDateKey, resolveTimeWindow } from '../shared'

const DEFAULT_LOOKBACK_DAYS = 7

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const { kinds, invalid } = parseKindsParam(url.searchParams)
    const rawTicker = url.searchParams.get('ticker')?.trim() || undefined
    const fromStr = url.searchParams.get('from')?.trim() || undefined
    const toStr = url.searchParams.get('to')?.trim() || undefined

    if (invalid.length > 0) {
      return fail(`알 수 없는 kind: ${invalid.join(', ')}`, 400)
    }
    const from = parseISOOrNull(fromStr)
    const to = parseISOOrNull(toStr)
    if (fromStr && !from) return fail('from 이 ISO 8601 형식이 아닙니다.', 400)
    if (toStr && !to) return fail('to 가 ISO 8601 형식이 아닙니다.', 400)

    // 기본 기간: `to` anchored (Codex #428 P2 fix). resolveTimeWindow 규칙 통일.
    const { effectiveFrom, effectiveTo } = resolveTimeWindow(from, to, DEFAULT_LOOKBACK_DAYS)

    const where: Prisma.AlertHistoryWhereInput = {
      firedAt: { gte: effectiveFrom, lte: effectiveTo },
    }
    if (kinds.length === 1) where.kind = kinds[0]
    else if (kinds.length > 1) where.kind = { in: kinds }
    if (rawTicker) where.ticker = rawTicker.toUpperCase()

    const rows = await prisma.alertHistory.findMany({
      where,
      select: { firedAt: true, kind: true, deliveryStatus: true },
    })

    const byKindMap = new Map<string, number>()
    const byStatusMap = new Map<string, number>()
    const byDayMap = new Map<string, number>()

    for (const r of rows) {
      byKindMap.set(r.kind, (byKindMap.get(r.kind) ?? 0) + 1)
      byStatusMap.set(r.deliveryStatus, (byStatusMap.get(r.deliveryStatus) ?? 0) + 1)
      const day = kstDateKey(r.firedAt)
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1)
    }

    // 기간 내 모든 KST 날짜를 0 으로 채워 연속 버킷 반환 (라인 차트용).
    // self-review P1 (#417): KST 자정을 사이에 둔 from/to 조합에서 trailing KST 날짜
    // 누락 → shared.ts 의 buildKstDayBuckets 로 분리해 pure test 로 회귀 방지.
    const byDay = buildKstDayBuckets(byDayMap, effectiveFrom, effectiveTo)

    const byKind = Array.from(byKindMap.entries())
      .map(([k, count]) => ({ kind: k, count }))
      .sort((a, b) => b.count - a.count)

    return ok({
      total: rows.length,
      byStatus: {
        sent: byStatusMap.get('sent') ?? 0,
        partial: byStatusMap.get('partial') ?? 0,
        failed: byStatusMap.get('failed') ?? 0,
      },
      byKind,
      byDay,
    })
  } catch (error) {
    console.error('GET /api/alerts/history/stats error:', error)
    return fail('알림 이력 통계 조회에 실패했습니다.', 500)
  }
}
