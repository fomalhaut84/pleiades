# 012 4b-3 초안 r1 감사 — 되돌리기·비용 반증

- 2026-11-13 · `reversibility-auditor` · 대상 `_workspace/239/4b3/02_writer_4b3.md`(r1) · 실측 `01_surveyor_4b3.md`(SV) · pleiades `dev` HEAD `48ccb68b03e6`
- 읽기 전용: 저장소 파일 정적 읽기 + 로컬 npx 캐시의 pm2 7.0.4 소스 읽기(실행 0). 서버 접근 0 · `repos/*`·원본 git 0 · 모델 호출 0.
- 판정: **확인** / **정정**(주장이 틀림) / **문안**(표현만) / **보충**(빠짐) / **미확인**.
- **결론: 정정 9 · 문안 4 · 보충 9 → 초안 r1 은 다시 초안이다.** 가장 무거운 것은 정정 1(U-1 (a) 를 고르면 모든 질문이 거부된다)과 정정 2(수집기 감시 조건이 `stop`·clone 직후를 장애로 낸다).

---

## 1. §8 질문 9개 판정

| # | 질문 | 판정 | 근거 |
|---|---|---|---|
| 1 | B1 거부가 release-inplace 와 같은 락 파일을 보장하나 · forced command 셸에서 `PLEIADES_PRIVATE_DIR` 이 비는 근거 | **미확인**(저장소 쪽은 확인) | 저장소 안에서 이 키를 **설정**하는 곳 0 — 읽는 곳만 6(`release-inplace.sh:173` · `discord-inbound.sh:228` · `collect.cjs:63` · `run-x1.sh:12` · `x1.cjs:69` · `private-dir.ts:11`). `ssh-deploy.sh:25-28` 은 nvm 과 `~/.local/bin` 만 올린다 · authorized_keys 줄은 `restrict`(`:5` — `~/.ssh/rc` 꺼짐). **서버 쪽은 못 잰다:** sshd `PermitUserEnvironment`(`~/.ssh/environment`) · bash 가 sshd 아래 비대화형으로 읽는 `~/.bashrc` 의 비대화형 가드 **앞** 줄 · `/etc/environment`(pam_env). 그래서 "같은 파일" 은 런타임에 확인하게 바꾼다 → 보충 3 |
| 2 | §5-2 정적 시험이 fd 상속을 다 덮나 · pm2 데몬이 이 스크립트에서 처음 뜰 때 | **정정**(시험 범위) · 데몬 첫 기동 자체는 **확인** | 데몬은 **pm2 CLI 를 띄운 프로세스의 fd 를 물려받는다** — CLI 에 `9>&-` 가 있으면 데몬은 fd 9 가 없다(`release-inplace.sh:32` 주석과 같은 원리). 그러나 §5-2 의 "`pm2 `·`npm `·`npx `·`node ` 로 **시작하는** 줄" 은 초안 자신의 C5(`cd apps/advisor` → `pm2 …`) 같은 `(cd … && pm2 …)` · `$(pm2 …)` · `… \| node` 꼴을 놓친다(선례 `deploy.sh:342-361` `at_app pm2` · `:113` `(cd … && pm2 jlist)`) → 정정 9. `npm ci`(prepare = `tsc`) · `npm run build`(esbuild CLI)는 상주 프로세스를 남기지 않는다(`package.json` scripts) — 데몬 경로 아님. `git fetch` 의 자동 유지보수 분리 실행은 **일시** 보유 가능 → 보충 8 |
| 3 | B7 예약 후 정산이 4b-2 사용액 파일·상한 판정과 충돌 없나 · 이중 계산 | **정정**(파일·API 주장) · 이중 계산 없음은 **조건부 확인** | `DailySpend.add` 는 `!(usd > 0)` 이면 쓰지 않는다(`spend.ts:63`) — **실제 비용으로 "고치는"(줄이는) 길이 지금 없다** → 새 메서드 필요(정정 6). 상한 판정은 질문 **전** `read()`(`bot.ts:81-82`)이고 예약은 그 뒤에 쓰므로 판정과 겹치지 않는다. 같은 프로세스 안 동시성: chat `handlerWatchdogMs` 기본 10분(`chat.ts:49-50,146`)을 넘으면 **다음 입력이 앞 질문을 기다리지 않고 시작**한다 — 그 질문은 `Advisor.ask` 가 busy 로 거부(`advisor.ts:121`)하지만 그 사이 예약·정산이 섞인다. 정산을 **차분(+실제−예약)** 으로 하면 동기 fs 연산이라 잃는 갱신이 없다 · **절대값 덮어쓰기면 앞 예약을 지운다** → 보충 5 |
| 4 | B8 `onFatalClose` 를 두 앱이 안 넘길 때 무변경 · fallback 순서 | **확인**(조건 2) | `gateway.ts:294-302` 강등 분기가 `FATAL_CLOSE`(`:303-308`)보다 먼저다 — fin·fit 은 `fallbackIntents: 0` 을 넘기므로(SV B-9 (d)) 첫 4014 는 강등 분기로 가고 FATAL 에 닿지 않는다. 4004·4010~4013 은 지금도 FATAL 이며 콜백이 없으면 로그 1줄 그대로. 조건: ① 콜백은 FATAL 분기 **안**, `notifyFallback`(`:172-179`)처럼 동기 예외·거부를 삼킨다 ② `chat.ts:43-46`(옵션 타입) · `:334-337`(gateway 로 전달) 두 곳을 함께 고친다. 단 "두 앱 무변경" 은 **동작**만 — 빌드 산출물은 바뀐다 → 정정 7 |
| 5 | B9 adv 조건이 fin·fit 판정을 안 바꾸나 · `deployWindow` 이름 규칙 | **정정** 2건 · 이름 규칙은 **확인** | 이름: `deployWindow` 는 `inplace-${app}-pending`·`-last-ok`(`collect.cjs:210-221`)라 스크립트가 `inplace-adv-*` 를 쓰면 맞는다. 그러나 ① **감시 조건(디렉터리 존재)** 이 `stop`·clone 직후를 `missing` 장애로 낸다(정정 2) ② `all-missing` 판정(`:149-153`)이 기대 목록 전체에 걸려 있어 adv 를 넣으면 **fin·fit 6개가 모두 없어도 adv 가 살아 있으면 all-missing 이 아니라 개별 missing 6건**으로 바뀐다(정정 3) |
| 6 | W2 resurrect 가 `--update-env` 로 준 env 를 복원하나 | **확인**(로컬 pm2 7.0.4 소스 · 서버 pm2 버전 미측정) | `pm2 dump` 는 프로세스마다 `pm2_env` 통째를 `dump.pm2` 에 쓴다(`lib/API.js:423-510` · `env_arr.push(apps[0].pm2_env)`) — `PLEIADES_ENV_FILE` 은 `pm2_env` 최상위에 있다(release-inplace 가 그 위치를 읽는다 `:90`). 두 앱도 같은 메커니즘에 기대므로 adv 가 새 위험을 만들지 않는다 → 문안 4 |
| 7 | B10 PATH 를 셸에서 바꿔 `--update-env` 로 주면 C1 `env_same` 에 영향 없나 | **확인** | `env_same` 은 `PLEIADES_ENV_FILE` 하나만 비교(`release-inplace.sh:90-91`) · `app_procs` 는 접두 `pleiades-<app>-` 만(`:100`) |
| 8 | `deploy/advisor/` 가 release-inplace A 단계 중단 조건에 걸리나 | **확인** | 중단은 마이그레이션(`:223`) · fin `mcp-config.json`(`:224`) 둘뿐. `deploy/` 전체 diff 는 `srv` 정보 숫자(`:219,222`)와 `files` 규모(`:221`)에만 들어간다. 테스트 쪽도 `deploy/` 하위 디렉터리를 전체 훑는 시험 없음(`grep -n "glob\|rglob\|listdir\|iterdir\|os.walk" deploy/test_*.py` — 전부 자기 임시 디렉터리) · 선례 `deploy/advisor-x1/`·`deploy/ops/` 가 이미 같은 꼴 |
| 9 | 구조 4파일 무변경 — `ssh-deploy.sh` 가 `deploy/` 를 통째로 다루나 | **확인** | `ssh-deploy.sh` 는 `$base/pleiades-$app/deploy/release-inplace.sh`(`:41`)와 `…/notify-deploy.cjs`(`:56`) 두 경로만 부른다 · 앱 목록 `fin fit` 고정(`:38`) |

