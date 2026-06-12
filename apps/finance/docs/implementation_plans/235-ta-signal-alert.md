# 구현 계획: 전략 기반 TA 시그널 알림 (#235)

## 변경 파일 (3개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/bot/notifications/ta-signal-alert.ts` (신규) | 전략별 TA 시그널 체크 + 알림 함수 |
| 2 | `src/lib/cron.ts` | 시세 갱신 후 TA 시그널 체크 호출 추가 |
| 3 | `src/bot/standalone.ts` | (cron.ts 변경 시 자동 반영) |

## 구현 내용

1. ta-signal-alert.ts:
   - 스윙/모멘텀/단타 전략 종목 조회 (HoldingStrategy + Watchlist)
   - 각 종목 generateTAReport 호출
   - 전략별 시그널 조건 매칭
   - 알림 메시지 조립 + 발송
   - sentToday 중복 방지

2. cron.ts:
   - schedulePriceUpdates의 시세 갱신 후 checkTASignals 호출
   - 장중에만 실행 (기존 isKRMarketOpen/isUSMarketOpen 재사용)

## 패키지 추가: 없음
## DB 마이그레이션: 없음
