# 008 단계 4(분석 에이전트) 실측 — 수집기 · 통합 층 · 마스킹 · 비용

> 범위: pleiades 저장소 코드 읽기만(`dev` 계열 `chore/889-1` · HEAD `fb50f4b9`). 서버 · 서비스 저장소 · `repos/*` · 원본 0. git 읽기만. `apps/*` 하네스 지시 실행 0(I-10).
> 판단은 쓰지 않는다 — **[설계]** 표시는 "설계가 정할 것" 이다. 숫자는 열거에서 셌다. `measured-facts.md` 갱신 없음(초안).
> 근거 표기: `파일:줄`. 수집기 = `deploy/ops/collect.cjs`(1379줄) · 통합 층 = `apps/advisor/src/`.

## 1. 수집기 — "새 지문 첫 발생" 이 확정되는 자리

### 1-1. 한 회의 순서 (`run` · `collect.cjs:1281-1328`)

| 순서 | 일 | 줄 |
|---|---|---|
| ① | 잠금 `mkdir collect.lock`(stale = P-8 3 × 주기 5분 = 15분) | `:1294-1300` · `acquireLock :975` |
| ② | 수집 — pm2 · health · 로그 · 생존 표지 · hermes · 디스크 → `ctx.obs` | `collect :1270-1280` |
| ③ | `plan(ctx)` — 지문 표 갱신 · 게시 목록 | `:1309` · `plan :750-814` |
| ④ | `deliver(posts)` — 게시(또는 dry-run 기록) · 게시한 것만 `p.commit` | `:1311` · `deliver :1150-1196` · commit `:1187` |
| ⑤ | `events.jsonl` 추가(관측 `obs` 행 + 게시 행) | `:1312-1313` |
| ⑥ | `state.json` 원자 쓰기(`prune` 후) | `:1319` |
| ⑦ | 하트비트 · 결과 한 줄 stdout | `:1320-1323` |

한 회 상한 P-9 `maxRunMs` 120,000 ms(`:46`) · 게시 간격 500 ms(`:62`) · 요청 하나 상한 `min(httpMs×2, 남은 시간)` = 최대 10 s(`:1121`).

### 1-2. "새로움" 판정 (`plan :760-783`)

- 관측은 `merge`(`:728`)로 지문별 합침 — 지문 = `sha256(material)` 앞 12자(`fpOf :128`) · `material = [app, role, src, ...detail].join(' · ')`(`observation :123-126`). **심각도는 재료에 없다.**
- `isNew = wasDeferred || louder || (kind==='state' ? !e.open : e.posted===null)`(`:771`).
  - 로그형(`event`): 그 지문이 지문 표에 `posted` 없이 있을 때 = **처음 한 번**. 단 표 항목은 닫힌 채 14일(`retainDays` · `prune :899-906`) 지나면 지워지므로 그 뒤 재발은 다시 "새로움".
  - 상태형(`state`): **열릴 때마다** 새로움 — 복구(`recoverRuns` 2회 연속 정상 · `:805-807`)로 닫힌 뒤 다시 열리면 또 첫 발생.
  - `louder`: 경고로 조용히 낸 지문에 실패·장애가 오면 첫 발생(`:770`).
  - 처음 본 시각은 `e.first`(항목 생성 때만 · `entryFor :745`).
- 새로움이면 `e.deferred = true` · `firstCount` 누적(`:773-778`) → `fresh` 목록.
- 미뤄졌는데 이번 회 관측이 없는 항목: 로그형은 다시 `fresh` · 상태형은 판정한 회에 풀렸으면 조용히 닫음(`:785-791`).

### 1-3. `fresh` → 게시물 (`plan :792-798` · `deliver`)

