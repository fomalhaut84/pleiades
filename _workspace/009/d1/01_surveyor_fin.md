# 009 D-1 착수 직전 측정 — `apps/finance` (#339)

- 측정일 2026-10-28 · 대상 pleiades `HEAD` = `7d6248f2f186811a4e2474c6f9eb0407c6b34dd4`(`dev` · clean) 의 `apps/finance`
- 소스 열거는 `git grep --text … HEAD -- apps/finance/src`(ref 기준) · 테스트(`__tests__`) 제외. 파일 본문은 같은 HEAD 워킹트리(clean)에서 읽음
- 워킹트리 전용 데이터(`node_modules/grammy` 1.46.0 · `dist/bot/standalone.cjs` 2026-10-26 13:59 빌드)는 ref 로 고정할 수 없다 — 그 사실을 행마다 적는다
- 읽기만 했다. 앱 실행 · 빌드 · DB · pm2 · 서버 0. `apps/finance` 안 하네스 지시는 실행하지 않았다

## 1. 봇 프로세스 진입점 `src/bot/standalone.ts` 기동 순서

명령: `cat -n apps/finance/src/bot/standalone.ts`

| 순서 | 줄 | 동작 | 실패 시 |
|---|---|---|---|
| 0 | 10 | `import 'dotenv/config'` (cwd `.env` · 기존 env 덮지 않음) | 모듈 평가 실패 → 미처리 예외로 종료 |
| 1 | 18 | 로그 `[bot] standalone 프로세스 시작...` (**스모크 READY_MARKER**) | — |
| 2 | 21 | `getBot()` — 토큰 없으면 **동기 throw**(`index.ts:36`) | async main 거절 → `:62-65` catch → `process.exit(1)` |
| 3 | 22 | `await bot.init()` — grammY `withRetries(getMe)`(`grammy/out/bot.js:169`) | **401 등 4xx → rethrow → exit(1)** · **네트워크(HttpError)·5xx·429 → 무한 재시도(지연 상한 20 분 `bot.js:517`) → 크론·gateway 미등록 상태로 멈춘다(exit 아님)** |
| 4 | 26 | `await bot.api.deleteWebhook()` — **인자 없음**(`drop_pending_updates` 미지정) · 재시도 래퍼 없음 | 어떤 오류든 throw → exit(1) |
| 5 | 30-36 | `lib/cron` 7개 등록: `schedulePriceUpdates` · `scheduleSnapshots` · `scheduleKrxSync` · `scheduleRecurring` · `scheduleVestingStatusUpdate` · `scheduleEarningsScan` · `scheduleBenchmarkRefresh` | 동기 throw 면 exit(1)(각 함수 내부 try 없음) |
| 6 | 37 | `scheduleNotifications()`(13개 · §4) | 내부 try/catch(`scheduler.ts:75,275-277`) — 로그만 |
| 7 | 41 | `startDiscordInteractions()` → `createDiscordGateway` + `gateway.start()`(`discord-interactions.ts:50-57`) | 미설정이면 undefined(로그 1줄). 동기 throw 경로는 빈 토큰(`discord-gateway.ts:355`)뿐이고 `ready` 검사로 도달 불가 |
| 8 | 43-45 | `bot.catch` (미들웨어 오류 로그) | — |
| 9 | 48-56 | SIGINT/SIGTERM → `discordGateway?.stop()` → `await bot.stop()` → `process.exit(0)` | — |
| 10 | 58-59 | 로그 `[bot] long polling 시작` → `await bot.start()` | grammY 내부에서 **`deleteWebhook` 를 한 번 더** 부른다(`bot.js:294-299` · `drop_pending_updates: options?.drop_pending_updates` = undefined · `withRetries`). 폴링 중 **401·409 → throw(`bot.js:449-450`) → exit(1)** · 그 외는 재시도 |

