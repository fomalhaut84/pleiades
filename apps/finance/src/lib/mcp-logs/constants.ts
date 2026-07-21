/**
 * Phase 33-C (#418) — MCP 로그 대시보드 상수.
 * `docs/mcp-log-schema.md` 와 동기화 유지.
 */

export const LEVEL_ORDER = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
export type LogLevel = (typeof LEVEL_ORDER)[number]

/**
 * 유효한 msg 리스트 (스키마 문서와 동기화).
 * whitelist 필터에 사용. 로그 파일에는 이 밖의 msg 도 등장 가능하지만 검색에서는
 * 인식된 값만 필터 옵션으로 노출.
 */
export const KNOWN_MSGS = [
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
] as const

export type KnownMsg = (typeof KNOWN_MSGS)[number]

export const MSG_LABELS: Record<string, string> = {
  tool_call: '🟢 tool 호출',
  tool_call_reported_error: '⚠️ tool 비즈니스 예외',
  tool_call_sdk_error: '🔴 tool SDK 오류',
  tool_call_failed: '💥 tool throw',
  sdk_error: '🔴 SDK 오류',
  transport_ready: '🚀 부팅',
  http_request: '📥 HTTP 요청',
  http_request_error: '⚡ HTTP 요청 오류',
  http_server_error: '💥 HTTP 서버 오류',
  session_initialized: '📡 세션 시작',
  session_closed: '📴 세션 종료',
  session_sweep: '🧹 세션 정리',
  transport_close_error: '⚠️ 세션 닫기 오류',
  shutdown_started: '⏸️ 종료 시작',
  http_server_closed: '⏹️ HTTP 종료',
  force_exit_timeout: '⏱️ 강제 종료',
  server_fatal: '💀 서버 fatal',
  uncaught_exception: '💀 uncaught',
  unhandled_rejection: '💀 rejection',
}

/** 최근 N일 간의 로그 파일 이름을 KST 기준으로 생성 */
export function recentLogDates(days: number, now: number = Date.now()): string[] {
  const out: string[] = []
  for (let i = 0; i < days; i++) {
    const kst = new Date(now + 9 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000)
    out.push(kst.toISOString().slice(0, 10))
  }
  return out
}

/**
 * pino ISO 8601 UTC time 문자열을 KST `HH:mm:ss` 로 변환 (mcp-logs 표시용).
 * 이전에는 `iso.slice(11, 19)` 로 UTC 시각을 그대로 노출 → 사용자 혼동.
 * pure — 잘못된 입력은 빈 문자열.
 */
export function formatKstTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(11, 19)
}
