# 009 실측 01 — Discord 쪽 기반: `packages/notify` 의 Discord 능력 + Discord 플랫폼 제약

작성 2026-10-27 · 이슈 #326 · 읽기 전용 실측(코드 무변경 · 서버·서비스 저장소 접근 0 · `measured-facts.md` 무변경).
목적: 텔레그램을 끄고 fin·fit 의 모든 봇 기능(명령 · AI 대화 · 버튼 · 파일 · 알림)을 Discord 로 옮기는 기획(009)의 근거.

측정 기준: 저장소 HEAD `8192b0c`(dev · v1.0.8). grep 은 `/usr/bin/grep -rn --binary-files=text`(ignored 경로 포함) · 추적 파일만 세는 곳은 `git grep -i`.
외부 사실은 공식 Discord 개발자 문서(`docs.discord.com/developers/...` — 옛 `discord.com/developers/docs/...` 는 301 로 여기로 옮겨졌다)를 2026-10-27 에 읽은 것. 못 확인한 것은 **미확인**.

---

## A. 저장소 실측

### A-1. `packages/notify/src/` 의 Discord 지원 전수

측정: `wc -l packages/notify/src/*.ts` · 아래 각 파일 `cat -n`.

| 능력 | 위치 | 상태 |
|---|---|---|
| **웹훅 텍스트 전송** `createDiscordTransport` | `discord.ts:89` · 상수 `DISCORD_MAX_LENGTH = 2000` `:18` | 있음. target = 채널 별칭 → 웹훅 URL. `maxLength: Infinity`(어댑터가 변환·분할·재시도 소유 `:6`). 청크마다 재시도·429 `retry_after` 대기(`requestDiscord` `:205`, 429 처리 `:237-241`, `retry_after` 파싱 `:274`) |
| **파일 첨부** `sendDiscordFile` | `discord.ts:143-179` | 있음 — **웹훅 전용 · 파일 1개 · 캡션 plain**. `multipart/form-data` · `payload_json` + `files[0]` `:175-176` · `attachments:[{id:0}]` `:171`. 상한 `DISCORD_DEFAULT_MAX_FILE_BYTES = 10 MiB` `:137`(플랫폼 기본 20 MiB 보다 보수적 — B-3) |
| **봇 REST 전송** `createDiscordBotTransport` | `discord-bot.ts:102-149` | 있음 — `POST /channels/{id}/messages` `:136` · `Bot <token>` 헤더 `:140` · 버튼은 마지막 청크에만 `:132` · 반환 = 마지막 메시지 id `:146`. **파일 첨부·임베드·메시지 편집(채널 메시지 PATCH)·삭제는 없다** |
| **텔레그램 키보드 → 버튼 변환** `toDiscordComponents` | `discord-bot.ts:52-81` | `inline_keyboard` 만 받는다 `:54`. `callback_data` → Secondary(style 2) · `url` → Link(style 5). 한도 행 5 · 행당 5 · custom_id 100 · label 80 `:37-40` — 넘으면 오류(자르지 않음). **select menu·모달·reply keyboard 변환 없음** |
| **gateway** `createDiscordGateway` | `discord-gateway.ts:125-366` | v10 JSON `:39` · HELLO(op 10) → 지터 첫 heartbeat `:188-191` · IDENTIFY(op 2) **`intents: 0`** `:197` · RESUME(op 6) `:193` · HEARTBEAT_ACK 누락 = 좀비 → terminate + 재접속 `:179-183` · op 1 즉시 heartbeat `:291` · RECONNECT(op 7) `:294` · INVALID_SESSION(op 9) `:298` · 치명 close 4004·4010~4014 정지 `:41` · 4007·4009 새 세션 `:43` · READY(session_id·resume_gateway_url) `:266` · RESUMED `:272` · 재접속 대기 [1 s, 5 s, 15 s, 30 s] `:129` |
| **받는 이벤트 종류** | `discord-gateway.ts:265-280` | dispatch 중 **READY · RESUMED · INTERACTION_CREATE 셋만** 처리. INTERACTION_CREATE 도 **`type === 3`(MESSAGE_COMPONENT) 이고 `component_type === 2`(버튼)** 만 `:220` — select menu(3)는 명시적으로 버린다(PR #150 Codex P2). **슬래시 명령(type 2) · 자동완성(4) · 모달 제출(5) · MESSAGE_CREATE 는 처리하지 않는다** |
| **버튼 처리** | `discord-gateway.ts:218-263` | 허용 = 사용자 ID **AND** 채널 ID `:223`(매 호출 재읽기 `:66-68`) · 거부 = type 4 + ephemeral(64) `:226` · 허용이면 먼저 **type 6 DEFERRED_UPDATE_MESSAGE** `:229` → 핸들러. 컨텍스트 `edit(html, {keepButtons})`(PATCH `@original` `:241`) · `removeButtons()` `:251` · `reply(text)`(ephemeral follow-up POST `:254`). 본문 2000자 넘으면 첫 조각만 + 경고 `:212`. 핸들러 예외 → 일반 실패 안내(원문 미노출) `:260-261` |
| **md 변환·분할** | `discord-md.ts` — `htmlToDiscordMarkdown` `:190` · `escapeDiscordMarkdown` `:84` · `splitDiscordMarkdown` `:205`(코드펜스 보존 `:194-196`) | 지원 태그 = 텔레그램 HTML parse_mode 집합(b·strong·i·em·u·ins·s·strike·del·code·pre·a[href]·blockquote·tg-spoiler) `:10-11`. 텍스트 노드 md 메타문자 escape(서식 주입 방지) `:7` |
| **플랫폼 설정** | `platform-env.ts:27-28` `PLATFORM_KEY_RE` | `NOTIFY_*` · `DISCORD_WEBHOOK_*` · `DISCORD_BOT_TOKEN_*` · `DISCORD_CHANNEL_ID_*` · `DISCORD_ALLOWED_USER_IDS` |
| **토큰 마스킹** | `error.ts:9`(텔레그램 `bot\d+:…`) · `:13`(Discord 봇 토큰 3토막) · `:27-29` | 둘 다 있음 |
| 멘션 차단 | `discord-bot.ts:131` · `discord-gateway.ts:245,254` · `discord.ts:170` | 모든 전송에 `allowed_mentions: { parse: [] }` |

**지원 여부 요약 (인바운드 쪽):**

| 기능 | 지원 | 근거 |
|---|---|---|
| 버튼 클릭 수신 | **예** | `discord-gateway.ts:220` |
| 슬래시 명령 수신·등록 | **아니오** — 등록 API 호출 0 · type 2 처리 0 | `:220` 필터 · `/usr/bin/grep -rn "applications/.*commands" packages/notify/src` 0건 |
| 일반 메시지 수신(MESSAGE_CREATE) | **아니오** — `intents: 0` | `:197` |
| 모달(type 9 응답 · type 5 제출) | **아니오** | `grep -n "type: 9\|modal" packages/notify/src/*.ts` 0건 |
| select menu | **아니오**(받으면 버린다) | `:219-220` |
| 파일 수신(첨부 다운로드) | **아니오** | `attachments` 등장은 송신 `discord.ts:171` 1곳뿐 |
| 봇 채널 메시지 편집(인터랙션 밖) | **아니오** — 편집은 인터랙션 토큰(15분)의 `@original` 만 | `:241,251` |
| 봇 경로 파일 전송 | **아니오**(웹훅만) | `discord-bot.ts` 에 multipart 없음 |
| 타이핑 표시 | **아니오** | `typing` 0건 |
| DM | **아니오**(채널 ID 정규식만 · DM 채널 생성 `POST /users/@me/channels` 없음) | `discord-bot.ts:100` |

### A-2. 텔레그램 쪽 패키지 의존과 함께 지울 것

패키지 자체는 grammy 를 import 하지 않는다(`telegram.ts:4` 주석 · `packages/notify/package.json` 의존성 0 · 루트 dependencies 는 `ws` 하나 `package.json:33-34`).

| 텔레그램 전용 심볼 | 위치 | 텔레그램을 끄면 |
|---|---|---|
| `createTelegramTransport` · `TELEGRAM_CHANNEL` · `TelegramApi` · `TelegramTransportOptions` | `telegram.ts`(42줄) · `index.ts:22-23` | **지운다** — 소비자: fin `notifier.ts:86,103,181` · fit `notifier.ts:65,78` |
| `splitMessage` · `TELEGRAM_MAX_LENGTH = 4096` | `split.ts:6,8` · `index.ts:72` | 코어 유한 `maxLength` 모드의 분할기 — Discord 어댑터는 전부 `Infinity` 라 **코어 분할 경로 자체가 쓰이지 않게 된다**(`types.ts:38-42`). 지울지·남길지는 009 결정 |
| `escapeHtml` · `toPlain` · `isHtmlParseError`(HTML parse 폴백) | `escape.ts` · `plain.ts` · `error.ts` · `deliver.ts:7` | 본문 저장 포맷이 HTML 인 동안(fin — `discord-md.ts:4`)은 **남는다**. `isHtmlParseError` 폴백·grammy 타임아웃 판별(`error.ts:78-92`)·텔레그램 토큰 마스킹(`error.ts:9`)은 텔레그램 전용 → 지운다 |
| `Components = object`(텔레그램 `reply_markup` 그대로) · `html()` 헬퍼 | `types.ts:18,32` | Discord 고유 컴포넌트 타입으로 바꿀지 결정 필요 — 지금은 `toDiscordComponents` 가 **텔레그램 키보드 모양을 입력 계약**으로 삼는다 |
| `Route` 주석의 `TELEGRAM_*_CHAT_IDS` 매핑 | `types.ts:55-59` | 정정 |
| 테스트 | `telegram.test.ts` · `split.test.ts` 등 | 함께 |

**앱 쪽(참고 · 009 범위의 크기):** grammy import 파일 fin 27 · fit 22(`/usr/bin/grep -rln --include='*.ts' -E "from ['\"]grammy|@grammyjs" apps/<app>/src | wc -l`). `package.json` grammy fin `:29` · fit `:38`.
인바운드 표면(grep 줄 수 · `__tests__` 제외 — 의미 단위가 아니라 **줄 수**다. 002 §3 의 "210건(fin 149 / fit 61)" 은 다른 기준):

| 패턴 | fin | fit |
|---|---|---|
| `bot.command(` | 21 | 10 |
| `bot.hears(`(한국어 키워드 트리거) | 28 | 0 |
| `bot.on('message:text')`(AI 대화 · 지출 입력) | 2 (`ai.ts:489` · `expense.ts:670`) | 1 (`bot/index.ts:64`) |
| `bot.on('message:photo')`(음식 사진) | 0 | 1 (`food-photo.ts:74`) |
| `callbackQuery(` | 1 | 4 |
| `answerCallbackQuery` | 43 | 11 |
| `editMessageText\|editMessageReplyMarkup` | 37 | 6 |
| `sendDocument\|replyWithDocument\|InputFile` | 6 | 0 |
| `sendChatAction\|replyWithChatAction` | 6 | 4 |
| `force_reply\|reply_to_message\|remove_keyboard\|Keyboard` 줄 | 54 (두 앱 합) | |

명령 이름(31): fin `alertconfig report backtest briefing networth assetlist assetadd assetupdate watch unwatch watchlist start help strategy strategylist ai reset analysis customstrategy customstrategylist customstrategydelete` · fit `report sleep today weight start help ai reset run sync`.
앱 안 텔레그램 전용 사본: fin `bot/utils/telegram.ts`·`formatter.ts:50-52`(4096 분할) · `error.ts:98` · fit `bot/utils/telegram.ts:27,38` · `error.ts:82`.
"항상 텔레그램" 고정 경로(fin `notifier.ts:13-14`): `/브리핑` 응답 `notifierForChat` `:179-181` · 키보드 메시지 기본값 `:103`.

### A-3. 공통 인프라의 텔레그램 의존 (열거)

측정: `git grep -ci -E 'telegram|텔레그램' -- <dir>`(추적 파일만 · `__pycache__` 제외).

| 영역 | 파일 | 줄 | 내용 |
|---|---|---|---|
| `deploy/` | 12 | 67 | `notify-deploy.cjs`(8 — 수신자 `TELEGRAM_ADMIN_CHAT_IDS`/`ALLOWED` `:20` · `api.telegram.org` 직접 호출 `:94` · `TELEGRAM_BOT_TOKEN` `:127` · Discord 실패 시 텔레그램 대체 `:8,138`) · `discord-switch.cjs`(4 — `set <discord\|telegram>` `:5,147`) · `discord-switch.sh`(9 — `off` = 텔레그램 복귀 · on 실패 롤백 `:135-145,209-222`) · `release-inplace.sh`(3 — 키 화이트리스트 `TELEGRAM_[A-Z_]*` `:20` · **봇 409(getUpdates 충돌) R-8 판정 `:110`** · 사람 확인 "텔레그램 현황·/today" `:338`) · `t2-check.sh`(3 — `getWebhookInfo` `:254-258`) · `ssh-deploy.sh`(1 — 주석 `:69`) · 템플릿 `deploy/env/finance.env.template:18-22`(`TELEGRAM_BOT_TOKEN`·`ALLOWED`·`ADMIN`·`WEBHOOK_SECRET`) · `fitness.env.template:14-16` · 테스트 4(`test_notify_deploy.py` 19 · `test_discord_switch.py` 7 · `test_t2_check.py` 3 · `test_deploy.py` 2) |
| `tools/local/` | 7 | 33 | `check_env.py`(7 — `_check_telegram` `:111-121` 검증 봇 id 허용 목록 = I-4 의 기계 보조 · 다른 앱 같은 봇 409 `:158-160`) · `run.sh`(3 — `env -u TELEGRAM_BOT_TOKEN` `:28-29`) · `env/fin.env:13-16` · `env/fit.env:15-16` · `README.md:32` · 테스트 2 |
| `.env.example` | 1 | 4 | `:5,6,9,33` — "비우면 텔레그램" 기본값 서술 |
| `.github/workflows/` | 0 | 0 | — |
| `docs/runbooks/` | 7 | 31 | `007-t10-discord.md` 9 · `release-inplace.md` 8 · `007-t5-fin-cutover.md` 6 · `007-t9-fit-cutover.md` 4 · `007-t2-server-check.md` 2 · `007-t4-build-rehearsal.md` 1 · `ai-model-upgrade.md` 1 |

주의 — 텔레그램을 지우면 **격리 가드가 함께 사라진다**: `check_env.py` 의 봇 토큰 허용 목록(I-4)·409 검사, `release-inplace.sh:110` 의 409 판정. Discord 쪽 대응물(검증 봇 토큰 ≠ 운영 봇 토큰 · Q80 "같은 토큰으로 로컬 gateway 동시 금지" — 007 `:427`)은 지금 기계 검사가 없다.

### A-4. 009 가 정정할 결정 위치

측정: `/usr/bin/grep -nE "Q3[^0-9]|인바운드|텔레그램 고정|항상 텔레그램|텔레그램 유지" docs/specs/00{2,3,6,7}-*.md CLAUDE.md`.

| 위치 | 현재 결정 |
|---|---|
| 002 `:69` | 인바운드 = **재작성** · 210건(fin 149 / fit 61) · 30파일 |
| 002 `:76-80` | **"인바운드를 저장소별로 각각 Discord 로 옮기면 안 된다"** · 인바운드는 단일 봇(B3)까지 텔레그램 |
| 002 `:255` · `:269-271` | 단일 봇 = 단계 4 이후 · **Q3(봇 인바운드 통합) 미결 · 낮음** |
| 003 `:115` | 002 §3 원칙 재인용 |
| 003 `:314-322` | 인바운드에 있으면서 아웃바운드에 물린 2건(버튼) |
| 003 `:959` | 1a 채널 전환 "없음 · 텔레그램 유지" |
| 003 §7-3 `:1276-1293` | **인바운드 전부 제외** · 인증 `Set<number>`+`.map(Number)` 는 "Discord 인바운드를 하게 될 때 다시 열 것" `:1292-1293`(Discord snowflake 는 64비트 — `Number` 정밀도 2^53 초과 · B-6) |
| 003 §6 `:1198` · `:1395-1398` | 1b-1/1b-2 정의 · 1b-2a 엔드포인트 되돌리기 등급 |
| 006 `:411` | 인바운드 봇 통합(002 Q3) = **전환 이후** |
| 007 `:205` | 전환 첫 배포 = 플랫폼 키 비움 = 텔레그램 |
| 007 `:427` · `:451` | Q80 검증 Discord 서버·봇을 운영으로 승격 · 로컬은 별도 검증 봇 |
| 007 `:469` | 인바운드 봇 통합 = 전환 이후 |
| CLAUDE.md `:76` | Q3 미결 목록 |
| CLAUDE.md `:166-167` | **핵심 전제 5** — "인바운드는 재작성(210건). 인바운드를 저장소별로 각각 옮기지 않는다" |
| 앱 코드 주석 | fin `notifier.ts:13-14` "`/브리핑` 응답은 항상 텔레그램" · `tools/local/README.md:32` 동일 |

---

## B. Discord 플랫폼 제약 (공식 문서)

출처 약칭:
[AC] https://docs.discord.com/developers/interactions/application-commands ·
[RR] https://docs.discord.com/developers/interactions/receiving-and-responding ·
[GW] https://docs.discord.com/developers/events/gateway ·
[MSG] https://docs.discord.com/developers/resources/message ·
[CMP] https://docs.discord.com/developers/components/reference ·
[MODAL] https://docs.discord.com/developers/components/using-modal-components ·
[RL] https://docs.discord.com/developers/topics/rate-limits ·
[REF] https://docs.discord.com/developers/reference ·
[APP] https://docs.discord.com/developers/resources/application ·
[CH] https://docs.discord.com/developers/resources/channel ·
[PIR] https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review

### B-1. 슬래시 명령 (application commands)

- **등록은 HTTP 로만**[AC]. **guild 명령 = 즉시 반영 · 그 guild 에서만 · DM 불가**. **global 명령 = 봇이 있는 모든 guild + (봇과 공통 guild 가 있는 사용자의) DM**. global 반영 지연은 **문서에 수치 없음 — 미확인**(옛 "최대 1시간" 서술은 현재 문서에서 확인되지 않았다). 오래된 정의로 실행하면 Discord 가 거부하고 다시 불러온다(read-repair)[AC].
- DM 허용: global 명령의 `contexts` 에 BOT_DM(1)을 넣는다 · `dm_permission` 은 폐기 · guild 명령은 BOT_DM 불가[AC].
- 옵션 타입: SUB_COMMAND 1 · SUB_COMMAND_GROUP 2 · STRING 3 · INTEGER 4(±2^53−1) · BOOLEAN 5 · USER 6 · CHANNEL 7 · ROLE 8 · MENTIONABLE 9 · NUMBER 10 · **ATTACHMENT 11**[AC]. 첨부 옵션 값은 인터랙션의 `resolved.attachments` 맵으로 온다[RR](옵션과의 연결 서술은 [RR] 에 명시 없음 — 관례상 확실하나 문서 근거는 부분적).
- **자동완성**: STRING·INTEGER·NUMBER 만 · `choices` 와 동시 불가 · 응답 type 8[AC][RR].
- 한도[AC]: CHAT_INPUT 명령 **global 100 · guild 당 100** · USER/MESSAGE 컨텍스트 메뉴 각 15 · 이름 1~32자(소문자 · 정규식) · 설명 1~100자 · **옵션 25 · choices 25** · STRING 최대 6000 · 한 명령 총 8000자 · **명령 생성 200회/일/guild**.
- **한국어 명령 이름**: 이름 정규식이 유니코드 문자를 허용하는지는 이번에 정규식 원문을 확인하지 못했다 — **미확인**(fin `bot.hears` 28 의 한국어 키워드를 명령으로 옮길 때 필요).

### B-2. 상호작용 응답 · 이미 gateway 를 쓰는 경우

- **최초 응답 3초**, 넘기면 토큰 무효 · **인터랙션 토큰 15분**(follow-up·`@original` 편집은 그 안에서만)[RR].
- 응답 타입[RR]: 1 PONG · 4 메시지 · **5 DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE**(로딩 표시 → 나중에 편집) · 6 DEFERRED_UPDATE_MESSAGE(컴포넌트만) · 7 UPDATE_MESSAGE(컴포넌트만) · 8 자동완성 · **9 MODAL**(MODAL_SUBMIT·PING 에는 불가) · 12 LAUNCH_ACTIVITY.
- deferred 뒤 첫 follow-up POST 는 로딩 메시지를 **편집**하며 defer 때의 ephemeral 설정을 따른다(follow-up 의 flag 무시)[RR].
- **gateway INTERACTION_CREATE 와 HTTP interactions endpoint 는 상호 배타** — 둘 중 하나로만 받는다. gateway 로 받아도 **응답은 HTTP**[RR]. → **지금 구조(gateway)로 슬래시 명령도 받을 수 있다 · 공개 URL·서명 검증 endpoint 불필요**. INTERACTION_CREATE 는 intent 목록에 없다 — intent 무관 이벤트는 항상 온다고 [GW] 가 적지만 이 이벤트를 직접 명시하지는 않는다(현 코드가 `intents: 0` 으로 버튼을 받고 있는 것이 실증).
- 인터랙션 응답·follow-up 은 multipart 로 **파일 첨부 가능** · 인터랙션 객체에 `attachment_size_limit`(바이트)[RR][REF].
- 인터랙션 webhook 은 일반 webhook 과 같은 rate limit 성질 · **글로벌 rate limit 미적용**[RR][RL].
- 모달[RR]: 제목 최대 45자 · 컴포넌트 **1~5개** · custom_id 1~100. 컴포넌트는 Label(18)로 감싼다 · Text Input(4)·String Select(3)·**File Upload(19 · 모달 전용 · 0~10 파일)**[CMP][MODAL]. **deferred 뒤에 모달을 열 수 있는가 — 미확인**(모달은 최초 응답 type 9 이므로 defer 와 양립하지 않는다는 것이 구조상 귀결이나 문서 문장은 못 찾았다).

### B-3. 일반 메시지 수신 (AI 대화 · 지출 입력 · 사진)

- intent 비트[GW]: **GUILD_MESSAGES 1<<9 = 512 · DIRECT_MESSAGES 1<<12 = 4096 · MESSAGE_CONTENT 1<<15 = 32768**(특권).
- 특권 intent = GUILD_PRESENCES · GUILD_MEMBERS · **MESSAGE_CONTENT**[GW]. 없으면 `content`·`embeds`·`attachments`·`components`·`poll` 이 빈 값 — **예외: 봇 자신의 메시지 · 봇과의 DM · 봇을 멘션한 메시지** · 메시지 컨텍스트 메뉴 대상[GW].
  → **DM 으로 봇을 쓰면 MESSAGE_CONTENT 없이도 본문·첨부를 받는다**(DIRECT_MESSAGES intent 는 필요). guild 채널에서 멘션 없이 받으려면 MESSAGE_CONTENT 필요.
- **켜는 조건(2026-06-10 개정)**: 서버 수가 아니라 **봇을 볼 수 있는 고유 사용자 수 10,000 미만이면 포털 토글만으로** 켠다 · 넘으면 신청 · 승인된 앱은 매년 재신청[GW][PIR]. 포털 토글과 함께 **IDENTIFY intents 에도 선언**해야 한다. 개인 서버 1개·사용자 1명이면 해당 없음(토글만).
  - [APP] 의 application flags 는 여전히 "100 서버 미만 = `GATEWAY_MESSAGE_CONTENT_LIMITED`(1<<19)" 서술을 쓴다 — 문서 간 기준 표기가 다르다. 개인 봇에는 어느 기준이든 토글로 충분.
- 받는 이벤트: MESSAGE_CREATE(+ 첨부는 message.attachments 의 CDN URL — 다운로드는 일반 HTTP). DM 은 사용자가 봇과 공통 guild 를 가져야 시작 가능(DM 명령 조건 [AC] 와 같음 · DM 개설 일반 규칙은 **미확인**).

### B-4. 메시지·컴포넌트·파일 한도

- 본문 **2000자** · embed 메시지당 **10** · embed 합계 **6000자**(title 256 · description 4096 · fields 25 · field name 256 / value 1024 · footer 2048 · author 256)[MSG]. 텔레그램 4096자 대비 본문 한도 절반 — embed description(4096)으로 우회 가능.
- 요청 최대 **25 MiB**(메시지 생성)[MSG] · **파일 업로드 기본 20 MiB(파일당)** · Nitro·서버 부스트로 상향[REF]. (패키지 상한 10 MiB `discord.ts:137` 은 옛 값 — 보수적이라 동작 문제는 없다.)
- 컴포넌트[CMP]: action row 당 버튼 **5** · select 는 행당 **1** · select 옵션 **25** · custom_id **1~100** · 버튼 label **80** · URL 512 · Text Input 값 **4000** · 메시지당 컴포넌트 총 **40**(v2). 행 5개 한도는 기존 레이아웃 기준(패키지 `MAX_ROWS = 5`).
- **Components V2**(`IS_COMPONENTS_V2` 1<<15): 켜면 `content`·`embeds` 사용 불가(Text Display·Container 로 대체) · 한 번 켜면 그 메시지에서 끌 수 없다[MSG][CMP].
- `allowed_mentions`: 기본값 — 일반 메시지는 users·roles·everyone 전부 파싱 · 인터랙션·웹훅은 users 만[MSG] → 지금처럼 `parse: []` 유지.
- **텔레그램 reply keyboard(`Keyboard`·`remove_keyboard`)·`force_reply` 대응물 없음** — 버튼·select·모달로 대체(문서상 동등 개념 미발견).

### B-5. rate limit · 편집 · 타이핑

- 라우트별 버킷 + `X-RateLimit-*` 헤더 · **글로벌 50 req/s(봇)** · 429 본문 `retry_after`(초 · 실수)·`global` · 인터랙션 엔드포인트는 글로벌 제외 · **잘못된 요청(401·403·429) 10,000건/10분 → IP 임시 차단** · 404 웹훅 반복도 제한[RL]. 채널별 메시지 한도 수치는 문서에 없다(헤더로 읽으라는 지침).
- gateway 송신 **120 이벤트/60초/연결** · IDENTIFY **1,000회/24시간**(RESUME 제외 · 초과 시 모든 세션 종료 + **토큰 리셋**)[GW] — 재시작 루프가 IDENTIFY 를 태우면 토큰이 바뀐다.
- **봇이 보낸 메시지 편집**: `PATCH /channels/{id}/messages/{id}` — `content`·`embeds`·`flags`·`components` 는 원 작성자만[MSG]. 편집 횟수·시간 제한은 문서에 없음. 첨부 편집 시 `attachments` 에 남길 것 전부 명시(v10)[MSG]. → 텔레그램 `editMessageText`(fin 37 · fit 6줄)의 대응은 **인터랙션 15분 안이면 `@original` · 그 밖이면 채널 메시지 PATCH(봇 토큰)** — 후자는 패키지에 아직 없다.
- 타이핑: `POST /channels/{id}/typing` · **10초 후 만료** · "일반적으로 봇은 쓰지 말 것 — 명령 처리에 몇 초 걸릴 때는 예외"[CH]. 슬래시 명령이면 type 5 로딩 표시가 정석.

### B-6. 비공개 봇(Public Bot off)·식별자

- `bot_public = false` → **앱 소유자만 guild 에 추가 가능**[APP](팀 소유 시 동작은 이 문서에 없음 — 미확인).
- 비공개여도 서버의 다른 멤버는 그 채널에서 명령·버튼을 볼 수 있다 → 지금의 **사용자 ID AND 채널 ID 허용**(`discord-gateway.ts:223`)을 슬래시 명령·메시지 수신에도 똑같이 걸어야 한다. 명령 노출 자체를 줄이는 `default_member_permissions` 의 세부는 **미확인**(이번에 읽지 않음).
- **Snowflake ID 는 최대 64비트 · HTTP API 에서 항상 문자열**[REF] → 003 §7-3 `:1292` 의 `Set<number>`+`.map(Number)` 인증은 Discord ID 에 쓰면 정밀도 손실(2^53 초과). 문자열 비교 유지(패키지 현행 `string[]`).
- 참고: [RL] 페이지 요약에 문서와 무관한 외부 링크 1개가 섞여 나왔다 — 방문하지 않았고 이 문서에 옮기지 않는다.

---

## 요약 대장

| # | 항목 | 값 | 출처 |
|---|---|---|---|
| 1 | 패키지 Discord 소스 | `discord.ts` 282 · `discord-bot.ts` 149 · `discord-gateway.ts` 366 · `discord-md.ts` 270 줄 | `wc -l` |
| 2 | gateway 가 처리하는 dispatch | READY · RESUMED · INTERACTION_CREATE(버튼만) — 3 | `discord-gateway.ts:265-280,220` |
| 3 | IDENTIFY intents | 0 | `:197` |
| 4 | 인바운드 미지원 | 슬래시 명령 · 자동완성 · 모달 · select · MESSAGE_CREATE · 파일 수신 · 채널 메시지 편집 · 봇 경로 파일 · DM · 타이핑 — 10 | A-1 |
| 5 | 텔레그램 전용 패키지 파일 | `telegram.ts`(+ `split.ts` 코어 분할 · `error.ts` 일부) | A-2 |
| 6 | 인프라 텔레그램 언급(추적) | deploy 12파일/67줄 · tools/local 7/33 · `.env.example` 1/4 · workflows 0 · runbooks 7/31 | A-3 |
| 7 | 앱 명령 수 | fin 21 + fit 10 = 31 `bot.command` · fin `hears` 28 · 자유 텍스트 3 · 사진 1 | A-2 |
| 8 | 정정 대상 결정 위치 | 002 ×3 · 003 ×5 · 006 ×1 · 007 ×3 · CLAUDE.md ×2 · 앱 주석 2 | A-4 |
| 9 | 응답 기한 / 토큰 | 3 s / 15 min | [RR] |
| 10 | gateway vs HTTP endpoint | 상호 배타 — gateway 유지면 endpoint 불필요 | [RR] |
| 11 | 명령 한도 | global 100 · guild당 100 · 옵션 25 · choices 25 · 생성 200/일/guild · guild 즉시 · global 지연 미확인 | [AC] |
| 12 | MESSAGE_CONTENT | 특권 · 고유 사용자 10,000 미만이면 포털 토글 · DM·멘션은 없이도 본문 | [GW][PIR] |
| 13 | 본문 / embed | 2000 / 10개·합 6000 · description 4096 | [MSG] |
| 14 | 파일 | 기본 20 MiB/파일 · 요청 25 MiB · 모달 File Upload 0~10 | [REF][MSG][CMP] |
| 15 | 컴포넌트 | 행당 버튼 5 · select 1/행 · 옵션 25 · custom_id 100 · label 80 · 총 40 · 모달 1~5 · Text Input 4000 | [CMP][RR] |
| 16 | rate limit | 글로벌 50 req/s · 잘못된 요청 10,000/10분 → 차단 · gateway 120/60 s · IDENTIFY 1,000/24 h(초과 시 토큰 리셋) | [RL][GW] |
| 17 | ID | snowflake 64비트 · 문자열 | [REF] |

---

## 텔레그램 → Discord 대응이 어려운 것

1. **자유 텍스트 대화(AI · 지출 입력 · `hears` 키워드 28).** 텔레그램은 DM 에 그냥 치면 된다. Discord 는 (a) DM + DIRECT_MESSAGES intent, (b) guild 채널 + MESSAGE_CONTENT 특권 intent, (c) 슬래시 명령 STRING 옵션(최대 6000자 · 매번 `/ai` 입력) 중 하나를 골라야 한다. 패키지는 현재 MESSAGE_CREATE 를 전혀 받지 않는다(intents 0). **한국어 명령 이름 허용 여부 미확인** — `hears` 의 한국어 트리거를 명령으로 옮길지가 여기에 걸린다.
2. **긴 AI 응답.** 텔레그램 4096자 → Discord 2000자. 분할 메시지 수가 약 2배가 되거나 embed(4096)로 우회. 인터랙션 경로(`reply`·`edit`)는 지금 **첫 2000자만 보내고 자른다**(`discord-gateway.ts:212`) — follow-up 여러 개로 보내는 경로가 필요.
3. **AI 처리 시간 vs 3초·15분.** 슬래시 명령으로 받으면 type 5 deferred 후 **15분 안에** 끝내야 한다(토큰 만료). advisor 호출이 15분을 넘을 수 있는 경로(브리핑·주간 리뷰)는 인터랙션 토큰이 아니라 **봇 채널 메시지 전송**으로 결과를 보내야 한다. 메시지 수신(MESSAGE_CREATE) 경로는 기한이 없다.
4. **인터랙션 밖 메시지 편집(fin `editMessageText` 37줄).** 15분이 지난 메시지·명령 응답이 아닌 메시지를 고치려면 봇 토큰 `PATCH /channels/{id}/messages/{id}` — 패키지에 없다. 메시지 id 를 저장하는 경로(fit `telegramMessageId` 류 · 003 §6-2)는 컬럼 의미가 바뀐다(Q61·Q74 스키마 무변경과 충돌 가능).
5. **reply keyboard · `force_reply`(54줄).** Discord 에 동등물 없음 — 버튼·select·모달로 재설계. fit 음식 편집은 이미 `force_reply` 를 버리고 chat 단위 pending 으로 바꿨다(`food-edit-state.ts:3`) — 모달 Text Input(4000자)이 더 가까운 대응.
6. **사진·파일 수신(fit `message:photo`).** 경로는 DM 메시지 첨부 · guild 채널 메시지(MESSAGE_CONTENT 필요 — 없으면 `attachments` 도 빈 값) · 슬래시 명령 ATTACHMENT 옵션 · 모달 File Upload. 패키지에 다운로드·검증 코드 0.
7. **봇 경로 파일 전송(fin `sendDocument` 6줄).** 지금 파일은 웹훅만(`sendDiscordFile`) — 명령 응답으로 파일을 돌려주려면 인터랙션 multipart 또는 봇 채널 multipart 가 필요.
8. **허용 모델.** 텔레그램은 1:1 DM 이라 chat id 하나가 곧 사용자였다. Discord guild 채널은 다른 멤버가 같은 명령·버튼을 본다 — 사용자 ID AND 채널 ID 검사를 명령·메시지 모든 진입점에 걸어야 하고, ID 는 문자열로(64비트 · 003 §7-3 의 `.map(Number)` 금지).
9. **격리 가드 재구축.** 텔레그램 봇 토큰 허용 목록(`check_env.py:111-121` · I-4)·409 판정(`release-inplace.sh:110`)이 없어진다. Discord 는 같은 토큰 동시 gateway 의 동작이 **미측정**(007 Q80)이고, IDENTIFY 1,000/24 h 초과 시 **토큰이 리셋**된다 — 재시작 루프·로컬/서버 토큰 혼용을 막는 기계 검사가 새로 필요.
10. **전역 명령 반영 지연 미확인.** guild 명령(즉시 · DM 불가) vs global 명령(DM 가능 · 지연 수치 미확인) 선택이 DM 사용 여부와 묶인다. 개인 서버 하나라면 guild 명령 + 채널 사용이 단순하다.
11. **명령 수 한도는 문제 아님.** 31개 < 100(guild·global 각각). 옵션 25·choices 25 도 현행 명령 인자 수 기준으로는 넉넉해 보이나 명령별 인자 수는 이번에 세지 않았다(**미측정**).
