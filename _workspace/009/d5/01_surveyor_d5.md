# 009 D-5 측정 — 텔레그램 제거 설계 입력

측정 2026-11-03 · 브랜치 `chore/438-1` = `dev` = `b1c3e68` · 최신 태그 `v1.5.4` · 이슈 #438 · 실행 `repo-surveyor`
이 문서는 사실과 근거만 적는다(설계안·권고 없음). 서버·pm2·서비스 DB 접근 0 · 앱 설치·빌드·테스트 실행 0 · 코드 변경 0.

**착수 조건 현황(#438 코멘트):** Q4·Q6 J3·J5 = 이상 없음(사용자 2026-11-03) · 관찰 기간 = 3일 → 11-05 오전까지 · 제거 릴리즈는 그 뒤.

**측정 주의.**
- 줄 수는 패턴이 걸린 **줄**이다(출현 횟수 아님). 패턴 `telegram|grammy|텔레그램`(대소문자 무시)은 "long polling" 만 쓴 줄을 잡지 않는다(예: `apps/finance/CLAUDE.md:87`).
- `git grep -- 'apps/*/src'` 는 0건 오탐이었다(와일드카드가 경로 전체와 맞는다 · `release-inplace.sh:207-208` 주석과 같은 함정). 아래 수치는 `'apps/*/src/*'` 또는 열거 경로로 다시 쟀다.
- import 그래프는 `git ls-files` 소스의 정적 import 를 스크립트로 해석했다(`@/` · 상대 경로). 번들 실제 내용은 빌드하지 않아 **미측정**이다.

## M1 전수

**명령:** `git grep --text -ic -E 'telegram|grammy|텔레그램'` → **430 파일 · 3,938 줄**(합계는 아래 분류 열거의 합 · 파일별 열거는 부록 A).

| 분류 | 파일 | 줄 | 범위 |
|---|---:|---:|---|
| 런타임 코드 | 118 | 817 | `apps/*/src`·`apps/*/scripts` 비테스트 · `packages/notify/src` · `deploy/*` 스크립트 |
| 테스트 | 54 | 483 | `__tests__` · `*.test.ts` · `deploy|tools/test_*.py` · `telegram-fake.ts` |
| env 템플릿 | 7 | 32 | 루트·앱 `.env.example` · `deploy/env/*` · `tools/local/env/*` |
| 가드 | 3 | 13 | `check_env.py` · `run.sh` · `isolation.md` |
| 런북 | 7 | 30 | `docs/runbooks/*` |
| 이력 문서(루트) | 117 | 2,094 | `_workspace` 81/1,605 · `docs/specs` 9/201 · `docs/research` 1/152 · `docs/handoff` 23/100 · `docs/artifacts` 1/21 · `CLAUDE.md` 1/14 · `README.md` 1/1 |
| 이력 문서(앱) | 102 | 372 | `apps/*/docs/**` · `apps/finance/README.md` |
| DB 스키마·마이그레이션 | 3 | 10 | 두 스키마 · fit 마이그레이션 1 |
| 앱 하네스 | 6 | 14 | `apps/finance/.claude/*` 5 + `apps/finance/CLAUDE.md` · fit 0 |
| 의존성 | 4 | 16 | 앱 `package.json`·lock |
| 앱 안 옛 배포(I-19 · 실행 금지) | 5 | 43 | `apps/*/.github/workflows/deploy.yml` · `apps/*/deploy/deploy.sh` · `apps/fitness/ecosystem.config.js` |
| 소진 하네스(루트) | 2 | 5 | `.claude/agents/dual-repo-operator.md` · `.claude/skills/dual-repo-change/SKILL.md` |
| 현행 문서 | 2 | 9 | `packages/notify/README.md` · `tools/local/README.md` |
| **합** | **430** | **3,938** | |

런타임 118 분해: fin 58/434(코드 줄 226 · 주석만 파일 10) · fit 40/266(146 · 14) · deploy 8/62(39 · 1) · notify 12/55(19 · 6). 주석 판정 = 줄이 `//` `*` `/*` `#` 로 시작.
테스트 54 분해: fin 24/221 · fit 11/128 · notify 10/38 · deploy 6/79 · tools 2/16 · chat 1/1(`contract.test.ts:16` 금지어 목록).

## M2 지울 수 있는 것과 공유 코드

### grammY import 지점(제품 코드)

| 앱 | 값 형태 import | `import type` |
|---|---|---|
| fin | `bot/index.ts:1`(`new Bot` `:40`) · `notifications/rsu.ts:13`(`InlineKeyboard` `:173`) · `notifications/quarterly-report.ts:9`(`InputFile` `:87`) · `utils/telegram-reply.ts:15` · `middleware/auth.ts:1` · `utils/telegram.ts:8` · `commands/expense.ts:1` · `commands/trade.ts:1` · `commands/vest-confirm.ts:13` | `commands/` 14 파일 · `notifications/notifier.ts:24` · `telegram-polling.ts:8` |
| fit | `bot/index.ts:1` · `notifications/auto-adjust.ts:9`(`InlineKeyboard` `:64`) · `utils/telegram-reply.ts:6` | `commands/` 10 파일(`ai`·`food-edit-callback`·`food-photo`·`report`·`run`·`sleep`·`start`·`sync`·`today`·`weight`) · `middleware/auth.ts:1` · `notifications/auto-adjust-callback.ts:5` · `notifications/notifier.ts:15` · `telegram-polling.ts:8` |

fin 표의 `auth`·`telegram`·`expense`·`trade`·`vest-confirm` 은 `import {…}` 문법이지만 코드 안 쓰임은 타입 자리다(`new`·호출 없음을 위 grep 으로 확인 · esbuild 제거 여부는 미측정).

### 도달성(`bot/index.ts` 를 그래프에서 뺀 뒤 진입점별 도달 · 진입점 = web·mcp·`bot/discord`+`discord-interactions`·`scheduler`·`lib/cron*`)

| 구분 | fin | fit |
|---|---|---|
| **어떤 진입점에서도 닿지 않음(텔레그램 전용)** | `telegram-polling.ts` 163 · `middleware/auth.ts` 37 · `bot/index.ts` 94(단 `notifyBot` 은 아래 공유) · `standalone.ts` 만 쓰는 것 | `telegram-polling.ts` 163 · `middleware/auth.ts` 15 · `bot/index.ts` 73 · `commands/food-photo.ts` 150 |
| **`utils/telegram-reply.ts`** | 97 LOC · 16 명령 파일이 import — 전부 `register*` 안에서만 쓴다(`telegramOutput` 등). Discord 경로(`discord/*`)의 import 0 | 76 LOC · 10 명령 파일 + `index.ts` · Discord 경로 import 0 |
| **공유: `bot/index.ts` 의 `notifyBot()`** (`:91-93`) | 15 알림·lib 파일이 import(`active-review` · `alert-dispatcher` · `briefing` · `budget-alert` · `custom-strategy-alert` · `daily` · `monthly-report` · `monthly` · `networth-snapshot` · `price-alert` · `quarterly-report` · `quarterly` · `rsu` · `ta-signal-alert` · `lib/ai/advisor-monitor`) | 해당 없음 — `index.ts` importer = `standalone` · `food-photo` |
| **공유: 파일 이름만 텔레그램** | `utils/telegram.ts`(`escapeHtml`·`h` 는 25 importer · `replyHtml` 등은 `telegram-reply` 만) · `utils/markdown.ts` `markdownToTelegramHtml`(6 importer · 크론 포함) | `utils/telegram.ts`(`mdToHtml` = `ai`·`report`·`scheduler` · `replyLong` = `telegram-reply` 만) · `commands/food-edit-format.ts:10` `TELEGRAM_MAX_MESSAGE_LENGTH` |
| **공유: 한 파일에 판단 + 등록** | `commands/*` 17 파일 — `register*` 합 322 LOC(ai 42 · expense 47 · budget 37 · trade 33 · vest-confirm 23 · 나머지 12 파일 140) · 그 밖 텔레그램 어댑터 함수(`briefing.ts:155` `telegramBriefingTarget` 등)는 합에 없다 | 10 파일 — `register*` 합 73 LOC(`auto-adjust-callback` 16 · `ai` 12 · `food-edit-callback` 9 · `start` 6 · 나머지 6 파일 30) |
| **공유: 텔레그램 어휘 이름을 Discord 가 호출** | `discord/router.ts:23,205` `alertArgsFromTelegram`(`alert.ts:21`) · `core/state-key.ts:15,24` `telegramStateKey`·`telegramMessageKey`(Discord 경로는 `discord*` 쪽만) | `core/state-key.ts:8,17` 텔레그램 함수 · `verify-food-edit-pending.ts:28,34,37` 가 씀 |

**판단 분리 위치.** fin: `commands/*.ts` `decide*`(등록과 같은 파일) · `core/reply.ts`(139) · `core/state-key.ts`(36) · `commands/vest-confirm.ts` `decideVest`(`discord/vest-button.ts:8` 가 import) · 라우터 `discord/router.ts`(232) · 어댑터 `discord/reply.ts`(154). fit: `commands/*.ts` · `commands/free-text.ts`(54) · `commands/food-photo-decide.ts`(129 · 전용 분리) · `notifications/auto-adjust-callback.ts` `decideAutoAdjust`(`discord/auto-adjust-button.ts:6`) · `core/reply.ts`(51) · `core/state-key.ts`(20) · `discord/router.ts`(76) · `discord/reply.ts`(81) · `discord/photo.ts`(103).

**웹·MCP 가 grammY 까지 닿는 경로.**
- fin 웹: `api/alerts/history/[id]/retry/route.ts` → `alert-dispatcher.ts:13` → `bot/index.ts:1` · `api/deposits/route.ts` → `budget-alert` → `bot/index.ts` · `lib/ai/advisor-monitor.ts` → `bot/index.ts`. 정적 도달 `bot/*` 34 모듈(명령 전부 포함).
- fin MCP: `lib/ai/advisor-monitor.ts` 경유 같은 34 모듈.
- fit 웹: `lib/daily-report`·`weekly-report`·`monitoring/admin-alerts` → `notifications/notifier.ts`(grammY 는 `import type`) · `utils/error.ts` — `bot/*` 2 모듈만. fit MCP: `bot/*` 0.

**fin 테스트의 얽힘.** `commands/__tests__/telegram-fake.ts`(101)는 `*-telegram.test` 6 외에 `*-decide.test` 4(`ai-decide:29` · `expense-trade-decide:47` · `lookup-manage-decide:39` · `special-decide:41`)도 import 한다. `special-decide.test.ts:29,40` · `core/__tests__/reply.test.ts:8` 은 `telegram-reply` 또는 `register*` 를 import 한다.

## M3 기능 동등성

코드 추출 비교(`bot.command`·`bot.hears` 정규식 ↔ `router.ts` `.command`·`.hears`).

| 항목 | fin 텔레그램 | fin Discord | fit 텔레그램 | fit Discord |
|---|---|---|---|---|
| 영어 명령 | 21 | 21 — **차집합 0** | 10 + `/food_kcal` 정규식(`free-text.ts:13`) | 11(`food_kcal` 포함 `router.ts:55`) — 텔레그램에만 있는 명령 0 |
| 한글 `hears` | 28 | 28 — **상수 이름 차집합 0** | 0 | 0 |
| 자유 텍스트 | `expense.ts:738` · `ai.ts:550` | `router.ts:140-150` 같은 순서 | `index.ts:64` `decideFreeText` | `router.ts:33-37` 같은 함수 |
| 미디어 | 0 | 0(첨부만이면 무응답 `router.ts:8` 주석) | `food-photo.ts:54` | `router.ts:63` `discord/photo.ts` |
| 콜백·버튼 | `trade:` `tx:` `multi:` `aitrade:` `vest:` | 같은 5(`router.ts:224-228`) | `auto_adjust:` `food:` | 같은 2(`router.ts:70-73`) |

**텔레그램에서만 닿는 명령·콜백: 0.** 대응은 있으나 동작이 다른 곳(전수):

| 곳 | 차이 | 근거 |
|---|---|---|
| fin `start` | 텔레그램은 `first_name` · Discord 는 늘 "사용자" | `start.ts:81` · `router.ts:172` · `start.ts:65` |
| fin·fit 긴 응답 | 텔레그램만 HTML 실패 시 plain 재전송 · 네트워크 재시도(`replyHtml`) · Discord 는 chat 분할 | `discord/reply.ts:6`(fin) · `:4`(fit) · `utils/telegram.ts:36-50` |
| fit `/sync`·`/report regenerate` 실패 | 텔레그램만 원문 200자 · Discord 는 `staticErrors` | M11 |
| fin `/report` 파일 | Discord 10 MiB 상한(`core/reply.ts:47` · `packages/notify/src/discord.ts:137`) · 텔레그램은 코드 상한 없음 · **PDF 실제 크기 미측정(서버 파일)** | 분기 PDF 경로도 같은 상수(`discord.ts:149`) |
| fit `clearKeyboard` | Discord 는 무시 — 개념 없음 | `discord/reply.ts:4` |

**아웃바운드 transport.**

| 경로 | 코드 | 지금 어디로 |
|---|---|---|
| `/브리핑` 응답 | 텔레그램 수신: `commands/briefing.ts:155-157` → `notifierForChat`(텔레그램 고정) · Discord 수신: `router.ts:131-133` → `notifierForDiscordChannel` · 크론: `briefing.ts:69` → `notifierFor` | 요청 플랫폼 · 크론은 라우트. 텔레그램 수신이 꺼져 있어 `notifierForChat` 호출 경로는 운영에서 닿지 않는다 |
| 키보드 3곳 | fin `rsu.ts:179` · fit `auto-adjust.ts:396` · fit `auto-adjust-cron.ts:79` — 모두 `interactiveNotifierFor` | 스위치 `NOTIFY_INTERACTIVE_CHANNEL` · discord 면 Discord 봇(`fin notifier.ts:129-142` · `fit :95-108`) |
| fin 분기 PDF | `quarterly-report.ts:65` `sendFileIfDiscord` · `not-discord` 일 때만 `:83-87` `api.sendDocument` | 스위치 `NOTIFY_ALLOWED_CHANNEL` |

서버 스위치 실제 값은 **미측정**(I-3) — 문서상 4 = discord(`CLAUDE.md` 2026-10-27 · `v1.0.7`·`v1.0.8`).

## M4 `packages/notify`

| 항목 | 값 | 근거 |
|---|---|---|
| 텔레그램 어댑터 | `telegram.ts` 42 LOC · `createTelegramTransport` · `TELEGRAM_CHANNEL` · `TelegramApi` · `TelegramTransportOptions` | `telegram.ts:12,20,25,27` · `index.ts:22-23` |
| 테스트 | `telegram.test.ts` 76 LOC · 8 케이스 · 다른 파일 사용: `discord.test.ts:257-261` · `index.test.ts:4,10` | |
| 소비처 | `apps/finance/.../notifier.ts:29,66` · `apps/fitness/.../notifier.ts:20,70` 만 · `packages/chat` 0 | |
| 텔레그램 이름의 공용 export | `TELEGRAM_MAX_LENGTH` · `splitMessage` 기본값 | `split.ts:6,8` · `index.ts:75` |
| 어휘 잔여(코드) | `Content.text` 주석 "텔레그램 HTML 부분집합"(`types.ts:25`) · `error.ts:33,82`(grammy 오류 모양 처리) · `isHtmlParseError` 폴백 `deliver.ts:74` | |
| **Discord 가 텔레그램 형태에 묶인 곳** | `toDiscordComponents` 는 `inline_keyboard` 만 받는다 — 아니면 throw | `discord-bot.ts:42-54` · 호출부가 grammY `InlineKeyboard` 를 넘긴다(`rsu.ts:173,179` · `auto-adjust.ts:63-64`) |

**기본값 코드(L31 재확인).**
- fin: `usesDiscord` `notifier.ts:72-74`(=== `discord` 만) · `routedTargets` `:96-100` · `notifierFor` `:111-120` · `interactiveUsesDiscord` `:154-156` · `interactiveNotifierFor` `:130-135` · `fileRecipientCount` `:229-232` · `sendFileIfDiscord` `:217` · `TELEGRAM_TARGETS` `:52-55`.
- fit: `allowedUsesDiscord` `notifier.ts:38-40` · `allowedTargets` `:74-77` · `notifierFor` `:83-87` · `interactiveUsesDiscord` `:111-113` · `interactiveNotifierFor` `:96-101`.
- 앱 밖: `deploy/notify-deploy.cjs:43-45`(미설정·읽기 실패 = 텔레그램) · `.env.example:6,9,39` 문구 · `scheduler.ts:23` `recipients … || telegramRecipients`.

**기본값을 뒤집으면 닿는 분기·테스트(env 를 만지는 테스트 파일 11).** fin `notifier.test.ts`(17 케이스) · `alert-dispatcher.test.ts`(27) · `retry/route.test.ts`(7 · `:39-57,205,223`) · `scheduler.test.ts`(8) · `advisor-monitor.test.ts` · fit `notifier.test.ts`(30) · `telegram-handlers.test.ts`(31) · notify `discord.test.ts` · `index.test.ts` · `platform-env.test.ts` · `telegram.test.ts`. 케이스별 영향은 실행하지 않아 **미측정**. #355 회귀(`022ab74`): CI 는 `.env` 가 없어 토큰 없으면 13건 실패 — 그래서 위 두 fin 테스트에 토큰을 넣었다.

**R11 HTML 경로.**
- 저장: `AlertHistory.message` 는 HTML 또는 raw(`client-utils.ts:23` · kind 별 혼합 `alert-dispatcher.ts:96-101,107-119`).
- 재발송: `api/alerts/history/[id]/retry/route.ts:69` → `redispatchAlert`(`alert-dispatcher.ts:103-123`) → `notifierFor(bot).notify(Route.ALLOWED, htmlContent(escapeHtml(…)))`.
- 변환: `toDiscordContent`(`discord.ts:85-86`) · `discord-bot.ts:124` · chat `rest.ts:99` — `format === 'html'` 이면 `htmlToDiscordMarkdown`(`discord-md.ts`).
- 재발송의 수신자 판정 `route.ts:60` `recipients.targetCount(Route.ALLOWED)`. 웹이 `notifyBot()` 로 `bot/index.ts` 를 부른다(`alert-dispatcher.ts:105`).

## M5 `deploy/`

| 파일 | 텔레그램 내용 | 근거 |
|---|---|---|
| `telegram-polling.sh` 296 · `.cjs` 139 | 앱 `.env` `TELEGRAM_POLLING` 토글 · 판정 문자열 4 · 상태 파일 `logs/telegram-polling-<app>.json` | `.sh:15,18-22,218` · `.cjs:15` |
| `test_telegram_polling.py` 498 · 33 테스트 | 위 고정 — 앱 로그 문자열도 대조 | `:1-8` |
| `discord-switch.sh` 233 · `.cjs` 206 | `off` = 스위치 4줄 비움 + 봇 재시작 · `on` 실패 시 텔레그램으로 되돌림 | `.sh:6,135-145,209` · `.cjs:15,142,147` |
| `test_discord_switch.py` · 22 테스트 | 되돌림 문구 고정 · 판정 문자열(`봇 토큰·채널 미설정`) | `:203,269,285,330` |
| `notify-deploy.cjs` 142 | Discord 실패·미설정 → 앱 `.env` 토큰으로 텔레그램 대체 | `:6,20,45,94,121-139` |
| `test_notify_deploy.py` · 16 테스트 · 19 줄 | 텔레그램 경로 3건 `:48-67,100,106` · 토큰 은닉 `:140` | |
| `ssh-deploy.sh` | 주석 1 · 인자 형식 호환 | `:69` · `notify-deploy.cjs:12` |
| `release-inplace.sh` | 셸 정리 목록 · 409 카운트·게이트 | `:20` · `:110-113,334,337,339` |
| `test_release_inplace.py` | 409 고정 | `:65-68,218,346-355` |
| `deploy.sh` | 코드 0 · 주석 1(`409`) | `:23` · 봇 기동 `:359-361` |
| `t2-check.sh` | U13 `getWebhookInfo` · 토큰 읽기 | `:249-258` · 테스트 `test_t2_check.py:37,67,119` |
| `deploy/env/*.template` | fin 5 키 + 표제 · fit 3 키 + 표제 | `finance:18-23` · `fitness:14-17` · 파싱 테스트 `test_deploy.py:832-854` |
| `pleiades.config.cjs` | **언급 0** | 봇 정의 `:76,95-98` |
| `test_deploy.py` | 스모크 정적 고정 — `index()` 로 `startTelegramPolling(`·`getBot(` 이 entry 에 있어야 통과 · `TELEGRAM_BOT_TOKEN: INVALID_TOKEN` | `:762,772` |

**셸 정리 목록(L28).** `release-inplace.sh:20` `TELEGRAM_[A-Z_]*` 패턴. 같은 패턴 사본: `docs/runbooks/007-t4-build-rehearsal.md:33` · `007-t5-fin-cutover.md:80` · `007-t9-fit-cutover.md:94` · `release-inplace.md:142`.

**자동 배포에서 어느 태그의 스크립트가 도는가.**

| 스크립트 | 태그 | 근거 |
|---|---|---|
| `ssh-deploy.sh` | 직전(fin 체크아웃 · 함수를 끝까지 읽고 실행) | `ssh-deploy.sh:10,41,74` |
| `release-inplace.sh` | 직전(앱 체크아웃 · C2 checkout 전에 함수 적재) | `release-inplace.sh:17-18` · D-4 설계 `02_writer_d4_r5.md:222` |
| `deploy.sh` | **새 태그**(C2 뒤 `$ROOT/deploy/deploy.sh`) | `release-inplace.sh:154,306` |
| `notify-deploy.cjs` | **새 태그**(release-inplace 뒤 체크아웃 파일) · 파일 없으면 건너뜀 | `ssh-deploy.sh:44,56-57` · `notify-deploy.cjs:12` |

따라서 D-5 릴리즈 자신의 배포 판정은 직전 태그의 409 게이트(`:339`)를 탄다. 릴리즈 A 단계 게이트는 마이그레이션 ≠ 0 · `mcp-config.json` 변경이면 중단이고(`:215-216`) `deploy/`·`.env.example` 변경은 표시만 한다(`:211,214`). R-8 은 그때 체크아웃의 스크립트(D-5 뒤면 D-5 태그)가 돈다.

## M6 §7 가드 대체 실재 확인

| §7 항목 | §7 이 적은 대체 | 현재 코드 | 판정 |
|---|---|---|---|
| `check_env.py` 텔레그램 검사 | G-1~G-3 | 토큰 해시 허용 목록 `check_env.py:142-154` · 실효값 세 출처 `:95-120` · env 파일 fail-closed `:133-139,245-248` · 해시만 출력 `:128-130` · 앱 사이 같은 봇 `:151-152` · 한계 문서 `tools/local/README.md:51` | **있음** |
| 같은 함수의 수신자 검사(I-5) | I-5′ | `_check_telegram` 안 `CHAT_KEY` 대조 `:204-207` — 토큰이 없으면 `:196-197` 에서 먼저 돌아간다. Discord 채널·사용자 ID 검사 **0** · #359 **열림** | **없음** |
| `run.sh` `env -u TELEGRAM_BOT_TOKEN` | 셸의 Discord 토큰·env 파일도 실효값 검사 | `run.sh:29-30` 은 `env -u` 유지(Discord 키 해제 없음) · 검사는 `check_env.py:119-120`(셸 값 우선) | **있음**(검사 방식) |
| `precheck.py` | §7 에 없음 | 텔레그램·Discord 언급 0 — 변경 대상 아님 | — |
| `release-inplace.sh:110` 409 | 프로세스 수 · 재접속 빈도 · 008 모니터링으로 이중 세션 표시 | 양식 `online N/3`(`:337`)만 · 이 스크립트의 Discord 언급은 `:20`·`:338` 둘 — gateway·재접속·IDENTIFY 집계 **0** · 008 은 기획 문서뿐(저장소 밖 구현은 미측정) · IDENTIFY 차단 알림은 chat 쪽 `discord-interactions.ts`(fin `:88-99`) | **판정 양식의 대체 없음**(프로세스 수만) |
| `release-inplace.sh:20` | 유지 | 있음 | 유지 |
| `isolation.md` I-4·I-5 | I-4′ · I-5′ | I-4′ 있음 `:35` · I-5′ **없음**(`:36` I-5 만 · 문구 `:22` 도 텔레그램) | **절반** |
| `notify-deploy.cjs` 대체 | Actions 실행 요약 | `.github/workflows/deploy.yml` 이 양식을 `$GITHUB_STEP_SUMMARY` 에 쓴다 · 재시도·R-8 안내는 양식에 | **있음** |
| MCP logger 최상위 redact | Discord 토큰도 최상위에서 가림 | fin `logger.ts:198` · fit `:183` = `TELEGRAM_BOT_TOKEN` 만 · `*.token`·deep redact(`fin:214-243` · `fit:199-212`)는 args·중첩 키 — 최상위 `DISCORD_*` 경로 **0** | **없음** |

## M7 DB

| 컬럼·값 | 앱 | 쓰기 | 읽기 | 근거 |
|---|---|---|---|---|
| `WorkoutAdjustment.telegramMessageId` · `telegramChatId` · 인덱스 1 | fit | 2 곳 — **Discord 값도 지금 쓴다**(`first.ref` · 별칭 `fitness`) | **0**(컬럼명 전수 grep 결과 제품 코드는 쓰기 2 곳뿐 · `workoutAdjustment.*` 호출 10 은 전부 봇 경로) | `schema.prisma:406-408,415` · 마이그레이션 `20260716054043:18-19,36-37` · `auto-adjust-cron.ts:102-103` · `auto-adjust.ts:419-420` · `notifier.ts:93,102` · 테스트 `notifier.test.ts:373,390,420,441,463` |
| `Transaction.userId` | fin | 2 곳 — 텔레그램 `"<from.id>"` · Discord `discord:<id>` | **이름 읽기 0**(`src/app`·`src/mcp`·`src/lib` 에 `userId` 0 줄) · 목록 API 는 필드를 골라 직렬화(`api/transactions/route.ts:92-105`) · MCP `spending.ts` 는 문자열 조립 · `...tx` 전개 0 | `schema.prisma:253,262` · `expense.ts:380,648` · `telegram-reply.ts:78-80` · `discord/reply.ts:147-148` |
| 스키마 주석 | fin | — | — | `schema.prisma:332,428` |
| fit AI 세션 채널 `"telegram"` | fit | 메모리 `Map` | 같음 | `commands/ai.ts:21` · `lib/ai/session-store.ts:21` — DB 아님 |
| 상태 키 `telegram:*` | 두 앱 | 메모리 | 같음 | `core/state-key.ts` |
| 스키마의 `chat`·`channel` 컬럼 | 두 앱 | 0 | 0 | `grep -nE "chat|channel" prisma/schema.prisma` 0줄 |

**S-8 판단 근거.** 제거에 스키마 변경이 필요한 읽기 경로는 코드에 없다. 컬럼명을 바꾸면 fit 마이그레이션이 생기고, 그 태그는 자동 배포 A 단계에서 멈춘다(`release-inplace.sh:215`). 지금 쓰는 fit 두 컬럼의 쓰기 2 곳은 Discord 키보드 경로에 있어 텔레그램 코드와 함께 사라지지 않는다.
**미측정:** 운영 DB 행 수·값 · 과거 `AlertHistory.message` · `PromptVersion` 옛 행의 "텔레그램" 언급(I-7).

## M8 봇 프로세스

| 항목 | fin | fit |
|---|---|---|
| 기동 순서 | `--smoke` 검사 `standalone.ts:27` → 크론 7 · `scheduleNotifications` `:33-40` → 토큰 판정 `:44-45` → gateway `:48` → 폴링 `:53-74` | 사진·orphan 정리 `:26-35` → `ensureDefaults` `:39` → 토큰 판정 `:42-43` → 스케줄러 `:46` → gateway `:49` → 폴링 `:51-64` |
| `getBot` | 싱글턴 · `fresh` 재생성 `index.ts:80-85` | 호출마다 새 인스턴스 `index.ts:30` · 알림 핸들과 폴링 인스턴스 별개 |
| 폴링 | `telegram-polling.ts` 두 앱 동일 구조 163 LOC · 끔 판정 `:53-55` · drop `:109,118` · 상태 기록 `:20-49` · 401 중지 `:133-141` | 같음 |
| 상태 파일 | `logs/telegram-polling-fin.json` `:21` · 읽는 곳 `deploy/telegram-polling.sh:218` · `.cjs` `record` | `logs/telegram-polling-fit.json` `:18` |
| IDENTIFY 기록 | `logs/identify-fin.json` `discord-interactions.ts:28` | 같은 패턴 |
| `--smoke` | 있음 `standalone.ts:23,27` · 스크립트 `scripts/smoke-bot-bundle.mjs`(`:25,44` 무효 토큰 · `build:bot` 안 `package.json:11`) | **없음** · `build:bot` 에 스모크 없음(`package.json:12`) |
| 크론의 `bot.api` 의존 | `notifier.ts:65-66,133,246` · `quarterly-report.ts:83-87` · `notifyBot()` 15 importer | `notifier.ts:65,69-70` · 스케줄러는 핸들을 넘기기만 함(`scheduler.ts:18,63`) |
| 텔레그램 없는 핸들 | `BOT_PROCESS_WITHOUT_TELEGRAM` `notifier.ts:61` | 같음 `:62` · `discord-interactions.ts:44` 라우터가 늘 이것 |
| **핸들의 다른 의미** | — | fit `!bot` = "웹은 alert 를 보내지 않는다" `admin-alerts.ts:183,196` · 시그니처 `admin-alerts.ts:189,271,292,314,337,370` · `lib/daily-report.ts` · `weekly-report.ts` `notifyBot` 옵션 · `garmin/sync.ts:318` |
| 401 중지 알림 | `standalone.ts:66-73` | `standalone.ts:56-63` |

**pm2(`deploy/pleiades.config.cjs`).** `LONG_RUNNING` `min_uptime: 30000`(`:67`) · `pleiades-fin-bot` `:76` · `pleiades-fit-bot` `:95-98`(`max_restarts: MAX_SAFE_INTEGER`) · 봇 정의에 args 없음을 `test_deploy.py:747-754` 가 고정 · 텔레그램 언급 0.

## M9 의존성

| 항목 | fin | fit |
|---|---|---|
| `package.json` | `grammy ^1.41.1` `:30` · `build:bot --external:grammy` `:11` | `grammy ^1.42.0` `:39` · `:12` 같음 |
| `@grammyjs/*` 직접 의존 | 0 | 0 |
| lock 버전 | `grammy 1.46.0` · `@grammyjs/types 5.0.0` | `grammy 1.42.0` · `@grammyjs/types 3.26.0` |
| lock 전이 닫힘 / grammy 만 끌어옴 | 10 / **8**(`grammy` · `@grammyjs/types` · `abort-controller` · `event-target-shim` · `node-fetch` · `tr46` · `webidl-conversions` · `whatwg-url`) | 10 / **8**(같은 8) |
| 웹(Next) grammY 정적 도달 | **예** — M2 경로 | 아니오(타입만) |
| env 스키마 | 텔레그램 키를 검증하는 zod 등 스키마 0 — 읽는 곳은 `process.env`·`csvEnv` 직접 | 같음 |
| 코드가 읽는 키 | `TELEGRAM_BOT_TOKEN` · `_ALLOWED_CHAT_IDS` · `_ADMIN_CHAT_IDS` · `TELEGRAM_POLLING` | `TELEGRAM_BOT_TOKEN`(`food-photo.ts:72` 포함) · `_ALLOWED_CHAT_IDS` · `TELEGRAM_POLLING` |
| 미사용 키 | `TELEGRAM_WEBHOOK_SECRET`(템플릿 3곳만 · 코드 0) | — |

fin `build:mcp:staged` 에 `--external:grammy` **없음**(`package.json:9` 의 external 목록 추출) — `build:bot` 에만 있다(`:11`).

## M10 CI·템플릿·룰

| 위치 | 텔레그램 | 근거 |
|---|---|---|
| `.github/workflows/*`(루트) | **0** — #355 테스트 토큰은 CI env 가 아니라 테스트 파일 안(`retry/route.test.ts:43-45` · `alert-dispatcher.test.ts`) | `git grep` 0 · `022ab74` stat |
| 루트 `.env.example` | 4 줄 `:5,6,9,39` | 전부 기본값·위치 설명 |
| `apps/finance/.env.example` | 7 줄 `:18-24` | |
| `apps/fitness/.env.example` | 5 줄 `:23-27` | |
| `tools/local/env/fin.env` · `fit.env` | `:13-16` · `:15-16` | `test_write_env.py:49` 가 값 고정 · `write_env.py` 언급 0 |
| `tools/local/README.md` | `:32` "비워 두면 알림은 텔레그램" | D-4 가 "고친다"로 분류했으나(`02_writer_d4_r5.md:73`) 원문이 남아 있다 |
| `tools/local/test_check_env.py` | 15 줄 · 전체 40 테스트 중 이름에 봇·chat 6 | |
| `.claude/settings.json` · `.claude/hooks` | **0** | |
| `isolation.md` | `:22` · `:34` I-4 · `:36` I-5 | |
| 런북 7 | t10 10 · t5 6 · release-inplace 5 · t9 4 · t2 3 · t4 1 · ai-model-upgrade 1 | 부록 A |
| 런북 중 지금도 쓰이는 지시 | `release-inplace.md:43`(배포 알림 수신자) · `:70`(409) · `:142`(KEYS) · `:193`·`:261`(409) · `:219`(#247 일회 이력) · `007-t10-discord.md:12,67,79,87,98`(off·양식 예시) · `007-t2:36` | |

## M11 이월 후보 확인

| 후보 | 지금 그 줄 | 일치 |
|---|---|---|
| `apps/finance/CLAUDE.md:20` | `- **Bot**: grammY (텔레그램 봇, …)` | 예 |
| `:54` | `src/bot/ → 텔레그램 봇 …` | 예 |
| `:75` | `grammY long polling` | 예 |
| `:87` | `Next.js webhook 대신 standalone long polling` | 예(낱말 "텔레그램" 없음) |
| fin `scheduler.ts:2` | `텔레그램 알림 스케줄러` | 예 |
| `scheduler.ts:36` | D-4 로 라우트 문구로 바뀜 — 텔레그램 낱말 없음 · 수신자 문구는 `:38` | **줄 내용 변경**(`:38` 에 `TELEGRAM_ALLOWED_CHAT_IDS`) |
| `scheduler.ts:207,220` | `sendBriefing(…, { aiCommand: '!ai' })` | 예 |
| `categories.ts:118` | `텔레그램 봇 커맨드 / MCP 도구 / 웹 UI` | 예 |
| `briefing.ts:110` | `options.aiCommand ?? '/ai'` | 예 |
| `release-inplace.sh:337` | `409 $conflict` | 예 |
| `release-inplace.sh:339` | 게이트 `"$conflict" == 0` | 예 |
| `ai-model-upgrade.md` | `:57` J5 · `:40`(`/ai`) · `:41`(`src/bot/commands`) | 예 |

**#365(닫힘).** fit 원문 노출 = `commands/sync.ts:49-51` · 같은 성질 `report.ts:44-46`. `staticErrors` 없는 호출은 텔레그램 등록부뿐(`sync.ts:57` · `report.ts:81`) · Discord 는 `router.ts:48,50` 에서 `staticErrors: true`. 원문 분기 자체는 `decide*` 안에 있어 **등록부를 지워도 코드는 남고** 호출자만 0 이 된다.

**`apps/*/.claude/**`(T-7 해제 뒤).** 16 파일 전부 fin(fit tracked 0) · 텔레그램 언급 5 파일 11 줄: `release-publisher/SKILL.md` 6 · `agents/release-manager.md` 2 · `rules/workflow.md` 1 · `codex-response-patterns/SKILL.md` 1 · `milestone-workflow/SKILL.md` 1. 그 밖 `apps/finance/CLAUDE.md` 3(패턴 기준) · `apps/finance/README.md` 7.

## M12 규모

**통째 삭제 후보** = 도달성(M2)·importer 로 다른 경로가 쓰지 않음을 확인한 파일. **수정 후보** = M1 언급 파일에서 삭제 후보를 뺀 수(+ 표기한 것). "주석만" 포함 수.

| 영역 | 삭제 파일 | 삭제 LOC | 파일 목록 | 수정 후보 파일 |
|---|---:|---:|---|---|
| fin 운영 | 3 | 297 | `telegram-polling.ts` 163 · `middleware/auth.ts` 37 · `utils/telegram-reply.ts` 97 | 55 + `daily.ts`(언급 0 · `notifyBot` import) = **56**(주석만 10) |
| fin 테스트 | 7 | 3,310 | `telegram-polling` 317 · `ai-telegram` 747 · `expense-telegram` 675 · `lookup-telegram` 342 · `manage-telegram` 411 · `special-telegram` 478 · `trade-telegram` 340 · 케이스 211 | 17 |
| fit 운영 | 5 | 477 | `telegram-polling.ts` 163 · `index.ts` 73 · `middleware/auth.ts` 15 · `commands/food-photo.ts` 150 · `utils/telegram-reply.ts` 76 | 35(주석만 14) |
| fit 테스트 | 3 | 1,169 | `telegram-handlers` 778 · `telegram-polling` 317 · `telegram-reply` 74 · 케이스 52 | 8 |
| notify | 2 | 118 | `telegram.ts` 42 · `telegram.test.ts` 76 · 케이스 8 | 운영 11(주석만 6) · 테스트 9 · README 1 |
| deploy | 3 | 933 | `telegram-polling.sh` 296 · `.cjs` 139 · `test_telegram_polling.py` 498 · 테스트 33 | 운영 6(주석만 1) · env 2 · 테스트 5 |
| tools | 0 | 0 | — | 운영 2 · env 2 · README 1 · 테스트 2 |
| **합** | **23** | **6,304** | 운영 11 파일 1,251 · 테스트 12 파일 5,053 | 운영 110 · env 4 · 테스트 41 · 문서 2 |

합 검산: 파일 3+7+5+3+2+3 = 23 · LOC 297+3,310+477+1,169+118+933 = 6,304 · 운영 수정 56+35+11+6+2 = 110 · 테스트 수정 17+8+9+5+2 = 41.

제외한 삭제 불가 사실: fin `bot/index.ts` 94(`notifyBot` 15 importer) · fin `telegram-fake.ts` 101(decide 테스트 4) · fin `vest-confirm.ts`(decideVest) · `register*` 은 파일 안 부분 삭제 fin 322 · fit 73.
이 표에 없는 것: 앱 안 옛 배포 5 파일(43 줄) · 앱 하네스 6 · 런북 7 · 앱 env 템플릿 2 · 의존성 4 · DB 3 · 이력 문서 219.

## 009 서술과 어긋난 사실

| # | 009 서술 | 측정 | 근거 |
|---|---|---|---|
| X1 | §7 대체 "I-5′" · §10 | 없음 · #359 열림 · `_check_telegram` 을 지우면 chat ID 대조도 함께 없어진다 | M6 |
| X2 | §7 409 대체 — 판정 양식이 이중 세션을 드러낸다 | 프로세스 수만 있고 재접속·gateway 집계 0 | M6 |
| X3 | §7 MCP redact 대체 | Discord 최상위 경로 0 | M6 |
| X4 | D-5 는 "텔레그램 코드 0" | Discord 경로가 grammY 값을 쓴다 — `InlineKeyboard`(`rsu.ts:173` · `auto-adjust.ts:64`) + `toDiscordComponents` 는 `inline_keyboard` 만 받음(`discord-bot.ts:53-54`). 009 §4·§7 어디에도 없다 | M4 |
| X5 | L12 fin 웹 `getBot()` 3 · L12′ `getBot` 17곳 | 지금은 `notifyBot()`(`bot/index.ts:91`) · importer 15 · `getBot` 직접 호출은 `standalone`·`index` 만. 그 import 가 웹·MCP 를 grammY·명령 전체로 잇는다(34 모듈) | M2 |
| X6 | L30 "`drop_pending_updates` 0건 · `deleteWebhook()`" | D-1 이후 `telegram-polling.ts:118` · `deleteWebhook` 0 | M8 |
| X7 | L13 fin 3+미사용 1 · fit 2 | `TELEGRAM_POLLING` 추가로 fin 4+1 · fit 3 | M9 |
| X8 | L21 deploy 12/67 · runbooks 7/31 | deploy 16 파일/151 줄(운영 8/62 + env 2/10 + 테스트 6/79) · runbooks 7/30 · tools 7/33 · 루트 `.env.example` 1/4 · workflows 0 은 일치 | M1 |
| X9 | S-8 · L20 "컬럼 처리는 읽기 0 이라 유지" | 읽기 0 은 맞다. 단 두 컬럼은 **지금도 Discord 값으로 쓰인다** · 옛 주석 "Telegram callback 매칭용"(`schema.prisma:406`) | M7 |
| X10 | 5-2 서버 `NOTIFY_*` 줄을 지우지 않는다 | `discord-switch.sh off` 가 그 4줄을 비운다(`.sh:6` · 런북 t10 `:12,87`) — 스크립트가 남으면 바닥 조건과 충돌 | M5 |
| X11 | 5-1 수용 "잔여 = 이력 문서·셸 정리 목록·DB 컬럼명" | 그 밖 잔여 후보: 앱 이력 문서 102 · 런북 `KEYS` 사본 4 · `isolation.md` · 앱 옛 배포 5 · `packages/chat` 금지어 테스트 1 | M1·M5 |
| X12 | 이슈 #365 "D-5 에서 코드와 함께 사라지는지 확인" | 호출자만 사라지고 원문 분기는 `decide*` 에 남는다 | M11 |
| X13 | §7 notify-deploy "D-5" | 대체(Actions 요약)는 있음. 다만 `notify-deploy.cjs` 는 새 태그로 돌아 D-5 릴리즈 자신의 알림부터 새 코드다 | M5 |

## 미측정

| 항목 | 이유 |
|---|---|
| 서버 스위치·토큰·`TELEGRAM_POLLING` 실제 값 · 상태 파일 | I-3 |
| 운영 DB 행(`Transaction.userId` · `WorkoutAdjustment.telegram*` · `AlertHistory.message` · `PromptVersion`) | I-7 |
| 분기·`/report` PDF 실제 크기(10 MiB 상한 대비) | 서버 파일 |
| 기본값 뒤집기의 테스트 케이스별 영향 · 타입 전용 import 의 번들 제거 · 웹·MCP 번들의 grammY 포함 | 설치·빌드·테스트 실행 금지 |
| 008 모니터링의 저장소 밖 구현 | 이 저장소에 코드 0 만 확인 |

## 부록 A — 파일별 줄 수(M1 열거)

### 런타임 코드 — 118 파일 · 817 줄

- `apps/finance/scripts/smoke-bot-bundle.mjs` 2
- `apps/finance/src/app/alerts/history/client-utils.ts` 1
- `apps/finance/src/app/api/alerts/history/[id]/retry/route.ts` 1
- `apps/finance/src/bot/commands/ai.ts` 22
- `apps/finance/src/bot/commands/alert.ts` 9
- `apps/finance/src/bot/commands/analysis.ts` 8
- `apps/finance/src/bot/commands/backtest.ts` 8
- `apps/finance/src/bot/commands/briefing.ts` 12
- `apps/finance/src/bot/commands/budget.ts` 9
- `apps/finance/src/bot/commands/custom-strategy.ts` 11
- `apps/finance/src/bot/commands/expense.ts` 19
- `apps/finance/src/bot/commands/networth.ts` 12
- `apps/finance/src/bot/commands/portfolio.ts` 7
- `apps/finance/src/bot/commands/price-format.ts` 1
- `apps/finance/src/bot/commands/price.ts` 7
- `apps/finance/src/bot/commands/report.ts` 7
- `apps/finance/src/bot/commands/start.ts` 8
- `apps/finance/src/bot/commands/strategy.ts` 9
- `apps/finance/src/bot/commands/trade.ts` 14
- `apps/finance/src/bot/commands/vest-confirm.ts` 3
- `apps/finance/src/bot/commands/watchlist.ts` 11
- `apps/finance/src/bot/core/reply.ts` 13
- `apps/finance/src/bot/core/state-key.ts` 8
- `apps/finance/src/bot/discord/reply.ts` 6
- `apps/finance/src/bot/discord/router.ts` 12
- `apps/finance/src/bot/discord/vest-button.ts` 2
- `apps/finance/src/bot/index.ts` 12
- `apps/finance/src/bot/middleware/auth.ts` 3
- `apps/finance/src/bot/notifications/active-review.ts` 2
- `apps/finance/src/bot/notifications/alert-dispatcher.ts` 1
- `apps/finance/src/bot/notifications/briefing.ts` 5
- `apps/finance/src/bot/notifications/budget-alert.ts` 3
- `apps/finance/src/bot/notifications/custom-strategy-alert.ts` 3
- `apps/finance/src/bot/notifications/discord-interactions.ts` 6
- `apps/finance/src/bot/notifications/monthly-report.ts` 3
- `apps/finance/src/bot/notifications/monthly.ts` 1
- `apps/finance/src/bot/notifications/networth-snapshot.ts` 2
- `apps/finance/src/bot/notifications/notifier.ts` 46
- `apps/finance/src/bot/notifications/price-alert.ts` 2
- `apps/finance/src/bot/notifications/quarterly-report.ts` 9
- `apps/finance/src/bot/notifications/quarterly.ts` 1
- `apps/finance/src/bot/notifications/rsu.ts` 5
- `apps/finance/src/bot/notifications/scheduler.ts` 6
- `apps/finance/src/bot/notifications/ta-signal-alert.ts` 4
- `apps/finance/src/bot/standalone.ts` 18
- `apps/finance/src/bot/telegram-polling.ts` 23
- `apps/finance/src/bot/utils/error.ts` 4
- `apps/finance/src/bot/utils/formatter.ts` 2
- `apps/finance/src/bot/utils/markdown.ts` 6
- `apps/finance/src/bot/utils/telegram-reply.ts` 20
- `apps/finance/src/bot/utils/telegram.ts` 7
- `apps/finance/src/lib/ai/advisor-monitor.ts` 11
- `apps/finance/src/lib/ai/claude-advisor.ts` 1
- `apps/finance/src/lib/alert-config/categories.ts` 1
- `apps/finance/src/lib/trade-service.ts` 1
- `apps/finance/src/mcp/logger.ts` 1
- `apps/finance/src/mcp/tools/alert-history.ts` 2
- `apps/finance/src/mcp/tools/custom-strategy.ts` 1
- `apps/fitness/scripts/verify-food-edit-pending.ts` 20
- `apps/fitness/src/bot/commands/ai.ts` 11
- `apps/fitness/src/bot/commands/food-edit-callback.ts` 13
- `apps/fitness/src/bot/commands/food-edit-format.ts` 3
- `apps/fitness/src/bot/commands/food-edit-state.ts` 3
- `apps/fitness/src/bot/commands/food-photo-decide.ts` 3
- `apps/fitness/src/bot/commands/food-photo.ts` 21
- `apps/fitness/src/bot/commands/food.ts` 3
- `apps/fitness/src/bot/commands/free-text.ts` 2
- `apps/fitness/src/bot/commands/report.ts` 6
- `apps/fitness/src/bot/commands/run.ts` 3
- `apps/fitness/src/bot/commands/sleep.ts` 3
- `apps/fitness/src/bot/commands/start.ts` 4
- `apps/fitness/src/bot/commands/sync.ts` 5
- `apps/fitness/src/bot/commands/today.ts` 3
- `apps/fitness/src/bot/commands/weight.ts` 3
- `apps/fitness/src/bot/core/reply.ts` 6
- `apps/fitness/src/bot/core/state-key.ts` 8
- `apps/fitness/src/bot/discord/auto-adjust-button.ts` 3
- `apps/fitness/src/bot/discord/photo.ts` 3
- `apps/fitness/src/bot/discord/reply.ts` 3
- `apps/fitness/src/bot/discord/router.ts` 4
- `apps/fitness/src/bot/index.ts` 15
- `apps/fitness/src/bot/middleware/auth.ts` 2
- `apps/fitness/src/bot/notifications/auto-adjust-callback.ts` 5
- `apps/fitness/src/bot/notifications/auto-adjust-cron.ts` 2
- `apps/fitness/src/bot/notifications/auto-adjust.ts` 8
- `apps/fitness/src/bot/notifications/discord-interactions.ts` 8
- `apps/fitness/src/bot/notifications/notifier.ts` 26
- `apps/fitness/src/bot/notifications/scheduler.ts` 3
- `apps/fitness/src/bot/standalone.ts` 14
- `apps/fitness/src/bot/telegram-polling.ts` 23
- `apps/fitness/src/bot/utils/error.ts` 3
- `apps/fitness/src/bot/utils/telegram-reply.ts` 16
- `apps/fitness/src/bot/utils/telegram.ts` 2
- `apps/fitness/src/lib/ai/claude-advisor.ts` 1
- `apps/fitness/src/lib/daily-report.ts` 2
- `apps/fitness/src/lib/garmin/sync.ts` 1
- `apps/fitness/src/lib/monitoring/admin-alerts.ts` 1
- `apps/fitness/src/mcp/logger.ts` 1
- `deploy/discord-switch.cjs` 4
- `deploy/discord-switch.sh` 9
- `deploy/notify-deploy.cjs` 8
- `deploy/release-inplace.sh` 2
- `deploy/ssh-deploy.sh` 1
- `deploy/t2-check.sh` 3
- `deploy/telegram-polling.cjs` 5
- `deploy/telegram-polling.sh` 30
- `packages/notify/src/deliver.ts` 1
- `packages/notify/src/discord-bot.ts` 5
- `packages/notify/src/discord-gateway.ts` 5
- `packages/notify/src/discord-md.ts` 5
- `packages/notify/src/discord.ts` 3
- `packages/notify/src/error.ts` 5
- `packages/notify/src/escape.ts` 2
- `packages/notify/src/index.ts` 4
- `packages/notify/src/platform-env.ts` 3
- `packages/notify/src/split.ts` 2
- `packages/notify/src/telegram.ts` 13
- `packages/notify/src/types.ts` 7

### 테스트 — 54 파일 · 483 줄

- `apps/finance/src/app/api/alerts/history/[id]/retry/__tests__/route.test.ts` 10
- `apps/finance/src/bot/__tests__/telegram-polling.test.ts` 27
- `apps/finance/src/bot/commands/__tests__/ai-decide.test.ts` 12
- `apps/finance/src/bot/commands/__tests__/ai-telegram.test.ts` 8
- `apps/finance/src/bot/commands/__tests__/expense-telegram.test.ts` 6
- `apps/finance/src/bot/commands/__tests__/expense-trade-decide.test.ts` 10
- `apps/finance/src/bot/commands/__tests__/lookup-manage-decide.test.ts` 4
- `apps/finance/src/bot/commands/__tests__/lookup-telegram.test.ts` 3
- `apps/finance/src/bot/commands/__tests__/manage-telegram.test.ts` 3
- `apps/finance/src/bot/commands/__tests__/special-decide.test.ts` 14
- `apps/finance/src/bot/commands/__tests__/special-telegram.test.ts` 9
- `apps/finance/src/bot/commands/__tests__/telegram-fake.ts` 5
- `apps/finance/src/bot/commands/__tests__/trade-telegram.test.ts` 5
- `apps/finance/src/bot/commands/__tests__/vest-confirm.test.ts` 3
- `apps/finance/src/bot/core/__tests__/reply.test.ts` 17
- `apps/finance/src/bot/discord/__tests__/router.test.ts` 6
- `apps/finance/src/bot/notifications/__tests__/alert-dispatcher.test.ts` 17
- `apps/finance/src/bot/notifications/__tests__/briefing-target.test.ts` 1
- `apps/finance/src/bot/notifications/__tests__/discord-interactions.test.ts` 6
- `apps/finance/src/bot/notifications/__tests__/notifier.test.ts` 37
- `apps/finance/src/bot/notifications/__tests__/scheduler.test.ts` 10
- `apps/finance/src/lib/ai/__tests__/advisor-monitor.test.ts` 1
- `apps/finance/src/lib/ai/__tests__/system-prompt.test.ts` 6
- `apps/finance/src/lib/alert-config/__tests__/categories.test.ts` 1
- `apps/fitness/src/bot/__tests__/telegram-handlers.test.ts` 10
- `apps/fitness/src/bot/__tests__/telegram-polling.test.ts` 27
- `apps/fitness/src/bot/commands/__tests__/decide.test.ts` 8
- `apps/fitness/src/bot/core/__tests__/state-key.test.ts` 9
- `apps/fitness/src/bot/discord/__tests__/discord-router.test.ts` 1
- `apps/fitness/src/bot/notifications/__tests__/discord-interactions.test.ts` 7
- `apps/fitness/src/bot/notifications/__tests__/notifier.test.ts` 45
- `apps/fitness/src/bot/utils/__tests__/error.test.ts` 3
- `apps/fitness/src/bot/utils/__tests__/telegram-reply.test.ts` 14
- `apps/fitness/src/bot/utils/__tests__/telegram.test.ts` 2
- `apps/fitness/src/lib/ai/__tests__/session-store.test.ts` 2
- `deploy/test_deploy.py` 4
- `deploy/test_discord_switch.py` 7
- `deploy/test_notify_deploy.py` 19
- `deploy/test_release_inplace.py` 2
- `deploy/test_t2_check.py` 3
- `deploy/test_telegram_polling.py` 44
- `packages/chat/src/contract.test.ts` 1
- `packages/notify/src/build-config.test.ts` 1
- `packages/notify/src/deliver.test.ts` 1
- `packages/notify/src/discord-bot.test.ts` 1
- `packages/notify/src/discord.test.ts` 3
- `packages/notify/src/error.test.ts` 4
- `packages/notify/src/escape.test.ts` 2
- `packages/notify/src/index.test.ts` 2
- `packages/notify/src/platform-env.test.ts` 5
- `packages/notify/src/split.test.ts` 2
- `packages/notify/src/telegram.test.ts` 17
- `tools/local/test_check_env.py` 15
- `tools/local/test_write_env.py` 1

### env 템플릿 — 7 파일 · 32 줄

- `.env.example` 4
- `apps/finance/.env.example` 7
- `apps/fitness/.env.example` 5
- `deploy/env/finance.env.template` 6
- `deploy/env/fitness.env.template` 4
- `tools/local/env/fin.env` 4
- `tools/local/env/fit.env` 2

### 가드 — 3 파일 · 13 줄

- `.claude/rules/isolation.md` 3
- `tools/local/check_env.py` 7
- `tools/local/run.sh` 3

### 런북 — 7 파일 · 30 줄

- `docs/runbooks/007-t10-discord.md` 10
- `docs/runbooks/007-t2-server-check.md` 3
- `docs/runbooks/007-t4-build-rehearsal.md` 1
- `docs/runbooks/007-t5-fin-cutover.md` 6
- `docs/runbooks/007-t9-fit-cutover.md` 4
- `docs/runbooks/ai-model-upgrade.md` 1
- `docs/runbooks/release-inplace.md` 5

### DB 스키마·마이그레이션 — 3 파일 · 10 줄

- `apps/finance/prisma/schema.prisma` 2
- `apps/fitness/prisma/migrations/20260716054043_workout_adjustment/migration.sql` 4
- `apps/fitness/prisma/schema.prisma` 4

### 앱 하네스 — 6 파일 · 14 줄

- `apps/finance/.claude/agents/release-manager.md` 2
- `apps/finance/.claude/rules/workflow.md` 1
- `apps/finance/.claude/skills/codex-response-patterns/SKILL.md` 1
- `apps/finance/.claude/skills/milestone-workflow/SKILL.md` 1
- `apps/finance/.claude/skills/release-publisher/SKILL.md` 6
- `apps/finance/CLAUDE.md` 3

### 의존성 — 4 파일 · 16 줄

- `apps/finance/package-lock.json` 6
- `apps/finance/package.json` 2
- `apps/fitness/package-lock.json` 6
- `apps/fitness/package.json` 2

### 앱 안 옛 배포(비활성) — 5 파일 · 43 줄

- `apps/finance/.github/workflows/deploy.yml` 20
- `apps/finance/deploy/deploy.sh` 1
- `apps/fitness/.github/workflows/deploy.yml` 19
- `apps/fitness/deploy/deploy.sh` 1
- `apps/fitness/ecosystem.config.js` 2

### 소진 하네스(루트) — 2 파일 · 5 줄

- `.claude/agents/dual-repo-operator.md` 2
- `.claude/skills/dual-repo-change/SKILL.md` 3

### 기타 문서(현행) — 2 파일 · 9 줄

- `packages/notify/README.md` 8
- `tools/local/README.md` 1

### 이력 문서(루트) — 117 파일 · 2094 줄

- `CLAUDE.md` 14
- `README.md` 1
- `_workspace/006/01_surveyor_monorepo.md` 9
- `_workspace/006/01_surveyor_monorepo_r2.md` 1
- `_workspace/006/02_writer_006.md` 9
- `_workspace/006/02_writer_006_r1.md` 11
- `_workspace/006/03_auditor_006_r2.md` 1
- `_workspace/006/scripts/deps.sh` 1
- `_workspace/006/scripts/scan.py` 1
- `_workspace/006/scripts/x3b.sh` 1
- `_workspace/006/scripts/x3c.sh` 1
- `_workspace/006/scripts/x7.sh` 4
- `_workspace/007/01_surveyor_cutover.md` 7
- `_workspace/007/02_writer_cutover.md` 7
- `_workspace/007/03_auditor_cutover.md` 1
- `_workspace/007/03_auditor_cutover_r2.md` 1
- `_workspace/009/00_user_answers.md` 2
- `_workspace/009/01_discord_platform.md` 38
- `_workspace/009/01_surveyor_fin.md` 52
- `_workspace/009/01_surveyor_fit.md` 54
- `_workspace/009/02_writer_009.md` 77
- `_workspace/009/03_auditor_009.md` 13
- `_workspace/009/03_auditor_009_r2.md` 7
- `_workspace/009/03_auditor_009_r3.md` 2
- `_workspace/009/d1/01_surveyor_fin.md` 27
- `_workspace/009/d1/01_surveyor_fit_infra.md` 24
- `_workspace/009/d1/02_writer_d1.md` 30
- `_workspace/009/d1/02_writer_d1_r2.md` 34
- `_workspace/009/d1/03_auditor_d1.md` 5
- `_workspace/009/d1/05_live_fin.md` 4
- `_workspace/009/d1/05_live_fit.md` 5
- `_workspace/009/d2/01_surveyor_fit.md` 57
- `_workspace/009/d2/02_writer_d2.md` 40
- `_workspace/009/d2/02_writer_d2_r2.md` 45
- `_workspace/009/d2/02_writer_d2_r3.md` 45
- `_workspace/009/d2/03_auditor_d2.md` 13
- `_workspace/009/d2/03_auditor_d2_r2.md` 2
- `_workspace/009/d2/05_live_chat.md` 1
- `_workspace/009/d2/06_live_fit.md` 3
- `_workspace/009/d3/01_surveyor_fin.md` 42
- `_workspace/009/d3/02_writer_d3.md` 59
- `_workspace/009/d3/02_writer_d3_r2.md` 73
- `_workspace/009/d3/02_writer_d3_r3.md` 79
- `_workspace/009/d3/03_auditor_d3.md` 19
- `_workspace/009/d3/03_auditor_d3_r2.md` 7
- `_workspace/009/d3/05_live_fin.md` 2
- `_workspace/009/d4/01_surveyor_d4.md` 141
- `_workspace/009/d4/02_writer_d4.md` 17
- `_workspace/009/d4/02_writer_d4_r2.md` 20
- `_workspace/009/d4/02_writer_d4_r3.md` 20
- `_workspace/009/d4/02_writer_d4_r4.md` 14
- `_workspace/009/d4/02_writer_d4_r5.md` 15
- `_workspace/009/d4/03_auditor_d4.md` 4
- `_workspace/01_surveyor_layout.md` 1
- `_workspace/01_surveyor_porting.md` 37
- `_workspace/01_surveyor_transport.md` 21
- `_workspace/02_writer_notify.md` 58
- `_workspace/03_auditor_notify.md` 34
- `_workspace/05_surveyor_fin_loops.md` 3
- `_workspace/1a-0/01_surveyor_db_writes.md` 10
- `_workspace/1a-0/01_surveyor_gitdep.md` 5
- `_workspace/1a-0/02_writer_1a0.md` 9
- `_workspace/1a-0/03_auditor_1a0.md` 25
- `_workspace/1a-0/04_operator_1a0.md` 3
- `_workspace/1a-1-prep/01_surveyor_i1.md` 2
- `_workspace/1a-1-prep/01_surveyor_q10_q19.md` 34
- `_workspace/1a-1-prep/02_writer_1a1prep.md` 24
- `_workspace/1a-1-prep/03_auditor_1a1prep.md` 6
- `_workspace/1a-1/01_plan_1a1.md` 32
- `_workspace/1a-1/03_auditor_1a1plan.md` 57
- `_workspace/1a-2/01_plan_1a2.md` 8
- `_workspace/1a-2/03_auditor_1a2plan.md` 11
- `_workspace/1a-2/04_operator_rollback.md` 3
- `_workspace/1a-3/01_plan_1a3.md` 17
- `_workspace/1a-3/03_auditor_1a3plan.md` 7
- `_workspace/1a-3/03_auditor_1a3plan_r2.md` 1
- `_workspace/1a-3/04_operator_rollback.md` 2
- `_workspace/1a-3/patch/0003-feat-notify-send.ts-pleiades-notify-6-pleiades-95.patch` 40
- `_workspace/62/04_operator_rollback.md` 1
- `_workspace/harness/01_surveyor_harness_workflow_diff.md` 4
- `_workspace/harness/02_writer_harness.md` 1
- `_workspace/harness/03_auditor_harness.md` 1
- `_workspace/harness/04_operator_42_rollback.md` 1
- `docs/artifacts/integration-artifact.html` 21
- `docs/handoff/2026-09-03-from-myfinance.md` 2
- `docs/handoff/2026-09-08-1a-0.md` 3
- `docs/handoff/2026-09-09-1a-1-prep-h1-h3.md` 2
- `docs/handoff/2026-09-10-1a-1-done.md` 11
- `docs/handoff/2026-09-11-1a-2-done.md` 2
- `docs/handoff/2026-09-14-61-62-done.md` 1
- `docs/handoff/2026-09-28-dev-sync-policy.md` 1
- `docs/handoff/2026-09-30-monorepo-first.md` 1
- `docs/handoff/2026-10-01-m4-done.md` 1
- `docs/handoff/2026-10-15-m6b-fit-buttons.md` 3
- `docs/handoff/2026-10-16-m6-done-cutover-design.md` 1
- `docs/handoff/2026-10-19-freeze-sync-pm2-exception.md` 3
- `docs/handoff/2026-10-21-fin-cutover.md` 1
- `docs/handoff/2026-10-22-fit-cutover.md` 3
- `docs/handoff/2026-10-27-d0-chat.md` 1
- `docs/handoff/2026-10-27-t10-discord-009.md` 9
- `docs/handoff/2026-10-28-d1-telegram-optional.md` 7
- `docs/handoff/2026-10-28-d2-fit-discord-inbound.md` 10
- `docs/handoff/2026-10-29-d2prime-script-d3-design.md` 9
- `docs/handoff/2026-10-29-d3-pr1a-decide-split.md` 7
- `docs/handoff/2026-10-30-d3-done-v1.5.0.md` 11
- `docs/handoff/2026-11-02-d3prime-done-v1.5.2.md` 9
- `docs/handoff/2026-11-02-d4-done-v1.5.4.md` 2
- `docs/research/measured-facts.md` 152
- `docs/specs/001-integration-master.md` 3
- `docs/specs/002-platform-direction.md` 11
- `docs/specs/003-notify-package.md` 74
- `docs/specs/004-repo-layout.md` 2
- `docs/specs/005-harness-integration.md` 1
- `docs/specs/006-monorepo-first.md` 12
- `docs/specs/007-cutover.md` 8
- `docs/specs/008-monitoring.md` 3
- `docs/specs/009-discord-only.md` 87

### 이력 문서(앱) — 102 파일 · 372 줄

- `apps/finance/README.md` 7
- `apps/finance/docs/architecture.md` 4
- `apps/finance/docs/data-model.md` 1
- `apps/finance/docs/designs/181-watchlist/design-notes.md` 1
- `apps/finance/docs/designs/387-custom-strategy-web-ui/design-notes.md` 1
- `apps/finance/docs/designs/387-custom-strategy-web-ui/prototype.html` 2
- `apps/finance/docs/designs/396-alert-config-ui/prototype.html` 3
- `apps/finance/docs/implementation_plans/119-briefing.md` 5
- `apps/finance/docs/implementation_plans/137-networth.md` 2
- `apps/finance/docs/implementation_plans/146-report.md` 1
- `apps/finance/docs/implementation_plans/155-backtest.md` 2
- `apps/finance/docs/implementation_plans/200-bot-expense-whooing-fix.md` 1
- `apps/finance/docs/implementation_plans/202-bot-category-suggestion.md` 1
- `apps/finance/docs/implementation_plans/214-bot-standalone.md` 2
- `apps/finance/docs/implementation_plans/216-telegram-long-message-html.md` 2
- `apps/finance/docs/implementation_plans/224-multi-expense-input.md` 1
- `apps/finance/docs/implementation_plans/228-ai-session-persistence.md` 1
- `apps/finance/docs/implementation_plans/263-ai-system-prompt-enhancement.md` 1
- `apps/finance/docs/implementation_plans/59-telegram-bot.md` 6
- `apps/finance/docs/implementation_plans/72-expense-income.md` 4
- `apps/finance/docs/implementation_plans/90-ai-advisor.md` 5
- `apps/finance/docs/mcp-log-schema.md` 1
- `apps/finance/docs/milestone-2.md` 31
- `apps/finance/docs/milestone-3.md` 8
- `apps/finance/docs/roadmap.md` 15
- `apps/finance/docs/specs/198-category-suggestion.md` 1
- `apps/finance/docs/specs/200-bot-expense-whooing-fix.md` 5
- `apps/finance/docs/specs/202-bot-category-suggestion.md` 8
- `apps/finance/docs/specs/210-transfer-category-type.md` 2
- `apps/finance/docs/specs/214-bot-standalone.md` 6
- `apps/finance/docs/specs/216-telegram-long-message-html.md` 3
- `apps/finance/docs/specs/224-multi-expense-input.md` 1
- `apps/finance/docs/specs/228-ai-session-persistence.md` 3
- `apps/finance/docs/specs/233-target-price-alert.md` 2
- `apps/finance/docs/specs/235-ta-signal-alert.md` 2
- `apps/finance/docs/specs/239-monitoring-config.md` 2
- `apps/finance/docs/specs/247-asset-management-page.md` 1
- `apps/finance/docs/specs/249-asset-deposit.md` 1
- `apps/finance/docs/specs/263-ai-system-prompt-enhancement.md` 2
- `apps/finance/docs/specs/284-next-15-migration.md` 1
- `apps/finance/docs/specs/303-disclaimer-component.md` 1
- `apps/finance/docs/specs/316-generic-toast.md` 1
- `apps/finance/docs/specs/354-bot-ipv6-token-fix.md` 9
- `apps/finance/docs/specs/356-bot-409-conflict-fix.md` 6
- `apps/finance/docs/specs/361-vest-rsu-automation.md` 1
- `apps/finance/docs/specs/366-deploy-automation.md` 5
- `apps/finance/docs/specs/370-milestone-11-master.md` 1
- `apps/finance/docs/specs/371-watchlist-price-fix.md` 1
- `apps/finance/docs/specs/375-active-review.md` 1
- `apps/finance/docs/specs/380-custom-strategy.md` 3
- `apps/finance/docs/specs/387-custom-strategy-web-ui.md` 1
- `apps/finance/docs/specs/405-mcp-structured-logging.md` 1
- `apps/finance/docs/specs/414-milestone-15-master.md` 1
- `apps/finance/docs/specs/416-alert-history.md` 2
- `apps/finance/docs/specs/417-alert-history-page.md` 1
- `apps/finance/docs/specs/432-milestone-16-master.md` 2
- `apps/finance/docs/specs/443-milestone-17-master.md` 1
- `apps/finance/docs/specs/467-milestone-18-master.md` 1
- `apps/finance/docs/specs/499-closing-review-index-prices.md` 3
- `apps/finance/docs/specs/506-market-stamp-regular-price.md` 1
- `apps/finance/docs/specs/88-bot-performance.md` 2
- `apps/finance/docs/specs/phase10-alerts.md` 7
- `apps/finance/docs/specs/phase11-briefing.md` 2
- `apps/finance/docs/specs/phase12-networth.md` 2
- `apps/finance/docs/specs/phase13-report.md` 2
- `apps/finance/docs/specs/phase14-backtest.md` 2
- `apps/finance/docs/specs/phase16-expense-enhancement.md` 3
- `apps/finance/docs/specs/phase17-admin-center.md` 2
- `apps/finance/docs/specs/phase7-telegram-bot.md` 12
- `apps/finance/docs/specs/phase8-expense-income.md` 6
- `apps/finance/docs/specs/phase9-ai-advisor.md` 16
- `apps/fitness/docs/designs/309-photo/prototype.html` 4
- `apps/fitness/docs/designs/552-prompt-management/preview.html` 5
- `apps/fitness/docs/roadmap.md` 13
- `apps/fitness/docs/specs/137-deploy-automation.md` 3
- `apps/fitness/docs/specs/140-bot-409-conflict-fix.md` 6
- `apps/fitness/docs/specs/194-mcp-pino-logging.md` 1
- `apps/fitness/docs/specs/212-ai-command-report.md` 3
- `apps/fitness/docs/specs/350-food-edit-force-reply-fix.md` 6
- `apps/fitness/docs/specs/364-mcp-date-label-off-by-one.md` 1
- `apps/fitness/docs/specs/365-server-tz-residuals.md` 2
- `apps/fitness/docs/specs/394-history-browser.md` 1
- `apps/fitness/docs/specs/403-cache-epoch.md` 1
- `apps/fitness/docs/specs/455-report-evidence-phase2.md` 1
- `apps/fitness/docs/specs/532-checkup-import.md` 2
- `apps/fitness/docs/specs/544-medication.md` 1
- `apps/fitness/docs/specs/552-prompt-management.md` 1
- `apps/fitness/docs/specs/M12-personal-goals.md` 1
- `apps/fitness/docs/specs/M13-auto-adjust-notifications.md` 8
- `apps/fitness/docs/specs/M14-followup.md` 6
- `apps/fitness/docs/specs/M14-food-tracking-ai-kcal.md` 5
- `apps/fitness/docs/specs/M14-phase2-5-photo-input.md` 3
- `apps/fitness/docs/specs/bot-telegram-ipv6-timeout-202606.md` 21
- `apps/fitness/docs/specs/m2-8-date-fix.md` 1
- `apps/fitness/docs/specs/m2-8-followup-kst-and-reports.md` 5
- `apps/fitness/docs/specs/m2-overview.md` 4
- `apps/fitness/docs/specs/m2-telegram-bot.md` 10
- `apps/fitness/docs/specs/m5-1-reports-pagination.md` 1
- `apps/fitness/docs/specs/m5-2-1-readiness-score.md` 1
- `apps/fitness/docs/specs/m5-4-multi-turn.md` 5
- `apps/fitness/docs/specs/m5-overview.md` 2
- `apps/fitness/docs/specs/m6-2-injury-risk.md` 1
