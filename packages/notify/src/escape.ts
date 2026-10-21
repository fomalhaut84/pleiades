/**
 * HTML 특수문자 이스케이프 (텔레그램 HTML parse_mode 용).
 * 정본: fin `telegram.ts:17-22` = fit `telegram.ts:18-23` (동일 구현 · 003 §5-1 발췌 · §7-2 — fit 중복 2 → 1).
 * `<b>` `<i>` `<code>` `<pre>` `<a>` `<blockquote>` 태그 밖의 텍스트에 반드시 적용한다.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
