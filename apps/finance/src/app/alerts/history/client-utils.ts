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
