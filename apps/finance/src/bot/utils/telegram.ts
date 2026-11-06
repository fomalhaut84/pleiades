/**
 * HTML 헬퍼 — 판단 응답의 HTML 부분집합(<b> <i> <code> <pre>)과 이스케이프.
 *
 * 인바운드 응답(`replyHtml` · 재시도 · 파싱 실패 시 plain)은 텔레그램 어댑터와 함께 지웠다(009 D-5 B3b · pleiades#508) —
 * Discord 는 chat 이 변환·분할한다. 아웃바운드는 @pleiades/notify(`../notifications/notifier`). 파일 이름 정리는 B7.
 */

/**
 * HTML 특수문자 이스케이프 (텔레그램 HTML parse_mode용)
 * <b>, <i>, <code>, <pre>, <a>, <blockquote> 태그 외에는 이스케이프 필수
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 텔레그램 HTML 포맷 헬퍼
 */
export const h = {
  b: (text: string) => `<b>${text}</b>`,
  i: (text: string) => `<i>${text}</i>`,
  code: (text: string) => `<code>${text}</code>`,
  pre: (text: string) => `<pre>${text}</pre>`,
}
