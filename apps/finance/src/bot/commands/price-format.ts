/**
 * 봇 시세 표기 포맷 (pure) — #500.
 *
 * `주가` 응답과 `관심종목` 목록이 대상. price.ts / watchlist.ts 본체는 prisma /
 * yahoo 인스턴스를 top-level 로 잡아 유닛 테스트가 어려우므로 표기 규칙만
 * 이 모듈로 분리해 회귀 테스트 대상으로 만든다.
 */

import { formatQuoteValue } from '@/lib/format'
import type { QuoteResult } from '@/lib/price-fetcher'
import { formatUSD, formatPercent } from '../utils/formatter'
import { escapeHtml, h } from '../utils/telegram'

/**
 * 통화 표기. 봇은 원화를 `₩1,234` 로 쓴다 (웹/MCP 의 `1,234원` 과 다른 봇 전용 스타일).
 */
function formatCurrencyValue(value: number, currency: string): string {
  if (currency === 'USD') return formatUSD(value)
  if (currency === 'KRW') return `₩${Math.round(value).toLocaleString('ko-KR')}`
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

/**
 * 현재가 / 변동액 표기. 지수 (`^KS11`) 는 통화가 아니라 포인트 (#500).
 * 지수 판별은 `@/lib/format` 의 공용 규칙 — MCP `get_prices` 와 동일하게 동작한다.
 */
export function formatQuoteAmount(ticker: string, value: number, currency: string): string {
  return formatQuoteValue(ticker, value, (v) => formatCurrencyValue(v, currency))
}

/** 변동액: 부호 + 현재가와 동일한 단위 표기. */
export function formatChange(ticker: string, change: number, currency: string): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${formatQuoteAmount(ticker, change, currency)}`
}

export function formatChangePercent(changePercent: number): string {
  const sign = changePercent >= 0 ? '+' : ''
  return ` (${sign}${changePercent.toFixed(2)}%)`
}

/** `관심종목` 목록의 시세 행 (PriceCache 또는 실시간 fallback). */
export interface WatchlistPriceRow {
  price: number
  currency: string
  changePercent: number | null
}

/**
 * 관심종목 한 줄의 현재가 표기 (#500).
 *
 * 지수 (`^KS11`) 도 관심종목으로 등록 가능하고 cross_ticker 로 PriceCache 에 적재되므로
 * 여기서도 통화가 아닌 포인트로 표기해야 한다. 시세가 없으면 '시세 없음'.
 */
export function formatWatchlistPriceInfo(
  ticker: string,
  price: WatchlistPriceRow | null | undefined,
): string {
  if (!price) return '시세 없음'
  const changeStr = price.changePercent != null ? ` (${formatPercent(price.changePercent)})` : ''
  return `${formatQuoteAmount(ticker, price.price, price.currency)}${changeStr}`
}

/**
 * 시세 응답 HTML 조립. `suffix` 는 캐시 fallback 안내 등 부가 라인.
 */
export function buildQuoteMessage(quote: QuoteResult, suffix?: string): string {
  const changeStr = quote.change != null ? formatChange(quote.ticker, quote.change, quote.currency) : ''
  const changePctStr = quote.changePercent != null ? formatChangePercent(quote.changePercent) : ''
  const emoji = quote.changePercent != null ? (quote.changePercent >= 0 ? '🟢' : '🔴') : ''

  const priceStr = formatQuoteAmount(quote.ticker, quote.price, quote.currency)
  const suffixLine = suffix ? `\n\n${suffix}` : ''

  return (
    `📈 ${h.b(escapeHtml(quote.displayName))} (${escapeHtml(quote.ticker)})\n\n` +
    `현재가: ${h.b(priceStr)} ${emoji}\n` +
    `변동: ${changeStr}${changePctStr}${suffixLine}`
  )
}
