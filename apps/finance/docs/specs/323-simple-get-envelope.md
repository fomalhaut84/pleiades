# [Phase 27-B] 단순 GET 라우트 ApiResponse envelope 마이그

## 목적

9차 마일스톤의 두 번째 단계 — 27-A 에서 도입한 `ok()`/`fail()` 헬퍼를 **단순 GET 라우트 10개** + 클라이언트 fetcher 13개에 적용. pagination 가진 라우트는 27-D, GET/PUT 짝은 27-C 로 별도 진행.

## 배경

- 27-A: `ApiResponse<T>` 헬퍼 인프라 구축 완료 (162 단위 테스트)
- 현재 라우트별 응답 형식이 제각각 (`{ accounts }`, `{ items: [] }`, raw array 등)
- 점진 마이그 — breaking change 라 같은 PR 에 라우트 + fetcher 동시 변경 필수

## 요구사항

- [ ] 10 GET 라우트 응답 형식을 `ok(data)` 로 통일
- [ ] 13 클라이언트 fetcher 가 `json.data` 로 unwrap
- [ ] 라우트와 fetcher 동시 변경 (atomic — breaking change 회피)
- [ ] 다른 메소드 (POST/PUT/DELETE) 는 변경 없음 (도메인별로 27-C 에서 진행)

## 기술 설계

### 1. 마이그 대상 라우트 / 변환

| # | 라우트 | before | after |
|---|---|---|---|
| 1 | `/api/accounts` | `NextResponse.json({ accounts })` | `ok(accounts)` |
| 2 | `/api/prices` | `NextResponse.json({ prices, lastUpdatedAt })` | `ok({ prices, lastUpdatedAt })` |
| 3 | `/api/categories` | `NextResponse.json({ categories })` | `ok(categories)` |
| 4 | `/api/watchlist` | `NextResponse.json({ items })` | `ok(items)` |
| 5 | `/api/recurring` | `NextResponse.json({ items })` | `ok(items)` |
| 6 | `/api/reports` | `NextResponse.json({ reports })` | `ok(reports)` |
| 7 | `/api/category-groups` | `NextResponse.json({ groups })` | `ok(groups)` |
| 8 | `/api/income-profiles` | `NextResponse.json(profiles)` (raw) | `ok(profiles)` |
| 9 | `/api/rsu` | `NextResponse.json({ schedules })` | `ok(schedules)` |
| 10 | `/api/stock-options` | `NextResponse.json({ stockOptions })` | `ok(stockOptions)` |

에러 응답은 그대로 (`fail()` 마이그는 27-C 와 함께 — POST/PUT 의 catch 와 일관 정리).

### 2. 클라이언트 fetcher 패턴 변환

```ts
// before
const res = await fetch('/api/accounts')
const data = await res.json()
setAccounts(data.accounts)

// after
const res = await fetch('/api/accounts')
const json = await res.json()
setAccounts(json.data)
```

### 3. 영향 받는 클라이언트 파일 (8개 추정)

- `SettingsClient.tsx` — `/api/accounts`
- `TradeForm.tsx`, `DividendForm.tsx` — `/api/prices`
- `ExpensesClient.tsx`, `BudgetsClient.tsx`, `WhooingSettings.tsx` — `/api/categories`
- `WatchlistClient.tsx` — `/api/watchlist`
- `RecurringClient.tsx` — `/api/recurring`
- `ReportsClient.tsx` — `/api/reports`
- `CategoryEditPanel.tsx` — `/api/category-groups`
- `IncomeProfileManager.tsx` — `/api/income-profiles`
- `RSUDashboard.tsx` — `/api/rsu`

### 4. 봇 MCP / 서버컴포넌트 영향

- 봇 standalone 은 prisma 직접 호출 — 라우트 fetch 안 함 (영향 0)
- MCP 서버는 자체 prisma 호출 (영향 0)
- 서버 컴포넌트는 prisma 직접 호출 (영향 0)

→ 영향은 클라이언트 컴포넌트만.

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 추가 안 함 (27-A 의 ApiResponse 테스트가 헬퍼 자체 검증)
- 수동 회귀:
  - 10 라우트가 접근하는 화면 정상 표시
  - 각 페이지 새로고침 후 fetcher 정상 동작
  - 에러 케이스 (인증 미통과 등) — 기존 동작 유지

## 제외 사항

- 동일 라우트의 POST/PUT/DELETE 응답 (27-C 와 함께)
- 에러 응답 (`fail()` 마이그) — 27-C 와 함께
- pagination GET (trades/deposits/dividends/transactions) — 27-D
- GET/PUT 짝 라우트 (alerts/config, settings/whooing 등) — 27-C
- CSV/ICS/PDF 응답 — 영구 스킵 (envelope 불가)

## 호환성

- 라우트와 fetcher 같은 PR 에 묶어 atomic 마이그
- 다른 라우트는 영향 0 (점진)
