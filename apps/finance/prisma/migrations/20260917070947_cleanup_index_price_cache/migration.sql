-- #499: 지수 티커(^KS11 등)의 **미추적** PriceCache 잔존 행 정리.
--
-- 구버전 fetchQuote 는 get_prices/`/price` 일회성 조회도 무조건 upsert 했다. 보유·관심종목·
-- 활성 커스텀 전략(자기 티커 + cross_ticker 조건)에 없는 지수 행은 주가 갱신 cron 의
-- refresh 대상이 아니라 영구 stale 로 남고, get_prices 가 실시간 조회에 실패하면 그 값을
-- '[캐시]' 로 조용히 반환했다 → (읽기 지점 가드와 함께) 해당 행만 제거한다.
--
-- Codex #501 P2: 보유/관심종목/활성 전략(자기 티커 + cross_ticker)이 참조하는 지수 행은
-- refreshPrices() 가 정상 갱신하는 유효 캐시이므로 삭제하지 않는다 (삭제 시 다음 refresh
-- 까지 화면에 시세 공백). 활성 전략 자기 티커는 같은 PR 에서 refresh 집합에 추가됨
-- (collectStrategyRefreshTickers) — 이 보존 집합과 refresh 집합은 항상 같아야 한다.
--
-- 스키마 변경 없음 (데이터 정리 전용). '^' 는 LIKE 의 와일드카드가 아니므로 prefix 매칭.
DELETE FROM "PriceCache" pc
WHERE pc."ticker" LIKE '^%'
  AND NOT EXISTS (SELECT 1 FROM "Holding" h WHERE h."ticker" = pc."ticker")
  AND NOT EXISTS (SELECT 1 FROM "Watchlist" w WHERE w."ticker" = pc."ticker")
  AND NOT EXISTS (SELECT 1 FROM "CustomStrategy" cs WHERE cs."isActive" AND cs."ticker" = pc."ticker")
  AND NOT EXISTS (
    SELECT 1
    FROM "CustomStrategy" cs,
         jsonb_array_elements(
           CASE WHEN jsonb_typeof(cs."conditions"::jsonb) = 'array' THEN cs."conditions"::jsonb ELSE '[]'::jsonb END
         ) AS cond
    WHERE cs."isActive"
      AND cond->>'type' = 'cross_ticker'
      AND upper(trim(cond->>'crossTicker')) = upper(pc."ticker")
  );
