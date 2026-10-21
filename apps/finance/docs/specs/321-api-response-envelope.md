# [Phase 27-A] ApiResponse envelope 인프라 구축

## 목적

9차 마일스톤의 첫 단계 — `ApiResponse<T>` 타입 + 헬퍼 (`ok`, `fail`, `paginated`) 신규 lib 구축. 라우트/클라이언트 마이그는 후속 sub-phase (27-B~D) 에서 진행.

이 PR 은 **호환성 100% 보장** — 인프라만 추가, 기존 라우트 변경 없음.

## 배경

- 25-E (API 응답 일관화) 후속: DELETE 204 / 비즈니스 에러 헬퍼는 완료, **성공 응답 형식** 은 라우트마다 불일치
- `.claude/rules/common/patterns.md` 의 권장 envelope 형식 미사용
- 점진 마이그 (53 라우트 + 40+ fetcher) 전 인프라 먼저

## 요구사항

- [ ] `src/lib/api-response.ts` 신규
  - `ApiResponse<T>` 타입
  - `ok<T>(data: T, { status?, meta? }?): NextResponse` (no-body status 자동 분기)
  - `noContent(status = 204): NextResponse` (204/205/304 전용)
  - `fail(error: string, status?): NextResponse`
  - `paginated<T>(data: T[], total: number, limit: number, offset: number, status?): NextResponse`
- [ ] 단위 테스트 (`__tests__/api-response.test.ts`)
- [ ] 라우트/클라이언트 변경 **없음** (호환 100%)

## 기술 설계

### 1. 타입

```ts
// src/lib/api-response.ts
import { NextResponse } from 'next/server'

export interface ApiResponseMeta {
  total: number
  limit: number
  offset: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: ApiResponseMeta
}
```

### 2. 헬퍼

```ts
export function ok<T>(data: T, init?: { status?: number; meta?: ApiResponseMeta }): NextResponse {
  const body: ApiResponse<T> = { success: true, data }
  if (init?.meta) body.meta = init.meta
  return NextResponse.json(body, { status: init?.status ?? 200 })
}

export function fail(error: string, status = 400): NextResponse {
  const body: ApiResponse<never> = { success: false, error }
  return NextResponse.json(body, { status })
}

export function paginated<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
  status = 200,
): NextResponse {
  return ok(data, { status, meta: { total, limit, offset } })
}
```

### 3. 시그니처 결정 이유

- `ok` 의 `status` 옵션 — 201 Created 같은 케이스 지원
- `fail` 의 status 기본 400 — 가장 흔한 클라이언트 오류
- `paginated` 은 `ok` 를 wrap — DRY
- `data: T` 직접 임베드 — `null` 도 허용 가능 (`ok<null>(null)` — DELETE 단계로 가능 case 대비)

### 4. 단위 테스트 케이스

- `ok(data)` → `{ success: true, data }` + status 200
- `ok(data, { status: 201 })` → status 201
- `ok(data, { meta })` → meta 포함
- `fail('error')` → `{ success: false, error }` + status 400
- `fail('error', 500)` → status 500
- `paginated([], 0, 10, 0)` → meta 포함 + status 200
- Content-Type `application/json`

## 호환성

- 기존 라우트 / 클라이언트 변경 **0건**
- 새 lib 만 추가
- 라우트 마이그는 27-B 부터 점진적

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 7~8 케이스
- 회귀 없음 (기존 145 테스트 + 신규 ~7)

## 제외 사항

- 라우트 마이그 (27-B/C/D)
- 클라이언트 fetcher 업데이트 (27-B/C 와 함께)
- 가이드 문서 (27-E)
- error code/타입 enum (필요 시 후속 phase)
- success: boolean 외 상세 status 필드 (KISS)
