# [Phase 27-C-3] Dividend + Deposit + Transaction envelope 마이그

## 목적

27-C 5 sub-PR 중 세 번째 — 자금 mutation 핵심 3 도메인 (dividends/deposits/transactions) 의 POST/PUT/DELETE + 분석/검색 GET 들을 envelope 으로 마이그. GET pagination (메인 list 라우트) 은 27-D 로 분리.

## 배경

- 27-C-1 (Watchlist/Recurring/Settings/IncomeProfile), 27-C-2 (Category/Budget/Asset) 완료
- 27-C-3 은 자금 mutation 도메인 — Form/EditPanel 가 많아 클라이언트 영향 검증 중요
- pagination GET (dividends/deposits/transactions list) 은 27-D 에서 별도

## 요구사항

- [ ] 9 라우트 파일 마이그
  - `dividends/route.ts` (POST), `dividends/[id]/route.ts` (PUT/DELETE), `dividends/summary/route.ts` (GET)
  - `deposits/route.ts` (POST), `deposits/[id]/route.ts` (PUT/DELETE)
  - `transactions/route.ts` (POST), `transactions/[id]/route.ts` (PUT/DELETE)
  - `transactions/analysis/route.ts` (GET), `transactions/suggest/route.ts` (GET)
- [ ] 메인 list GET (dividends/deposits/transactions) 은 27-D 별도
- [ ] 클라이언트 fetcher unwrap (응답 본문 사용처만)

## 기술 설계

### 1. 라우트 변환 (~15 메소드)

| 파일 | 메소드 | 변환 |
|---|---|---|
| `dividends/route.ts` | POST | `ok(dividend, { status: 201 })` (GET 은 27-D) |
| `dividends/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `dividends/summary/route.ts` | GET | `ok({ year, totalNetKRW, ... byAccount, byTicker, byMonth })` |
| `deposits/route.ts` | POST | `ok(deposit, { status: 201 })` (GET 은 27-D) |
| `deposits/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `transactions/route.ts` | POST | `ok(transaction, { status: 201 })` (GET 은 27-D) |
| `transactions/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `transactions/analysis/route.ts` | GET | `ok({ monthCompare, prevMonthSummary, trend })` |
| `transactions/suggest/route.ts` | GET | `ok(suggestions)` (배열) 또는 객체 |

### 2. 클라이언트 fetcher

대부분 Form/EditPanel/DeleteModal — `res.ok` 만 확인:
- DividendForm/EditPanel/DeleteModal — 응답 본문 미사용
- DepositForm/EditPanel/DeleteModal — 동일
- TransactionForm/DeleteModal — 동일

응답 본문 사용:
- DividendSummary 컴포넌트 (summary GET) — **확인 필요**
- 가계부 분석 페이지 (analysis GET) — **확인 필요**
- TransactionForm 카테고리 추천 (suggest GET) — **확인 필요**

### 3. 변환 패턴 (이전 sub-phase 동일)

| 케이스 | before | after |
|---|---|---|
| 성공 | `NextResponse.json(data)` | `ok(data)` |
| 201 | `NextResponse.json(data, { status: 201 })` | `ok(data, { status: 201 })` |
| 204 | `new NextResponse(null, { status: 204 })` | `noContent()` |
| 에러 | `NextResponse.json({ error }, { status })` | `fail(error, status)` |

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀:
  - 배당 등록/수정/삭제 + 배당 요약 페이지
  - 입금 등록/수정/삭제
  - 거래 등록/수정/삭제 + 분석/추천

## 제외 사항

- 메인 list GET (`/api/dividends`, `/api/deposits`, `/api/transactions`) — pagination 27-D 에서
- 다른 도메인 (rsu/stock-option/trade) — 27-C-4, C-5