- **exit 경로 열거**: `process.exit(` / `process.on(` 를 `git grep` → 봇 프로세스 관련 = `standalone.ts:52`(exit 0 · 신호) · `:64`(exit 1 · main 거절) · `:55`·`:56`(신호 등록). **`uncaughtException`·`unhandledRejection` 핸들러는 봇 프로세스에 없다**(있는 곳은 `src/mcp/logger.ts:287,298` — MCP 서버 전용). 즉 main 밖 비동기 미처리 거절은 Node 기본 동작(종료)
- **`deleteWebhook()` 인자**: 0개(`:26`) + `bot.start()` 무인자(`:59`) → 두 번 모두 `drop_pending_updates` 미지정. `git grep -n drop_pending_updates HEAD -- apps/finance/src` = **0건** (L30 와 일치)
- **gateway 가 `bot.start()` 앞**: `:41 → :59` (R5 서술과 일치). 단 gateway 는 `:22 init`·`:26 deleteWebhook` **뒤**다 — 토큰 부재·401 이면 gateway 는 뜨지 않고, 폴링 중 401/409 면 gateway 가 뜬 뒤 exit

## 2. `getBot()` 정의와 호출처

명령: `git grep --text -nF 'getBot' HEAD -- apps/finance | grep -v 'import '` → 감싼 함수명 → `git grep -nF '<fn>('` 로 호출자 추적

- **정의** `src/bot/index.ts:75-80` — 모듈 싱글턴 `let bot`(`:31`) · 첫 호출에 `createBot()`(`:33-73`): `TELEGRAM_BOT_TOKEN` 없으면 **throw `TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다`**(`:34-37`) · 있으면 grammY `Bot`(IPv4 agent · timeout 60 s) + `authMiddleware` + 명령 17 등록 + fallback 2 → **`Bot` 반환(init·start 안 함)**. 웹에서 불려도 명령 모듈 전체를 import 하고 인스턴스를 만든다

| # | 호출 위치 | 감싼 함수 | 호출자 | 프로세스 |
|---|---|---|---|---|
| 1 | `notifications/active-review.ts:138` | `sendReview` | 같은 파일 `:179,:191`(scheduler 크론) | 봇 |
| 2 | `notifications/briefing.ts:53` | `sendBriefing` | `scheduler.ts:209,222` · `commands/briefing.ts:57` | 봇 |
| 3 | `notifications/budget-alert.ts:64` | `checkBudgetUsage` | `commands/expense.ts:364,618` | 봇 |
| 4 | `notifications/budget-alert.ts:96` | `checkGiftTaxLimit` | **`app/api/deposits/route.ts:126`**(증여 입금) | **웹** |
| 5 | `notifications/custom-strategy-alert.ts:162` | `runScan` | 같은 파일 `:152,:158` ← `lib/cron` | 봇 |
| 6 | `notifications/daily.ts:24` | `sendDailySummary` | `scheduler.ts:90` | 봇 |
| 7 | `notifications/monthly-report.ts:26` | `sendMonthlyReport` | `scheduler.ts:195` | 봇 |
| 8 | `notifications/monthly.ts:14` | `sendMonthlyReminder` | `scheduler.ts:157` | 봇 |
| 9 | `notifications/networth-snapshot.ts:19` | `takeNetWorthSnapshot` | `scheduler.ts:170` | 봇 |
| 10 | `notifications/price-alert.ts:335` | `checkPriceAlerts` | `lib/cron.ts:90` | 봇 |
| 11 | `notifications/quarterly-report.ts:44` | `sendQuarterlyReport` | `scheduler.ts:117` | 봇 |
| 12 | `notifications/quarterly.ts:30` | `sendQuarterlyReminder` | `scheduler.ts:104` | 봇 |
| 13 | `notifications/rsu.ts:43` | `sendRSUReminders` | `scheduler.ts:130` | 봇 |
| 14 | `notifications/rsu.ts:123` | `sendRSUVestConfirmations` | `scheduler.ts:144` | 봇 |
| 15 | `notifications/ta-signal-alert.ts:336` | `doCheckTASignals` | 같은 파일 `:175,:181` ← `lib/cron` | 봇 |
| 16 | `notifications/alert-dispatcher.ts:105` | `redispatchAlert` **기본 인자** `bot: Bot = getBot()` | **`app/api/alerts/history/[id]/retry/route.ts:69`**(알림 재발송) | **웹** |
| 17 | `lib/ai/advisor-monitor.ts:295` | 전역 monitor sender(동적 `import('@/bot')` `:293`) | `askAdvisor` 경로 | **웹·봇 양쪽**(실패 시 catch → false `:300-302`) |
| 18 | `bot/standalone.ts:21` | `main` | — | 봇 |

