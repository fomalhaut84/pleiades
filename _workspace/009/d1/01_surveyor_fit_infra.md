# 009 D-1 착수 직전 측정 — fit 봇 프로세스 · packages/chat · 배포 인프라 (#339)

- 측정일 2026-10-28 · 대상 pleiades `dev` HEAD `7d6248f2f186811a4e2474c6f9eb0407c6b34dd4` (작업트리 clean)
- 범위: pleiades 안 추적 파일 읽기만. `repos/*`·원본·서버·pm2·DB 접근 0 · 앱·스크립트 실행 0 · `apps/*` 하네스 지시 미실행
- 명령은 `git grep --text` / `/usr/bin/grep -n --binary-files=text` / `sed -n` / `cat -n`. 경로는 저장소 루트 기준

## 대장 대조 (요약)

| 대장 | 기존 값 | 이번 측정 | 판정 |
|---|---|---|---|
| L10 fit notifier `Bot` 인자 호출 | 6 | **6** (`notifierFor` 4 + `interactiveNotifierFor` 2 · 아래 A3) | 같음 |
| L14 fit 기동 항목 | 5 (gateway 포함) | **5** — orphan sweep · orphan sweeper · `ensureDefaults` · 스케줄러(크론 5) · Discord gateway (A1) | 같음 · 단 **크론은 5**(L14 "크론 20" 은 fin 값) · photo temp sweep 2줄은 텔레그램 앞이라 init 실패에도 실행되지만 `main` reject → exit(1) 로 결국 함께 죽는다 |
| L12 `!bot` 규칙 | `admin-alerts.ts:183-201` | 주석 `:182-186` · 코드 `:188-201` | 같음(줄 번호 그대로) |
| L12′ 봇 안 `getBot()` 17/15 | (fin 값) | **fit = 1곳**(`standalone.ts:27`) | fin 전용 값임을 확인 — fit 은 `getBot` 정의 1 + 호출 1 |
| L16′ 준비 로그 | notify `discord-gateway.ts:271` ↔ `discord-switch.sh:106-116` | notify `:271` · chat `gateway.ts:222` 같은 문자열 · switch `:116` grep | 같음 · 추가 계약 2줄(`:125`·`:126`) 발견 (C12) |
| L26 | fin `smoke-bot-bundle.mjs` · fit `verify-food-edit-pending.ts` | **fit 에는 봇 번들 스모크 없음**(`git ls-files apps/fitness/scripts \| grep -iE 'smoke\|bundle'` → 0) | 1-6 은 fin 전용 · fit 은 1-6 대상 없음 |
| L28 `PLEIADES_KEYS` | `release-inplace.sh:20` | `:20` · 사용 `:229`(unset) `:232`(잔여 검사) | 같음 |
| L28′ | `deploy.sh:356` · `:354-360` | `:354-356` delete → start `--update-env` · `:360` save | 같음 |
| L30 fit `deleteWebhook()` | `:38` 인자 없음 | `standalone.ts:38` `await bot.api.deleteWebhook();` | 같음 |

---

## A. `apps/fitness` 봇 프로세스

### A1. 진입점 `src/bot/standalone.ts` (99줄) 기동 순서

| 순서 | 줄 | 내용 | 텔레그램 실패 시 |
|---|---|---|---|
| 0 | :1 | `import "dotenv/config"` | — |
| 1 | :22-24 | `sweepStalePhotoTempFiles()` (catch 로그) | 이미 실행됨 |
| 2 | :25 | `startPhotoTempSweeper()` | 시작되지만 아래 exit 로 함께 종료 |
| 3 | :27 | `const bot = getBot()` — 토큰 없으면 **throw** (`index.ts:34`) | → `main().catch` :96-98 exit(1) |
| 4 | :30-32 | `bot.catch(...)` (update handler 격리) | — |
| 5 | :34 | `await bot.init()` (getMe) | reject → :96-98 exit(1) |
| 6 | :38 | `await bot.api.deleteWebhook()` — **인자 없음**(`drop_pending_updates` 미지정 · L30) | reject → exit(1) |
| 7 | :43-46 | `sweepOrphanedJobs()` (catch) · `startOrphanSweeper()` | 미도달 |
| 8 | :49 | `await ensureDefaults()` (DB · catch 없음 → 실패 시 exit(1)) | 미도달 |
| 9 | :52 | `startBotScheduler(bot)` — 크론 5 (A3) | 미도달 |
| 10 | :55 | `startDiscordInteractions()` (A4) | 미도달 |
| 11 | :60-67 | `bot.start({onStart})` — reject(401/409 등) 시 **:66 `process.exit(1)`** | 이미 떠 있던 크론·gateway 까지 종료 |

