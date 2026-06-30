# 텔레그램 봇 IPv6 ETIMEDOUT + 토큰 로그 노출 대응

- **작성일**: 2026-06-30
- **타입**: bug (P1)
- **참조**: `fomalhaut84/myFitness#108` (같은 서버, 동일 원인. 패턴 그대로 이식)

## 1. 문제

### 1.1 증상

운영 서버(Ubuntu, PM2)에서 myFinance 텔레그램 봇이 cron 알림 / AI 응답 / 변동 알림 등에서 `HttpError: Network request for 'sendMessage' failed!` + `ETIMEDOUT` 으로 산발적 실패. 사용자 메시지로는 `"AI 질문 처리에 실패했습니다."` (`src/bot/commands/ai.ts:74` 의 마지막 else 분기 fallback).

PM2 로그 `myfinance-bot-error-2.log`:
```
[bot] AI 질문 처리 실패: HttpError: Network request for 'sendMessage' failed!
  error: FetchError: request to https://api.telegram.org/bot<TOKEN>/sendMessage failed, reason:
    type: 'system', errno: 'ETIMEDOUT', code: 'ETIMEDOUT'
```

### 1.2 원인 (myFitness 진단 그대로 적용)

- 서버에 IPv6 라우트 없음 (`curl -6 https://api.telegram.org/` → `Network is unreachable`).
- `dns.lookup` 이 AAAA 를 먼저 반환 → node-fetch 가 IPv6 시도 → 커널이 `ENETUNREACH` 반환, node-fetch 경로에서 `ETIMEDOUT` 으로 전파.
- `curl` 은 Happy Eyeballs 로 즉시 IPv4 fallback 하지만 node-fetch 는 그렇지 못함.

### 1.3 부수 발견: 토큰 노출 위험

`console.error('[bot] ...', err)` 가 grammy `HttpError` 객체를 dump 하면 inner `FetchError` 메시지에 `/bot<TOKEN>/sendMessage` URL 이 평문 포함된 채 PM2 stderr 로그 파일에 누적될 수 있음. myFinance 도 `console.error(err)` 호출처 다수 존재.

### 1.4 부수 발견: 알림 발송 패턴 비일관

- `src/bot/utils/telegram.ts` 의 `sendHtml` / `replyHtml` 은 이미 `withRetry` 적용
- 하지만 `src/bot/notifications/briefing.ts`, `monthly-report.ts` 는 직접 `bot.api.sendMessage` 호출 → 재시도 없음, parse fallback 없음
- 재시도 delay 가 1s/2s 로 짧음 (myFitness 2s/8s/30s 와 비교)

## 2. 요구사항

- [ ] **F1**: 봇이 IPv6 시도하지 않도록 IPv4 강제 (`https.Agent({family:4, keepAlive:true})`)
- [ ] **F2**: `client.timeoutSeconds: 60` 명시 (grammy 기본값 500s 단축, long-poll 30s + 마진)
- [ ] **F3**: 토큰 마스킹 유틸 (`src/bot/utils/error.ts`) — `sanitizeError` / `sanitizeMessage` / `isNetworkError` / `isHtmlParseError` / `getErrorCode`
- [ ] **F4**: `withRetry` 강화 — `isNetworkError` 사용 (더 많은 코드 + grammy timeout/abort 포착), delay 2s/8s/30s, 로그 sanitize
- [ ] **F5**: `console.error` 로 err 객체 dump 하는 호출처 전부 → `sanitizeError(err)` 경유
- [ ] **F6**: `briefing.ts` / `monthly-report.ts` 의 직접 `bot.api.sendMessage` 호출 → `sendHtml` 유틸로 교체

## 3. 영향 없음 (확인)

- DB / 스키마 / API 라우트 변경 없음
- AI advisor 동작 변경 없음 (PR #353 의 firecrawl/stderr fix 와 독립)

## 4. 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 운영 서버 배포 후: 모닝 브리핑 (cron) 또는 텔레그램 AI 질문 → ETIMEDOUT 빈도 0 또는 자동 복구로 사용자 영향 없는지 확인
- 토큰 마스킹: `pm2 logs myfinance-bot` 에 `bot<숫자>:` 패턴이 더 이상 안 보여야 함

## 5. 제외 사항

- 봇 인스턴스 중복 (`409 Conflict`) 은 별개 이슈 — ecosystem.config.js 또는 PM2 reload 패턴 점검 필요. 본 PR 범위 외.
- 운영 토큰 회수/재발급은 사용자 별도 진행.

## 6. 배포 가이드

```bash
./deploy/deploy.sh dev    # 또는 main 머지 후 main 배포
pm2 restart myfinance-bot
# 검증: pm2 logs myfinance-bot --lines 30
#   → [bot] standalone 프로세스 시작...
#   → [cron] ... 스케줄러 등록 완료
#   → 토큰 노출 없음
```