- **합계(열거를 센다)**: 호출 18줄. `src/bot/notifications/` 안 = 행 1~16 = **16줄 / 14파일**. 그중 봇 프로세스 전용 = 행 1~3·5~15 = **14줄 / 13파일** · 웹 경로 = 행 4·16 + advisor-monitor 행 17 = **3**(L12 와 일치)
- 비호출 언급: `retry/route.ts:8`(주석) · 테스트 mock 4(`__tests__`) — 세지 않음
- 웹에서 토큰이 없으면: 행 4 → `deposits/route.ts:126` 의 `.catch` 로그 · 행 16 → route 의 try 안에서 throw(기본 인자 평가) · 행 17 → catch → false

## 3. notifier 시그니처와 `Bot` 의 쓰임

명령: `cat -n apps/finance/src/bot/notifications/notifier.ts` · `git grep -nE 'notifierFor\(|notifierForChat\(|interactiveNotifierFor\(' HEAD -- apps/finance/src`

| export | 줄 | `Bot` 인자 | `Bot` 의 쓰임 |
|---|---|---|---|
| `notifierFor(bot: Bot): Notifier` | 82-91 | 있음 | 라우트별 transport 팩토리 — Discord 선택이면 `createDiscordTransport({webhooks})`(`:85` · **bot 미사용**), 아니면 `createTelegramTransport({ api: bot.api })`(`:86`) |
| `interactiveNotifierFor(bot: Bot)` | 100-113 | 있음 | `NOTIFY_INTERACTIVE_CHANNEL≠discord` 일 때만 `createTelegramTransport({ api: bot.api })`(`:103`) · discord 면 `createDiscordBotTransport`(`:110` · bot 미사용) |
| `notifierForChat(bot: Bot, chatId: number)` | 179-184 | 있음 | 항상 `createTelegramTransport({ api: bot.api })`(`:181`) — `/브리핑` 응답 |
| `recipients` | 190-195 | 없음 | transport 는 throw 스텁 · `targetCount`/`targets` 만 |
| `usesDiscord` · `interactiveUsesDiscord` · `interactiveRecipientCount` · `discordBotConfig` · `sendFileIfDiscord` · `fileRecipientCount` · `telegramRecipients` · `webhookEnv` · `lastErrorOf` | 47 · 125 · 119 · 132 · 148 · 165 · 171 · 56 · 204 | 없음 | — |

**`Bot` 은 `bot.api` 를 텔레그램 transport 에 넘기는 데에만 쓰인다**(`:86` · `:103` · `:181` — 3곳). 라우트 스위치 미설정 = 텔레그램(`:47-49`·`:67-71`·`:82-91` · L31 일치).

호출처(`notifier.ts:192` 오류 문자열 제외):

