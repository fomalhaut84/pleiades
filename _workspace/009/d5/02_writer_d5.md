# 009 D-5 설계 — 텔레그램 제거 (초안 1회차)

작성 2026-11-03 · 상태 **초안 — 감사 전**(`reversibility-auditor` 반증 대기 · 정본 아님) · 이슈 #438 · 기준 `b1c3e68`(`dev`) · 최신 태그 `v1.5.4`
**계보:** 측정 `01_surveyor_d5.md`(**[S]** · 절 번호 M1~M12 · 어긋남 X1~X13) → **이 초안**. **[W]** = 이 초안이 코드에서 직접 읽은 사실(§2-2). 정본 `docs/specs/009-discord-only.md` §6 D-5 · §7 · R11 · R12 · S-8.
숫자는 §2-1 대장 인용뿐이다. 시간 기록이 없어 소요는 되돌리기 등급으로 갈음한다. 서버 수치는 적지 않는다(판정만).

## 0. 한 줄 요약

**D-5 는 "지우기"보다 "먼저 대체하기"가 앞에 온다.** 대체가 없는 가드 3(X1·X2·X3)과 Discord 경로의 grammY 의존(X4)을 **릴리즈 R1**(제거 0 · 11-05 전 가능)로 먼저 운영에 올리고, **11-05 오전 뒤** 제거 PR 8 개를 머지해 **릴리즈 R2**(minor) 한 번으로 내보낸다. 토큰 삭제는 R2 판정 뒤 사용자 스크립트로 한다.

| | PR | 릴리즈 | 서비스 영향 |
|---|---|---|---|
| **R1 묶음** | A1 I-5′ · A2 redact · A3 이중 세션 관측 · A4 중립 버튼 | R1(minor) — A1 은 로컬 도구라 무관 | 재배포 1회 · 기능 무변경 · 버튼 페이로드 동일 |
| **R2 묶음** | B1 deploy · B2 fit · B3 fin 인바운드 · B4 fin 아웃바운드·의존성 · B5 notify · B6 tools · B7 개명·앱 문서 · B8 런북·룰·정본 | R2(minor) | 재배포 1회 · 텔레그램 코드 0 · **라우트 스위치를 더 읽지 않는다** |
| **서버(사용자)** | S0 배포 전 판정 · S1 배포 판정 · S2 토큰 삭제 | — | S2 는 재시작 불필요(§6) |

**사용자 결정 4**(§8). 되돌리기 바닥은 R-8 + `NOTIFY_*` 줄 유지 — 실제 되돌림 목표는 직전 태그이고 편도는 없다(§6).

---

## 1. 무엇이 바뀌었나 — 009 §6 D-5 · §7 대비

**결론이 달라진 이유는 측정이 전제를 깼기 때문이다.** 요구사항 5-1~5-4 와 S-8 은 유지한다.

