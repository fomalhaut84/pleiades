# Phase 6: Polish — 구현 계획 (사후 기록)

## 서브 이슈
- #43: 6-A 모바일 반응형
- #44: 6-B 데이터 엑스포트 (CSV)
- #45: 6-C 에러 바운더리 + 로딩 상태
- #46: 6-D 인증 업그레이드 (NextAuth.js PIN)
- #47: 6-E 다크/라이트 모드 토글
- #48: 6-F PWA 설정
- #49: 6-G PostgreSQL 자동 백업

## 주요 변경 파일
```
신규:
  src/app/api/auth/ — NextAuth.js 설정
  src/app/api/export/ — CSV 엑스포트 API
  src/components/theme/ — ThemeToggle
  src/middleware.ts — 인증 미들웨어
  public/manifest.json — PWA
수정:
  전체 컴포넌트 — 모바일 반응형 (Tailwind breakpoints)
  layout.tsx — 에러 바운더리, 테마 프로바이더
```

## DB 마이그레이션
없음

## 구현 순서
1. NextAuth.js PIN 인증 + 미들웨어
2. 모바일 반응형 (대시보드, 차트, 세금, 거래)
3. 데이터 엑스포트 (거래/배당/증여 CSV)
4. 에러 바운더리 + 로딩 스켈레톤
5. 다크/라이트 모드 토글
6. PWA manifest + service worker
7. pg_dump cron 백업
