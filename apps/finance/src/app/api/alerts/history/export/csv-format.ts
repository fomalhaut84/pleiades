/**
 * Phase 37-B (#445) — 알림 이력 CSV 포맷 helper (pure, 테스트 가능).
 *
 * `route.ts` 는 Prisma fetch 만 하고 이 모듈로 헤더/row 를 만든다.
 * `@/lib/csv` 의 `toCSV` 가 RFC 4180 escape + BOM + 수식 주입 방어를 이미 담당.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export const HISTORY_CSV_HEADERS = [
  'firedAt (KST)',
  'kind',
  'ticker',
  'price',
  'changePercent',
  'message',
  'deliveryStatus',
  'recipientCount',
  'errorMessage',
  'context',
] as const

/**
 * ISO 시각을 KST YYYY-MM-DD HH:mm:ss 형식으로 변환.
 * 스프레드시트에서 그대로 sort 가능하도록 zero-pad + colon-separated.
 */
export function formatKstDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  const kst = new Date(d.getTime() + KST_OFFSET_MS)
  // UTC helpers on shifted time → KST 벽시계 값.
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const ss = String(kst.getUTCSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
}

/**
 * Codex #462 P2: 저장 시점에 escapeHtml 을 이미 적용하는 kind 화이트리스트
 * (alert-dispatcher.ts 의 PRE_ESCAPED_KINDS 와 동일). price-alert.ts 에서
 * `${escapeHtml(name)}` 로 build 후 store 되는 4종. 나머지는 raw.
 */
const PRE_ESCAPED_KINDS = new Set<string>(['target_hit', 'stop_loss', 'watch_buy', 'watch_zone'])

/** escapeHtml 의 역함수 — 5 entity (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;`) 만 decode. */
function decodeHtmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => {
    switch (e) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case '#39': return "'"
      default: return _
    }
  })
}

/**
 * CSV 셀용 메시지 정규화 (Codex #462 P2).
 *
 * 저장 상태가 kind 별로 mixed:
 *   - PRE_ESCAPED_KINDS: `A &amp; B` 로 저장 → CSV 는 사람 읽기용이라 `A & B` 로 decode
 *   - 그 외 (raw): 사용자 입력 그대로 → decode 하면 literal `&amp;` 를 `&` 로 오해석하거나
 *     `SOXL < 40 > RSI` 같은 이름을 `/<[^>]+>/g` 로 잘라 audit 데이터 손상
 *
 * **Fix (kind gating):** pre-escaped 만 decode. raw 는 그대로 유지 → 원본 문자 보존.
 *
 * `<...>` 태그 strip 은 stored message 에 실제 HTML 태그가 들어가는 경로가 없으므로
 * 삭제 (이전 regex `/<[^>]+>/g` 는 raw 이름에 대한 false positive 만 유발했음).
 */
export function messageForCsv(message: string, kind: string): string {
  return PRE_ESCAPED_KINDS.has(kind) ? decodeHtmlEntities(message) : message
}

/**
 * @deprecated Codex #462 P2: 오탐 유발 (raw 이름 `<...>` 잘림). `messageForCsv(msg, kind)` 사용.
 * 하위 호환용 wrapper — 새 코드는 messageForCsv 로 이관.
 */