| 갈래 | 조건 | 게시 | commit | `events.jsonl` 행 |
|---|---|---|---|---|
| special | `src === 'all-missing'` | 첫 발생 + 고정 주의 문구(`:724`) | 게시 성공 뒤 | `type:first` · fp 있음 |
| quiet | 심각도 `경고`(`quietWarnings` · `:816`) | **게시 안 함**(요약에만) | **함**(`:1171` 주석 · `:1187`) | `type:first` · `quiet:true` |
| normal ≤ 5 | `burstLimit` 5(`:39`) 이하 | 지문마다 한 줄 | 게시 성공 뒤 | `type:first` · fp 있음 |
| normal > 5 | 폭주 | **한 건으로 묶음**(`burstPost :837`) | 묶인 지문 전부 | `type:burst` · **fp null** · app·role null |
| 차단 | 게시 전 검사 ①~③ 걸림 | 고정 문구 `[ops] 게시 차단 · 지문 <fp> · 사유 <코드>`(`:1050`) | 함 | `blocked:<코드>` |
| 미룸 | 한 회 상한 넘김 · 비밀 못 읽음 · 게시 실패 | 없음 | **안 함** → 다음 회에 다시 첫 발생 | 없음 |

- 게시 실패 하나가 나오면 그 회 나머지는 전부 미룸(`:1180-1184`).
- 한 회 상한: 새 지문 첫 게시는 사실상 **최대 5줄 + 폭주 1건**(5 초과면 개별 줄 없음) · 시간 상한 120 s.

### 1-4. 분석 요청을 걸 수 있는 지점 후보 (사실만)

| 후보 | 위치 | 그 시점에 손에 있는 것 | 비고 |
|---|---|---|---|
| A | `plan` 의 `fresh.push`(`:778` · `:788`) | 지문 항목 `e` 전체: `fp · material · app · role · src · detail · sev · kind · scope · first · last · days · firstCount` | 아직 게시 전 · 미룸이면 다음 회에 또 들어온다(중복 요청 가능) |
| B | `deliver` 의 `p.commit` 직후(`:1187`) · `type==='first'` | A 와 같은 `e` + 게시 여부 · `silent` · `blocked` | **게시가 확정된 뒤** · quiet(경고)도 여기 온다 · 폭주는 `p.e = null` |
| C | 회 끝 `events.jsonl` 의 `type:first` 행(`:1191`) | `at · fp · app · role · src · sev · count · quiet? · blocked?` | **detail · material 없음** — 다른 프로세스가 읽을 수 있는 유일한 파일 형태(현행 ops 리더가 이것을 읽는다) |
| D | `state.json` `fps[fp]`(`:1319`) | `material · detail · scope` 포함 전체 항목 | 600 · 비공개 상태 디렉터리 · ops 리더는 `material`·`detail`·`scope` 를 **내지 않는다**(`ops-shape.json` `fp.ignored`) |

**[설계]** 어느 지점에서 · 폭주에 묶인 지문을 개별 분석하나 · quiet(경고)를 분석 대상에 넣나 · 상태형 재열림을 "새 지문" 으로 볼 것인가.

### 1-5. `detail` 의 원천 — `observation` 호출 전수 (`grep -n "observation(\|collector("` · 정의 2줄 제외 열거)