### 1-1. 과제 2의 (a)~(h) 요약

| | 결과 |
|---|---|
| (a) 같은 락·env 규칙이면 fin·fit C1·C5 통과 | **확인** — adv 는 `env_same` 대상(접두 `pleiades-`)이지만 `app_procs`·C5 online 3 은 `pleiades-<app>-` 만 본다. 시작 패턴(`delete` → `start --update-env` → `save --force`)은 두 앱 봇과 같다(`deploy.sh:359-365`). 단 adv 스크립트 쪽 **사전 대조가 없어** 두 앱 쪽 문제로 adv 배포가 "바꾼 뒤" 실패한다 → 보충 2 |
| (b) fd 9 상속 | §1 질문 2 |
| (c) `probe` 모델 호출 0 · 락 쥔 채 실행 | **확인** — `makeAdvisor(env, err, false)` 는 claude 를 찾지 않고(`main.ts:23-28,50`) `prepareAll` 은 읽기 경로 HTTP 만(`advisor.ts:93-97` · `domains.ts:67-95`). `flock -n <file> true` 자식은 **새 open file description** 이라 스크립트가 쥔 락과 충돌 → `busy`(`deploy-lock.ts:17-23`) — 초안 W5 대로 정상. 부수 효과: `~/pleiades-private/advisor/`·`work/` 생성(`advisor.ts:78-80`) · `readPins` 불일치면 예외 → rc 1(`main.ts:98-101`) |
| (d) B7 ↔ `spend.ts`·`bot.ts` | 정정 5·6 · 보충 5·6 |
| (e) chat `onFatalClose` | §1 질문 4 · 정정 7 |
| (f) 수집기 adv 분기 | 정정 2·3 · 문안 2 |
| (g) 숨은 비용 | 정정 1(settings.ts 변경) · 보충 1·6·7 |
| (h) 대장 §0 | **D1~D16 전부 SV 와 일치**(줄 번호·값 대조). 012 [N10](7,894 · 12,513)과 SV(7,904 · 12,509)의 차이는 SV 가 이미 "원인 미확인" 으로 적었다 — 초안은 SV 값만 쓴다(일관) |

