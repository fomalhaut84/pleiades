/**
 * KST 캘린더 일수 유틸 (pure).
 *
 * MyFinance 는 여러 곳 (evaluator earnings, fetcher, cron 등) 에서 "KST 기준 오늘·같은 날"
 * 판정을 하며 이들이 raw UTC 시각으로 나뉘어 있으면 경계 조건에서 불일치가 발생 (Codex #426 P2).
 * → 이 파일 하나로 통일.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** KST = UTC+9. 신규 코드의 KST 계산/표기는 이 상수를 재사용한다 (새 중복 정의 금지). */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

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

/**
 * `d` 를 KST 로 shift 한 Date — 각 구성요소를 `getUTC*` 로 읽으면 KST 값이 된다.
 * 서버 로컬 타임존에 의존하지 않기 위한 내부 헬퍼.
 */
function kstShifted(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** KST 캘린더 날짜를 `YYYY-MM-DD` 로 표기 (#499 — 프롬프트의 '오늘' 명시용). */
export function formatKstDate(d: Date): string {
  const s = kstShifted(d)
  return `${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())}`
}

const kstMonthDayTime = (s: Date) =>
  `${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())} ${pad2(s.getUTCHours())}:${pad2(s.getUTCMinutes())} KST`

/**
 * KST 기준 시각을 `MM-DD HH:mm KST` 로 표기 (#499 — 도구 호출 시각 등 '지금' 인 값 전용).
 * 연도가 없으므로 외부에서 받은 시각 (시세 기준 시각, 캐시 기록 시각) 에는 쓰지 말고
 * `formatKstDateTimeFull` 을 사용 (Codex #501 P2).
 */
export function formatKstDateTime(d: Date): string {
  return kstMonthDayTime(kstShifted(d))
}

/**
 * KST 기준 시각을 `YYYY-MM-DD HH:mm KST` 로 표기 (#499 사전 리뷰 P1).
 * PriceCache 기록 시각처럼 몇 달 전일 수 있는 값은 연도가 없으면 최근 것처럼
 * 읽히므로 (거짓 시각) 반드시 이 포맷을 쓴다.
 */
export function formatKstDateTimeFull(d: Date): string {
  const s = kstShifted(d)
  return `${s.getUTCFullYear()}-${kstMonthDayTime(s)}`
}
