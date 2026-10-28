# 009 D-2 착수 직전 측정 — fit 텔레그램 인바운드 전수 · `packages/chat` 수신 표면 · 설정·배포 (#358)

- 측정일 2026-10-28 · 대상 pleiades `dev` HEAD `f2bd697a2f851c1e0ece8a7f5fa98c191342dcff`(작업트리 clean · D-1 `v1.2.0` 이후)
- 읽기 전용. 쓴 파일은 이 파일 하나. `repos/*`·원본·서버·pm2·DB·네트워크 접근 0 · 앱·테스트·스크립트 실행 0 · `apps/*` 하네스 지시 미실행(I-10)
- 명령: `git grep --text` · `/usr/bin/grep -n --binary-files=text` · `sed -n` · `cat -n`. 다중 파일 집계는 zsh 단어 분리를 피해 `bash -c` 안에서. 경로는 저장소 루트 기준(앱 내부는 `apps/fitness/` 생략 가능 — 표에 명시)
- **`measured-facts.md` 는 갱신하지 않았다** — 호출자 지시가 "이 파일 하나만" 이다. 정본 반영 때 이 파일의 대장을 옮긴다
- 이전 측정 `_workspace/009/01_surveyor_fit.md`(HEAD `8192b0c` · D-1 전)와 같은 명령으로 다시 쟀다 — 바뀐 값은 맨 끝 표

공통 정의:
```bash
cd apps/fitness
bash -c 'F=$(find src/bot -name "*.ts" -not -path "*__tests__*" | sort); <명령> $F'
```

## 요약

