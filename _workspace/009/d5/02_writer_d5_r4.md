# 009 D-5 설계 — 텔레그램 제거 (확정 · 4회차)

작성 2026-11-03 · 상태 **방향 확정 — 사용자 결정 반영 · 집행 전**(정본은 `docs/specs/009-discord-only.md` §6 D-5 정정 블록 · 이 파일은 수단의 정본) · 이슈 #438 · 기준 `b1c3e68`(`dev`) · 최신 태그 `v1.5.4`
**계보:** 측정 `01_surveyor_d5.md`(**[S]** · M1~M12 · X1~X13) → 초안 `02_writer_d5.md`·`_r2`·`_r3` → 감사 `03_auditor_d5.md`(**[A]** · D1~D15)·`03_auditor_d5_r2.md`(**[A2]** · E1~E12 · 전부 문안) → 사용자 결정 `00_user_answers.md`(**결정의 정본**) → **이 파일**. **[W]** = 작성자가 코드에서 직접 읽은 사실. 앞 회차는 지우지 않는다.
숫자는 §2-1 대장 인용뿐이다. 시간 기록이 없어 소요는 되돌리기 등급으로 갈음한다. 서버 수치는 적지 않는다(판정만). 순서 판정은 정적 대조이고 실행하지 않았다. 4회차 변경분(§1-2)은 재감사하지 않았다.

## 0. 한 줄 요약

**필요한 대체를 먼저 올리고, 그다음 지운다.** R1(대체 · 11-05 오전 뒤) → R2(제거) → 정기 크론 한 바퀴 뒤 토큰 삭제·revoke. **409 판정은 텔레그램 폴링 오류라 텔레그램과 함께 사라지고, 대체 장치는 만들지 않는다**(사용자 · §3-3).

