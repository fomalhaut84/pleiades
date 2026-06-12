# 구현 계획: 거래시간 기반 변동 알림 필터링 (#261)

## 변경 파일 (3개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/lib/market-hours.ts` (신규) | cron.ts에서 isKRMarketOpen/isUSMarketOpen 이동 |
| 2 | `src/lib/cron.ts` | market-hours.ts import로 변경 |
| 3 | `src/bot/notifications/price-alert.ts` | 보유 종목 조회에 market 포함 + 급등락 체크 시 시장별 거래시간 가드 |

## 구현 순서

1. market-hours.ts 신규 생성, 함수 이동
2. cron.ts 기존 함수 제거 + import
3. price-alert.ts에서 holding 조회 시 market 포함, 체크 루프에 거래시간 가드

## 패키지/DB 변경: 없음

## 로드맵 업데이트

`docs/roadmap.md` "기타 개선" 섹션에 체크된 항목으로 추가 후 완료 처리.
