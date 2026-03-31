# 텔레그램 봇 standalone 프로세스 분리

## 목적

텔레그램 봇의 응답 지연을 해소하기 위해 봇을 Next.js 프로세스에서 분리.
현재 봇은 Next.js webhook API Route로 동작하여 웹 요청과 경합하고,
API Route 오버헤드 + 콜드 스타트로 응답이 느림.

## 요구사항

- [ ] 봇을 별도 Node.js 프로세스로 분리 (grammY long polling)
- [ ] cron 작업(주가갱신, 스냅샷, KRX, 반복거래)을 봇 프로세스로 이동
- [ ] 알림 스케줄러(일일요약, 브리핑 등)를 봇 프로세스로 이동
- [ ] Next.js는 웹 서빙만 담당 (instrumentation에서 cron/scheduler 제거)
- [ ] PM2 ecosystem에 봇 프로세스 추가
- [ ] 기존 webhook route 제거

## 기술 설계

### 신규 파일

1. **`src/bot/standalone.ts`** — 봇 진입점
   - grammY Bot 초기화 + `bot.start()` (long polling)
   - cron 작업 등록 (`schedulePriceUpdates`, `scheduleSnapshots`, `scheduleKrxSync`, `scheduleRecurring`)
   - 알림 스케줄러 등록 (`scheduleNotifications`)
   - graceful shutdown (SIGINT/SIGTERM)

2. **빌드 스크립트** — `package.json`에 `build:bot` 추가
   - esbuild로 `src/bot/standalone.ts` → `dist/bot/standalone.cjs` 번들

### 수정 파일

3. **`src/instrumentation.ts`** — cron/scheduler 호출 제거 (빈 파일 또는 최소)
4. **`ecosystem.config.js`** — `myfinance-bot` 프로세스 추가
5. **`package.json`** — `build:bot` 스크립트 추가

### 삭제 파일

6. **`src/app/api/bot/webhook/route.ts`** — webhook route 제거

### 아키텍처 변경

```
Before:
  PM2 → Next.js (웹 + 봇webhook + cron + scheduler)

After:
  PM2 → Next.js (웹만)
  PM2 → standalone bot (long polling + cron + scheduler)
  둘 다 PostgreSQL 접근 (문제없음)
```

## 테스트 계획

- [ ] `npm run build:bot` 정상 빌드
- [ ] `node dist/bot/standalone.cjs` 실행 → 봇 long polling 시작
- [ ] 텔레그램 메시지 전송 → 봇 응답 확인 (응답 속도 개선)
- [ ] cron 로그 확인 (주가 갱신, 스냅샷 등)
- [ ] 웹 페이지 정상 동작 (Next.js 단독)
- [ ] lint + typecheck + build 통과

## 제외 사항

- 봇 커맨드/기능 변경 없음
- cron 로직 변경 없음 (실행 위치만 이동)
- 텔레그램 webhook 설정 해제는 배포 시 수동 처리