**exit 경로 전부:** `:66` exit(1) 롱폴링 비정상 종료 · `:79` exit(0) SIGINT/SIGTERM shutdown(`:73` gateway stop · `:75` `bot.stop()`) · `:93` exit(1) uncaughtException · `:98` exit(1) `main()` reject(3·5·6·8 단계 throw 포함). `unhandledRejection` 은 로그만(`:88-90`).
**L14 의 "기동 항목 5"** = 단계 7(sweep+sweeper 2) · 8 · 9 · 10 으로 세면 5. 크론은 9 안의 5개.

### A2. `getBot()` 와 `!bot` 규칙

| 항목 | file:line | 내용 |
|---|---|---|
| 정의 | `src/bot/index.ts:32-…` | 호출마다 `new Bot(token, {client:{baseFetchConfig:{agent: telegramAgent}, timeoutSeconds:60}})` — **싱글턴 아님** · 미들웨어·명령·콜백·사진·자연어 핸들러 등록 · 토큰 없으면 `:34` throw |
| 호출처 | `git grep -n getBot -- src scripts` | **`standalone.ts:27` 1곳뿐**(봇 프로세스). 웹 호출 0 |
| `bot` 전달 경로(봇 프로세스) | `scheduler.ts:71,82,93,101,111` · `commands/report.ts:19-20` · `commands/sync.ts:19` · `index.ts:90`(`handleAiQuestion(ctx,text,{bot})`) · `auto-adjust.ts:278` | `notifyBot: bot` 로 `lib/daily-report.ts`(13)·`lib/weekly-report.ts`(13)·`lib/garmin/sync.ts`(3) 까지 내려감(`git grep -n notifyBot -- src/lib \| uniq -c`) |
| 웹 경로 | `lib/cron.ts:43` · `app/api/sync/route.ts:90` `syncAll({...})` | `notifyBot` 미전달 → `bot` undefined |
| **`!bot` 규칙** | `src/lib/monitoring/admin-alerts.ts:182-201` | 주석 `:183` "1) bot 없음 (webapp) → alert skip, rate-limit 예약 안 함" · 코드 `:196-201` `if (!bot) { console.warn(\`${opts.logPrefix} 감지 (bot 없음, alert skip): ${errSnippet}\`); return; }` — DB 예약(`:206` 이후)보다 앞 |
| `bot` 인자를 받는 공개 함수 | `admin-alerts.ts:270,291,313,336,369` | 전부 `bot: Bot \| undefined` (`notifyClaudeAuthExpired…` · `notifyMcpTransportDown…` · `notifyGarminAuthFailed…` · `notifyOmronAuthFailed…` · `notifyAdminIfKnownFailure`) · 코어 `notifyRateLimitedAlert` `:188-192` |
| `Bot` 의 실제 용도 | `git grep -nE "bot\.api\|ctx\.api" -- src` | `notifier.ts:65,78` `createTelegramTransport({api: bot.api})` 뿐(+ `standalone.ts:38`). `ctx.api` 는 `food-photo.ts:133,240` · `start.ts:23`(텔레그램 핸들러 안) |

### A3. notifier 시그니처 · 호출처

| 함수 | file:line | `Bot` 용도 |
|---|---|---|
| `notifierFor(bot: Bot): Notifier` | `notifier.ts:61-67` | `allowedUsesDiscord()` 거짓일 때만 `createTelegramTransport({api: bot.api})` — Discord 웹훅 경로는 `bot` 미사용 |
| `interactiveNotifierFor(bot: Bot): Notifier` | `notifier.ts:75-88` | `interactiveUsesDiscord()` 거짓일 때만 `bot.api` — Discord 봇 경로(`createDiscordBotTransport`)는 `bot` 미사용 |
| 그 밖 export | `:29` `BOT_NOTIFY_CTX` · `:35` `allowedUsesDiscord` · `:44` `webhookEnv` · `:91` `interactiveUsesDiscord` · `:96` `discordBotConfig` | `Bot` 무관 |