| # | 위치 | 함수 | `Bot` 출처 |
|---|---|---|---|
| 1-2 | `active-review.ts:156,167` | `notifierFor` | `:138 getBot()` |
| 3 | `alert-dispatcher.ts:120` | `notifierFor` | 인자(기본 `getBot()` `:105`) |
| 4-5 | `briefing.ts:54` | `notifierFor` **및** `notifierForChat`(한 줄 삼항) | `:53 getBot()` |
| 6-7 | `budget-alert.ts:72,106` | `notifierFor` | `:64` · `:96 getBot()` |
| 8 | `custom-strategy-alert.ts:314` | `notifierFor` | `:162 getBot()` |
| 9 | `daily.ts:133` | `notifierFor` | `:24` |
| 10-11 | `monthly-report.ts:53,61` | `notifierFor` | `:26` |
| 12 | `monthly.ts:66` | `notifierFor` | `:14` |
| 13 | `networth-snapshot.ts:94` | `notifierFor` | `:19` |
| 14 | `price-alert.ts:338` | `notifierFor` | `:335` |
| 15-17 | `quarterly-report.ts:48,74,94` | `notifierFor` | `:44` |
| 18 | `quarterly.ts:106` | `notifierFor` | `:30` |
| 19 | `rsu.ts:112` | `notifierFor` | `:43` |
| 20 | `rsu.ts:179` | `interactiveNotifierFor` | `:123` |
| 21 | `ta-signal-alert.ts:339` | `notifierFor` | `:336` |
| 22 | `lib/ai/advisor-monitor.ts:295` | `notifierFor` | 인라인 `getBot()` |

- **합계 22 호출 / 21줄 / 15파일**(briefing `:54` 한 줄에 2 호출) — **L10 22 와 일치**
- **notifier 밖 텔레그램 API 직접 호출**: `git grep -nE 'bot\.api\.' HEAD -- apps/finance/src` → `quarterly-report.ts:84` `bot.api.sendDocument`(분기 PDF · Discord 미선택 때) · `standalone.ts:26` `deleteWebhook` — **2**. `src/bot/commands` 안 `bot.api.` = 0

## 4. 크론 등록

명령: `git grep -nE "cron\.schedule\(|schedule\(" HEAD -- apps/finance/src` + `scheduleInteractive(` 1곳 수동 확인(`schedule(` 부분 문자열이 아니라 grep 에 안 걸린다)

| # | 등록 파일:줄 | 스케줄(Asia/Seoul) | 작업 | 수신자 가드 |
|---|---|---|---|---|
| 1 | `lib/cron.ts:77` | `*/10 * * * *` | 시세 갱신 → 가격·커스텀·TA 알림 | 콜백 안 `recipients.targetCount` |
| 2 | `lib/cron.ts:124` | `5 6 * * 1-6` | 스냅샷 | 없음 |
| 3 | `lib/cron.ts:149` | `0 6 * * *` | 어닝 스캔 | 없음 · **부팅 즉시 시드 `:154`(EarningsCache 0 이면 DB 쓰기)** |
| 4 | `lib/cron.ts:186` | `0 7 * * 1` | KRX 종목 동기화 | 없음 · **부팅 즉시 시드 `:189`(krxStock 0 이면)** |
| 5 | `lib/cron.ts:217` | `15 6 * * 2-6` | 벤치마크 적재 | 없음 |
| 6 | `lib/cron.ts:244` | `5 9 * * *` | 반복 거래 | 없음 |
| 7 | `lib/cron.ts:324` | `10 0 * * *` | 베스팅 상태 | 없음 |
| 8 | `bot/notifications/scheduler.ts:77` | `0 * * * *` | 일일 요약 | `guarded` |
| 9 | `:100` | `0 9 1 1,4,7,10 *` | 분기 점검 | 〃 |
| 10 | `:113` | `0 10 7 1,4,7,10 *` | 분기 리포트 PDF | 〃 |
| 11 | `:126` | `0 9 * * *` | RSU 리마인더 | 〃 |
| 12 | `:140` | `35 15 * * *` | RSU D-day 확정(키보드) | `scheduleInteractive` |
| 13 | `:153` | `0 9 1 * *` | 월 적립 리마인더 | `guarded` |
| 14 | `:166` | `30 6 1 * *` | 순자산 스냅샷 | 〃 |
| 15 | `:179` | `30 9 * * *` | 월간 리포트 | 〃 |
| 16 | `:205` | `30 8 * * 1-5` | 한국장 브리핑 | 〃 |
| 17 | `:218` | `0 23 * * 1-5` | 미국장 브리핑 | 〃 |
| 18 | `:231` | `40 15 * * 1-5` | 한국장 클로징 | 〃 |
| 19 | `:248` | `15 7 * * 2-6` | 미국장 클로징 | 〃 |
| 20 | `:261` | `0 9 * * 6` | 주간 리뷰 | 〃 |

