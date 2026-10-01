# 구현 계획: 거래 내역에서 반복거래 등록 (#206)

## 변경 파일 (3개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/components/expense/RecurringForm.tsx` | `RecurringPrefill` 인터페이스 export, `prefill` prop 추가, 초기값 분기 |
| 2 | `src/components/expense/TransactionTable.tsx` | `onRegisterRecurring` prop, "반복 등록" 버튼 추가 |
| 3 | `src/app/expenses/ExpensesClient.tsx` | `recurringPrefill` 상태, 핸들러, RecurringForm 렌더 |

## 구현 순서

1. RecurringForm에 prefill 지원 추가 (하위 컴포넌트 먼저)
2. TransactionTable에 반복 등록 버튼 추가
3. ExpensesClient에서 상태 연결

## 패키지 추가: 없음
## DB 마이그레이션: 없음
