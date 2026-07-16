/**
 * Phase 33-B (#417) — 알림 이력 클라이언트 유틸 (pure).
 * `AlertHistoryClient.tsx` 로 분리해 테스트 편이.
 */

/** UTC now 로부터 N일 전 시각 반환 (ISO 8601) */
export function periodFromISO(days: number, now: number = Date.now()): string {
  const d = new Date(now - days * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

/** ISO 8601 → "MM-DD HH:mm" (KST 기준) */
export function formatFiredAt(iso: string): string {
  const d = new Date(iso)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const s = kst.toISOString()
  return `${s.slice(5, 10)} ${s.slice(11, 16)}`
}

/**
 * message 는 텔레그램 발송용 HTML (자체 코드에서 escapeHtml + `<b>` 삽입).
 * 웹에서는 XSS 방어와 시각 단순성을 위해 태그 제거 + HTML 엔티티 역디코드 후 plain text.
 * ⚠️ pre-escaped kind (price target/stop/watch_buy/watch_zone) 에만 안전 — raw kind
 * (custom_strategy 등) 에 적용하면 사용자 이름의 `< 40 >` 을 태그로 오인해 삭제한다.
 * 자동 gating 은 `messageForDisplay` 사용.
 */
export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Codex #462 P2: 저장 시점에 escapeHtml 을 이미 적용하는 kind 화이트리스트
 * (alert-dispatcher · csv-format 와 동일). price-alert.ts 에서 `${escapeHtml(name)}`
 * 로 build 후 그대로 store 되는 4종.
 */
const PRE_ESCAPED_KINDS = new Set<string>(['target_hit', 'stop_loss', 'watch_buy', 'watch_zone'])

/**
 * UI 표시용 메시지 정규화 (Codex #462 P2).
 *
 * 저장 상태가 kind 별로 mixed:
 *   - PRE_ESCAPED_KINDS: `A &amp; B` / `&lt;b&gt;`  → stripHtml 로 태그·엔티티 디코드
 *   - raw (custom_strategy · drop · surge · fx · ta_signal): 사용자 입력 그대로 →
 *     stripHtml 하면 이름의 `< 40 >` 을 태그로 오인해 삭제
 *
 * React 는 `{plaintext}` 를 auto-escape 하므로 raw 를 그대로 렌더해도 XSS 없음.
 */
export function messageForDisplay(message: string, kind: string): string {
  return PRE_ESCAPED_KINDS.has(kind) ? stripHtml(message) : message
}
