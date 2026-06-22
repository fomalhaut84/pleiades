# [Phase 27-C-4] RSU + StockOption envelope 마이그

## 목적

27-C 5 sub-PR 중 네 번째 — RSU 스케줄 + 스톡옵션 도메인의 mutation/베스팅 처리 라우트들을 envelope 으로 마이그.

GET (`/api/rsu`, `/api/stock-options`) 은 27-B 에서 이미 envelope 적용 완료 — 본 PR 은 mutation + 베스팅 vest/exercise 경로만 정리.

## 배경

- 27-C-1 (Watchlist/Recurring/Settings/IncomeProfile), 27-C-2 (Category/Budget/Asset), 27-C-3 (Dividend/Deposit/Transaction) 완료
- 27-C-4 는 권리행사 흐름이 포함된 도메인 — vesting status 전이, exercise 처리 등 동시성 안전성도 함께 확인
- pagination GET 가 없어 27-D 분리 불필요

## 요구사항

- [ ] 7 라우트 파일 마이그
  - `rsu/route.ts` (POST)
  - `rsu/[id]/route.ts` (PUT/DELETE)
  - `rsu/[id]/vest/route.ts` (POST)
  - `stock-options/route.ts` (POST)
  - `stock-options/[id]/route.ts` (PUT/DELETE)
  - `stock-options/[id]/vestings/route.ts` (POST)
  - `stock-options/[id]/vestings/[vid]/route.ts` (PUT/PATCH/DELETE)
- [ ] 두 도메인의 GET 라우트 에러 path 만 추가 정리 (`fail()` 통일)
- [ ] 클라이언트 fetcher: `/rsu`, `/stock-options`, `/vesting` 페이지 응답 본문 사용처 unwrap

## 기술 설계

### 1. 라우트 변환

| 파일 | 메소드 | 변환 |
|---|---|---|
| `rsu/route.ts` | POST | `ok(schedule, { status: 201 })` |
| `rsu/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `rsu/[id]/vest/route.ts` | POST | `ok(result)` |
| `stock-options/route.ts` | POST | `ok(option, { status: 201 })` |
| `stock-options/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `stock-options/[id]/vestings/route.ts` | POST | `ok(vesting, { status: 201 })` |
| `stock-options/[id]/vestings/[vid]/route.ts` | PUT, PATCH, DELETE | `ok(updated)`, `noContent()` |

### 2. 클라이언트 fetcher

확인 필요:
- `/rsu` 페이지 — RSU 목록 + CRUD 폼
- `/stock-options` 페이지 — 스톡옵션 목록 + 베스팅 행사
- `/vesting` 캘린더 — RSU + 스톡옵션 통합 뷰

PATCH (vesting status 전이) 응답 body 사용 여부 특히 확인.

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
  - RSU 스케줄 등록/수정/삭제 + 베스팅 처리
  - 스톡옵션 등록/수정/삭제
  - 베스팅 스케줄 추가/수정/상태 변경/삭제
  - 베스팅 캘린더 뷰

## 제외 사항

- 메인 GET (`/api/rsu`, `/api/stock-options`) — 27-B 에서 이미 envelope
- 다른 도메인 (trade) — 27-C-5