---

## 2. 정정 (주장이 코드와 어긋남 · 9)

### 정정 1 — U-1 (a) "분리" 를 고르면 **모든 질문이 설정 검사에서 거부된다** (B6 · §3)

- 주장: (a) 면 *"설정 검사가 빈 디렉터리를 본다"* · 되돌리기 *"env 한 줄 즉시"*.
- 코드: `settingsScopes` 는 CLI cwd(`<private>/advisor/work`)의 **모든 조상**의 `.claude/settings*.json` 을 `project(조상)` 범위로 읽고, **`claudeDir` 과 같은 위치만** 뺀다(`settings.ts:61-65`). B1 이 `PLEIADES_PRIVATE_DIR` 을 금지하므로 private 위치는 `~/pleiades-private` 로 고정되고 조상에 `~` 가 들어간다. (a) 로 `CLAUDE_CONFIG_DIR` 을 바꾸면 `~/.claude` 는 더 이상 `claudeDir` 이 아니므로 **`project(조상)` 행**이 되고, `project(조상)` 의 `enabledPlugins` 는 user 범위 예외(`:79-80`)를 받지 못해 **막는다** — 시험이 같은 규칙을 고정한다(`units.test.ts:39-51`). 서버 user settings 는 플러그인 켬이 있다(SV C · handoff 11-12).
- 실제 비용: (a) 는 "env 한 줄" 이 아니라 **`settings.ts` 변경 + 그 안전 근거**(CLI 가 `--setting-sources project` 에서 `~/.claude` 를 조상 project 로 읽는지 — 미측정 · 모델 호출 없이는 판정 불가)가 따르는 **코드 중간**이다. 그대로 넣으면 첫 질문부터 `MESSAGES.settings` 거부(fail-closed — 안전하지만 통합 층이 멈춘다).
- 제안: §3 표를 고쳐 다시 묻는다 — **(b) 공유 유지를 권고**로 바꾸거나, (a) 를 남기면 "**(a) = env + `settings.ts` 조상 행에서 `$HOME/.claude` 처리 변경(시험 포함) · 코드 중간 · 근거 미측정**" 으로 비용을 적는다. (b) 의 위험 줄(*"개발용 hooks 가 생기면 모든 질문 거부"*)은 그대로 맞다(`settings.ts:80` user 행의 `hooks`).

