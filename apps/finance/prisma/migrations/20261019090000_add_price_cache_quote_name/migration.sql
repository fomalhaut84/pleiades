-- #510: 시세 소스(Yahoo) 실제 종목명. displayName 은 보유/관심종목 라벨로 덮어써지므로
-- 라벨이 엉뚱한 티커에 붙어도 드러나지 않았다 → 별도 컬럼으로 보존. 다음 주가 갱신부터 채워진다.
ALTER TABLE "PriceCache" ADD COLUMN "quoteName" TEXT;
