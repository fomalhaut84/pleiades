# 구현 계획: 전략 종목 주기적 모니터링 (#239)

## 변경 파일 (3개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/bot/commands/alert.ts` | 모니터링주기 설정 커맨드 |
| 2 | `src/bot/notifications/ta-signal-alert.ts` | AI 가이드 추가 + 주기 체크 |
| 3 | `src/lib/cron.ts` | TA 체크 주기 DB 동적 조회 |

## 패키지 추가: 없음
## DB 마이그레이션: 없음 (AlertConfig 기존 키-값 테이블 활용)
