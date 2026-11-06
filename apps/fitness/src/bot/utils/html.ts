/** 마크다운을 HTML 부분집합으로 간단 변환 */
export function mdToHtml(md: string): string {
  return md
    .replace(/### (.+)/g, "<b>$1</b>")
    .replace(/## (.+)/g, "<b>$1</b>")
    .replace(/# (.+)/g, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n- /g, "\n• ");
}

/** HTML 특수문자 이스케이프 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
