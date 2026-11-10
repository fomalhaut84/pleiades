/**
 * 봇 에러 처리 유틸 — 토큰 마스킹 · 사용자에게 보여도 되는 안내 추출.
 *
 * 참조: docs/specs/354-bot-ipv6-token-fix.md
 * pleiades 009 D-5 B4 (pleiades#512): 옛 채널 전송 전용 분류(`isNetworkError`·`getErrorCode`·`isHtmlParseError`)는 소비자 0 이라 지웠다.
 * pleiades#540: 마스킹은 `@pleiades/notify` 판을 그대로 쓴다 — 옛 봇 토큰 · Discord 웹훅 · 인터랙션 · Discord 봇 토큰.
 * 옛 앱 판은 옛 봇 토큰만 가려서 이 파일로 import 하면 웹훅 토큰이 조용히 남았다.
 */

export { sanitizeError, sanitizeMessage } from '@pleiades/notify'

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
