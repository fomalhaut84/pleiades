-- #510 후속 (Codex #511 4차 P2): 20261019090100 이 490490.KS 관심종목과 충돌해 남긴 옛 472150.KS 관심종목 행
-- ('[#510 병합 필요]' 라벨) 을 제거한다. 행이 남아 있으면 관심종목을 읽는 알림 스캐너(TA 시그널 · 급등락 ·
-- 가격 알림)가 TIGER 시세로 SOL 라벨 알림을 계속 낼 수 있어, 라운드마다 다른 스캐너가 지적됐다.
-- 490490.KS 관심종목이 이미 있으므로(충돌 조건) 감시 의도는 그 행에 남는다. 옛 행의 strategy 와 memo (이전 알림
-- 설정 포함) 는 490490.KS 행 memo 에 옮겨 보존한 뒤 삭제한다 — 삭제로 복구 정보가 사라지지 않게 (Codex #514 P2).
--
-- 멱등: 격리 라벨 행에만 걸린다. 실서버는 2026-10-19 확인 결과 두 티커 모두 관심종목 아님 → 영향 없음.

UPDATE "Watchlist" keep SET "memo" = concat_ws(E'\n', keep."memo",
    '[#510] 472150.KS 오등록 관심종목 — strategy=' || coalesce(stale."strategy", '-')
      || ', 메모: ' || coalesce(stale."memo", '-'))
FROM "Watchlist" stale
WHERE keep."ticker" = '490490.KS'
  AND stale."ticker" = '472150.KS' AND stale."displayName" = 'SOL 미국배당미국채혼합50 [#510 병합 필요]';

DELETE FROM "Watchlist"
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50 [#510 병합 필요]';

-- 참조가 사라진 472150.KS 캐시 행 정리 (20261019090100 의 4 와 같은 보존 조건). 앞 마이그레이션이 붙인 라벨
-- 또는 관심종목 메타로 재기록된 격리 라벨 행만 — 무관한 472150.KS 캐시는 건드리지 않는다
DELETE FROM "PriceCache" pc
WHERE pc."ticker" = '472150.KS'
  AND pc."displayName" IN ('TIGER 배당커버드콜액티브', 'SOL 미국배당미국채혼합50 [#510 병합 필요]')
  AND NOT EXISTS (SELECT 1 FROM "Holding" h WHERE h."ticker" = pc."ticker")
  AND NOT EXISTS (SELECT 1 FROM "Watchlist" w WHERE w."ticker" = pc."ticker")
  AND NOT EXISTS (SELECT 1 FROM "CustomStrategy" cs WHERE cs."isActive" AND cs."ticker" = pc."ticker");
