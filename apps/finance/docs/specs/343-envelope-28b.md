# [Phase 28-B] networth + reports + tax/gift envelope 마이그

## 목적

10차 마일스톤 (Phase 28) 두 번째 sub-PR — 조회 + 리포트 도메인 4 라우트 envelope 통일.

## 요구사항

- [ ] `networth/route.ts` GET (200/500) → `ok` / `fail`
- [ ] `tax/gift/route.ts` GET (200/500) → `ok({ summaries })` / `fail` — 기존 wrapper `{ summaries }` 유지 (클라이언트 미사용이므로 자유)
- [ ] `reports/route.ts` GET/POST → `ok` / `fail` (POST 201 응답 wrapper 제거 가능)
- [ ] `reports/[id]/download/route.ts` — PDF 파일 응답이므로 27-D exports 패턴 (성공은 raw `NextResponse(buffer)`, 에러만 `fail()`)
- [ ] 클라이언트 fetcher unwrap
  - NetWorthClient: `setData(d.data ?? null)` + breakdown 가드
  - ReportsClient: POST 응답 본문 미사용 (`fetchReports()` 재호출만 — 안전), GET 은 이미 `d?.data` 호환

## 기술 설계

### 라우트 변환

| 파일 | 메소드 | 변환 |
|---|---|---|
| `networth/route.ts` | GET | 성공 → `ok({...})`, 500 → `fail(...)` |
| `tax/gift/route.ts` | GET | 성공 → `ok({ summaries })`, 500 → `fail(...)` |
| `reports/route.ts` | GET, POST | 성공 → `ok(data)` / `ok(payload, { status: 201 })`, 검증/500 → `fail(...)` |
| `reports/[id]/download/route.ts` | GET | 성공은 raw `NextResponse(buffer, { headers })` 유지 (PDF 다운로드), 404/500 → `fail()` |

### 클라이언트

- `NetWorthClient.tsx` — `if (d.breakdown)` → `if (d?.data?.breakdown)`, `setData(d)` → `setData(d.data)`
- `ReportsClient.tsx` — POST 후 `fetchReports()` 재호출만 — 영향 없음. POST 에러 `data.error` 는 envelope 호환

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀: `/networth`, `/reports` 페이지 + 리포트 생성/다운로드

## 제외 사항

- 다른 도메인 (28-C/D/E)
