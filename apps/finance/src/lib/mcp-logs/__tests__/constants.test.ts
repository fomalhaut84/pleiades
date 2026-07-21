import { describe, expect, it } from 'vitest'
import { KNOWN_MSGS, MSG_LABELS, LEVEL_ORDER, recentLogDates, formatKstTime } from '../constants'

describe('KNOWN_MSGS', () => {
  it('실제 서버에서 emit 되는 모든 msg 를 포함 (Codex #425 P2 회귀 방지)', () => {
    // src/mcp/server.ts + src/mcp/logger.ts 에서 logger.* (…, 'msg_name') 로 emit 되는 값.
    // 여기 목록에서 빠지면 대시보드 필터가 400 을 던져 사용자가 해당 라인을 못 찾음.
    const emitted = [
      'tool_call',
      'tool_call_reported_error',
      'tool_call_sdk_error',
      'tool_call_failed',
      'sdk_error',
      'transport_ready',
      'http_request',
      'http_request_error',
      'http_server_error',
      'session_initialized',
      'session_closed',
      'session_sweep',
      'transport_close_error',
      'shutdown_started',
      'http_server_closed',
      'force_exit_timeout',
      'server_fatal',
      'uncaught_exception',
      'unhandled_rejection',
    ]
    const known = new Set<string>(KNOWN_MSGS)
    for (const m of emitted) {
      expect(known.has(m), `KNOWN_MSGS missing "${m}"`).toBe(true)
    }
  })

  it('MSG_LABELS 가 KNOWN_MSGS 모두를 커버', () => {
    for (const m of KNOWN_MSGS) {
      expect(MSG_LABELS[m]).toBeDefined()
    }
  })

  it('LEVEL_ORDER 는 fatal → trace 내림차순 (심각도)', () => {
    expect(LEVEL_ORDER).toEqual(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  })
})

describe('recentLogDates', () => {
  it('N=7 → 오늘부터 6일 전까지 7개 (KST 기준)', () => {
    // now = 2026-07-08 UTC 00:00 → KST 09:00 → 2026-07-08 for day 0
    const now = Date.parse('2026-07-08T00:00:00Z')
    const dates = recentLogDates(7, now)
    expect(dates).toEqual([
      '2026-07-08', '2026-07-07', '2026-07-06', '2026-07-05',
      '2026-07-04', '2026-07-03', '2026-07-02',
    ])
  })

  it('N=1 → 오늘만', () => {
    const now = Date.parse('2026-07-08T00:00:00Z')
    expect(recentLogDates(1, now)).toEqual(['2026-07-08'])
  })

  it('N=0 → 빈 배열', () => {
    expect(recentLogDates(0)).toEqual([])
  })
})

// pino UTC ISO → KST HH:mm:ss 표시 (mcp-logs UI 용).
describe('formatKstTime', () => {
  it('UTC ISO → KST 시각 (+9h)', () => {
    // 2026-07-21 00:15:30 UTC → 2026-07-21 09:15:30 KST
    expect(formatKstTime('2026-07-21T00:15:30.123Z')).toBe('09:15:30')
  })

  it('KST 자정 넘김 (UTC 15:00 → KST 다음날 00:00)', () => {
    expect(formatKstTime('2026-07-20T15:00:00.000Z')).toBe('00:00:00')
  })

  it('KST 저녁 (UTC 12:00 → KST 21:00)', () => {
    expect(formatKstTime('2026-07-21T12:34:56.000Z')).toBe('21:34:56')
  })

  it('undefined / 빈 문자열 → 빈 문자열', () => {
    expect(formatKstTime(undefined)).toBe('')
    expect(formatKstTime('')).toBe('')
  })

  it('잘못된 ISO → 빈 문자열 (crash 방지)', () => {
    expect(formatKstTime('not-a-date')).toBe('')
  })
})
