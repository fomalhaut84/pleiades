/**
 * Phase 37-D (#447) — 로그 다운로드 route.
 *
 * 커버리지:
 *  - 존재 파일 → 200 + Content-Disposition + Content-Length + body 일치
 *  - 없는 날짜 → 404
 *  - 잘못된 date 형식 (정규식 실패) → 400
 *  - 캘린더 무효 date (2026-02-31) → 400
 *  - 경로 traversal (`../../etc/passwd`) → 400 (정규식에서 거부)
 *  - kind 화이트리스트 우회 → 400
 *  - kind=crash → crash 파일 반환
 */

import { NextRequest } from 'next/server'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TMP_LOG_DIR = path.join(os.tmpdir(), `mcp-logs-download-test-${Date.now()}`)

beforeAll(() => {
  fs.mkdirSync(TMP_LOG_DIR, { recursive: true })
  process.env.MCP_LOG_DIR = TMP_LOG_DIR
  fs.writeFileSync(
    path.join(TMP_LOG_DIR, 'mcp-2026-07-10.log'),
    '{"level":"info","msg":"hello"}\n',
  )
  fs.writeFileSync(
    path.join(TMP_LOG_DIR, 'mcp-crash-2026-07-11.log'),
    '{"level":"fatal","msg":"boom"}\n',
  )
})

afterAll(() => {
  try { fs.rmSync(TMP_LOG_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
})

function buildReq(query: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/mcp-logs/download')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/admin/mcp-logs/download', () => {
  it('존재 파일 → 200 + attachment 헤더 + 파일 내용', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-10' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="mcp-2026-07-10.log"',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(text).toBe('{"level":"info","msg":"hello"}\n')
  })

  it('kind=crash → crash 파일 반환', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-11', kind: 'crash' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="mcp-crash-2026-07-11.log"',
    )
    const text = await res.text()
    expect(text).toBe('{"level":"fatal","msg":"boom"}\n')
  })

  it('없는 날짜 → 404', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2020-01-01' }))
    expect(res.status).toBe(404)
    const body = await res.json() as { success: boolean; error?: string }
    expect(body.success).toBe(false)
  })

  it('date 형식 오류 → 400', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: 'not-a-date' }))
    expect(res.status).toBe(400)
  })

  it('date 없음 → 400', async () => {
    const { GET } = await import('../route')
    const url = new URL('http://localhost/api/admin/mcp-logs/download')
    const res = await GET(new NextRequest(url))
    expect(res.status).toBe(400)
  })

  it('캘린더 무효 date (2026-02-31) → 400', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-02-31' }))
    expect(res.status).toBe(400)
  })

  // 경로 traversal 시도 — 정규식이 `/`, `.`, `\` 를 모두 거부.
  it('traversal 시도 (`../../etc/passwd`) → 400', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '../../etc/passwd' }))
    expect(res.status).toBe(400)
  })

  it('traversal 시도 (`2026-07-10/../secret`) → 400', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-10/../secret' }))
    expect(res.status).toBe(400)
  })

  it('kind 화이트리스트 우회 시도 → 400', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-10', kind: 'evil' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error?: string }
    expect(body.error).toContain('알 수 없는 kind')
  })

  it('kind 미지정 → main (기본값)', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-10' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('mcp-2026-07-10.log')
  })

  // Codex #456 P2 회귀 방지 — 스트리밍 방식이라 Content-Length 헤더는 생략
  // (chunked transfer encoding). 대신 body 실제 크기와 파일 크기가 일치하는지
  // 검증. 이전에는 fs.readFileSync + Content-Length 조합에서 stat/read race 로
  // tail 이 잘렸었다.
  it('body 는 파일 전체 내용과 일치 (스트리밍)', async () => {
    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-10' }))
    expect(res.status).toBe(200)
    const bodyBuf = new Uint8Array(await res.arrayBuffer())
    const fileSize = fs.statSync(path.join(TMP_LOG_DIR, 'mcp-2026-07-10.log')).size
    expect(bodyBuf.length).toBe(fileSize)
    // Content-Length 는 스트리밍이라 생략 (Node 가 chunked encoding 자동)
  })

  it('read 도중 append 된 bytes 도 body 에 포함 (createReadStream 은 EOF 까지 소비)', async () => {
    // createReadStream 은 open 시점에 파일을 open 하고 데이터 이벤트를 통해 EOF
    // 까지 소비하므로 실제 로그에 대해 fs.readFileSync 와 동등한 스냅샷을 얻는다.
    const target = path.join(TMP_LOG_DIR, 'mcp-2026-07-09.log')
    fs.writeFileSync(target, '{"level":"info","msg":"a"}\n')
    fs.appendFileSync(target, '{"level":"info","msg":"b"}\n{"level":"info","msg":"c"}\n')

    const { GET } = await import('../route')
    const res = await GET(buildReq({ date: '2026-07-09' }))
    expect(res.status).toBe(200)
    const bodyBuf = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder().decode(bodyBuf)
    expect(text).toContain('"msg":"a"')
    expect(text).toContain('"msg":"b"')
    expect(text).toContain('"msg":"c"')
    expect(bodyBuf.length).toBe(fs.statSync(target).size)
  })
})