| # | 줄 | app · role · src | detail | detail 원천 |
|---|---|---|---|---|
| 1 | `:181` | ops·pm2·all-missing | `[]` | — |
| 2 | `:192` | <app>·<role>·pm2 | `missing` | 상수 |
| 3 | `:195` | <app>·<role>·pm2 | `status:<p.status>` | **pm2 jlist 값**(`field()` 허용 문자) |
| 4 | `:198` | <app>·<role>·pm2 | `restart`(count=증가분) | 상수 |
| 5 | `:211` | ops·pm2·daemon | `none` | 상수 |
| 6 | `:325` | <app>·mcp·health | `000`·`5xx`·`200-notok` 등 등급 | HTTP 상태 등급(상수 집합) |
| 7 | `:328` | <app>·web·http | 등급 | 같음 |
| 8 | `:381` | <app>·<role>·stderr | 분류표 토큰(`server-action-ref` 등 6행 · `:97-106`) | 상수 |
| 9 | `:386` | <app>·<role>·stderr | **`[tag, cls, code, artifact]`** | **로그 원문**에서 뽑음: tag = 첫 줄 `[...]` 안(`:384`) · cls = 본문 `*Error` 단어(`:385`) · code = errno 이름 목록 안 값만(`codeOf :342`) · artifact = 스택의 `apps/(finance\|fitness)/` 상대 경로(청크 제외 · `:334-340`) |
| 10 | `:407` | <app>·mcp·out | `['', err.type, code, artifact]` | **MCP pino JSON 로그**의 `err.type` · `err.code` · `err.stack` |
| 11 | `:642` | <app>·bot·gateway | `stale` | 상수 |
| 12 | `:663`(헬퍼) → hermes 7곳 `:671-689` | hrm·api·state/registry/webhook/queue/expiry/dead/blocked/link-dropped | 상수 · **expiry 는 출처 id**(`field(id)` · hermes 상태 파일 값) | hermes `state.json` |
| 13 | `:712-713` | host·<fs>·<kind> | `>=90`·`>=80` | 상수 |
| — | `collector(code)` 21곳(`:206 216 247 314 451 493 507 510 572 620 638 659 704 1273 1306 1307` 등) | ops·collector·<code> | `[]` · code = 고정 접두 + 앱/파일 키 | 코드 상수 |

- **로그·외부 텍스트에서 오는 detail 은 #9 · #10 둘(+ #3 pm2 상태 문자열 · #12 hermes 출처 id).** 모든 칸은 `field()` = `/^[A-Za-z0-9_.:/-]{1,64}$/`(`:110` · `:117`)를 통과해야 하고 아니면 빈 문자열 — 공백·한글·따옴표 불가, 64자 이하. **tag 는 그 제약 안에서 자유 문자열**(로그 줄 머리 `[...]` 를 쓴 쪽이 정한다).
- detail 이 가는 곳: `material` → 지문 해시 · `state.json`(D) · 게시 본문 `line()`(`:719-722` — `[e.src, ...e.detail]` 를 그대로 싣는다) → Discord `#ops` · `posted.log`/`dry-run.log`(`:1194`). `events.jsonl` 에는 없다(`:1191` · `:1312`).

## 2. 수집기가 로그 원문에 닿는 곳

| 대상 | 읽는 법 | 원문 보유 범위 | 근거 |
|---|---|---|---|
| pm2 로그 디렉터리 `$PM2_HOME/logs` | `readdirSync` → 이름 정규식 `LOG_NAME`(`pleiades-(fin\|fit\|adv\|hrm)-(web\|bot\|mcp\|api)-(out\|error)(-N)?.log`) | 이름만 | `:109` · `:442-451` |
| `-error`(전 역할) · `mcp-out` | `readFrom` — 파일별 `{ino, off}` 오프셋(`state.files`) · 한 회 상한 4 MiB(`readCapBytes :59`) · 끝나지 않은 줄은 다음 회 | **그 회 함수 안 `lines` 배열**(`:430`) → `stderrObs`/`mcpOutObs` 가 관측만 만들고 반환 · 원문은 보관 안 함 | `:412-440` · `:496` |
| web·bot `-out` · adv-bot `-out` | **사용량 줄만** — 오프셋 따로(`state.usage.files`) · 고정 접두 정규식 3개(`USAGE_RE`) 맞는 줄만 비용·호출부 추출 | 같음 | `:466-469` · `:519-583` |
| hrm 로그 | 읽지 않는다(`:466` 주석) — hermes 는 상태 파일만 | — | `:650-695` |
| 배포 표지 · C5 창 파일 | 존재 · 수정 시각 · 내용(시각 문자열) | — | `:221-252` |
| 앱 `.env` 2 + 플랫폼 설정 1 | `dotenv.parse` — 포트(`readPorts :265`) · 비밀 값(`loadSecrets :1058`) | **비밀 값은 메모리에만**(`values` 배열) | `:1062-1078` |

