/**
 * price-fetcher 순수 헬퍼 — DB / yahoo-finance2 사이드 이펙트 없이 유닛 테스트 가능.
 * price-fetcher 본체 (Prisma / yahoo 인스턴스 top-level 생성) 에서 분리 (Codex #429 P2).
 */

export interface TickerMetaValue {
  displayName: string
  market: string
  currency: string
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
    const isKrx = t.endsWith('.KS') || t.endsWith('.KQ')
    const isFx = t.endsWith('=X')
    tickerMeta.set(t, {
      displayName: t,
      market: isKrx ? 'KR' : isFx ? 'FX' : 'US',
      currency: isKrx ? 'KRW' : 'USD',
    })
  }
}
