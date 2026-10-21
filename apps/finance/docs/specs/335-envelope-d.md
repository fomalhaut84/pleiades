# [Phase 27-D] Pagination + 복잡한 GET envelope 마이그

## 목적

27 envelope 시리즈의 GET 라우트 마무리 — pagination 메타데이터를 envelope `meta` 로 통일하고, 복잡한 집계 GET (transactions) 및 파일 export GET 의 에러 path 까지 envelope 으로 통일.

## 배경

- 27-A (헬퍼), 27-B (단순 GET), 27-C-1~5 (mutation) 완료
- 27-D 는 남은 list GET + exports/* 에러 path 정리. 본 PR 종료 시 27 시리즈의 GET 영역 마무리.
- 27-E (가이드 문서) 만 남음

## 요구사항

- [ ] 4 list GET → `paginated()` / `ok({data,...}, {meta})`
  - `trades/route.ts` GET — `{ trades, total, limit, offset }` → `paginated(trades, total, limit, offset)`
  - `dividends/route.ts` GET — 동일 패턴
  - `deposits/route.ts` GET — 동일 패턴
  - `transactions/route.ts` GET — **복잡**: `{ transactions, summary, byMonth, byCategory, year, total, offset, limit }` → `ok({ transactions, summary, byMonth, byCategory, year }, { meta: { total, limit, offset } })`
- [ ] 4 exports GET 에러 path → `fail()`
  - `exports/trades/route.ts`
  - `exports/deposits/route.ts`
  - `exports/dividends/route.ts`
  - `exports/vesting.ics/route.ts`
- [ ] 클라이언트 unwrap
  - `ExpensesClient.tsx` — transactions GET 응답 reshape

## 기술 설계

### 1. paginated() 적용 (단순 3개)

```ts
// before
return NextResponse.json({ trades, total, limit, offset })

// after
return paginated(trades, total, limit, offset)
// → { success: true, data: trades, meta: { total, limit, offset } }
```

→ 서버 컴포넌트만 prisma 직접 사용 (`src/app/trades/page.tsx` 등) — 클라이언트 fetcher 영향 없음.

### 2. transactions GET (복잡)

기존 응답 (listOnly 모드 vs 전체 모드 분기):
```ts
// listOnly 모드
{ transactions, total, offset, limit, year }
// 전체 모드
{ transactions, total, offset, limit, summary, byMonth, byCategory, year }
```

envelope 변환:
```ts
return ok(
  { transactions: serialized, year, ...(listOnly ? {} : { summary, byMonth, byCategory }) },
  { meta: { total, limit, offset } },
)
```

→ ExpensesClient.tsx 의 3 fetcher 모두 `json.transactions` → `json.data.transactions`, `json.total` → `json.meta.total`, `json.limit` → `json.meta.limit` 등으로 reshape.

### 3. exports/* 에러 path

성공 path 는 CSV/ICS 파일 응답 (`csvResponse` 등) — envelope 미적용.
에러 path 만 `fail()` 로 통일:

```ts
// before
return NextResponse.json({ error: errs[0].message, errors: errs }, { status: 400 })

// after
return fail(errs[0].message, 400)
```

### 4. 변환 패턴

| 케이스 | before | after |
|---|---|---|
| paginated GET | `NextResponse.json({ [key], total, limit, offset })` | `paginated(arr, total, limit, offset)` |
| 복잡 paginated | `NextResponse.json({ ..., total, limit, offset })` | `ok({...rest}, { meta: { total, limit, offset } })` |
| 에러 | `NextResponse.json({ error }, { status })` | `fail(error, status)` |

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀:
  - 거래/배당/입금 페이지 (서버 컴포넌트 — 영향 없음 예상)
  - 가계부 페이지 (`/expenses`) 필터/페이지 이동/요약 카드 정상 동작
  - CSV 내보내기 정상 다운로드, 잘못된 year 입력 시 에러 메시지

## 제외 사항

- 27-E (가이드 문서 갱신) — 별도 PR
- mutation 라우트 (27-C-1~5 완료)
- 파일 응답 자체 (CSV/ICS body) — Content-Disposition 기반, envelope 미적용