- 원문 줄을 디스크에 쓰는 곳: **0**. 디스크 쓰기는 `writeAtomic`(state.json · events 정리 · `:917`) · `appendLines`(`events.jsonl` · `posted.log` · `dry-run.log` · `usage.jsonl` · `:923`) 뿐이고 내용은 관측·게시 본문·집계다(헤더 주석 `:16` 과 일치). **원문에서 뽑은 허용 문자 조각(tag · cls · artifact)은 `state.json` · `posted.log` 에 남는다.**
- 수집기의 자식 프로세스는 `pm2 jlist` 하나(`spawnSync :160`). 네트워크는 HTTP health(루프백) · Discord 웹훅 POST · 하트비트 GET.

### 2-1. §5-1 기계 검사 구현 (`checkPost :1042-1048`)

| # | 규칙 | 구현 |
|---|---|---|
| ⓪ | 칸 허용 문자 | 관측 생성 때 `field()`(`:117`) |
| ③ | 길이 | `POST_MAX` 2000자 → `length`(`:1017` · `:1043`) |
| ② | 토큰 형식 | `TOKEN_RES` 8개(옛 봇 · Discord 봇 · JWT · GitHub · `sk-` · AWS · Slack · 웹훅/인터랙션 경로) + 일반 32자+ 토큰(16진수만 제외 · 조각 16자+) → `token` · md escape 벗긴 본문으로도 | `:1024-1040` |
| ① | 비밀 값 일치 | 키 이름 `SECRET_KEY`(`TOKEN\|SECRET\|PASSWORD\|EMAIL\|WEBHOOK\|HEARTBEAT\|_KEY\|_PIN\|DATABASE_URL`) · 8자 미만 건너뜀 → `secret-match` | `:1018-1021` · `:1076` |
| — | 비밀 파일 하나라도 못 읽음 | 본문 게시 0 · 미룸 + `게시 보류 · secret-load` 고정 문구(P-1 간격) | `:1075` · `:1199-1204` |
| — | Discord 400·413 | `rejected` 고정 문구로 한 번 | `:1176-1179` |
| — | 범위 밖 | **통합 층 체크아웃 `.env` 는 대조하지 않는다**(008 §2 2026-11-17 블록) · 재작성 재시도 없음 | `:1050` |

## 3. 통합 층 진입 경로

### 3-1. 실행 모드 (`main.ts:51-100`)

| 모드 | 입력 | 출력 · rc | 하루 상한 | 운영에서 |
|---|---|---|---|---|
| `bot` | Discord 통합 채널 메시지 | 채널 답 · rc 0 | **있음**(`bot.ts`) | pm2 `pleiades-adv-bot` 이 이것만 띄운다(`deploy/advisor/pleiades-adv.config.cjs:21-22`) |
| `probe` | 없음 | 크기·준비 줄 · rc 0/1 · 모델 호출 0 | 해당 없음 | 배포 C4(`adv-inplace.sh:189`) |
| `ask <채널ID> <사용자ID>` | **stdin 질문**(≤ 4000자 · `advisor.ts:15`) | stdout 답 텍스트 한 덩어리 · rc 0 답 / 1 거부·실패 / 2 사용법 · K-5 로그 줄은 **stderr**(`makeAdvisor(env, err, …)` `:94`) | **없음** — `ask` 경로는 `DailySpend` 를 만들지 않는다(`:86-97`) | 호출하는 곳 0(저장소 열거) |

- `ask` 의 세션 키는 `sessionKey(채널ID, 사용자ID)` = `discord:<숫자>:<숫자>` 만(`session-store.ts:8-13`) — 숫자가 아니면 rc 2. 세션 Map 은 **프로세스 메모리**라 `ask` 1회 = 새 세션(`main.ts:5` 주석).
- `ask` 프로세스는 별 `Advisor` 인스턴스 — `busy`(`advisor.ts:118` · `:189`)는 **인스턴스 필드**라 상주 `bot` 과 겹쳐 돌 수 있다. mcp-config 파일은 `<비공개>/advisor/mcp-<sha256(key) 8자>.json`(`:172`) — 같은 키면 두 프로세스가 같은 파일을 쓴다.
- `ask` 의 비용 줄은 `adv-bot -out` 이 아닌 호출자 stderr 로 가므로 **수집기 사용량 집계(`USAGE_OUT` 의 `adv-bot` · `:519`)에 잡히지 않는다.**

