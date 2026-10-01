# 구현 계획: 텔레그램 복수 가계부 입력 (#224)

## 변경 파일 (1개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/bot/commands/expense.ts` | 복수 건 AI 파싱 + 일괄 확인/저장 |

## 구현 내용

1. `handleExpenseInput`에서 `parseExpenseInput` 에러가 "금액이 모호합니다"인 경우 → `fireMultiExpenseParse(ctx, text)` 호출
2. `fireMultiExpenseParse`: askAdvisor로 복수 거래 파싱 프롬프트 전송
3. AI 응답(JSON 배열) 파싱 → 검증 → 각 건에 matchCategory
4. 일괄 확인 메시지 표시 (InlineKeyboard: 확인/취소)
5. 확인 시: prisma.transaction.createMany + 각 건 sendToWhooing
6. pendingMultiExpenses Map으로 상태 관리 (기존 pendingTransactions 패턴)

## 패키지 추가: 없음
## DB 마이그레이션: 없음
