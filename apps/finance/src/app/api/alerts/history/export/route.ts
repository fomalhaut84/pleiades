/**
 * Phase 37-B (#445) — 알림 이력 CSV export.
 * GET /api/alerts/history/export?kind=&ticker=&from=&to=
 *
 * 응답은 CSV 파일 (`csvResponse` — envelope 예외, `.claude/rules/api-routes.md` 참고).
 * 에러 path 만 envelope (`fail`) 사용.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCSV, csvResponse } from '@/lib/csv'
import { fail } from '@/lib/api-response'
import type { Prisma } from '@prisma/client'
import { parseISOOrNull, parseKindsParam, resolveTimeWindow } from '../shared'
import {
  HISTORY_CSV_HEADERS, toCsvRow, buildExportFilename,
  MAX_EXPORT_ROWS, TRUNCATED_HEADER, TOTAL_COUNT_HEADER, buildTruncatedNotice,
} from './csv-format'

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

    const { effectiveFrom, effectiveTo } = resolveTimeWindow(from, to, DEFAULT_LOOKBACK_DAYS)

    const where: Prisma.AlertHistoryWhereInput = {
      firedAt: { gte: effectiveFrom, lte: effectiveTo },
    }
    if (kinds.length === 1) where.kind = kinds[0]
    else if (kinds.length > 1) where.kind = { in: kinds }
    if (rawTicker) where.ticker = rawTicker.toUpperCase()

    // Truncation 감지를 위해 count 를 먼저 확인. 필터가 좁은 경우 count 는 저렴하고,
    // 넓은 경우엔 어차피 findMany 도 비싸므로 추가 비용은 무시할 수준.
    // Truncation 감지 (self-review P1): 상한 초과 시 조용히 자르면 사용자가 부분 결과를
    // 전체로 오해할 수 있으므로 (감사·신고 용도), `count` 로 실제 총량을 얻어 헤더 +
    // 안내 라인으로 노출한다. 필터가 좁으면 count 는 저렴하고, 넓으면 어차피 findMany
    // 도 비싸므로 추가 비용은 무시할 수준.
    const [rows, total] = await Promise.all([
      prisma.alertHistory.findMany({
        where,
        // 리스트와 동일 정렬 (같은 firedAt 안에서 id desc — tiebreak, #424 P2 회귀 방지).
        orderBy: [{ firedAt: 'desc' }, { id: 'desc' }],
        take: MAX_EXPORT_ROWS,
      }),
      prisma.alertHistory.count({ where }),
    ])

    const truncated = total > rows.length
    const csvRows = rows.map(toCsvRow)
    let csv = toCSV([...HISTORY_CSV_HEADERS], csvRows)
    if (truncated) {
      // CSV 스펙상 comment 는 없지만, `#` 시작 셀 하나짜리 라인은 대부분의 뷰어에서 눈에
      // 띄는 안내로 표시된다. 수식 주입 escape 규칙 (`=+-@`) 에도 걸리지 않는다.
      csv += '\n' + buildTruncatedNotice(rows.length, total)
    }

    const extraHeaders: Record<string, string> = {
      [TOTAL_COUNT_HEADER]: String(total),
    }
    if (truncated) extraHeaders[TRUNCATED_HEADER] = 'true'

    return csvResponse(
      csv,
      buildExportFilename(effectiveFrom, effectiveTo),
      extraHeaders,
    )
  } catch (error) {
    console.error('GET /api/alerts/history/export error:', error)
    return fail('알림 이력 CSV 생성에 실패했습니다.', 500)
  }
}
