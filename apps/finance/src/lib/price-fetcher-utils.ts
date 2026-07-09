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
 * Pure — 활성 전략의 크로스 티커를 tickerMeta 에 병합 (Phase 34-B follow-up / Codex #428 P2).
 * 이미 등록된 티커 (홀딩·관심종목) 는 그대로. 신규 항목만 placeholder 로 삽입:
 *   - displayName: ticker 자체 (사용자가 관심종목에 추가하면 그 이름 우선 사용됨)
 *   - market: '?' (normalizeMarket 이 ticker suffix `.KS`/`.KQ` 로 fallback)
 *   - currency: KRX suffix 면 KRW, 아니면 USD (SPY/VIX 등 대부분)
 */
export function mergeCrossTickersIntoMeta(
  tickerMeta: Map<string, TickerMetaValue>,
  crossTickers: Iterable<string>,
): void {
  for (const t of crossTickers) {
    if (tickerMeta.has(t)) continue
    tickerMeta.set(t, {
      displayName: t,
      market: '?',
      currency: t.endsWith('.KS') || t.endsWith('.KQ') ? 'KRW' : 'USD',
    })
  }
}