### 정정 2 — 수집기 감시 조건 "adv 디렉터리가 있으면" 이 정상 상태를 장애로 낸다 (B9 · §4 stop)

- 주장: *"`~/pleiades-adv/apps/advisor` 가 있을 때만 감시 · 없으면 판정 0"* · `stop` 은 *"last-ok 그대로"*.
- 코드: 감시 대상이면 `judgePm2` 가 프로세스 없음을 `missing` **장애**로 낸다(`collect.cjs:163-165`) · 생존 표지는 **파일이 있고 오래되면** `gateway [stale]` 장애(`:474-484`).
  - **clone 직후 · 첫 실행 전**(서버 조치 ①→④ 사이): 디렉터리 있음 · 프로세스 없음 → 5분마다 `adv · bot · pm2 missing`.
  - **`stop` 뒤**(초안이 "정지 = 즉시" 되돌리기로 내세우는 경로): 같은 `missing` + 남은 `alive-adv.json` 이 10분 뒤 `stale` — **정지할 때마다 장애 2건이 이어진다.**
- 제안: 감시 조건을 **"`$PRIVATE/inplace-adv-last-ok` 가 있고 `$PRIVATE/inplace-adv-stopped` 가 없다"** 로. `stop` 은 `-stopped` 표지를 쓰고 `apps/advisor/logs/alive-adv.json` 을 지운다(지우면 `ENOENT` = 정상 `:476-478`) · 배포 통과 때 `-stopped` 를 지운다. 수집기 시험에 "clone 만 · stop 뒤" 두 줄 추가. 되돌리기 그대로 **중간**(수집기 재설치).

### 정정 3 — adv 를 `APPS` 에 넣으면 fin·fit 의 `all-missing` 판정이 바뀐다 (B9 · §5 "fin·fit 기존 시험 무변경")

- 코드: `expected = Object.keys(APPS) × ROLES` 전체가 없을 때만 `ops · pm2 · all-missing`(`collect.cjs:149-153`). adv 가 살아 있고 fin·fit 6개가 모두 사라진 경우(데몬 재생성 · `pm2 delete all` 사고) 지금의 1건 대신 **개별 `missing` 6건**이 된다. 역할 집합을 앱별로 바꾸는 순간 이 식도 바뀐다.
- 제안: B9 에 "`all-missing` 은 fin·fit 기대 목록으로만 계산한다(adv 제외)" 를 명시하고 수집기 시험에 그 경우 1줄.

### 정정 4 — W1 "직접 `pm2 restart` → 셸 env 로 재기동" 은 틀렸다

- 코드·선례: 저장소가 이미 *"pm2 restart 는 저장된 env 를 그대로 쓴다"* 를 전제로 쓴다(`discord-inbound.sh:92,112` — 그래서 그 스크립트는 `pm2 restart "$BOT"` 를 허용 문자열로 둔다). 셸 env 가 들어가는 길은 **`--update-env`**(restart·reload) · `pm2 start`·`startOrRestart` · `delete` 후 손 start 다.
- 제안: W1 을 "사용자가 **`--update-env`·`start`·`startOrRestart`** 로 다른 셸에서 다시 띄우면 G-R1 밖" 으로 고치고, 런북 금지 문구도 "**스크립트 밖에서 `pm2 start`·`--update-env` 금지**(단순 `pm2 restart` 는 저장 env 그대로)" 로. 012 G-R1 의 *"직접 `pm2 restart` 금지"*(012:266)는 안전 쪽 과잉이라 그대로 둬도 되나, 근거 문장은 바꾼다.

### 정정 5 — B7 종료 신호 서술: pm2 는 **SIGINT 를 프로세스 트리 전체**에 보낸다

