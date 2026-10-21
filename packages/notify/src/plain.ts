/**
 * HTML → plain 폴백 본문. Q10-P ① 태그-only · 코어 정규식은 fin `/<[^>]+>/g` (003 §3-1 2026-09-09 정정 · PR #39 Codex P2).
 * 엔티티(`&amp;` 등)는 디코드하지 않는다 — 라이브 두 구현과 동일 동작. 리터럴 `<>` 만 fit(`*` 수량자)과 다르다.
 */
const TAG_RE = /<[^>]+>/g;

export function toPlain(htmlText: string): string {
  return htmlText.replace(TAG_RE, '');
}