export function stripHtmlForCsv(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

/**
 * context 를 CSV 셀에 넣을 수 있는 컴팩트 요약 문자열로 변환.
 * 전체 JSON stringify 는 셀이 너무 커지므로 kind 별 주요 필드만 뽑는다.
 * shape 이 예상 밖이면 `JSON.stringify` fallback.
 */
export function summarizeContext(ctx: unknown): string {
  if (ctx == null) return ''
  if (typeof ctx !== 'object') return String(ctx)
  const obj = ctx as Record<string, unknown>
  const type = typeof obj.type === 'string' ? obj.type : ''
  try {
    const parts: string[] = []
    if (type) parts.push(`type=${type}`)
    if ('price' in obj && obj.price != null) parts.push(`price=${obj.price}`)
    if ('rate' in obj && obj.rate != null) parts.push(`rate=${obj.rate}`)
    if ('changePercent' in obj && obj.changePercent != null) parts.push(`Δ%=${obj.changePercent}`)
    if ('threshold' in obj && obj.threshold != null) parts.push(`threshold=${obj.threshold}`)
    if ('marketOpen' in obj && obj.marketOpen != null) parts.push(`marketOpen=${obj.marketOpen}`)
    if ('rsi' in obj && obj.rsi != null) parts.push(`rsi=${obj.rsi}`)
    if ('macdCrossover' in obj && obj.macdCrossover != null) parts.push(`macd=${obj.macdCrossover}`)
    if ('bbPosition' in obj && obj.bbPosition != null) parts.push(`bb=${obj.bbPosition}`)
    if ('overall' in obj && obj.overall != null) parts.push(`overall=${obj.overall}`)
    if ('signals' in obj && Array.isArray(obj.signals) && obj.signals.length > 0) {
      parts.push(`signals=${obj.signals.join('|')}`)
    }
    if ('strategyId' in obj && typeof obj.strategyId === 'string') parts.push(`strategyId=${obj.strategyId}`)
    if ('strategyName' in obj && typeof obj.strategyName === 'string') parts.push(`strategy=${obj.strategyName}`)
    if ('retriedFrom' in obj && typeof obj.retriedFrom === 'string') parts.push(`retriedFrom=${obj.retriedFrom}`)
    return parts.length > 0 ? parts.join('; ') : JSON.stringify(obj)
  } catch {
    // Circular ref 등 예외 시 안전한 fallback — 컨텍스트가 이력의 부수 정보라 실패시에도 export 계속.
    return ''
  }
}

export interface HistoryCsvSourceRow {
  firedAt: Date
  kind: string
  ticker: string | null
  price: number | null
  changePercent: number | null
  message: string
  deliveryStatus: string
  recipientCount: number
  errorMessage: string | null
  contextJson: unknown
}

/** Prisma row → CSV row (string[]). */
export function toCsvRow(row: HistoryCsvSourceRow): string[] {
  return [
    formatKstDateTime(row.firedAt),
    row.kind,
    row.ticker ?? '',
    row.price != null ? String(row.price) : '',
    row.changePercent != null ? String(row.changePercent) : '',
    messageForCsv(row.message, row.kind),
    row.deliveryStatus,
    String(row.recipientCount),
    row.errorMessage ?? '',
    summarizeContext(row.contextJson),
  ]
}

/**
 * export 파일명 — 기간 문자열 포함해 다운로드 시 구분 용이.
 * 예: alert-history_2026-07-01_2026-07-14.csv
 */
export function buildExportFilename(from: Date, to: Date): string {
  const fromKey = formatKstDateTime(from).slice(0, 10)
  const toKey = formatKstDateTime(to).slice(0, 10)
  return `alert-history_${fromKey}_${toKey}.csv`
}

/**
 * Truncation 관련 상수/헬퍼 (self-review P1).
 *
 * Next.js route 모듈은 handler·`dynamic` 등 정해진 export 만 허용하므로 헬퍼는 별도
 * 모듈에 둔다. `route.ts` 와 테스트에서 재사용.
 */
export const MAX_EXPORT_ROWS = 10_000
export const TRUNCATED_HEADER = 'X-Truncated'
export const TOTAL_COUNT_HEADER = 'X-Total-Count'

/** CSV 마지막에 append 하는 truncation 안내 (셀 앞자 `#` — 수식 주입 안전). */
export function buildTruncatedNotice(shownRows: number, totalRows: number): string {
  return `# TRUNCATED: showing first ${shownRows} of ${totalRows} rows. Narrow the filter to get the full dataset.`
}
