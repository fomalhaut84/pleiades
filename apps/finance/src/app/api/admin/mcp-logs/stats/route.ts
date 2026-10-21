/**
 * Phase 33-C (#418) — MCP 로그 통계.
 * GET /api/admin/mcp-logs/stats?date=&crash=&level=&msg=&tool=&traceId=
 */

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api-response'
import { computeStats } from '@/lib/mcp-logs/parser'
import { KNOWN_LEVELS, KNOWN_MSG_SET, isValidDateStr, loadEntries, todayKst } from '../shared'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const dateRaw = url.searchParams.get('date')?.trim() || todayKst()
    const crash = url.searchParams.get('crash') === '1' || url.searchParams.get('crash') === 'true'
    const level = url.searchParams.get('level')?.trim() || undefined
    const msg = url.searchParams.get('msg')?.trim() || undefined
    const tool = url.searchParams.get('tool')?.trim() || undefined
    const traceId = url.searchParams.get('traceId')?.trim() || undefined

    if (!isValidDateStr(dateRaw)) return fail('date 는 YYYY-MM-DD 형식이어야 합니다.', 400)
    if (level && !KNOWN_LEVELS.has(level)) return fail(`알 수 없는 level: ${level}`, 400)
    if (msg && !KNOWN_MSG_SET.has(msg)) return fail(`알 수 없는 msg: ${msg}`, 400)

    const result = loadEntries({
      date: dateRaw,
      crash,
      filter: { level, msg, tool, traceId },
    })

    const stats = computeStats(result.entries)
    return ok({
      ...stats,
      date: dateRaw,
      crash,
      fileExists: result.fileExists,
      fileSize: result.fileSize,
      truncatedHead: result.truncatedHead,
      totalLines: result.totalLines,
      scannedLines: result.scanned,
    })
  } catch (error) {
    console.error('GET /api/admin/mcp-logs/stats error:', error)
    return fail('로그 통계 조회에 실패했습니다.', 500)
  }
}
