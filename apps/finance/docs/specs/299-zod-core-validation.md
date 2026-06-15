# [Phase 25-F] 입력 검증 Zod 통합 (핵심 입력 경로)

## 목적

핵심 입력 경로 3개 (`trade-utils`, `dividend-utils`, `transaction-utils`) 의 `validate*Input` 헬퍼 내부를 Zod schema 기반으로 전환한다. 호출 측 시그니처 (`ValidationError[]` 반환) 는 유지해 API 라우트 코드는 무변경. 동시에 vitest 를 도입해 헬퍼 단위 테스트 + 25-E 에서 위임한 `api-errors` 테스트 빚을 청산한다.

## 배경

- 인라인 `typeof` / `Number.isFinite` / `includes` 검증이 헬퍼 3개에 흩어져 있다. 단일 진실 표현이 어려워 25-D 같이 검증 로직이 늘어날 때 회귀 위험이 커진다.
- Zod schema 는 의도 표현과 타입 추론을 동시에 제공한다. 글로벌 룰 (`coding-style.md` Input Validation 항) 권장 사항.
- 테스트 러너 부재 → 검증 로직 회귀가 자동 검출되지 않는다.

## 요구사항

- [ ] `zod` 런타임 의존성 추가
- [ ] `vitest` + `@vitest/coverage-v8` dev 의존성 추가
- [ ] `package.json` 스크립트: `test`, `test:run`, `test:coverage`
- [ ] `trade-utils.ts` 의 `validateTradeInput` 내부를 Zod schema 로 전환 (외부 시그니처 동일)
- [ ] `dividend-utils.ts` 의 `validateDividendInput` 동일 전환
- [ ] `transaction-utils.ts` 의 `validateTransactionInput` 동일 전환
- [ ] `src/lib/__tests__/api-errors.test.ts` 추가 (25-E 빚 청산)
- [ ] `src/lib/__tests__/trade-utils.test.ts` 추가 (Zod 전환된 schema 회귀 방지)
- [ ] `src/lib/__tests__/dividend-utils.test.ts` 추가
- [ ] `src/lib/__tests__/transaction-utils.test.ts` 추가
- [ ] `CLAUDE.md` 검증 순서에 `npm test` 추가

## 기술 설계

### 1. 어댑터 패턴

Zod 의 `ZodError` 를 기존 `ValidationError[]` 시그니처로 매핑하는 헬퍼를 `src/lib/zod-utils.ts` (신규) 에 둔다.

```ts
import { ZodError, ZodIssue } from 'zod'

export interface ValidationError {
  field: string
  message: string
}

export function zodErrorsToValidation(err: ZodError): ValidationError[] {
  return err.issues.map((issue: ZodIssue) => ({
    field: issue.path.join('.') || issue.path[0]?.toString() || '_',
    message: issue.message,
  }))
}
```

각 `validate*Input` 은 schema.safeParse(body) → 실패 시 어댑터, 성공 시 빈 배열.

### 2. trade-utils — Zod schema

