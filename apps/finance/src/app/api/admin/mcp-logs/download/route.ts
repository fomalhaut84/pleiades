/**
 * Phase 37-D (#447) — MCP 로그 원본 다운로드.
 *
 * `GET /api/admin/mcp-logs/download?date=YYYY-MM-DD[&kind=main|crash]`
 *
 * - `date` 는 엄격한 정규식 (`^\d{4}-\d{2}-\d{2}$`) + 캘린더 유효성 검증.
 *   경로 traversal (`../../etc/passwd` 등) 은 정규식에서 거부.
 * - `kind` 는 화이트리스트 (`main` | `crash`). 기본 `main`.
 * - 파일 없으면 404. 존재하면 `Content-Disposition: attachment` 로 스트림.
 * - 응답 자체는 파일 (envelope 예외). 400/404 는 envelope 유지.
 */

import { NextRequest } from 'next/server'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { fail } from '@/lib/api-response'
import { isValidDateStr, logFilePath } from '../shared'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** kind 화이트리스트 — 값 이외는 400. `crash` 만 crash 파일, 그 외/미지정은 main. */
const ALLOWED_KINDS = new Set(['main', 'crash'])

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const date = url.searchParams.get('date')?.trim() ?? ''
    const kindRaw = url.searchParams.get('kind')?.trim() ?? 'main'

    if (!isValidDateStr(date)) {
      return fail('date 는 YYYY-MM-DD 형식이어야 합니다.', 400)
    }
    if (!ALLOWED_KINDS.has(kindRaw)) {
      return fail(`알 수 없는 kind: ${kindRaw}`, 400)
    }
    const crash = kindRaw === 'crash'

    const filePath = logFilePath(date, crash)
    if (!fs.existsSync(filePath)) {
      return fail('해당 일자 로그 파일이 없습니다.', 404)
    }

    // Codex #456 P2: fs.readFileSync 는 이벤트 루프를 블록 + `new Uint8Array(buf)`
    // 로 메모리 복사 2회 → 대용량 로그 (수백 MB) 시 프로세스 stall / 메모리 폭주.
    // fs.createReadStream 을 Web ReadableStream 으로 변환해 백프레셔 + zero-copy
    // 로 스트리밍. HTTP 는 chunked transfer encoding 사용 (Content-Length 생략) —
    // 오늘자 로그처럼 실시간 append 되는 파일도 read 시점 EOF 까지 자연 소비.
    const nodeStream = fs.createReadStream(filePath)
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>

    const basename = crash ? `mcp-crash-${date}.log` : `mcp-${date}.log`
    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${basename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('GET /api/admin/mcp-logs/download error:', error)
    return fail('로그 다운로드에 실패했습니다.', 500)
  }
}
