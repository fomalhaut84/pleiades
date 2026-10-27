# 009 실측 — `apps/fitness` 텔레그램 접점 전수 (#326)

- 측정일 2026-10-27 · 대상 pleiades `dev` HEAD `8192b0c` 의 `apps/fitness/src` (+ 소비하는 `packages/notify/src`)
- 읽기 전용. 테스트(`__tests__`) 제외. 서비스 저장소·서버·`repos/*` 는 보지 않았다(I-1·I-3·I-11)
- grep 은 전부 `/usr/bin/grep --binary-files=text`(ugrep 래퍼 회피). zsh 단어 분리 문제로 다중 파일 집계는 `bash -c` 안에서 돌렸다
- `measured-facts.md` 의 2026-09-03 "전송 호출 분포"는 1a-3·M-5a·M-6 이전 숫자라 인용하지 않고 다시 쟀다
- 봇 코드 규모: `find src/bot -name '*.ts' -not -path '*__tests__*'` = **26 파일 · 3,503줄** (`wc -l`)

공통 명령 정의:
```bash
cd apps/fitness
F=$(find src/bot -name "*.ts" -not -path "*__tests__*" | sort)          # bash -c 안에서
/usr/bin/grep -n --binary-files=text -E "bot\.(command|hears|on|callbackQuery|use|catch|inlineQuery|filter)\(" $F
```

---

## 1. 인바운드 명령 (grammY 등록 전수)

등록 실측 (위 명령 결과 · `bot.hears`·`inlineQuery`·`filter` 0건):

| # | 등록 | 파일:줄 | 하는 일 | 인자 | 응답 방식 | AI | 상태 |
|---|---|---|---|---|---|---|---|
| C1 | `/start` | `commands/start.ts:4` | 도움말(명령 목록) | 없음 | `ctx.reply` HTML | 없음 | 없음 |
| C2 | `/help` | `commands/start.ts:23` | "/start 참조" | 없음 | `ctx.api.sendMessage(ctx.chat.id)` plain | 없음 | 없음 |
| C3 | `/today` | `commands/today.ts:5` | 오늘 DailySummary + 수면 요약 (DB 읽기) | 없음 | `ctx.reply` HTML | 없음 | 없음 |
| C4 | `/run` | `commands/run.ts:7` | 최근 러닝 3건 | 없음 | `ctx.reply` HTML | 없음 | 없음 |
| C5 | `/sleep` | `commands/sleep.ts:8` | 최근 수면 1건 | 없음 | `ctx.reply` HTML | 없음 | 없음 |
| C6 | `/weight` | `commands/weight.ts:6` | 체중 5건 | 없음 | `ctx.reply` HTML | 없음 | 없음 |
| C7 | `/sync` | `commands/sync.ts:6` | Garmin `syncAll`(어제~오늘 · 활동 30일 재확인) · `notifyBot: bot` | 없음 | `ctx.reply` plain ×2(시작·결과) | 없음 | 없음 |
| C8 | `/report` | `commands/report.ts:7` | 최근 리포트 표시 / `regenerate morning\|evening` 이면 강제 재생성 | `ctx.match` 자유 문자열 | `ctx.reply` + `replyLong`(HTML · 4096 분할) | **있음**(재생성 시 리포트 생성 = Claude) | 없음 |
| C9 | `/ai` | `commands/ai.ts:70` | `handleAiQuestion(detectReportRequest: true)` — 리포트 생성 요청이면 리포트, 아니면 `askAdvisor` | `ctx.match` 자유 문자열 | `ctx.reply` + `replyLong` HTML | **있음** | AI 세션 채널 `"telegram"`(메모리 Map) · 전역 `isProcessing` 락 |
| C10 | `/reset` | `commands/ai.ts:84` | `resetSession("telegram")` | 없음 | `ctx.reply` | 없음 | AI 세션 |
| C11 | `/food_kcal <id> <kcal>` | `index.ts:68`(텍스트 정규식 · `bot.command` 아님) → `food.ts:416` | 기존 FoodLog kcal 정정 | id · 정수 0~10000 | `ctx.reply` plain | 없음 | 없음 |
| H1 | `bot.on("message:text")` | `index.ts:64` | 자연어 fallback 라우터 — §2 | 자유 텍스트 | — | 분기별 | 분기별 |
| H2 | `bot.on("message:photo")` | `commands/food-photo.ts:74` | 음식 사진 → Vision 추정 → FoodLog | 사진 + 캡션 | §2 | **있음**(Vision) | 없음 |
| K1 | `bot.callbackQuery(/^food:/)` | `commands/food-edit-callback.ts:84` | FoodLog 편집(kcal·설명)/삭제/취소 — §3 | callback_data | §3 | 없음 | chat 단위 pending |
| K2 | `bot.callbackQuery(/^auto_adjust:/)` | `notifications/auto-adjust-callback.ts:312` | 자동조정 Accept/Reject/Snooze — §3 | callback_data | §3 | 없음 | DB `WorkoutAdjustment.decision` |
| M1 | `bot.use(authMiddleware)` | `index.ts:44` | §6 | | | | |
| E1 | `bot.catch` | `standalone.ts:30` | §6 | | | | |

