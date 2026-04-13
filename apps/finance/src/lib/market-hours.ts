/**
 * 시장별 거래시간 판별 유틸
 *
 * KST 기준으로 한국장/미국장 개장 여부 판단.
 * cron 스케줄러와 알림 필터에서 공용 사용.
 */

function getKSTTime(): { h: number; m: number; day: number } {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return {
    h: kst.getHours(),
    m: kst.getMinutes(),
    day: kst.getDay(), // 0=Sun, 6=Sat
  }
}

/** 한국 주식시장 개장 여부 (09:00~15:30 KST, 평일) */
export function isKRMarketOpen(): boolean {
  const { h, m, day } = getKSTTime()
  if (day === 0 || day === 6) return false
  const minutes = h * 60 + m
  return minutes >= 540 && minutes <= 930 // 09:00 ~ 15:30
}

/** 현재 미국 서머타임(EDT) 여부를 America/New_York 시간대로 판별 */
function isUSDST(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const diffHours = (utc.getTime() - et.getTime()) / (1000 * 60 * 60)
  return Math.round(diffHours) === 4 // EDT=UTC-4, EST=UTC-5
}

/**
 * 미국 주식시장 개장 여부 (평일→익일, KST 기준)
 * - 서머타임(EDT): 22:30~05:00 KST
 * - 비서머타임(EST): 23:30~06:00 KST
 */
export function isUSMarketOpen(): boolean {
  const { h, m, day } = getKSTTime()
  const minutes = h * 60 + m
  const dst = isUSDST()
  const openMin = dst ? 1350 : 1410   // 22:30 or 23:30
  const closeMin = dst ? 300 : 360    // 05:00 or 06:00

  // 저녁 세션: openMin~23:59 (월~금)
  if (day >= 1 && day <= 5 && minutes >= openMin) return true
  // 새벽 세션: 00:00~closeMin (화~토 = 월~금 야간)
  if (day >= 2 && day <= 6 && minutes <= closeMin) return true

  return false
}

/** 한국 시장 식별자 (Seed, Yahoo exchange code 모두 포함) */
const KR_MARKETS = new Set([
  'KR', 'KS', 'KQ', 'KSC', 'KOE', 'KOSPI', 'KOSDAQ', 'KRX',
])

/** 미국 시장 식별자 (Seed, Yahoo exchange code 모두 포함) */
const US_MARKETS = new Set([
  'US', 'NYQ', 'NGM', 'NMS', 'NCM', 'PCX', 'NYSE', 'NASDAQ', 'AMEX', 'BATS', 'ARCA',
])

/** FX/환율 식별자 */
const FX_MARKETS = new Set(['FX', 'CCY'])

/**
 * 종목 market + ticker 기준으로 정규화된 시장 구분 반환.
 * Yahoo Finance의 raw exchange 코드(`KSC`, `NGM`, `NYQ` 등)도 처리.
 * market이 모호하면 ticker suffix(`.KS`, `.KQ`)로 fallback.
 */
export function normalizeMarket(market: string, ticker?: string): 'KR' | 'US' | 'FX' | 'OTHER' {
  const upper = market.toUpperCase()
  if (KR_MARKETS.has(upper)) return 'KR'
  if (US_MARKETS.has(upper)) return 'US'
  if (FX_MARKETS.has(upper)) return 'FX'

  // ticker suffix fallback
  if (ticker) {
    const t = ticker.toUpperCase()
    if (t.endsWith('.KS') || t.endsWith('.KQ')) return 'KR'
    if (t.endsWith('=X')) return 'FX'
  }

  return 'OTHER'
}

/**
 * 종목 market + ticker 기준으로 거래시간 여부 판단.
 * - KR → 한국장 거래시간 (평일 09:00~15:30 KST)
 * - US → 미국장 거래시간
 * - FX → 항상 true (24시간 거래)
 * - OTHER → false (허위 알림 방지 목적이므로 보수적으로 차단)
 */
export function isMarketOpenFor(market: string, ticker?: string): boolean {
  const normalized = normalizeMarket(market, ticker)
  if (normalized === 'KR') return isKRMarketOpen()
  if (normalized === 'US') return isUSMarketOpen()
  if (normalized === 'FX') return true
  return false
}