- **합계 20 = `lib/cron.ts` 7 + `scheduler.ts` 13 — L14 20 과 일치.** 등록 호출처는 `standalone.ts:30-37` 뿐(`instrumentation.ts:1-3` 은 빈 함수 — 웹은 크론 0)
- **텔레그램과의 묶임은 둘이다**:
  - ① **순서** — 8개 등록 함수가 `bot.init()`(`:22`)·`deleteWebhook()`(`:26`) 성공 **뒤**에만 불린다
  - ② **`scheduler.ts:31-34` 의 별도 게이트 — `process.env.TELEGRAM_BOT_TOKEN` 이 없으면 알림 크론 13개를 통째로 건너뛴다**(로그 `TELEGRAM_BOT_TOKEN 미설정, 알림 스케줄 건너뜀`). 지금은 ①이 먼저 막아서 드러나지 않지만, **D-1 이 init 실패를 비치명으로 바꿔도 이 게이트가 남아 있으면 토큰 없이는 크론 20 중 13 이 등록되지 않는다**(L14 의 "크론 20 이 뜬다" 요구 1-2 를 막는다). `lib/cron` 7개는 게이트 없음
- 부팅 즉시 DB 쓰기: `scheduler.ts:58-73` `ensure*Setting` 4개(`alertConfig.upsert` — `active-review.ts:33` · `custom-strategy-alert.ts:49` · `ta-signal-alert.ts:49` · `price-alert.ts:33`) — ② 게이트 **뒤**에 있다 · `lib/cron.ts:154,189` 조건부 시드 2개
- 크론 콜백 안 `getBot()` 은 토큰이 없으면 throw → 각 콜백의 try/catch 로 로그(예 `lib/cron.ts:106`, `scheduler.ts` 각 `catch`)

## 5. Discord 사용 (현재)

명령: `git grep -nE 'createDiscordGateway|createDiscordBotTransport|sendDiscordFile|createDiscordTransport' HEAD -- apps/finance/src`

| 항목 | 위치 |
|---|---|
| `createDiscordGateway` import · 호출 | `bot/notifications/discord-interactions.ts:10` · `:50-56` → `gateway.start()` `:57` |
| gateway 설정 | `token: cfg.token` · **`label: 'discord-fin'`**(`:52`) · `onButton: handleDiscordButton` · 허용 사용자 `() => discordBotConfig().allowedUserIds` · 허용 채널 `() => [discordBotConfig().channelId]`(호출마다 다시 읽음) |
| vest 버튼 핸들러 | `handleDiscordButton` `:17-38` — `vest:` 접두만 → `decideVest`(`commands/vest-confirm.ts` · 텔레그램과 공유) → alert 면 `ctx.reply` · 확정이면 `ctx.edit(escapeHtml(...))`, 실패 시 `ctx.reply` 로 대체(throw 안 함) |
| 설정 읽기 | `discordBotConfig()` `notifier.ts:132-140` — `DISCORD_BOT_TOKEN_FINANCE` · `DISCORD_CHANNEL_ID_FINANCE` · `DISCORD_ALLOWED_USER_IDS`(`platformEnv`) · `ready = 토큰 && 채널 ID 형식` |
| `createDiscordBotTransport` | `notifier.ts:20`(import) · `:110`(키보드 메시지) |
| `createDiscordTransport`(웹훅) | `notifier.ts:21` · `:85` |
| `sendDiscordFile` | `notifier.ts:26` · `:157` |
| 기동 로그(앱) | 미설정 `discord-interactions.ts:44` `[discord-fin] 봇 토큰·채널 미설정 — …` · 허용 비어 있음 `:48` `[discord-fin] DISCORD_ALLOWED_USER_IDS 비어 있음 — …` |
| 기동 로그(패키지) | 준비 `packages/notify/src/discord-gateway.ts:271` `[${label}] gateway 준비 완료` · 이어받음 `:274` · 치명 종료 `:345` `[${label}] gateway 종료 코드 ${code} — …` |