- 주장: *"SIGTERM: … 진행 중 자식 `claude` 에 SIGTERM → 최대 10초"*.
- 코드(로컬 npx 캐시 pm2 **7.0.4** · 서버 pm2 버전 미측정): 기본 종료 신호 `SIGINT`(`constants.js:105`) · `treekill` 기본 `true`(`lib/API/schema.json:327-331`) → `treekill(pid, KILL_SIGNAL)`(`lib/God/Methods.js:240-251`) — **자식 `claude` 도 같은 순간 SIGINT 를 받는다.** 앱은 SIGINT·SIGTERM 둘 다 받는다(`main.ts:72-73`). `kill_timeout` 기본은 1600 ms(`schema.json:156-159`)라 LONG_RUNNING 값(15000)을 반드시 정의에 넣어야 한다(초안은 넣었다 — 확인).
- 제안: B7 을 "**pm2 SIGINT(트리 전체) 수신** → 새 질문 거절 → 진행 중 질문은 자식이 이미 신호를 받았으므로 `runCli` close 를 **최대 10초** 기다림(자식이 안 끝나면 `runCli` 의 SIGKILL 경로) → 정산 → `process.exit`" 로. 서버 pm2 버전·`treekill` 실효는 런북 판정 줄(정지 때 `[advisor]` 정산 줄 1)로 확인.

### 정정 6 — B7 "사용액 파일 형식 변경 — 필드 추가만 · 4b-2 와 호환" 은 API 를 빠뜨렸다

- 코드: `add()` 는 0 이하를 쓰지 않는다(`spend.ts:63`) — 정산(예약 $1.00 → 실제 $0.12)은 **음수 차분**이라 지금 API 로 불가. 별도 `reserved` 필드로 두면 **되돌리기(4b-2 판으로 revert)** 시 옛 `read()` 가 그 필드를 무시해(`:44-45`) 남은 예약이 사라진다(과소 계산 쪽).
- 제안: 예약을 **`usd` 안에 더하고**(`usd += 1.00`) 정산은 `usd += (실제 − 1.00)` 차분 1회 — 파일 형식 무변경이라 revert 해도 과다 쪽만 남는다. 새 메서드 `reserve(date)`·`settle(date, delta)` + 시험(예약 → 정산 · 예약 상태 크래시 · 예약 쓰기 실패 → 질문 거부 · 자정 넘김 = `before.date`). 되돌리기 **중간** 그대로.

### 정정 7 — §6 4b-3a "소비자 0 — 띄우는 곳 없음" 은 chat 변경(B8)에 거짓이다

- 코드: fin·fit 봇 번들이 빌드 때 chat dist 를 인라인한다(`workflow.md` 8절 2026-10-28 정정 · `deploy.sh:296-302` 1단계 chat ci·tsc). `packages/chat` 을 바꾸면 **다음 Release 에서 두 앱이 그 판으로 재빌드·재기동**된다(동작 무변경이어도 배포 대상).
- 제안: B8 의 chat 부분을 **4b-3a 와 분리한 PR**(또는 4b-3a 행에 "chat = fin·fit 소비 · 동작 무변경 시험 · 두 앱 다음 릴리즈에 포함") · 되돌리기 "revert **중간**(두 앱 재배포를 부른다)" 로. 9-1 focus 에 fin·fit `discord-interactions.ts` 의 `createChat` 호출부.

### 정정 8 — B4·W4 "인증 실패 = 모델 호출 전 실패 → 사용액 0" 은 코드상 보장되지 않는다

- 코드: `costOf` 는 CLI 가 비용을 보고하지 않고 init 단계 실패가 아니면 **호출당 상한 $1.00** 으로 센다(`bot.ts:57-62`). 인증 실패가 stream-json 에서 init 줄 뒤 `result`(비용 0)로 오는지, 결과 없이 끝나는지는 **미측정**(모델·인증 호출 금지).
- 제안: "인증 키를 빠뜨리면 질문 실패 — 사용액 **0 또는 $1.00**(결과 줄에 비용이 없으면) · 5회면 그날 상한이 닫힌다(fail-closed)" · 런북 첫 질문 판정 줄에 `cost=` 확인을 넣는다.

### 정정 9 — §5-2 정적 시험의 "줄이 `pm2`/`npm`/`npx`/`node` 로 시작" 은 G-R3("모든 자식")을 덮지 못한다

