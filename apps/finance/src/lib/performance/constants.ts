/** 벤치마크 티커 → 표시명 매핑 */
export const BENCHMARK_DISPLAY_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq',
  'SCHD': 'SCHD',
}

/** 기간 프리셋 (월 단위) */
export const PERIOD_PRESETS: Record<string, number> = {
  '1M': 1,
  '3M': 3,
  '6M': 6,
  '1Y': 12,
  'ALL': 0, // 0 = 전체
}

/** 유효한 기간 키 목록 */
export const VALID_PERIODS = Object.keys(PERIOD_PRESETS)

/** 기간 키 → 시작일 계산 (ALL이면 null) */
export function periodToStartDate(period: string): Date | null {
  const months = PERIOD_PRESETS[period]
  if (months === undefined || months === 0) return null
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() - months)
  return d
}
