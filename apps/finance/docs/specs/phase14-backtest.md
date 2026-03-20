# Phase 14: 백테스팅 엔진

## 목적

과거 데이터로 투자 전략을 검증하는 시뮬레이션. TA 엔진과 전략 태그를 확장.

## 서브 이슈

- [ ] **14-A**: 전략 룰 DSL + 백테스트 엔진
- [ ] **14-B**: 텔레그램 /백테스트 커맨드
- [ ] **14-C**: 웹 백테스팅 페이지

## 상세 설계

`docs/milestone-3.md` Phase 14 섹션 참조

---

## 14-A: 전략 룰 DSL + 백테스트 엔진

### 요구사항

- [ ] StrategyRule 인터페이스 (매수/매도 조건 DSL)
- [ ] 프리셋 전략 (RSI 반전, 골든크로스, BB 반등)
- [ ] runBacktest(): OHLCV + TA → 시뮬레이션 실행
- [ ] BacktestResult: 수익률, 최대낙폭, 승률, 샤프, 자산곡선

### 파일

```
src/lib/backtest/types.ts           # StrategyRule, BacktestResult 등
src/lib/backtest/presets.ts          # 프리셋 전략
src/lib/backtest/engine.ts           # runBacktest 엔진
```

---

## 14-B: 텔레그램 /백테스트 커맨드

### 요구사항

- [ ] /백테스트 [종목] [전략] [기간] — 백테스트 실행 + 결과 표시
- [ ] 프리셋 전략 선택 또는 커스텀

### 파일

```
src/bot/commands/backtest.ts
```

---

## 14-C: 웹 백테스팅 페이지

### 요구사항

- [ ] /backtest 페이지
- [ ] 종목/전략/기간 선택 → 실행 → 결과 차트
- [ ] 자산 곡선 라인차트 + 매수/매도 포인트
- [ ] 성과 메트릭 카드 (수익률, MDD, 승률, 샤프)
- [ ] API: POST /api/backtest

### 파일

```
src/app/backtest/page.tsx
src/app/backtest/BacktestClient.tsx
src/app/api/backtest/route.ts
```
