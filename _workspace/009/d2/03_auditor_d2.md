# 009 D-2 설계 초안 1회차 — 반증 감사

감사 2026-10-28 · 대상 `_workspace/009/d2/02_writer_d2.md`(초안 1회차) · 근거 = 저장소 코드 직접 읽기(실행·기동·네트워크·git 쓰기 0)
**요약: 정정 4 · 경미 6 · 확인 9 · 블로커 0** — 정정 4건은 전부 문안·설계 서술 수정으로 풀린다(구조 재설계 불필요). 규칙상 정정이 있으므로 문서는 **초안으로 돌아간다(2회차 필요)**.
**가장 무거운 것:** [A]#1(F1 강등이 지속되지 않으면 세션이 다시 IDENTIFY 할 때 4014 치명으로 버튼까지 끊긴다) · [A]#3(버튼을 대기열 밖에 두면 편집 pending 이 긴 AI 뒤에서 TTL 로 만료된다).

---

## 정정

### [A]#1 F1 — 강등 intents 가 "한 번만"이면 다음 새 세션에서 다시 4014 치명
- **주장(§4 F · F1):** "4014 로 닫히면 **한 번만** 그 intents 로 새 IDENTIFY … **강등 뒤 4014 는 지금처럼 치명**."
- **근거:** gateway 는 새 세션마다 `opts.intents` 로 IDENTIFY 한다(`packages/chat/src/gateway.ts:165-168`). 새 세션은 기동 때만 생기지 않는다 — `INVALID_SESSION`(op 9 · `d !== true` → `forgetSession` `:211-215`)·close 4007/4009(`:55,256`) 뒤 재접속이 다시 IDENTIFY 한다. 4014 는 허용되지 않은 intents 를 요청할 때만 난다. 그러므로 "강등 뒤 4014" 가 날 수 있는 경우는 **강등이 풀려 원래 intents 로 돌아간 경우뿐**이다. 문안대로("한 번만" + "강등 뒤 4014 는 치명") 구현하면, 강등 상태에서 Discord 가 세션을 무효화하는 첫 순간 원래 `MESSAGE_INTENTS` 로 IDENTIFY → 4014 → `stopped = true`(`:257-261`) → **`auto_adjust` 버튼까지 정지** — F1 이 막으려던 바로 그 결과다.
- **판정: 정정.**
- **고칠 문안:** F1 을 "4014 로 닫히면 **프로세스 수명 동안** intents 를 `fallbackIntents` 로 고정하고 새 IDENTIFY(보호 0-5 를 거친다) · 강등 상태의 이후 새 세션도 강등 intents 를 쓴다 · 강등 intents 로 받은 4014(= `fallbackIntents` 가 0 이 아닌 잘못된 설정)는 치명" 으로. 판정(T·§4 F)에 "강등 뒤 op 9(`d:false`) → 새 IDENTIFY 의 intents = fallback" 단위 테스트 1건을 더한다.

### [A]#2 F1·L-1 — fit 에는 ADMIN 라우트가 없다
- **주장(§4 F1 · §5 PR-3 · §8 L-1):** "앱이 그 콜백으로 **ADMIN** 1회 알림" · L-1 판정 "**ADMIN 알림 1**".
- **근거:** fit notifier 는 `ALLOWED` 만 매핑한다 — `apps/fitness/src/bot/notifications/notifier.ts:4`("fit 은 ADMIN 미매핑 — 003 §4-2 Q25 하위 A") · `:86`·`:99` `targets: { ALLOWED: … }`. 같은 성격의 IDENTIFY 차단 알림도 `Route.ALLOWED` 로 보낸다(`discord-interactions.ts:76`). `Route.ADMIN` 으로 보내면 수신자 0(`sent=0`) — 알림이 조용히 사라진다.
- **판정: 정정.**
- **고칠 문안:** "앱이 그 콜백으로 `notifierFor(notifyBot).notify(Route.ALLOWED, …)` 1회(IDENTIFY 차단 알림 `discord-interactions.ts:71-79` 과 같은 경로 · `sent=0` 이면 경고 줄)" · L-1 판정 "ALLOWED 알림 1(로컬 = 검증 채팅/검증 웹훅)".

