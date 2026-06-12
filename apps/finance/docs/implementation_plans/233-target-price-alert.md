# 구현 계획: 목표가 도달 알림 (#233)

## 변경 파일 (1개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/bot/notifications/price-alert.ts` | 목표가/손절가/매수구간 체크 추가 |

## 구현 내용

checkPriceAlerts 함수 내에서 기존 급등락 체크 후:
1. HoldingStrategy 조회 → targetPrice/stopLoss vs 현재가 비교
2. Watchlist 조회 → targetBuy/entryLow~entryHigh vs 현재가 비교
3. sentToday 중복 방지 (target:TICKER, zone:TICKER 키)

## 패키지 추가: 없음
## DB 마이그레이션: 없음