| | PR | 릴리즈 | 서비스 영향 |
|---|---|---|---|
| **R1 묶음** | A1 I-5′ · A2 redact · A4 중립 버튼 | R1(minor · #441 파일 포함) · A1 은 로컬 | 재배포 1회 · 봇 재시작 · 동작 불변 |
| **R2 묶음** | B1 deploy+앱 `.env.example` → B2 fit → B3·B4 fin → B5 notify → B6 tools → B7 개명·앱 문서 → B8 런북·룰·정본·잔여 테스트 | R2(minor) | 재배포 1회 · 텔레그램 코드 0 · 라우트 스위치를 더 읽지 않는다 |
| **서버(사용자)** | S0 판정(B1 머지 전 · R2 직전) · S1 배포 확인 · S2 토큰 삭제 + revoke | — | S2 는 기능상 재시작 불필요 · 메모리의 값은 다음 재시작까지 남는다 |

**PR 11**(r3 의 12 에서 A3 제거) + 릴리즈 PR 2. 편도 없음(§6).

---

## 1. 무엇이 바뀌었나

### 1-1. 009 §6 D-5 · §7 대비

요구사항 5-2 · 5-4 · S-8 은 유지한다. **5-3 에서 409 행을 삭제한다**(Q2). **5-1 수용 기준은 §7 분류로 고친다**(Q4).

| # | 009 전제 | 측정 | 처리 |
|---|---|---|---|
| Δ1 | 가드 대체가 있거나 끝났다(§7) | I-5′ 없음(X1) · 최상위 redact 없음(X3) · 409 대체 없음(X2) | I-5′·redact 는 R1 에서 먼저 · **409 는 요구사항 삭제**(§3-3) |
| Δ2 | 텔레그램 코드를 지우면 된다(5-1) | Discord 버튼이 `InlineKeyboard`·`inline_keyboard` 에 묶여 있다(X4) | A4 |
| Δ3 | fin 웹 `getBot()` 3 · 봇 안 17곳 | `notifyBot()` 15 importer(정적 14 + 동적 1 `advisor-monitor.ts:293`) · 웹·MCP 를 명령 전체로 잇는다(X5) | B3·B4 |
| Δ4 | 서버 `NOTIFY_*` 줄 유지(5-2) | `discord-switch off` 가 그 줄을 비운다(X10) | B1 — `check`·`state` 만 |
| Δ5 | 잔여 = 이력·셸·DB(5-1) | 그 밖 후보(X11) · 코드에 남는 컬럼명·R11 설명 | §7 |
| Δ6 | — | **로컬 웹훅 직발송은 이미 있는 틈이다**(아래) | A1 |
| Δ7 | — | fit 미검증 행(#387)의 되돌리기 스크립트가 R2 태그에 없다 | Q5 — R2 전 1회 시험 |

**Δ6.** 로컬 루트 `.env` 의 텍스트 스위치 2개는 이미 Discord 이고 웹훅 3개가 채워져 있으며 버튼 스위치만 비어 있다([A] D7 · 값 미출력). 뒤집기가 새로 여는 것은 버튼 경로뿐이고 G-1 토큰 가드 안이다. A1 웹훅 허용 목록의 근거는 **"지금도 열린 틈이고, 뒤집은 뒤에는 스위치로도 닫을 수 없다"** 이다. 웹훅 정체는 미측정. vitest 는 `PLEIADES_ENV_FILE` 을 없는 경로로 고정해 테스트 발송 위험이 없고 스모크는 `/dev/null` 이다.

### 1-2. 정정 블록

**1회차 → 2회차(D1~D15)** · **2회차 → 3회차(E1~E12):** 내용은 각 회차 파일 §1-2.

**3회차 → 4회차(사용자 결정).**

| 무엇 | r3 | r4 |
|---|---|---|
| A3 | `release-inplace.sh` 표시줄 · `pm_exec_path` 스텁 · 사람 확인 문구 | **삭제** |
| §3-3 | O1·O2·O3 비교 · O2 권고 | **O0 대체 없음** · 비교는 r3 에 기록 |
| 판정 양식 | 표시줄 추가 · "답 1번" | **추가 없음** — 기존 `online N/3` 만 남는다 · `:338` 사람 확인 줄 무변경 |
| U2 실측 | Q2 승인 대상 | **하지 않는다** · 미측정으로 남는다 |
| R1 근거 | R2 배포부터 새 판정 | **그 근거는 사라졌다** · 남는 근거는 §5-2 |
| S0 봇 수 | 양식 표시줄과 같은 수 | **S0 혼자 1회** · 기대 2 근거와 어긋날 때 처리(§6) |
| §12 축소안 | 선택지 | **쓰지 않는다** |
| 사용자 결정 절 | §14 선택지 | §8 결과 표 |

---

## 2. 실측 근거

### 2-1. 대장 ([S]·[A]·[A2] 인용)

| # | 항목 | 값 | 출처 |
|---|---|---|---|
| N1 | grep 전수 | 430 파일 · 3,938 줄 · 경로 허용 239 + 나머지 191 | M1 · [A2] |
| N2 | 통째 삭제 후보 | 23 파일 · 6,304 LOC(운영 11 · 1,251 / 테스트 12 · 5,053) | M12 |
| N3 | 수정 후보 | 운영 110 · env 4 · 테스트 41 · 문서 2 | M12 |
| N4 | 영역별 삭제 | fin 운영 3/297 · fin 테스트 7/3,310 · fit 운영 5/477 · fit 테스트 3/1,169 · notify 2/118 · deploy 3/933 | M12 |
| N5 | 영역별 운영 수정 | fin 56(주석만 10) · fit 35(주석만 14) · notify 11(주석만 6) · deploy 6(주석만 1) · tools 2 | M12 |
| N6 | `register*` 부분 삭제 | fin 17 파일 322 LOC · fit 10 파일 73 LOC | M2 |
| N7 | M12 밖 | fin `bot/index.ts` 94 · `telegram-fake.ts` 101 · `vest-confirm.ts`(decideVest) | M12 |
| N8 | grammy 만 끌어오는 lock 패키지 | 앱마다 8 · 코드 직접 import 0 | M9 · [A] |
| N9 | 뒤집기 대상 테스트 | env 만지는 11 파일 · 그중 fin `alert-dispatcher`+`retry/route` 34 · fit `notifier` 30 · fin `notifier` 17 · 케이스별 실패 수 **미확인** | M4 · [A] D13 |
| N10 | 웹 → `bot/*` 정적 도달 | fin 34 모듈 · fit 2 · fit MCP 0 | M2 |
| N11 | 동작 차이 | 5 곳 · 텔레그램에서만 닿는 명령·콜백 0 | M3 |
| N12 | 잔여 분류 | 이력 루트 117/2,094 · 이력 앱 102/372 · DB 3/10 · 앱 하네스 6/14 · 앱 옛 배포 5/43(언급 기준) · 소진 하네스 2/5 | M1 |
| N13 | 지우는 특성 테스트 | fin `*-telegram` 6 파일 198 케이스(ai 52 · expense 45 · lookup 24 · manage 27 · special 28 · trade 22) · fit `telegram-handlers` 31 | [A] D6 · M4 |
| N14 | 남는 테스트 | fin decide 42(12·9·9·12) · Discord 38(router 18 · reply 20) · fit `decide.test.ts` 22 + `discord-router.test.ts` | [A] D6 |
| N15 | `v1.5.4..dev` 의 #441 파일 | 7(`deploy/` 만 · 앱 0) | [A] D8 |
| N16 | fit 완료 응답 최악 길이 | 328자(`DESC_PREVIEW_MAX` 120) | [A2] |

### 2-2. [W] 직접 확인 (감사 확인 포함)

| 사실 | 위치 |
|---|---|
| 409 는 C5 게이트의 한 조건이다 · 집계는 재기동 뒤 봇 로그의 `getUpdates` 충돌 문구만 | `release-inplace.sh:111-115,334,337,339` |
| 양식을 기계로 읽는 곳은 셋(`기본 실행 rc`·`프로브 오류 응답`·`결과:`) — 409 칸을 읽지 않는다 | `ssh-deploy.sh:58-60` |
| 배포의 봇 교체는 이름 기준 `delete` → `start` | `deploy.sh:359-360` |
| `app_procs` 는 이름으로만 거른다 | `release-inplace.sh:99` |
| 봇 정의는 앱마다 하나 · `script: 'dist/bot/standalone.cjs'` · 옛 서비스 정의도 같은 끝 | `pleiades.config.cjs:76,97` · `apps/*/ecosystem.config.js` |
| `pm_exec_path` 필드는 쓰이고 있다 · 서버 값의 끝 모양은 미측정 | `t2-check.sh:117` |
| `pm2 jlist` 앞에 경고 줄이 붙을 수 있다 | `release-inplace.sh:80-81` |
| `test_telegram_polling.py` 는 앱 소스를 읽는다 → B1 이 B2 앞 | `:430-438` |
| `test_templates_cover_app_examples_and_ports` 는 앱 `.env.example` 활성 키가 템플릿에 있어야 통과 · 앱 코드·`write_env.py` 는 `.env.example` 을 읽지 않고 배포 A 는 표시만 | `test_deploy.py:825-827` · `release-inplace.sh:214` |
| `test_deploy.py:762,772` 는 fin 고정 | `:738-739` |
| 폴링은 상태가 `on` 이 아니면 밀린 업데이트를 버린다 | `telegram-polling.ts:109,118` |
| `telegram-polling.sh` 가 실행마다 앱 `.env` 를 `<app>-env-*.bak` 으로 복사 · pm2 env 에 키가 있으면 `.env` 변경이 소용없다 · 쓰기는 `real` 해석 뒤 rename | `.sh:96-112,269,276-277` · `.cjs:92-97` |
| 스위치 값 조회 — `stateLine` 은 `check`·`state` 공용 | `discord-switch.cjs:6,142` · `.sh:176` |
| fin 새 `.env` 는 옛 서비스 `.env` 에서 만들었다 | `007-t5-fin-cutover.md:85-86` · fit 은 `007-t9` 대조 |

### 2-3. 미측정

**재지 않기로 한 것:** 같은 토큰 두 세션의 이벤트 분배(U-2 · 사용자 결정 — 쓰기 명령이 두 번 실행될 가능성은 남는다).
**집행 중 드러나는 것:** 뒤집기 케이스별 실패 수(B2·B4) · 삭제↔잔여 분기 대응(대조표) · 로컬 웹훅 정체(A1 전 사용자) · 번들 grammY(빌드).
**서버(S0·S2 판정):** 스위치 4 값 · `TELEGRAM_POLLING` · PDF 크기 · `pm_exec_path` 끝 모양 · pm2 env 키 · `.bak` 개수. **그 밖:** 운영 DB 행 · 옛 체크아웃·`/backup` 의 토큰 사본(revoke 로 무효화하므로 재지 않아도 된다).

---

## 3. 대체가 먼저 있어야 할 가드 (5-3)

### 3-1. X1 I-5′ → A1 (#359)

**요구:** 로컬 실효 Discord 채널·사용자 ID 와 웹훅이 검증용일 때만 기동한다.

`effective_discord_tokens`(`check_env.py:104`)를 키 패턴 인자로 일반화 → `DISCORD_CHANNEL_ID_*`·`DISCORD_ALLOWED_USER_IDS` 는 ID 허용 목록(`PLEIADES_VERIFY_DISCORD_IDS`) · `DISCORD_WEBHOOK_*` 는 SHA-256 허용 목록(`PLEIADES_VERIFY_DISCORD_WEBHOOK_SHA256`) · 빈 값 통과 · 못 읽으면 거부 · 해시·개수만 출력. 한계는 D-G 와 같다(`run.sh` 경유만 · `tools/local/README.md:51`).

| 안 | 내용 | 되돌리기 |
|---|---|---|
| **채택** | ID + 웹훅 | 검사 삭제(**즉시**) |
| 채택 안 함 | ID 만(§7 문언) | 열린 틈(Δ6)이 그대로이고 뒤집은 뒤 스위치로도 못 닫는다 |

**착수 전 사용자 확인(격리 경계):** 로컬 웹훅 3개의 정체 · 허용 목록 값. 운영 웹훅이면 비우거나 교체. 문서: `isolation.md` I-5′ · 006 §5 정정.

### 3-2. X3 redact → A2

fin `logger.ts:198` · fit `:183` 에 최상위 `DISCORD_BOT_TOKEN_FINANCE`·`_FITNESS`·`DISCORD_WEBHOOK_FINANCE`·`_FITNESS`·`_ADMIN`·`_DEPLOY`. `TELEGRAM_BOT_TOKEN` 항목은 B2·B4 에서 뺀다. 회귀 테스트 앱별 1. 되돌리기: 줄 삭제(**즉시**) · 배포 뒤 재배포(**중간**).

### 3-3. X2 409 판정 — 대체 없음 (O0 · 사용자 2026-11-03)

**결정.** 409 판정·게이트를 지우고 대체 장치를 새로 만들지 않는다. 평소 양식은 기존 `online N/3` 만 남는다. R2 직전 S0 의 서버 봇 수 확인은 1회 유지한다(§6). 두 세션 로컬 실측은 하지 않는다.

**근거(사용자 지적).** 409 는 텔레그램 폴링 오류라 텔레그램을 지우면 함께 사라진다 — 지킬 대상이 없어진다. 남는 위험은 같은 봇 두 개가 도는 경우인데, 서버는 pm2 이름 기준 교체(`deploy.sh:359-360`)로 평소 생기지 않고 로컬은 `check_env.py` 가 운영 토큰을 막는다(`run.sh` 경유 한정).

**받아들인 것(숨기지 않는다).**
- 이중 실행 자동 판정은 없다. Discord 는 두 세션에 충돌 신호를 내지 않는다.
- 메시지가 두 세션 모두에 가는지는 미측정이고, **쓰기 명령이 두 번 실행될 가능성은 남는다.**
- `online N/3` 은 이름으로만 거른다(`release-inplace.sh:99`). 이름이 다른 봇 · 다른 pm2 데몬 · pm2 밖 프로세스 · 다른 머신은 보이지 않는다.

**다시 열 조건.** 실제로 생기면 #250 모니터링에서 다룬다. 검토한 대안(플랫폼 수 대조 · 표시줄 · 프로세스 게이트)의 정의·비용은 `02_writer_d5_r3.md` §3-3 에 남는다.

되돌리기: 문구(**즉시**) · 게이트를 되돌리려면 코드 없이는 불가하나 텔레그램이 없으면 쓸모가 없다.

---

## 4. grammY 의존 · 웹·MCP 경로 · 공유 파일 (X4 · X5)

### 4-1. 키보드 — A4 (R1)

| 안 | 형태 | 되돌리기 |
|---|---|---|
| **K-a 채택** | notify 에 `ButtonRows`(`{label, action?|url?}` · chat 과 같은 모양 · chat 이 notify 를 의존해 반대 import 불가) · `toDiscordComponents` 는 `ButtonRows`·`inline_keyboard` 둘 다 · `telegram.ts` 가 `inline_keyboard` 로 변환 · **생성 2곳 교체**(`rsu.ts:173` · `auto-adjust.ts:64`) · `auto-adjust-cron.ts` 무변경 | revert **즉시** · 배포 뒤 **중간** |
| K-b | 헬퍼가 `{inline_keyboard}` 객체 반환 | 어휘가 공개 계약에 남아 B5 때 호출부 재수정 |
| K-c | R2 에서 한 번에 | 실패 원인이 제거와 섞인다 |

**확인([A]):** 페이로드 동일(`custom_id`·라벨 유지) · 소비처 3 전송 지점 · `rsu.ts` 호출자 `scheduler.ts` 뿐 · 옛 메시지 클릭 유지 · 웹훅은 `components` 를 원래 거부. **R2:** B5 가 `inline_keyboard` 분기를 지우기 전에 앱 테스트 픽스처를 B2·B4 가 바꾼다(fin `notifier.test.ts:104,118,138` · fit `:199,518,557`). **검증:** 두 앱 검증 봇으로 전송·클릭 로컬 실측 — **`auto_adjust` 이월(Q5)의 대체다.** 봇·웹 기동이라 착수 전 사용자 확인.

### 4-2. `notifyBot()` · 웹 경로

| 단계 | 변경 | 끊기는 경로 |
|---|---|---|
| **B3** | fin `bot/index.ts` 에서 `createBot`·`register*` 제거 · `notifyBot()` 만 남겨 `BOT_PROCESS_WITHOUT_TELEGRAM` 반환 | 웹·MCP → 명령(N10 fin) |
| **B4** | `notifierFor(bot)`·`interactiveNotifierFor(bot)` 인자 제거 · 호출열 · 15 importer(`advisor-monitor.ts:293` 동적 import 포함) · `bot/index.ts` 삭제 · `vi.mock('@/bot/index')` 3 파일(`active-review.test.ts:16` · `briefing-target.test.ts:11` · `news-rules.test.ts:9`) · `NotifyBot`·`telegramTokenSet`·`TELEGRAM_TARGETS`·`notifierForChat`·`telegramRecipients` 삭제 · `scheduler.ts:23` · `quarterly-report.ts:83-87` · `sendFileIfDiscord` → `sendFile` | 웹·MCP → grammY 0 |

B3~B4 사이 `dev` 는 토큰이 있으면 크론이 수신자를 세고 0 건 보내는 틈이 있다 — 릴리즈 전이라 서버에 닿지 않는다.

### 4-3. fit `!bot` (1-7 · S-7)

`bot` 은 "봇 프로세스인가" 다(`admin-alerts.ts:183,189,196,236,271,292,314,337,370`). `NotifyBot` → `BotProcess` 표지(`BOT_PROCESS`) · 위 조건과 `lib/daily-report.ts` · `weekly-report.ts` · `garmin/sync.ts:321` 필드 유지. `notifierFor` 만 인자를 뺀다. 웹 재인증 alert 는 S-7 별건. 회귀 테스트: 웹 경로 alert 0. 되돌리기 revert **즉시** · 배포 뒤 **중간**.

### 4-4. 개명 — B7 (코드 결정)

| 지금 | 처분 |
|---|---|
| fin `utils/telegram.ts`(`escapeHtml`·`h` 25 importer) | `utils/html.ts` · `replyHtml` 등은 B3 삭제 |
| fin `markdownToTelegramHtml`(6) | `markdownToHtml` |
| fit `utils/telegram.ts`(`mdToHtml`) | `utils/html.ts` · `replyLong` 삭제 |
| `alertArgsFromTelegram`(`router.ts:23,205`) | `alertArgsFromMatch` |
| `core/state-key.ts` 텔레그램 함수 | B2·B3 삭제 · `verify-food-edit-pending.ts:28,34,37` 는 Discord 키로(B2) |
| notify `TELEGRAM_MAX_LENGTH` | B5 개명 · 앱 소비 0 |
| fin `briefing.ts:110` 기본값 · `scheduler.ts:207,220` | 기본값 `!ai` · 인자 삭제 · `briefing-target.test.ts:67` |
| fin `formatter.ts:50` | 상수 개명 · **값 4096 유지**(`ai.ts:94` · `briefing.ts:134`) |

**`TELEGRAM_MAX_MESSAGE_LENGTH`(B2):** 쓰임은 `verify-food-edit-pending.ts:23,271-272,278-279` 최악 길이 단언이다. **`MAX_SINGLE_MESSAGE_LENGTH = 2000` 으로 바꾸고 단언 유지** — 최악 N16 이라 통과한다. `verify-food-edit-pending.ts:257` · `food-edit-format.ts:5-10` 낱말도 함께 고친다.

### 4-5. `register*` 삭제와 테스트 대조표 (B2·B3 수용 조건)

- `register*`(N6) · 어댑터(`briefing.ts:155` 등) 삭제 · `decide*` 유지. `vest-confirm.ts` 파일 유지.
- `telegram-fake.ts`: `flush` 만 `__tests__/test-utils.ts` 로 · 나머지 삭제(`ai-decide` = `flush` · `expense-trade-decide`·`lookup-manage-decide` = `captureBot` · `special-decide` = `captureBot`·`fakeCtx`·`flush`+`telegramOutput`). "정규식 등록" 대조는 Discord 라우터 테스트로 옮긴다. `core/__tests__/reply.test.ts:8` 어댑터 케이스 삭제.

**대조표.** N13 은 `decide*` 를 텔레그램 어댑터로 고정해 온 특성 테스트이고 N14 가 같은 분기를 덮는지는 미측정이다. B2(fit 31 ↔ `decide` 22 + `discord-router`) · B3(fin 198 ↔ decide 42 + Discord 38) PR 본문에 싣는다:

| 삭제 케이스(`describe` 단위) | 대응 잔여 테스트 | 판정 |
|---|---|---|
| … | 파일:케이스 | 덮임 / **텔레그램 전용(소실 무해)** / **빈 칸 → 이 PR 에서 테스트 추가** |

빈 칸이 남으면 머지하지 않는다. 9-1 focus 에 고정한다. 되돌리기: 문구 **즉시** · 삭제는 revert.

### 4-6. 동작 차이 5 + X12

| 곳 | 처분 | 근거 |
|---|---|---|
| fin `start` 이름 | 그대로 — 늘 "사용자" | 표시 문구 |
| plain 재전송 · 네트워크 재시도 | 그대로 | 11-02 부터 Discord 만 받는 상태로 관찰 중 |
| fit 실패 원문 + #365 | 원문 분기·`staticErrors` 삭제(B2) | 호출자 0 · Discord 동작 무변경 · T-7 |
| 파일 10 MiB | 그대로 + S0 판정 | 초과해도 실패 안내(`quarterly-report.ts` `failed`) |
| fit `clearKeyboard` | 모델에서 삭제(B2) | Discord 무시 |

---

## 5. PR 분할 · 릴리즈 · 스크립트 교체

### 5-1. PR 순서표

squash 머지 · 되돌리기 단위 PR. `dev` 머지는 서비스 영향 0. **`deploy` 열 = 그 PR 머지 상태에서 `python3 -m unittest discover -s deploy` 가 통과하는 근거**(CI 미포함 · 로컬에서 반드시 돌린다). PR 번호 A3 은 비워 둔다(결정으로 삭제 · 문서 간 대조용).

| 순서 | PR | 범위 | `deploy` 통과 근거 | 검증 · 리뷰(9-0) | 되돌리기 |
|---|---|---|---|---|---|
| 1 | **A1** | `check_env.py` · 테스트 · README · `isolation.md` · 006 | 무관 | `tools/` · 9-1 필수(가드) + 봇 | **즉시** |
| 2 | **A2** | 앱 `logger.ts` 2 + 테스트 | 무관 | 두 앱 · 9-1 필수 + 봇 | 릴리즈 전 **즉시** · 뒤 **중간** |
| 3 | **A4** | notify 타입·`discord-bot.ts`·`telegram.ts` + 생성 2곳 + 테스트 | 무관 | pleiades + 두 앱 + 버튼 로컬 실측 · 9-1 필수(공개 인터페이스) + 봇 | 같음 |
| — | **R1 PR** | `dev` → `main` · **11-05 오전 뒤**(Q1) · 노트에 #441 파일(N15) | | 봇 게이트 | R-8 → `v1.5.4` **중간** |
| — | **S0** | §6 판정 — B1 머지 전 | | | 읽기뿐 |
| 4 | **B1** | `telegram-polling.*`·테스트 삭제(N4) · `discord-switch` 축소(`on`·`off`·`set`·`revert` · `.cjs:5,147-148` · **`:142` 출력 낱말 `telegram` → `미설정`**) · `notify-deploy.cjs`·테스트 · **`release-inplace.sh` 409(§5-3)** · `t2-check.sh` U13 · `deploy.sh:23` · `deploy/env/*` + **앱 `.env.example` 2** · `test_deploy.py:251,265` 픽스처 · `test_t2_check.py` · `test_release_inplace.py`(§5-3) · `test_discord_switch.py`: `on`·`off` 테스트 12(`:181,199,206,212,223,233,244,253,273,281,290,298`)와 클래스 `:323-367` 삭제 · `check` 계열(`:144,159,169,175`)·`:307`·`:311` 유지 | 템플릿과 `.env.example` 을 같은 PR 에서 지워 `test_templates_cover…` 통과 · 폴링 테스트가 사라져 앱 삭제 가능 | `deploy/` · 9-1 필수(배포 경로 · 200 LOC 이상) + 봇 | 릴리즈 전 **즉시** |
| 5 | **B2** | fit: 삭제 N4 · `register*` · `standalone` · notifier · `BOT_PROCESS` · 상태 키 · verify 스크립트 · 원문 분기 · `clearKeyboard` · 길이 상수 · redact 줄 · 픽스처 · `notifier.test.ts:377,378` 재작성 · `package.json`·lock | `test_deploy:762,772` 는 fin 고정 · fit 무관 | fit + `deploy` · 9-1 필수 + 봇 · **대조표** | 같음 |
| 6 | **B3** | fin 인바운드: 삭제 N4 · `register*` · `standalone` · `index.ts` 축소 · fake 축소 · `smoke-bot-bundle.mjs` | 같은 PR 에서 `test_deploy.py:762,772` 수정(`startTelegramPolling(`·`getBot(`·`TELEGRAM_BOT_TOKEN`) | fin + 테스트 잡 + `deploy` · 9-1 필수 + 봇 · **대조표** | 같음 |
| 7 | **B4** | §4-2 · N9 fin 테스트 · **R11 재발송 테스트(필수)** · 픽스처 · `grammy`·`--external:grammy`·lock · 루트 `.env.example` · redact 줄 | 무관 | fin(.env 없는 CI 조건 · #355) · 9-1 필수 + 봇 | 같음 |
| 8 | **B5** | notify: 삭제 N4 · export · `inline_keyboard` 분기 · **`deliver.ts:74` 폴백 분기 유지 · 주석만**(`deliver.test.ts:120` 근처가 시험) · `error.ts:33,82` 낱말만 · `platform-env` · README · 테스트 | 무관 | pleiades + 두 앱 · 9-1 필수 + 봇 | 같음 |
| 9 | **B6** | `_check_telegram` · `run.sh:29-30` · `tools/local/env/*` · `test_check_env`·`test_write_env` · `README:32` | 무관 · B4 뒤(앱이 토큰을 안 읽은 뒤) | `tools/` · 9-1 필수(가드) + 봇 | **즉시** |
| 10 | **B7** | §4-4 · 주석만 파일 · M11 줄 · 옛 배포 6 파일 삭제 · 앱 문서(Q4 a) · 스키마 주석 | `apps/*/deploy` 는 훅 테스트에서 문자열뿐 | 전 행 · 9-1 필수 + 봇 | 릴리즈 전 **즉시** · 뒤 **중간** |
| 11 | **B8** | 런북(`release-inplace.md:70,71,193,261` 409 · 일회 런북 소진 표기) · `isolation.md` · 009 잔여 정정 · `measured-facts` · **`tools/local/test_residual.py`(마지막 신설 · 이 커밋에서 처음 통과)** | 무관 | `tools/` · self-review + 봇 | **즉시** |
| — | **Q5 시험 → S0 재확인 → R2 PR** | | | 봇 게이트 | R-8(§6) |

**삭제 읽는 법:** 삭제 N2 는 B1·B2·B3·B5 에 흩어진다. 9-1 focus = "무엇이 import 했나 · 남은 코드가 여전히 닿는가" + 대조표. 주석만 파일은 B7 로 몰아 로직 PR 을 작게 둔다.

### 5-2. 릴리즈

| 안 | 구성 | 잃는 것 |
|---|---|---|
| 1회 | R2 하나 | 버튼 변경·redact 와 제거의 실패 원인이 안 갈린다 |
| ★ **2회** | R1 → R2 | 재배포 1회 더 |
| 3회 이상 | 앱별 | 공유 notify 를 먼저 못 지운다 |

**R1 근거(A3 삭제 뒤).** "R2 배포부터 새 판정" 근거는 사라졌다. 남는 근거는 ① 버튼 형태 변경을 제거와 분리해 실패 원인을 가른다 ② redact 를 먼저 올린다(5-3 대체 선행) ③ R2 의 R-8 대상이 중립 버튼·redact 를 가진 태그가 된다. R1 뒤 오래 기다릴 근거는 없다 — 버튼은 운영 빈도가 낮아 소크로 검증되지 않는다.

**R1 성격.** 앱 변경은 A2·A4 뿐이고 페이로드가 같아 동작 불변이다. 봇 재시작은 있다(대화 맥락 초기화는 모든 릴리즈와 같다). R1 은 태그로는 #441 파일의 첫 릴리즈다(N15 · 노트에 적는다).

**버전(#199):** R1 = minor · R2 = minor · 일반 Release · 새 필수 키·마이그레이션 0. 노트: 앱별 변경 · 서버 조치 "없음 · 토큰 삭제는 후속" · `NOTIFY_*` 를 지우지 말 것.

**동결(절차 약속 · 기계 차단 아님):** R1 발행 뒤 **B1 머지 ~ R2 발행 동안 릴리즈 PR 을 열지 않는다.** 다른 릴리즈(#437 등)는 B1 전에 내거나 `hotfix/` 로 낸다 — hotfix dev 백포트는 B7 개명 뒤 충돌할 수 있다. B 묶음은 순차로 머지한다.

### 5-3. 409 게이트 제거와 태그 혼합 (M5)

**B1 이 고치는 것.**

| 곳 | 변경 | 판정 결과 |
|---|---|---|
| `release-inplace.sh:110-115` | `count_409` · 주석 삭제 | — |
| `:332,334` | `conflict` 변수 · 집계 삭제 | — |
| `:337` | 양식에서 `409 $conflict · ` 만 뺀다 → `online N/3 · mcp 코드 · 재기동 same n · DIFF/MISSING n` | 기계 파싱 없음(§2-2) |
| `:339` | 게이트에서 `"$conflict" == 0` 만 뺀다 → **online 3 · mcp 200 · DIFF/MISSING 0** | 나머지 조건 무변경 · 실패는 그대로 rc 4 + 복구 안내 |
| `:338` · `:20` | **무변경** | 사람 확인 줄 · 셸 정리 목록(5-2) |
| `test_release_inplace.py:65-68` | 스텁의 409 줄 · `STUB_409` 삭제 | |
| `:218` | `"online 3/3 · mcp 200 · 409 0"` → `"online 3/3 · mcp 200 · 재기동"` | |
| `:346-355` | `test_c5_counts_409` 삭제 | 게이트 회귀는 `test_c5_failure_points_to_r8`(`STUB_MCP_CODE`) 가 유지 |
| `:177` | **무변경** — 사람 확인 줄 금지어 고정 | §7 줄 허용 |

런북 `release-inplace.md:70,71,193,261` 은 B8. R2 전까지 `dev` 안의 차이일 뿐 서버에 닿지 않는다.

**태그 혼합 대입.**

| 배포 | `ssh`·`release-inplace` | `deploy.sh`·`notify` | 일어나는 일 | 판정 |
|---|---|---|---|---|
| `v1.5.4` → R1 | `v1.5.4` | R1 | 옛 양식 · 폴링 off 라 `409 0` | 안전 |
| **R1 → R2(D-5 자신)** | **R1(409 게이트 있음)** | R2 | 아래 | **안전** |
| R2 → 다음 | R2 | 다음 | 409 칸·게이트 없음 | 안전 |
| R-8 R2 → R1·`v1.5.4` | R2 | 옛 태그 | 409 게이트 없음 — `TELEGRAM_POLLING=off` 가 있으면 폴링 없음 · 줄만 지우고 토큰을 남기면 폴링 부활(§6 원자적 삭제) | 안전 · 전제 §6 |

**R2 자신의 배포가 직전 태그의 게이트를 타는 것은 그대로 안전하다.** R1 은 A3 이 빠져 `release-inplace.sh` 가 `v1.5.4` 와 같고 게이트에 `"$conflict" == 0` 이 있다. 집계는 재기동 뒤(T0~) 봇 로그의 `409 … Conflict|getUpdates` · `terminated by other getUpdates` 줄만 센다(`:111-115`).
- T0 이후 도는 옛 봇: R1 + `TELEGRAM_POLLING=off`(**S0 이 확인**) → `getUpdates` 없음.
- R2 봇: grammY 가 없다 → 그 문구를 낼 코드가 없다.
- 그래서 `conflict = 0` 이고 게이트는 통과한다. **S0 에서 폴링 off 가 "아니오" 면 R2 를 내지 않는 이유이기도 하다** — 옛 봇이 폴링 중 충돌을 내면 R2 가 rc 4 로 멈춘다.
- `notify` 는 R2 판(인자 형식 유지 · 실패 대체 없음 · rc 무관) · A: 마이그레이션 0 · `mcp-config` 0 · `deploy/` 표시만. fin=R2·fit=R1 혼합은 C5 실패 때만(일반 조건).

C2 깨끗함: 지운 파일은 checkout 이 처리 · 상태 파일은 무시 경로. 체크아웃 전 스크립트가 지워진 파일을 부르는 경로 없음.

### 5-4. 기본값 뒤집기와 스크립트 처분 (L31)

**구현:** 스위치를 읽지 않는다. `usesDiscord`·`allowedUsesDiscord`·`interactiveUsesDiscord` 삭제 → 늘 Discord · 설정이 비면 수신자 0. 서버 줄은 무효지만 남아 바닥을 지킨다(5-2). **서버 영향:** 4 = discord 면 변화 0 · 아니면 그 라우트가 이동하고 웹훅이 비면 조용히 0 → S0. CI 는 N9 를 테스트 안에서 채운다(#355 형식).

| 스크립트 | 처분 | 이유 |
|---|---|---|
| `telegram-polling.*` | 삭제(B1) | R-8 하면 그 태그 파일이 돌아온다 · 앱 없이 키만 있어도 무해 |
| `discord-switch` `off`·`on`·`set`·`revert` | 삭제 · `check`·`state` 유지 · 출력 낱말 `미설정` | X10 · E1 |
| 앱의 `봇 토큰·채널 미설정` 문구 | 제약 없음 — 소비자는 `discord-switch.sh:126`(`on` 경로)뿐이라 B1 뒤 자유 | E6 |
| `notify-deploy.cjs` | 텔레그램 대체·`chatsKey` 삭제 · 인자 유지 · 웹훅 없으면 rc 0 | X13 |
| `release-inplace.sh` | §5-3 · `:20` 유지 | 5-2 |
| `t2-check.sh` | U13 · 토큰 읽기 삭제 | 일회 |
| `deploy/env/*` · `ssh-deploy.sh:69` | 키 삭제 · 주석 수정 | M5 |

---

## 6. 서버 작업과 되돌리기 바닥

전부 사용자 실행 · 판정 양식 출력(I-3) · 스크립트는 `.server-scripts/`(#445) · 값·경로·수치 비출력.

| 시점 | 무엇 | 양식(판정만) | 멈추는 조건 | 되돌리기 |
|---|---|---|---|---|
| **Q5 시험** R2 전 | fit 편집 대기 입력 · 사진 · `food:` 버튼 운영 Discord 1회 · 시험 행은 삭제 버튼으로 지운다 | 행별 예/아니오(사용자 보고 · #387) | 안 되면 그 행을 따로 고친 뒤 R2 | 앱에서 삭제 · 운영 DB 전진 전용 |
| **S0** B1 머지 전 · R2 직전 재확인 | 읽기 전용(아래) | 스위치 4 = discord · 키 전부 · 상한 초과 파일 없음 · 폴링 off · 봇 수(R2 직전 실행분으로 판정) | 상한 초과 외 "아니오" → 원인 처리 전 진행 안 함 | 읽기(**즉시**) |
| **R2 발행** | 자동 배포 · 크론 시각 회피(C0) | 판정 양식 | C5 → 재시도·R-8 | **중간** |
| **S1** 직후 | 기존 사람 확인 줄(웹 · Discord 현황·`!today`) · Discord 알림 1건 · fin 대표 질의 1(Q4 a 앱 문서 변경 · S-6 준용) | 예/아니오 | 이상 → R-8 | **중간** |
| **S2** 정기 크론 한 바퀴 정상 확인 뒤(Q3 b) | 두 앱 `.env` 의 `TELEGRAM_*` 전 줄을 한 번에(`real` 해석 뒤 같은 디렉터리 임시 파일 600 → rename) · `--dry-run` 먼저 · `NOTIFY_*` 무변경 | 지운 키 개수 · 남은 `TELEGRAM_` 0 · 권한 600 · **pm2 env 의 `TELEGRAM_` 키 개수**(`pm2_env`·`pm2_env.env` 둘 다 · 파이프 처리 · 값 없이 · `telegram-polling.sh:100-112` 선례) · **`fin-env-*.bak`·`fit-env-*.bak` 개수**(글롭 · `platform-env-*.bak` 제외) · 봇 online | 쓰기 실패 → 그대로 · pm2 키 ≠ 0 → 보고 | 재기입(**중간**) |
| **revoke** S2 뒤(Q3 z) | **사용자가 BotFather 에서 토큰 revoke** · 봇은 둔다(C-12) | 했다 예/아니오 | — | 새 토큰 발급·기입(**중간**) |

### S0 — 혼자 도는 읽기 전용 스크립트

`release-inplace.sh`·양식에 의존하지 않는다(A3 삭제 · 호출도 파싱도 없음). 서버 체크아웃의 `deploy/discord-switch.cjs state`·`discord-switch.sh check --no-send` 는 R1 태그에 있고, 나머지는 스크립트 안에서 직접 읽는다.

**봇 수.** `pm2 jlist` 를 스크립트 안에서 파이프로 파싱(앞 경고 줄 처리 `release-inplace.sh:80-81` 과 같은 방법 · 이름·pid·경로 비출력)해 두 수만 낸다.
- **경로 수:** online 이고 `pm_exec_path` 끝이 `dist/bot/standalone.cjs` 인 수 — 앱을 가리지 않는다. 옛 서비스 봇도 같은 끝이라 걸린다.
- **이름 수:** online 인 `pleiades-fin-bot`·`pleiades-fit-bot` 수.

**기대 2 의 근거:** 봇 정의가 앱마다 하나이고(`pleiades.config.cjs:76,97`) 두 앱이 돈다. 같은 pm2 데몬만 본다 — 다른 데몬·pm2 밖·다른 머신은 나오지 않는다(§3-3).

| 경로 수 · 이름 수 | 뜻 | 처리 |
|---|---|---|
| 2 · 2 | 기대대로 | R2 진행 |
| 3 이상 · 2 | 이름이 다른 봇이 남아 있다(옛 서비스 등) | **R2 보류** · 사용자가 서버에서 이름을 보고 처리 뒤 재실행 — 이중 수신 자체가 R2 와 무관한 문제다 |
| 0 또는 1 · 2 | 경로 끝 모양이 예상과 다르다(미측정) | 경로 수 판정 무효로 적고 이름 수로 진행 — 서비스 문제 아님 |
| 어느 값 · 이름 2 아님 | 봇이 내려가 있거나 이름이 다르다 | **R2 보류** · 서비스 확인 먼저 |
| 파싱 실패 | 판정 불가 | 재실행 · 계속 실패면 사용자가 `pm2 list` 로 직접 판단 |

**이 확인은 사람 판정이다.** 배포 게이트가 아니고 R2 뒤에는 돌리지 않는다.

**S2 근거.**
- R2 코드는 그 키를 읽지 않아 기능상 재시작 불필요. 단 토큰은 도는 프로세스의 `process.env` 에 **다음 재시작까지 남는다**. revoke 뒤에는 그 값도 무효다.
- 토큰과 `TELEGRAM_POLLING` 을 따로 지우지 않는다(§5-3).
- 상태 파일 `logs/telegram-polling-*.json` 은 둔다. `logs/identify-*.json` 은 **지우지 않는다**(R5).
- **사본:** `.bak` 은 있다고 보고, 옛 서비스 체크아웃(fin 새 `.env` 의 원본 · T-8 전)·`/backup` 은 미측정이다. **revoke 가 값을 무효로 만들어 전수 삭제가 필요 없다** — `.bak` 은 개수만 양식에 남기고 지우지 않는다.

### 되돌리기 바닥

| 상태 | 대상 | 결과 | 등급 · 행위 |
|---|---|---|---|
| 릴리즈 전 | — | PR revert(역순 · B7 뒤 충돌 가능) | **즉시 ~ 중간** |
| R1 뒤 | `v1.5.4` | 그대로 | **중간** |
| R2 뒤 · 토큰 있음 | R1 | 텔레그램 코드 복귀 · 폴링 off 유지 · 그 태그 스크립트 사용 가능 | **중간** |
| R2 뒤 · 토큰 삭제 | R1 또는 `v1.5.4` | Discord 그대로 · 텔레그램 수신자 0 | **중간** |
| 더 아래 | 기동 하한 `v1.2.0` | fit 수신 < `v1.3.0` · fin 수신 < `v1.5.0` · `v1.5.3` 미만은 쓰기 도구 기본값 복귀 | **실사용 하한 `v1.5.3`** |
| 텔레그램 복귀 | R1 + **새 토큰**·chat ID·폴링 + `discord-switch off` | 가능(C-12) | **높음** |
| `NOTIFY_*` 를 지웠다 | **R2 미만 전부(R1 포함)** | 내려간 순간 알림 조용히 0(R12) | 줄 복구 **즉시** — 그래서 지우지 않는다 |
| 운영 DB | D-5 코드 쓰기 0(S-8) · Q5 시험 행은 앱에서 삭제 | | 해당 없음 |

**편도 없음.**

---

## 7. 수용 기준과 잔여 정의 (5-1 재정의 · Q4)

**판정:** 8절 전 행 · 잔여 고정 테스트 · S0·S1·S2 양식.

**잔여 고정 테스트(B8 · `tools/local/test_residual.py` · 표준 라이브러리 · 8절 `tools/` 행이 돈다):** `git grep --text -il -E 'telegram|grammy|텔레그램'` 의 각 파일이 ① 경로 허용 또는 ② **줄 허용**(그 파일의 일치 줄이 전부 패턴에 맞음)이어야 통과. 되돌리기: 삭제 **즉시**.

| 분류 | 허용 | 방식 | 근거 |
|---|---|---|---|
| 이력 | `_workspace/**` · `docs/specs/**` · `docs/research/**` · `docs/handoff/**` · `docs/artifacts/**` · `CLAUDE.md` · `README.md` · `apps/*/docs/**` | 경로 | N12 |
| 일회 런북 | `docs/runbooks/007-t2`·`t4`·`t5`·`t9`·`t10` · 머리에 소진 블록 · t10 `off` 에 "R2 뒤 실행 금지" | 경로 | M10 |
| 셸 정리 목록 | `deploy/release-inplace.sh` — 줄 `PLEIADES_KEYS=` · `docs/runbooks/release-inplace.md` — `KEYS` 줄 | 줄 | 5-2 |
| DB 컬럼 — 코드 | `apps/fitness/**` 의 `telegramMessageId|telegramChatId` 줄(`auto-adjust-cron.ts:102-103` · `auto-adjust.ts:419-420` · `notifier.ts` 주석 · `notifier.test.ts:17,367,373,390,396,420,441,463`) · **그 줄에 다른 낱말이 있으면 실패**(`:377,378` 은 B2 에서 재작성) | 줄 | S-8 |
| DB 스키마 | 두 `schema.prisma` · fit 마이그레이션 `20260716054043` | 경로 | S-8 |
| R11 설명 | `packages/notify/src/discord-md.ts`(`:2,5,10,161,189`) · `apps/finance/src/app/alerts/history/client-utils.ts` — 옛 본문이 왜 HTML 인지 설명 · 동작·문구 무변경 | 경로 | 5-4 |
| 금지어 테스트 | `packages/chat/src/contract.test.ts` · `apps/finance/src/lib/ai/__tests__/system-prompt.test.ts` · `tools/local/test_residual.py` 자신 — 경로 · `deploy/test_release_inplace.py:177` `assertNotIn("텔레그램", …)` — 줄 | 경로·줄 | M1 |
| 룰 이력 | `.claude/rules/isolation.md` · `.claude/agents/dual-repo-operator.md` · `.claude/skills/dual-repo-change/SKILL.md` | 경로 | N12 |
| 앱 하네스 잔여(Q4 a) | `apps/finance/.claude/agents/release-manager.md` · `skills/codex-response-patterns/SKILL.md` · `skills/milestone-workflow/SKILL.md` · `skills/release-publisher/SKILL.md` · `apps/finance/README.md` | 경로 | M11 |
| **0** | 위 밖 전부 — 명시: `apps/*/src`·`scripts` · `packages/*/src` · `packages/notify/README.md` · `deploy/*` · `tools/**` · `package.json`·lock · `.env.example` 전부 · `deploy/env/*` · `tools/local/env/*` · `ai-model-upgrade.md` · **`apps/finance/CLAUDE.md` · `apps/finance/.claude/rules/workflow.md`** | — | 5-1 · Q4 a |

**앱 문서(Q4 a · B7):** `apps/finance/CLAUDE.md:20,54,75,87` · `.claude/rules/workflow.md:87` — AI 가 읽는 거짓 문구만 고친다(`:87` 은 "long polling" 만 있어 낱말 패턴에 안 걸리지만 고친다). AI 입력 변경이므로 S1 fin 대표 질의 1.

**옛 배포(Q4 · B7):** `apps/*/deploy/deploy.sh` · `apps/*/.github/workflows/deploy.yml` · `apps/*/ecosystem.config.js` **6 파일 삭제.** `nginx/*.conf` · `ci.yml` · `security-audit.yml` 은 건드리지 않는다. 훅 금지는 그대로 둔다. 되돌리기 revert **즉시**.

### 7-1. DB 주석 · R11 (X9)

`schema.prisma:406` 주석을 "Discord 메시지 id·별칭도 저장 · 읽는 곳 없음(S-8)" 으로 · fin `:332,428` 도. `//` 주석은 마이그레이션을 만들지 않는다. `@map` 안 씀(S-8). 되돌리기 **즉시**.

**R11:** `discord-md.ts` 경로 · `redispatchAlert` 무변경. `alert-dispatcher.test.ts`·`retry/__tests__/route.test.ts` 에 옛 HTML 재발송 → Discord 마크다운 케이스가 없다 → **B4 필수 추가**.

---

## 8. 확정된 답 (사용자 2026-11-03 · 정본 `00_user_answers.md`)

| # | 질문 | 답 | 여파 | 되돌리기 |
|---|---|---|---|---|
| Q1 | R1 언제 | **b** — 11-05 오전 관찰이 끝난 뒤 | A1·A2·A4 는 그 전에 머지 가능 · 발행만 뒤 | 문구 **즉시** |
| Q2 | 409 자리 | **대체 없음(O0)** | A3 삭제 · 양식 추가 없음 · S0 봇 수 1회 · 두 세션 실측 없음 · 다시 열 곳 #250 | 문구 **즉시** |
| Q3 | 토큰 | **b + z** — 정기 크론 한 바퀴 정상 확인 뒤 `TELEGRAM_*` 삭제 · 사용자 revoke | S2 · `.bak` 개수만 | 새 토큰 **중간** |
| Q4 | 잔여 정의 | **§7 분류 · a · 6 파일** | §7 · B7 · S1 질의 1 | 문구 **즉시** · 파일 revert **즉시** |
| Q5 | fit 미검증 | **a** — R2 전 편집 대기 · 사진 · `food:` 사용자 1회 · `auto_adjust` 이월 | A4 로컬 실측이 전송·클릭 확인 | 앱 삭제 |

코드로 정한 것: 개명 · 스크립트 처분 · 릴리즈 2회 · 대조표 · 테스트 위치.

**사용자 작업:** A1 웹훅 정체 확인·허용 목록 값 · A4 로컬 실측 승인 · Q5 시험 · S0·S1·S2·revoke · 릴리즈 PR 머지.

---

## 9. 009 정본 정정

009 §6·§7 정정 블록으로 반영했다(2026-11-03 · 이 설계와 함께). 대상: X5 · X6 · X7 · X8 · X4 · X9 · X10 · X11 · X12 · X13 · §7 409 행 · 5-1 · R15·R16. `measured-facts.md` 는 B8([S] + [A] + [A2] 대장).

---

## 10. 제외 · 별건

| 제외 | 다시 열 조건 |
|---|---|
| 이력 문서 수정 | 없음 |
| **이중 세션 관측 장치(표시줄 · 플랫폼 수 대조 · 프로세스 게이트)** | 실제로 생기면 #250 |
| 두 세션 실측(U-2) | 위와 같음 |
| 슬래시(C-6) · #421 · #437 · S-7 · #333 · #137 · #96 · #157 · #373 · chat·notify 버튼 통합 · fit `--smoke` | 각 이슈 · #437 은 동결 전 또는 hotfix |
| 봇 삭제 | C-12 |
| DB 컬럼 개명 | 읽기 경로가 생길 때 |
| `.claude/**` 통째 정리 · 나머지 스킬 언급 | 앱 하네스 정리 이슈 |
| 옛 `nginx`·`ci.yml`·`security-audit.yml` | 별도 정리 |
| `auto_adjust` 운영 1회 | #387 이월 |

---

## 11. 위험

| # | 위험 | 대응 |
|---|---|---|
| W1 | 스위치 미설정 라우트 이동 | S0 |
| W2 | 로컬 앱이 운영 웹훅 발송 — 지금도 있는 틈 | A1 · 사용자 확인 |
| W3 | **같은 봇 두 개가 조용히 돈다 · 쓰기 명령 두 번 실행 가능** — 자동 판정 없음(사용자가 받아들임) | 서버 이름 기준 교체 · 로컬 `check_env`(`run.sh` 경유) · R2 직전 S0 1회 · 생기면 #250 |
| W4 | 동결 중 긴급 릴리즈 · 백포트 충돌 | hotfix |
| W5 | 삭제 테스트만 덮던 분기 소실 | 대조표 |
| W6 | fin CI 회귀(#355) | 비필수 체크 포함 · `.env` 없는 조건 |
| W7 | 타입 전용 import 잔존 → `--external` 제거 뒤 빌드 실패 | typecheck + 빌드 · 서버면 재기동 전 rc 4 |
| W8 | fin 앱 문서 변경이 AI 답을 바꾼다 | S1 질의 1 · 1회 표본 한계 |
| W9 | `deploy` 테스트는 CI 밖 — 깨진 채 초록 | 각 PR 로컬 실행 · 본문에 결과 |
| W10 | S0 폴링 off 가 틀리면 R2 가 직전 태그 409 게이트에서 rc 4 | S0 "아니오" 면 R2 안 냄(§5-3) |

---

## 12. 스코프 축소안 — 쓰지 않음

재감사 정정이 전부 문안이라 발동 조건에 닿지 않았고 사용자 결정에도 없다. A3 삭제로 R2 판정 변경도 줄었다. 내용은 `02_writer_d5_r3.md` §12 에 남는다.

---

## 13. 유효기간

**다시 연다:** S0 "아니오" · B 묶음 전 `apps/*`·`deploy/` 릴리즈로 줄 번호가 밀렸을 때(PR 착수 직전 재측정) · 마이그레이션 릴리즈가 R2 전에 들어올 때 · C-12 변경 · 같은 봇 두 개가 실제로 생겼을 때(#250) · D-5 완료로 소진.
