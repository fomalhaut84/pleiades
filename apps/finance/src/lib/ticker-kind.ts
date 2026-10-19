/**
 * 티커 모양 판별 — 의존성 없는 순수 모듈 (#502).
 * 표시 계층 (`format.ts`) 과 시세 계층 (`price-fetcher-utils.ts`) 양쪽이 쓰므로 시장 모듈
 * (`market-hours.ts`) 과 분리한다.
 */

/**
 * 지수 티커 판별 (#499). 야후는 지수를 `^` prefix 로 제공한다 (`^KS11`, `^GSPC` 등).
 * 티커 모양만 판별한다 — 표기 (포인트 vs 통화) 와 캐시 정책 (`fetchQuote` 의
 * `skipCache`) 은 호출자가 결정한다.
 */
export function isIndexTicker(ticker: string): boolean {
  return ticker.trim().startsWith('^')
}

/** 한국 지수 티커 (`^KS11` 코스피, `^KQ11` 코스닥, `^KS200` 등) — 야후 `^KS`/`^KQ` prefix. */
export function isKoreanIndexTicker(ticker: string): boolean {
  return /^\^K[SQ]/i.test(ticker.trim())
}
