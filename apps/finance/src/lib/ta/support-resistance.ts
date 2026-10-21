/**
 * 지지/저항선 자동 탐지
 *
 * 최근 60일 데이터에서 로컬 최저/최고점을 추출.
 * window 크기만큼 양쪽의 값보다 작으면 지지선, 크면 저항선.
 */

export function findSupportResistance(
  highs: number[],
  lows: number[],
  window: number = 5
): { support: number[]; resistance: number[] } {
  const support: number[] = []
  const resistance: number[] = []

  const len = Math.min(highs.length, lows.length)

  for (let i = window; i < len - window; i++) {
    // 지지선: 현재 저점이 양쪽 window 내 모든 저점보다 작거나 같음
    const isSupport =
      lows.slice(i - window, i).every((l) => l >= lows[i]) &&
      lows.slice(i + 1, i + window + 1).every((l) => l >= lows[i])
    if (isSupport) support.push(lows[i])

    // 저항선: 현재 고점이 양쪽 window 내 모든 고점보다 크거나 같음
    const isResist =
      highs.slice(i - window, i).every((h) => h <= highs[i]) &&
      highs.slice(i + 1, i + window + 1).every((h) => h <= highs[i])
    if (isResist) resistance.push(highs[i])
  }

  // 중복 제거 + 정렬 + 상위 3개
  const uniqueSupport = Array.from(new Set(support.map((v) => Math.round(v * 100) / 100)))
    .sort((a, b) => b - a)
    .slice(0, 3)

  const uniqueResistance = Array.from(new Set(resistance.map((v) => Math.round(v * 100) / 100)))
    .sort((a, b) => a - b)
    .slice(0, 3)

  return { support: uniqueSupport, resistance: uniqueResistance }
}
