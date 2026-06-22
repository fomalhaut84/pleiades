# API Routes 규칙

이 규칙은 src/app/api/**/*.ts 파일에 적용.

## 기본 규칙

- 모든 route handler 는 try-catch 로 감싸고, 에러 응답은 아래 envelope 헬퍼 (`fail`) 사용
- DB 접근은 반드시 `@/lib/prisma` 의 singleton client 사용
- Trade 생성 시 Holding 업데이트를 Prisma transaction 으로 묶을 것
- 금액 관련 응답은 항상 currency 필드 포함
- 날짜는 ISO 8601 형식으로 반환
- catch 블록에서 `error.message` 를 그대로 노출하지 않는다. 사용자에게 보여도 안전한 비즈니스 예외는 `@/lib/api-errors` 의 `businessErrorResponse(err)` 로 통과시키고, 그 외는 한국어 정적 메시지(`'서버 오류가 발생했습니다.'` 등)로 응답

## 응답 envelope (`ApiResponse<T>`)

**신규 라우트** 와 **마이그 완료 라우트** (아래 "적용 범위" 참고) 는 `@/lib/api-response` 의 헬퍼를 사용해 통일된 envelope 으로 반환한다 (Phase 27).

### 적용 범위

| 상태 | 도메인 |
|---|---|
| ✅ 마이그 완료 (27-A~D) | trades, dividends, deposits, transactions, rsu, stock-options, watchlist, recurring, settings, income-profiles, categories, budgets, assets, exports/* (에러 path), 그 외 27-B 단순 GET |
| ⏳ 마이그 예정 (28차 마일스톤 후보) | accounts, networth, performance/*, prices/*, reports, tax/gift, backtest, ai/ask |

**중요**: 미마이그 라우트의 응답을 envelope 으로 바꾸려면 **반드시 클라이언트 fetcher 도 함께 업데이트** 한다 (envelope 일방 변경은 화면 깨짐을 유발). 신규 라우트는 처음부터 envelope 사용.

### 예외 (envelope 미적용)

- **파일 응답**: CSV (`csvResponse()`), ICS (`new Response(ics, ...)`), PDF 등 — Content-Disposition 헤더 필요. **에러 path 만** envelope 적용 (`exports/*` 참고).
- **스트리밍 / SSE**: 비표준 응답 본문.

### 응답 구조

```ts
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: { total: number; limit: number; offset: number }  // pagination 한정
}
```

### 헬퍼 사용

| 케이스 | 헬퍼 | 예시 |
|---|---|---|
| 성공 (200) | `ok(data)` | `return ok(user)` |
| 생성 (201) | `ok(data, { status: 201 })` | `return ok(created, { status: 201 })` |
| 본문 없음 (204/205/304) | `noContent()` | `return noContent()` |
| 페이지네이션 | `paginated(arr, total, limit, offset)` | `return paginated(trades, total, limit, offset)` |
| 복합 데이터 + meta | `ok({...}, { meta: { total, limit, offset } })` | transactions GET 같이 집계 필드 + pagination |
| 에러 | `fail(error, status)` | `return fail('찾을 수 없습니다.', 404)` |

### 패턴 예시

```ts
import { ok, fail, noContent, paginated } from '@/lib/api-response'

// 단순 조회
return ok(account)

// 생성
return ok(created, { status: 201 })

// 페이지네이션
return paginated(trades, total, limit, offset)
// → { success: true, data: [...], meta: { total, limit, offset } }

// 집계 + 페이지네이션
return ok(
  { transactions, summary, byMonth, byCategory },
  { meta: { total, limit, offset } },
)

// 삭제 / 빈 ack
return noContent()
// → 204 No Content (body 없음)

// 에러
return fail('계좌를 찾을 수 없습니다.', 404)
```

### 비즈니스 예외

화이트리스트 비즈니스 에러는 `businessErrorResponse()` 가 `fail()` 헬퍼로 위임한다:

```ts
import { businessErrorResponse } from '@/lib/api-errors'

try {
  // createTrade 등 비즈니스 로직 — "보유 수량 부족" 등 throw
} catch (error) {
  const businessResponse = businessErrorResponse(error)
  if (businessResponse) return businessResponse
  console.error('POST /api/trades error:', error)
  return fail('거래 기록에 실패했습니다.', 500)
}
```

화이트리스트는 `src/lib/api-errors.ts` 의 `SAFE_BUSINESS_PATTERNS` 에서 관리. 새 비즈니스 예외 메시지를 추가할 때는 우연 매칭을 피하기 위해 패턴을 명시적으로 잠근다.

### 클라이언트 사용

클라이언트 fetcher 는 envelope 의 `data` / `meta` / `error` 를 unwrap 한다:

```ts
const res = await fetch('/api/foo')
const json = await res.json()
if (!res.ok) {
  setError(json?.error ?? '요청 실패')
  return
}
const items = json?.data ?? []
const total = json?.meta?.total ?? 0
```

## 신규 라우트 작성 체크리스트

- [ ] `@/lib/api-response` 에서 `ok` / `fail` / `noContent` / `paginated` 사용
- [ ] try-catch 로 감싸고 catch 블록은 한국어 정적 메시지
- [ ] 비즈니스 예외가 있다면 `businessErrorResponse()` 통과
- [ ] DB 접근은 `@/lib/prisma` singleton + transaction 필요 시 묶기
- [ ] 금액은 currency 필드, 날짜는 ISO 8601
- [ ] DELETE / 빈 응답은 `noContent()` (204), `{ success: true }` wrapper 금지