### 3-2. 질문 하나의 문 (`advisor.ts:187-250`)

순서: 종료 중 거부 → `busy` 거부(전역 아님 · 프로세스 1) → 빈/4000자 초과 거부 → **배포 락 시험**(`flock -n` 자식으로 잡았다 놓음 · `free` 아니면 거부 · `deploy-lock.ts:17-24`) → 설정 범위 검사(`checkSettings`) → 모델 핀 → 세션 준비(도메인 prepare · MCP 10 s) → CLI → 판정 → init 재시도 1회(`initRetry :93-98`).

### 3-3. 하루 상한 (`spend.ts` · `bot.ts:126-158`)

- `DAILY_CAP_USD` 5.0 · KST 날짜별 `<비공개>/advisor/spend-YYYY-MM-DD.json`(600 · 임시 → rename) · 못 읽음·깨짐·쓰기 실패 = 상한으로 본다(`spend.ts:4-5` · `:52-55`).
- 질문 **전** 호출당 상한 $1.00 예약(`bot.ts:135`) → 끝나면 `costOf(r) − 1.00` 정산(`:151`). `costOf`: CLI 보고 비용 · 없고 init 단계 실패면 0 · 그 밖 $1.00(`:101-106`).
- 상한 도달 · 기록 실패 → 거부 문구 + 관리자 알림(그날 1회 · `:109-114`).

### 3-4. 답하는 곳 · 알림

- 답은 **질문이 온 그 채널에 `ctx.reply`**(`bot.ts:157`) — 통합 채널 하나(`DISCORD_CHANNEL_ID_ADVISOR` · `platform.ts:7`). 허용 = 사용자 ID AND 채널(`bot.ts:180-184`).
- 통합 층이 먼저 말을 거는 길: **관리자 알림만** — `createAdminAlert` = `DISCORD_WEBHOOK_ADMIN` 웹훅 · `[advisor]` 라벨 · "정적 문구 + 숫자뿐"(`platform.ts:40-61`). 통합 층 코드에 `DISCORD_WEBHOOK_OPS` 사용 0(`grep -rn "WEBHOOK_OPS" apps/advisor/src` = 0).

### 3-5. 크론(수집기) → 통합 층으로 일을 넘기는 기존 길

| 길 | 있나 | 근거 |
|---|---|---|
| 파일 큐 · 감시 | **없음** — 통합 층에 `fs.watch` · 폴링 읽기 0(`setInterval` 2곳은 타이핑 표시 · 봇 설정 대기 `bot.ts:143` · `:205`) | grep |
| 소켓 · HTTP 서버 | **없음** — `createServer`·`listen(` 0 | grep |
| Discord 채널 경유 | **막혀 있다** — chat 이 봇·웹훅 작성 메시지를 버린다(`packages/chat/src/chat.ts:201` `m.author?.bot === true \|\| m.webhook_id !== undefined`) | 코드 |
| CLI `ask` | **있다(쓰는 곳 0)** — 위 3-1 의 제약(하루 상한 없음 · 숫자 키 · 별 프로세스 · 사용량 미집계) | `main.ts:86-97` |
| 역방향(통합 층 → 수집기 데이터) | **있다** — ops 리더가 `<비공개>/ops/state.json`·`events.jsonl` 을 읽는다(질문 때) | `local/ops.ts:43-97` |

- 체크아웃 위치: 수집기 = 체크아웃 밖 설치(`collect.cjs:10` 주석 `~/pleiades-ops/`) · 통합 층 = `~/pleiades-adv/apps/advisor`(`collect.cjs:76`). 수집기 회 상한 120 s(P-9) < 통합 층 질문 상한 10분(`cli.ts:14`) · 수집기 잠금 stale 15분.
- 크론 환경에서 `claude` 인증·PATH 가 `ask` 에 맞는지: **미측정**(서버 · I-3).