### [A]#3 Q3 — "버튼은 대기열에 넣지 않는다" 의 근거가 틀렸고, 그 결과 텔레그램에 없던 경합이 생긴다
- **주장(§4 Q · Q3):** 버튼을 대기열에 넣지 않는 이유 = "type 6 응답이 3 초 안이어야 한다 L22 — 지금처럼 즉시 ack 후 핸들러".
- **근거:**
  1. 3 초 한도는 **ack** 에만 걸린다. chat 은 이미 핸들러 **앞에서** ack 한다(`packages/chat/src/chat.ts:140` → `:158`). ack 를 즉시 하고 **핸들러만** 채널 대기열에 넣어도 3 초 한도와 무관하다. 대기 뒤 편집에 쓰는 인터랙션 토큰은 15 분(L22)으로, 최악 AI 540 s(N22)보다 길다.
  2. 텔레그램(grammY)은 콜백도 메시지와 **같은 순차 루프**에서 처리한다(M17 · `bot.js:188-193` — 업데이트 종류를 가리지 않는다). 그래서 "kcal 수정" 버튼은 진행 중인 AI 가 끝난 **뒤에** pending 을 건다.
  3. Q3 대로면 버튼 핸들러가 즉시 `armPendingEdit` 한다(`apps/fitness/src/bot/commands/food-edit-callback.ts:283-290`). 그 뒤 사용자가 친 숫자는 같은 채널의 AI(최대 540 s) 뒤에서 기다리고, pending TTL 은 5 분(N6 · `food-edit-state.ts`)이다 → **입력을 처리할 때 pending 이 이미 만료** → 숫자가 식단·AI 분기로 넘어간다(N2 순서). 이것은 2-1("자유 텍스트 4 분기 그대로")·R10 이 막으려는 의미 변화다. `food:` 삭제·취소 버튼과 같은 채널 편집 입력의 동시 실행도 텔레그램에는 없던 경합이다.
- **판정: 정정.**
- **고칠 문안:** Q3 = "메시지와 **버튼 핸들러**를 같은 채널 대기열로 직렬 처리 · 버튼 **ack(type 6)는 대기열 밖에서 즉시**(지금 `chat.ts:140` 그대로)". 잃는 것 칸에 "긴 AI 동안 **같은 채널의** 버튼 결과(안내·버튼 제거)가 늦게 보인다 — `auto_adjust` 는 알림 채널이라 대화 채널 대기열과 무관" 을 적는다. 판정에 "버튼 ack 는 대기열이 막혀도 즉시 · 버튼 핸들러는 같은 채널의 앞 메시지 뒤" 단위 테스트를 더한다. 버튼을 대기열 밖에 두는 안을 남기려면 pending TTL 경합을 위험 칸에 명시하고 그 대응(예: TTL 을 입력 수신 시각 기준으로 판정)을 적는다.

