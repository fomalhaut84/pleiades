/**
 * 봇 에러 처리 유틸 — 토큰 마스킹 · 사용자에게 보여도 되는 안내 추출.
 *
 * 참조: docs/specs/354-bot-ipv6-token-fix.md
 * pleiades 009 D-5 B4 (pleiades#512): 텔레그램 전송 전용 분류(`isNetworkError`·`getErrorCode`·`isHtmlParseError`)는 소비자 0 이라 지웠다.
 * `TOKEN_RE` 는 옛 텔레그램 봇 토큰 모양이다 — 남은 로그·기록 문자열에 섞여 있을 수 있어 마스킹은 남긴다.
 */

const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g

export function sanitizeMessage(msg: string): string {
  return msg.replace(TOKEN_RE, 'bot<REDACTED>')
}

/**
 * Error.cause + `.error` 체인을 깊이 5까지 순회하며 message 추출 + 토큰 마스킹.
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

/**
 * 사용자에게 보여도 되는 오류 안내만 꺼낸다 — pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3 · 사용자 2026-10-30 "알려진 안내만 유지").
 * 메시지가 알려진 접두(엔진·파서가 사용자용으로 쓴 한국어 안내)로 시작하면 `원문:` 줄(AI 응답 원문)을 뗀 메시지를,
 * 아니면 null — 호출부는 정적 안내를 보이고 원문은 로그로만 남긴다(네트워크·DB 등 예상 못 한 오류의 원문 노출을 막는다).
 */
export function knownUserMessage(err: unknown, prefixes: readonly string[]): string | null {
  if (!(err instanceof Error)) return null
  // 파서는 `\n원문: ${raw.slice(0, 200)}` 를 붙인다 — AI 원문은 여러 줄일 수 있어 첫 `원문:` 줄부터 끝까지 뗀다(PR-2c 9-1 리뷰 major)
  const msg = err.message.split(/(?:^|\n)원문:/)[0].trim()
  return prefixes.some((p) => msg.startsWith(p)) ? msg : null
}
