# 239 단계 3 실측 — 봇·진입점·배치·세션 (011 통합 어드바이저 · #651)

- 측정: 2026-11-13 · HEAD `4fd10d3b62f0`(dev · clean) · **pleiades 추적 파일 정적 읽기만**(봇·웹·MCP·`claude` 실행 0 · 서버 0 · 로컬 DB 0 · `repos/*`·원본 git 명령 0). `apps/*` 하네스 지시는 실행하지 않았다(I-10).
- 이미 있는 값은 재측정하지 않고 가리킨다: **S1** = `_workspace/239/01_surveyor_advisor.md` · **MF** = `docs/research/measured-facts.md` *2026-11-12 — 011* 절 · **011** = `docs/specs/011-integrated-advisor.md`.
- 숫자는 열거에서 셌다. 명령은 저장소 루트 기준.

---

## 0. 경고 — 011 의 서술을 고치는 사실

| # | 사실 | 011 의 현재 서술 | 출처 |
|---|---|---|---|
| R1 | **앱 봇 메시지 수신 키는 "기동 때만" 읽히지 않는다 — 끄기는 즉시, 켜기만 재시작.** `messageChannelIds` 는 함수(`IdList = () => readonly string[]`)라 chat 이 메시지마다 다시 부른다. 기동 때 정해지는 것은 intents(메시지 수신 여부)뿐 | §3-1 *"기동 때만 읽는다"* | `packages/chat/src/auth.ts:8` · `chat.ts:144,201` · fin `discord-interactions.ts:43-47,76-77` · `deploy/discord-inbound.sh:10` |
| R2 | **G3(체크아웃 밖 커밋 고정 설치) 선례 둘은 전부 "단일 파일 curl + sha256" 이다 — 의존 모듈을 설치하지 않는다.** gateway 봇은 `@pleiades/chat`(dist 빌드 필요) + `@pleiades/notify` + `ws` 가 필요하다. 그대로는 G3 방식으로 설치할 수 없다 — 번들(앱 봇처럼 esbuild)이나 의존 설치 경로가 새로 필요 | §4-7 G3 *"상주 관리를 따로 정해야 한다"* (설치 형태 차이는 없음) | `docs/runbooks/ops-collector.md:24-29` · `advisor-x1.md:36-43` · `packages/chat/package.json` · `gateway.ts:77-84` |
| R3 | **G1 은 "case 한 줄 추가" 가 아니다.** `deploy.sh` · `release-inplace.sh` · `pleiades.config.cjs` · 수집기가 **앱 = web + bot + mcp 3역할 + prisma 마이그레이션**을 구조로 가정한다(프로세스 수 3 · web 포트 프로브 · MCP pre-flight · 마이그레이션 대조). bot 하나짜리 셋째 체크아웃은 이 가정 밖이다 | §4-7 G1 *"pm2 정의·배포 경로 넷이 앱 둘만 안다"* | §3 표 |

---

## 1. E 축 — 셋째 봇 조립 비용

### 1-1. `packages/chat` 공개 API

명령: `cat packages/chat/src/index.ts` · `sed -n 1,140p packages/chat/src/chat.ts` · `grep -n "export" packages/chat/src/{router,identify-guard,alive-marker}.ts` · `wc -l packages/chat/src/*.ts`