호출처 (`git grep -nE "(interactiveN|n)otifierFor\(" -- src scripts`, 테스트 제외) — **6**:
1. `auto-adjust-cron.ts:79` interactive
2. `auto-adjust.ts:396` interactive
3. `auto-adjust.ts:456` notifierFor
4. `scheduler.ts:27` notifierFor
5. `scheduler.ts:52` notifierFor
6. `admin-alerts.ts:236` notifierFor (`!bot` 통과 뒤)

크론 5 (`scheduler.ts:63` `startBotScheduler`): `:66` 모닝 `MORNING_REPORT_CRON ?? "0 8 * * *"` · `:78` 이브닝 `"0 23 * * *"` · `:89` 주간 `REPORT_CRON ?? "0 7 * * 1"` · `:101` auto-adjust `"30 6 * * *"` · `:108` maintenance `"*/5 * * * *"` · 등록 완료 로그 `:117-119` `[bot-cron] 알림 스케줄 등록 완료 (…)`.
`grammy` import 22파일(`git grep -nE 'from "grammy"' -- src`, 테스트 제외) — 값 import 는 `index.ts:1`(Bot) · `food-edit-callback.ts:13` · `auto-adjust.ts:9`(InlineKeyboard) 3, 나머지 type-only. 웹 쪽 `lib/garmin/sync.ts:2` · `lib/monitoring/admin-alerts.ts:7` 은 **type-only**.

### A4. 현재 Discord gateway 사용

| 항목 | file:line |
|---|---|
| import | `discord-interactions.ts:5` `createDiscordGateway, type DiscordButtonContext, type DiscordGateway` from `@pleiades/notify` |
| 핸들러 | `:11-27` `handleDiscordButton(ctx)` — `customId` 가 `${CALLBACK_PREFIX}:` 아니면 `ctx.reply("알 수 없는 요청입니다.")` · `decideAutoAdjust(ctx.customId)` → `ctx.reply(notice)`(실패 삼킴) · `removeKeyboard` 면 `ctx.removeButtons()` |
| 기동 | `:30-48` `startDiscordInteractions()` — `discordBotConfig().ready` 거짓이면 `:33` 로그 `[discord-fit] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)` 후 undefined · 허용 사용자 0 이면 `:37` `[discord-fit] DISCORD_ALLOWED_USER_IDS 비어 있음 — 모든 버튼 클릭을 거부한다` · `createDiscordGateway({token, label:"discord-fit", onButton, allowedUserIds:()=>…, allowedChannelIds:()=>[channelId]})` · `gateway.start()` |
| 준비 로그 label | `discord-fit` → notify `discord-gateway.ts:271` `[discord-fit] gateway 준비 완료` |
| 텔레그램 쪽 같은 판단 | `auto-adjust-callback.ts:314` `answerCallbackQuery` · `:318` `editMessageReplyMarkup` (`decideAutoAdjust` 공유) |
| 설정 키 | `notifier.ts:97-99` `DISCORD_BOT_TOKEN_FITNESS` · `DISCORD_CHANNEL_ID_FITNESS` · `DISCORD_ALLOWED_USER_IDS` (전부 `platformEnv`) |

### A5. `TELEGRAM_*` env 읽는 곳 (테스트 제외)

| 키 | file:line | 성격 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `bot/index.ts:33-34` | 없으면 throw → 봇 기동 실패 |
| `TELEGRAM_BOT_TOKEN` | `bot/commands/food-photo.ts:92-95` | 사진 다운로드 URL 용 · 없으면 사용자에게 "서버 설정 오류" 응답 |
| `TELEGRAM_ALLOWED_CHAT_IDS` | `bot/middleware/auth.ts:3` | 인바운드 허용 (모듈 로드 시 1회) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | `bot/notifications/notifier.ts:31` `csvEnv(...)` | 아웃바운드 수신자 (`:53`·`:79`) |
| (문자열만) | `auto-adjust.ts:405` · `scheduler.ts:30` 로그 문구 · `mcp/logger.ts:183` pino redact 키 | 읽기 아님 |
| (상수) | `food-edit-format.ts:10` `TELEGRAM_MAX_MESSAGE_LENGTH = 4096` · `food-photo.ts:219` 지역 상수 | env 아님 |

