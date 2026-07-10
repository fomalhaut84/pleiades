/**
 * Phase 33-C (#418) — MCP 로그 리스트 조회.
 * GET /api/admin/mcp-logs?date=&crash=&level=&msg=&tool=&traceId=&limit=&offset=
 */

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api-response'
import {
  KNOWN_LEVELS, KNOWN_MSG_SET, isValidDateStr, loadEntries, todayKst,
} from './shared'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

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
    const limitStr = url.searchParams.get('limit')
    const offsetStr = url.searchParams.get('offset')

    if (!isValidDateStr(dateRaw)) {
      return fail('date 는 YYYY-MM-DD 형식이어야 합니다.', 400)
    }
    if (level && !KNOWN_LEVELS.has(level)) {
      return fail(`알 수 없는 level: ${level}`, 400)
    }
    if (msg && !KNOWN_MSG_SET.has(msg)) {
      return fail(`알 수 없는 msg: ${msg}`, 400)
    }

    let limit = limitStr ? parseInt(limitStr, 10) : DEFAULT_LIMIT
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
    limit = Math.min(limit, MAX_LIMIT)

    let offset = offsetStr ? parseInt(offsetStr, 10) : 0
    if (!Number.isFinite(offset) || offset < 0) offset = 0

    const result = loadEntries({
      date: dateRaw,
      crash,
      filter: { level, msg, tool, traceId },
    })

    // 최신순 반환 (파일은 오래된 → 최신 순서, reverse 로 최신 → 오래된).
    const reversed = result.entries.slice().reverse()
    const page = reversed.slice(offset, offset + limit)

    return ok(
      {
        items: page,
        date: dateRaw,
        crash,
        fileExists: result.fileExists,
        fileSize: result.fileSize,
        truncatedHead: result.truncatedHead,
        totalLines: result.totalLines,
        scannedLines: result.scanned,
        tailStartLineNo: result.startLineNo,
      },
      { meta: { total: reversed.length, limit, offset } },
    )
  } catch (error) {
    console.error('GET /api/admin/mcp-logs error:', error)
    return fail('로그 조회에 실패했습니다.', 500)
  }
}
