/**
 * Phase 37-C (#446) — SSE 라우트 헤더 · 필터 검증 테스트.
 *
 * 실 poll 흐름 (setInterval + fs) 은 통합테스트 부담이 커 순수 tail 유틸
 * (splitLinesWithCarryover + readNewBytes) 로 커버하고, 여기서는 헤더 · 400
 * 응답 · 필터 매칭 로직만 검증한다. `applyFilter` 는 route 가 그대로 위임하는
 * 필터 코어 이므로 여기서 재사용해 "필터 조건이 route 명세와 일치한다" 는
 * 계약을 잠금.
 */

import { NextRequest } from 'next/server'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { applyFilter, parseLines } from '@/lib/mcp-logs/parser'

// 라우트 임포트 전에 로그 디렉토리를 tmp 로 우회 — 실제 프로덕션 파일을 건드리지 않도록.
const TMP_LOG_DIR = path.join(os.tmpdir(), `mcp-logs-stream-test-${Date.now()}`)

beforeAll(() => {
  fs.mkdirSync(TMP_LOG_DIR, { recursive: true })
  process.env.MCP_LOG_DIR = TMP_LOG_DIR
})

afterAll(() => {
  try { fs.rmSync(TMP_LOG_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
})

async function importRoute() {
  return await import('../route')
}

function buildReq(query: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/admin/mcp-logs/stream')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/admin/mcp-logs/stream — 응답 헤더', () => {
  let openStreams: ReadableStreamDefaultReader<Uint8Array>[] = []

  afterEach(async () => {
    for (const r of openStreams) {
      try { await r.cancel() } catch { /* ignore */ }
    }
    openStreams = []
  })

  it('SSE 표준 헤더 반환 (text/event-stream, no-cache, X-Accel-Buffering)', async () => {
    const { GET } = await importRoute()
    const res = await GET(buildReq())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toContain('no-cache')
    expect(res.headers.get('cache-control')).toContain('no-transform')
    expect(res.headers.get('connection')).toBe('keep-alive')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    // Body reader 는 open 상태 → afterEach 에서 정리.
    if (res.body) openStreams.push(res.body.getReader())
  })

  it('연결 즉시 초기 comment 라인 (`: connected ...`) 을 flush', async () => {
    const { GET } = await importRoute()
    const res = await GET(buildReq())
    expect(res.body).not.toBeNull()
    const reader = res.body!.getReader()
    openStreams.push(reader)
    const { value } = await reader.read()
    const decoded = new TextDecoder().decode(value)
    expect(decoded.startsWith(': connected ')).toBe(true)
    expect(decoded.endsWith('\n\n')).toBe(true)
  })
})

describe('GET /api/admin/mcp-logs/stream — 필터 검증 (400)', () => {
  it('알 수 없는 level → 400 + envelope error', async () => {
    const { GET } = await importRoute()
    const res = await GET(buildReq({ level: 'BOGUS' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error?: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain('알 수 없는 level')
  })

  it('알 수 없는 msg → 400', async () => {
    const { GET } = await importRoute()
    const res = await GET(buildReq({ msg: 'nope' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error?: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain('알 수 없는 msg')
  })

  it('알려진 level (info) 는 200 통과', async () => {
    const { GET } = await importRoute()
    const res = await GET(buildReq({ level: 'info' }))
    expect(res.status).toBe(200)
    if (res.body) await res.body.getReader().cancel()
  })

  it('알려진 msg (tool_call) 는 200 통과', async () => {
    const { GET } = await importRoute()
    const res = await GET(buildReq({ msg: 'tool_call' }))
    expect(res.status).toBe(200)
    if (res.body) await res.body.getReader().cancel()
  })
})

describe('필터 매칭 계약 (route → applyFilter 위임)', () => {
  // route 가 SSE 로 push 할 때 실제로 매칭되는 라인만 방출하는지 검증.
  // route 는 splitLinesWithCarryover → parseLines → applyFilter 를 그대로 조합하므로
  // 여기서 applyFilter 를 재사용해 "필터 조건이 route 명세와 동일" 함을 잠근다.
  const SAMPLE = [
    JSON.stringify({ level: 'info', msg: 'tool_call', tool: 'get_portfolio', traceId: 'a1' }),
    JSON.stringify({ level: 'warn', msg: 'tool_call_reported_error', tool: 'get_trades', traceId: 'a2' }),
    JSON.stringify({ level: 'error', msg: 'http_request_error', traceId: 'a3' }),
  ].join('\n')

  it('level=info → tool_call 라인만 방출', () => {
    const entries = parseLines(SAMPLE)
    const filtered = applyFilter(entries, { level: 'info' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].tool).toBe('get_portfolio')
  })

  it('tool 부분 매치 (대소문자 무관)', () => {
    const entries = parseLines(SAMPLE)
    const filtered = applyFilter(entries, { tool: 'TRADES' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].msg).toBe('tool_call_reported_error')
  })

  it('traceId 정확 매치, 미매칭 시 빈 배열', () => {
    const entries = parseLines(SAMPLE)
    expect(applyFilter(entries, { traceId: 'a3' })).toHaveLength(1)
    expect(applyFilter(entries, { traceId: 'z9' })).toHaveLength(0)
  })

  it('필터 없음 → 전체 (SSE 는 이 경우 매 신규 라인을 모두 push)', () => {
    const entries = parseLines(SAMPLE)
    expect(applyFilter(entries, {})).toHaveLength(3)
  })
})

describe('client abort → stream cleanup', () => {
  it('AbortController 로 abort 시 stream 이 close 되고 timer 가 정리된다', async () => {
    const { GET } = await importRoute()
    const url = new URL('http://localhost/api/admin/mcp-logs/stream')
    const controller = new AbortController()
    const req = new NextRequest(url, { signal: controller.signal })
    const res = await GET(req)
    expect(res.body).not.toBeNull()
    const reader = res.body!.getReader()
    // 초기 comment 소진
    await reader.read()
    // abort → route 내부 cleanup 이 controller.close() 호출 → reader.read() done=true
    controller.abort()
    // AbortController abort 이벤트가 flush 될 시간을 살짝 부여
    await new Promise((resolve) => setTimeout(resolve, 20))
    const r = await reader.read()
    expect(r.done).toBe(true)
  })
})
