# [Phase 26-A] Prisma TransactionClient 타입 정리

## 목적

`src/app/api/trades/[id]/route.ts` 의 helper `recalcHoldingFromTrades` 가 `tx` 파라미터를 `Parameters<Parameters<typeof prisma.$transaction>[0]>[0]` 라는 우회 패턴으로 받고 있다. Prisma `$transaction` 의 오버로드 시그니처에서 추출하는 형태라 가독성 저하 + 도구가 잘못 해석할 여지가 있음 (실제 Codex 가 false positive P1 으로 잡은 사례). `Prisma.TransactionClient` 로 교체해 의도 명확화.

## 배경

- `tsc --noEmit` 는 통과 (현 패턴이 의미상 같은 타입을 추출)
- Codex 자동 리뷰가 `TS2344` / `tx is never` false positive 를 반복적으로 잡음
- Prisma 가 공식적으로 export 하는 `Prisma.TransactionClient` 직접 사용이 표준

## 요구사항

- [ ] `src/app/api/trades/[id]/route.ts`
  - `Prisma` 타입 import 추가 (`import { Prisma } from '@prisma/client'`)
  - `recalcHoldingFromTrades` 의 `tx` 파라미터 타입을 `Prisma.TransactionClient` 로 변경
- [ ] `tsc --noEmit` + `vitest` + `next build` 회귀 없음

## 기술 설계

```ts
// before
async function recalcHoldingFromTrades(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ...
)

// after
import { Prisma } from '@prisma/client'

async function recalcHoldingFromTrades(
  tx: Prisma.TransactionClient,
  ...
)
```

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 거래 수정/삭제 흐름 수동 회귀 (PUT/DELETE 모두 동일 helper 호출)

## 제외 사항

- 다른 `$transaction` 사용처는 모두 인라인 콜백이라 자동 추론 — 변경 불필요
- helper 함수가 추가될 때마다 동일 패턴 따르도록 신규 코드 가이드는 별도 phase 에서 다룸 (필요 시)
