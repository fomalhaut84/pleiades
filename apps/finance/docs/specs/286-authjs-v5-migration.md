# Phase 25-H-2: next-auth 4 → Auth.js v5 마이그레이션

## 목적

Phase 25-H-1에 이어 남은 Dependabot 권고를 해결하기 위해 `next-auth` 4 → `next-auth@5` (Auth.js v5) 마이그레이션을 수행한다. 특히 `uuid` 보안 권고(next-auth v4 → uuid v8 종속)와 일부 next 권고 해결이 목표.

## 배경

PR #285에서 Next 14→15.5.19 적용 후에도 4건의 권고가 남았다:
- `uuid` < 11.1.1 (next-auth v4 → uuid@8.3.2 종속)
- `next-auth` >= 4.11.0 권고 매칭 (next 의존)
- `next`, `postcss` (next 번들 내부)

next-auth v5는 uuid를 의존하지 않으므로 마이그레이션 시 uuid 권고는 자체 해결된다.

## 요구사항

- [ ] `next-auth` 4.24 → `next-auth@5` (beta — 2년 이상 안정 베타)
- [ ] `src/lib/auth.ts`를 Auth.js v5 API로 재작성 (`handlers`, `auth`, `signIn`, `signOut` export)
- [ ] `[...nextauth]/route.ts`를 `handlers.GET/POST` 패턴으로 변경
- [ ] `middleware.ts`를 `auth()` 래퍼로 전환 (req.auth 접근)
- [ ] 타입 augmentation을 `@auth/core/jwt`로 이전
- [ ] 환경변수: `NEXTAUTH_SECRET` → `AUTH_SECRET` (fallback 유지)
- [ ] dev 서버 동작 확인 (signin redirect, 401 JSON, /api/auth/* 엔드포인트)

## 기술 설계

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/lib/auth.ts` | `NextAuthOptions` → `NextAuth()` 호출 + export `{ handlers, auth, signIn, signOut }`. authorize 콜백의 `req.headers['x-forwarded-for']` (Node) → `request.headers.get('x-forwarded-for')` (Web Request) |
| `src/app/api/auth/[...nextauth]/route.ts` | `NextAuth(opts)` 직접 호출 → `import { handlers } from '@/lib/auth'; export const { GET, POST } = handlers` |
| `src/middleware.ts` | `getToken({ req })` → `auth((request) => ...)` 래퍼. `request.auth` 존재 여부로 인증 판정 |
| `src/types/next-auth.d.ts` | `next-auth/jwt` 모듈 → `@auth/core/jwt`. Session.user 옵셔널 처리 (v5 DefaultSession 구조 반영) |
| `.env.example` | `NEXTAUTH_URL` 제거 (v5는 request 기반 자동 추론), `NEXTAUTH_SECRET` → `AUTH_SECRET` |

### 변경 없는 파일 (호환)

- `src/app/auth/signin/page.tsx` — `signIn` from `next-auth/react` 그대로 동작
- `src/components/auth/AuthProvider.tsx` — `SessionProvider` 그대로 동작

### 쿠키 prefix 변경 영향

Auth.js v5는 쿠키 prefix가 `next-auth.*` → `authjs.*`로 바뀐다. 배포 직후 한 번 강제 로그아웃이 필요하다(사용자가 다시 PIN 입력).

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] dev 서버:
  - 미인증 `/` → `/auth/signin` 307 redirect
  - 미인증 `/api/*` → 401 JSON
  - `/api/auth/providers` 정상 응답
  - `/api/auth/csrf` 토큰 반환

## 배포 시 주의

1. `.env`의 `NEXTAUTH_SECRET` → `AUTH_SECRET`으로 변수명 변경 (값은 동일 유지 가능. 변수명 변경만)
2. **`AUTH_TRUST_HOST="true"` 추가 필수** — v5는 production에서 trustHost가 자동 활성화되지 않아 Nginx 리버스 프록시 환경에서 모든 로그인이 `UntrustedHost` 에러로 실패한다. 대안으로 `AUTH_URL="https://finance.starryjeju.net"` 설정도 가능.
3. PM2 재시작
4. 첫 접속 시 강제 로그아웃 (쿠키 prefix 변경) — PIN 재입력

## 제외 사항

- 남은 3건의 `next` 내부 postcss 권고 — Next 16 업그레이드 필요 (별도 작업, 보안 영향 미미)
- DB 어댑터 도입 (현재는 JWT 전략, 변경 없음)

## 라벨

- `chore`, `P1`, `phase-25-H`
