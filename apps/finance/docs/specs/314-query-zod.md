# [Phase 26-C] GET 쿼리 파라미터 Zod 검증

## 목적

`src/app/api/**/route.ts` GET 핸들러의 query parameter 파싱을 Zod schema 기반으로 일관화. 25-F 의 인프라(`zod-utils`, `api-errors`) 를 활용해 정수 오버플로우, 음수, 무효 enum, 날짜 범위 모순 등 잠재 버그 차단.

## 배경

21개 GET 라우트 중:
- **HIGH risk 3곳**: `parseInt(limit/offset)` 후 오버플로우/음수/실수 미검증 (trades, deposits, dividends)
- **MEDIUM risk 5곳**: year/month, date range 부분 검증 (budgets, transactions/analysis, exports/*, performance/snapshots, dividends/summary)
- **LOW risk 13곳**: enum/regex/FK 의존 — 스킵

검증 누락 사례:
```ts
// 현재
const rawLimit = parseInt(searchParams.get('limit') ?? '50')
const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200)
// → parseInt('99999999999') = 99999999999 (오버플로우)
// → parseInt('1.99') = 1 (실수 암묵 변환)
// → parseInt('-100') 일부 라우트만 차단
```

## 요구사항

- [ ] `src/lib/zod-schemas/` 디렉터리 신규
  - `pagination.ts` — `paginationSchema` (limit, offset)
  - `temporal.ts` — `yearSchema`, `monthSchema`, `dateRangeSchema`
  - `index.ts` — re-export
- [ ] 8개 GET 라우트에 Zod 검증 적용:
  - `/api/trades` (limit/offset + from/to)
  - `/api/deposits` (limit/offset + year)
  - `/api/dividends` (limit/offset)
  - `/api/dividends/summary` (year)
  - `/api/budgets` (year/month)
  - `/api/transactions/analysis` (year/month)
  - `/api/exports/trades`, `/exports/dividends`, `/exports/deposits` (year)
  - `/api/performance/snapshots` (from/to)
- [ ] 단위 테스트 (~30 케이스)
- [ ] 검증 실패 시 일관된 `{ error: string }` + 400 응답

## 기술 설계

### 1. 공통 schema

```ts
// src/lib/zod-schemas/pagination.ts
import { z } from 'zod'

export const paginationSchema = z.object({
  limit: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null || v === '' ? 50 : Number(v)))
    .pipe(z.number().int().min(1).max(500)),
  offset: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null || v === '' ? 0 : Number(v)))
    .pipe(z.number().int().nonnegative().max(1_000_000)),
})

// src/lib/zod-schemas/temporal.ts
export const yearSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === '' ? undefined : Number(v)))
  .pipe(z.number().int().min(2000).max(2100).optional())

export const monthSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === '' ? undefined : Number(v)))
  .pipe(z.number().int().min(1).max(12).optional())

// from > to 같은 의미 검증은 라우트 책임 (inclusive-day, timezone offset 처리가 라우트마다 다름).
// schema 단계에서는 parse 가능 여부만 검증.
export const dateRangeSchema = z
  .object({
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.from && isNaN(Date.parse(d.from))) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: '유효한 시작일을 입력해주세요.' })
    }
    if (d.to && isNaN(Date.parse(d.to))) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: '유효한 종료일을 입력해주세요.' })
    }
  })
```

### 2. 라우트 적용 패턴

```ts
import { paginationSchema } from '@/lib/zod-schemas'
import { zodErrorsToValidation } from '@/lib/zod-utils'

const paginationResult = paginationSchema.safeParse({
  limit: searchParams.get('limit'),
  offset: searchParams.get('offset'),
})
if (!paginationResult.success) {
  const errs = zodErrorsToValidation(paginationResult.error)
  return NextResponse.json({ error: errs[0].message, errors: errs }, { status: 400 })
}
const { limit, offset } = paginationResult.data
```

기존 인라인 `parseInt` 보일러플레이트 ~5줄 → 4줄 schema 호출로 통일.

### 3. 회귀 방지 — 기본값 보존

각 schema 의 default 값을 기존 라우트와 동일하게 맞춤:
- limit: 50 (기존)
- offset: 0 (기존)
- year/month: undefined → 라우트별 처리 유지

### 4. 단위 테스트 (`__tests__/zod-schemas.test.ts`)

- pagination:
  - 정상 (limit=20, offset=10)
  - 기본값 (null, '')
  - 오버플로우 (limit=600) → error
  - 음수 (offset=-1) → error
  - 실수 (limit=10.5) → error
  - 문자열 (limit='abc') → error
- year/month:
  - 정상 / undefined / 범위 외 / 비숫자
- dateRange:
  - 정상 / from 누락 / to 누락 / 무효 from / from > to (refine)

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 신규 ~30 케이스 (총 ~125)
- 수동 회귀:
  - 거래/배당/입금 페이지 정상 동작
  - URL 직접 호출 (예: `?limit=99999999`) → 400 응답
  - export 다운로드 정상 동작

## 제외 사항

- POST/PUT body 검증 (25-F 에서 핵심 3종 완료. 후속 phase)
- 단순 string get (UUID/FK 의존, 13개 라우트) — 추가 안전 효과 미미
- searchParams 의 generic 타입 안전 래퍼 (`getTypedSearchParams<T>`) — 미래 phase 후보
- POST/PUT 의 query string (대부분 미사용)