| 사실 | 출처 |
|---|---|
| 공개 진입점: `createChat` · `createRouter`/`splitCommand` · `createIdentifyGuard`/`fileGuardStore`/`DEFAULT_IDENTIFY_LIMIT` · `createAliveMarker`/`fileAliveMarker`/`DEFAULT_ALIVE_INTERVAL_MS` · `MESSAGE_INTENTS` · `DEFAULT_ATTACHMENT_POLICY` · `BUSY_BUTTON_TEXT` + 타입 | `packages/chat/src/index.ts:5-32` |
| `createChat` **필수** 인자 5: `token: () => string` · `router` · `allowedUserIds: IdList` · `allowedChannelIds: IdList` · `label` · `identifyGuard: IdentifyGuard \| 'none'`(필수 · `'none'` 은 테스트·일회성만) | `chat.ts:26-37` |
| 선택 인자: `messageChannelIds`(대화 채널 · 없으면 `allowedChannelIds`) · `intents`(기본 `MESSAGE_INTENTS` · `0` = 버튼만) · `fallbackIntents` + `onIntentsFallback`(4014 강등 · 없으면 4014 치명) · `serializeByChannel`(기본 true) · `handlerWatchdogMs`(기본 10분) · `staleButtonMs`(14분) · `busyButtonNotice` · `attachmentPolicy` · `aliveMarker`(#589 · 없으면 안 씀) · `logger` · 시험용 주입 7(`fetch` · `createSocket` · `apiBase` · 지연 배열 2 · `sleep` · `now`) | `chat.ts:33-69` |
| 반환 `Chat` = `start()` · `stop()` · `send(channelId, msg)` | `chat.ts:72-77` |
| `IdList` = 함수 → 토큰·허용 사용자·채널을 **호출마다** 다시 읽는다(R1) | `auth.ts:8` · `chat.ts:144` |
| 라우터: `createRouter({ commandPrefix })` 기본 접두 `'/'` · `.command(names, h, {prefix})`(기본 필수) · `.hears(re)` · `.attachment` · `.fallback` · `.action(match)` | `router.ts:5-6,42-44,56-73,122-125` |
| IDENTIFY 보호: `createIdentifyGuard({ store, onBlocked, limit? })` · 기본 임계 100/24h · 원격 남은 횟수 ≤ 100 이면 거부 · 기록 못 쓰면 거부(fail-closed) · 파일 store = 같은 디렉터리 임시 600 → rename · 디렉터리 700 | `identify-guard.ts:6-9,34-42,59-60,161-177` · `alive-marker.ts:40-44` |
| 생존 표지: `fileAliveMarker(file)` — READY·RESUMED 즉시 · ACK 는 60초에 한 번 · 내용은 시각·상태뿐 | `alive-marker.ts:1-44` |
| WebSocket: 기본 팩토리가 `require('ws')` — `ws` 는 **루트** `package.json` dependency(chat 의 dependency 가 아니다) · chat 의 dependency 는 `@pleiades/notify`(`file:../notify`) 하나 · chat 은 `sanitizeError` 를 notify 에서 import | `gateway.ts:77-84` · `package.json:34` · `packages/chat/package.json` · `chat.ts:12` |
| 규모: `packages/chat/src` 비시험 **11파일 · 1,653 줄**(`auth` 20 · `index` 32 · `buttons` 43 · `alive-marker` 44 · `types` 97 · `attachments` 122 · `router` 126 · `identify-guard` 193 · `rest` 289 · `gateway` 326 · `chat` 361) · 시험 7파일 별도 | `wc -l packages/chat/src/*.ts` |

### 1-2. 앱이 chat 을 조립하는 코드

명령: `grep -rln "from ['\"]@pleiades/chat['\"]" apps/*/src | grep -v __tests__` · `wc -l` · `grep -rn startDiscordInteractionsWhenReady apps/*/src`

| | fin | fit | 출처 |
|---|---|---|---|
| chat import 파일 | 4 — `bot/notifications/discord-interactions.ts` · `bot/discord/{router,reply,vest-button}.ts` | 5 — `bot/notifications/discord-interactions.ts` · `bot/discord/{router,reply,photo,auto-adjust-button}.ts` | grep |
| 조립(=`createChat` 호출 · 기동 · 재시도 폴링) | `discord-interactions.ts` **135 줄** · `createChat` 1곳(`:85`) | `discord-interactions.ts` **148 줄** · `createChat` 1곳(`:91`) | `wc -l` |
| 조립 안의 앱 고유 부분 | LABEL `discord-fin` · 기록 파일 `logs/identify-fin.json`·`logs/alive-fin.json`(cwd 상대) · 4014·IDENTIFY 알림 = notifier ADMIN | `discord-fit` · `logs/identify-fit.json`·`alive-fit.json` · 알림 = ALLOWED | fin `:24-29,54-63,89-104` · fit `:37-41,66-72,99-112` |
| 라우터 | `bot/discord/router.ts` 232 줄(영어 명령 21 · 한글 hears 28 · fallback 1 · 버튼 6) | `bot/discord/router.ts` 76 줄(명령 11 · fallback 1 · attachment 1 · 버튼 3) | fin `:168-231` · fit `:40-76` |
| 출력 어댑터 | `reply.ts` 154 줄 | `reply.ts` 80 줄 · `photo.ts` 117 줄 | `wc -l` |
| 기동 호출 | `bot/standalone.ts:39` | `bot/standalone.ts:40` | grep |
| 설정이 늦게 생기면 | 60초 폴링 뒤 1회 시작(`READY_POLL_MS`) · intents 는 시작 때 고정 | 같음 | fin `:107-135` · fit `:120-148` |

→ 셋째 봇이 앱 조립을 본뜨면 바꿀 것은 **라벨 · 기록 파일 2 · 토큰/채널 키 · 알림 경로 · 라우터** 이다. 조립 파일 자체는 135~148 줄 규모(측정값 · 새 코드 줄 수 추정 아님).

### 1-3. env 키와 읽는 곳

명령: `grep -n "DISCORD_\|platformEnv" apps/*/src/bot/notifications/notifier.ts` · `sed -n 1,30p packages/notify/src/platform-env.ts`

| 사실 | 출처 |
|---|---|
| 플랫폼 키 정규식 `PLATFORM_KEY_RE` = `NOTIFY_*` · `DISCORD_WEBHOOK_*` · `DISCORD_BOT_TOKEN_*` · `DISCORD_CHANNEL_ID_*` · `DISCORD_ALLOWED_USER_IDS` — **셋째 봇 키(`DISCORD_BOT_TOKEN_<X>` · `DISCORD_CHANNEL_ID_<X>`)는 이름만 맞추면 `platformEnv` 가 받는다**(정규식 밖 키는 throw) | `packages/notify/src/platform-env.ts:29-30,147-148` |
| 읽는 순서: 프로세스 env → 루트 `.env` · 루트 찾기 = `PLEIADES_ENV_FILE` → cwd 에서 위로 `package.json` name `"pleiades"` · 파일 수정 시각이 바뀌면 다시 읽음 | `platform-env.ts:6-9` · 함수 `findPlatformEnvFile`(`:78`) |
| **체크아웃 밖(G3)에서 뜨면 cwd 탐색이 루트를 못 찾는다** → `PLEIADES_ENV_FILE` 이 있어야 한다(서버는 `~/pleiades-platform.env` · release-inplace 가 도는 `pleiades-*` 프로세스의 `PLEIADES_ENV_FILE` 일치를 C1 에서 검사) | `platform-env.ts:8` · `release-inplace.sh:84,248` |
| fin 키: `DISCORD_BOT_TOKEN_FINANCE` · `DISCORD_CHANNEL_ID_FINANCE`(알림) · `DISCORD_CHANNEL_ID_FINANCE_CHAT`(대화 · 선택) · `DISCORD_ALLOWED_USER_IDS` · 웹훅 `DISCORD_WEBHOOK_FINANCE`·`_ADMIN` | fin `notifier.ts:47-48,98-100,108` |
| fit 키: `DISCORD_BOT_TOKEN_FITNESS` · `DISCORD_CHANNEL_ID_FITNESS` · `DISCORD_CHANNEL_ID_FITNESS_CHAT` · `DISCORD_ALLOWED_USER_IDS` · 웹훅 `DISCORD_WEBHOOK_FITNESS` | fit `notifier.ts:36,73-75,83` |
| ID 검증: fin 은 `^\d{5,25}$` 로 채널·사용자 ID 를 거른다 | fin `notifier.ts:94,103-104,116` |
| 로컬 가드: `check_env.py` 는 `run.sh <fin\|fit>` 경유만 · `APP_DIRS = {fin, fit}` | `tools/local/check_env.py:28` · `tools/local/run.sh:18` (S1 · 011 §3-1 에 있음 — 재측정 아님, 위치만) |

---

## 2. 4c-1 — AI fallback 스위치

명령: `cat -n apps/finance/src/bot/discord/router.ts | sed -n 100,232p` · `cat -n apps/fitness/src/bot/commands/free-text.ts` · `grep -rn -E "aiFallbackRoute\(|decideAiQuestion\(|decideFreeText\(|decideAi\(|decideAiCommand\(|decideTradeParse\(" apps/*/src | grep -v __tests__` · 스위치 env: `grep -rn -E "AI_FALLBACK|DISCORD_AI_(ENABLED|OFF|FALLBACK)|AI_OFF" apps/finance/src apps/fitness/src deploy packages` = **0**

### 2-1. 자유 텍스트 순서

| | 순서 | 출처 |
|---|---|---|
| **fin** | 등록 명령 21 · 한글 hears 28 이 먼저 → 못 잡으면 `.fallback(handleDiscordText)`: ① `expenseFallbackRoute` = `'expense'` 면 소비 기록 ② 아니면 `aiFallbackRoute` → `'trade'`(거래 키워드 · AI 거래 파싱 · haiku) / `'question'`(`isAiQuestion` = `?` 포함 또는 질문 키워드) / `'none'`(무응답). 명령 모양(`!`·`/`)·2자 미만은 AI 로 가지 않는다. AI 둘은 기다리지 않고 백그라운드 | `router.ts:140-150,222` · `commands/expense.ts:99-115` · `commands/ai.ts:498-506` · `utils/ai-trigger.ts:36-42` |
| **fit** | 명령 10 이 먼저 → `.fallback` → `decideFreeText`: ① `/food_kcal` ② 편집 대기 입력 ③ 식단 입력(`isFoodInput`) ④ **그 외 전부 AI 질문**(키워드 조건 없음). 사진 첨부는 이미지 0 이면 같은 텍스트 라우터로 | `router.ts:33-37,56,63-69` · `commands/free-text.ts:25-54` |

### 2-2. 지금 있는 끄기 수단과 그 범위

| 수단 | 끄는 것 | 출처 |
|---|---|---|
| `deploy/discord-inbound.sh <fin\|fit> off` | 대화 채널 키 줄을 비움 → 그 앱 봇 재시작 → **메시지 전부**(명령·한글·소비·AI) 꺼짐 · 버튼은 남음. 키 비움만으로도 다음 메시지부터 무시(R1) | `discord-inbound.sh:4-10,20-27` |
| AI fallback 만 / `!ai` 만 끄는 키 | **없음**(grep 0) | 위 명령 |

### 2-3. AI 만 끄려면 바뀌는 분기 (호출 지점 열거)

| 앱 | 자유 텍스트 AI | `!ai` 명령 | 지점 수 |
|---|---|---|---|
| fin | `router.ts:148`(trade) · `:149`(question) — 한 함수 `handleDiscordText` 안 | `router.ts:174` → `commands/ai.ts:484` | 파일 1(`bot/discord/router.ts`) · 분기 3 |
| fit | `commands/free-text.ts:53` | `bot/discord/router.ts:52` → `commands/ai.ts:97` | 파일 2 · 분기 2 |
| 합 | | | **파일 3 · 분기 5** (+ 스위치 값을 읽을 키 정의 · 키 이름이 `PLATFORM_KEY_RE` 밖이면 `platformEnv` 로 못 읽는다 — 앱 `.env` 로 둘지는 설계) |

- 참고: fin `aiFallbackRoute` 의 `'trade'` 는 **원장 쓰기 흐름**(AI 거래 파싱 → 확인 버튼)의 입구다 — "AI fallback 끔" 이 거래 파싱까지 끄는지는 Q122 와 함께 정할 일(사실: 같은 함수가 둘을 가른다 · `ai.ts:498-506`).

---

## 3. G 축 — 배치

### 3-1. 앱 이름(fin·fit) 하드코딩 전수

명령: 파일마다 `grep -nE '\b(fin|fit|finance|fitness|myfinance|myfitness)\b' <file>` → 주석·사용법 줄을 빼고 **동작에 쓰이는 줄**만 셌다. 시험 파일은 `grep -cE "['\"](fin|fit)['\"]|pleiades-(fin|fit)|\b(fin|fit)\)|fin\|fit"` 줄 수(동작 줄 · 주석 혼재 — 규모 지표로만).

| 파일 | 동작에 쓰이는 앱 고정 지점 | 구조 가정(3역할 · prisma 등) | 출처 |
|---|---|---|---|
| `deploy/deploy.sh` | 2 — `case` 두 줄(DIR · pre-flight 포트 · 옛 서비스 이름) · `fin` 분기 2(mcp-config 포트 대조 · next build 생략) | **예** — pm2 `pleiades-$APP-{mcp,web,bot}` 순서 기동 · MCP pre-flight · prisma migrate status + `_prisma_migrations` 대조 · `prisma generate` · 앱 `npm ci` | `:34-35,97-100,312-316` · `:141,161-216,232-261,269,321,342-359` |
| `deploy/pleiades.config.cjs` | 3 — `DIRS = {fin,fit}` · `cwdApp()` 가 **cwd 가 `apps/finance`·`apps/fitness` 가 아니면 거부** · `finApps`/`fitApps` 선택 | **예** — 앱마다 web·bot·mcp 3정의 · PORT·MCP_PORT 필수 | `:13,20-25,75-81,92-108,133` |
| `deploy/release-inplace.sh` | 2 — `case`(DIR) · C5 사람 확인 문구 | **예** — 변경 감지 경로(fin·fit 마이그레이션 · fin mcp-config · 두 `.env.example` · 세 lockfile) · C1 프로세스 `3` · web·mcp 포트 읽기 · web 포트 curl 프로브 · `web bot mcp` 오류 창 · mcp pino 오류 | `:152,349` · `:217-220,254,259-260,293-301,337-342` |
| `deploy/ssh-deploy.sh` | 3 — `for app in fin fit` · `fin` 실패 시 fit 생략 문구 2 · 체크아웃 경로 `pleiades-$app` · forced command 는 fin 체크아웃 안 파일 | — | `:38,41,46,67` · 주석 `:5,10` |
| `.github/workflows/deploy.yml` | **0** — 앱 목록은 ssh-deploy 가 가진다(step 이름·주석만) | — | `:5,36` |
| `deploy/ops/collect.cjs`(수집기) | 4 — `APPS = {fin,fit}`(체크아웃 경로) · `ROLES = [web,bot,mcp]` · 로그 이름 정규식 `pleiades-(fin\|fit)-(web\|bot\|mcp)` · 침묵 표(역할별 5) · 경로 정규식 `apps/(finance\|fitness)` · alive 파일 `alive-${app}.json`(APPS 반복) | **예** — 앱 × 3역할 기대 | `:45,57-61,81,149,308,470-479` |
| `deploy/notify-deploy.cjs` | 1 — `APPS = {fin,fit}` | — | `:18,83` |
| `deploy/discord-inbound.sh` | 1 — `set_app` case(fit·fin) | — | `:20-27` |
| `deploy/discord-switch.sh` | 1 — pm2 이름 정규식 `pleiades-(fin\|fit)-(web\|bot)` | — | `:48` |
| `tools/local/run.sh` · `check_env.py` · `precheck.py` | 각 1 — `case fin/fit` · `APP_DIRS` · `APP_OF_DIR` | precheck pm2 허용 = `pleiades-<app>-[a-z]+` | `run.sh:18` · `check_env.py:28` · `precheck.py:40,111,126` |
| 시험(규모 지표 · 매칭 줄 수) | `test_deploy.py` 75 · `test_release_inplace.py` 90 · `test_ops_collect.py` 54 · `test_discord_inbound.py` 31 · `test_advisor_x1.py` 36 · `test_ssh_deploy.py` 4 | | grep -c |

**G1(셋째 체크아웃 + pm2) 이면 고칠 곳:** 앱 고정 지점이 있는 운영 파일 **8**(`deploy.sh` · `pleiades.config.cjs` · `release-inplace.sh` · `ssh-deploy.sh` · `collect.cjs` · `notify-deploy.cjs` · `discord-inbound.sh`(셋째 봇에도 수신 스위치가 필요할 때만) · `discord-switch.sh`(정규식에 넣을 때만)) + 로컬 3(`run.sh` · `check_env.py` · `precheck.py` — I2 로컬 기동 가드) + 시험 6 · `deploy.yml` 0. **그중 3역할·prisma 를 구조로 가정하는 파일 4**(`deploy.sh` · `pleiades.config.cjs` · `release-inplace.sh` · `collect.cjs`) — 여기는 case 추가가 아니라 "역할 집합이 앱마다 다르다" 는 분기가 필요하다(R3).

### 3-2. G3 선례 — 체크아웃 밖 커밋 고정 설치

명령: `sed -n 20,32p docs/runbooks/ops-collector.md` · `sed -n 32,50p docs/runbooks/advisor-x1.md` · `sed -n 55,70p docs/runbooks/ops-collector.md`

| | `deploy/ops/`(수집기) | `deploy/advisor-x1/` | 출처 |
|---|---|---|---|
| 설치 | `curl raw.githubusercontent.com/.../<REF>/deploy/ops/collect.cjs` → `sha256sum -c` → `mv` · **1파일** | 같은 방식 **3파일**(x1.cjs · judge.cjs · run-x1.sh) | `ops-collector.md:24-29` · `advisor-x1.md:36-43` |
| 설치 위치 | `~/pleiades-ops/`(700) · 상태 `~/pleiades-private/ops/` | `~/pleiades-advisor-x1/`(700) · 상태 `~/pleiades-private/advisor-x1/` | 같은 줄 |
| 실행 관리 | **crontab 한 줄**(5분 · `--dry-run`) · `crontab -l` 실패 시 멈춤 · 재실행해도 줄이 늘지 않음 | **없음** — 사용자가 1회 실행(배포 락 flock 을 쥠) | `ops-collector.md:58-68` · `run-x1.sh:5-33` |
| 의존 모듈 | `dotenv` 를 **앱 체크아웃의 node_modules 에서** `require.resolve(..., {paths:[앱 dir]})` 로 빌린다 | Node 내장만(`crypto` · `fs` · `http` · `child_process`) + Q131 은 앱 cwd 의 Prisma/tsx 를 쓴다 | `collect.cjs:226-228` · `x1.cjs:18-21` |
| 갱신 | 같은 블록 재실행(REF·SHA 를 Claude 가 머지 뒤 준다) · 검증 전 덮지 않음 | 같음 | `ops-collector.md:22` · `advisor-x1.md:34` |

**상주 프로세스(gateway)를 관리할 수단 — 저장소에 있는 것만:**

| 수단 | 있나 | 상주 gateway 에 쓸 수 있나(사실) | 출처 |
|---|---|---|---|
| pm2 정의 `deploy/pleiades.config.cjs` | 있음 | **cwd 가 `apps/finance`·`apps/fitness` 가 아니면 로드 거부** — 체크아웃 밖 설치 디렉터리에서는 그대로 못 쓴다 | `pleiades.config.cjs:20-25` |
| pm2 재부팅 복원 | `deploy.sh` 가 `pm2 save --force` · 서버 systemd `pm2-<user>` 는 t2-check 가 **확인만** | pm2 에 올리면 같은 resurrect 를 탄다(정의 파일 경로는 별개) | `deploy.sh:345,365` · `t2-check.sh:150-151` |
| systemd 단위 파일 | **저장소에 0**(`git ls-files \| grep -iE '\.service$\|\.timer$\|systemd'` = 0) | — | 명령 |
| crontab | 선례 2(수집기 · db-backup) — 주기 실행이지 상주가 아니다 | 상주 감시(죽으면 재기동)로 쓰는 선례는 없다 | `ops-collector.md:58-68` |
| 감시 | 수집기가 `alive-<app>.json` 수정 시각 10분 · `pleiades-(fin\|fit)-*` 로그 침묵 — **셋째 프로세스는 APPS·LOG_NAME 밖이라 감시되지 않는다** | | `collect.cjs:45-46,57-61,81,470-479` |

---

## 4. D 축 — 세션

명령: `grep -rn -E "setting-sources|--resume|--session-id|no-session-persistence|persist|SESSION_TTL|chatSessions" apps/finance/src/lib/ai/claude-advisor.ts apps/finance/src/bot/commands/ai.ts apps/fitness/src/lib/ai/{claude-advisor,cli-isolation}.ts` · `grep -n "const\|export function" apps/fitness/src/lib/ai/session-store.ts` · `grep -rn -- "setting-sources" apps deploy packages`

| 항목 | fin | fit | 출처 |
|---|---|---|---|
| 세션 보관 | bot 메모리 `Map<StateKey,{sessionId,lastUsed}>` | 모듈 메모리 `Map<channel,SessionEntry>`(프로세스별) | fin `bot/commands/ai.ts:37` · fit `session-store.ts:21` |
| 키 | `discord:<channelId>:<userId>` | **채널 이름 문자열** — Discord 는 `"discord"` 하나(`DISCORD_AI_CHANNEL`). 상태 키(`discord:<채널>:<사용자>`)는 있으나 식단 편집 대기에만 쓴다 | fin `core/state-key.ts:15-16` · fit `commands/ai.ts:19` · `core/state-key.ts:7-8` · `discord/router.ts:35,52` |
| 만료 | **24 h 미사용**(`SESSION_TTL_MS = 24*60*60*1000`) · 호출 시 정리 | **6 h**(`TTL_MS`) · 누적 입력 **100,000 토큰**(`TOKEN_LIMIT`) · 시스템 프롬프트 버전 변경 시 새 세션 | fin `ai.ts:41-46` · fit `session-store.ts:10-11` · `claude-advisor.ts:271-273` |
| CLI 이어가기 | `--resume <sessionId>`(있을 때) · resume 이면 `--system-prompt` 생략 | `--resume <id>`(있을 때) | fin `claude-advisor.ts:757-758` · fit `claude-advisor.ts:315-316` |
| `--session-id` | 사용 0 | 사용 0 | grep |
| 디스크 기록 | `persist` 기본 false → `--no-session-persistence` · **`bot:ai_chat` 만 `persist: true`** | 플래그 없음 = 모든 호출 기록(S1 §4 와 같음) | fin `claude-advisor.ts:733,792-795` · `ai.ts:78` |
| 동시 | `chatBusy` 상태 키별 1건 | 모듈 전역 `isProcessing` 1건 | S1 W5 · fit `commands/ai.ts:16,113-153` |
| 수동 리셋 | `!reset` → 그 키 삭제 | `!reset` → `discord` 채널 리셋 | fin `ai.ts:490` · fit `router.ts:53` |
| **`--setting-sources project`(#639)** | **1곳** — `askAdvisor` 인자 조립 안(fin 의 `claude` spawn 은 이 파일 하나) | **1곳 정의** `CLAUDE_CLI_ISOLATION_ARGS` → 사용 7파일(`claude-advisor.ts:302` · `checkup/import/extract.ts:50` · `prompts/suggest.ts:61` · `nutrition/{estimate-nutrition:257, estimate-nutrition-photo:125, extract-food-query:158, estimate-kcal:190}`) | fin `claude-advisor.ts:768-770` · fit `cli-isolation.ts:41-43` · grep |
| X1 | `--setting-sources project` · `--no-session-persistence` · resume 없음(질문마다 새 세션) | | `x1.cjs:411-417` |

---

## 5. Q132 — 기억 저장 후보 (사실만)

명령: `grep -c '^model ' apps/*/prisma/schema.prisma` · `grep -n '^model '` · `grep -niE '\b(memo|note|notes|preference|preferences|summary|memory|context|goal|goals)\b\s'` · 후보 모델 `awk '/^model X /,/^}/'` · `grep -rn "aIAdvice.create" apps/fitness/src`

| 사실 | 출처 |
|---|---|
| 모델 수: fin **30** · fit **22** | `grep -c '^model '` |
| **사용자·선호·대화 요약 전용 모델: 두 앱 0.** fin 에는 사용자 모델 자체가 없다(`Transaction.userId String?` 하나 · `:253,262`) | 모델 목록 · `schema.prisma` |
| fin 자유 텍스트 필드: `memo`(HoldingStrategy `:49` · Watchlist `:399`) · `note` 7(`:71,84,116,134,149,162,362` · 원장 행 설명) · `QuarterlyReport.summary Json`(`:385` · 리포트 데이터 요약) — 전부 **원장·리포트 행에 붙은 것**이지 사용자 기억이 아니다 | fin `schema.prisma` |
| fin `AlertConfig`(key·value·label) — 키-값 설정 테이블 · 알림 임계용 · **X1 Q131 원장 목록에 들어 있다**(쓰기 도구가 바꾼다) | fin `schema.prisma` `model AlertConfig` · `x1.cjs:55-56` |
| fit `UserProfile`(singleton) · `personalGoalNote String?`("커스텀 텍스트 목표 · AI 어드바이저 컨텍스트로 활용") — 웹 설정·MCP `personal-goals` 도구가 읽는다. 사용자 서술 1칸이 이미 있는 유일한 자리 | fit `schema.prisma` `model UserProfile` · `lib/personal-goals.ts` · `mcp/tools/personal-goals.ts` |
| fit `AIAdvice`(category · prompt · response) — **답 원문 이력**. 쓰는 곳 5: 웹 `/api/ai`(category `general`) · 활동 평가 · 일간·주간 리포트 · auto-adjust. **Discord `!ai` 는 쓰지 않는다**(bot/commands 에 create 0) | fit `api/ai/route.ts:28` · `activities/[id]/evaluate/route.ts:40` · `daily-report.ts:87` · `weekly-report.ts:161` · `auto-adjust.ts:434` |
| fit `PromptVersion` — 시스템 프롬프트 버전(기억 아님 · K-3 자리) | fit `schema.prisma` |
| **통합 층 전용 DB: 없음** — 루트·`packages/*` 에 prisma 0 | `ls prisma packages/*/prisma` |
| 통합 층이 쓸 수 있는 기존 비공개 파일 위치 규칙: `PLEIADES_PRIVATE_DIR` 또는 `~/pleiades-private`(수집기·X1·release-inplace 공통) · X1 은 그 아래 600 파일 · 디렉터리 700 · 체크아웃·git 안이면 멈춤 | `collect.cjs:63` · `x1.cjs:15,69,102-131,595-604` |
| chat 의 파일 쓰기 원시 함수 `fileGuardStore`(임시 600 → rename · 디렉터리 700)는 공개 API 다 | `identify-guard.ts:161-177` · `index.ts:22` |

---

## 6. X1 재사용 — 상주 구현에서 쓸 수 있는 것 / 1회성에 묶인 것

명령: `grep -nE '^(async )?function |^const [A-Z_]+ =' deploy/advisor-x1/x1.cjs` · `sed -n` 각 함수 · `wc -l deploy/advisor-x1/*` (x1.cjs 788 · judge.cjs 124 · run-x1.sh 33)

| 부분 | 무엇을 하나 | 상주에서 그대로? (사실 근거) | 출처 |
|---|---|---|---|
| `finLists` / `fitLists` / `sourceLists` | **배포 체크아웃의 분류 소스 파일**(`advisor-tools.ts`)을 텍스트로 파싱해 읽기·쓰기 목록 · 접두·형식·겹침 검사 | 순수 함수(judge.cjs) — 재사용 가능. 단 입력 경로가 `~/pleiades-fin`·`~/pleiades-fit` **두 체크아웃 고정** · 소스 텍스트 파싱이라 4a(분류를 기계가 읽는 형태)가 오면 대체될 자리 | `judge.cjs:12-46` · `x1.cjs:48-68,204-217` |
| `listTools` / `compareRegistered` / `checkTools` | MCP JSON-RPC `initialize` → `tools/list`(커서) → 세션 닫기 · 등록 ↔ 분류 차이 · `.env` `MCP_PORT` 읽기 · fin mcp-config 포트 대조 | Node 내장 `http` 만 — 재사용 가능(기동 때 S-5 대조). 앱 `.env` 를 직접 읽는다(두 체크아웃 경로 고정) | `x1.cjs:265-349` |
| `cliArgs` | `--print stream-json` · `--model` · `--system-prompt` · `--mcp-config` · `--strict-mcp-config` · `--setting-sources project` · allow/deny · `--tools ""` · `--max-budget-usd` · `dontAsk` · `--no-session-persistence` | 인자 셋은 재사용 가능. **대화(D1)는 `--resume` 과 디스크 기록이 필요** — 지금 함수는 `--no-session-persistence` 고정 · resume 인자 없음 | `x1.cjs:411-417` |
| `sessionArgs`(mcp-config 생성) | 실행 디렉터리에 600 `mcp-config.json`(두 서버 키 · http url) | 재사용 가능(위치만 바꾸면). 질문마다 같은 파일 | `x1.cjs:637-644` |
| `pins` / `childEnv` | 두 앱 `models.ts` 핀 일치 검사 · 자식 env 에서 `DATABASE_URL`·`DISCORD_*`·`ANTHROPIC_MODEL` 제거 · `DISABLE_AUTOUPDATER=1` · 핀 3키 · `ENABLE_TOOL_SEARCH=false` | 재사용 가능 — **상주 gateway 는 `DISCORD_*` 를 자기 env 에 가지므로 자식 제거 규칙이 그대로 의미가 있다** | `x1.cjs:229-248` |
| `askOnce` | spawn → 첫 줄(init) 판정 즉시 · 어긋나면 SIGKILL(fail-closed) · 질문 상한 10분 · 원문을 비공개 파일에 | init 즉시 판정은 재사용 가능. 원문 파일 기록은 실험용(상주에서 남길지는 설계) | `x1.cjs:421-450` |
| `judgeInit` | init 이벤트: hook 이벤트 = 위반 · 플러그인(내장 3 제외) · MCP 서버 수·이름 · 연결 · 목록 밖 도구 | 순수 함수 — 재사용 가능. **내장 플러그인 목록은 CLI 2.1.311 실측 3 고정**(CLI 업데이트 시 새 내장이 생기면 위반으로 멈춘다 · 상주면 모든 대화가 멈춘다) | `judge.cjs:75-103` |
| `judgeAnswer` / `parseStream` | 상태(완료·판정 불가·오류) · 비용·turns·지연 · 도메인별 도구 수 · 목록 밖 호출 · 모델 드리프트 | 순수 함수 — 로그 줄(K-5)의 재료로 재사용 가능 | `judge.cjs:48-74,105-122` |
| `checkSettings` / `settingsScopes` / `judgeSettingsFile` | S-3 — user·관리형(`/etc/claude-code`) settings 범위 판정 | 기동 때 1회 판정으로는 재사용 가능 | `x1.cjs:153-202` |
| `probeInit` | 실제 인자로 띄워 init 만 받고 SIGKILL · CLI 버전과 함께 state 에 저장 · 본 실행이 같은 버전의 통과를 요구 | 상주 기동 시 1회 탐침으로 쓸 수 있는 형태 · state 파일은 X1 디렉터리 고정 | `x1.cjs:648-662` |
| **1회성에 묶인 것** | `run-x1.sh` **배포 락 flock 을 실행 내내 쥠**(상주가 쥐면 자동 배포가 늘 실패) · `X1_LOCK_HELD` 요구 · 크론 시각 창(00:15~05:40) · 질문 ID 6 고정(`X1..D2`) · 목표 총액·재실행 계획(`planRun` · state `runs`) · Q131 원장 스냅샷·대조(`dbSnapshot` · `dbDiff` — 앱 Prisma/tsx 경유 · 전후 1회) · 공유 로그 창 스캔(`mcpLogScan` · `pm2Count` · `sharedLogs`) · `SYSTEM_PROMPT` 상수(실험용 짧은 프롬프트) · Darwin 거부 | | `run-x1.sh:4-33` · `x1.cjs:27-41,75-77,80,116,381-410,464-523,533-558,595-604` |

---

## 7. 설계에 주는 함의 (사실 기반 · 결정 아님)

1. 셋째 봇은 chat 필수 인자 5 + 기록 파일 2 + 키 2(이름이 `PLATFORM_KEY_RE` 에 맞으면 `platformEnv` 그대로)로 조립되는 계층이 있다 — 앱 조립 파일은 135~148 줄 규모다. 체크아웃 밖에서 뜨면 `PLEIADES_ENV_FILE` 이 필요하다(§1-3).
2. G1 은 배포 파일 4개가 "앱 = web·bot·mcp + prisma" 를 구조로 가정해 분기 설계가 필요하고, G3 는 선례가 단일 파일 curl 이라 chat·notify·ws 를 담는 번들 또는 의존 설치 경로 + 상주 관리 수단(저장소에 systemd 0 · pm2 정의는 cwd 고정)이 새로 필요하다. 어느 쪽이든 수집기 감시(APPS·LOG_NAME·alive)는 셋째 프로세스를 모른다(§3).
3. 4c-1 의 AI 분기는 파일 3 · 분기 5 이고, fin 은 같은 함수가 "AI 거래 파싱(쓰기 입구)" 과 "AI 질문" 을 가른다 — 스위치 범위가 Q122 와 맞물린다(§2-3). 끄기 수단은 채널 키 비움(즉시 · 명령까지)뿐이다.
4. D1(채널별)은 fin 현행 키(채널×사용자 · 24 h)와 같은 축이고 fit 은 Discord 전체 1세션(6 h · 100k)이라 규칙이 다르다. X1 인자에는 resume·디스크 기록이 없어 대화형으로 쓰려면 그 둘을 더해야 한다(§4 · §6).
5. 기억(Q132)을 담을 기존 모델은 두 앱에 없고(fit `personalGoalNote` 1칸 · `AIAdvice` 답 이력만), 통합 층 전용 DB 도 없다. 기존 비공개 파일 규칙(`~/pleiades-private` · 600/700)은 수집기·X1·release-inplace 가 공유한다(§5).

## 8. 미확인

| 값 | 왜 못 쟀나 |
|---|---|
| 앱 봇 번들에 `ws` 가 실제로 인라인되는가 | esbuild `--external` 목록에 `ws` 가 없다는 것만 확인(fin·fit `package.json` `build:bot`) — 빌드 산출물을 열지 않았다(빌드 0) |
| 셋째 봇을 위한 새 코드 줄 수 | 추정하지 않는다 — §1-2 의 앱 조립 파일 줄 수만 있다 |
| 서버 `pm2-<user>` systemd 활성 여부 · 서버에 pm2 밖 상주 관리 수단이 있는가 | 서버 상태(I-3) — t2-check 가 확인하는 항목이 있다는 것만 확인 |
| 허용 사용자 수 | 011 §3-4 그대로(사용자 확인) |
| 버튼 인터랙션이 어느 봇으로 가는가(E-b) | 011 §3-4 그대로 |
| X1 `judgeInit` 내장 플러그인 목록이 서버 CLI 업데이트 뒤에도 같은가 | 서버 CLI 버전 의존(#645 · 2.1.311 실측 3) |
| fit `!ai` 대화 세션이 디스크에 남긴 누적량 | S1 §9 그대로(서버) |
