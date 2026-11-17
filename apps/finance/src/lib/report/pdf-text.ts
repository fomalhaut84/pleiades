/**
 * 분기 PDF 의 AI 코멘트 — 모델이 쓴 마크다운을 PDF 글자로 (013 P2-b · #758).
 *
 * PDF(`@react-pdf/renderer` `<Text>`)는 마크다운을 렌더하지 않는다 — 원문을 그대로 찍으면 `**` · `- ` · `##` 가 글자로 보였다.
 * 시스템 프롬프트가 제목 `##` 를 허용하면서(F3) 더 늘어나므로 서식 기호만 걷어낸다. 글 내용은 바꾸지 않는다.
 */
export function markdownToPdfText(md: string): string {
  const out: string[] = []
  let inFence = false
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      out.push(raw)
      continue
    }
    let line = raw
    if (/^\s*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) {
      out.push('')
      continue
    }
    line = line
      .replace(/^(\s*)#{1,6}[ \t]+/, '$1') // 제목 기호
      .replace(/^(\s*)>[ \t]?/, '$1') // 인용 기호
      .replace(/^(\s*)[-*+][ \t]+/, '$1• ') // 목록 기호 → 글머리
      .replace(/\*\*([^*\n]+)\*\*/g, '$1') // 굵게
      .replace(/__([^_\n]+)__/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1') // 인라인 코드
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)') // 링크
    out.push(line)
  }
  return out.join('\n')
}