### [A]#4 §5 `--draft` 미사용 근거 — 정본에 반대 문안이 있는데 인용하지 않았다
- **주장(§5 · §9 UQ-2):** "2-4 는 '서버 조치가 **필요하면** draft' · Kb1 은 릴리즈가 서버 조치를 요구하지 않게 만든다" → 일반 Release · 서버 조치 "없음".
- **근거:** 정본 `docs/specs/009-discord-only.md:234`(D-1 확정 블록) — "D-1 은 intents 0(버튼만) 옵션 · **포털 토글은 D-2(2-4 `--draft`)**". 정본 2-4 의 괄호도 "서버 조치(**포털 토글 · 채널 · 설정**)" 를 D-2 의 서버 조치로 열거한다(`:218`). 초안의 해석은 문언상 성립한다 — `workflow.md` #242 블록도 "마이그레이션 없는 서버 조치가 **필요한** 릴리즈" 만 draft 로 보낸다. 다만 정본이 D-2 를 draft 릴리즈로 **예상했다**는 기록(`:234`)과 어긋나므로, 이것은 "수단" 선택이 아니라 **요구사항 해석의 변경**에 가깝다(§9-2: 요구사항을 바꿀 때만 사용자).
- **판정: 정정(문안).** 결론(일반 Release · minor)을 뒤집는 것은 아니다.
- **고칠 문안:** §5 "`--draft` 를 쓰지 않는 근거" 에 "정본 `:234` 은 D-2 를 `--draft` 로 예상했다 — 이 초안은 켜기를 릴리즈 밖 단계로 떼어 그 전제를 바꾼다" 를 적고, UQ-2 를 "**정본 `:234`·2-4 괄호와 다른 해석** — 사용자 확인 필요(§9-2)" 로 올린다. 우선은 "중간 — PR-3 전" 유지 가능. 정본 발행 때 `:234` 에 정정 블록이 필요하다는 것도 §10 에 적는다.

---

## 경미

### [A]#5 R3 — 기존 chat 테스트·D-0 계약 영향을 작게 적었다
- **주장(R3):** "잃는 것: 기존 `today`≡`/today` 테스트 갱신" · "`optional` 은 fin 의 접두 없는 한글 명령(L2 '둘 다 17')처럼".
- **근거:** `packages/chat/src/units.test.ts` 에서 접두 없는 `command` 매칭에 기대는 것이 **3건**이다 — `:80-87`(`'잔고'`) · `:88-99`(`command('체중')` 에 `'체중'` → `cmd`) · `:110-115`(`command('a')` 에 `'a'` → true). D-0 계약 문구도 바뀐다 — `router.ts:4`("앞 `/` 는 있어도 없어도"). fin 의 한글 명령은 grammY 에서 **`hears` 정규식**이다(`apps/finance/src/bot/commands/*.ts` — 예: `analysis.ts:115` `/^분석(?:\s+.*)?$/`). "둘 다 17" 은 `/analysis` + `분석` 처럼 **이름이 다른 두 진입**이라, 같은 이름에 `/` 선택이 필요한 사례가 아니다.
- **판정: 경미.** 소비자 0(W1 확인)이라 기본값 변경은 여전히 싸다.
- **고칠 문안:** "잃는 것: units 테스트 3건(`:80-87` · `:88-99` · `:110-115`) 갱신 · `router.ts:4` 계약 주석 개정" · `optional` 예시를 "한글 이름 명령을 `command()` 로 등록할 때(fin 은 지금 `hears` — D-3 에서 정한다)" 로.

