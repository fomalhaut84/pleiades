# [Phase 27-C-2] Category + Budget + Asset envelope 마이그

## 목적

27-C 5 sub-PR 중 두 번째 — 자금 분류 관련 3 도메인 (categories/category-groups, budgets, assets) 의 모든 메소드를 `ok`/`fail`/`noContent` 헬퍼로 마이그. budgets GET, assets GET 같은 GET/POST 짝 라우트도 함께 (응답 형식이 복잡해 atomic 변경 필수).

## 배경

- 27-C-1 (Watchlist/Recurring/Settings/IncomeProfile) 완료 (PR #326)
- 27-C-2 은 두 번째 sub-PR — 27-C-1 보다 약간 큰 규모 (9 라우트 + 7 fetcher)
- 카테고리 reorder (POST) 도 함께 envelope 화

## 요구사항

- [ ] 9 라우트 파일의 모든 메소드 응답을 envelope 으로
  - `categories` (POST) + `categories/[id]` (PUT/DELETE) + `categories/reorder` (POST)
  - `category-groups` (POST) + `category-groups/[id]` (PUT/DELETE)
  - `budgets` (GET/POST) + `budgets/[id]` (DELETE)
  - `assets` (GET/POST) + `assets/[id]` (PUT/DELETE)
- [ ] 에러 응답도 `fail()` 로 통일
- [ ] 클라이언트 fetcher 7개 unwrap
- [ ] atomic (라우트 + fetcher 같은 PR)

## 기술 설계

### 1. 라우트 변환 (16 메소드 / 9 파일)

| 파일 | 메소드 | 변환 |
|---|---|---|
| `categories/route.ts` | POST | `ok(category, { status: 201 })` |
| `categories/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `categories/reorder/route.ts` | POST | `noContent()` (이미 204 응답) |
| `category-groups/route.ts` | POST | `ok(group, { status: 201 })` |
| `category-groups/[id]/route.ts` | PUT, DELETE | `ok(group)`, `noContent()` |
| `budgets/route.ts` | GET | `ok({ year, month, totalBudget, ... })` |
| `budgets/route.ts` | POST (upsert) | `ok(budget, { status: created ? 201 : 200 })` |
| `budgets/route.ts` (copy 액션) | POST | `ok({ copied, targetYear, targetMonth })` |
| `budgets/[id]/route.ts` | DELETE | `noContent()` |
| `assets/route.ts` | GET | `ok({ assets, totalAssets, totalLiabilities, netAssets })` |
| `assets/route.ts` | POST | `ok(asset, { status: 201 })` |
| `assets/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |

### 2. 클라이언트 fetcher unwrap (7개)

- `CategoryForm` (POST), `CategoryEditPanel` (PUT) — 응답 본문 미사용 → 변경 없음
- `CategoryDeleteModal` (DELETE) → 변경 없음
- `CategoryTable` (reorder POST) — `res.ok` 만 → 변경 없음
- `BudgetManager` (GET 응답 본문 사용 — 복잡) — **변경 필요**
- `BudgetManager` (POST upsert + copy 응답) — 본문 사용 여부 확인
- `AssetForm` (POST/PUT 응답) — 본문 사용 여부 확인
- `AssetDeleteModal` (DELETE) → 변경 없음
- 서버 컴포넌트가 `/api/assets` GET 직접 호출하지 않는지 (prisma 사용 권장)

### 3. 변환 패턴 (27-C-1 동일)

| 케이스 | before | after |
|---|---|---|
| 성공 | `NextResponse.json(data)` | `ok(data)` |
| 201 | `NextResponse.json(data, { status: 201 })` | `ok(data, { status: 201 })` |
| 204 | `new NextResponse(null, { status: 204 })` | `noContent()` |
| 에러 | `NextResponse.json({ error }, { status })` | `fail(error, status)` |

### 4. 다중 필드 에러

`{ error: errors[0].message, errors }` 패턴 (categories POST, budgets POST 등) → `fail(errors[0].message, 400)`. 클라이언트가 `errors` 배열 미사용 (27-C-1 grep 확인됨).

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀:
  - 카테고리 추가/수정/삭제/순서 변경
  - 카테고리 그룹 추가/수정/삭제
  - 예산 페이지 조회, 추가, 삭제, 월별 복사
  - 자산 페이지 조회, 추가, 수정, 삭제

## 제외 사항

- 같은 도메인의 단순 GET 은 27-B 에서 완료 (`/api/categories` GET, `/api/category-groups` GET)
- 다른 도메인 (dividend/deposit/transaction, rsu/stock-option, trade) — 27-C-3/4/5
- pagination 라우트 (trades/deposits/dividends/transactions) — 27-D
