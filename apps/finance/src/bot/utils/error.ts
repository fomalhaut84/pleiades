/**
 * 봇 에러 처리 유틸 — 토큰 마스킹 + 네트워크/HTML 파싱 에러 분류.
 *
 * 참조: docs/specs/354-bot-ipv6-token-fix.md
 * 원본 패턴: fomalhaut84/myFitness#108 (같은 서버, 동일 원인)
 */

const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g
const NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENOTFOUND', // DNS 일시 실패 (기존 isRetryableNetworkError 호환 보존)
])

export function sanitizeMessage(msg: string): string {
  return msg.replace(TOKEN_RE, 'bot<REDACTED>')
}

/**
 * Error.cause + grammy HttpError.error 체인을 깊이 5까지 순회하며 message 추출 + 토큰 마스킹.
 * console.error(err) 가 inner FetchError 까지 dump 하는 문제 차단.
 */
export function sanitizeError(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  let depth = 0
  const MAX_DEPTH = 5
  while (cur != null && depth < MAX_DEPTH) {
    if (cur instanceof Error) {
      parts.push(`${cur.name}: ${sanitizeMessage(cur.message)}`)
      const withInner = cur as { error?: unknown; cause?: unknown }
      cur = withInner.error ?? withInner.cause
    } else if (typeof cur === 'string') {
      parts.push(sanitizeMessage(cur))
      break
    } else {
      try {
        parts.push(sanitizeMessage(JSON.stringify(cur)))
      } catch {
        parts.push('[unserializable]')
      }
      break
    }
    depth++
  }
  // 이중 보호: 각 part 가 이미 sanitize 됐지만, 누락된 필드 (예: cur.toString() 에 토큰 잔존)
  // 가 join 시 섞이는 경우를 대비해 최종 결과에도 한 번 더 적용.
  return sanitizeMessage(parts.join(' | '))
}

export function getErrorCode(err: unknown): string | undefined {
  let cur: unknown = err
  let depth = 0
  while (cur != null && depth < 5) {
    if (cur && typeof cur === 'object') {
      const obj = cur as { code?: unknown; error?: unknown; cause?: unknown }
      if (typeof obj.code === 'string') return obj.code
      cur = obj.error ?? obj.cause
    } else {
      break
    }
    depth++
  }
  return undefined
}

const GRAMMY_TIMEOUT_RE = /Request to '.+' timed out after \d+ seconds/i
const ABORT_NAME_RE = /^AbortError$/i

/**
 * 네트워크 에러 판별 — ETIMEDOUT/ECONNRESET 등 + grammy client.timeoutSeconds 발동
 * (code 없는 plain Error) + fetch abort (AbortError) 모두 포착.
 */
export function isNetworkError(err: unknown): boolean {
  const code = getErrorCode(err)
  if (code !== undefined && NETWORK_CODES.has(code)) return true
  let cur: unknown = err
  let depth = 0
  while (cur != null && depth < 5) {
    if (cur instanceof Error) {
      if (GRAMMY_TIMEOUT_RE.test(cur.message)) return true
      if (ABORT_NAME_RE.test(cur.name)) return true
      const obj = cur as { type?: unknown; error?: unknown; cause?: unknown }
      if (obj.type === 'aborted') return true
      cur = obj.error ?? obj.cause
    } else {
      break
    }
    depth++
  }
  return false
}

export function isHtmlParseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /can't parse entities|Bad Request:.*entit/i.test(msg)
}
