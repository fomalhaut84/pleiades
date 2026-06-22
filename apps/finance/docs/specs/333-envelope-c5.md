# [Phase 27-C-5] Trade envelope 마이그

## 목적

27-C 5 sub-PR 중 마지막 — Trade 도메인의 mutation 라우트 (POST/PUT/DELETE) + 일괄 임포트 (POST) 를 envelope 으로 마이그.

거래 mutation 은 Holding 재계산 트랜잭션, USD/KRW 환율 검증, 이동평균법 평균단가 계산 등이 얽혀있어 27-C 의 영향도가 가장 높은 도메인. main list GET (`/api/trades?...`) 은 27-D pagination 정리와 함께 별도.

## 배경

- 27-C-1~4 완료 (Watchlist/Recurring/Settings/IncomeProfile · Category/Budget/Asset · Dividend/Deposit/Transaction · RSU/StockOption)
- 27-C-5 는 Trade — 거래 생성/수정/삭제 + 임포트 핵심 흐름
- pagination GET (`/api/trades`) 은 27-D 별도

## 요구사항

- [ ] 3 라우트 파일 마이그
  - `trades/route.ts` (POST) — GET 은 27-D 분리
  - `trades/[id]/route.ts` (PUT/DELETE)
  - `trades/import/route.ts` (POST — 일괄 임포트, `{ result }` 응답)
- [ ] 클라이언트 fetcher 응답 본문 사용처 unwrap
  - 거래 생성/수정 폼 — POST/PUT 결과 사용 여부 확인
  - 임포트 페이지 — `result` 객체 사용 (success/failed 카운트, 에러 목록 등)

## 기술 설계

### 1. 라우트 변환

| 파일 | 메소드 | 변환 |
|---|---|---|
| `trades/route.ts` | POST | `ok(result, { status: 201 })` |
| `trades/[id]/route.ts` | PUT, DELETE | `ok(result)`, `noContent()` |
| `trades/import/route.ts` | POST | `ok(result, { status: 201 })` (기존 `{ result }` → `result` 직접) |

### 2. 클라이언트 fetcher

확인 필요:
- `src/app/trades/new/` — 거래 생성 폼 (POST)
- `src/app/trades/` 의 EditModal/DeleteModal — PUT/DELETE
- `src/app/trades/import/` — bulk 임포트 결과 표시 (`result.success`, `result.failed`, `result.errors` 등)

### 3. 변환 패턴 (이전 sub-phase 동일)

| 케이스 | before | after |
|---|---|---|
| 성공 | `NextResponse.json(data)` | `ok(data)` |
| 201 | `NextResponse.json(data, { status: 201 })` | `ok(data, { status: 201 })` |
| 201 with wrap | `NextResponse.json({ result }, { status: 201 })` | `ok(result, { status: 201 })` |
| 204 | `new NextResponse(null, { status: 204 })` | `noContent()` |
| 에러 | `NextResponse.json({ error }, { status })` | `fail(error, status)` |

### 4. import 응답 wrapper 제거

기존 `{ result }` wrapper 는 envelope `data` 가 그 역할을 대신 — 클라이언트 fetcher 에서 `json.result` 대신 `json.data` 사용.

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀:
  - 거래 생성/수정/삭제 (USD/KRW 양쪽, BUY/SELL)
  - Holding 재계산 정합성
  - 일괄 임포트 (성공/실패 케이스)

## 제외 사항

- 메인 list GET (`/api/trades`) — 27-D
- 다른 도메인 (rsu/stock-option/transaction 등) — 27-C-1~4 완료