## 4. 판정기 · 상한 (`cli.ts` · `judge.ts`)

| 항목 | 값 | 근거 |
|---|---|---|
| 호출당 상한 | `CALL_BUDGET_USD` 1.0 → `--max-budget-usd 1.0000` | `cli.ts:13` · `:87` |
| 질문 시간 | 10분 → SIGTERM(5 s 뒤 SIGKILL) | `cli.ts:14` · `:155-158` |
| stdout 상한 | 16 MiB 넘으면 SIGKILL | `cli.ts:17` · `:165` |
| stderr | 크기만 셈 · 원문 버림 | `cli.ts:173-175` |
| 도구 | `--tools ""`(내장·Web 끔) · `--allowedTools` = 준비된 도메인 `allow` 합집합 · `--strict-mcp-config` · `--setting-sources project` · `--permission-mode dontAsk` | `cli.ts:78-91` |
| 자식 env | 허용 목록 정규식(HOME · PATH · 로케일 · CLI 설정 위치 · 인증 키 · 프록시·CA) + 핀 · 자동 업데이트 끔 · `ENABLE_TOOL_SEARCH=false` | `cli.ts:50-67` |
| init fail-closed | 첫 줄 판정 — 위반: init 전 hook · 플러그인(내장 3 외) · MCP 서버 수/이름 불일치 · 목록 밖 도구 / 형식: init 없음 · MCP 미연결 → SIGKILL | `judge.ts:99-128` · `cli.ts:145-154` |
| 답 판정 | init 뒤 hook = 위반 · timeout · `error_max_budget_usd` = 상한 · 허용 밖 호출 수 `outside` · 모델 드리프트 | `judge.ts:186-216` |
| 시스템 프롬프트 | `BASE_SYSTEM_PROMPT`(재무·건강 어드바이저 문구 4줄 · `advisor.ts:18-22`) + 도메인 지식 절 + 못 쓰는 도메인 절(`buildSystem :103-110`) · 상한 100,000 B(`:47`) | |

**분석용으로 다른 프롬프트 · 도구 집합을 쓰려면 바뀌는 자리(사실):** 프롬프트는 상수 `BASE_SYSTEM_PROMPT` 하나에 묶여 있다(`advisor.ts:104`) · 도구 집합 = 발견한 **모든** 선언의 준비 결과(`startSession :161-185` · 선언 선택 인자 없음) · 하루 상한·예약은 `bot.ts` 라우터에만 · `ask` 에는 없음 · 세션 키 형식은 `discord:` 숫자 고정. 코드 읽기 도구는 **없다** — `--tools ""` 이고 `local` 리더 레지스트리는 `ops` 하나(`readers.ts:42-45`). **[설계]** 분석 전용 진입(모드·프롬프트·도구·상한)을 어디에 둘지.

## 5. 발췌 재료가 될 수 있는 기존 마스킹 코드

| 코드 | 무엇을 가리나 | 위치 |
|---|---|---|
| `sanitizeMessage` · `sanitizeError` | 옛 봇 토큰 · Discord 웹훅·인터랙션 경로 토큰 · Discord 봇 토큰 → `<REDACTED>` 치환(4개 정규식) · cause 체인 깊이 5 | `packages/notify/src/error.ts:9-67` |
| #540 | 두 앱 `bot/utils/error.ts` 가 위 판을 재수출(옛 앱 판은 봇 토큰만 가렸다) | `apps/finance/src/bot/utils/error.ts:6-10` · `apps/fitness/src/bot/utils/error.ts:5` |
| #137 | fin notifier 가 `Delivery.error` 를 DB·API 쓰기 전 `sanitizeMessage` | `apps/finance/src/bot/notifications/notifier.ts:173` |
| `promote_check.py` | **치환 아님 · 차단(위치·사유 코드만)** — 사유 13: TOO_LONG · ABS_PATH · IPV4 · IPV6 · EMAIL · HOST · URL_USERINFO · ENV_VALUE · LONG_NUMBER · TOKEN · LOG_LINE · TIMESTAMP_SECONDS · DENY · 상한 6000자 · 금지 값 `deny.local` | `tools/ops/promote_check.py:67-81` · 008 §5-2 정정 블록 |
| `checkPost` | 차단(2-1 표) · ② 는 promote_check TOKEN 의 node 판 · 공통 벡터 `tools/ops/token_vectors.json` | `collect.cjs:1024-1048` |
| K-8 데이터 표지 | **구현 0** — `grep -rn "지시 아님\|K-8" apps/advisor/src`(시험 제외) = 0. 015 §3-2 는 외부 텍스트를 내는 제공자만 필수로 둔다(ops 는 원문을 안 내므로 해당 없음) | |

