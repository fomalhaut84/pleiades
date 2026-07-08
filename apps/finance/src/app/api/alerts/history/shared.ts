/**
 * Phase 33-B (#417) — /api/alerts/history 및 stats 라우트 공용.
 */

export const KNOWN_KINDS = new Set([
  'surge', 'drop', 'fx',
  'target_hit', 'stop_loss',
  'watch_buy', 'watch_zone',
  'ta_signal', 'custom_strategy',
])

export function parseISOOrNull(s: string | undefined | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * `kind` 쿼리 파라미터 정규화 — repeated (`?kind=a&kind=b`) 와 CSV (`?kind=a,b`) 모두 허용.
 * Codex P2 (#417 PR #424): 다중 kind 를 서버에서 지원해야 페이지네이션/집계가
 * 정합. 이전 구현은 클라 다중 선택 시 서버 필터를 skip 하고 페이지 후 클라 필터 →
 * 페이지 넘어간 rows 누락, 총계/stats 는 전체 kind 반영 (부정확).
 *
 * 반환: `{ kinds, invalid }` — invalid 는 whitelist 에 없는 kind 리스트 (400 응답용).
 */
export function parseKindsParam(params: URLSearchParams): {
  kinds: string[]
  invalid: string[]
} {
  const raw = params.getAll('kind').flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean)
  const unique = Array.from(new Set(raw))
  const kinds = unique.filter((k) => KNOWN_KINDS.has(k))
  const invalid = unique.filter((k) => !KNOWN_KINDS.has(k))
  return { kinds, invalid }
}

/** UTC Date → KST YYYY-MM-DD (버킷 키) */
export function kstDateKey(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/**
 * KST 기준 [from, to] 범위의 모든 날짜 버킷을 반환 (라인 차트 X 축용).
 *
 * 이전 구현 (self-review P1, #417): effectiveFrom 의 UTC time-of-day 를 고정한 채
 * `+24h` 씩 순회 → from/to 의 UTC 시각이 KST 자정을 사이에 두고 어긋나면 마지막
 * KST 날짜 버킷이 loop 조건에서 누락되어 byDayMap 은 count 있지만 결과에서 사라짐.
 *
 * 대신 KST 달력 일을 직접 순회 — `${key}T00:00:00Z` 를 baseline 으로 하고 +24h UTC
 * (=+1일 KST) 씩 진행하며 kstDateKey 를 다시 계산.
 */
export function buildKstDayBuckets(
  countsByKey: Map<string, number>,
  from: Date,
  to: Date,
): Array<{ date: string; count: number }> {
  const startKey = kstDateKey(from)
  const endKey = kstDateKey(to)
  if (startKey > endKey) return []
  const out: Array<{ date: string; count: number }> = []
  let cursor = new Date(`${startKey}T00:00:00Z`)
  while (kstDateKey(cursor) <= endKey) {
    const key = kstDateKey(cursor)
    out.push({ date: key, count: countsByKey.get(key) ?? 0 })
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return out
}
