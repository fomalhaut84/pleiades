/**
 * 2차원 배열을 CSV 문자열로 변환한다.
 * BOM 포함하여 Excel에서 한글이 깨지지 않도록 한다.
 */
export function toCSV(headers: string[], rows: string[][]): string {
  const BOM = '\uFEFF'
  const escape = (v: string) => {
    // OWASP: 수식 주입 방어 — 위험 문자로 시작하면 앞에 ' 추가
    let safe = v
    if (/^[=+\-@\t\r]/.test(safe)) {
      safe = `'${safe}`
    }
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
      return `"${safe.replace(/"/g, '""')}"`
    }
    return safe
  }

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ]

  return BOM + lines.join('\n')
}

/**
 * CSV Response를 생성한다.
 *
 * `extraHeaders` 는 truncation 신호 (`X-Truncated`, `X-Total-Count`) 같은 부가
 * 메타를 실을 때 사용. Content-Type / Content-Disposition 은 항상 덮어쓴다.
 */
export function csvResponse(
  csv: string,
  filename: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(csv, {
    headers: {
      ...(extraHeaders ?? {}),
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