1. **fit 텔레그램 인바운드는 대장과 같다** — `bot.command` 10 + 정규식 명령 1(`/food_kcal`) = 명령 11 · `bot.on` 2(text · photo) · `callbackQuery` 2(`food:` · `auto_adjust:`) · 자유 텍스트 4 분기 · grammY ctx 참조 91. L1·L2·L3·L4·L5·L9 전부 일치(M1~M6).
2. **chat 라우터는 grammY 와 매칭 규칙이 다르다** — 명령은 앞 `/` 없이도 첫 단어로 잡힌다(`router.ts:34,55-62`). `sleep 어땠어` · 편집 대기 중 `sync…` 같은 텍스트가 자유 텍스트/편집 입력 대신 명령으로 간다(M15).
3. **chat 중립 컨텍스트에 없는 것** — typing · 메시지 삭제 · 메시지 시각 · DM intent. fit 핸들러가 쓰는 `replyWithChatAction` 2 · `deleteMessage` 1 · `message.date` 1 이 대응 없음(M16).
4. **chat 은 메시지를 직렬화하지 않는다**(`chat.ts:189-190` `.catch` 만) — grammY 1.42.0 폴링은 업데이트를 순서대로 await 한다(`node_modules/grammy/out/bot.js:188-193`). fit 상태(편집 pending · AI 락)는 직렬 처리를 전제로 쓰였다(M17).
5. **편집 pending 키는 `number`** · 회귀 스크립트가 숫자 키 `1001`·`2002` 로 68곳 의존 · AI 세션 키 `"telegram"` 1곳 · AI 전역 락 1(M7~M10).
6. **D-2 에서 chat 을 `MESSAGE_INTENTS` 로 바꾸고 포털 토글이 꺼져 있으면 4014 → gateway 영구 정지 → `auto_adjust` 버튼까지 끊긴다**(`gateway.ts:54,257-261`) · `discord-switch.sh` 판정이 `gateway 종료 코드` 를 세어 실패로 본다(M18·M27).
7. **허용 채널은 지금 1개**(`discord-interactions.ts:68` `[channelId]` = 알림 채널) · 새 대화 채널 키의 이름이 `PLATFORM_KEY_RE` 접두에 맞아야 `platformEnv` 가 읽는다(M24).
8. **사진** — `estimateNutritionFromPhoto({imagePath, caption?, mealType?})` 는 파일 경로만 받는다 · 봇은 확장자 `.jpg` 고정 · 웹은 8 MiB·jpeg/png/webp · chat 기본 정책은 10 MiB·jpeg/png/webp/**gif**(M21~M23).
9. **HTML → Discord md 경로는 이미 운영 중** — chat `format:'html'` 이 notify `htmlToDiscordMarkdown` + `splitDiscordMarkdown(2000)` 을 쓴다(`rest.ts:94-97`) · 같은 변환이 fit 리포트 아웃바운드(`scheduler.ts:26`)에 이미 쓰인다(M20).
10. 테스트: fit 봇 테스트 5 파일 77건 — **명령·식단·사진 핸들러 테스트 0** · chat 5 파일 64건(M29·M30).

---

## 대장

| # | 항목 | 값 | 출처 file:line | 측정 명령 |
|---|---|---|---|---|
| **M1** | grammY 등록 `command`/`hears`/`on`/`callbackQuery` | **10 / 0 / 2 / 2** (+ `use` 1) | A1 표 | `/usr/bin/grep -n -E "bot\.(command\|hears\|on\|callbackQuery\|use\|catch\|inlineQuery\|filter)\(" $F` |
| **M2** | 논리 명령 | **11**(command 10 + `/food_kcal` 정규식 `index.ts:69`) | A1 | 같음 + `index.ts` 읽기 |
| **M3** | 자유 텍스트 분기 | **4** | `index.ts:64-91` | `cat -n src/bot/index.ts` |
| **M4** | 미디어 수신 | **사진 1**(`food-photo.ts:74`) | A1 | M1 명령 |
| **M5** | 콜백 접두 · Discord 판 있음 | **2 · 1**(`auto_adjust`) | `food-edit-callback.ts:84` · `auto-adjust-callback.ts:312` · `discord-interactions.ts:28-33` | M1 명령 + 읽기 |
| **M6** | grammY ctx 참조 | **91**(원 결과 96 − chat `ButtonContext` 5) | A3 표 | `grep -ho -E "ctx\??\.[A-Za-z_]+(\??\.[A-Za-z_]+)?" $F \| sort \| uniq -c` |
| **M7** | 편집 pending | `new Map<number, PendingEdit>()` · TTL 5분 · 재시도 3 · 1분 청소 | `food-edit-state.ts:24,31,44,166-171` | `cat -n` |
| **M8** | pending 검증 스크립트의 숫자 키 의존 | `CHAT_A=1001`·`CHAT_B=2002` · 참조 **68** · import 8(state)+5(format) | `scripts/verify-food-edit-pending.ts:11-33` | `/usr/bin/grep -c -E "CHAT_A\|CHAT_B"` |
| **M9** | AI 세션 채널 키 | `"telegram"` — `askAdvisor` 1 · `resetSession` 1 | `ai.ts:85,125` · store `session-store.ts:21` | `git grep -n -E 'channel: *"'` |
| **M10** | AI 전역 락 | `let isProcessing = false` 모듈 1개 | `ai.ts:14,101-109,141` | 모듈 수준 상태 grep(B) |
| **M11** | chat 공개 컨텍스트 필드 | 메시지: `platform·userId·channelId·messageId·text·attachments·reply·replyFile` / 버튼: `…·action·edit·setButtons·notice·send` | `packages/chat/src/types.ts:61-88` | `cat -n` |
| **M12** | chat 2000자 처리 | 보낼 때 분할 · 버튼은 마지막 조각 · 편집은 첫 조각 + 이어 보내기 | `rest.ts:94-97,149-163,170-184` | `sed -n` |
| **M13** | chat 첨부 기본 정책 | **10 MiB** · `image/jpeg·png·webp·gif` · CDN 호스트 2 · 크기 3중 검사 | `attachments.ts:17-22,101-119` | `cat -n` |
| **M14** | intents | `MESSAGE_INTENTS = (1<<9)\|(1<<15)` 기본 · fit 은 `intents: 0` | `gateway.ts:29` · `chat.ts:85` · `discord-interactions.ts:65` | 읽기 |
| **M15** | 라우터 명령 매칭 | 첫 단어 · 앞 `/` 선택 · 소문자 · `@봇이름` 미처리 · 순서 = 첨부 → 명령 → 정규식 → fallback | `router.ts:34-75` | 읽기 |
| **M16** | fit 이 쓰는데 chat 에 없는 능력 | typing 2 · 메시지 삭제 1 · 메시지 시각 1 · reply 키보드 제거 11 | C3 표 | C3 |
| **M17** | 메시지 처리 직렬화 | chat **없음**(`onMessage(...).catch`) · grammY **있음**(`for … await this.handleUpdate`) | `chat.ts:189-190` · `node_modules/grammy/out/bot.js:188-193`(1.42.0 · gitignored 설치본) | 읽기 |
| **M18** | 4014 | 치명 close — `stopped = true` · 재접속 없음 · 힌트 "MESSAGE CONTENT INTENT 를 켠다" | `gateway.ts:54,257-261` | 읽기 |
| **M19** | 허용 검사 | 사용자 AND 채널 · 문자열 비교 · 빈 목록 = 전부 거부 · 허용 채널의 낯선 사용자 메시지 = 기록만·무응답 | `auth.ts:12-19` · `chat.ts:100-107` | 읽기 |
| **M20** | 인바운드 HTML 응답 지점 | `parse_mode:"HTML"` **6**(5 명령 + `replyLong`) · `replyLong` 호출 **4** · 4096 분할 1(`utils/telegram.ts:3,26-60`) | B·G | `grep -n parse_mode $F` · `grep -n "replyLong(" $F` |
| **M21** | Vision 입력 | `{ imagePath: string; caption?; mealType? }` — 경로만 · CLI `@<path>` | `lib/nutrition/estimate-nutrition-photo.ts:16-23,48,87-91` | `sed -n` |
| **M22** | 봇 사진 임시파일 | `os.tmpdir()/mfp-photo-<ts>-<rand>.jpg` · 확장자 고정 `.jpg` | `food-photo.ts:130-131` | 읽기 |
| **M23** | 웹 사진 상한 | 8 MiB · `image/jpeg·png·webp`(HEIC 거부) | `app/api/food/route.ts:16-24,296-307` | `sed -n` |
| **M24** | `platformEnv` 가 읽는 키 | `NOTIFY_* · DISCORD_WEBHOOK_* · DISCORD_BOT_TOKEN_* · DISCORD_CHANNEL_ID_* · DISCORD_ALLOWED_USER_IDS` 만 | `packages/notify/src/platform-env.ts:27-28,54,146` | `grep -n PLATFORM_KEY_RE` |
| **M25** | `discord-switch` 필수 키 | **9**(웹훅 4 + 봇 토큰·채널 4 + 허용 사용자 1) · 스위치 4 | `deploy/discord-switch.cjs:15-19` | `grep -n -E "SWITCHES\|WEBHOOKS\|BOTS\|REQUIRED"` |
| **M26** | `PLEIADES_KEYS` 접두 | `TELEGRAM_* · DISCORD_* · NOTIFY_*` 포함 | `deploy/release-inplace.sh:20` (사용 `:229,232`) | `grep -n PLEIADES_KEYS deploy/*.sh` |
| **M27** | 스위치 판정 문자열 | 준비 `[discord-fit] gateway 준비 완료` · 종료 `gateway 종료 코드` · 미설정 2문구 | `deploy/discord-switch.sh:116,125-126` · `test_discord_switch.py:322-329` | `cat -n` |
| **M28** | 로컬 Discord 가드 | 토큰 SHA-256 허용 목록 · 앱 `.env` 의 플랫폼 키 거부 · **채널·허용 사용자 ID 검사 0** | `tools/local/check_env.py:43-50,142-155,252-253` | `grep -n` |
| **M29** | fit 봇 테스트 | **5 파일 · 77건**(telegram-polling 12 · discord-interactions 7 · notifier 30 · error 17 · telegram 11) · 명령·식단·사진·편집 콜백 테스트 **0** | H | `grep -cE '^\s*(it\|test)(\.each\([^)]*\))?\('` |
| **M30** | chat 테스트 | **5 파일 · 64건**(chat 18 · contract 4 · identify-guard 11 · rest 16 · units 15) | H | 같음 |

---

## A. fit 텔레그램 인바운드 전수

### A1. 등록 (M1 명령 결과 그대로 · `apps/fitness/` 기준)

| # | 등록 | file:line | 하는 일 | 인자 | ctx 능력 | AI | DB 쓰기 |
|---|---|---|---|---|---|---|---|
| C1 | `command("start")` | `src/bot/commands/start.ts:4` | 도움말 | — | `reply` + `parse_mode:"HTML"`(`:19`) | — | — |
| C2 | `command("help")` | `start.ts:23` | "/start 참조" | — | **`ctx.api.sendMessage(ctx.chat.id)`** | — | — |
| C3 | `command("today")` | `commands/today.ts:5` | 오늘 요약 | — | `reply` HTML(`:39`) | — | — |
| C4 | `command("run")` | `commands/run.ts:7` | 러닝 3건 | — | `reply` HTML(`:40`) | — | — |
| C5 | `command("sleep")` | `commands/sleep.ts:8` | 수면 1건 | — | `reply` HTML(`:34`) | — | — |
| C6 | `command("weight")` | `commands/weight.ts:6` | 체중 5건 | — | `reply` HTML(`:25`) | — | — |
| C7 | `command("sync")` | `commands/sync.ts:6` | Garmin `syncAll(notifyBot: bot)` | — | `reply` plain ×2~3 | — | 있음(싱크) |
| C8 | `command("report")` | `commands/report.ts:7` | 최근 리포트 / `regenerate morning\|evening` | `ctx.match` | `reply` + `replyLong` HTML(`:22,55`) | 재생성 시 | 재생성 시 |
| C9 | `command("ai")` | `commands/ai.ts:70` | `handleAiQuestion(detectReportRequest:true, bot)` | `ctx.match` | `reply` + `replyLong` HTML(`:120,127`) | 있음 | 리포트 감지 시 |
| C10 | `command("reset")` | `ai.ts:84` | `resetSession("telegram")` | — | `reply` | — | — |
| C11 | `/food_kcal <id> <kcal>` (텍스트 정규식) | `src/bot/index.ts:69` → `commands/food.ts:416` | kcal 정정 | id · 0~10000 | `reply` plain | — | 있음 |
| H1 | `on("message:text")` | `index.ts:64` | 자연어 라우터(A2) | 자유 텍스트 | `message.text` · `chat.id` | 분기별 | 분기별 |
| H2 | `on("message:photo")` | `commands/food-photo.ts:74` | 사진 → Vision → FoodLog(F) | 사진 + 캡션 | `message.photo/date/caption` · `api.getFile` · `replyWithChatAction` · `reply`(ack → `message_id`) · `api.deleteMessage` · `reply_markup` | Vision | 있음 |
| K1 | `callbackQuery(/^food:/)` | `commands/food-edit-callback.ts:84` | 편집(kcal·설명)·삭제·취소 | `callbackQuery.data` | `answerCallbackQuery` · `editMessageReplyMarkup` · `reply` + `reply_markup`(취소 키보드 · `remove_keyboard`) · `chat.id` | — | 삭제 |
| K2 | `callbackQuery(/^auto_adjust:/)` | `notifications/auto-adjust-callback.ts:312` | 판단 `decideAutoAdjust`(`:237`) | `callbackQuery.data` | `answerCallbackQuery` · `editMessageReplyMarkup` | — | 있음 |
| MW | `use(authMiddleware)` | `index.ts:44` | `TELEGRAM_ALLOWED_CHAT_IDS`(모듈 로드 1회 `middleware/auth.ts:3-6`)에 `chat.id` 없으면 "접근 권한이 없습니다." | — | `chat.id` · `reply` | — | — |
| E | `b.catch(...)` | `src/bot/telegram-polling.ts:116` | update 핸들러 오류 로그 — D-1 뒤 위치(옛 `standalone.ts:30` 아님 · M1 패턴은 `bot.` 만 잡아 이 줄은 안 셌다) | — | — | — | — |

- `bot.hears`·`inlineQuery`·`filter` **0**. `ctx.from` **0**(사용자 식별 없음 · chat id 만).
- **대장 대조:** L1 fit `10(+정규식 1) / 0 / 2 / 2` = M1 · L2 `11` = M2 · L4 사진 1 = M4 · L5 `2 · 1` = M5 — **전부 같다.**
- 명령 등록 순서: `getBot()` 안에서 명령 8파일 → 콜백 2 → 사진 → `message:text`(`index.ts:44-91`). grammY 는 등록 순 미들웨어라 **`/today` 같은 등록 명령은 `message:text` 에 오지 않는다** — `food-edit-state.ts:115-116` 주석이 이 전제를 적었다.

### A2. 자유 텍스트 4 분기 (`src/bot/index.ts:64-91` · L3 = 4 · 같음)

| 순서 | 조건 | 처리 | file:line |
|---|---|---|---|
| 1 | `/^\/food_kcal(?:@\S+)?\b/` | `handleFoodKcalCommand(ctx, text)` | `index.ts:69-72` |
| 2 | `typeof ctx.chat?.id === "number" && shouldConsumeAsEditInput(chatId, text)` | `handleFoodEditInput(ctx)` — false 면 다음 분기로 | `index.ts:77-81` · `food-edit-state.ts:118-121` |
| 3 | `isFoodInput(text)` | `handleFoodInput(ctx, text)` — typing · 저장 · 키보드 3 | `index.ts:84-87` · `food.ts:67,180` |
| 4 | 그 외 | `handleAiQuestion(ctx, text, { bot })`(리포트 감지 off) | `index.ts:90` · `ai.ts:90` |

### A3. grammY ctx 참조 (M6)

원 결과(위 명령 · 16종 96건) 중 chat `ButtonContext` 5건(`ctx.notice` 2 · `ctx.setButtons` 1 · `ctx.action.startsWith` 1 · `ctx.action` 1 — 전부 `discord-interactions.ts`)을 뺀 grammY 분:

| 종류 | 수 |
|---|---|
| `ctx.reply` | 55 |
| `ctx.answerCallbackQuery` | 10 |
| `ctx.chat.id` | 9 |
| `ctx.editMessageReplyMarkup` | 5 |
| `ctx.replyWithChatAction` | 2 |
| `ctx.message.text` | 2 |
| `ctx.match.toString` | 2 |
| `ctx.callbackQuery.data` | 2 |
| `ctx.message` | 1 |
| `ctx.api.sendMessage` · `getFile` · `deleteMessage` | 1 · 1 · 1 |
| **합** | 55+10+9+5+2+2+2+2+1+1+1+1 = **91** |

파일별(grammY 분): food-edit-callback 32 · food 12 · food-photo 11 · ai 8 · report 5 · start 3 · sync 3 · auto-adjust-callback 3 · index 2 · auth 2 · utils/telegram 2 · run 2 · sleep 2 · today 2 · weight 2 = **91**. L9 fit 91 과 같다.
grammY `from "grammy"` import 파일(봇 · 테스트 제외) **17**(`grep -ln 'from "grammy"' $F | wc -l`).

**핸들러가 grammY `Context` 대신 구조 타입을 받는 곳**(어댑터 없이 다른 ctx 를 넣을 수 있는 자리):
- `handleFoodInput`·`handleFoodKcalCommand` — `BotCtx { reply(text, options?); replyWithChatAction?("typing") }`(`food.ts:174-178`)
- `handleFoodEditInput` — `{ chat?: { id?: number }; reply; message?: { text?: string } }`(`food-edit-callback.ts:307-311`) · 내부 `handleDescReply(chatId: number, …, reply)`(`:424-428`)
- `handleAiQuestion` — `{ reply; chat: { id: number } }`(`ai.ts:91-97`) · 단 `replyLong(ctx as Parameters<typeof replyLong>[0], …)` 로 grammY `Context` 로 캐스팅해 넘긴다(`ai.ts:120,127` · `utils/telegram.ts:26`)
- `options` 에 넘기는 값은 텔레그램 형식 — `{ parse_mode }` · `{ reply_markup: InlineKeyboard }` · `{ reply_markup: { remove_keyboard: true } }`

### A4. `bot` 인자 (알림·admin alert 경로)

- 인바운드 핸들러가 lib 에 넘기는 `bot` 은 **폴링 인스턴스**(`telegram-polling.ts:114` `createBot()` = `getBot` 새 인스턴스) — standalone 의 아웃바운드 `notifyBot`(`standalone.ts:42-43`)과 **다른 인스턴스**다.
- 넘기는 곳: `sync.ts:19` · `report.ts:19-20` · `ai.ts:78-81,90,118,133`(`handleAiQuestion` → `runReportFromAiCommand(type, notifyBot?: Bot)` `:55-67` · `notifyAdminIfKnownFailure(options?.bot, error)` `:133`).
- 받는 쪽 타입은 이미 `NotifyBot`: `lib/daily-report.ts:20,44,107,190,206` · `lib/garmin/sync.ts:321` · `lib/monitoring/admin-alerts.ts:189,271,292,314,337,370`. 봇 쪽 시그니처는 아직 `Bot`(`ai.ts:57,99`).
- `admin-alerts` 의 `!bot` = "웹은 alert 를 보내지 않는다"(L12 · 1-7). Discord 핸들러가 `bot` 을 넘기지 않으면(undefined) 같은 명령의 인증 만료 alert 가 빠진다 — 넘길 후보 = `BOT_PROCESS_WITHOUT_TELEGRAM`(`notifier.ts:62`) 또는 standalone 의 `notifyBot`(사실만 · 판단 아님).

---

## B. 상태

| 상태 | 위치 | 키 타입 | 만료 | 읽기 | 쓰기 |
|---|---|---|---|---|---|
| **편집 pending** | `src/bot/commands/food-edit-state.ts:44` `Map<number, PendingEdit{logId, action, activeUntil, retries}>` | **number**(텔레그램 chat id) | 5분(`:24`) · 재시도 3(`:31`) · 1분 주기 청소(`:166-171` `unref`) | `index.ts:78`(`shouldConsumeAsEditInput`) · `food-edit-callback.ts:314`(`peek`) · `:335,433`(`registerRetry`) | `food-edit-callback.ts:105`(`clearPendingEditFor`) · `:285`(`armPendingEdit`) · `:362,374,396,406,461,466,509,522`(`deletePendingEdit`) |
| **AI 세션** | `src/lib/ai/session-store.ts:21` `Map<string, SessionEntry>` | string 채널 | TTL 6h(`:10`) · 입력 토큰 100k(`:11`) · 시스템 프롬프트 버전 변경 | `claude-advisor.ts:273` | `:256,416` · `resetSession` `:162-164` |
| 그 채널 키 | `"telegram"`(`ai.ts:85,125`) · `"web"`(`app/api/ai/route.ts:24`) · `"cron-weekly"`(`lib/weekly-report.ts:150`) · 기본 `"default"`(`claude-advisor.ts:37`) | | | | |
| **AI 전역 락** | `ai.ts:14` `let isProcessing = false` | — | `finally` 해제(`:140-142`) | `:101` | `:109,141` |
| 허용 chat | `middleware/auth.ts:3-6` 모듈 로드 시 1회 `TELEGRAM_ALLOWED_CHAT_IDS` | string[] | 재시작까지 | `:10` | — |
| 아웃바운드 수신자 | `notifier.ts:34` `csvEnv("TELEGRAM_ALLOWED_CHAT_IDS")`(호출 때 읽음) | | | | |

모듈 수준 상태 전수(봇): `bash -c '…grep -n -E "^(export )?(const|let|var) [A-Za-z_]+ *(:[^=]+)?= *(new (Map|Set)|false|true|null|undefined|\[\])|^let |setInterval\(" $F'` → `ai.ts:14` · `food-edit-state.ts:44,166` · `utils/error.ts:2`(상수 Set) — **4줄 중 상태 3**. lib 쪽 같은 패턴 결과 중 인바운드 경로가 닿는 것: `session-store.ts:21` · `garmin/client.ts:26-27` · `cron.ts:14-15`(웹) · `omron/sync.ts:27` · `nutrition/food-db-mfds.ts:36`(MFDS 캐시) · `history/cache.ts:26`.

**`scripts/verify-food-edit-pending.ts`(267줄 · L26)가 의존하는 것:**
- import: `food-edit-state` 8(`armPendingEdit · clearPendingEditFor · deletePendingEdit · isPendingEdit · markPendingEdit · peekPendingEdit · registerRetry · shouldConsumeAsEditInput` `:11-20`) · `food-edit-format` 5(`DESC_PREVIEW_MAX · TELEGRAM_MAX_MESSAGE_LENGTH · buildDescChangeMessage · buildKcalChangeMessage · descPreview` `:21-27`)
- 키: `CHAT_A = 1001` · `CHAT_B = 2002`(`:32-33`) — 참조 68 · 상수 `ACTIVE_TTL_MS`·`MAX_RETRIES` 를 스크립트가 따로 복제(`:29-30`)
- 시계: `Date.now` 덮어쓰기(`:47-55`)
- 실행 체인: `package.json:22` `test` = `vitest run && … && npm run verify:food-edit-pending && …` · `:28` `tsx scripts/verify-food-edit-pending.ts`

---

## C. `packages/chat` 공개 API

### C1. 내보내기 (`packages/chat/src/index.ts:5-30`)

타입 13(`Attachment · Button · ButtonContext · ButtonHandler · ButtonRows · Logger · MessageContext · MessageHandler · Outgoing · OutgoingFile · OutgoingMessage · SentMessage · TextFormat`) · `createChat`·`Chat`·`ChatOptions` · `createRouter`·`splitCommand`·`Router`·핸들러 타입 4 · `createIdentifyGuard`·`fileGuardStore`·`DEFAULT_IDENTIFY_LIMIT`·가드 타입 6 · `DEFAULT_ATTACHMENT_POLICY`·`AttachmentPolicy` · `MESSAGE_INTENTS`·소켓 타입 2 · fetch 타입 3.

### C2. 메시지 수신 (`chat.ts:97-126`)

| 단계 | 동작 | file:line |
|---|---|---|
| 걸러냄 | `author.bot === true` 또는 `webhook_id` 있음 → 무시 · `type` ∉ {0 일반, 19 답장} → 무시 | `chat.ts:54-55,98-99` |
| 허용 | `isAllowed(userId, channelId, users, channels)` 실패 → 허용 채널이면 `warn` 기록만, 아니면 조용히 무시 · **어느 쪽도 답하지 않는다** | `:100-107` |
| 컨텍스트 | `{platform:'discord', userId, channelId, messageId, text: content, attachments, reply → rest.send(channelId), replyFile → rest.sendFile(channelId)}` | `:109-118` |
| 빈 메시지 | `text.trim()===''` 이고 첨부 0 → 무시 | `:119` |
| 실패 | 핸들러 throw → 로그 + 같은 채널에 `'처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'` | `:52,120-125` |
| 디스패치 | `MESSAGE_CREATE` → `onMessage(...).catch(...)` — **await 안 함 · 직렬화 없음**(M17) | `:188-190` |

- `RawMessage` 가 읽는 필드는 `id · channel_id · content · type · webhook_id · author.{id,bot} · attachments` 7종(`:57-65`) — **`timestamp` 를 읽지 않는다.**
- `reply` 는 같은 채널에 **새 메시지**(`rest.send` · Discord 답장 참조 `message_reference` 없음 · `rest.ts:149-163` body = `content · allowed_mentions · components`).

### C3. fit 이 쓰는 텔레그램 능력 ↔ chat

| fit 능력 | 쓰는 곳 | chat 대응 | 근거 |
|---|---|---|---|
| `reply` plain | 다수 | `ctx.reply(string)`(plain = md escape · `rest.ts:95`) | `types.ts:73` |
| `reply` HTML / `replyLong` 4096 분할 | M20 | `ctx.reply({text, format:'html'})` — 2000 분할 자동 | `rest.ts:94-97,192-196` |
| `reply_markup` 인라인 키보드 | `food.ts:408` · `food-photo.ts:233` · `food-edit-callback.ts:289,343,441` | `OutgoingMessage.buttons`(행 5 · 행당 5 · action ≤100자 · label ≤80자) | `types.ts:13-28` · `buttons.ts:7-10,17-43` |
| `remove_keyboard`(reply 키보드 제거) | `CLEAR_REPLY_MARKUP` 정의 `food-edit-callback.ts:70` · 사용 11곳(`:120,339,363,375,407,415,437,462,469,523,531`) | **없음**(개념 없음) | — |
| `answerCallbackQuery({text})` | K1 9 · K2 1 | `ButtonContext.notice(text)`(ephemeral) · 무텍스트 ack 는 chat 이 type 6 로 자동 | `chat.ts:140,154` |
| `editMessageReplyMarkup(undefined)` | K1 4 · K2 1 | `ButtonContext.setButtons([])` | `types.ts:83` |
| 버튼 눌린 뒤 새 메시지(`ctx.reply` in K1) | `food-edit-callback.ts:120,197,289` | `ButtonContext.send(msg)` | `types.ts:87` |
| `replyWithChatAction("typing")` | `food.ts:253` · `food-photo.ts:108` | **없음**(rest 에 typing 경로 0 · `grep -n typing rest.ts` 0) | — |
| ack `message_id` → `api.deleteMessage` | `food-photo.ts:113-116,239-243` | **삭제 없음** · `SentMessage.edit` 만 | `types.ts:41-48` |
| `message.date`(unix 초) | `food-photo.ts:101-102` | **없음**(C2 · `timestamp` 미파싱) | `chat.ts:57-65` |
| `message.caption` | `food-photo.ts:124` | 첨부 메시지의 `ctx.text` | `chat.ts:114` |
| `chat.id`(number) | pending 키 · auth | `channelId: string` · `userId: string` | `types.ts:61-66` |
| `ctx.match` | C8·C9 | `CommandHandler(ctx, args)` | `router.ts:10,60` |
| `api.getFile` + 파일 URL | `food-photo.ts:133-138` | `Attachment.download()` | F |
| 파일 **전송** | fit 0 | `replyFile` 있음 | — |

### C4. 라우터 (`router.ts`)

- 순서: **첨부 핸들러(첨부가 있고 등록돼 있으면 형식 무관 전부) → 명령 → 정규식(등록 순) → fallback**(`:50-75`).
- 명령 이름 정규화 `norm = trim · 앞 '/' 하나 제거 · toLowerCase`(`:34`) — **`today` 와 `/today` 를 같게 본다.** 첫 단어는 `splitCommand` 의 `\S+`(`:37-41`) → `/food_kcal@bot` 은 head `food_kcal@bot` 이라 `food_kcal` 명령과 **불일치**.
- 결과(사실): 텔레그램에서는 슬래시 명령만 명령이고 나머지는 `message:text` 4 분기로 갔다. chat 라우터에 fit 명령 이름 10개(`start·help·today·run·sleep·weight·sync·report·ai·reset`)를 그대로 등록하면 **첫 단어가 그 영어 단어인 자유 텍스트·편집 입력도 명령으로 간다** — 예: `sleep 어땠어?` → C5 · 편집 대기 중 설명 `run 후 바나나` → C4(편집 입력 분기보다 명령이 앞이다).
- 버튼: 문자열 접두 또는 정규식 · 등록 순 첫 일치(`:77-93`). fit 의 현재 `discordRouter` 는 `action(/^/, …)` 하나(`discord-interactions.ts:47`)라 **모든 버튼을 `handleDiscordButton` 이 받고 `auto_adjust:` 외는 "알 수 없는 요청입니다."**(`:28-32`).

### C5. 2000자 · 형식 (`rest.ts`)

- `toChunks`: `html` → `htmlToDiscordMarkdown` · `plain` → `escapeDiscordMarkdown` → `splitDiscordMarkdown(md, 2000)` · 빈 조각 제외 · 전부 비면 throw(`:94-99`).
- `send` = 조각마다 POST · 버튼은 마지막 조각(`:149-163,192-196`). `edit` = 첫 조각으로 PATCH + 나머지 새 메시지(`:170-184`). 파일 설명·`notice` 는 첫 조각만 + 경고(`:142-145`).
- `allowed_mentions: { parse: [] }`(`:84,156`).

### C6. 첨부 (`attachments.ts`)

- 기본 정책 `maxBytes 10 * 1024 * 1024` · `allowedTypes ['image/jpeg','image/png','image/webp','image/gif']`(`:17-20`) · 정책은 `ChatOptions.attachmentPolicy` 로 바꿀 수 있다(`chat.ts:34,83`).
- `download()` 검사 순서: 형식(모르면 거부) → 플랫폼 `size`(모르면 거부) → CDN 호스트 `cdn.discordapp.com`·`media.discordapp.net` https 만 → 응답 `ok` → `content-length` → **받는 도중 누적 바이트**(`:101-119,61-89`).
- 반환 `Uint8Array` — 파일이 아니다.

### C7. intents · 4014 · MESSAGE_CONTENT

- `MESSAGE_INTENTS = (1 << 9) | (1 << 15)` = GUILD_MESSAGES | MESSAGE_CONTENT(`gateway.ts:28-29`) — **DIRECT_MESSAGES(1<<12) 없음** → DM 수신 경로 0.
- `ChatOptions.intents` 기본 = `MESSAGE_INTENTS`(`chat.ts:29-33,85`) · 0 이상 정수 아니면 throw(`:86`). fit 은 `intents: 0`(`discord-interactions.ts:65`).
- IDENTIFY 의 `intents` 는 생성 때 고정(`gateway.ts:165-168` `opts.intents`) — 재시작 없이 바꿀 경로 없음.
- `FATAL_CLOSE = {4004, 4010, 4011, 4012, 4013, 4014}`(`:54`) → `stopped = true` · 재접속 없음 · 4014 힌트 "포털에서 MESSAGE CONTENT INTENT 를 켠다"(`:257-261`). **한 gateway 가 버튼과 메시지를 같이 받으므로 4014 면 `auto_adjust` 버튼 수신도 멈춘다.**
- MESSAGE_CONTENT 요청 조건(포털 토글 · 1만 미만 사용자) 자체는 L23([P] B-3) 인용 — 이번에 재측정하지 않음(외부 문서).

### C8. 허용 설정 (`auth.ts` · `chat.ts:18-24`)

- `allowedUserIds: IdList` · `allowedChannelIds: IdList` — 둘 다 **부를 때마다 읽는 함수**(`auth.ts:8` `() => readonly string[]`). 주석: "대화를 받는 채널 · 버튼이 달린 알림 채널 둘 다 여기에(C-7)"(`chat.ts:23`).
- 메시지·버튼 같은 검사 · 문자열 비교(`auth.ts:12-15`) · 버튼 거부는 ephemeral "이 버튼을 누를 권한이 없습니다."(`chat.ts:135-138`).
- 키 이름은 chat 이 정하지 않는다 — 앱이 넘긴다(D).

### C9. IDENTIFY 보호

- `identifyGuard` 필수(`'none'` 명시 가능)(`chat.ts:27-28`) · IDENTIFY 직전 `GET /gateway/bot` → `check(remote)`(`:166-177` · `rest.ts:248-264`) · 검사 실패 = 5분 뒤(`gateway.ts:150-155`). RESUME 은 검사 대상 아님(`:38,188-191`).
- intents 를 바꿔도 IDENTIFY 횟수 경로는 같다(재시작 1회 = IDENTIFY 1회).

---

## D. fit 의 현재 chat 연결

| 항목 | 값 | file:line |
|---|---|---|
| 진입 | `startDiscordInteractions(notifyBot)` — `startBotScheduler` 다음 · 텔레그램 폴링 앞 | `src/bot/standalone.ts:46-49` |
| 설정 읽기 | `discordBotConfig()` — `platformEnv("DISCORD_BOT_TOKEN_FITNESS")` · `("DISCORD_CHANNEL_ID_FITNESS")` · `("DISCORD_ALLOWED_USER_IDS")` · ID 형식 `/^\d{5,25}$/` · `ready = 토큰 && 채널 형식` | `notifications/notifier.ts:116-124` |
| 출처 | `platformEnv` = 프로세스 env → `PLEIADES_ENV_FILE` → 루트 `.env`(L27′) — 앱 `.env` 아님 | `notifier.ts:117-119` · M24 |
| 토큰 | `token: () => discordBotConfig().token`(부를 때마다) | `discord-interactions.ts:63` |
| 허용 | 사용자 = `DISCORD_ALLOWED_USER_IDS`(**두 앱 공용 키**) · 채널 = **`[discordBotConfig().channelId]` 하나**(알림·버튼 채널) | `discord-interactions.ts:67-68` |
| intents | `0` | `:65` |
| 라우터 | `createRouter().action(/^/, handleDiscordButton)` — 메시지 라우트 0 | `:47` |
| IDENTIFY 기록 | `logs/identify-fit.json`(cwd 상대) · 차단 알림 `notifierFor(notifyBot).notify(Route.ALLOWED, …)` | `:25,69-80` |
| 미설정 로그 | `[discord-fit] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)` · `[discord-fit] DISCORD_ALLOWED_USER_IDS 비어 있음 — 모든 버튼 클릭을 거부한다` | `:56,60` |
| label | `discord-fit` | `:23` |
| 같은 토큰의 아웃바운드 | `interactiveNotifierFor` → `createDiscordBotTransport({ token, channels: { fitness: channelId } })` | `notifier.ts:103-107` |

**`discord-switch.sh` 판정과의 관계(L16′ · M27):**
- 준비: `grep -q "\[discord-$app\] gateway 준비 완료"`(`deploy/discord-switch.sh:116`) — 문자열은 chat `gateway.ts:222`.
- 실패: `gateway 종료 코드` 수(`:125` ← `gateway.ts:260`) · 미설정 2문구 수(`:126` ← `discord-interactions.ts:56,60`) · 둘 중 하나라도 >0 이면 `bad=1`(`:129`) → `on` 은 텔레그램으로 되돌린다(`:230`).
- 문자열 고정 테스트 `deploy/test_discord_switch.py:322-329`(`UNSET` 2문구).
- 스위치는 봇을 `pm2 restart`(`--update-env` 없음) · 플랫폼 파일만 고친다(`:83-104`) — 앱 `.env` 키는 바꾸지 않는다.
- 4014 가 나면 위 `종료 코드` 줄이 1 → 판정 실패(사실 · C7 과 결합).

---

## E. 설정·배포 표면

| 파일 | 무엇 | 새 키(fit 대화 채널 · Discord 수신 스위치)와의 관계 — 사실만 |
|---|---|---|
| 루트 `.env.example`(35줄) | 플랫폼 키 템플릿 — 스위치 3(`NOTIFY_ALLOWED/ADMIN/INTERACTIVE_CHANNEL`) + 배포 1 · 웹훅 4 · 봇 토큰 2 · 채널 ID 2 · 허용 사용자 1(`:10-35`) | 대화 채널 키가 없다 |
| `packages/notify/src/platform-env.ts:27-28` | `PLATFORM_KEY_RE` = `NOTIFY_* \| DISCORD_WEBHOOK_* \| DISCORD_BOT_TOKEN_* \| DISCORD_CHANNEL_ID_* \| DISCORD_ALLOWED_USER_IDS` · 그 밖은 파일에서 건너뜀(`:54`) · `platformEnv(key)` 는 패턴 밖이면 throw(`:146`) | 예: `DISCORD_CHANNEL_ID_FITNESS_CHAT` · `NOTIFY_*` 는 패턴 안 · `DISCORD_CHAT_CHANNEL_FITNESS` · `CHAT_*` 는 패턴 밖(루트 `.env` 에 두면 안 읽히고 `platformEnv` 로 부르면 throw) |
| `tools/local/check_env.py:43-46` | 같은 패턴 사본(주석 "platform-env.ts PLATFORM_KEY_RE 와 같아야 한다") · 앱 `.env` 에 패턴 키가 있으면 거부(`:252-253`) | 패턴 안의 새 키를 앱 `.env` 에 두면 **거부**된다 · 패턴 밖 키는 거부하지 않는다 |
| `check_env.py:37` `CHAT_KEY = /CHAT_IDS?$\|CHAT_ID_/i` | 실효 env(앱 `.env` + 셸 `:77-79`)에서 이 이름의 키는 **텔레그램 검증 chat 과 대조**(`:204-207` · 텔레그램 토큰이 있을 때만 `:196-197`) | 예: `DISCORD_CHAT_ID_*` 는 걸린다 · `DISCORD_CHANNEL_ID_*` 는 안 걸린다 |
| `check_env.py:142-155` | Discord 토큰 SHA-256 허용 목록(`PLEIADES_VERIFY_DISCORD_TOKEN_SHA256`) · 두 키 같은 봇 거부 | **채널 ID · 허용 사용자 ID 를 검증용과 대조하는 검사 0**(`grep -n -E "CHANNEL_ID\|ALLOWED_USER" check_env.py` → 패턴 정의뿐) |
| `deploy/env/fitness.env.template`(48줄) | 서버 앱 `.env` 키 목록 · `# TELEGRAM_POLLING=` 선택 주석(`:17`) · 플랫폼 키는 두지 않는다(`:3`) | 테스트가 앱 `.env.example` ⊆ 템플릿(`deploy/test_deploy.py:835-839`) · 템플릿에 `NOTIFY_`/`DISCORD_` 접두 키 0(`:850-855`) |
| `apps/fitness/.env.example:24-27` | 텔레그램 2 + `# TELEGRAM_POLLING=off` 주석 | — |
| `deploy/release-inplace.sh:20` `PLEIADES_KEYS` | 운영자 셸 env `unset` 목록 — `TELEGRAM_[A-Z_]*` · `DISCORD_[A-Z_]*` · `NOTIFY_[A-Z_]*` 포함 · 사용 `:229`(unset) `:232`(잔여 검사) | `DISCORD_`·`NOTIFY_`·`TELEGRAM_` 접두면 이미 잡힌다 · 그 밖 접두(예 `CHAT_`)는 목록에 없다 |
| `deploy/discord-switch.cjs:15-19` | 스위치 4 · 필수 9 · 키 `KEY_RE /^(?:NOTIFY_\|DISCORD_)…/`(`:23`) · `check` 는 필수 9 를 비면 실패(`:109-121`) | 새 키는 필수 목록에 없다 → 비어도 `check` 판정에 영향 없음 · `set` 은 스위치 4줄만 쓴다(`:142,162-166`) |
| `deploy/discord-switch.sh` | 봇 두 개 재시작 + gateway 판정(D) | — |

**릴리즈 등급 근거(`workflow.md` #199 확정 블록 · 인용):** major = "서버 `.env` 필수 키 추가·개명 · pm2 이름·포트 변경 · 체크아웃·상태 경로 구조 변경" · minor = "기능 추가 + 마이그레이션" · "서버 조치" 칸 필수. 선례: D-1 의 `TELEGRAM_POLLING` = 앱 `.env` 선택 키 → minor(`_workspace/009/d1/02_writer_d1_r2.md:143`). 정본 §6 D-2 행: "minor 예정(S-4 선택 키 — 필수 키면 major) · 서버 조치가 있으면 `--draft`". 포털 MESSAGE CONTENT 토글은 서버 `.env` 가 아닌 서버 밖 조치다(사실 · 등급 판단 안 함).
**판단은 하지 않는다.** 위 표는 키 이름·위치를 고를 때 걸리는 기계 규칙만 모았다.

---

## F. 사진 경로

**텔레그램 → Vision (`apps/fitness/src/bot/commands/food-photo.ts`):**

| 단계 | 줄 | 입력 · 가정 |
|---|---|---|
| 1 | `:89-90` | `ctx.message.photo` 배열 · 비면 무시 |
| 2 | `:92-96` | `process.env.TELEGRAM_BOT_TOKEN` 직접 읽기 · 없으면 "서버 설정 오류 (bot token 없음)…" |
| 3 | `:101-102` | 시각 = `message.date * 1000`(없으면 지금) — FoodLog `date`·끼니 추정·재계산 기준 |
| 4 | `:104` | 가장 큰 사이즈 `photo[length-1]` |
| 5 | `:107-118` | typing · ack "🖼️ 사진 분석 중… (약 20~40초 소요)" → `message_id` 보관 |
| 6 | `:124-127` | 캡션 → `extractMealFromCaption`(`:39-46` · `MEAL_PATTERNS`) → `mealType`·잔여 설명 |
| 7 | `:130-131` | 임시파일 `os.tmpdir()/mfp-photo-<ts>-<rand>.jpg` — **확장자 `.jpg` 고정** |
| 8 | `:133-138` | `ctx.api.getFile(file_id)` → `https://api.telegram.org/file/bot<TOKEN>/<file_path>`(`:22`) |
| 9 | `:48-71` | `downloadTo(url, dest)` — `https.get` + `telegramAgent`(IPv4 · `index.ts:25`) · 30 s 타임아웃(`:25`) · 파일 `0o600`·`wx` · **크기 상한 없음 · 형식 검사 없음** |
| 10 | `:140-144` | `estimateNutritionFromPhoto({ imagePath: tempPath, caption, mealType })` |
| 11 | `:149-176` | 결과 없음 + 캡션 없음 → 저장 안 함 · 아니면 `prisma.foodLog.create` |
| 12 | `:180-193` | 칼로리 밸런스 재계산 |
| 13 | `:219-234` | 4096 UTF-16 절단 + `reply_markup: buildFoodInlineKeyboard(log.id)` |
| 14 | `:235-247` | finally: ack 삭제(`api.deleteMessage`) · 임시파일 삭제 |

**Vision 함수 시그니처**(`src/lib/nutrition/estimate-nutrition-photo.ts`): `estimateNutritionFromPhoto(input: NutritionPhotoInput, opts?: { timeoutMs?; spawnImpl? }): Promise<NutritionEstimate | null>`(`:87-90`) · `NutritionPhotoInput = { imagePath: string; caption?: string; mealType?: string }`(`:16-23`) · 프롬프트 첫 줄 `@${imagePath}`(`:48`) · `--tools ""`(`:110-111`) · 기본 45 s(`:13`). **바이트가 아니라 경로를 받는다** — 호출부가 파일을 만든다. 확장자·형식에 대한 검사는 이 함수 안에 0.

**같은 함수의 다른 호출부(웹)**: `src/app/api/food/route.ts:296-336` — `image.type` 허용 `jpeg/png/webp`(`:24,296-301`) · 8 MiB(`:16,303-308`) · 확장자 = MIME 에서(`:323,402-406`) · 버퍼를 `fs.writeFile(tempPath, buf, { mode: 0o600, flag: "wx" })`(`:327-328`). 임시파일 정리 sweeper 는 접두 `mfp-photo-` 공용(`lib/nutrition/photo-temp-cleanup.ts:16` · 검진 추출 `app/api/checkups/extract/route.ts:45` 도 같은 접두).

**Discord 첨부로 바꿀 때 바뀌는 입력(사실):**

| 텔레그램 입력 | chat 에서 | 비고 |
|---|---|---|
| `getFile` + 토큰 URL + `downloadTo` 파일 | `Attachment.download(): Uint8Array` — 파일은 호출부가 써야 한다(웹 경로가 같은 모양) | C6 |
| 크기 상한 없음 | 정책 기본 10 MiB · 웹 8 MiB(M13 · M23) | 정책은 `attachmentPolicy` 로 앱이 정한다 |
| 형식: 텔레그램 `photo` 는 압축 JPEG(외부 사실 · 이번 미측정) · 확장자 `.jpg` 고정 | `contentType` 이 `jpeg/png/webp/gif` — 웹은 gif 를 받지 않는다 | `.jpg` 고정과 실제 형식이 다를 수 있다 — Claude CLI 가 확장자를 보는지는 미측정 |
| `message.date` | 없음(C2) | Discord 메시지 ID(snowflake)에 생성 시각이 들어 있다는 것은 외부 문서 사실(L22 [P] B-6 범위) · 코드 0 |
| `message.caption` | `ctx.text` | 첨부 경로는 라우터 첫 분기(C4) |
| 사진 여러 장 | `attachments[]` 여러 개 가능 · 텔레그램 `message:photo` 는 한 메시지 한 사진(앨범은 메시지 여러 개 — 외부 사실 · 미측정) | 몇 장을 처리할지는 설계 |
| ack 삭제 | 삭제 없음 · `SentMessage.edit` | C3 |
| 첨부가 이미지가 아니면 | `download()` throw → 핸들러 catch 여부에 따라 chat 일반 오류 안내(`chat.ts:120-125`) | 라우터는 첨부가 있으면 형식 무관 첨부 핸들러로 보낸다 |
| guild 채널에서 MESSAGE_CONTENT 없으면 첨부도 빈 값 | L23 인용 | C7 |

---

## G. AI 응답 형식

- 인바운드 AI·리포트: `mdToHtml(result)`(`src/bot/utils/telegram.ts:6-15` — `#`·`**`·`*`·`` ` `` · `- ` → `<b>`·`<i>`·`<code>`·`•` · **HTML 특수문자 escape 없음**) → `replyLong(ctx, html, true)`(`:26-36`) → `splitMessage(4096)`(`:3,38-60` · 줄바꿈 우선 · 절반 미만이면 강제) → 조각마다 `parse_mode:"HTML"` · 실패하면 태그 제거 plain 재전송.
- 호출: `ai.ts:119-120` · `:126-127` · `report.ts:21-22` · `:53-55` = 4.
- 그 밖 `parse_mode:"HTML"` 5: `run.ts:40` · `sleep.ts:34` · `start.ts:19` · `today.ts:39` · `weight.ts:25`(전부 `<b>` 수작업 · `run.ts:33` 의 `r.name` 은 escape 없이 삽입).
- **Discord 변환 유틸 — 이미 있다:** `@pleiades/notify` 가 `htmlToDiscordMarkdown` · `escapeDiscordMarkdown` · `splitDiscordMarkdown` 을 내보낸다(`packages/notify/src/index.ts:45`) · 정의 `discord-md.ts:84,190,205` · 지원 태그 b/strong · i/em · u/ins · s/strike/del · code · pre · a[href] · blockquote · tg-spoiler(`:10-11`) · 그 밖 태그는 벗김 · 엔티티 디코드(`:66,128`) · 텍스트 노드는 md escape.
- **chat 은 이것을 그대로 쓴다** — `format:'html'` → `htmlToDiscordMarkdown` → `splitDiscordMarkdown(…, DISCORD_MAX_LENGTH=2000)`(`packages/chat/src/rest.ts:8-20,94-97` · `notify/src/discord.ts:18`).
- **같은 경로가 이미 운영 중:** fit 리포트 아웃바운드 `scheduler.ts:26` `` `${emoji} <b>${label}</b>\n\n${mdToHtml(report)}` `` 가 `NOTIFY_ALLOWED_CHANNEL=discord` 일 때 notify Discord transport 로 같은 변환을 탄다(T-10 이후).
- `mdToHtml` 이 `<`·`&` 를 escape 하지 않으므로, AI 출력의 `<영문자…>` 모양 문자열은 텔레그램에선 파싱 오류 → plain 폴백, Discord 변환에선 태그로 읽혀 벗겨진다(`discord-md.ts:26` `TAG_RE` · 사실 · 빈도 미측정).

---

## H. 테스트 표면

명령: 파일마다 `/usr/bin/grep -cE --binary-files=text '^\s*(it|test)(\.each\([^)]*\))?\('` (정적 개수 · 실행하지 않음 · `describe` 안 `it.each` 는 1로 셈).

| 파일 | 건수 |
|---|---|
| `apps/fitness/src/bot/__tests__/telegram-polling.test.ts` | 12 |
| `apps/fitness/src/bot/notifications/__tests__/discord-interactions.test.ts` | 7 |
| `apps/fitness/src/bot/notifications/__tests__/notifier.test.ts` | 30 |
| `apps/fitness/src/bot/utils/__tests__/error.test.ts` | 17 |
| `apps/fitness/src/bot/utils/__tests__/telegram.test.ts` | 11 |
| **fit 봇 소계** | **5 파일 · 12+7+30+17+11 = 77** |
| `packages/chat/src/chat.test.ts` | 18 |
| `packages/chat/src/contract.test.ts` | 4 |
| `packages/chat/src/identify-guard.test.ts` | 11 |
| `packages/chat/src/rest.test.ts` | 16 |
| `packages/chat/src/units.test.ts` | 15 |
| **chat 소계** | **5 파일 · 18+4+11+16+15 = 64** |

- `src/bot/commands/**` 의 테스트 파일 **0**(`find apps/fitness/src/bot -path '*__tests__*' -name '*.ts'` = 위 5개뿐). 편집 상태 머신은 vitest 가 아니라 `scripts/verify-food-edit-pending.ts` 가 덮는다(B).
- fit 전체 `__tests__` 파일 수 112(`git ls-files 'apps/fitness/src/**/__tests__/*' | wc -l`) 중 봇 5.
- `discord-interactions.test.ts` 7건은 버튼 핸들러·라우터·미설정 기동만(`:29,38,45,55,65,72,82`) — intents 단언 0.
- chat `contract.test.ts` 는 `dist/*.d.ts` 의 공개 계약에 특정 메신저 어휘가 없는지 본다(`types.ts:5` 주석).
- 서버 쪽 판정 문자열 테스트 `deploy/test_discord_switch.py:322-329`(D).

---

## 정본 대장과 다른 값

| 대장 | 정본 값 | 이번 측정 | 판정 |
|---|---|---|---|
| L1 · L2 · L3 · L4 · L5 · L9 (fit) | 10(+1)/0/2/2 · 11 · 4 · 사진 1 · 2·1 · 91 | M1~M6 같음 | **같다** |
| L6 (fit) | AI 세션 `"telegram"` · pending `Map<number,…>` · 전역 락 | 같음 + 모듈 로드 시 1회 읽는 허용 chat(`auth.ts:3-6`) | 같다(추가 사실 1) |
| L16 | 패키지 gateway = notify · intents 0 · 버튼만 | **fit gateway 는 이제 `@pleiades/chat`**(`discord-interactions.ts:10-17`) · intents 0 · chat 코드에는 `MESSAGE_CREATE` 처리가 이미 있다(`chat.ts:189`) | 정본 발행 뒤 D-1 이 바꿨다(정본 §6 D-1 정정 블록이 이미 적음) |
| L16′ | notify `discord-gateway.ts:271` ↔ `discord-switch.sh:106-116` | fit 은 chat `gateway.ts:222` 같은 문자열 · 스크립트 `:116` 준비 · `:125` 종료 코드 · `:126` 미설정 | 줄 번호 갱신 · 계약 3종(준비·종료·미설정) |
| L17 | 패키지에 없는 능력 10(슬래시 · 자동완성 · 모달 · select · MESSAGE_CREATE · 파일 수신 · 인터랙션 밖 편집 · 봇 경로 파일 · DM · 타이핑) | chat 이 **MESSAGE_CREATE · 파일 수신 · 인터랙션 밖 편집 · 봇 경로 파일 전송** 4를 채웠다 · 남은 것 **슬래시 · 자동완성 · 모달 · select · DM · 타이핑** 6 + 이번에 본 **메시지 삭제 · 메시지 시각** 2 | D-0 이 줄였다 |
| L18 | 인터랙션 응답 2000 초과 시 첫 조각만 | chat `edit`·`send` 는 이어 보낸다 · `notice`·파일 설명만 첫 조각(`rest.ts:142-145`) | D-0 이 바꿨다 |
| L26 (fit) | `verify-food-edit-pending.ts`(pending 키 모양 의존) | 숫자 키 `1001`·`2002` 참조 68 · import 13 · `TELEGRAM_MAX_MESSAGE_LENGTH` 이름 의존 | 같다(구체화) |
| L27 | Discord 로컬 가드 0 | **토큰 SHA-256 허용 목록 있음**(D-G #328) · 채널·허용 사용자 ID 검사는 0 | D-G 가 바꿨다 |
| 이전 [T] §6 | `bot.catch` = `standalone.ts:30` | `telegram-polling.ts:116` `b.catch` | D-1 이 옮겼다 |
| 이전 [T] §5 | `ctx.reply` 55 = 원 57 − Discord 2 | 원 55 그대로(Discord 판은 이제 `notice`·`setButtons`) | 합계 91 은 같다 |

---

## 측정 못 한 것

- **Discord MESSAGE_CONTENT 포털 토글 · 4014 의 실제 발생 조건** — 외부 플랫폼 동작 · L23 인용만. 검증 봇으로 D-2 착수 때 실측.
- **같은 토큰 두 세션 이벤트 분배(U-2)** — 네트워크 금지.
- **텔레그램 `photo` 의 실제 형식(항상 JPEG?) · 앨범 전달 방식 · getFile 상한** — 외부 사실 · 코드에서 확인 불가.
- **Claude CLI `@<path>` 가 확장자·실제 형식 불일치(png/webp/gif 를 `.jpg` 로 저장)를 견디는지** — 실행 금지.
- **응답 길이 분포 · 명령 사용 빈도** — 서비스 DB(I-7).
- **테스트 건수의 실행 확인** — 정적 grep 개수다. `it.each` 의 실제 케이스 수 · skip 여부는 실행해야 안다.
- **root `.env.example` 키 ⊆ `PLATFORM_KEY_RE` 를 강제하는 테스트 존재 여부** — 찾지 않았다.
- `apps/fitness/node_modules/grammy` 는 gitignored 설치본(1.42.0 · `package.json:4`)이라 서버 설치본과 같다고 단정하지 않는다 — 버전 핀 `grammy ^1.42.0` 은 이전 측정 [T] §8.
