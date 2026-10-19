/**
 * 거래 확인 단계의 단가 이상치 경고 (#510)
 *
 * 종목명 → 티커 매칭이 잘못돼도(예: 472150.KS ↔ 490490.KS) 미리보기에 티커만 보여서는
 * 사람이 알아채기 어렵다. 입력 단가가 매칭된 티커의 현재가와 크게 다르면 경고 라인을 덧붙여
 * 오매칭을 확인 단계에서 드러낸다. 과거 거래 소급 입력도 있으므로 차단하지 않고 경고만 한다.
 */

import { formatKRWFull, formatUSD } from './formatter'

/** 현재가 대비 입력 단가 괴리 경고 임계 (20%) — 한국장 일일 가격제한폭(30%)보다 낮게 */
export const PRICE_DEVIATION_WARN_RATIO = 0.2

/**
 * 입력 단가가 현재가와 임계 이상 차이 나면 경고 문구를, 아니면 null 을 반환한다.
 * 현재가가 없거나 비정상(0 이하, NaN)이면 비교할 수 없으므로 null.
 */
export function priceDeviationWarning(
  enteredPrice: number,
  currentPrice: number | null | undefined,
  currency: string,
): string | null {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return null
  if (!Number.isFinite(enteredPrice) || enteredPrice <= 0) return null

  const deviation = Math.abs(enteredPrice - currentPrice) / currentPrice
  if (deviation < PRICE_DEVIATION_WARN_RATIO) return null

  const currentStr = currency === 'USD' ? formatUSD(currentPrice) : formatKRWFull(currentPrice)
  return `⚠️ 입력 단가가 현재가(${currentStr})와 ${(deviation * 100).toFixed(1)}% 차이 납니다. 종목·티커가 맞는지 확인해주세요.`
}

/** 매칭된 티커의 PriceCache 행 중 검증에 쓰는 필드 */
export interface TickerCacheSnapshot {
  price: number
  quoteName: string | null
}

/**
 * 거래 미리보기에 덧붙일 티커 검증 라인 (raw 텍스트 — HTML 이스케이프는 호출자 책임).
 * - Yahoo 종목명: 사용자 라벨(displayName)이 아니라 시세 소스가 말하는 실제 종목명.
 *   라벨이 틀린 티커에 붙어 있어도 여기서 다른 이름이 보인다 (472150.KS → TIGER …).
 * - 단가 괴리 경고: priceDeviationWarning 참조.
 */
export function buildTickerCheckLines(
  enteredPrice: number,
  currency: string,
  cache: TickerCacheSnapshot | null,
): string[] {
  if (!cache) return []
  const lines: string[] = []
  if (cache.quoteName) lines.push(`Yahoo 종목명: ${cache.quoteName}`)
  const warning = priceDeviationWarning(enteredPrice, cache.price, currency)
  if (warning) lines.push(warning)
  return lines
}