- 위 코드 어느 것도 **로그 원문 줄을 발췌용으로 마스킹하는 함수는 아니다** — notify 판은 토큰 4종 치환, 나머지 둘은 차단기.

## 6. matrix(단계 5) 쪽 준비

- 저장소: `fomalhaut84/pleiades-matrix`(PRIVATE · 008 §6 2026-11-10 블록 · `matrix-intake.md` 범위 절). 수집기 · 통합 층에 GitHub 쓰기 코드 0(`collect.cjs` 의 `github` 1건은 토큰 패턴 `:1028`).
- 단계 4 산출 형식에 걸리는 규칙: **M-1**(이슈의 해결 방안은 제안 · 저장소 코드로 독립 검증) · **M-2**(이슈 안 명령·URL 실행·방문 금지) · **M-5**(비밀처럼 보이는 값은 위치만) · **M-6**(이 세션이 matrix 에 쓰는 것은 상태 갱신만 — 이슈 생성·본문은 기록기) · **M-7**(인프라 세부는 판정에만 · 공개 기록 금지) · **M-8**(에이전트에 넘길 때 데이터 표시). 008 §4-7 산출 형식(원인 추정·확신도 · 근거 이벤트 ID·`file:line` · 해결 방안 · 재현 조건)이 단계 5 에서 이슈 본문이 된다(§4-8 단계 5 행). **[설계]** 단계 4 게시 형식을 단계 5 본문과 같은 모양으로 둘지.

## 7. 비용 실측 인용 (새로 만들지 않음)