### A6. `scripts/verify-food-edit-pending.ts` 의존

- import 2개뿐: `:11-20` `../src/bot/commands/food-edit-state` (`armPendingEdit` · `clearPendingEditFor` · `deletePendingEdit` · `isPendingEdit` · `markPendingEdit` · `peekPendingEdit` · `registerRetry` · `shouldConsumeAsEditInput`) · `:21-27` `../src/bot/commands/food-edit-format` (`DESC_PREVIEW_MAX` · `TELEGRAM_MAX_MESSAGE_LENGTH` · `buildDescChangeMessage` · `buildKcalChangeMessage` · `descPreview`)
- 두 대상 모듈은 import 0 (`/usr/bin/grep -n "from " food-edit-state.ts food-edit-format.ts` → 0) — grammy·DB 무의존
- **키 모양 의존:** `food-edit-state.ts:44` `new Map<number, PendingEdit>()` · 모든 함수가 `chatId: number`(:47,:62,:79,:95,:104,:118,:137,:148,:157) · 스크립트 `CHAT_A = 1001` · `CHAT_B = 2002`(숫자) — 등장 68줄 · 길이 검사 `:244-252` 가 `< TELEGRAM_MAX_MESSAGE_LENGTH`(4096). Discord 문자열 ID·2000자로 바꾸면 이 스크립트가 타입·한도 양쪽에서 함께 바뀌어야 한다
- `npm run test` 체인 2번째(`package.json` `"test"` · `verify:food-edit-pending` = `tsx scripts/verify-food-edit-pending.ts`)

### A7. `package.json` · next 설정

| 항목 | 값 |
|---|---|
| `@pleiades/notify` | `"file:../../packages/notify"` · lock `apps/fitness/package-lock.json:2409-2412` `resolved "../../packages/notify" · link true` · 로컬 `node_modules/@pleiades/notify -> ../../../../packages/notify`(저장소 루트 안) |
| `@pleiades/chat` | **없음** |
| `build:bot` | `esbuild src/bot/standalone.ts --bundle … --external:grammy --external:node-cron --external:dotenv --external:@flow-js/garmin-connect --external:@prisma/client/runtime` — **`ws` 는 external 아님**(번들됨 · notify `require('ws')` 가 루트 `node_modules/ws` 로 해석) |
| `build` / `build:staged` | `next build && … && npm run build:bot` / 서버는 `build:staged`(deploy.sh:317) |
| `next.config.mjs` | `const nextConfig = {};` — `transpilePackages`·`turbopack`·`outputFileTracingRoot` **없음** |
| Turbopack · 루트 밖 심링크 | 007 `:170` 정정 블록: fit build 가 `TurbopackInternalError … Symlink [project]/apps/fitness/.runtime/mcp-config.json is invalid, it points out of the filesystem root` 로 실패 → Q73 P-2′(`:444`) · measured-facts `:4326`. `apps-ci.yml:11` 주석 "루트 package-lock.json 은 fit next build 의 workspace root 추론에도 쓰인다(006 ㉒)" — 즉 filesystem root = pleiades 루트라 `packages/*` 링크는 루트 안으로 허용(notify 가 지금 통과하는 근거). `packages/chat` 도 루트 안이면 같은 조건 · **웹 번들이 chat 을 끌어들이는지는 D-1 설계 판단**(현재 웹 번들에 들어가는 notify 경로 = `admin-alerts.ts` → `notifier.ts`) |

---

## B. `packages/chat` (D-0 · 소비자 0)

### B8. 공개 API · 패키지 메타