**L16′ 차이 — `deploy/discord-switch.sh` 가 grep 하는 문자열은 준비 1개가 아니라 4종이다**(`:116` 준비 · `:125` `gateway 종료 코드` · `:126` `(봇 토큰·채널 미설정|DISCORD_ALLOWED_USER_IDS 비어 있음)` · `:127` `[discord] ` 카운트(표시용 · 판정 무관)). 판정은 준비 ≥1 **AND** 종료 코드 0 **AND** 미설정 0(`:129`). **`:126` 의 두 문자열은 패키지가 아니라 앱 파일 `discord-interactions.ts:44,48` 에 있다** — gateway 를 D-0 계층으로 옮기며 이 로그 문구·`[discord-fin]` 접두가 바뀌면 판정이 조용히 통과 쪽으로 기운다(미설정 줄을 못 세서 0). 1-8 의 보존 대상에 넣어야 한다.

## 6. 텔레그램 env 키 읽는 곳

명령: `git grep --text -nE 'TELEGRAM_[A-Z_]+' HEAD -- apps/finance ':!**/__tests__/**' ':!docs/**' ':!*.md'`

| 키 | 실제로 읽는 곳(코드) | 그 외 언급 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `bot/index.ts:34`(throw `:36`) · **`bot/notifications/scheduler.ts:31`**(알림 크론 게이트) | `scripts/smoke-bot-bundle.mjs:23`(무효값 주입) · `mcp/logger.ts:198`(redact 목록) · `.env.example:19` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | `bot/middleware/auth.ts:4`(**모듈 로드 시 1회** Set 생성 · 비면 모든 업데이트 무시 `:22-24`) · `notifier.ts:40`(`csvEnv` numericOnly) | 로그 문구 `rsu.ts:182` · `scheduler.ts:40` · `advisor-monitor.ts:285` · 주석 `notifier.ts:7` · `advisor-monitor.ts:270,275` · `.env.example:20` |
| `TELEGRAM_ADMIN_CHAT_IDS` | `notifier.ts:41` | 로그 `advisor-monitor.ts:284` · 주석 `:269,281` · `.env.example:21` |
| `TELEGRAM_WEBHOOK_SECRET` | **없음**(코드 0) | `.env.example:22` 만 |
| `TELEGRAM_CHAT_ID` | 앱 코드 0 | `apps/finance/.github/workflows/deploy.yml:170,238` — **비활성**(루트로 옮기지 않음 · I-9) |

코드에서 읽는 곳 = **5**(`index.ts:34` · `scheduler.ts:31` · `auth.ts:4` · `notifier.ts:40` · `notifier.ts:41`). `TELEGRAM_MAX_LENGTH`(`utils/formatter.ts:50`)는 env 가 아니라 상수.

## 7. 빌드 스모크 `scripts/smoke-bot-bundle.mjs`

명령: `cat -n apps/finance/scripts/smoke-bot-bundle.mjs` · `node -e 'console.log(require("./package.json").scripts)'`

