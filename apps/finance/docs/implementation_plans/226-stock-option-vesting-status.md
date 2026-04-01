# 구현 계획: 스톡옵션 베스팅 상태 관리 (#226)

## 변경 파일 (4개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/lib/cron.ts` | scheduleVestingStatusUpdate 함수 추가 |
| 2 | `src/bot/standalone.ts` | scheduleVestingStatusUpdate 호출 추가 |
| 3 | `src/app/api/stock-options/[id]/vestings/[vestingId]/route.ts` (신규) | PATCH API |
| 4 | `src/components/stock-option/StockOptionDashboard.tsx` | 상태 변경 버튼 추가 |

## 구현 순서

1. cron 자동 전환 로직 (pending→exercisable, 만료→expired)
2. PATCH API (exercisable→exercised + exercisedShares 업데이트)
3. 웹 UI 버튼

## 패키지 추가: 없음
## DB 마이그레이션: 없음
