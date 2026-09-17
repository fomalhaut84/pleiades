/**
 * price-fetcher 순수 헬퍼 — DB / yahoo-finance2 사이드 이펙트 없이 유닛 테스트 가능.
 * price-fetcher 본체 (Prisma / yahoo 인스턴스 top-level 생성) 에서 분리 (Codex #429 P2).
 */

import { normalizeMarket } from './market-hours'
export interface TickerMetaValue {
  displayName: string
  market: string
  currency: string
  /**
   * 보유·관심종목 메타가 아니라 티커 모양으로 추정한 placeholder (Codex #501 P2).
   * refresh upsert 시 야후 quote 메타 (exchange/currency/shortName) 로 대체한다.
   */
  placeholder?: boolean
}

/** 한국 지수 티커 (`^KS11` 코스피, `^KQ11` 코스닥, `^KS200` 등) — 야후 `^KS`/`^KQ` prefix. */
export function isKoreanIndexTicker(ticker: string): boolean {
  return /^\^K[SQ]/i.test(ticker.trim())
}

/**
 * Pure — 활성 전략의 크로스 티커를 tickerMeta 에 병합 (Phase 34-B follow-up, Codex #428 x2 P2 반영).
 * 이미 등록된 티커 (홀딩·관심종목) 는 그대로. 신규 항목만 placeholder 로 삽입.
 *
 * 시장 fallback:
 *   - `doRefreshPrices` 는 `normalizeMarket(meta.market, ticker)` 로 PriceCache.market 을 저장.
 *     `normalizeMarket` 은 market 문자열 매치를 먼저 시도하고, 실패해야 ticker suffix 로 fallback.
 *     즉 `market='US'` 로 두면 US 매치 즉시 반환 → `=X` FX suffix 체크 스킵 → FX 회귀.
 *   - suffix 로부터 정확한 값을 명시:
 *     - `.KS` / `.KQ` → 'KR' (KRW)
 *     - `=X` → 'FX' (currency 는 pair 정확 반영이 어려워 USD 로 통일 — USDKRW=X 는 상위 흐름
 *       (`doRefreshPrices` FX_TICKER 오버라이드) 이 덮어씀)
 *     - 그 외 (SPY/VIX/QQQ 등) → 'US' (USD) — 사용실태상 US 벤치마크가 대다수
 *   - 이렇게 하면 이후 사용자가 그 티커를 관심종목에 추가해도 PriceCache 는 이미 정확 값이라
 *     시간대 alert 이 skip 되지 않음.
 */
export function mergeCrossTickersIntoMeta(
  tickerMeta: Map<string, TickerMetaValue>,
  crossTickers: Iterable<string>,
): void {
  for (const t of crossTickers) {
    if (tickerMeta.has(t)) continue
    const isKr = t.endsWith('.KS') || t.endsWith('.KQ') || isKoreanIndexTicker(t)
    const isFx = t.endsWith('=X')
    tickerMeta.set(t, {
      displayName: t,
      market: isKr ? 'KR' : isFx ? 'FX' : 'US',
      currency: isKr ? 'KRW' : 'USD',
      placeholder: true,
    })
  }
}

/** refresh upsert 에 쓰는 야후 quote 메타 필드 (필요한 것만). */
export interface QuoteMetaLike {
  exchange?: string | null
  currency?: string | null
  shortName?: string | null
  longName?: string | null
}

/**
 * refresh upsert 에 저장할 메타 확정 (Codex #501 P2).
 *
 * 보유·관심종목 메타는 사용자가 기록한 값이므로 그대로 쓴다. placeholder (전략 자기
 * 티커 / cross_ticker 로만 유입) 는 티커 모양 추정이라 `^KS11` 같은 지수가 US/USD 로
 * 저장될 수 있어, 야후 quote 의 exchange/currency/shortName 으로 대체한다. quote 의
 * exchange 를 시장으로 해석할 수 없으면 (`OTHER`) placeholder 추정을 유지한다.
 */
export function resolveRefreshMeta(
  meta: TickerMetaValue,
  quote: QuoteMetaLike,
  ticker: string,
): { displayName: string; market: 'KR' | 'US' | 'FX' | 'OTHER'; currency: string } {
  if (!meta.placeholder) {
    return { displayName: meta.displayName, market: normalizeMarket(meta.market, ticker), currency: meta.currency }
  }
  const fromQuote = normalizeMarket(quote.exchange ?? '', ticker)
  const market = fromQuote === 'OTHER' ? normalizeMarket(meta.market, ticker) : fromQuote
  const currency = quote.currency?.trim() || meta.currency
  const displayName = quote.shortName?.trim() || quote.longName?.trim() || meta.displayName
  return { displayName, market, currency }
}

/**
 * 지수 티커 판별 (#499). 야후는 지수를 `^` prefix 로 제공한다 (`^KS11`, `^GSPC` 등).
 * 티커 모양만 판별한다 — 표기 (포인트 vs 통화) 와 캐시 정책 (`fetchQuote` 의
 * `skipCache`) 은 호출자가 결정한다.
 */
export function isIndexTicker(ticker: string): boolean {
  return ticker.trim().startsWith('^')
}

/** 시세 시각으로 받아들일 수 있는 하한 (2000-01-01 UTC). */
const MARKET_TIME_MIN_MS = Date.UTC(2000, 0, 1)
/** 상한 여유 — 시계 오차/타임존 스큐 흡수용 7일. */
const MARKET_TIME_FUTURE_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000
/** epoch seconds / milliseconds 판별 임계값. 1e11 초 = 서기 5138년 → 그 이상은 ms 로 간주. */
const EPOCH_MS_THRESHOLD = 1e11

/**
 * yahoo-finance2 의 `regularMarketTime` 정규화 (#499).
 *
 * 라이브러리/응답 버전에 따라 `Date` 또는 epoch seconds (숫자) 로 오고,
 * 드물게 epoch milliseconds / ISO 문자열로도 온다. 해석 불가하면 `null` —
 * 거짓 시각을 만들지 않는다.
 *
 * 숫자를 무조건 seconds 로 간주하면 ms 입력이 서기 5만년대로 튀어 거짓 시각이
 * 된다 (사전 리뷰 P1). 표기에 연도를 포함해도 (Codex #501 P2) 단위 오해석 자체는
 * 여기서 막아야 한다.
 * → 크기로 seconds/ms 를 가르고, sanity window 밖은 null.
 *
 * 현재 시세 전용 — sanity window 하한이 2000년이므로 과거 캔들(historical OHLCV)
 * 타임스탬프에는 사용하지 말 것.
 */
export function normalizeMarketTime(raw: unknown): Date | null {
  const ms = toEpochMs(raw)
  if (ms === null) return null
  // 미래/과거로 비현실적인 값은 파싱 실패로 취급 (단위 오해석 방어).
  if (ms < MARKET_TIME_MIN_MS) return null
  if (ms > Date.now() + MARKET_TIME_FUTURE_TOLERANCE_MS) return null
  return new Date(ms)
}

/** raw 값을 epoch milliseconds 로 환산. 해석 불가 시 null. */
function toEpochMs(raw: unknown): number | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.getTime()
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return null
    return raw > EPOCH_MS_THRESHOLD ? raw : raw * 1000
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = new Date(raw).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}
