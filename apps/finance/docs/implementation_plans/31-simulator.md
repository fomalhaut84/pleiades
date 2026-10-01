# Phase 5: Simulator — 구현 계획 (사후 기록)

## 서브 이슈
- #31: 5-A 스톡옵션 모델 + 시드 데이터
- #32: 5-B 스톡옵션 대시보드 + 행사 시뮬레이터
- #33: 5-C 근로소득 프로필 (IncomeProfile 모델)
- #34: 5-D 통합 세금 시뮬레이션 — 연봉+RSU+스톡옵션
- #35: 5-E 복리 시뮬레이터 + 시나리오 비교
- #36: 5-F 수익률 분석 (PortfolioSnapshot + TWR + 벤치마크)

## 주요 변경 파일
```
신규:
  prisma/migrations/ — StockOption, StockOptionVesting, IncomeProfile, PortfolioSnapshot
  src/app/api/stock-options/ — GET API
  src/app/api/income-profiles/ — CRUD API
  src/app/stock-options/ — 스톡옵션 페이지
  src/app/simulator/ — 시뮬레이터 페이지
  src/app/performance/ — 수익률 분석 페이지
  src/lib/tax/ — 통합 세금 시뮬레이션 로직
  src/components/simulator/ — 복리 차트, 시나리오 비교
  src/components/stock-option/ — 대시보드, 행사 시뮬레이터
```

## DB 마이그레이션
- StockOption, StockOptionVesting, IncomeProfile, PortfolioSnapshot 모델 추가

## 구현 순서
1. StockOption/Vesting 모델 + 시드
2. 스톡옵션 대시보드 + 행사 시뮬레이터
3. IncomeProfile CRUD
4. 통합 세금 시뮬레이션 (누진세 정확 계산)
5. 복리 시뮬레이터 (3 시나리오)
6. PortfolioSnapshot + TWR + 벤치마크 대비 수익률
