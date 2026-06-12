# 텔레그램 소비/수입 입력 → 후잉 웹훅 전송 누락 수정

## 목적

텔레그램 봇에서 소비/수입 입력 시 후잉(Whooing) 웹훅 전송이 누락되는 버그를 수정한다.

## 현상

- 웹 API POST (`src/app/api/transactions/route.ts` L288-298): 정상 전송
- cron 반복거래 (`src/lib/cron.ts` L231-241): 정상 전송
- **텔레그램 봇 (`src/bot/commands/expense.ts` L262-309): 미호출** ← 버그

## 요구사항

- [ ] `createTransaction()` 내 `prisma.transaction.create` 이후 `sendToWhooing()` 호출 추가
- [ ] 웹 API POST와 동일한 패턴 (실패해도 거래 기록에 영향 없음)
- [ ] expense/income 모두 전송
- [ ] 후잉 비활성화 상태에서 에러 없이 정상 동작
- [ ] lint + typecheck + build 통과

## 기술 설계

### 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/bot/commands/expense.ts` | 수정 | `sendToWhooing` import + 호출 추가 |

### 수정 내용

`createTransaction()` 내 `prisma.transaction.create` 이후, 예산 체크 이전에 추가:

```typescript
import { sendToWhooing } from '@/lib/whooing-webhook'

// prisma.transaction.create 이후 추가:
sendToWhooing({
  amount: pending.amount,
  description: pending.description,
  categoryId: pending.categoryId,
  transactedAt: new Date(),
}).catch((err) => console.error('[bot/expense] 후잉 전송 실패:', err))
```

- `.catch()`로 감싸서 후잉 실패가 거래 기록에 영향 없도록 처리
- 웹 API의 try-catch 패턴과 동일한 동작

## 테스트 계획

- [ ] 텔레그램에서 소비 입력 → 거래 기록 + 후잉 전송 확인
- [ ] 텔레그램에서 수입 입력 → 거래 기록 + 후잉 전송 확인
- [ ] 후잉 비활성화 상태 → 에러 없이 거래 기록 정상
- [ ] lint + typecheck + build 통과

## 제외 사항

- 거래 수정(PUT)/삭제(DELETE) 시 후잉 반영은 별도 이슈로 분리
