# Phase 25-H-1: Next.js 14 → 15 마이그레이션

## 목적

Next.js 14.2.35를 15.5.x로 업그레이드하여 7건의 남은 Dependabot 보안 권고(HIGH 4 + MEDIUM 3)를 해결한다. 동시에 React 19 호환, App Router의 async API 전환을 적용한다.

## 배경

PR #283에서 non-breaking 보안 패치(22건 중 15건)를 적용했으나, 남은 7건은 모두 메이저 버전 점프를 요구한다.

- next 14.2.35 → 15.5.16: HIGH 4건 (SSRF, Middleware bypass, DoS, etc.) + MEDIUM 다수
- eslint-config-next 14.2.35 → 15.5.x: next와 동시 업그레이드
- postcss (next 내부 8.4.31): next 업그레이드로 자동 해결

next-auth 4 → Auth.js v5는 Phase 25-H-2(별도)로 분리.

## 요구사항

- [ ] `next` 14.2.35 → 15.5.16 (latest stable)
- [ ] `eslint-config-next` 동시 업그레이드
- [ ] `react`, `react-dom` 18 → 19 동시 업그레이드 (Next 15 요구)
- [ ] `@types/react`, `@types/react-dom` 18 → 19
- [ ] App Router의 `params`, `searchParams` async 전환 (29개 파일)
- [ ] next-auth v4 호환성 확인 (호환 안 되면 25-H-2 선행 필요)
- [ ] 빌드/린트/타입체크/실제 동작 확인 (페이지/API/봇/MCP)
- [ ] PM2 배포 후 dev 서버 동작 검증

## 영향 범위 (조사 결과)

| 항목 | 영향 파일 수 | 난이도 |
|---|---|---|
| `params` async 전환 (route handler 28 + page 1) | **29** | 쉬움 |
| `searchParams` async 전환 (Server Component) | **8** | 보통 |
| React 19 호환성 (forwardRef 등) | 검토 필요 | 보통 |
| fetch 캐싱 기본값 변경 (`force-cache` → `no-store`) | 78곳 검토 | **어려움** |
| GET route handler 캐싱 | 33개 검토 | 보통 |
| `cookies()`/`headers()` async | **0** (미사용) | - |
| `useFormState` → `useActionState` | **0** (미사용) | - |
| `@next/font` 제거 | **0** (미사용) | - |

**필수 수정**: 약 37개 파일
**검토/캐싱 전략**: 78 fetch 호출 + 33 GET route

### Top 3 리스크

1. **fetch 기본 캐싱 변경**: 78곳에서 명시적 캐시 옵션 없음. Next 15는 `no-store` 기본 → 성능 회귀 위험. `next: { revalidate }` 또는 `cache: 'force-cache'` 명시 필요.
2. **searchParams async 처리 누락**: 동기 접근 코드에서 Promise 처리 안 하면 빌드/런타임 에러.
3. **next-auth v4 + Next 15 호환성**: middleware의 `getToken()`, `/api/auth/[...nextauth]`가 정상 동작하는지 확인 필요. 비호환이면 25-H-2 선행.

## 기술 설계

### 마이그레이션 순서 (단계적)

1. **사전 검증**: next-auth v4 + Next 15 호환성 PoC (작은 브랜치에서 테스트 후 본 작업 진입)
2. **의존성 업그레이드**
   ```bash
   npm install next@15.5.16 eslint-config-next@15.5.16 react@19 react-dom@19
   npm install -D @types/react@19 @types/react-dom@19
   ```
3. **codemod 적용 (자동 변환)**
   ```bash
   npx @next/codemod@latest next-async-request-api .   # params/searchParams/cookies/headers async
   npx @next/codemod@latest next-request-geo-ip-removal .  # geo IP 제거 (사용 시)
   ```
4. **수동 보정**: codemod 미커버 케이스
5. **fetch 캐싱 정책 일괄 검토**: 78곳 분류 — (a) Yahoo Finance 시세 → `no-store` 유지, (b) 내부 API GET → `revalidate: 60` 추가
6. **빌드 검증**: `npm run lint && npx tsc --noEmit && npm run build`
7. **실 동작 검증**: dev 서버 띄워 주요 페이지(trades, dashboard, tax, assets, settings) 직접 확인 + API 호출 + 텔레그램 봇 시그널

### 영향 파일 패턴 (예시)

```ts
// 변경 전 (Next 14)
export default async function TradePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { accountId?: string }
}) {
  const { id } = params
  ...
}

// 변경 후 (Next 15)
export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ accountId?: string }>
}) {
  const { id } = await params
  const { accountId } = await searchParams
  ...
}
```

### 제외 사항 (25-H-2 별도)

- next-auth → Auth.js v5 마이그레이션 (Phase 25-H-2)
- uuid 8 → 11 (next-auth 마이그레이션에 종속)

### 제외 사항 (Phase 외)

- React Server Components 적극 도입 (Next 15의 활용처가 늘었지만 별도 작업)
- Turbopack 전환 (선택사항)
- Next.js 15 → 16 추가 점프 (필요 시 후속)

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit` (전체 통과 필수)
- [ ] `npm run build` (Next 빌드 + MCP 번들 + 봇 번들)
- [ ] 수동 동작 점검:
  - 메인 대시보드 (`/`)
  - 거래 페이지 (`/trades`, `/trades/new`, `/trades/[id]`)
  - 세금 센터 (`/tax`)
  - 자산 (`/assets`)
  - 가계부 (`/expense` 또는 `/transactions`)
  - 관심종목, RSU, 스톡옵션, 설정
  - 인증 (`/api/auth/...`)
  - MCP 서버 동작 (`dist/mcp/server.cjs`)
  - 봇 standalone (`dist/bot/standalone.cjs`)
- [ ] PM2 reload 후 실서버에서 핵심 페이지 sanity check

## 롤백 전략

- 별도 브랜치(`fix/284-next-15`) 작업 → main 머지 전 dev에서 충분히 검증
- 문제 발견 시 `git revert` 또는 dependabot 패치만 유지하고 next 업그레이드 분리
- DB 스키마 변경 없으므로 데이터 롤백 우려 없음

## 라벨

- `chore`, `P1`, `phase-25-H`
