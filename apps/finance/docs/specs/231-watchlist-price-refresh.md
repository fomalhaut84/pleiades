# 관심종목 시세 갱신

## 목적

관심종목의 현재가가 "시세 없음"으로 표시되는 버그 수정.
원인: refreshPrices가 Holding(보유 종목)만 갱신하고 Watchlist는 포함하지 않음.

## 요구사항

- [ ] refreshPrices에서 Watchlist 티커도 PriceCache 갱신 대상에 포함
- [ ] 기존 보유 종목 갱신 로직 회귀 없음

## 기술 설계

### 변경 파일 (1개)

**`src/lib/price-fetcher.ts`** — `doRefreshPrices` 함수
- Holding distinct ticker 조회 후, Watchlist ticker도 추가 수집
- 중복 제거 후 yahoo-finance2 조회

## 테스트 계획

- [ ] 관심종목 `/관심목록` → 현재가 정상 표시
- [ ] MCP `get_watchlist` → 현재가 포함 응답
- [ ] lint + typecheck + build 통과

## 제외 사항

- 관심종목 UI/봇 커맨드 변경 없음
