# 통화 표시 수정

## 목적

US 종목이 원화(KRW)로 표시되는 버그 수정. 3개 컴포넌트에서 통화 구분 없이 formatKRW만 사용.

## 변경 대상

1. `src/components/watchlist/WatchlistTable.tsx` — market 기반 USD/KRW 구분
2. `src/components/stock-option/StockOptionDashboard.tsx` — 행사가/내가치 통화 구분
3. `src/components/rsu/RSUDashboard.tsx` — 베스팅 종가 통화 구분

## 테스트 계획

- [ ] 관심종목 US 종목 → $ 표시
- [ ] 스톡옵션 카카오 → 원 표시 (KRW)
- [ ] lint + typecheck + build 통과
