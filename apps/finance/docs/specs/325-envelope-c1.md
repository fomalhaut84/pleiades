# [Phase 27-C-1] Watchlist + Recurring + Settings + IncomeProfile envelope 마이그

## 목적

9차 마일스톤의 세 번째 단계 — 27-A 의 `ok` / `fail` / `noContent` 헬퍼를 **위험도 낮은 4개 도메인** (watchlist, recurring, settings, income-profiles) 의 POST/PUT/PATCH/DELETE + 일부 GET 에 적용. 27-C 의 5 sub-PR 중 첫 번째.

## 배경

- 27-B 에서 단순 GET 10 라우트 + 13 fetcher 마이그 완료
- 27-C 는 도메인별 5 sub-PR 로 분할 (계획 확정)
- C-1 은 **가장 단순한 4 도메인** — 패턴 검증 + 다음 sub-phase 의 기반

## 요구사항

- [ ] 7 라우트 파일의 모든 메소드 응답을 envelope 으로 마이그
  - `watchlist` POST + `watchlist/[id]` PUT/DELETE
  - `recurring` POST + `recurring/[id]` PUT/PATCH/DELETE
  - `alerts/config` GET/PUT
  - `settings/whooing` GET/PUT
  - `settings/whooing/mappings` GET/PUT
  - `income-profiles` POST + `income-profiles/[id]` PUT/DELETE
- [ ] 에러 응답도 `fail(message, status)` 로 통일
- [ ] 클라이언트 fetcher 가 envelope 형식에 맞춰 unwrap
- [ ] atomic (라우트 + fetcher 같은 PR)

## 기술 설계

### 1. 라우트 변환 패턴

| 케이스 | before | after |
|---|---|---|
| POST 성공 (201) | `NextResponse.json(item, { status: 201 })` | `ok(item, { status: 201 })` |
| PUT 성공 | `NextResponse.json(updated)` | `ok(updated)` |
| PATCH 성공 | `NextResponse.json({ id, isActive })` | `ok({ id, isActive })` |
| DELETE 성공 | `new NextResponse(null, { status: 204 })` | `noContent()` |
| GET 성공 | `NextResponse.json({ configs })` | `ok(configs)` |
| 에러 응답 | `NextResponse.json({ error }, { status: N })` | `fail(error, N)` |

### 2. 영향 라우트 (16 메소드 / 7 파일)

| 파일 | 메소드 | 응답 |
|---|---|---|
| `watchlist/route.ts` | POST | `ok(item, { status: 201 })` |
| `watchlist/[id]/route.ts` | PUT, DELETE | `ok(updated)`, `noContent()` |
| `recurring/route.ts` | POST | `ok(item, { status: 201 })` |
| `recurring/[id]/route.ts` | PUT, PATCH, DELETE | `ok(item)`, `ok({id, isActive})`, `noContent()` |
| `alerts/config/route.ts` | GET, PUT | `ok(configs)`, `ok(updated)` |
| `settings/whooing/route.ts` | GET, PUT | `ok({...})`, `ok({...})` |
| `settings/whooing/mappings/route.ts` | GET, PUT | `ok(mappings)`, `ok(updated)` |
| `income-profiles/route.ts` | POST | `ok(profile, { status: 201 })` |
| `income-profiles/[id]/route.ts` | PUT, DELETE | `ok(profile)`, `noContent()` |

### 3. 클라이언트 fetcher

POST/PUT/PATCH 응답 본문을 사용하는 곳만:
- `WatchlistForm`: POST/PUT 결과 — 사용 여부 확인 (대부분 `res.ok` 만 봄)
- `RecurringForm`: POST/PUT 결과
- `RecurringClient`: PATCH 결과 (`isActive` 토글)
- `IncomeProfileForm`: POST/PUT 결과
- `WhooingSettings`: GET 응답 사용 (이미 사용 중) + PUT 결과
- alerts/config 호출자

DELETE 호출자는 `res.ok` 만 보므로 변경 없음 (DELETE 인 만큼).
에러 응답 클라이언트 처리도 변경 없음 (envelope 의 `error` 필드 동일).

### 4. 추가 작업

- 모든 catch 블록의 `NextResponse.json({ error: ... }, { status: 500 })` → `fail(message, 500)`
- 비즈니스 에러 헬퍼 (`businessErrorResponse`) 사용처는 그대로 유지 (envelope 형식 호환 — 후속 검토)

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 추가 안 함 (27-A 헬퍼 검증으로 충분)
- 수동 회귀:
  - 관심종목 추가/수정/삭제
  - 반복 거래 추가/수정/일시정지/삭제
  - 후잉 설정 저장
  - 근로소득 프로필 추가/수정/삭제
  - 알림 설정 변경

## 제외 사항

- POST 응답 본문을 사용하지 않는 호출자는 unwrap 변경 불필요
- 같은 도메인의 단순 GET 은 27-B 에서 완료
- 다른 도메인 (category/budget/asset, dividend/deposit/transaction, rsu/stock-option, trade) — 27-C-2 ~ C-5
