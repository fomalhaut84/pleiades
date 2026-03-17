/**
 * 마크다운 → 텔레그램 HTML 변환
 *
 * 텔레그램 Bot API는 HTML parse_mode에서 다음 태그만 지원:
 * <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <blockquote>
 *
 * 마크다운 표, 헤더 등 미지원 문법을 텔레그램 호환 HTML로 변환.
 */

/**
 * 마크다운 표를 리스트 형태로 변환
 * | 종목 | 수량 | 가격 |  →  - 종목: 수량 / 가격
 */
function convertTables(text: string): string {
  return text.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n')
      if (rows.length < 2) return tableBlock

      const parseRow = (row: string): string[] =>
        row.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length)

      // 구분선 행 찾기
      const sepIdx = rows.findIndex((r) => /^\|[\s-:|]+\|$/.test(r))
      if (sepIdx < 1) return tableBlock

      const headers = parseRow(rows[sepIdx - 1])
      const dataRows = rows.slice(sepIdx + 1).filter((r) => r.includes('|'))

      const lines = dataRows.map((r) => {
        const cells = parseRow(r)
        // 첫 셀을 키로, 나머지를 값으로
        if (cells.length <= 1) return `- ${cells[0] ?? ''}`
        const key = cells[0]
        const values = cells.slice(1).map((v, i) => {
          const header = headers[i + 1]
          return header ? `${header}: ${v}` : v
        })
        return `- ${key} / ${values.join(' / ')}`
      })

      return lines.join('\n') + '\n'
    }
  )
}

/**
 * 마크다운 → 텔레그램 HTML 변환
 */
export function markdownToTelegramHtml(text: string): string {
  let result = text

  // 표 → 리스트 변환 (다른 변환 전에)
  result = convertTables(result)

  // HTML 특수문자 이스케이프 (텔레그램 HTML parse_mode 필수)
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 코드블록 (```...```)
  result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre>$1</pre>')

  // 인라인 코드
  result = result.replace(/`(.+?)`/g, '<code>$1</code>')

  // 헤더 → 볼드
  result = result.replace(/^#{1,4}\s+(.+)$/gm, '<b>$1</b>')

  // 볼드 (**text**)
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // 이탤릭 (*text*)
  result = result.replace(/\*(.+?)\*/g, '<i>$1</i>')

  // 취소선 (~~text~~)
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // 인용 (> text)
  result = result.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>')

  // 수평선 제거
  result = result.replace(/^---+$/gm, '')

  // 연속 빈 줄 정리
  result = result.replace(/\n{3,}/g, '\n\n')

  return result.trim()
}
