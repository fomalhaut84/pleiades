# Phase 11: 모닝 브리핑 + 전략 맞춤 AI — 구현 계획 (사후 기록)

## 서브 이슈
- #120: 11-A 종목별 전략 태그 시스템 (HoldingStrategy 모델)
- #122: 11-B 관심종목 워치리스트 (Watchlist 모델)
- #124: 11-C 기술적 분석 엔진 (trading-signals: RSI, MACD, BB, SMA/EMA)
- #126: 11-D 전략별 맞춤 조언 로직
- #128: 11-E 모닝 브리핑
- #130: 11-F 수동 종목 심층 분석
- #132: 11-G 텔레그램 메시지 포맷 통합 개선
- #134: 11-H 텔레그램 메시지 포맷 개선 2차

## 주요 변경 파일
```
신규:
  prisma/migrations/ — HoldingStrategy, Watchlist 모델
  src/lib/ta/ — 기술적 분석 엔진 (trading-signals 래퍼)
  src/lib/strategy/ — 전략별 조언 로직
  src/bot/commands/watchlist.ts — /관심, /관심목록, /관심삭제
  src/bot/commands/briefing.ts — 모닝 브리핑
  src/bot/commands/analysis.ts — /분석 종목 심층 분석
  src/cron/morning-briefing.ts — 매일 자동 브리핑
```

## 패키지 추가
- trading-signals (RSI, MACD, BB, SMA/EMA)

## DB 마이그레이션
- HoldingStrategy, Watchlist 모델 추가

## 구현 순서
1. HoldingStrategy 모델 + 종목별 전략 태그
2. Watchlist 모델 + 텔레그램 CRUD
3. 기술적 분석 엔진 (yahoo-finance2 historical + trading-signals)
4. 전략별 맞춤 조언 로직
5. 모닝 브리핑 (cron + 텔레그램 발송)
6. 수동 종목 심층 분석 (/분석 커맨드)
7. 텔레그램 포맷 통합 개선 (HTML parse_mode)
