# [Phase 25-E] API 응답 형식 일관화

## 목적

`src/app/api/**/route.ts` 의 응답 형식 불일치를 즉시 효과 있는 두 가지에 집중해 해소한다. envelope 통일 같은 대형 마이그레이션은 별도 후속 작업으로 분리.

## 배경

- DELETE 핸들러가 `{ success: true }` 와 `204 No Content` 두 가지로 갈려있어 클라이언트 측 처리 패턴이 흐트러진다.
- `src/app/api/trades/*` 라우트들은 catch 블록에서 `error.message` 를 그대로 노출한다. 현재는 비즈니스 예외(`보유 수량 부족`, `초과합니다`)만 던지므로 사고는 없지만, 새로운 예외 경로가 추가되면 내부 메시지가 사용자에게 노출될 위험이 있다.

## 요구사항

- [ ] **DELETE 응답 통일**: 모든 DELETE 핸들러가 `new NextResponse(null, { status: 204 })` 또는 동등한 빈 204 응답으로 반환.
- [ ] **에러 메시지 안전 필터**: `error.message` 노출 경로에 화이트리스트 통과 검사를 추가. 통과 못한 메시지는 `'서버 오류가 발생했습니다.'` 로 대체.
- [ ] **CLAUDE.md/api-routes.md 규칙 보강**: DELETE = 204, 화이트리스트 패턴 명문화.

## 기술 설계

### 1. DELETE 응답 통일

다음 7개 라우트의 DELETE 핸들러를 204로 통일한다.

| 파일 | 현재 | 변경 후 |
|---|---|---|
| `src/app/api/trades/[id]/route.ts` | `NextResponse.json({ success: true })` | `new NextResponse(null, { status: 204 })` |
| `src/app/api/categories/[id]/route.ts` | 동일 | 동일 |
| `src/app/api/assets/[id]/route.ts` | 동일 | 동일 |
| `src/app/api/dividends/[id]/route.ts` | 동일 | 동일 |
| `src/app/api/deposits/[id]/route.ts` | 동일 | 동일 |
| `src/app/api/income-profiles/[id]/route.ts` | 동일 | 동일 |
| `src/app/api/categories/reorder/route.ts` | 동일 | 동일 |

클라이언트 사이드 점검:
- 모든 DELETE 호출자는 `res.ok` 만 확인하고 성공 본문을 파싱하지 않음을 확인했다. body 파싱은 에러 경로에서만 일어난다. 변경 안전.

### 2. 에러 메시지 안전 필터

`src/lib/api-errors.ts` (신규) 에 화이트리스트 헬퍼 한 쌍을 둔다. 패턴은 실제로 `throw` 되는 비즈니스 메시지만 정확히 잠그도록 종단까지 명시한다.

```ts
const SAFE_BUSINESS_PATTERNS: ReadonlyArray<(msg: string) => boolean> = [
  (m) => m.startsWith('보유 수량 부족'),                                  // recalcHolding
  (m) => m.includes('보유 수량(') && m.includes('초과합니다'),             // createTrade
  (m) => m.includes('이미 ') && m.includes('등록되어 있'),                 // createTrade (티커 충돌)
]

export function isSafeBusinessError(err: unknown): err is Error {
  return err instanceof Error && SAFE_BUSINESS_PATTERNS.some((p) => p(err.message))
}

export function businessErrorResponse(err: unknown): NextResponse | null {
  if (!isSafeBusinessError(err)) return null
  return NextResponse.json({ error: err.message }, { status: 400 })
}
```

적용 라우트(3개):
- `src/app/api/trades/route.ts` POST catch → `businessErrorResponse(err) ?? '거래 기록에 실패했습니다.'`
- `src/app/api/trades/[id]/route.ts` PUT catch → 동일 패턴
- `src/app/api/trades/[id]/route.ts` DELETE catch → 정적 메시지("이 거래를 삭제하면 ...")로 치환해야 하므로 `isSafeBusinessError` 만 사용
- `src/app/api/trades/import/route.ts` POST catch → 동일 패턴

향후 새 비즈니스 예외 메시지를 노출하려면 `SAFE_BUSINESS_PATTERNS` 에 종단까지 명시한 패턴을 추가한다. 짧은 부사/동사(`'이미'`, `'초과합니다'`) 단독 매칭은 피한다 — 외부 라이브러리 메시지가 우연히 통과될 수 있다.

### 3. 규칙 문서 보강

`.claude/rules/api-routes.md` 항목 추가:
- DELETE 핸들러는 본문 없이 204 No Content 로 응답.
- catch 블록에서 `error.message` 를 직접 노출하지 않는다. 비즈니스 예외만 `safeErrorMessage()` 화이트리스트로 통과시킨다.

## 테스트 계획

- 거래 삭제 → 클라이언트가 정상적으로 닫히는지 (`/trades` 페이지 + 삭제 모달)
- 카테고리/자산/배당/예금 삭제 → 동일 회귀 테스트
- 거래 생성 시 `보유 수량 부족` 케이스 발생 → 메시지가 사용자에게 그대로 노출
- 거래 생성 시 알 수 없는 DB 에러 발생 → `'서버 오류가 발생했습니다.'` 노출 (직접 검증 어려움 → 화이트리스트 단위 테스트로 보강)
- `isSafeBusinessError` / `businessErrorResponse` 단위 테스트는 Phase 25-F 에서 vitest 도입 후 함께 추가 (현재 프로젝트에 테스트 러너 미설치)

## 제외 사항

- 응답 envelope (`ApiResponse<T>`) 전면 도입 — 53개 라우트 + 클라이언트 fetcher까지 영향. 별도 이슈로.
- POST/PUT 응답 키 일관화 (`{ resource }` vs raw) — 영향 범위 동일.
- DELETE 외 메서드의 에러 메시지 노출 패턴 — 현재 trades 외에는 모두 정적 메시지 사용. 신규 추가 시점에 가이드 적용.
