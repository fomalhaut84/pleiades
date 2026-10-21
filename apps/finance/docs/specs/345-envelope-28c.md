# [Phase 28-C] performance/* envelope 마이그

## 목적

10차 마일스톤 세 번째 sub-PR — 성과 지표 도메인 4 라우트 envelope 통일.

## 요구사항

- [ ] `performance/snapshots/route.ts` GET/POST → `ok`/`fail` (POST `{ results }` wrapper 제거)
- [ ] `performance/twr/route.ts` GET → `ok`/`fail`
- [ ] `performance/contribution/route.ts` GET → `ok`/`fail`
- [ ] `performance/benchmark/backfill/route.ts` POST → `ok({ results }, { status: 201 })` / `fail`
- [ ] 클라이언트 `PerformanceClient.tsx` 3개 GET fetcher unwrap

## 기술 설계

### 라우트

| 파일 | 메소드 | 변환 |
|---|---|---|
| `snapshots/route.ts` | GET | `ok({ snapshots, benchmark, benchmarkName })` |
| `snapshots/route.ts` | POST | `ok(results, { status: 201 })` (wrapper 제거 — 클라이언트 미사용) |
| `twr/route.ts` | GET | `ok(result)` |
| `contribution/route.ts` | GET | `ok(result)` |
| `benchmark/backfill/route.ts` | POST | `ok(results, { status: 201 })` (wrapper 제거 — 미사용) |

### 클라이언트 (`PerformanceClient.tsx`)

- `fetchSnapshots`: `const json = await res.json(); setSnapshotData(json?.data ?? null)`
- `fetchTWR`: 각 항목 `const json = await res.json(); return json?.data ?? { ...nullObj }`
- `fetchContribution`: `setContributionData(json?.data ?? null)`
- POST 2개 (`handleTriggerSnapshot`, `handleBackfill`): body 미사용 — 변경 없음

## 위험도

성과 지표 차트 데이터 영향 — fetcher unwrap 후 차트 컴포넌트가 받는 props 동일 구조 유지 확인 필수.

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀: `/performance` 페이지 — 계좌 선택 / period 변경 / 스냅샷 트리거 / backfill

## 제외 사항

- 다른 도메인 (28-D/E)