| # | 009 전제 | 측정 | 이 설계의 처리 |
|---|---|---|---|
| Δ1 | 사라지는 가드의 대체가 이미 있거나 D-G 로 끝났다(§7) | I-5′ 없음(X1) · 409 대체 없음(X2) · 최상위 redact 없음(X3) | **R1 에서 먼저 만든다**(5-3) |
| Δ2 | 텔레그램 코드를 지우면 된다(5-1) | Discord 버튼이 grammY `InlineKeyboard` 와 `inline_keyboard` 모양에 묶여 있다(X4) | A4 — 중립 형태로 먼저 옮긴다 |
| Δ3 | fin 웹 `getBot()` 3 · 봇 안 17곳(L12·L12′) | 지금은 `notifyBot()` 15 importer 이고 그 import 가 웹·MCP 를 명령 전체로 잇는다(X5) | B3·B4 두 단계로 끊는다 |
| Δ4 | 서버 `NOTIFY_*` 줄을 지우지 않는다(5-2) | `discord-switch off` 가 그 줄을 비운다(X10) | B1 에서 `on`·`off` 제거 · `check`·`state` 만 |
| Δ5 | 잔여 = 이력 문서·셸 정리 목록·DB 컬럼명(5-1) | 그 밖 잔여 후보가 있다(X11) | §7 허용 목록을 분류로 확정 |
| Δ6 | 기본값 = Discord | **[W] 기본값 뒤집기가 로컬 격리 한 겹을 없앤다** — 지금 로컬 앱은 `NOTIFY_*` 가 비면 텔레그램(검증 채팅)으로 가는데, 뒤집으면 루트 `.env` 의 웹훅으로 바로 간다 | A1 에 **웹훅 허용 목록**을 넣는다(§3-1) |
| Δ7 | — | fit 미검증 4행(#387)의 되돌리기가 `telegram-polling.sh fit on` 인데 R2 태그에서는 스크립트가 없다 | 사용자 결정 UQ-3 |

---

## 2. 실측 근거

### 2-1. 대장 ([S] 인용)

| # | 항목 | 값 | 출처 |
|---|---|---|---|
| N1 | grep 전수 | 430 파일 · 3,938 줄 | M1 |
| N2 | 통째 삭제 후보 | 23 파일 · 6,304 LOC(운영 11 · 1,251 / 테스트 12 · 5,053) | M12 |
| N3 | 수정 후보 | 운영 110 · env 4 · 테스트 41 · 문서 2 | M12 |
| N4 | 영역별 삭제 | fin 운영 3/297 · fin 테스트 7/3,310 · fit 운영 5/477 · fit 테스트 3/1,169 · notify 2/118 · deploy 3/933 | M12 |
| N5 | 영역별 운영 수정 | fin 56(주석만 10) · fit 35(주석만 14) · notify 11(주석만 6) · deploy 6(주석만 1) · tools 2 | M12 |
| N6 | `register*` 부분 삭제 | fin 17 파일 322 LOC · fit 10 파일 73 LOC | M2 |
| N7 | M12 밖의 삭제 불가 사실 | fin `bot/index.ts` 94(`notifyBot` 15 importer) · `telegram-fake.ts` 101(decide 테스트 4) · `vest-confirm.ts`(decideVest) | M12 |
| N8 | grammy 만 끌어오는 lock 패키지 | 앱마다 8 | M9 |
| N9 | 기본값 뒤집기에 닿는 env 테스트 | 11 파일 · 케이스별 영향 **미측정** | M4 |
| N10 | 웹 → `bot/*` 정적 도달 | fin 34 모듈 · fit 2 · fit MCP 0 | M2 |
| N11 | 동작 차이 | 5 곳 · 텔레그램에서만 닿는 명령·콜백 0 | M3 |
| N12 | 잔여 분류 | 이력 루트 117/2,094 · 이력 앱 102/372 · DB 3/10 · 앱 하네스 6/14 · 앱 옛 배포 5/43 · 소진 하네스 2/5 | M1 |

### 2-2. [W] 측정에 없던 직접 확인

| 사실 | 위치 | 쓰는 곳 |
|---|---|---|
| `gatewayBot()` 은 `remaining`·`total`·`resetAfterMs` 를 돌려주고 **IDENTIFY 직전에** 부른다 · guard 는 `remaining` 만 쓴다 | `packages/chat/src/rest.ts:276-281` · `chat.ts:317-320` · `identify-guard.ts:51,119` | X2 |
| guard 는 시도 시각을 `logs/identify-<app>.json` 에 재시작을 넘어 남긴다 | `identify-guard.ts:52-58,141` | X2 |
| `app_procs` 는 **이름으로만** 거른다 — 이름이 다른 봇 프로세스는 안 보인다 | `release-inplace.sh:99` | X2 |
| `ssh-deploy.sh` 가 양식에서 뽑는 것은 `기본 실행 rc`·`프로브 오류 응답`·`결과:` 셋뿐 — `409` 를 파싱하지 않는다 | `ssh-deploy.sh:58-60` | §5-3 |
| `test_telegram_polling.py` 는 앱 소스를 읽어 대조한다 — 앱 파일을 먼저 지우면 이 테스트가 깨진다 | `test_telegram_polling.py:430-438` | B1 이 B2 앞 |
| fin 폴링은 상태 파일이 `on` 이 아니면 밀린 업데이트를 버린다(없음·처음 포함) | `telegram-polling.ts:109,118` | §6 상태 파일 |
| `telegram.ts:37` 은 `components` 를 `reply_markup` 으로 그대로 넘긴다 · `chat/types` 에 이미 중립 `ButtonRows` 가 있다 · chat 이 notify 를 의존해 반대 방향 import 불가 | `telegram.ts:37` · `buttons.ts:5` | A4 |
| 스위치 값 조회가 이미 있다 — 출력은 `discord`·`telegram` 뿐(값·웹훅 없음) | `discord-switch.cjs:6,142` | S0 |
| decide 테스트의 fake 쓰임: `ai-decide` = `flush` 만 · `expense-trade-decide`·`lookup-manage-decide` = `captureBot` 로 정규식이 등록됐는지 대조 · `special-decide` = `captureBot`·`fakeCtx`·`flush` + `telegramOutput` | 각 테스트 import · `:95-96` · `:70,76` · `:29,41` | B3 |
| 옛 배포: `apps/*/deploy/` 에는 `nginx/*.conf` 도 있다 · `apps/*/.github/workflows` 에는 `ci.yml`·`security-audit.yml` 도 있다 | `git ls-files` | §7 |
| 훅·tools 테스트의 `ecosystem.config`·`apps/*/deploy` 는 **명령 문자열**이다 — 파일 삭제가 그 테스트를 깨지 않는다(실행 안 함 · 읽기만) | `test_isolation_guard.py:67-72` · `test_precheck.py:28-31` | §7 |

### 2-3. 미측정 (사실로 쓰지 않는다)

서버 스위치 4 값 · 토큰 · `TELEGRAM_POLLING` · 상태 파일(→ S0) · PDF 실제 크기(→ S0) · 운영 DB 행 · 기본값 뒤집기의 테스트 케이스별 영향 · 번들의 grammY 포함 · **U-2 같은 토큰 두 세션의 이벤트 분배 · U-15 실제 `remaining` 동작**(→ A3 로컬 실측 · UQ-2) · 로컬 루트 `.env` 의 웹훅 정체 · 서버 pm2 `pm_exec_path` 실제 모양 · `/backup/pleiades-cutover` 등 사본의 토큰 유무.

---

## 3. 대체가 먼저 있어야 할 가드 (5-3)

### 3-1. X1 I-5′ → A1 (#359)

**요구:** 로컬 실효 Discord 채널·사용자 ID 와 **웹훅**이 검증용일 때만 기동한다.

| 방식 | 내용 | 되돌리기 |
|---|---|---|
| **채택** | `effective_discord_tokens`(`check_env.py:104`)를 키 패턴 인자로 일반화 → `DISCORD_CHANNEL_ID_*` · `DISCORD_ALLOWED_USER_IDS` 는 ID 허용 목록(`PLEIADES_VERIFY_DISCORD_IDS`) · `DISCORD_WEBHOOK_*` 는 SHA-256 허용 목록(`PLEIADES_VERIFY_DISCORD_WEBHOOK_SHA256`) · 빈 값 통과 · 파일 못 읽으면 거부(기존 fail-closed) · 해시·개수만 출력 | 검사 삭제(**즉시**) |
| 채택 안 함 | 채널·사용자만(§7 문언 그대로) | Δ6 — 뒤집기 뒤 실제 발송 경로인 웹훅이 빈다 |

**웹훅은 §7 에 없는 추가다.** 근거 Δ6 · `notifier.ts:72-74,96-100`. 한계는 D-G 와 같다(`run.sh` 경유만 · `tools/local/README.md:51`). **사용자 작업:** 로컬 허용 목록 값을 셸에 넣는다(격리 경계 · 착수 전 확인). 문서: `isolation.md` I-5′ 행 · 006 §5 정정 블록.

### 3-2. X3 redact → A2

fin `logger.ts:198` · fit `:183` 의 `redact.paths` 에 최상위 `DISCORD_BOT_TOKEN_FINANCE` · `_FITNESS` · `DISCORD_WEBHOOK_FINANCE` · `_FITNESS` · `_ADMIN` · `_DEPLOY` 를 더한다(pino paths 는 와일드카드 키 이름을 못 쓴다 · 웹훅 URL 도 비밀). `TELEGRAM_BOT_TOKEN` 항목은 B2·B4 에서 뺀다. 회귀 테스트 앱별 1. 되돌리기: 줄 삭제(**즉시**) · 배포 뒤 재배포(**중간**).

### 3-3. X2 409 판정의 대체 → A3

**사실:** Discord 는 같은 토큰 두 세션에 충돌 신호를 내지 않는다(그래서 §7 이 "다른 관측"이라 적었다). 지금 양식의 프로세스 수는 이름만 본다(§2-2). **관측 수단 셋을 겹친다** — 각각 잡는 범위가 다르다.

| 수단 | 무엇을 드러내나 | 코드 근거 | 못 잡는 것 | 양식 처리 |
|---|---|---|---|---|
| **X2-a 플랫폼 대 로컬 대조** | 지난 창의 IDENTIFY 를 **플랫폼 수**(`total − remaining`)와 **이 프로세스 기록**(`attempts` 길이)으로 비교 → 차이 > 여유면 다른 곳에서 세션을 시작했다는 뜻 | `rest.ts:276-281`(값이 이미 온다) · `identify-guard.ts` · `chat.ts:319-320` | 창 전에 시작해 계속 붙어 있는 세션 | 로그 `[discord-<app>] gateway 외부 세션 의심` 1줄 + 웹훅 알림 1회(창당 · `alertedAt` 형) · **IDENTIFY 를 막지 않는다** · 양식 `세션 의심 N`(재기동 뒤 · **표시만**) |
| **X2-b 같은 서버 봇 프로세스 수** | 이름이 달라도 `pm_exec_path` 가 `apps/<dir>/dist/bot/standalone.cjs` 인 online 프로세스 수 | `release-inplace.sh:95-103`(`pm2 jlist` 헬퍼) · `pleiades.config.cjs:76,97` | 다른 머신 | 양식 `봇 프로세스 N` · **N ≠ 1 이면 stop 4**(409 와 같은 게이트) |
| **X2-c 사람 확인 줄** | 그 채널에 대화 명령 → **답이 한 번만** 오는가 — 두 세션 모두 메시지를 받으면 답이 둘 | `release-inplace.sh:338` 문구 확장 | 분배가 한쪽이면 못 잡는다(U-2) | "현황·`!today` 답 1번" 예/아니오 |

**왜 X2-a 는 게이트가 아닌가:** 기록 파일이 지워지거나 창 경계가 어긋나면 거짓 양성이 나고, 그때 rc 4 는 정상 배포를 실패로 만든다. **왜 차단하지 않나:** 알림이 목적이다 — 막으면 서비스가 멈춘다.

**전제 — 미측정:** `total − remaining` 이 IDENTIFY 마다 1씩 움직이는지(U-15) · 두 세션이 모두 이벤트를 받는지(U-2). **A3 착수 시 검증 봇 로컬 실측 2건**(UQ-2): 앱 하나를 두 프로세스로 띄운다(`check_env` 의 "앱 사이 같은 봇"은 두 앱에 대한 검사라 안 걸린다 · 쓰기 없는 명령만). **결과 분기:** ① 실패 → X2-a 를 버리고 X2-b·X2-c 만 + 009 §7 정정 ② 분배가 한쪽 → X2-c 를 빼고 양식 문구를 고친다. 어느 쪽이든 **"이중 세션을 빠짐없이 드러낸다"고 적지 않는다** — 409 와 동등하지 않다.

되돌리기: 코드 revert(**즉시**) · 배포 뒤 재배포(**중간**) · 기록 파일은 무시 경로라 무해. #373(오류 줄 집계)은 별건 — 의심 로그가 오류 줄로 세어지는 것은 표시 차이뿐이다.

---

## 4. grammY 의존 · 웹·MCP 경로 · 공유 파일 (X4 · X5)

### 4-1. 키보드 — A4 (R1)

| 안 | 형태 | R1 동작 | 되돌리기 |
|---|---|---|---|
| **K-a 채택** | notify 에 `ButtonRows`(`{label, action?|url?}` · chat 과 같은 모양) · `html(msg, rows)` · `toDiscordComponents` 는 **`ButtonRows` 와 `inline_keyboard` 둘 다** 받는다 · `telegram.ts` 가 `ButtonRows` → `inline_keyboard` 변환 · 호출 3 곳(`rsu.ts:173` · `auto-adjust.ts:64`(`buildAutoAdjustKeyboard`) · `auto-adjust-cron.ts`) 교체 | 라우트가 어느 쪽이든 그대로 동작 | revert(**즉시**) · 배포 뒤 **중간** |
| K-b | 헬퍼가 `{inline_keyboard}` 평범한 객체 반환 | 동작 같음 · 텔레그램 어휘가 공개 계약에 남아 B5 에서 호출부를 다시 고친다 | 같음 |
| K-c | R2 에서 한 번에 | R1 없이 버튼이 제거와 동시에 바뀐다 — 실패 원인이 안 갈린다 | **중간** |

R2(B5)는 `inline_keyboard` 분기와 `telegram.ts` 를 지우기만 하고 호출부는 건드리지 않는다. `action` → `custom_id` 값은 같으니 저장된 옛 메시지의 버튼 클릭도 그대로다(`decideVest` · `decideAutoAdjust` 무변경). **검증:** 두 앱 검증 봇으로 버튼 전송·클릭 로컬 실측(둘 다 운영 빈도가 낮다 · #387 `auto_adjust` 장주기). chat·notify 버튼 구현이 둘인 것은 그대로 둔다(별건).

### 4-2. `notifyBot()` 15 importer · 웹 경로

| 단계 | 변경 | 끊기는 경로 |
|---|---|---|
| **B3** | fin `bot/index.ts` 에서 `createBot`·`register*` import 제거 — `notifyBot()` 만 남겨 `BOT_PROCESS_WITHOUT_TELEGRAM` 반환 | 웹·MCP → 명령 전체(N10 fin) |
| **B4** | `notifierFor(bot)`·`interactiveNotifierFor(bot)` 인자 제거 · `sendX(bot)` 호출열 정리 · 15 importer 의 `notifyBot()` 삭제 · `bot/index.ts` 삭제 · `NotifyBot` 타입 삭제 · `telegramTokenSet`·`TELEGRAM_TARGETS`·`notifierForChat`·`telegramRecipients` 삭제 · `scheduler.ts:23` 가드 · `quarterly-report.ts:83-87` · `sendFileIfDiscord` → `sendFile`(`'not-discord'` 값 삭제) | 웹·MCP → grammY 0 |

두 PR 로 나누는 이유: B3 은 삭제 위주(읽을 것이 "남은 것") · B4 는 시그니처 변경(읽을 것이 "호출열"). B3 과 B4 사이의 `dev` 는 토큰이 있으면 크론이 텔레그램 수신자를 세고 0 건 발송하는 틈이 있다 — **R2 발행 전이라 서비스 미도달**(§5-2 동결).

### 4-3. fit `!bot` — 의미 보존 (1-7 · S-7)

fit 의 `bot` 인자는 텔레그램이 아니라 **"봇 프로세스인가"** 다(`admin-alerts.ts:183,196`). `NotifyBot` 을 `BotProcess` 표지로 바꾸고(`BOT_PROCESS` · 동결 객체) `admin-alerts.ts:189,271,292,314,337,370` · `lib/daily-report.ts` · `weekly-report.ts` · `garmin/sync.ts:318` 의 **조건은 그대로** 둔다. `notifierFor` 만 인자를 뺀다. 웹 재인증 alert 결함은 S-7 별건 — 고치지 않는다. 회귀 테스트: 웹 경로(인자 없음) alert 0 유지. 되돌리기: revert(**즉시**) · 배포 뒤 **중간**.

### 4-4. 공유 파일 개명 — B7 (전부 코드 결정)

| 지금 | 처분 | 이유 |
|---|---|---|
| fin `utils/telegram.ts`(`escapeHtml`·`h` 25 importer) | `utils/html.ts` · `replyHtml` 등은 B3 에서 삭제 | 저장 본문 HTML 은 남는다(R11) |
| fin `markdownToTelegramHtml`(6) | `markdownToHtml` | 같음 |
| fit `utils/telegram.ts`(`mdToHtml`) | `utils/html.ts` · `replyLong` 삭제 | 같음 |
| fit `TELEGRAM_MAX_MESSAGE_LENGTH` | **값까지 확인 후** — 쓰임이 설명 미리보기 근거(`food-edit-format.ts:5-10`)뿐이면 삭제 | 상한이 Discord 분할로 대체 |
| `alertArgsFromTelegram`(`router.ts:23,205`) | `alertArgsFromMatch` | Discord 가 호출 |
| `core/state-key.ts` 텔레그램 함수 | B2·B3 에서 삭제(`verify-food-edit-pending.ts:28,34,37` 는 Discord 키로) | L26 — fit `npm run test` 체인 |
| notify `TELEGRAM_MAX_LENGTH` · `splitMessage` 기본값 | B5 에서 개명 | 공개 export |
| fin `briefing.ts:110` 기본값 `/ai` · `scheduler.ts:207,220` 인자 | 기본값 `!ai` · 인자 삭제 · `briefing-target.test.ts:67` | D-4 §5-1 이 D-5 로 넘김 |
| fin 앱 `formatter.ts:50` | B7 개명 | 주석·상수 |

순수 개명만 B7 에 모아 diff 가 `git mv` + 치환으로 읽히게 한다. 되돌리기: revert(**즉시** · 릴리즈 전) · 배포 뒤 **중간**.

### 4-5. `register*` 부분 삭제 · 테스트

- `register*`(N6) · `briefing.ts:155` `telegramBriefingTarget` 등 어댑터 함수를 지우고 `decide*` 는 남긴다. **`vest-confirm.ts` 는 파일을 지우지 않는다**(`decideVest`).
- **`telegram-fake.ts`(N7):** `flush` 만 `__tests__/test-utils.ts` 로 옮기고 나머지 삭제. `captureBot` 를 쓰던 "정규식이 등록됐다" 대조는 **Discord 라우터 쪽 대조로 옮긴다**(`discord/__tests__/router.test.ts` · 지우기만 하면 정규식 상수 회귀를 잃는다). `special-decide` 의 `fakeCtx`·`telegramOutput` 케이스는 텔레그램 호출열 고정이라 삭제하되 판단 함수 직접 케이스는 남긴다. `core/__tests__/reply.test.ts:8` 의 어댑터 케이스 삭제.
- **fit `telegram-handlers.test.ts`(31 케이스):** 삭제 전 Discord 쪽에 대응 없는 분기가 있는지 대조표를 B2 PR 본문에 적는다 — 케이스별 대응은 **미측정**.

### 4-6. 동작 차이 5 + X12

| 곳 | 처분 | 근거 |
|---|---|---|
| fin `start` 이름 | **그대로** — `start.ts:81` 인자 제거 · 늘 "사용자" | 표시 문구 · Discord 이름 전달은 기능 추가(범위 밖) |
| plain 재전송 · 네트워크 재시도 | **그대로** — 11-02 부터 이미 Discord 만 받는 상태로 관찰 중 | M3 · 관찰 기간이 이 차이를 포함 |
| fit 실패 원문 + #365(X12) | **원문 분기 삭제** — `sync.ts:49-51` · `report.ts:44-46` · `staticErrors` 옵션도 제거(늘 정적) | 호출자 0 이 되는 죽은 분기 · Discord 동작 무변경 · T-7 로 고칠 수 있다 |
| 파일 10 MiB 상한 | **그대로** + S0 판정 | 초과해도 실패 안내가 나간다(`quarterly-report.ts` `failed` 분기) · 우회 없음은 이미 지금 동작 |
| fit `clearKeyboard` | **모델에서 삭제** | Discord 는 무시(`discord/reply.ts:4`) — 죽은 필드 |

---

## 5. PR 분할 · 릴리즈 · 스크립트 교체

### 5-1. PR 표

squash 머지라 되돌리기 단위는 PR 하나다. **영향** = 릴리즈 뒤에야 닿는다(`dev` 머지 자체는 서비스 영향 0 · Release 발행 = 배포).

| PR | 범위(파일 묶음) | 의존 | 검증(8절) | 리뷰(9-0) | 되돌리기 |
|---|---|---|---|---|---|
| **A1** | `tools/local/check_env.py` · 테스트 · README · `isolation.md` · 006 정정 | — | `tools/` 행 | self-review + 봇 · 가드 동작은 표 테스트 | **즉시** |
| **A2** | 앱 `mcp/logger.ts` 2 + 테스트 | — | 두 앱 행 | 9-1 필수(`apps/**`) + 봇 | 릴리즈 전 **즉시** · 뒤 **중간** |
| **A3** | `packages/chat`(guard·콜백) · 앱 `discord-interactions.ts` 2 · `release-inplace.sh`·테스트 · 런북 | UQ-2 실측 | pleiades · 두 앱 · `deploy/` 행 | 9-1 필수 + 봇 · 판정 문자열 무변경 확인 | 같음 |
| **A4** | notify 타입·`discord-bot.ts`·`telegram.ts` + 앱 호출 3 + 테스트 | — | pleiades · 두 앱 행 + 버튼 로컬 실측 | 9-1 필수(공개 인터페이스) + 봇 | 같음 |
| **R1 PR** | `dev` → `main` | A2~A4 · S0 불요 | 릴리즈 절차 | 봇 게이트 | R-8 → `v1.5.4`(**중간**) |
| **B1** | 삭제 N4 deploy(`telegram-polling.*` · 테스트) · `discord-switch` 축소 · `notify-deploy.cjs`·테스트 · `release-inplace.sh` 409 · `t2-check.sh` U13 · `deploy.sh:23` 주석 · `deploy/env/*` · `test_deploy.py:832-854` | **앱 삭제보다 먼저**(§2-2) | `deploy/` 행 | self-review + 봇 · **단 `ssh`·배포 경로라 9-1 에이전트 권장** | 릴리즈 전 **즉시** |
| **B2** | fit: 삭제 N4 · `register*` · `standalone` · notifier · `BOT_PROCESS` · 상태 키 · `verify-food-edit-pending` · 원문 분기 · `clearKeyboard` · redact 텔레그램 줄 · `package.json`·lock | B1 | fit 행 + `test_deploy` | 9-1 필수 + 봇 | 같음 |
| **B3** | fin 인바운드: 삭제 N4 · `register*` · `standalone` · `index.ts` 축소 · fake 축소 · `smoke-bot-bundle.mjs`(`TELEGRAM_BOT_TOKEN` 주입 제거) · `test_deploy.py:762,772` | B2(패턴 확인) | fin 행 + 테스트 잡 + `test_deploy` | 9-1 필수 + 봇 | 같음 |
| **B4** | fin 아웃바운드: §4-2 · env 테스트(N9 fin) · `package.json`(`grammy` · `--external:grammy`) · lock | B3 | fin 행(.env 없는 CI 조건 — #355 회귀) | 9-1 필수 + 봇 | 같음 |
| **B5** | notify: 삭제 N4 · `index.ts` export · `inline_keyboard` 분기 · `error.ts:33,82` · `deliver.ts:74` 폴백 정리 · `platform-env` · README · 테스트 | B2·B4(소비처 0) | pleiades + 두 앱 | 9-1 필수(공개 인터페이스) + 봇 | 같음 |
| **B6** | tools: `_check_telegram` · `run.sh:29-30` · `env/*` · `test_check_env`·`test_write_env` · `README:32` | **B4 뒤**(앱이 토큰을 안 읽어야 가드 제거가 안전) | `tools/` 행 | self-review + 봇 | **즉시** |
| **B7** | §4-4 개명 · 주석만 파일(N5) · M11 줄(`scheduler.ts:2,38` · `categories.ts:118`) · 앱 `.env.example` 2 · 루트 `.env.example` · 옛 배포 삭제 · 앱 문서(UQ-4) · 스키마 주석 · 잔여 고정 테스트 | B5 · B6 | 전 행 | 9-1 필수 + 봇 | 릴리즈 전 **즉시** · 뒤 **중간** |
| **B8** | 런북(`release-inplace.md` · `ai-model-upgrade.md` · t10 소진 블록) · `isolation.md` I-4·I-5 · 009 정정(§9) · `measured-facts` | B7 | 해당 없음 | self-review + 봇 | **즉시** |
| **R2 PR** | `dev` → `main` | B1~B8 · **11-05 오전 뒤** · S0 통과 | 릴리즈 절차 | 봇 게이트 | R-8(§6) |

**6,304 LOC 를 어떻게 읽나:** 삭제 N2 는 B1·B2·B3·B5 네 PR 에 영역 단위로 흩어진다(N4). 삭제 파일은 줄을 읽지 않는다 — 9-1 의 focus 를 **"무엇이 그 파일을 import 했나 · 남은 코드가 여전히 닿는가"** 로 고정하고 삭제 목록은 [S] M12 로 대조한다. 운영 수정 N3 중 주석만 파일은 B7 로 몰아 로직 PR 을 작게 둔다.

### 5-2. 릴리즈 구성 — 옵션

| 안 | 구성 | 얻는 것 | 잃는 것 | 되돌리기 |
|---|---|---|---|---|
| 1회 | R2 하나 | 배포 1회 | 대체와 제거의 실패 원인이 안 갈린다 · R2 자신의 배포가 **옛 판정**으로 돈다(§5-3) | R-8 → `v1.5.4` |
| ★ **2회 채택** | R1 → R2 | R2 배포부터 새 판정 · 새 버튼이 운영에서 먼저 돈다 · R1 은 11-05 제약 밖 | 재배포 1회 더 | R-8 → R1 또는 `v1.5.4` |
| 3회 이상 | 앱별 분리 | 앱별 실패 격리 | 공유 notify 를 먼저 지울 수 없어 fit 릴리즈 뒤에도 코드 잔존 · 이득 대비 판정 부담 | 같음 |

**버전(#199):** R1 = minor(관측 기능 추가) · 서버 조치 "없음". R2 = **minor**(§6 D-5 그대로) — 새 필수 키 0 · pm2·포트 0 · 마이그레이션 0(S-8). 일반 Release. 노트 칸: 앱별 변경 · 서버 조치 "없음 · 토큰 삭제는 선택 후속(별도 스크립트)" · **스위치 `NOTIFY_*` 를 더 읽지 않으나 지우지 말 것**. 번호는 그때 `package.json` 다음.

**동결 구간:** **B1 머지 ~ R2 발행 동안 `dev` 에서 릴리즈하지 않는다.** 그 사이 `dev` 는 텔레그램 일부가 빠진 상태다. 다른 릴리즈(#441 스크립트 · #437)가 필요하면 B1 머지 **전에** 내거나 `hotfix/` 경로로 낸다. **그래서 B 묶음 머지는 11-05 오전 뒤 시작한다** — PR 열기·리뷰는 그 전에 해도 되지만 `dev` 를 움직이지 않는다. 동시 열림이면 뒤 PR 이 앞 PR 에 얹혀 base 가 어긋나므로 **순차로 연다**.

### 5-3. 스크립트 교체 대입 (M5 표)

**판정 깨짐 조사 대상:** 양식을 기계로 읽는 곳은 `ssh-deploy.sh:58-60` 셋뿐이고 B1·A3 는 그 줄을 바꾸지 않는다.

| 배포 | `ssh-deploy`·`release-inplace` | `deploy.sh`·`notify-deploy` | 무슨 일이 일어나나 | 판정 |
|---|---|---|---|---|
| `v1.5.4` → **R1** | `v1.5.4` | R1 | 옛 양식 · `409 0` · 새 줄은 아직 없다 | 깨지지 않음 |
| **R1 → R2**(D-5 자신) | R1 | R2 | `count_409` 는 로그만 보므로 0 · 게이트 통과 · **새 `봇 프로세스`·`세션 의심` 줄이 R2 를 판정** · `notify-deploy` 는 R2 판(인자 형식 유지 `:12` · 실패 시 텔레그램 대체 없음 · rc 무관) · A 단계: 마이그레이션 0 · `mcp-config` 0 · `deploy/` 변경은 표시만(`:211-216`) | 깨지지 않음 |
| **R2 → 다음** | R2 | 다음 | `409` 칸 없는 양식 · 게이트 = online 3 · mcp 200 · 봇 프로세스 1 · same | 깨지지 않음 — 런북 `:261` 양식은 B8 |
| **R-8 R2 → R1·`v1.5.4`** | R2 | 옛 태그 | 옛 봇은 의심 로그를 안 내므로 `세션 의심 0`(표시뿐) · `봇 프로세스` 는 `pm_exec_path` 라 태그 무관 · **409 게이트 없음** — `TELEGRAM_POLLING=off` 가 남아 있으면 폴링 없음 · 그 줄만 지우고 토큰을 남기면 **폴링이 되살아난다**(§6 원자적 삭제 이유) | 깨지지 않음 · 전제 §6 |
| `--retry` | 그때 체크아웃 | 같음 | 위와 같은 스크립트 | 같음 |

C2 깨끗함 검사(`:279`): 지운 파일은 추적 파일이라 checkout 이 처리 · 상태 파일은 무시 경로(`test_deploy.py` `GitignoreStatePaths`) · `grammy` 는 lock 대로 `npm ci` — R-8 은 레지스트리가 있어야 한다(모든 태그와 같다).

### 5-4. 기본값 뒤집기와 스크립트별 처분 (L31)

**"기본값 = Discord" 의 구현:** 스위치를 **읽지 않는다.** `usesDiscord`·`allowedUsesDiscord`·`interactiveUsesDiscord` 삭제 → 라우트는 늘 Discord · 웹훅·봇 설정이 비면 수신자 0(텍스트 알림과 같은 의미 · `notifier.ts:91-100`). 서버 줄은 무효가 되지만 남아 **R-8 바닥을 지킨다**(5-2).

**서버 영향(근거 L31):** 스위치 4 가 전부 discord 면 **행동 변화 0.** 비어 있거나 다른 값인 라우트가 있으면 그 라우트가 텔레그램 → Discord 로 **옮겨 가고**, 그 웹훅이 비면 **조용히 0** 이다 → **S0 이 먼저 잰다**. CI: `.env` 없으면 수신자 0 → N9 테스트는 웹훅·토큰을 테스트 안에서 넣는다(#355 형식).

| 스크립트 | 처분 | 이유 · 되돌리기(태그에 실림 · R-8 로 복귀 **중간**) |
|---|---|---|
| `telegram-polling.sh`·`.cjs`·테스트 | 삭제(B1) | N4 · R-8 하면 그 태그의 파일이 돌아온다 |
| `discord-switch.sh` `off`·`on`·`set`·`revert` | **삭제 · `check`·`state` 유지** | X10 — `off` 는 바닥 조건을 깬다 · `on` 도 할 일이 없다 · `check` 는 키·형식·시험 발송으로 계속 쓸모 있다 · `state` 는 바닥 줄 확인 |
| `discord-switch` 판정 문자열 | `봇 토큰·채널 미설정` 접두 유지 · 뒤 `(텔레그램 버튼은 그대로)` 만 뺀다 | `test_discord_switch.py` · 옛 태그 스크립트와 호환 |
| `notify-deploy.cjs` | 텔레그램 대체·`chatsKey`·`APPS` 키 삭제 · `NOTIFY_DEPLOY_CHANNEL` 안 읽음 · 웹훅 없으면 "보내지 않았다"(rc 0) · 인자 형식 유지 | X13 · 실패 표면은 Actions 요약(M6) · dotenv 는 앱 의존 그대로 |
| `release-inplace.sh` | `count_409`·`:337`·`:339` 칸 제거(B1) · A3 줄은 유지 · **`:20` 은 남긴다**(5-2) | §5-3 |
| `t2-check.sh` | U13 함수·토큰 읽기·`:249-258`·`:288` 삭제 · 런북 `007-t2:36,242` 소진 표기 · `test_t2_check.py:37,67,119` | 일회 확인이고 토큰 읽기가 사라진다 |
| `deploy/env/*.template` · `ssh-deploy.sh:69` 주석 | 텔레그램 키 삭제 · 주석 "연결" 로 | M5 · NET_ARGS 옵션은 유지 |
| `pleiades.config.cjs` | 변경 0 | M5 |

---

## 6. 서버 작업과 되돌리기 바닥

서버 작업은 전부 **사용자 실행 · 판정 양식 출력**이다(I-3). 스크립트는 `.server-scripts/`(추적 안 됨 · #445)에 Claude 가 초안을 쓰고, 값·경로·수치를 출력하지 않는다.

| 시점 | 무엇 | 출력(판정만) | 멈추는 조건 | 되돌리기 |
|---|---|---|---|---|
| **S0** R2 발행 전 | 읽기 전용 스크립트 — `node deploy/discord-switch.cjs state <플랫폼 env>`(`:6`) · `discord-switch.sh check --no-send` · `apps/finance/reports` 최대 파일 > 10 MiB 여부 · 두 앱 `.env` 의 `TELEGRAM_POLLING=off` 여부 | 스위치 4 = discord 예/아니오 · 키 전부 채움 예/아니오 · 상한 초과 파일 있음 예/아니오 · 폴링 off 예/아니오 | 앞 둘 또는 폴링이 "아니오" → R2 보류 · 먼저 원인 처리 | 읽기뿐(**즉시**) |
| **R2 발행** | 일반 Release → fin → fit 자동 배포 · 크론 시각 회피(C0) | 판정 양식(Actions 요약) | C5 실패 → 양식의 재시도·R-8 줄 | **중간** |
| **S1** 배포 직후 | 사람 확인 · Discord 알림 1건 · 버튼 있는 메시지 도착 시 클릭 | 웹 · 현황·`!today` 답 1번 · 대표 질의(UQ-4 가 앱 문서를 고치면 fin 질의 1 — AI 입력 변경 · S-6 준용) | 이상 → R-8 | **중간** |
| **S2** UQ-1 시점 | 스크립트가 두 앱 `.env` 의 **`TELEGRAM_*` 전 줄을 한 번에**(임시 파일 600 → rename) 지운다 · `--dry-run` 먼저 · 권한 600 유지 | 지운 키 개수 · 남은 `TELEGRAM_` 0 · 파일 600 · 봇 online | 쓰기 실패 → 그대로 | 토큰 재기입(BotFather · **중간**) |

**S2 판단 근거.**
- **R2 코드는 그 키를 읽지 않으므로 재시작이 필요 없다**(M9 키 목록이 B2·B4 로 0).
- **토큰과 `TELEGRAM_POLLING` 을 따로 지우지 않는다** — 토큰이 남고 줄만 지운 뒤 R-8 하면 폴링이 살아난다(§5-3). 원자적 삭제.
- **상태 파일 `logs/telegram-polling-*.json` 은 지우지 않는다** — 무시 경로라 무해하고, 토큰이 있는 채 R-8 했을 때 `off` 기록이 밀린 업데이트 버림의 근거가 된다(`telegram-polling.ts:109` — 파일이 없어도 버리긴 한다). 토큰 삭제 뒤에는 쓰일 일이 없다. `logs/identify-*.json` 은 **절대 지우지 않는다**(R5 · X2-a).
- **백업에 토큰을 새로 남기지 않는다** — BotFather 로 다시 받을 수 있고 봇은 남는다(C-12). 기존 백업 안의 사본 유무는 **미측정** — 사용자가 판단.
- **`NOTIFY_*=discord` · 셸 정리 목록 유지**(5-2). 스크립트는 그 줄을 건드리지 않고 건드리지 않았음을 양식에 적는다.

### 되돌리기 바닥

| 상태 | R-8 대상 | 결과 | 등급 · 행위 |
|---|---|---|---|
| 릴리즈 전 | — | PR revert(역순 · B7 개명 뒤면 충돌 가능) | **즉시 ~ 중간** |
| R1 뒤 | `v1.5.4` | 그대로 | **중간** — `release-inplace.sh <app> v1.5.4` |
| R2 뒤 · 토큰 있음 | R1 | 텔레그램 코드 복귀 · 폴링 off 유지 · 그 태그의 `telegram-polling.sh`·`discord-switch off` 까지 쓸 수 있다 | **중간** |
| R2 뒤 · 토큰 삭제 | R1 또는 `v1.5.4` | 알림·수신 Discord 그대로 · 텔레그램 수신자 0 | **중간** |
| 토큰 삭제 뒤 **더 아래** | 기동 하한 `v1.2.0`(§6 머리) | 기동은 된다 · **fit 수신 < `v1.3.0` · fin 수신 < `v1.5.0` 은 Discord 메시지 수신이 없고, `v1.5.3` 미만은 fin 쓰기 도구 기본값이 되돌아간다**(`CLAUDE.md` 상태 문단) | **실사용 하한은 `v1.5.3`** · 그 아래는 기능 손실 |
| 텔레그램으로 복귀 | R1 + 토큰·chat ID·폴링 재설정 + `discord-switch off` | 가능 — 봇을 두었다(C-12) | **높음** — 재발급 · env 3 키 · 스크립트 2 |
| **바닥 조건이 깨질 때** | `NOTIFY_*` 줄을 지웠다 | `v1.5.x` 로 내려간 순간 알림 조용히 0(R12) | 줄 복구 후 **즉시** — 그래서 지우지 않는다 |
| 운영 DB | D-5 쓰기 0 | 마이그레이션·행 변경 없음(S-8) | 해당 없음 |

**편도 없음.** R-8 은 마이그레이션이 든 태그가 그 뒤에 오면 막히는데(`:215`) 그것은 D-5 와 무관한 일반 조건이다.

---

## 7. 수용 기준과 잔여 정의 (X11)

**판정:** 8절 전 행 · `deploy`·`tools` 테스트 · 아래 고정 테스트 · S0·S1 양식 · S2 양식(후속).

**잔여 고정 테스트(B7 신설):** `git grep -il -E 'telegram|grammy|텔레그램'` 결과가 아래 경로 패턴 안일 때만 통과. 경로로 고정해 새 이력 문서가 깨뜨리지 않는다. 허용 줄이 있는 코드 파일은 **줄 패턴까지** 고정. 되돌리기: 테스트 삭제(**즉시**).

| 분류 | 경로 | 처분 | 근거 |
|---|---|---|---|
| **이력 — 그대로** | `_workspace/**` · `docs/specs/**` · `docs/research/**` · `docs/handoff/**` · `docs/artifacts/**` · `CLAUDE.md` · `README.md` · `apps/*/docs/**` | 고치지 않는다 | N12 · 지우면 왜 그랬는지가 사라진다 |
| **이력 — 일회 런북** | `docs/runbooks/007-t2`·`t4`·`t5`·`t9`·`t10` | 본문 유지 · 머리에 소진 블록 · t10 `off` 지시에 "R2 뒤 실행 금지" | M10 |
| **셸 정리 목록** | `deploy/release-inplace.sh:20` · `docs/runbooks/release-inplace.md:142` + 사본 3(t4·t5·t9) | **유지** | 5-2 · L28 |
| **DB** | 두 `schema.prisma` · fit 마이그레이션 1 | 컬럼명 유지 · 주석만 사실대로(§7-1) | S-8 |
| **금지어 테스트** | `packages/chat/src/contract.test.ts:16` · `apps/finance/src/lib/ai/__tests__/system-prompt.test.ts` · 신설 잔여 테스트 | 유지 — 낱말이 있어야 금지를 본다 | M1 부록 |
| **가드 룰 이력** | `.claude/rules/isolation.md` I-4·I-5(소진 표기) · `.claude/agents/dual-repo-operator.md` · `.claude/skills/dual-repo-change/SKILL.md` | 유지 | 소진 하네스 2/5 |
| **상위 이력 줄** | `workflow.md` 정정 블록 | 유지 | 정정 블록 규약 |
| **앱 하네스** | `apps/finance/.claude/**` · `apps/finance/README.md` | **UQ-4** | M11 |
| **0 이어야 한다** | `apps/*/src` · `apps/*/scripts` · `packages/*/src`(금지어 테스트 제외) · `deploy/*`(`:20` 제외) · `tools/**` · `package.json`·lock · `.env.example` 전부 · `deploy/env/*` · `apps/finance/CLAUDE.md` · `ai-model-upgrade.md` · `release-inplace.md`(`:142` 제외) | 지운다 | 5-1 |

**앱 안 옛 배포(I-19 · 실행 안 함):** `apps/*/deploy/deploy.sh` · `apps/*/.github/workflows/deploy.yml` · `apps/*/ecosystem.config.js` 삭제(5 파일). `nginx/*.conf` · `ci.yml`·`security-audit.yml` 은 텔레그램 언급 없음 · **건드리지 않는다**. 훅 금지는 그대로 둔다(문자열 검사). 되돌리기: revert(**즉시**).

### 7-1. DB 주석 (X9)

`schema.prisma:406` 옛 주석을 "**Discord 메시지 id·별칭도 저장 · 읽는 곳 없음(S-8)**" 으로 · fin `:332,428` 도 사실대로. `//` 주석은 마이그레이션을 만들지 않고 `release-inplace.sh:215` 는 `prisma/migrations` 만 본다. **`@map` 으로 필드만 개명하는 안은 택하지 않는다** — S-8 은 "이름만 주석"이고 쓰기 2곳이 Discord 경로에 그대로 있다. 되돌리기: 문구(**즉시**).

**R11(5-4):** `discord-md.ts` · `format === 'html'` 경로 · `redispatchAlert` · `client-utils.ts:23` 무변경. 테스트에 **옛 HTML 본문 재발송 → Discord 마크다운** 1건이 없으면 B4 에 추가한다(있는지는 B4 착수 때 확인).

---

## 8. 사용자 결정

코드로 정할 수 있는 것(개명 · 스크립트 처분 · 릴리즈 2회 · X2 게이트 범위)은 위에서 정했고 올리지 않는다.

| # | 질문 | 선택지 → 달라지는 것 | 되돌리기 | 권고 |
|---|---|---|---|---|
| **UQ-1** | 서버 토큰을 언제 지우나 | **a** S1 통과 직후 — 사용하지 않는 비밀이 바로 사라진다 · 텔레그램 복귀가 **높음** 비용 **b** 정기 크론 한 바퀴(브리핑·알림 정상 판정) 뒤 — 며칠 더 서버에 남는다 · 그 사이 복귀가 **중간** **c** 분기 PDF 까지(2027-01) — 장주기까지 대체 수단 유지 · 비밀 잔존 가장 길다 | 재기입(**중간**) · R-8 은 어느 쪽이든 된다 | **b** — 코드가 안 읽어도 복귀 비용 차이는 이 기간에만 의미 있다. `TELEGRAM_*` 전 줄 원자적 삭제는 어느 쪽이든 같다 |
| **UQ-2** | A3 실측 — 검증 봇 두 세션 로컬 기동을 승인하나 | **예** U-2·U-15 를 재서 X2-a·X2-c 를 확정 — 검증 봇 IDENTIFY 소량 · 쓰기 없는 명령 · 서비스 영향 0 **아니오** X2-b 만 · 009 §7 "다른 머신 이중 세션은 드러나지 않는다"로 정정 | **즉시** | **예** — 없으면 §7 대체가 같은 서버 탐지뿐이다 |
| **UQ-3** | fit 미검증 4행(#387)을 R2 전에 어떻게 하나 | **a** R2 전에 운영 Discord 에서 편집 대기 · 사진 · `food:` 3행 1회 시험, `auto_adjust` 는 이월(장주기) — 운영 DB 식단 행이 생기고 삭제 버튼으로 지운다 · 결함이 R2 전에 드러난다 **b** 전부 이월 유지(사용자 2026-10-30 "쓸 때 검증") — R2 뒤 결함이면 텔레그램 되돌리기 없이 **고쳐서 전진** 또는 R-8 · 쓴 적 없는 기능이라 영향은 그때 생긴다 | **a** DB 행은 앱 삭제 · **b** 문구(**즉시**) | **a** — 단 #387 의 판단(써 본 적 없는 기능)이 그대로면 **b** 도 손해가 작다. `auto_adjust` 는 어느 쪽이든 A4 로컬 실측이 받는다 |
| **UQ-4** | 앱 하네스·앱 문서를 어디까지 고치나 | **a** `apps/finance/CLAUDE.md`(`:20,54,75,87`)와 `.claude/rules/workflow.md:87` 만 — 둘은 **모델 입력**이고 D-5 뒤 거짓 · S1 질의 1 · 나머지 `.claude` 4 파일과 `README.md` 는 허용 목록 **b** 언급 전부(하네스 5 파일 11 줄 + `CLAUDE.md` · README 7 줄) 수정 — 옛 fin 릴리즈 절차 스킬까지 고치는 비용 **c** `apps/finance/.claude/**` 16 파일 통째 삭제 — 모델 입력이 줄어 답이 바뀔 수 있다 · 별건 판정 필요 | **a·b** 릴리즈 전 **즉시** · 뒤 **중간** · **c** 파일 복구 **중간**(AI 입력 재판정) | **a** — 모델 입력만 사실로 맞추고 통째 정리는 별건(§10) |

**사용자 작업(결정 아님):** A1 로컬 허용 목록 값 · S0·S1·S2 실행 · R1·R2 릴리즈 PR 머지 · B 묶음 머지 시각.

---

## 9. 009 정본 정정 후보 (발행 때)

| 009 위치 | 새 내용 | 근거 |
|---|---|---|
| §3 L12 · L12′ | `getBot` → `notifyBot()` 15 importer · 웹·MCP 도달 | X5 |
| §3 L13 | fin 4(+미사용 1) · fit 3 | X7 |
| §3 L21 | 정정: deploy 16/151 · runbooks 7/30 · tools 7/33 | X8 |
| §3 L30 | `telegram-polling.ts:118` 로 해소됨 표기 | X6 |
| §4-3 · §6 D-5 5-1 | 코드 잔여 정의 = 이 문서 §7 분류 · Discord 버튼의 grammY 의존 X4 | X4 · X11 |
| §6 D-5 5-2 | + `discord-switch off` 제거 · `TELEGRAM_*` 원자적 삭제 | X10 |
| §6 D-5 5-3 | R1 선행 · 웹훅 허용 목록 추가 | X1·X2·X3 · Δ6 |
| §7 409 행 | X2-a·b·c · **"409 와 동등하지 않다"** 한계 명시 | X2 |
| §7 notify-deploy 행 | R2 자신의 알림부터 새 코드 | X13 |
| S-8 · L20 | 두 컬럼은 지금도 Discord 값을 쓴다 · 읽기 0 | X9 |
| §8 신규 위험 | **R15** 기본값 뒤집기가 로컬 웹훅 직발송을 연다(A1) · **R16** 스위치 미설정 라우트의 조용한 이동(S0) | Δ6 · §5-4 |
| 이슈 #365 | 원문 분기 B2 에서 삭제 | X12 |

`measured-facts.md`: [S] 대장 + §2-2 + A3 실측 결과.

---

## 10. 제외 · 별건

| 제외 | 이유 | 다시 열 조건 |
|---|---|---|
| 이력 문서 수정(N12) | 기록이다 | 없음 |
| 슬래시 명령 | C-6 | 사용자가 붙이기로 할 때 |
| 봇 대화 쓰기 전 확인 #421 | D-5 무관 | 그 이슈 |
| fin yahoo-finance2 zod #437 | D-5 무관 · 단 **동결 구간 전에 내거나 hotfix** | §5-2 |
| 텔레그램 봇 삭제·토큰 revoke | C-12 | 사용자 결정 시 |
| DB 컬럼 개명·마이그레이션 | S-8 | 읽기 경로가 생길 때 |
| fit 웹 재인증 alert | S-7 | 그 PR 승인 게이트 |
| `apps/finance/.claude/**` 통째 정리 | UQ-4 c · AI 입력 판정 필요 | 앱 하네스 정리 이슈 |
| 앱 옛 `nginx`·`ci.yml`·`security-audit.yml` | 언급 0 | 별도 정리 |
| chat·notify 버튼 구현 통합 · #333 · #137 · #96 · #157 · #373 | 관련은 있으나 필요 없음 | 각 이슈 |
| fit `--smoke` 추가 | M8 없음 그대로 · 텔레그램 무관 | 별건 |

---

## 11. 위험

| # | 위험 | 근거 | 대응 |
|---|---|---|---|
| W1 | 스위치 미설정 라우트가 R2 로 조용히 이동 | L31 · 서버 값 미측정 | S0 게이트 |
| W2 | 로컬 앱이 운영 웹훅으로 발송 | Δ6 · 로컬 값 미측정 | A1 웹훅 해시 · 착수 전 사용자가 값 확인 |
| W3 | 이중 세션이 알림 없이 지나간다 | X2 · U-2 미측정 | §3-3 세 겹 · 한계 명시 |
| W4 | B 묶음 머지 중 긴급 릴리즈 | §5-2 | 동결 구간 · hotfix 경로 |
| W5 | 삭제한 테스트만 덮던 판단 분기 소실 | fit `telegram-handlers` 31 케이스 대응 미측정 | B2 대조표 · 9-1 focus |
| W6 | fin CI 회귀(토큰 없는 13건 전례) | #355 · N9 | 비필수 체크까지 확인 · `.env` 없는 조건으로 실행 |
| W7 | 타입 전용 import 잔존으로 `--external` 제거 뒤 빌드 실패 | M2 · 번들 미측정 | typecheck + 빌드 · 서버면 재기동 전 rc 4(서비스 무영향) |
| W8 | fin 앱 문서 변경이 AI 답을 바꾼다 | UQ-4 a · D-4 N2a | S1 질의 1 · 1회 표본의 한계 그대로 |

---

## 12. 유효기간

**다시 연다:** A3 실측이 §3-3 전제를 깼을 때 · S0 에서 스위치가 discord 가 아닐 때 · B 묶음 전 `apps/*`·`deploy/` 를 바꾸는 릴리즈가 끼어 줄 번호가 밀렸을 때(각 PR 착수 직전 M2·M12 재측정) · 마이그레이션 릴리즈가 R2 전에 들어올 때 · C-12 를 바꿀 때 · D-5 완료로 소진.
