# Phase 14: 백테스팅 엔진 — 구현 계획 (사후 기록)

## 서브 이슈
- #156: 14-A 전략 룰 DSL + 백테스트 엔진 (프리셋 4종 + 메트릭)
- #158: 14-B 텔레그램 /백테스트 커맨드
- #160: 14-C 웹 백테스팅 페이지

## 주요 변경 파일
```
신규:
  src/lib/backtest/ — 백테스트 엔진, 전략 프리셋, 메트릭 계산
  src/app/api/backtest/ — 백테스트 실행 API
  src/app/backtest/ — 웹 백테스팅 페이지
  src/bot/commands/backtest.ts — /백테스트 커맨드
  src/components/backtest/ — 차트, 파라미터 폼, 결과 테이블
```

## DB 마이그레이션
없음

## 구현 순서
1. 전략 룰 DSL + 백테스트 엔진 (프리셋: SMA crossover, RSI, BB, Buy&Hold)
2. 메트릭: CAGR, 최대낙폭, 샤프비율, 승률
3. 텔레그램 /백테스트 커맨드
4. 웹 페이지 (차트 + 파라미터 + 통화 인식)