**명령 11개**(`bot.command` 10 + 텍스트 정규식 1) · **메시지 핸들러 2** · **콜백 핸들러 2** · 미들웨어 1 · 오류 처리기 1.
grammY 플러그인(`@grammyjs/*` · conversations · session) **0** — `package.json` grep 0건. 다단계 상태는 전부 자체 구현(§2·§3).

## 2. 자유 텍스트 · AI 대화 · 사진

`index.ts:64-92` 의 `message:text` 분기 순서(코드 그대로):

| 순서 | 조건 | 처리 | 파일:줄 |
|---|---|---|---|
| 1 | `/^\/food_kcal(?:@\S+)?\b/` | `handleFoodKcalCommand` (C11) | `index.ts:68` |
| 2 | `shouldConsumeAsEditInput(chatId, text)` — 편집 pending 중 | `handleFoodEditInput` (kcal 숫자 / 설명 텍스트 입력) | `index.ts:76-80` · `food-edit-callback.ts:307` |
| 3 | `isFoodInput(text)` — 접두 `아침|조식|점심|중식|저녁|석식|간식|야식` | `handleFoodInput` — FoodLog 저장 → 반복 조회 → MFDS → AI 텍스트 추정 → 결과 + **인라인 키보드 3버튼** | `food.ts:67`·`180`·`407` |
| 4 | 그 외 | `handleAiQuestion(ctx, text, { bot })` — `askAdvisor(channel:"telegram")`(리포트 감지 off) | `index.ts:91` · `ai.ts:100` |

- **AI 대화 상태**: `askAdvisor` 세션은 `src/lib/ai/session-store.ts:21` `new Map<string, SessionEntry>()` — 채널 키 `"telegram"`(`ai.ts:85`·`125`), TTL 6h · 100k 토큰 · 메모리(재시작 시 초기화). DB 아님.
- **동시성**: `ai.ts:13` 모듈 전역 `let isProcessing = false` — 채팅 무관 1건씩.
- **식단 AI**: `handleFoodInput` 안의 AI 텍스트 추정(`estimateNutritionFromText`) · 진행 표시 `ctx.replyWithChatAction("typing")`(`food.ts:253`).
- **사진 수신 있음** (H2 · `food-photo.ts`):
  - `ctx.message.photo` 의 가장 큰 사이즈 → `ctx.api.getFile(file_id)`(`:133`) → `https://api.telegram.org/file/bot<TOKEN>/<file_path>`(`:22`·`:137`)를 `https.request` + `telegramAgent`(IPv4 강제 · `index.ts:26`)로 임시파일 다운로드 → Vision 추정
  - `message.date`(텔레그램 unix 초)를 식사 시각으로 씀(`:101`) · `message.caption` 을 끼니 접두 파싱(`:121`)
  - ack 메시지 "🖼️ 사진 분석 중…" 를 보낸 뒤 실패 시 `ctx.api.deleteMessage`(`:240`)로 지운다
  - 토큰을 `process.env.TELEGRAM_BOT_TOKEN` 에서 직접 읽는다(`:92`)
- **문서·음성·위치·스티커 등 다른 미디어 수신 0** (`bot.on` 등록이 위 2개뿐).

## 3. 인라인 키보드 · 콜백

키보드 생성 실측 (`/usr/bin/grep -n -E "reply_markup|new InlineKeyboard|remove_keyboard|force_reply" $F`):

