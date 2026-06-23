# [Phase 28-A] accounts 라우트 envelope 마이그

## 목적

10차 마일스톤 (Phase 28: 잔여 16 라우트 envelope) 첫 sub-PR — accounts 도메인 2 라우트 envelope 통일.

## 배경

- 9차 (Phase 27) 에서 핵심 53+ 라우트 마이그 완료
- 10차 (Phase 28) 는 남은 16 라우트 정리 — 5 sub-PR (A~E)
- 28-A 는 가장 안전한 단순 CRUD (accounts) — 위험도 낮은 순 시작

## 요구사항

- [ ] `src/app/api/accounts/route.ts` GET 에러 path → `fail()` (성공은 이미 `ok()`)
- [ ] `src/app/api/accounts/[id]/route.ts` GET/PATCH → `ok` / `fail` 통일
- [ ] 클라이언트 검증 — SettingsClient (`json.data`) / AccountEditor (`data?.error`) 모두 이미 envelope 호환

## 기술 설계

### 변환 대상

| 파일 | 메소드 | 변환 |
|---|---|---|
| `accounts/route.ts` | GET (성공) | 이미 `ok()` — 미변경 |
| `accounts/route.ts` | GET 에러 (500) | `fail('계좌 목록을 불러올 수 없습니다.', 500)` |
| `accounts/[id]/route.ts` | GET (성공/404/500) | `ok(account)` / `fail('찾을 수 없습니다.', 404)` / `fail(..., 500)` |
| `accounts/[id]/route.ts` | PATCH (전 분기) | `ok(updated)` / `fail(msg, status)` |

### 클라이언트 영향 분석

- `src/app/settings/SettingsClient.tsx:36-37` — `json.data` 이미 사용 ✅
- `src/components/settings/AccountEditor.tsx:81-83` — `data?.error` 이미 envelope 호환 ✅
- 외부 consumer 없음 (server component 미사용)

→ 라우트만 바꿔도 클라이언트 영향 없음 (atomic).

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀:
  - `/settings` 계좌 탭 — 목록 로드 + 수정 정상

## 제외 사항

- 다른 도메인 (28-B~E) — 별도 sub-PR
- 신규 기능 없음