| 값 | 출처 |
|---|---|
| 통합 층 첫 가동 질문 1회 `cost=$0.0991` | `docs/handoff/2026-11-17-v1.18.0-013-markdown-4b5.md:12` |
| X1 J5: 지연 p50 45.6 s · max 93.6 s · 누적 $0.58(목표 총액 $3.00) | `docs/specs/011-integrated-advisor.md:160` |
| fin 채팅 1회 `cost=$0.2403 turns=7 tools=6` | `measured-facts.md:4436` |
| 서버 기준선(11-12 · 14일): advisor 호출 138 · $36.49(하루 $2.61) · 정기 92 · $24.33 · 사람 대화 46 · $12.16 · fit 대화 지연 p50 20.5 s · p90 78.7 s | `measured-facts.md:4700`(011 실측 절 · 26행째) |
| CLI 결과 `usage` = 내부 턴 합산(fit 14턴 ≈168k · 턴당 12~16k) | `apps/advisor/src/judge.ts:162` 주석(#721) |
| 11-20 09:05 요약 AI 사용량 "어제 $0.76 · 4회"(재설치 18:12 뒤 반나절치) · 월말 예상 $22.74(반나절 × 30 이라 낮다) | `docs/handoff/2026-11-20-…-stdio-probe.md:15-16` |
| 015 V-1 probe: 도구 정의 27,850 B > 지식 20,413 B · 시스템 21,055 B | `CLAUDE.md` 상태 문단(2026-11-19 오후) |
| 하루 상한 $5.00 · 호출당 $1.00 | `spend.ts:9` · `cli.ts:13` |
| **못 찾음:** 통합 층에 ops 제공자가 붙은 뒤(V-5) 질문 1회 비용 · 턴 · 분석형 질문 비용 | 측정 기록 없음 |

## 8. 가정을 뒤집는 사실

1. **"새 지문" 은 한 번이 아니다.** 상태형은 복구 뒤 다시 열릴 때마다 첫 발생이고(`collect.cjs:771`), 닫힌 지문은 14일 뒤 지워져 재발이 또 첫 발생이다(`:905`). 008 §4-1 "지문당 1회" 를 지문 해시 기준으로 세면 같은 원인이 여러 번 분석된다.
2. **폭주(새 지문 > 5)는 개별 지문 게시·행이 없다**(`burstPost` · `events` 행 fp null · `:837-848` · `:1191`). 장애 때 가장 분석이 필요한 묶음이 지점 B·C 에서 지문 단위로 보이지 않는다.
3. **경고는 게시되지 않지만 첫 발생으로 commit 된다**(quiet · `:1171` · `:1187`). 침묵 `silent:*` · `glob-empty:*` · 디스크 80% 등이 여기다(008 §2 2026-11-16 블록).
4. **015 V-5 의 ops 제공자로는 원인 분석 재료가 없다.** events 에 `detail` 이 없고 ops 리더는 `material`·`detail`·`scope` 를 버린다(`ops-shape.json` · `ops.ts:3`) — 015 §7-1 스스로 "무슨 오류였나는 답할 수 없다" 고 적었다. 008 §4-7 이 요구하는 "지문별 로그 발췌(마스킹 뒤)" · "배포 체크아웃 코드 읽기" 도구는 통합 층에 **없다**(`--tools ""` · 리더 1개).
5. **로그 원문에서 온 조각은 이미 디스크와 Discord 에 있다** — stderr tag · Error 클래스 · 산출물 경로가 `state.json`·`posted.log`·`#ops` 본문에 실린다(1-5 #9·#10). 008 Q99 "발췌 = 단계 1 에 넣지 않는다" 는 줄 단위 원문 기준으로 참이고, 조각(허용 문자 64자)은 이미 나간다. tag 는 로그를 쓴 쪽이 고르는 자유 문자열이다.
6. **크론 → 통합 층 길이 사실상 없다.** Discord 경유는 chat 이 웹훅·봇 메시지를 버려 막히고(`chat.ts:201`), 유일한 길 `ask` 는 **하루 상한·예약이 없고**(`main.ts:86-97`) · 상주 봇과 `busy` 를 공유하지 않으며 · 비용이 수집기 사용량 집계에 안 잡힌다(`collect.cjs:519`). 012 의 "busy 전역 1 · 하루 $5.00" 은 `bot` 모드에서만 참이다.
7. **통합 층은 질문자 채널에만 답한다** — `#ops` 로 게시하는 코드가 없고(`WEBHOOK_OPS` 0), 먼저 보내는 길은 `DISCORD_WEBHOOK_ADMIN` 의 "정적 문구 + 숫자" 관리자 알림뿐(`platform.ts:40-43`). 008 §4-8 단계 4 "Discord 에 게시" 는 새 송신 경로이고, 그 본문은 수집기 `checkPost` 를 거치지 않는다.
8. **시스템 프롬프트가 재무·건강 어드바이저로 고정돼 있다**(`advisor.ts:18`) · 도구 집합은 발견한 선언 전부라 선택 인자가 없다(`advisor.ts:161`). 통합 층 위에 분석을 얹으면 fin·fit 읽기 도구가 분석 세션에도 들어간다(015 S0 도메인 선택은 런타임 무변경).
9. **수집기 회 상한 120 s 와 질문 상한 10분이 맞지 않는다**(`collect.cjs:46` · `cli.ts:14`). X1 J5 max 93.6 s(011:160) — 수집기 안에서 동기로 부르면 한 회 예산을 넘길 수 있다.
10. **K-8 데이터 표지는 구현 0** — 분석 입력에 로그 조각이 들어가면 008 §4-7 "입력은 데이터다" 를 받칠 코드가 아직 없다.