```ts
const TradeInputSchema = z.object({
  accountId: z.string().min(1, '계좌를 선택해주세요.'),
  ticker: z.string().trim().min(1, '종목을 선택해주세요.'),
  displayName: z.string().trim().min(1, '종목명을 입력해주세요.'),
  market: z.enum(['US', 'KR'], { errorMap: () => ({ message: '시장을 선택해주세요 (US/KR).' }) }),
  type: z.enum(['BUY', 'SELL'], { errorMap: () => ({ message: '거래 유형을 선택해주세요 (BUY/SELL).' }) }),
  shares: z.number().int().positive().finite({ message: '수량은 1 이상의 정수여야 합니다.' }),
  price: z.number().positive().finite({ message: '단가는 0보다 큰 숫자여야 합니다.' }),
  currency: z.enum(['USD', 'KRW'], { errorMap: () => ({ message: '통화를 선택해주세요 (USD/KRW).' }) }),
  // fxRate / tradedAt 은 USD 분기 + validateTradedAt 헬퍼가 한국어 메시지로 통일 처리.
  // schema 단계 type-level 영문 메시지 ('Invalid input: expected number, received NaN' 등)
  // 가 사용자에게 노출되지 않도록 unknown 으로 받는다. CSV import 의 Number(...) → NaN 케이스 동일 경로.
  fxRate: z.unknown().optional(),
  tradedAt: z.unknown().optional(),
}).superRefine((data, ctx) => {
  if (data.currency === 'USD') {
    const e = validateFxRateForUSD(data.fxRate)
    if (e) ctx.addIssue({ code: 'custom', path: ['fxRate'], message: e })
  }
  if (data.market === 'US' && data.currency && data.currency !== 'USD') {
    ctx.addIssue({ code: 'custom', path: ['currency'], message: 'US 시장은 USD 통화만 가능합니다.' })
  }
  if (data.market === 'KR' && data.currency && data.currency !== 'KRW') {
    ctx.addIssue({ code: 'custom', path: ['currency'], message: 'KR 시장은 KRW 통화만 가능합니다.' })
  }
  const tradedAtError = validateTradedAt(data.tradedAt)
  if (tradedAtError) ctx.addIssue({ code: 'custom', path: ['tradedAt'], message: tradedAtError })
})
```

기존 헬퍼 `validateFxRateForUSD`, `validateTradedAt` 은 그대로 호출 — KST 캘린더 비교 같은 복잡한 도메인 로직은 함수형 유지가 더 명확.

### 3. dividend-utils — Zod schema

`validateTradeInput` 과 동일 패턴. `superRefine` 으로 currency==='USD' 환율 검증.

### 4. transaction-utils — Zod schema

`amount` 의 `≤ 2_147_483_647` 상한, `type` 의 transfer 유형 + linkedAssetId 의존 검증을 `superRefine` 으로 표현.

### 5. vitest 셋업

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
```

`vite-tsconfig-paths` 도 dev 의존성으로 추가 (`@/lib/...` alias 해소).

### 6. 단위 테스트 케이스 (요약)

- `api-errors.test.ts`:
  - 화이트리스트 매칭 (3 케이스)
  - 비매칭 (3 케이스: `'USD 거래에는 유효한 환율이 필요합니다.'`, `'random'`, `'이미 처리됨'`)
  - `businessErrorResponse` 의 NextResponse 반환 형식 (`status: 400`, `body.error`)
- `trade-utils.test.ts`:
  - 정상 케이스 (KRW BUY, USD BUY)
  - 각 필수 필드 누락
  - 음수/0 수량 / 음수 단가
  - USD 환율 0/NaN/null
  - market-currency 교차검증 위반
  - 미래 거래일 / 2000-01-01 미만
- `dividend-utils.test.ts`:
  - 정상 KRW / USD
  - 음수 amountGross / amountNet
  - USD 환율 검증
- `transaction-utils.test.ts`:
  - 정상 / amount=0 / amount > INT32 max
  - description 200자 초과
  - transfer_out 인데 linkedAssetId 누락
  - 잘못된 type 문자열

## 테스트 계획

- `npm run lint` / `npx tsc --noEmit` / `npm test` / `npm run build` 전부 통과
- 단위 테스트 커버리지 신규 헬퍼 90%+
- 거래 생성/배당 생성/가계부 거래 등록을 수동 회귀 (Zod 메시지가 그대로 사용자에게 노출되는지)

## 제외 사항

- `validateTradedAt`, `validateFxRateForUSD` 같은 필드 단위 헬퍼 — 함수형 유지 (PUT 부분 업데이트 경로에서 그대로 사용됨)
- budgets / categories / assets / watchlist / rsu / stock-options / deposits / income-profiles 라우트 — 별도 phase
- 클라이언트 폼 측 Zod 통합 (서버 single source of truth 우선)
- GET 쿼리 파라미터 Zod (`searchParams.get`) — 후속 phase