| 항목 | file:line / 값 |
|---|---|
| index exports | `src/index.ts:5-30` — 타입 13(`Attachment`·`Button`·`ButtonContext`·`ButtonHandler`·`ButtonRows`·`Logger`·`MessageContext`·`MessageHandler`·`Outgoing`·`OutgoingFile`·`OutgoingMessage`·`SentMessage`·`TextFormat`) · 값 `createChat` · `createRouter` · `splitCommand` · `createIdentifyGuard` · `fileGuardStore` · `DEFAULT_IDENTIFY_LIMIT` · `DEFAULT_ATTACHMENT_POLICY` · `MESSAGE_INTENTS` · 타입 `Chat`·`ChatOptions`·`Router`·`CommandHandler`·`HearsHandler`·`PlainHandler`·`ActionHandler`·`IdentifyGuard`·`IdentifyGuardOptions`·`GuardStore`·`BlockInfo`·`BlockReason`·`GuardDecision`·`AttachmentPolicy`·`WebSocketLike`·`WebSocketFactory`·`ChatFetch`·`ChatResponse`·`ChatRequestInit` |
| gateway 생성 | `createChat(opts: ChatOptions): Chat` (`chat.ts:75`) — 별도 `createGateway` 는 export 안 됨 |
| `ChatOptions` 필수 | `chat.ts:18-28` `token: () => string`(함수) · `router: Router` · `allowedUserIds: IdList` · `allowedChannelIds: IdList` · `label: string`(필수 · 주석 "`discord-<app>` 을 쓴다(0-4 판정 문자열)") · **`identifyGuard: IdentifyGuard \| 'none'`(필수)** · `IdList = () => readonly string[]`(`auth.ts:8`) |
| 선택 | `attachmentPolicy` · `logger` · `fetch` · `createSocket` · `apiBase` · `reconnectDelaysMs` · `retryDelaysMs` · `sleep` · `now` (`:29-37`) |
| `Chat` | `start()` · `stop()` · `send(channelId, msg: Outgoing): Promise<SentMessage>` (`:40-45`) |
| `createIdentifyGuard` | `identify-guard.ts:76` · 옵션 `store: GuardStore`(필수) · `limit?`(기본 `DEFAULT_IDENTIFY_LIMIT = 100` `:59`) · `windowMs?` · `minRemaining?`(기본 100 `:60`) · **`onBlocked: (info) => void\|Promise<void>`(필수)** · `now?` (`:34-44`) |
| `fileGuardStore(file: string)` | `:160` — 경로는 호출자가 정함(주석: "서버 상태 경로 · 로컬 `.chat-local/`") · 디렉터리 0700 · 파일 600 · rename |
| 준비 로그 | `gateway.ts:8` 계약 주석 · `:222` `` `[${label}] gateway 준비 완료` `` · 종료 `:260` `` `[${label}] gateway 종료 코드 ${code} — 다시 접속하지 않는다${hint}` `` |
| intents | `gateway.ts:29` `MESSAGE_INTENTS = (1 << 9) \| (1 << 15)` → `chat.ts:174` |
| `ws` | `gateway.ts:66-73` `require('ws')` · 없으면 throw "'ws' 패키지가 없다 — pleiades 루트에서 npm ci" |
| `@pleiades/notify` 의존 | `package.json` `"dependencies": {"@pleiades/notify": "file:../notify"}` · 사용 예 `chat.ts:9` `sanitizeError` |
| package.json | `name @pleiades/chat` · `version 1.0.8` · `private` · `main dist/index.js` · `types dist/index.d.ts` · **`prepare`·`files`·`exports` 없음** · scripts `test` 만 |
| `.npmrc` | `legacy-peer-deps=true` (주석: npm 10 arborist `null.edgesOut` 회피 · #332) |
| tsconfig | `outDir dist` · `rootDir src` · commonjs · ES2017 |
| notify 해석 경로 | `packages/chat/node_modules/@pleiades/notify -> ../../../notify` (chat 자체 `npm ci` 산출) · **루트 `node_modules/@pleiades` 없음**(`ls` → No such file) → chat dist 의 `require('@pleiades/notify')` 는 **`packages/chat/node_modules` 가 있어야** 풀린다 |

### B9. notify `createDiscordGateway` ↔ chat 차이 (버튼 핸들러 대응)

| 항목 | notify `discord-gateway.ts` | chat |
|---|---|---|
| 진입 | `createDiscordGateway(opts)` `:125` | `createChat(opts)` + `createRouter()` |
| 토큰 | `token: string` `:62` | `token: () => string` |
| label | `label?` 기본 `'discord'` `:70,126` | `label` 필수 |
| 버튼 등록 | `onButton: (ctx: DiscordButtonContext) => Promise<void>` 하나 `:64` | `router.action(match: string \| RegExp, h: ActionHandler)` `router.ts:28` · `ActionHandler = (ctx: ButtonContext, match) => Promise<void>` `:13` · 미처리 시 `[label] 처리할 곳이 없는 버튼` 경고 `chat.ts:152` |
| ctx 필드 | `customId` · `userId` · `channelId` · `messageId` `:49-52` | `action` · `userId` · `channelId` · `messageId` · `platform:'discord'` (`types.ts:62-80`) |
| ctx 메서드 | `reply(text)`(ephemeral) · `edit(html, {keepButtons?})` · `removeButtons()` `:53-58` | `notice(text)` · `edit(msg: Outgoing)`(buttons 생략 시 제거) · `setButtons(rows)`(`[]` = 제거) · `send(msg)` (`types.ts:78-88`) |
| fit 핸들러 치환 | `ctx.customId` → `ctx.action` · `ctx.reply` → `ctx.notice` · `ctx.removeButtons()` → `ctx.setButtons([])` |
| 메시지 수신 | 없음 · `intents: 0` `:197` | `MESSAGE_INTENTS` · command/hears/attachment/fallback |
| IDENTIFY 보호 | 없음 | `identifyGuard` 필수 |
| 허용 검사 | `allowedUserIds`·`allowedChannelIds` 함수 | 같은 모양(`IdList`) |
| 준비 로그 | `:271` `[label] gateway 준비 완료` | `:222` 같은 문자열 |
| 종료 코드 로그 | `:345` `… 다시 접속하지 않는다(토큰·권한 확인)` | `:260` `… 다시 접속하지 않는다${hint}` — 접두 `gateway 종료 코드` 동일 |

---

## C. 배포 인프라

### C10. 루트 `package.json`

| 항목 | 값 |
|---|---|
| `prepare` | `tsc -p packages/notify` — **notify 만** |
| `build` | `tsc -p packages/notify && tsc -p packages/chat` |
| `typecheck` · `typecheck:test` · `test` | notify + chat 둘 다 |
| dependencies | `ws ^8.22.0` 하나 · devDependencies `typescript ^5` |
| main/types/exports/files | 전부 `packages/notify/dist` 위임 |

→ 서버 루트 `npm ci` 산출 = 루트 `node_modules`(ws·typescript) + `packages/notify/dist`. **`packages/chat/dist` 와 `packages/chat/node_modules` 는 만들지 않는다.**

### C11. `deploy/deploy.sh` · `release-inplace.sh` · `pleiades.config.cjs`

`deploy.sh` (`/usr/bin/grep -nE "npm (ci|…)|pm2 …"` · `sed -n 285,362p`):

| 단계 | 줄 | 명령 |
|---|---|---|
| 1 의존성 | `:293` step · `:296` `at_root npm ci` · `:297` `at_app npm ci` | (`--activate` 면 생략 · `:288-290`) · 주석 `:16` "루트 npm ci 가 첫 단계 — prepare 가 packages/notify/dist" |
| 2 마이그레이션 검사 | `:300-301` | 적용 안 함 |
| 3 빌드 fin | `:309` `npx --no-install next build` · `:311` `build:mcp:staged` · `:312` `build:bot` | |
| 3 빌드 fit | `:316` `npx prisma generate` · `:317` `npm run build:staged` | |
| 4a~4c | `:324` preflight · `:335` `build:mcp:activate` · `:337` `pm2 startOrRestart … mcp --update-env` · `:340` save | |
| 5 웹 | `:351` `pm2 startOrRestart … web --update-env` | |
| 5 봇 | `:355` `pm2 delete pleiades-$APP-bot` (없으면 무시) · **`:356` `pm2 start "$CONFIG" --only "pleiades-$APP-bot" --update-env`** · `:357` confirm_stable | |
| 6 | `:360` `pm2 save --force` | |

→ `packages/chat` 설치·빌드 단계 **0**.

`release-inplace.sh:20` `PLEIADES_KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|BASE_URL|FIRECRAWL_[A-Z_]*|MYFINANCE_ROOT|MCP_CONFIG_PATH'` · `:229` 매칭 키 `unset` · `:232` 잔여 검사(`PLEIADES_ENV_FILE` 제외). `TELEGRAM_*`·`DISCORD_*`·`NOTIFY_*` 는 와일드카드라 그 접두의 새 키는 잡힌다 — 그 밖 접두의 새 키(예: 스모크 차단 키)는 모른다.

`pleiades.config.cjs` fit 봇 (`:93-100`, 공통 `:62` · `:64-71`):

| 옵션 | 값 | 출처 |
|---|---|---|
| name · script | `pleiades-fit-bot` · `dist/bot/standalone.cjs` | `:95,97` |
| env | `{NODE_ENV:'production', TZ:'Asia/Seoul', MCP_PORT, (MCP_HTTP_URL 셸에 있으면)}` | `:88,99` |
| autorestart | true | `:62` |
| min_uptime | 30000 | `:67` |
| exp_backoff_restart_delay | 100 | `:68` |
| max_restarts | `Number.MAX_SAFE_INTEGER` (fit 만 · fin 봇은 미지정 = pm2 기본) | `:98` · fin `:76` |
| restart_delay | **미지정** | — |
| kill_timeout · max_memory_restart · node_args | 15000 · 512M · `--max-old-space-size=512 --network-family-autoselection-attempt-timeout=2000` | `:66,69,70,61` |
| 로컬 shim | `PM2_HOME` = `<root>/.pm2-local` 일 때만 PATH 앞에 `bin/` | `:122-128` |

pm2 env 병합: 정의 env 는 위 몇 키뿐 · 나머지는 `--update-env` 로 **운영자 셸 env 가 실린다**(L28′) · 앱 `.env` 는 `effectiveEnv` 로 포트만 읽는다(`:42-56`).

### C12. `deploy/discord-switch.sh` 준비 로그 계약

| 줄 | grep | 의미 |
|---|---|---|
| `:15` | `BOTS=(pleiades-fin-bot pleiades-fit-bot)` · `:16` `READY_WAIT=${PLEIADES_READY_WAIT:-90}` | app = `fin`/`fit` (`:112` 이름에서 추출) |
| `:116` | `grep -q "\[discord-$app\] gateway 준비 완료"` | 준비 판정(재시작 뒤 바이트만 · `:59`) |
| `:125` | `grep -c "\[discord-$app\] gateway 종료 코드"` | fatal 수 |
| `:126` | `grep -cE "\[discord-$app\] (봇 토큰·채널 미설정\|DISCORD_ALLOWED_USER_IDS 비어 있음)"` | 미설정 수 — **앱 쪽 문자열**(fit `discord-interactions.ts:33,37`)에 묶인 계약 |
| `:127` | `grep -c "\[discord\] "` | 전송 재시도·속도 제한(notify 기본 label) |

→ D-1 에서 지켜야 할 문자열은 L16′ 의 1줄이 아니라 **3줄**(준비 · 종료 코드 · 미설정 2문구) + label 형식 `discord-<fin|fit>`.

### C13. CI

| workflow | 순서 |
|---|---|
| `ci.yml` verify | `:47` 루트 `npm ci` → `npm --prefix packages/notify ci` → `:55` `npm --prefix packages/chat ci` → `:58` typecheck → `:61` test → `:64` build · 캐시 키에 `packages/chat/package-lock.json`(`:43`) |
| `apps-ci.yml` fin · fin-test · fit | 각각 `working-directory: .` `npm ci`(`:61` · `:110` · `:154`) → 앱 `npm ci`(`:63` · `:112` · `:156`) → `prisma generate` → `migrate deploy` → … · **`packages/chat` 설치 0** · 주석 `:10-11` |

→ 앱이 `@pleiades/chat` 을 쓰면 `apps-ci.yml` 3잡 모두 chat 설치·빌드 단계가 없어 실패할 경로(루트 prepare 는 chat dist 를 만들지 않음 · C10).

### C14. `tools/local/run.sh` · `check_env.py`

| 항목 | file:line |
|---|---|
| `env -u` 목록 | `run.sh:29`(검사) · `:30`(실행 `exec`) — **`DATABASE_URL` · `TELEGRAM_BOT_TOKEN` 2개** |
| PM2_HOME | `run.sh:26` `export PM2_HOME="$ROOT/.pm2-local"` |
| 텔레그램 검사 | `check_env.py:193-209` — 토큰 **비면 통과**(`:196-197` "봇 미기동") · 있으면 검증 봇 id 허용 목록 · 다른 앱과 동일 봇 거부 · `CHAT_ID` 포함 키 전부 검증 채팅 대조 |
| Discord 검사 | `:104-121` 실효 토큰(프로세스 env 빈 값도 이김 → 플랫폼 파일) · `:142-` SHA-256 허용 목록(`PLEIADES_VERIFY_DISCORD_TOKEN_SHA256`) · `:133-139` `PLEIADES_ENV_FILE` 대상 없으면 거부 · `:255-256` 앱 `.env` 의 `PLEIADES_ENV_FILE` 거부 |
| 플랫폼 키 | `:43-46` `PLATFORM_KEY` = `NOTIFY_*`·`DISCORD_WEBHOOK_*`·`DISCORD_BOT_TOKEN_*`·`DISCORD_CHANNEL_ID_*`·`DISCORD_ALLOWED_USER_IDS` — 앱 `.env` 에 있으면 거부(`:258-…`) |
| 비워야 할 키 fit | `:33` `GARMIN_EMAIL` · `GARMIN_PASSWORD` · `MFDS_API_KEY` |

→ 로컬 "텔레그램 토큰 없이 기동"(D-1 수용 기준)은 `check_env` 를 통과한다. 새 상태 경로(IDENTIFY 기록 `.chat-local/`)·새 스위치 키는 check_env 가 모른다.

---

## 결론 5줄

1. 대장 L10(6)·L14(5)·L12·L28·L28′·L30 은 현재 HEAD 에서 **그대로**다. 다만 fit 크론은 5(L14 "20" 은 fin)이고 fit `getBot()` 호출은 1곳(L12′ 17/15 는 fin)이며 **fit 에는 빌드 스모크가 없어 1-6 은 fin 전용**이다.
2. fit 의 `Bot` 은 `notifier.ts:65,78` 의 `bot.api` → `createTelegramTransport` 에만 쓰인다. Discord 경로는 이미 `bot` 없이 성립하고 `!bot`(웹 skip)은 `notifyBot` 미전달(웹)로 생긴다 — `Bot` 대신 쓸 중립 값을 만들면 그 의미를 따로 보존해야 한다.
3. 텔레그램이 실패하는 지점은 `:27`(토큰) · `:34` · `:38` · `:66`(폴링 중 reject) **4곳이 전부 exit(1)** 이다. `:66` 은 이미 떠 있는 크론 5·gateway 까지 죽인다. `deleteWebhook()` 에는 인자가 없다.
4. **`packages/chat` 은 서버·앱 CI 경로에 설치되지 않는다.** 루트 `prepare` 는 notify 만 빌드하고, chat dist 의 `@pleiades/notify` 해석은 `packages/chat/node_modules` 링크에 달려 있으며(루트 `node_modules/@pleiades` 없음), `deploy.sh` 와 `apps-ci.yml` 의 chat 단계는 0이다. chat 의 package.json 에는 `prepare`·`files` 가 없다.
5. 준비 로그 계약은 3줄이다(`discord-switch.sh:116` 준비 · `:125` 종료 코드 · `:126` 앱 쪽 미설정 2문구). chat 은 준비·종료 문자열을 유지하지만, 미설정 문구는 fit `discord-interactions.ts:33,37` 에 있다. 버튼 이관은 `customId→action` · `reply→notice` · `removeButtons→setButtons([])` 치환이고 `identifyGuard`(store 경로 + `onBlocked`)가 필수다.
