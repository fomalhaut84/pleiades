/**
 * KST 캘린더 일수 유틸 (pure).
 *
 * MyFinance 는 여러 곳 (evaluator earnings, fetcher, cron 등) 에서 "KST 기준 오늘·같은 날"
 * 판정을 하며 이들이 raw UTC 시각으로 나뉘어 있으면 경계 조건에서 불일치가 발생 (Codex #426 P2).
 * → 이 파일 하나로 통일.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * `d` 가 속한 KST 캘린더 일의 자정 (KST 00:00) 을 UTC 타임스탬프 (ms) 로 반환.
 * 두 날짜의 KST 캘린더 일수 차이는 `(kstMidnightUtc(a) - kstMidnightUtc(b)) / DAY_MS`.
 */
export function kstMidnightUtc(d: Date): number {
  const shifted = d.getTime() + KST_OFFSET_MS
  const day = Math.floor(shifted / DAY_MS)
  // shift 공간의 자정을 다시 실제 UTC 로 되돌림 (KST 00:00 = UTC 전날 15:00).
  return day * DAY_MS - KST_OFFSET_MS
}

/** `d` 가 속한 KST 캘린더 일이 `ref` 의 KST 캘린더 일 이후인지 (같은 날 포함). */
export function isSameOrFutureKstDay(d: Date, ref: Date): boolean {
  return kstMidnightUtc(d) >= kstMidnightUtc(ref)
}

/**
 * 두 시각의 KST 캘린더 일수 차이 (`d - ref`). 정수. `d` 가 미래면 양수, 과거면 음수.
 */
export function kstDayDiff(d: Date, ref: Date): number {
  return Math.round((kstMidnightUtc(d) - kstMidnightUtc(ref)) / DAY_MS)
}
