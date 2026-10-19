-- #510: 'SOL 미국배당미국채혼합50' 이 시드 데이터부터 잘못된 티커 472150.KS (TIGER 배당커버드콜액티브)
-- 로 저장돼 있었다. 정답은 490490.KS. 이후 거래가 PriceCache 라벨 → 티커 이름 매칭으로 같은 오류를 전파.
--
-- 멱등: 서버 DB 일부가 수동 정정된 상태에서도 안전하도록 모든 문장이 (잘못된 티커 + 해당 라벨)
-- 조합만 대상으로 한다. 이미 고쳐진 행은 매칭되지 않는다. 라벨 조건 덕분에 472150.KS 를 정상적으로
-- (TIGER 로) 보유/관심 등록한 행은 건드리지 않는다.
--
-- 범위: 보유(Holding) · 거래(Trade) · 배당(Dividend) · 자산 스냅샷(HoldingSnapshot) · 관심종목(Watchlist)
-- 의 티커를 함께 맞춘다 (보유만 고치면 거래 기반 재계산·세금 집계에서 종목이 둘로 갈라진다).
-- 제외: AlertHistory (발송 당시 기록), CustomStrategy (라벨 컬럼이 없어 오매칭 여부 판별 불가),
-- 과거 스냅샷의 price/valueKRW (당시 잘못된 시세로 계산된 값 — 별도 판단).

-- 0. 보유 충돌 가드: 같은 계좌에 잘못된 보유(472150.KS + 라벨)와 정답 보유(490490.KS)가 공존하면
--    데이터를 바꾸기 전에 중단한다. 이 상태는 평균단가 병합(거래 이력 재계산)이 필요해 SQL 로 안전하게
--    정정할 수 없고, 부분 격리는 거래·스냅샷·전략 알림 등 잘못된 티커를 계속 참조하는 경로를 남긴다
--    (Codex #511 P2 × 3 라운드). 실서버는 2026-10-19 확인 결과 충돌 없음 (보유 이미 수동 정정).
--    중단 시: 해당 계좌를 수동 병합 → `prisma migrate resolve --rolled-back <이 마이그레이션>` → 재배포.
DO $$
DECLARE
  conflict_accounts TEXT;
BEGIN
  SELECT string_agg(DISTINCT h."accountId", ', ') INTO conflict_accounts
  FROM "Holding" h
  WHERE h."ticker" = '472150.KS' AND h."displayName" = 'SOL 미국배당미국채혼합50'
    AND EXISTS (SELECT 1 FROM "Holding" x WHERE x."accountId" = h."accountId" AND x."ticker" = '490490.KS');
  IF conflict_accounts IS NOT NULL THEN
    RAISE EXCEPTION '#510: 472150.KS/490490.KS 보유 충돌 계좌 — 수동 병합 후 재실행 필요: %', conflict_accounts;
  END IF;
END $$;

-- 1. 거래 / 배당 / 자산 스냅샷: 유니크 제약 없음. 0 의 가드로 충돌 계좌가 없음이 보장된다
UPDATE "Trade" SET "ticker" = '490490.KS'
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50';

UPDATE "Dividend" SET "ticker" = '490490.KS'
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50';

UPDATE "HoldingSnapshot" SET "ticker" = '490490.KS'
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50';

-- 2. 보유: (accountId, ticker) 유니크 — 0 의 가드로 충돌 없음
UPDATE "Holding" SET "ticker" = '490490.KS'
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50';

-- 3. 관심종목: ticker 유니크. 490490.KS 가 없으면 그대로 정정
UPDATE "Watchlist" w SET "ticker" = '490490.KS'
WHERE w."ticker" = '472150.KS' AND w."displayName" = 'SOL 미국배당미국채혼합50'
  AND NOT EXISTS (SELECT 1 FROM "Watchlist" x WHERE x."ticker" = '490490.KS');

-- 3-1. 490490.KS 관심종목이 이미 있어 남은 옛 행: 알림을 멈추고 설정값은 memo 에 보존한 뒤 라벨 격리.
--      - 알림 기준값(targetBuy/entryLow/entryHigh)을 그대로 두면 TIGER 시세로 매수 알림이 계속 평가된다 (Codex #511 P2)
--      - 라벨을 그대로 두면 주가 갱신이 관심종목 메타로 SOL 라벨을 472150.KS 캐시 행에 다시 쓴다 (Codex #511 P2)
--      - 기준값이 어느 시세를 보고 정한 것인지 알 수 없어 490490.KS 행으로 자동 병합하지 않는다
UPDATE "Watchlist" SET
  "displayName" = 'SOL 미국배당미국채혼합50 [#510 병합 필요]',
  "memo" = concat_ws(E'\n', "memo",
    '[#510] 티커 오류로 알림 중지. 이전 설정: targetBuy=' || coalesce("targetBuy"::text, '-')
      || ', entryLow=' || coalesce("entryLow"::text, '-')
      || ', entryHigh=' || coalesce("entryHigh"::text, '-')),
  "targetBuy" = NULL,
  "entryLow" = NULL,
  "entryHigh" = NULL
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50';

-- 4. 시세 캐시: 잘못된 라벨이 붙은 472150.KS 행은 이름 매칭의 전파 경로였다.
--    더 이상 참조하는 보유/관심종목/활성 전략이 없으면 삭제 (490490.KS 는 다음 주가 갱신에서 생성),
--    아직 참조가 남아 있으면 라벨만 실제 종목명으로 교정해 이름 매칭에서 빠지게 한다.
DELETE FROM "PriceCache" pc
WHERE pc."ticker" = '472150.KS' AND pc."displayName" = 'SOL 미국배당미국채혼합50'
  AND NOT EXISTS (SELECT 1 FROM "Holding" h WHERE h."ticker" = pc."ticker")
  AND NOT EXISTS (SELECT 1 FROM "Watchlist" w WHERE w."ticker" = pc."ticker")
  AND NOT EXISTS (SELECT 1 FROM "CustomStrategy" cs WHERE cs."isActive" AND cs."ticker" = pc."ticker");

UPDATE "PriceCache" SET "displayName" = 'TIGER 배당커버드콜액티브'
WHERE "ticker" = '472150.KS' AND "displayName" = 'SOL 미국배당미국채혼합50';