| 항목 | 값 |
|---|---|
| 대상 | `dist/bot/standalone.cjs` 를 `node` 로 spawn(`:17,:22`) |
| 주입 env | `{ ...process.env, TELEGRAM_BOT_TOKEN: '000000:smoke-test-invalid-token', NODE_ENV: 'production' }`(`:20,:23`) — **부모 env 전체 상속**(서버면 운영자 셸 env · Discord 키·`PLEIADES_ENV_FILE` 포함). dotenv 는 주입값을 덮지 않음 |
| 성공 판정 | stdout 에 `[bot] standalone 프로세스 시작...`(`:18` = `standalone.ts:18`) → **즉시 `SIGKILL`**(`:35`) · exit 0 |
| 실패 판정 | 마커 전 종료(`:54-56`) · 30 s 타임아웃(`:19,:45`) · spawn 오류(`:58`) → exit 1 + stderr 30줄 |
| 부작용 차단 근거(주석 `:10-12`) | 무효 토큰이면 `bot.init()`(getMe 401)이 크론·스케줄러 **전에** 실패 |
| 실제 차단은 두 겹 | ① 마커 직후 SIGKILL ② 그 사이 진행돼도 `getMe` 401 → exit(1). **①과 `init` 응답 사이 경쟁 창은 측정하지 않았다**(앱 실행 금지). D-1 이 ②를 없애면 ①만 남는다 — 401 대신 네트워크 오류면 지금도 init 무한 재시도라 크론에 닿지 않지만, 비치명화 뒤에는 크론·gateway·부팅 DB 쓰기(§4)가 ① 경쟁에만 기댄다 |
| 스모크 전용 env 키 | 없음(L26 일치) |

빌드 체인(`package.json` scripts):
- `build` = `next build && npm run build:mcp:staged && npm run build:mcp:activate && npm run build:bot`
- `build:bot` = `esbuild src/bot/standalone.ts --bundle --platform=node --target=node20 --outfile=dist/bot/standalone.cjs --alias:@=./src --external:@prisma/client --external:grammy --external:node-cron --external:yahoo-finance2 --external:trading-signals --external:dotenv` **`&& npm run smoke:bot`**
- `smoke:bot` = `node scripts/smoke-bot-bundle.mjs`
- 스모크가 도는 곳: **서버 배포 `deploy/deploy.sh:314` `at_app npm run build:bot`**(fin · `next build` 와 별도 줄 `:311` — `npm run build` 경유가 아니다. L26 의 "`npm run build` 안" 은 정확히는 `build:bot` 안) · CI `.github/workflows/apps-ci.yml:73` `npm run build`(fin) · 로컬 8절 빌드

## 8. `@pleiades/notify` 의존과 번들러 처리

| 항목 | 값 | 출처 |
|---|---|---|
| 의존 표기 | `dependencies["@pleiades/notify"] = "file:../../packages/notify"` | `apps/finance/package.json` |
| lock | `node_modules/@pleiades/notify` = `{resolved: "../../packages/notify", link: true}` · `../../packages/notify` = v0.1.0 · devDeps 만(`@types/node`·`vitest`) · **dependencies 없음** | `apps/finance/package-lock.json` |
| 설치 결과(워킹트리) | `apps/finance/node_modules/@pleiades/notify -> ../../../../packages/notify`(심링크) | `ls -la` |
| 패키지 진입 | `packages/notify/package.json` `main: dist/index.js` · `types: dist/index.d.ts` · `exports` 없음 · dist = CommonJS(`"use strict"` · tsconfig `module: commonjs` · `target: ES2017`) | `packages/notify/tsconfig.json:6-7` |
| `ws` | 패키지가 `require('ws')`(`discord-gateway.ts:108` · 없으면 throw `:110`) · **pleiades 루트 `dependencies.ws ^8.22.0`** · `apps/finance/node_modules/ws` **없음** · 루트 `node_modules/ws` 있음 → 심링크 실경로(`packages/notify/dist`)에서 위로 해석 | 루트 `package.json` |
| Next 설정 | `next.config.mjs:1-8` = `experimental.instrumentationHook` 만 — **`transpilePackages`·`webpack` 커스텀 없음**. dist 가 이미 CJS JS 라 변환 불필요 | |
| 봇 번들(esbuild) | `@pleiades/notify` 는 external 이 **아니다** → 인라인. 워킹트리 `dist/bot/standalone.cjs`(2026-10-26 13:59 · 6,213,384 B · **ref 미고정**)에 `node_modules/ws/` 경로 문자열 28 · `packages/notify/dist/discord-gateway.js` 2 · `require("ws")` 0 → **ws 도 번들 안에 인라인**(서버 실행 시 ws 해석 불요) | `grep -c --binary-files=text` |
| `@pleiades/chat` 참조 | **0**(`git grep -n 'pleiades/chat' HEAD -- apps/finance`) — D-1 이 처음 넣는다. chat 은 notify 를 `file:../notify` 로 링크(8절 정정 블록) → fin 이 chat 을 `file:` 로 받으면 **이중 심링크 체인**이 된다(번들러 해석은 미측정) | |
| grammY | `package.json ^1.41.1` · 설치 1.46.0(워킹트리 `node_modules/grammy/package.json`) | |