- 근거: §1 질문 2. 012 G-R3 은 *"락을 쥔 동안 부르는 모든 자식(pm2 · npm · node)"*(012:268).
- 제안: ① 정적: 주석 밖 **모든 `\bpm2\b`·`\bnpm\b`·`\bnpx\b`·`\bnode\b` 토큰**이 `nolock` 인자이거나 같은 명령 단위에 `9>&-` 가 있는지(`$(…)` · `(cd … && …)` · 파이프 포함) ② 동적(더 강함): PATH 스텁 `pm2`·`npm`·`node` 가 `[ -e /dev/fd/9 ]` 이면 기록·실패 — macOS·Linux 둘 다 돈다. 가장 단순한 구조는 락 뒤 본문 전체를 `( … ) 9>&-` 하나로 감싸고 flock 보유는 바깥 셸만 하는 것.

---

## 3. 문안 (4)

1. **B6 (b) "기록이 개발용과 섞인다"** — CLI 세션 기록은 cwd 인코딩 폴더(`~/.claude/projects/<work 경로>`)에 따로 쌓인다(`private-dir.ts:4-5`). "같은 루트 아래에 있고 개발용 정리·동기화 대상과 같은 위치" 로.
2. **B9 "LOG_NAME 에 adv-bot"** — 통합 층은 경고·오류를 **stdout** 으로 쓴다(`bot.ts:138` logger → `deps.log` → `main.ts:58` out). 수집기는 web·bot `-out` 을 침묵 감지에만 쓰므로(`collect.cjs:425`) adv 의 4014 줄은 수집기 로그 분석에 안 잡히고, `-error` 는 처리 안 된 예외만 남긴다. "LOG_NAME 추가 = 크래시 stderr 만 · 4014 는 B8 알림과 `alive-adv` stale 이 맡는다" 로.
3. **012 §8 4b-3 행 "`collect.cjs` 역할 집합 분기 1"**(012:429) — 실제는 SV A-6 의 7곳 + 정정 2·3. 확정 블록에서 012 쪽 숫자를 정정한다.
4. **W2 "미측정 — 감사 확인 대상"** → "pm2 dump 는 `pm2_env` 통째를 저장한다(pm2 7.0.4 소스) · 두 앱과 같은 메커니즘 · 서버 pm2 버전 미측정".

---

## 4. 보충 (빠진 것 · 9)

