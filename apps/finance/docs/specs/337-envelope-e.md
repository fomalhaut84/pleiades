# [Phase 27-E] envelope 가이드 문서 갱신

## 목적

27-A~D 에서 적용한 `ApiResponse<T>` envelope 패턴을 향후 신규 API 라우트 작성 시 자연스럽게 따를 수 있도록 `.claude/rules/api-routes.md` 와 `CLAUDE.md` 에 명시.

27 시리즈의 **마지막 단계**.

## 배경

- 27-A: ApiResponse 헬퍼 + 단위 테스트 완료
- 27-B: 단순 GET 라우트 마이그
- 27-C-1~5: POST/PUT/DELETE 마이그 (5 sub-PR)
- 27-D: pagination + 복잡한 GET + exports 에러 path
- → 모든 API 라우트가 envelope 화 완료. 가이드 문서만 남음.

## 요구사항

- [ ] `.claude/rules/api-routes.md` 갱신
  - 응답 envelope `ApiResponse<T>` 구조 명시
  - `ok` / `fail` / `noContent` / `paginated` 사용 패턴 + 예시
  - 에러 응답 컨벤션 (한국어 정적 메시지 + envelope `error` 필드)
  - `businessErrorResponse()` 헬퍼 사용처 (Trade 도메인 비즈니스 예외)
  - 파일 응답 (CSV/ICS) 의 예외 — 성공은 raw Response, 에러는 envelope
- [ ] `CLAUDE.md` 갱신
  - "Coding Conventions" 섹션에 envelope 사용 한 줄 추가

## 기술 설계

### api-routes.md 추가 섹션

```markdown
## 응답 envelope (ApiResponse<T>)

모든 API 응답은 `src/lib/api-response.ts` 의 헬퍼를 사용해 통일된 envelope 으로 반환.

### 응답 구조

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: { total, limit, offset }  // pagination 한정
}

### 헬퍼 사용

| 케이스 | 헬퍼 |
|---|---|
| 단순 성공 (200) | ok(data) |
| 생성 (201) | ok(data, { status: 201 }) |
| 본문 없음 (204/205/304) | noContent() |
| 페이지네이션 | paginated(arr, total, limit, offset) |
| 복합 데이터 + meta | ok({...}, { meta: { total, limit, offset } }) |
| 에러 | fail(error, status) |

### 예외 — 파일 응답
CSV/ICS 등 다운로드는 raw Response (csvResponse 등) 그대로.
**에러 path 만** fail() 적용.
```

### CLAUDE.md 한 줄

> API 응답: `@/lib/api-response` 의 `ok`/`fail`/`noContent`/`paginated` 사용. 모든 라우트는 envelope `{ success, data?, error?, meta? }` 형식.

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` — 문서 변경이라 영향 없을 것이나 형식 확인

## 제외 사항

- 신규 라우트 추가 / 기존 라우트 변경 — 27-A~D 에서 완료
