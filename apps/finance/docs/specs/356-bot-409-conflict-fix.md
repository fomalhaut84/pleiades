# 봇 409 Conflict 중복 인스턴스 fix (PM2 deploy 패턴)

- **작성일**: 2026-06-30
- **타입**: bug (P1)
- **연관**: PR #353 (firecrawl + stderr), PR #355 (IPv6 + 토큰 마스킹) — 별개 이슈로 분리됐던 항목

## 1. 문제

운영 PM2 로그에 봇 시작 시마다 반복:
```
2026-06-29 18:31:04: [bot] standalone 프로세스 시작...
2026-06-29 18:31:06: [bot] standalone 프로세스 시작...     ← 2개 인스턴스
2026-06-29 18:31:06: [bot] 시작 실패: GrammyError: Call to 'getUpdates' failed!
  (409: Conflict: terminated by other getUpdates request;
   make sure that only one bot instance is running)
```

증상: 배포 / restart 직후 봇이 잠시 죽었다 살아남. 사용자 입력 손실 가능성.

## 2. 원인

### 2.1 `pm2 startOrReload` (deploy.sh) + fork 모드 봇의 부조합

- `pm2 startOrReload` = 이미 실행 중이면 **graceful reload**
- `reload` 는 cluster 모드용 zero-downtime 패턴 — 새 워커 띄움 → ready → 옛 워커 종료
- 봇은 `instances: 1` 단일 fork 모드인데 reload 시도 시 PM2 가 새 인스턴스 spawn → **잠시 두 봇 동시 실행**
- 텔레그램 long polling 은 토큰당 1개만 허용 → 늦은 인스턴스가 `409 Conflict` 받고 종료
- `autorestart: true` 가 다시 살리려 시도하면서 텔레그램 측 polling 세션 정리 전에 재시도 → 충돌 반복

### 2.2 graceful shutdown 시간 부족

- `standalone.ts` 의 SIGTERM 핸들러는 `bot.stop()` 으로 정상 종료 시도
- 하지만 PM2 기본 `kill_timeout = 1600ms` — long-poll 끊는 시간 모자라 SIGKILL 강제
- 강제 종료 시 텔레그램 측 polling 세션이 잠시 살아있는 것처럼 남음

## 3. 요구사항

- [ ] **F1**: 봇은 deploy 시 graceful reload 대신 **hard restart** (단일 인스턴스 보장)
- [ ] **F2**: PM2 가 봇에 더 긴 종료 유예 시간 제공 (`kill_timeout: 15000`)
- [ ] **F3**: crash loop 시 점차 늘어나는 재시도 간격 (`exp_backoff_restart_delay: 100`). 100ms → 200ms → ... 최대 15s. **무한 재시도** 라 transient 외부 장애(텔레그램/네트워크 일시 outage) 회복까지 기다림. `max_restarts` 의 영구 stop 위험 회피 (봇이 알림 채널 단일 장애점).
- [ ] **F4**: 안정성 기준 (`min_uptime: 30000`) — 30s 이상 살아있으면 정상 동작으로 간주. crash loop 카운팅의 기준.
- [ ] 웹 (Next.js) 은 그대로 `startOrReload` 유지 (stateless, zero-downtime 유지)

## 4. 변경

### `deploy/deploy.sh`
```diff
- pm2 startOrReload ecosystem.config.js --only myfinance-bot
+ pm2 startOrRestart ecosystem.config.js --only myfinance-bot
```

### `ecosystem.config.js` 의 myfinance-bot 블록
```diff
  {
    name: 'myfinance-bot',
    script: 'dist/bot/standalone.cjs',
    cwd: '/home/nasty68/myFinance',
    env: { NODE_ENV: 'production' },
    instances: 1,
    autorestart: true,
+   kill_timeout: 15000,                // bot.stop() long-poll abort 시간 확보
+   min_uptime: 30000,                  // 30초 이상 살아있어야 안정으로 간주
+   exp_backoff_restart_delay: 100,    // 지수 백오프 무한 재시도 (100ms→…→15s),
+                                        // transient 외부 장애 회복까지 기다림
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  },
```

## 5. 검증

배포 후 PM2 로그에 봇 시작 메시지가 **한 번만** 찍히는지 확인:
```bash
pm2 logs myfinance-bot --lines 50
#   → [bot] standalone 프로세스 시작... (1회만)
#   → [bot] 초기화 완료: @StarryJejuFinanceBot
#   → 409 Conflict 메시지 없음
```

배포 직전/직후 봇이 메시지 처리하는 동안에도 누락 없는지 확인:
- 배포 직전 텔레그램에 메시지 전송 → 응답 받는지
- 배포 중 (5~10초간) 추가 메시지 전송 → 재시작 후 응답 또는 long-poll backlog 처리되는지

## 6. 제외 사항

- 봇의 `bot.stop()` 자체 로직 — 변경 없음 (이미 정상 동작)
- 웹 zero-downtime 정책 — 그대로 유지