### [A]#6 Kb1 "재시작 없이 다음 메시지부터" — 프로세스 env 에 키가 없을 때만
- **주장(Kb1 · W2·W3):** 줄을 비우면 다음 메시지부터 무시.
- **근거:** 기전은 맞다(아래 [A]#C1). 단 `platformEnv` 는 **프로세스 env 가 이긴다**(`packages/notify/src/platform-env.ts:145-150`). 서버에서 셸 env 정리는 `release-inplace.sh:229-240`(C1 · `--update-env` 전)에만 있고, `discord-switch.sh` 는 `pm2 restart`(저장된 env · `:83`·`:100`)를 쓴다. 키가 한 번이라도 pm2 저장 env 에 실리면 파일을 비워도 꺼지지 않는다.
- **판정: 경미.**
- **고칠 문안:** 켜기/끄기 스크립트(`discord-inbound.sh`) 판정 양식에 "도는 `pleiades-fit-bot` 의 pm2 env 에 `DISCORD_CHANNEL_ID_FITNESS_CHAT` 없음"(값은 내지 않는다 · `discord-switch.sh:83-92` `env_same` 와 같은 방식) 1줄을 더한다.

### [A]#7 Ka3 — "허용 채널의 낯선 사용자 기록" 도 메시지 목록 기준이어야 한다
- **근거:** `chat.ts:103` 은 `channelAllowed(channelId, opts.allowedChannelIds)` 로 경고를 가른다. `messageChannelIds` 를 더해도 이 줄이 `allowedChannelIds` 를 계속 쓰면, `MESSAGE_INTENTS` 로 받게 된 **알림 채널의 다른 멤버 메시지마다 경고 줄**이 찍힌다(처리는 안 되지만 로그 노이즈 · 사용자 ID 기록).
- **판정: 경미.** **고칠 문안:** Ka3 에 "메시지 경로의 `isAllowed` 와 `channelAllowed`(`:102-103`) 둘 다 `messageChannelIds` · 버튼 경로(`:135`)만 `allowedChannelIds`" 를 명시.

### [A]#8 되돌리기 등급 — "즉시" 는 릴리즈 전에만
- **근거:** Q3 "옵션 끔(즉시)" · R3·Ka3·F1 "옵션 삭제(즉시)" · PR-2·PR-3 "revert(즉시)" 는 코드 변경이다 — 실행 중 끄는 스위치가 아니다. `dev` 에 머지된 뒤 **어느 릴리즈든 실려 가면**(PR-2 는 텔레그램 코드 경로를 옮긴다) 되돌리기는 revert + 재배포 = 정본 D-2 행의 "코드 R-8(**중간**)"(`009:218`). 초안 §5 D-2 릴리즈 행은 "R-8 → 직전 태그(즉시~중간)" 로 정본과 다르다. PR-1 은 "실려 가도 무해" 를 적었으나 PR-2 는 적지 않았다.
- **판정: 경미.** **고칠 문안:** 옵션 행의 등급에 "(릴리즈 전 · 배포 뒤는 R-8 **중간**)" · D-2 릴리즈 행 = "**중간**(정본 D-2 행)" · PR-2 행에 "다음 릴리즈(무엇이든)에 실려 가면 텔레그램 경로가 바뀐다 — PR-2 머지 뒤 D-2 릴리즈 전 다른 릴리즈를 낼 때 그 노트에 적는다".

### [A]#9 N7 "참조 68" 은 줄 수다
- **근거:** 측정 명령이 `grep -c`(줄 수 · `01_surveyor_fit.md` M8). 실측 — 일치 줄 68 · 출현 72(`grep -o … | wc -l`) · 그중 정의 2줄(`verify-food-edit-pending.ts:32-33`). W7("68 참조는 이름으로")의 결론(값 정의는 2줄 · 리터럴 `1001`·`2002` 은 정의 밖에 없음)은 **확인**.
- **판정: 경미.** **고칠 문안:** N7 = "참조 줄 68(`grep -c` · 정의 2줄 포함)".

### [A]#10 Δ1 — "명령이 편집 대기 입력보다 앞" 은 텔레그램도 같다
- **근거:** fit 텔레그램도 명령을 pending 보다 먼저 처리한다 — 의도된 동작(`apps/fitness/src/bot/index.ts:66-68` "#350: 명령은 편집 pending 보다 우선. pending 중에도 명령이 정상 동작해야 한다"). 차이는 순서가 아니라 **접두 없는 첫 단어 매칭**뿐이다(N24).
- **판정: 경미.** **고칠 문안:** Δ1 둘째 문장을 "등록 순서(명령 → … → fallback)는 텔레그램(#350)과 같다 — 문제는 접두 없는 첫 단어 매칭이 편집 입력 `run 후 바나나` 까지 명령으로 잡는 것" 으로. 부수: 사진 핸들러의 4096 절단(`food-photo.ts` `TELEGRAM_MAX_MESSAGE`)은 H2 판단 함수로 옮기지 않는다(Discord 는 chat 분할 N21) · Discord typing 은 약 10 s 지속이라 20~40 s Vision 동안 반복이 필요하다 — C 행에 한 줄씩.

---

## 확인

| # | 주장 | 근거 | 판정 |
|---|---|---|---|
| **C1** | **재시작 없이 반영(W2·W3)** — 허용 채널을 함수로 넘기면 메시지·버튼마다 `platformEnv` 를 부르고, 파일은 수정 시각이 바뀌면 다음 호출부터 반영 | `isAllowed` 가 매 호출 `users()`·`channels()` 실행(`packages/chat/src/auth.ts:12-14`) · fit 이 함수로 넘김(`apps/fitness/src/bot/notifications/discord-interactions.ts:67-68` — 초안의 경로 `discord-interactions.ts` 는 `notifications/` 아래) · `loadFile` 이 mtime 비교(`platform-env.ts:121-142`) · **서버**: `PLEIADES_ENV_FILE` 명시 경로는 캐시 없이 매번 그 값(`:76-78`) → 같은 mtime 경로 · `release-inplace.sh:229-230` 이 `$HOME/pleiades-platform.env` 로 고정 · 앱 `.env`(dotenv `standalone.ts:1`)에는 플랫폼 키가 없다(W5 · `check_env.py:252`). 단서 = [A]#6 | 확인 |
| **C2** | **4014 강등과 `discord-switch.sh` 판정(W12)** — 강등 줄이 `gateway 종료 코드` 를 포함하지 않으면 스위치가 실패하지 않는다 | 판정은 `준비 완료` 를 재시작 뒤에 ≥1 · `종료 코드` 0 · 미설정 2문구 0(`discord-switch.sh:116,125-129`). 4014 는 IDENTIFY 직후 READY 전에 닫히므로 첫 시도에서 `준비 완료` 는 찍히지 않고, 강등 IDENTIFY 의 READY 에서 **한 번** 찍힌다(`gateway.ts:217-222`) → 준비 1 · 종료 0 → 통과. 새 기동 로그(`메시지 수신 켜짐/꺼짐`)도 미설정 grep(`봇 토큰·채널 미설정|DISCORD_ALLOWED_USER_IDS 비어 있음`)과 겹치지 않는다. 그래서 아웃바운드 스위치는 강등을 숨긴다 — 초안이 켜기 스크립트에서 강등 줄을 "켜기 실패" 로 세는 것(§4 F · §5)이 맞다. 오히려 **F0 이면 강등 대신 `종료 코드` 가 찍혀 `discord-switch on` 이 자동 off(텔레그램 복귀)한다**(L16′) — F1 채택 근거가 하나 더 있다 | 확인 |
| **C3** | **IDENTIFY 보호(0-5)에 강등이 +1** | guard 는 IDENTIFY 직전마다 `check()`(`chat.ts:166-177` · `gateway.ts:147-156`) — 4014 로 끝난 시도도 이미 기록된다 → 강등 기동 = IDENTIFY 2. 임계 100/24 h(N23) · 프로세스는 죽지 않으므로 루프 없음 | 확인 |
| **C4** | **선택 키 이름** `DISCORD_CHANNEL_ID_FITNESS_CHAT` | `PLATFORM_KEY_RE` `DISCORD_CHANNEL_ID_[A-Z0-9_]+`(`platform-env.ts:27-28`) 일치 · `check_env.py:43-46` 사본 일치 · `CHAT_KEY` `CHAT_IDS?$|CHAT_ID_`(`check_env.py:37`) 불일치(끝이 `_CHAT`) · `PLEIADES_KEYS` `DISCORD_[A-Z_]*`(`release-inplace.sh:20`) 일치 → 셸 정리 대상 · `discord-switch.cjs` 는 `REQUIRED`(`:19`)만 검사하고 `set` 은 스위치 4줄만 쓴다(`:15`) · `BOTS` 키(`:17`)와 다른 이름 · 서버 앱 템플릿 테스트(`test_deploy.py:850-855`)와 무관(루트 파일) | 확인 |
| **C5** | **minor · 서버 조치 없음(#199)** | 선택 키 → major 조건(필수 키 추가·개명 · 포트 · 상태 경로 구조) 아님 · 마이그레이션 0 · chat 설치는 D-1 에서 태그에 실려 감. 해석 논점은 [A]#4 | 확인 |
| **C6** | **키가 비면 D-1 과 같다** | 비면 intents 0 → MESSAGE_CREATE 미수신 · 버튼 허용 `[알림, 대화(빈)]` 은 `norm` 이 빈 문자열을 버려(`auth.ts:10`) `[알림]` 과 같다 · 버튼 라우터를 접두별로 바꿔도 `auto_adjust:` 결과는 같고 마지막 `action(/^/)` 이 알 수 없는 접두 안내를 유지 · 차이는 새 기동 로그 1줄뿐 | 확인 |
| **C7** | **W1 소비자 0 · W4 같은 허용 목록 · W5·W6·W8~W13 위치** | `git grep` — 두 앱 모두 `createRouter().action(/^/…)`(fin `:49` · fit `:47`) · `command/hears/attachment/fallback` 은 chat 소비자 0(앱의 `bot.command` 는 grammY) · `chat.ts:102,135` · `test_deploy.py:850-855` · `discord-switch.cjs:15,23` · `index.ts:90` · `standalone.ts:42-49` · `estimate-nutrition-photo.ts:12,27,93,117` · `report.ts:25` `msg.slice(0, 200)` · `ai.ts:101-103` · `discord-switch.sh:125,129` · `chat.ts:85,179-181` | 확인 |
| **C8** | **S 상태 키 · AI 세션** | pending `Map<number, …>`(`food-edit-state.ts:44`) · 호출부의 숫자 가정은 `food-edit-callback.ts:271,313`(`typeof chatId !== "number"`) — PR-2 범위 · AI 세션은 프로세스 메모리 `Map<string, …>`(`session-store.ts:21`) · 채널 키는 `"telegram"` 2곳(`ai.ts:85,125`) → `"discord"` 추가는 새 키일 뿐 · 락은 모듈 1개 공유(`ai.ts:101-109`) | 확인 |
| **C9** | **P 사진** | 봇은 `.jpg` 고정·`message.date`·typing·ack 삭제(`food-photo.ts:101-131` · `finally` 의 `deleteMessage`) · 웹은 MIME → 확장자 · `0o600`+`wx` · `mfp-photo-` 접두(`app/api/food/route.ts:324-328`) · sweeper 접두 `mfp-photo-`(`photo-temp-cleanup.ts:16,40`) · chat 기본 정책 10 MiB+gif(`attachments.ts:17-20`) · download 가 형식·크기 검사 뒤 CDN 만(`:101-119`). 참고(info): 웹 food 경로는 MIME 을 믿고(`route.ts:324`) 검진 경로는 바이트로 판별한다(`checkups/extract/route.ts:10,45` `sniffImageType`) — Discord `content_type` 도 외부 값이라 판별 재사용을 P 의 대안 칸에 적어도 된다 | 확인 |

**대장 숫자:** N1~N6 · N8~N28 은 `01_surveyor_fit.md` 대장 M1~M30 과 값이 같다. 테스트 수 재계수 — chat 18+4+11+16+15 = 64(N18) · fit discord-interactions 7 · notifier 30 · error 17 · telegram 11 (+ telegram-polling 12 = 77 · N17). N7 만 [A]#9.

---

## 2회차에 반영할 것 (작성자용 체크리스트)

1. [A]#1 F1 강등 지속 + 테스트 1건
2. [A]#2 ADMIN → `Route.ALLOWED`(F1 · PR-3 · L-1)
3. [A]#3 Q3 버튼 핸들러를 채널 대기열에(ack 는 즉시) 또는 pending TTL 경합을 위험으로 명시
4. [A]#4 §5 · UQ-2 에 정본 `:234` 인용 · 요구사항 해석으로 격상
5. 경미 [A]#5~#10 문안
6. §11 정정 블록에 위 정정 4건을 1회차 문안과 함께 기록

재감사 범위(2회차): F1 문안 · Q3 문안 · §5/UQ-2 · 켜기 스크립트 판정 양식(pm2 env 줄 · 강등 줄) — 나머지 "확인" 항목은 대상 코드가 바뀌지 않으면 다시 보지 않는다.
