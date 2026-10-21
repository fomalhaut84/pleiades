/**
 * Phase 37-C (#446) — MCP 로그 실시간 tail (SSE).
 *
 * `GET /api/admin/mcp-logs/stream?level=&msg=&tool=&traceId=`
 *
 * - 오늘 KST 날짜의 일반 로그 파일만 tail (`logs/mcp-YYYY-MM-DD.log`).
 *   크래시 로그는 별도 파일이라 스코프 밖.
 * - 초기 EOF 위치를 기록해 신규 라인만 push (기존 라인 재전송 X).
 * - 폴링 (POLL_INTERVAL_MS) — `fs.watch` 는 Linux append 이벤트 신뢰성이 낮음.
 * - keepalive comment (`: ping\n\n`) 로 프록시 idle 타임아웃 방어.
 * - client abort 시 setInterval / open fd 를 정리한다 (leak 방어).
 */

import { NextRequest } from 'next/server'
import fs from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { fail } from '@/lib/api-response'
import {
  KNOWN_LEVELS, KNOWN_MSG_SET, logFilePath, todayKst,
} from '../shared'
import { parseLines, applyFilter, type Filter, type LogEntry } from '@/lib/mcp-logs/parser'
import {
  KEEPALIVE_INTERVAL_MS, MAX_CHUNK_BYTES, POLL_INTERVAL_MS,
  readNewBytes, splitLinesWithCarryover,
} from '@/lib/mcp-logs/tail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function encodeEvent(entry: LogEntry): string {
  // JSON.stringify 로 안전하게 escape (`\n` → `\\n`) → SSE data 라인 하나로 나감.
  return `data: ${JSON.stringify(entry)}\n\n`
}

/**
 * Codex #462 P2: `YYYY-MM-DD` 문자열 date 를 days 만큼 이동 (KST 벽시계 기준).
 * grace window 감지에서 어제 파일명 (`mcp-YYYY-MM-DD.log`) 을 유도.
 */
