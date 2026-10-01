# 구현 계획: 텔레그램 소비/수입 입력 시 후잉 웹훅 전송 누락 수정 (#200)

## 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/bot/commands/expense.ts` | 수정 | `sendToWhooing` import + 호출 추가 |

## 구현 순서

1. `sendToWhooing` import 추가
2. `createTransaction()` 내 `prisma.transaction.create` 직후에 별도 try-catch로 `sendToWhooing()` 호출

## 패키지 추가

없음

## DB 마이그레이션

없음