1. **자기 교체 구조 + 첫 실행.** 스크립트가 자기 체크아웃을 `git checkout V` 로 바꾼다 — release-inplace 처럼 본문 전체를 함수에 두고 마지막 줄에서 `main` + `exit`(`release-inplace.sh:18-19,360`). 그리고 clone 직후 HEAD 는 태그가 아니라 기본 브랜치 `dev` 다 — release-inplace A 는 비태그 HEAD 를 거부한다(`:186`). adv 스크립트 A 에 "기록 없음 + 비태그 HEAD = 첫 실행" 분기(또는 런북의 `git checkout vX.Y.Z` 선행)를 적는다. 시험 1줄.
2. **C1 사전 대조.** 초안 C1 에는 `env_same` 이 없고 C6(바꾼 뒤)에만 있다. fin·fit 쪽이 이미 DIFF/MISSING 이면 adv 는 정상인데 **rc 4(바꾼 뒤)** 로 끝난다. release-inplace C1 과 같은 대조를 **C1(바꾸기 전 · rc 1)** 에 넣는다(`:242-248` 같은 식 · adv 자신이 없으면 그 줄만 빠진다).
3. **락 파일 동일성 런타임 확인(질문 1 미확인의 대체).** C1 에서 `$HOME/pleiades-private/inplace-fin-last-ok`·`inplace-fit-last-ok` 가 있는지 본다 — 있으면 Actions 배포가 같은 private 위치를 쓴다는 증거다. 없으면 rc 1("배포 기록이 다른 위치 — `PLEIADES_PRIVATE_DIR` 확인"). 비용: 스크립트 3줄 · 시험 1.
4. **태그 엇갈림.** 통합 층은 **자기 체크아웃의** `apps/*/domain.json`(쓰기 분류)·`models.ts`(모델 핀)를 읽는다(`domains.ts:51-52` · `cli.ts:29-31`). adv 태그 ≠ fin·fit 태그면 핀·분류가 도는 앱과 다를 수 있다. 판정 양식에 `adv V · fin last-ok · fit last-ok` 한 줄 + 다르면 (주의) 줄. 런북: "두 앱과 같은 태그로".
5. **예약 쓰기 실패 = 질문 거부 · 차분 정산.** 정정 6 과 함께 — 예약을 못 쓰면(`writeFailed` · `spend.ts:70-72`) 질문을 시작하지 않는다. 정산은 절대값이 아니라 차분(§1 질문 3 의 watchdog 겹침).
6. **`runCli` 중단 배선.** 지금 `runCli` 는 자식 핸들을 밖으로 내지 않는다(`cli.ts:120-170`) · `main` 의 `stop` 은 `handle.stop()` 뿐(`main.ts:67-74`). B7 은 `AbortSignal`(또는 진행 중 Promise 노출) + 유예 뒤 `process.exit` 가 필요하다 — `cli.ts` · `advisor.ts` · `bot.ts` · `main.ts` 4파일 + 시험. 초안 4b-3a 범위에 파일 목록으로 적는다.
7. **문서 동기화.** ① `docs/runbooks/release-inplace.md` C1 실패 복구에 "**`pleiades-adv-bot` 이 DIFF/MISSING 이면 adv 스크립트로 재기동**" 줄(012 위반 결과 표 복구 칸 012:275 의 런북 쪽) ② `docs/runbooks/ops-collector.md` REF·SHA · adv 판정 줄 ③ 012 §0-5 공유 자원 표 — 배포 락 사용처에 `adv-inplace.sh`(배포·`stop`) · 이미 있는 `discord-inbound.sh`(`:233` take_lock)는 표에 있는지 대조 ④ `measured-facts.md`(pm2 신호·treekill 근거) ⑤ `workflow.md` 8절 `deploy/` 행 시험 설명 ⑥ `CLAUDE.md` 상태.
8. **`git fetch` 의 자동 유지보수.** git 이 `maintenance run --auto` 를 분리 실행하면 std fd 만 닫고 fd 9 는 남을 수 있다(서버 git 버전·설정 미측정) — release-inplace 도 git 은 닫지 않는다(SV A-1) · **일시** 보유라 영구 락은 아니지만 그동안 fin·fit 배포가 rc 1. adv 스크립트는 `git -c maintenance.auto=false -c gc.auto=0 fetch … 9>&-` 로 둘 다 막는다(비용 0).
9. **시험 격리 방법.** B1 이 `PLEIADES_PRIVATE_DIR` 설정을 거부하므로 release-inplace 시험처럼 그 키로 임시 위치를 줄 수 없다(`test_release_inplace.py:170`). 시험은 `HOME` 을 임시 디렉터리로 바꿔야 하고, B2(`$HOME/pleiades-adv` 위치 검사)와 함께 `FakeRoot` 를 `$HOME/pleiades-adv` 에 만든다. macOS 시험은 flock 이 없으므로 release-inplace 의 가짜 flock(`:518-541`) 또는 `PLEIADES_TEST=1` mkdir 폴백(`:37`)을 같은 방식으로 둔다 — 초안 4·6번 시험이 이 전제를 적지 않았다.

---

## 5. 확인된 주장 (재검증 불필요 목록)

- 구조 4파일 무변경으로 G7 이 성립한다(질문 8·9 · (a)).
- `probe` 모델 호출 0 · 락 보유 중 `busy` 가 정상(W5).
- B3 위치(`deploy/advisor/` + 최상위 `test_adv_inplace.py`) — 선례 `deploy/advisor-x1/` · `test_advisor_x1.py` 와 같은 꼴.
- B5 산술(두 도메인 상한 합계 ≈ 64.6 KB < 100,000 B · 세 도메인도 < 100,000 B) — SV B-9 (b) 와 일치.
- D4 의 LONG_RUNNING 을 adv 정의에 그대로 쓰는 것 — pm2 기본 `kill_timeout` 1600 ms 를 피하려면 **필수**(정정 5).
- B8 chat 콜백이 두 앱 동작을 바꾸지 않는다(질문 4 · 조건 2).

## 6. 재감사 때 볼 것

정정 1(U-1 표 · 사용자에게 다시 묻는지) · 정정 2·3(수집기 조건·all-missing) · 정정 6(API · 차분) · 정정 9(시험 형태) · 보충 1·2·3. 정정이 3회를 넘으면 스코프를 줄인다(workflow 4절) — 이번 9건 중 6건이 B7·B9 두 항목에 몰려 있으므로, 두 항목을 4b-3 에서 떼어 4b-4 로 미루는 것도 선택지다(서버 배치 4b-3b 만 먼저).