| 키보드 | 생성 | 버튼 / callback_data | 붙는 곳 | 처리기 | Discord 판 |
|---|---|---|---|---|---|
| **식단 편집** | `buildFoodInlineKeyboard` `food-edit-callback.ts:75` | `🔢 kcal`=`food:edit:<logId>` · `📝 설명`=`food:edit-desc:<logId>` · `🗑️ 삭제`=`food:delete:<logId>` | **인바운드 응답**: `food.ts:408`(텍스트 식단) · `food-photo.ts:233`(사진) | K1 `food-edit-callback.ts:84` | **없음** |
| **편집 취소** | `buildCancelKeyboard` `:57` | `✕ 취소`=`food:edit-cancel:<logId>` | 편집 프롬프트 `:289`·`:343`·`:441` | K1 | **없음** |
| (키보드 제거) | `CLEAR_REPLY_MARKUP = { remove_keyboard: true }` `:70` | — | 편집 종료 메시지 **11곳**(`:120`·`:339`·`:363`·`:375`·`:407`·`:415`·`:437`·`:462`·`:469`·`:523`·`:531` · `grep -n CLEAR_REPLY_MARKUP` 정의 1 제외) | — | 개념 없음(텔레그램 클라이언트 reply 키보드) |
| **자동조정** | `buildAutoAdjustKeyboard` `auto-adjust.ts:63` | `✅ Accept`·`❌ Reject`·`💤 Snooze 1h` = `auto_adjust:<accept\|reject\|snooze>:<adjId>` | **아웃바운드**: `auto-adjust.ts:396`(06:30 크론) · `auto-adjust-cron.ts:79`(snooze 재전송) — 둘 다 `interactiveNotifierFor` | 텔레그램 K2 `auto-adjust-callback.ts:312` · Discord `discord-interactions.ts:11` — 둘 다 `decideAutoAdjust`(`:237`) | **있음**(M-6b-3 #151) |

- K1 의 콜백 처리 grammY 호출: `answerCallbackQuery` 10 · `editMessageReplyMarkup` 4 · `ctx.reply` 다수 (전부 `food-edit-callback.ts`). 판단 로직이 `decideAutoAdjust` 처럼 **분리돼 있지 않다** — 534줄 파일 안에서 grammY ctx 와 섞여 있다(파일별 ctx 참조 32 · §5).
- **편집 pending 은 chat 단위 메모리 Map**: `food-edit-state.ts:44` `new Map<number, PendingEdit>()` — 키가 **`number`(텔레그램 chat id)** · TTL 5분(`:24`) · 재시도 상한(`registerRetry` `:79`). 콜백(버튼) → 다음 **자유 텍스트 메시지**를 소비하는 2단계 흐름이다(force_reply 폐기 #350).
- `food:` callback_data ≈ 40자(주석 `:36`) < Discord custom_id 100자 한도(`discord-bot.ts` `MAX_CUSTOM_ID`) — 형식은 그대로 옮길 수 있다.
- **Discord 판 1/2**: 자동조정만 있다. 식단 편집·취소(K1)는 Discord 쪽 처리기가 없고, `handleDiscordButton` 은 `auto_adjust:` 외 접두사를 "알 수 없는 요청입니다." 로 거부한다(`discord-interactions.ts:11-14`).

## 4. 텔레그램 고정 아웃바운드

아웃바운드(푸시) 호출 전수 — `/usr/bin/grep -n -E "\.notify\(" $(find src -name "*.ts" -not -path "*__tests__*")` = **6**:

| # | 파일:줄 | 내용 | 파사드 | 스위치 |
|---|---|---|---|---|
| O1 | `bot/notifications/scheduler.ts:27` | 모닝·이브닝·주간 리포트 본문 | `notifierFor` | `NOTIFY_ALLOWED_CHANNEL` |
| O2 | `bot/notifications/scheduler.ts:52` | 리포트 생성 실패 안내 | `notifierFor` | 같음 |
| O3 | `bot/notifications/auto-adjust.ts:396` | 자동조정 제안 + 키보드 | `interactiveNotifierFor` | `NOTIFY_INTERACTIVE_CHANNEL` |
| O4 | `bot/notifications/auto-adjust.ts:456` | 자동조정 실패 안내 | `notifierFor` | `NOTIFY_ALLOWED_CHANNEL` |
| O5 | `bot/notifications/auto-adjust-cron.ts:79` | snooze 재전송 + 키보드 | `interactiveNotifierFor` | `NOTIFY_INTERACTIVE_CHANNEL` |
| O6 | `lib/monitoring/admin-alerts.ts:236` | 관리자 alert(Claude 인증·MCP·Garmin·Omron · 1h rate limit) | `notifierFor` | `NOTIFY_ALLOWED_CHANNEL` |

- **스위치를 타지 않는 고정 텔레그램 아웃바운드 = 0 / 6.** 그 밖의 텔레그램 API 직접 호출은 `ctx.api.*` 3건(`/help` sendMessage · getFile · deleteMessage)인데 전부 **인바운드 응답 경로**다. `bot.api` 직접 호출은 `standalone.ts:38 deleteWebhook` 1건(기동).
- fin 과 달리 fit 은 "항상 텔레그램"이라고 주석으로 고정한 아웃바운드가 없다(notifier.ts 헤더 주석 1~9줄: 키보드 메시지만 별도 스위치).
- **단, 스위치를 Discord 로 돌려도 텔레그램 `Bot` 인스턴스가 필수다** — `notifierFor(bot: Bot)` · `interactiveNotifierFor(bot: Bot)` 시그니처(`notifier.ts:62`·`:75`), `admin-alerts.ts:40` `bot: Bot | undefined` 이고 **`!bot` 이면 alert 를 건너뛴다**(`admin-alerts.ts:196` `if (!bot)` · 주석 "bot 없음 (webapp) → alert skip"). §8·§9 참조.

## 5. grammY `Context` 의존 호출 수

명령:
```bash
bash -c 'F=$(find src/bot -name "*.ts" -not -path "*__tests__*" | sort)
/usr/bin/grep -ho --binary-files=text -E "ctx\??\.[A-Za-z_]+(\??\.[A-Za-z_]+)?" $F | sed -E "s/\?//g" | sort | uniq -c | sort -rn'
```
원결과 합계 96 중 **`discord-interactions.ts` 의 5건은 Discord `DiscordButtonContext`**(customId ×2 · reply ×2 · removeButtons ×1)라 뺀다 → **grammY ctx 참조 91**.

| 종류 | 개수 | 비고 |
|---|---|---|
| `ctx.reply` | **55** (원 57 − Discord 2) | plain/HTML/키보드 응답 전부 |
| `ctx.answerCallbackQuery` | 10 | K1 9 · K2 1 |
| `ctx.chat.id` (`ctx.chat?.id` 포함) | 9 | auth · pending 키 · deleteMessage · /help |
| `ctx.editMessageReplyMarkup` | 5 | K1 4 · K2 1 |
| `ctx.replyWithChatAction` | 2 | typing (food · photo) |
| `ctx.message.text` | 2 | index.ts · food-edit-callback.ts |
| `ctx.match` | 2 | /ai · /report 인자 |
| `ctx.callbackQuery.data` | 2 | K1 · K2 |
| `ctx.message` (photo 객체) | 1 | food-photo.ts:89 → 이후 `message.photo/date/caption` 은 지역 변수 |
| `ctx.api.sendMessage` | 1 | /help |
| `ctx.api.getFile` | 1 | 사진 |
| `ctx.api.deleteMessage` | 1 | 사진 ack 정리 |
| **합계** | **91** | 열거 합 55+10+9+5+2+2+2+2+1+1+1+1 = 91 |

파일별(grammY 분 · 원 per-file 에서 discord-interactions 5 제외): food-edit-callback 32 · food 12 · food-photo 11 · ai 8 · report 5 · sync 3 · start 3 · auto-adjust-callback 3 · telegram(utils) 2 · auth 2 · index 2 · weight 2 · today 2 · sleep 2 · run 2 = **91**.
`ctx.from` **0** — 사용자 식별은 하지 않고 chat id 만 쓴다. grammY import 파일(테스트 제외) **20**(`src/bot` 18 + `src/lib/garmin/sync.ts` + `src/lib/monitoring/admin-alerts.ts` · 둘 다 `import type { Bot }`) + `daily-report.ts`·`weekly-report.ts` 의 인라인 `import("grammy").Bot` 타입 9곳.

## 6. 인가 · 미들웨어 · 오류 처리

- **인가**: `middleware/auth.ts` — `TELEGRAM_ALLOWED_CHAT_IDS`(CSV · 모듈 로드 시 1회 읽기 `:3`)에 `ctx.chat.id` 가 없거나 목록이 비면 `"접근 권한이 없습니다."` 응답 후 차단. **chat id 단위 · 사용자 id 미검사.** 모든 update(명령·텍스트·사진·콜백)에 걸린다(`bot.use` 가 등록 최상단).
- Discord 쪽 인가는 별개: gateway 가 `DISCORD_ALLOWED_USER_IDS` **AND** `DISCORD_CHANNEL_ID_FITNESS`(`discord-interactions.ts:40-41` · `packages/notify/src/discord-gateway.ts:223`).
- **rate limit 미들웨어 0** (`grep -iE "ratelimit|limiter|throttle"` src/bot 0건). 대신 AI 전역 락(`ai.ts:13`) · 편집 재시도 상한 · admin alert 1시간 rate limit(DB `SystemAlertState`).
- **오류 처리**: `bot.catch`(`standalone.ts:30` · sanitizeError 로깅) · `bot.start().catch → process.exit(1)`(`:62`) · `unhandledRejection` 로깅 · `uncaughtException → exit(1)`. 토큰 마스킹 `utils/error.ts` `TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/`(텔레그램 토큰 형식 전용) · `isNetworkError` 는 grammY timeout 문구(`GRAMMY_TIMEOUT_RE`) 인식 · `isHtmlParseError` 는 텔레그램 "can't parse entities" 인식.

## 7. 텔레그램 전용 서식 · 제약

| 항목 | 위치 | 비고 |
|---|---|---|
| `parse_mode: "HTML"` 직접 지정 | `run.ts:40` · `sleep.ts:34` · `start.ts:19` · `today.ts:39` · `weight.ts:25` · `utils/telegram.ts:30` | **6곳** |
| 텔레그램 HTML 생성기 | `utils/telegram.ts` `mdToHtml`·`escapeHtml` · `auto-adjust.ts:113` `escapeHtml` | 리포트·AI 응답은 md → 텔레그램 HTML 로 변환해 보낸다. 아웃바운드는 notify 가 Discord md 로 재변환 |
| 4096 분할 | `utils/telegram.ts:3` `MAX_MESSAGE_LENGTH=4096` + `replyLong` 자체 분할(4 호출: `ai.ts:120`·`:127` · `report.ts:22`·`:55`) · HTML 실패 시 태그 제거 폴백 | 인바운드 경로. 아웃바운드는 notify 코어(텔레그램 4096 · Discord 2000 어댑터 소유) |
| 4096 자르기 | `food-photo.ts:219-222` · `food-edit-format.ts:10` `TELEGRAM_MAX_MESSAGE_LENGTH` | 사진 응답·편집 메시지 길이 상한 |
| 파일 **전송** | **0** (`sendDocument`/`sendPhoto` 없음) | |
| 미디어 **수신** | 사진 1종(§2) — `getFile` + 파일 URL 다운로드 | |
| 위치·연락처·음성 | 0 | |
| chat action | `typing` 2곳 | |
| reply 키보드 제거 | `remove_keyboard` (§3) | 텔레그램 클라이언트 상태 정리용 |
| long polling · 웹훅 해제 | `standalone.ts:38` `deleteWebhook` · `:57` `bot.start()` · `index.ts:26-31` IPv4 agent · timeout 60s | |

## 8. 텔레그램 밖 의존

| 영역 | 실측 | 출처 |
|---|---|---|
| **웹 프로세스 크론** | `src/lib/cron.ts`(instrumentation 에서 기동) → `syncAll` 을 **`notifyBot` 없이** 호출(`cron.ts:43`) → Garmin/Omron 재인증 실패 alert 는 **웹에서는 늘 건너뛴다**(서버 로그만). 웹 API `app/api/sync/route.ts:90` 도 `notifyBot` 없음 | `admin-alerts.ts:196` `if (!bot)` |
| 웹 UI 문구 | `app/settings/profile/profile-client.tsx:443` "…Telegram push…" · `app/lifestyle/lifestyle-client.tsx:153` "텔레그램에서 … 입력" | 문구만 |
| 프롬프트 | `lib/prompts/definitions.ts:41`·`50`·`59`·`68` usage 설명 "텔레그램" · `lib/prompts/defaults/system.ts:78` 시스템 프롬프트 본문에 "텔레그램/웹" | **system.ts 는 AI 입력 본문** — 바꾸면 프롬프트 버전이 바뀐다(`ensureDefaults`) |
| AI 세션 채널 이름 | `"telegram"` (`ai.ts:85`·`125`) · `claude-advisor.ts:52` 주석 | 메모리 키일 뿐 · DB 없음 |
| MCP | `src/mcp/logger.ts:183` redact 목록에 `TELEGRAM_BOT_TOKEN` | 그 밖 MCP 의 텔레그램 의존 0 |
| **env 키** | `TELEGRAM_BOT_TOKEN`(`index.ts:33` · `food-photo.ts:92`) · `TELEGRAM_ALLOWED_CHAT_IDS`(`auth.ts:3` · `notifier.ts:31`) — **2종** · `.env.example:24-25` | |
| **DB 스키마** | `WorkoutAdjustment.telegramMessageId String?` · `telegramChatId String?` · `@@index([telegramMessageId])` (`prisma/schema.prisma:406-415` · 마이그레이션 `20260716054043_workout_adjustment` 1개) — **쓰기만, 읽기 경로 0**(notifier.ts:71 주석 · Discord 판에도 그대로 저장) | 텔레그램 식별자 저장 컬럼 2 |
| 봇 프로세스 | grammY long polling · pm2 `pleiades-fit-bot` script `dist/bot/standalone.cjs` · **`max_restarts: Number.MAX_SAFE_INTEGER`** (`deploy/pleiades.config.cjs:95-98`) · esbuild 에서 `grammy` external(`package.json:12`) · 의존성 `grammy ^1.42.0`(`:38`) | |
| 스크립트 | `scripts/verify-food-edit-pending.ts` 가 `food-edit-state` 를 검증(pending 키 형태 의존) | |
| 테스트 | grammY·텔레그램 관련: `bot/notifications/__tests__/notifier.test.ts` · `bot/utils/__tests__/telegram.test.ts` · `bot/utils/__tests__/error.test.ts` (3) | `xargs grep -l -E "grammy|ctx\.reply|callbackQuery"` |

## 9. 텔레그램을 끄면 같이 꺼지는 것 (봇 프로세스 기동 코드)

`standalone.ts` 순서: photo temp sweep → **`getBot()`** → `bot.init()` → `deleteWebhook()` → `sweepOrphanedJobs`·`startOrphanSweeper` → `ensureDefaults()` → **`startBotScheduler(bot)`** → **`startDiscordInteractions()`** → `bot.start()`.

- `getBot()` 은 `TELEGRAM_BOT_TOKEN` 이 없으면 **throw**(`index.ts:34`) → `main().catch → process.exit(1)`(`standalone.ts:96-98`). `bot.init()`·`deleteWebhook()` 도 텔레그램 네트워크 호출이고 실패하면 같은 경로로 종료. 그러면 **그 뒤 전부가 시작되지 않는다**:
  1. 리포트 크론 3종(모닝 08:00 · 이브닝 23:00 · 주간 월 07:00) — O1·O2
  2. 자동조정 제안 06:30 · 유지 크론 5분(snooze 재전송·TTL expire) — O3·O4·O5
  3. ReportJob orphan sweep(부팅 + 주기)
  4. 프롬프트 기본값 동기화 `ensureDefaults`(봇 쪽 호출)
  5. **Discord gateway**(자동조정 버튼 수신) — 텔레그램 실패면 Discord 버튼도 죽는다
  - 살아남는 것: photo temp sweeper(`getBot` 앞 · `:20-23`)
- 그리고 pm2 `max_restarts` 가 사실상 무한이라 **토큰을 빼면 크래시 루프**가 된다(재시작마다 photo sweep 만 돌고 종료).
- 스케줄러·자동조정·admin alert 는 `bot: Bot` 을 인자로 받아 notifier 에 넘긴다 — Discord 로 전부 돌려도 **텔레그램 `Bot` 객체가 생성돼 있어야** 호출이 성립한다(§4). `bot.start()`(long polling)만 끄는 것은 코드 경로가 없다.

---

## 대장 요약

| 항목 | 개수 | 출처 |
|---|---|---|
| 봇 코드(테스트 제외) | 26 파일 · 3,503줄 | `find src/bot … \| wc -l` |
| 인바운드 명령 | 11 (`bot.command` 10 + `/food_kcal` 정규식 1) | §1 C1~C11 |
| 메시지 핸들러 | 2 (`message:text` · `message:photo`) | §1 H1·H2 |
| 자유 텍스트 분기 | 4 | §2 표 |
| AI 호출 인바운드 경로 | 4 (`/ai` · `/report regenerate` · 자연어 fallback · 식단 텍스트 추정) + 사진 Vision 1 = 5 | §1·§2 |
| 콜백 처리기 | 2 (`food:` · `auto_adjust:`) | §3 |
| 키보드 빌더 | 3 (식단 3버튼 · 취소 1버튼 · 자동조정 3버튼) | §3 |
| 그중 Discord 판 있음 | 1 / 3 (자동조정) | §3 |
| 아웃바운드 `.notify` | 6 (텍스트 스위치 4 · 인터랙티브 스위치 2) | §4 O1~O6 |
| 고정 텔레그램 아웃바운드 | 0 / 6 | §4 |
| 인바운드 경로의 `ctx.api.*` 직접 호출 | 3 | §5 |
| grammY ctx 참조 | 91 (`ctx.reply` 55) | §5 표 |
| `parse_mode: "HTML"` | 6 | §7 |
| 메모리 상태 Map | 2 (AI 세션 · 편집 pending `Map<number,…>`) + 전역 락 1 | §2·§3 |
| env 키 `TELEGRAM_*` | 2 | §8 |
| DB 텔레그램 컬럼 | 2 (`WorkoutAdjustment` · 읽기 0) | §8 |
| 텔레그램 실패 시 같이 멈추는 기동 항목 | 5 | §9 |

## 가정을 뒤집는 발견

1. **"fit 은 이미 Discord 로 돌릴 수 있다"는 아웃바운드에만 맞다.** 6건 전부 스위치를 타지만(고정 0), **텔레그램 `Bot` 인스턴스 없이는 하나도 호출되지 않는다** — `notifierFor(bot: Bot)` 시그니처 · admin alert 는 `!bot` 이면 skip. 텔레그램 끄기 = 스위치 켜기가 아니라 notifier·scheduler·admin-alerts·sync·daily/weekly-report 의 `Bot` 인자 제거(시그니처 변경)다.
2. **봇 프로세스가 텔레그램 기동에 묶여 있다.** 토큰이 없거나 `bot.init()` 이 실패하면 리포트·자동조정 크론, orphan sweep, `ensureDefaults`, **Discord gateway 까지** 시작되지 않고, `max_restarts` 무한이라 크래시 루프가 된다. 텔레그램 끄기는 env 삭제로 끝나지 않고 `standalone.ts` 재구성이 필요하다.
3. **Discord gateway 는 버튼만 받는다**(`intents: 0` · `type 3 && component_type 2` 만 · `discord-gateway.ts:197`·`:220`). 인바운드 전체 전환(명령 11 · 자유 텍스트 · 사진)에 필요한 메시지 수신(MESSAGE_CREATE · MESSAGE_CONTENT intent)이나 슬래시 명령(type 2) 수신 경로는 **패키지에 없다** — 신규 구현 범위.
4. **식단 편집은 버튼 → 다음 자유 텍스트를 소비하는 2단계 흐름**이고 상태 키가 `number`(텔레그램 chat id)다. Discord 채널 ID 는 문자열 snowflake 라 키 타입부터 바뀐다. 판단 로직도 `decideAutoAdjust` 처럼 분리돼 있지 않다(grammY ctx 32 참조가 한 파일에).
5. **사진 수신이 텔레그램 파일 API 에 직접 묶여 있다** — `getFile` + `api.telegram.org/file/bot<TOKEN>` + `message.date`·`caption`. Discord 첨부 URL 다운로드로 바꾸는 별도 경로가 필요하다.
6. **웹 프로세스의 Garmin/Omron 재인증 alert 는 지금도 안 간다**(웹 크론·`/api/sync` 가 `notifyBot` 없이 `syncAll`). 텔레그램과 무관하게 Bot 객체 의존 설계의 결과다 — 전환 때 같이 풀 수 있는 결함으로 기록.
7. **시스템 프롬프트 본문에 "텔레그램" 이 들어 있다**(`lib/prompts/defaults/system.ts:78`). 바꾸면 프롬프트 버전 변경(ensureDefaults · 사용자 판정 경로)이 따라온다.

미측정: 실제 Discord 슬래시 명령/메시지 수신의 권한·intent 요구(외부 문서 확인 필요) · 사진 응답·리포트의 실제 길이 분포(2000자 Discord 한도 초과 빈도 — 서비스 DB 필요 · I-7 로 측정하지 않음).