function kstDayOffset(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const level = url.searchParams.get('level')?.trim() || undefined
  const msg = url.searchParams.get('msg')?.trim() || undefined
  const tool = url.searchParams.get('tool')?.trim() || undefined
  const traceId = url.searchParams.get('traceId')?.trim() || undefined

  if (level && !KNOWN_LEVELS.has(level)) {
    return fail(`알 수 없는 level: ${level}`, 400)
  }
  if (msg && !KNOWN_MSG_SET.has(msg)) {
    return fail(`알 수 없는 msg: ${msg}`, 400)
  }

  const filter: Filter = { level, msg, tool, traceId }

  // Codex #462 P2: pino 로거의 5분 주기 rotation check 로 인해 00:00~00:05 KST
  // grace window 에서는 여전히 어제 파일이 write 대상이다. `todayKst()` 로 무조건
  // 시딩하면 그 창의 write 를 놓친다 (오늘 파일 미존재 + rotation branch 미 트리거).
  // 실제 active file 을 존재 여부로 선택 — 오늘 없고 어제 있으면 어제로 시작,
  // 이후 poll 이 오늘 파일 등장을 감지해 rotation 처리.
  const today = todayKst()
  const yesterday = kstDayOffset(today, -1)
  const initialDate =
    fs.existsSync(logFilePath(today, false)) ? today :
    fs.existsSync(logFilePath(yesterday, false)) ? yesterday :
    today

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let currentDate = initialDate
      let filePath = logFilePath(currentDate, false)
      let position = 0
      let fd: number | null = null
      let carry = ''
      let closed = false
      // Codex #455 P2 — StringDecoder 로 UTF-8 partial byte 를 poll 간에 버퍼링.
      // MAX_CHUNK_BYTES 컷이 멀티바이트 문자 중간에 걸려도 `write()` 가 미완결
      // 바이트를 내부에 남겨두고 다음 write 와 재조립한다.
      let decoder = new StringDecoder('utf8')
      // Codex #455 P2 — 최초 open 이 아직 안 끝났는지 (position 시딩 대기 중).
      // true 이면 다음 성공적 open 시점에 position 을 (subscribe 시점 EOF | head 0)
      // 로 잠근다. false 이면 fs error 재열기 등 subsequent open 이라 position 을
      // 유지 (중복 방지).
      let awaitingFirstOpen = true

      /**
       * @param isSubscribeCall true 이면 start() 의 동기 호출 (파일 존재 시 EOF 캡처
       *   → 과거 라인 스킵). false 이면 poll 의 후속 호출 (파일이 subscribe 이후
       *   나타난 케이스는 head(0) 부터 → 로거의 첫 burst 캡처).
       */
      const openIfNeeded = (isSubscribeCall = false) => {
        if (fd !== null) return
        if (!fs.existsSync(filePath)) return
        try {
          const st = fs.statSync(filePath)
          fd = fs.openSync(filePath, 'r')
          if (awaitingFirstOpen) {
            position = isSubscribeCall ? st.size : 0
            awaitingFirstOpen = false
          }
          // else: subsequent open (fs error 재열기 등) → 이전 position 유지.
        } catch {
          fd = null
        }
      }

      const closeFd = () => {
        if (fd !== null) {
          try { fs.closeSync(fd) } catch { /* ignore */ }
          fd = null
        }
      }

      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // controller 가 이미 닫혔거나 클라이언트 disconnect — cleanup 위임.
          cleanup()
        }
      }

      /**
       * 현재 fd 에서 한 chunk 만 읽어 lines emit. 반환은 소비한 byte 수 (0 이면 no-op).
       * 정상 poll + rotation drain 양쪽에서 재사용.
       */
      const emitFromCurrentFd = (): number => {
        if (fd === null) return 0
        const st = fs.fstatSync(fd)
        // truncate / 재초기화로 파일 크기가 줄었으면 처음부터.
        if (st.size < position) {
          position = 0
          carry = ''
          decoder = new StringDecoder('utf8')
        }
        if (st.size === position) return 0
        const toRead = Math.min(st.size - position, MAX_CHUNK_BYTES)
        // Codex #454 P1: bytesRead 만큼만 position 을 전진 (short-read 방어).
        const { buf, bytesRead } = readNewBytes(fd, position, position + toRead)
        if (bytesRead <= 0) return 0
        position += bytesRead
        // Codex #455 P2: decoder.write() 로 UTF-8 partial byte 를 내부 버퍼링.
        const chunk = decoder.write(buf)
        const { lines, carry: nextCarry } = splitLinesWithCarryover(chunk, carry)
        carry = nextCarry
        if (lines.length === 0) return bytesRead
        const parsed = parseLines(lines.join('\n'))
        const filtered = applyFilter(parsed, filter)
        for (const entry of filtered) {
          safeEnqueue(encodeEvent(entry))
        }
        return bytesRead
      }

      /** Codex #455 P2 — rotation 직전 어제 파일의 미방출 tail 을 drain. */
      const DRAIN_MAX_ITERS = 20  // 최대 20 * 512KB = 10MB 안전 cap
      const drainCurrentFd = () => {
        try {
          for (let i = 0; i < DRAIN_MAX_ITERS; i++) {
            if (emitFromCurrentFd() === 0) break
          }
        } catch { /* best effort — 회전 후 새 파일 tail 은 계속 진행 */ }
      }

      const poll = () => {
        if (closed) return
        try {
          // KST 자정 회전 대응 (Codex #454 P1 + #455 P2×2) — pino 로거는 자정 감지를
          // 5분 주기 setInterval 로 하기 때문에 (`src/mcp/logger.ts:113`) 00:00~00:05
          // 사이의 write 는 여전히 어제 파일로 흘러간다. 실제 회전 신호는 "오늘
          // 파일이 존재하는가" 로 판단 — 그 전까지는 어제 파일을 계속 tail.
          //
          // 회전 시점에는 어제 파일의 미방출 tail 을 먼저 drain (Codex #455 P2 —
          // 이전에는 즉시 close 로 폐기됐음). 오늘 파일은 EOF 가 아니라 offset 0
          // 부터 시작 (Codex #455 P2 — 로거 회전 후 이미 write 된 초기 라인 캡처).
          const today = todayKst()
          if (today !== currentDate) {
            const todayFilePath = logFilePath(today, false)
            if (fs.existsSync(todayFilePath)) {
              drainCurrentFd()
              closeFd()
              currentDate = today
              filePath = todayFilePath
              carry = ''
              // 새 파일 → decoder 도 리셋 (기존 partial byte 는 이전 파일 것이라 폐기).
              decoder = new StringDecoder('utf8')
              safeEnqueue(`: rotated ${currentDate}\n\n`)
              // 회전 파일은 head 부터 (openIfNeeded 의 EOF 스타트를 우회).
              try {
                fd = fs.openSync(filePath, 'r')
                position = 0
              } catch {
                fd = null
                position = 0
              }
            }
            // else: 로거가 아직 회전 안 함 → 어제 파일을 계속 tail (누락 방지).
          }

          openIfNeeded()  // 최초 subscribe / fs 오류 재시도. 회전 직후엔 fd 존재 → no-op.
          if (fd === null) return  // 파일이 아직 없음 → 다음 poll 대기

          emitFromCurrentFd()
        } catch {
          // fs 오류는 다음 poll 에서 재시도. 파일이 rotate/삭제된 경우 openIfNeeded 가
          // 재시도한다. fd 를 닫아 stale descriptor 를 정리.
          closeFd()
        }
      }

      const pollTimer = setInterval(poll, POLL_INTERVAL_MS)
      const keepaliveTimer = setInterval(() => safeEnqueue(': ping\n\n'), KEEPALIVE_INTERVAL_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(pollTimer)
        clearInterval(keepaliveTimer)
        closeFd()
        try { controller.close() } catch { /* already closed */ }
      }

      // Codex #455 P2: 초기 EOF 위치를 연결 시점에 동기 캡처 — 이전에는 첫 poll
      // (1.5s 후) 에 openIfNeeded 가 position 을 설정해 그 사이 append 된 라인이
      // 새 라인이 아닌 것으로 판정되어 스킵됐다. 파일이 아직 없으면 awaitingFirstOpen
      // 을 true 로 유지 → 다음 poll 에서 openIfNeeded(false) 가 head(0) 부터 open.
      openIfNeeded(true)

      // 초기 comment — Nginx 등 프록시가 응답 헤더를 즉시 flush 하도록 유도.
      safeEnqueue(`: connected ${currentDate}\n\n`)

      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