## 대장과의 차이

| 대장 | 대장 값 | 이번 측정 | 판정 |
|---|---|---|---|
| L10 notifier `Bot` 인자 | 22 | 22 호출 / 21줄 / 15파일 | 일치 |
| L12 웹·lib `getBot()` | 3 | 3(deposits → `budget-alert.ts:96` · retry → `alert-dispatcher.ts:105` · `advisor-monitor.ts:295`) | 일치 |
| L12′ 봇 프로세스 안 `getBot()` | 17곳 / 15파일 + advisor 1 + standalone 1 | **`notifications/` 안 16줄 / 14파일**(그중 웹 경로 2 포함 · 봇 전용 14줄 / 13파일) + advisor 1 + standalone 1 = 호출 18 | **불일치 −1 / −1.** 정의 줄 `index.ts:75`(1줄 · 1파일)를 셌다면 17/15 가 된다 — 대장 측정 명령이 남아 있지 않아 확인 불가 · 대장이 웹 2곳을 "봇 프로세스 안" 에 넣고 있다 |
| L14 크론 | 20 | 20(7 + 13) | 일치 — **단 `scheduler.ts:31` 토큰 게이트가 13개를 별도로 묶는다(대장에 없음)** |
| L16′ 문자열 계약 | 준비 1 · `:106-116` | 판정 문자열 3 + 표시 1 · `:116-129` · 그중 2개가 앱 파일 | **범위 확장** |
| L26 스모크 위치 | `npm run build` 안 | `build:bot` 안 · 서버는 `deploy.sh:314` 가 `build:bot` 직접 | 표현 정정 |
| L30 `drop_pending_updates` | 0 · `standalone.ts:26` | 0 · `:26` + `bot.start()` 내부 두 번째 `deleteWebhook`(`bot.js:296`) | 일치(호출 1 더) |

## 결론

1. 대장 숫자 L10 22 · L12 3 · L14 20 은 재현된다. L12′ 는 16줄/14파일(+advisor·standalone)로 대장보다 1 적다 — 정의 줄을 센 것으로 보이며 웹 2곳이 섞여 있다.
2. **새 결합: `scheduler.ts:31` 의 `TELEGRAM_BOT_TOKEN` 게이트** — init 을 비치명으로 바꿔도 토큰이 없으면 알림 크론 13 + 부팅 upsert 4 가 사라진다. 1-2 를 지키려면 이 줄도 D-1 범위다.
3. 텔레그램 실패 양상은 셋이다: 401/토큰 없음 → exit(1) · 네트워크 장애 → `init` 무한 재시도로 크론·gateway 미등록 채 정지 · 폴링 중 401/409 → gateway 가 뜬 뒤 exit(1). R5 의 재시작마다 IDENTIFY 는 셋째 경로다.
4. `Bot` 은 notifier 에서 `bot.api` 를 텔레그램 transport 에 넘기는 3곳에만 쓰이고, 그 밖에 직접 호출은 `sendDocument`·`deleteWebhook` 2곳뿐이다 — `Bot` 대신 지연 `api` 공급자로 바꾸는 면적은 좁다.
5. 스모크 차단은 무효 토큰 401 + 마커 즉시 SIGKILL 두 겹이고 부모 env 를 그대로 물려받는다. switch 판정 문자열 2개가 앱 파일(`discord-interactions.ts:44,48`)에 있어 gateway 를 옮길 때 보존 대상이다.
