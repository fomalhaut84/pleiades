# 01 surveyor — #239 계약 v1 근거 실측 (2026-11-19)

- 대상: pleiades `dev` `88e56741` (2026-11-19 12:56 KST) · 작업트리 clean. 정적 읽기만(코드 변경 0 · 서버 0 · MCP 기동 0 · `claude` 실행 0).
- `measured-facts.md` 는 건드리지 않았다(지시). 기존 값은 출처를 붙여 인용했다 — **[인용]** 표시.
- grep: `grep --binary-files=text` · ignored 경로는 `LC_ALL=C /usr/bin/grep -a`. 합계는 아래 열거 행을 센 값이다.

공통 명령(재현):
```bash
cd ~/workspace/pleiades
grep -rn --binary-files=text -E 'DOMAIN_DIRS|loadDomains|prepareDomain|SYSTEM_MAX_BYTES|KNOWLEDGE_MAX|domains=|mcp-config|mcpConfig|allowedTools|prefixOf|readUrlOf|finance|fitness|PIN_SOURCES' \
  apps/advisor/src deploy/advisor deploy/test_domain_contract.py deploy/test_ssh_deploy.py .github/workflows
grep -rln --binary-files=text 'domain.json' apps/finance/src apps/fitness/src apps/advisor/src deploy tools .github
```

---

## A. 통합 층이 "두 도메인 · MCP 제공자" 를 가정하는 곳 (전수)

| # | 위치 | 가정 | 새 앱 하나를 붙이면 |
|---|---|---|---|
| A1 | `apps/advisor/src/domains.ts:9` `DOMAIN_DIRS = ["finance","fitness"] as const` | 고정 목록 · 자동 발견 없음 | 한 줄 추가(또는 발견 로직) |
| A2 | `domains.ts:10` `CONTRACT = "pleiades-domain/v0"` · `:35` 다르면 throw | 계약 판 하나 | v1 판을 받으려면 파서 분기 |
| A3 | `domains.ts:40-42` 파서 필수 필드 = `id`(`^[a-z0-9_]{1,60}$`) · `name` · `keySuffix`(`^[A-Z0-9_]{1,40}$`) · `mcp.serverKey` · `tools.write`(문자열 배열) · `mcp.defaultPort`(:45-46 정수 1~65535) | **모든 제공자가 MCP 서버 + 포트 + 쓰기 분류**를 가진다 | MCP 없는 제공자(수집기 · 위키 파일)는 이 형식으로 선언 불가 |
| A4 | `domains.ts:44` 포트 override env `ADVISOR_MCP_PORT_<keySuffix>` | 제공자 = 루프백 TCP 포트 | 새 env 키 |
| A5 | `domains.ts:52` `fs.readFileSync(apps/<dir>/domain.json)` — **하나라도 없거나 형식이 틀리면 throw** → `advisor.ts:197-210` `startOrRefuse` catch → `refused config`(모든 질문 거부) | 선언 파일 오류 1개 = 전체 정지 | 새 앱의 domain.json 오류가 기존 두 도메인까지 멈춘다 |
| A6 | `domains.ts:55` id · serverKey 중복이면 throw | — | 유지 가능 |
| A7 | `domains.ts:60` `readUrlOf` = `http://127.0.0.1:<port>/mcp/read` · `:11` `READ_PATH` 고정 | 읽기 경로 이름 하나 | 같은 경로 이름 요구 |
| A8 | `domains.ts:67-95` `prepareDomain` — `openSession` → `tools/list`(0개면 실패 :82) → 이름 형식 :83 → 쓰기 분류 교차 :84 → `prompts/get domain_knowledge` :87(**없으면 그 도메인 실패**) → 32,000 B 상한 :91 | 모든 제공자가 MCP prompt `domain_knowledge` 를 낸다 | 지식 prompt 없는 제공자는 "쓸 수 없음" |
| A9 | `advisor.ts:113-117` `prepareAll` = `Promise.all(decls.map(prep))` — **세션 시작마다 모든 도메인을 병렬로 준비**(타임아웃 `MCP_TIMEOUT_MS = 10_000` :15) | 도메인 선택 없음(A1 방식) | 도메인 수만큼 MCP 왕복 · 지식 전부 실림 |
| A10 | `advisor.ts:119-139` `startSession` — mcp-config(`mcp-<keyTag>.json` · 비공개 600)에 ready 도메인 전부 · `allow = ready.flatMap(allow)` · `serverKeys` · `prefixes` | — | 자동 반영 |
| A11 | `advisor.ts:72-79` `buildSystem` = BASE(576 B · 아래 E3) + 도메인마다 `## 도메인 지식 — <name>\n<knowledge>` + 못 쓴 도메인 안내 | 지식은 **전부 시스템 프롬프트에** | 도메인당 최대 32,000 B 증가 |
| A12 | `advisor.ts:17-21` `BASE_SYSTEM_PROMPT` 문구 = "개인 재무와 건강·운동 데이터" · "질문이 두 도메인에 걸리면" | **문구가 두 도메인 고정** | 문구 수정 필요 |
| A13 | `advisor.ts:41-45` `SYSTEM_MAX_BYTES = 100_000` · 주석 "도메인 #3 이 여기에 닿으면 `--system-prompt-file`(서버 CLI 실측 뒤)" · `:203-207` 넘으면 `refused system-too-large` | — | 산술: 100,000 − 576 − 현행 지식 20,413(=7,904+12,509 [인용 012:469]) − 머리줄 ≈ **79,000 B 여유** → 32,000 B 상한 도메인 **2개** 더 들어갈 자리(꽉 채우면). 상한까지 쓰는 도메인 3개째에서 거부 |
| A14 | `advisor.ts:235` 로그 줄 `domains=${s.serverKeys.length}` · `tools=<serverKey>:ok/n,…`(:231) | serverKey 단위 | 자동 |
| A15 | `advisor.ts:124` `domain=<id> unavailable why=<사유>` | — | 자동 |
| A16 | `advisor.ts:178-181` 세션 첫 답에만 "이번 대화에서는 X 데이터를 쓰지 못했어요" | 한 도메인 실패 = 나머지로 계속(012 R-바닥 ②) · ready 0 이면 `no-domain` 거부 | 자동 |
| A17 | `judge.ts:97-123` `judgeInit` — init 의 `mcp_servers` 수 ≠ serverKeys 수면 위반 · **serverKeys 중 하나라도 `connected` 가 아니면 "MCP 미연결" 실패**(:118-121) | prepare 통과 뒤 init 사이에 한 제공자가 끊기면 **질문 전체가 실패**(비용 0 · init 단계) | 제공자가 늘수록 이 창의 확률이 는다 |
| A18 | `judge.ts:113` `outside` = init `tools` 중 allow 밖 수 · `:209` 답의 allow 밖 호출 수 · 1 이상이면 실패(`advisor.ts:172`) | 허용 목록 = `mcp__<serverKey>__<name>` 만 | 자동 |
| A19 | `cli.ts:23-26` `PIN_SOURCES` = finance `PINNED_MODELS` · fitness `PINNED_CLAUDE_MODELS` · `readPins` 둘이 다르면 throw(:30-42) | 모델 핀은 두 앱에서 | 도메인 목록과 **별개 목록**(새 제공자가 모델을 안 쓰면 무관) |
| A20 | `cli.ts:63` 자식 env `ENABLE_TOOL_SEARCH: "false"` | **MCP 도구 검색 끔** → 아래 F | 도구 지연 로드를 쓰려면 이 줄 + judge 재설계 |
| A21 | `cli.ts:76-89` `cliArgs` — `--mcp-config … --strict-mcp-config` · `--allowedTools <쉼표 목록>` · `--tools ""` · `--system-prompt <argv 문자열>` | 시스템 프롬프트가 argv(Linux 단일 인자 131,072 B — advisor.ts:42 주석) | A13 과 같음 |
| A22 | `session-store.ts:5-6` 세션 유휴 24 h · 컨텍스트 100,000 토큰 · 프레임(allow · system)은 **세션 시작 때 고정** | 세션 중 도메인이 늘거나 줄어도 반영 안 됨(init 실패 → 재시작 경로만 · advisor.ts:159-170) | — |
| A23 | `main.ts:4,52-58` `probe` — 도메인마다 `준비됨 · 읽기 도구 N · 지식 B` / `쓸 수 없음 · 사유` · **하나라도 ok 면 rc 0** | — | 자동 |
| A24 | `deploy/advisor/adv-inplace.sh:187-193` C4 = `node dist/advisor.cjs probe` · rc≠0(쓸 수 있는 도메인 0)이면 stop 4 | 새 도메인이 실패해도 C4 는 통과(한 도메인만 ok 여도) | 새 도메인 실패가 배포 판정에서 **보이지만 막지 않는다** |
| A25 | `deploy/advisor/auto-inputs.txt:19-23` `apps/finance/domain.json` · `apps/fitness/domain.json` · 두 `models.ts` 를 손으로 나열 | — | 새 domain.json 한 줄(빠지면 그 변경이 자동 배포를 부르지 않는다) |
| A26 | `deploy/test_ssh_deploy.py:335-337` `assertEqual(sorted(dirs), ["finance","fitness"])` · pins == dirs | **시험이 두 도메인을 단정** | 시험 수정 · 그리고 `pins == dirs` 단정 때문에 **모델 핀 없는 도메인을 넣으면 실패** |
| A27 | `deploy/test_domain_contract.py:15` `DOMAINS = {"fin":"finance","fit":"fitness"}` · `:17` `KEYS` 정확 일치(`$comment,contract,id,name,keySuffix,mcp,tools`) · `:30` keySuffix `^[A-Z]{2,20}$` · `:65` 도구 수 고정 `(25,34)·(27,1)` · `:71-84` 앱 `src/lib/ai/mcp-config.json` · `server.ts` 기본 포트 정규식 · `:86-91` 앱 src 에 `DISCORD_CHANNEL_ID_<SUFFIX>` 문자열 · `:93-99` `read-mode.ts` · `:101-109` `knowledge-prompt.ts` + `server.ts` 등록 1회 | **v0 = "앱 advisor 가 있는 Next 앱" 모양**(mcp-config.json · 채널 키 · server.ts) | hermes·수집기·위키는 이 시험의 거의 모든 항목을 통과할 수 없다(K-4 채널 키 · mcp-config.json 없음) |
| A28 | `.github/workflows/ci.yml:66-69` 계약 시험이 **필수 `verify`** job · `apps-ci.yml:81` 분류·읽기 경로 시험이 필수 `apps-fin` | — | 새 앱 job 추가 시 필수 체크 등록(ruleset · 사용자) |
| A29 | `apps/advisor/src/__tests__/` — `domains.test.ts:14-24`(실제 두 domain.json 단정 `[fin,fit]` 구조분해) · `advisor.test.ts:14-15,26,74-79…`(FIN_TOOL·FIT_TOOL · `myfinance`·`myfitness` 고정 17곳 이상) · `judge.test.ts:6-9,65,99` | 시험 고정값 | `domains.test.ts:16` 은 순서·개수 단정이라 깨진다. advisor/judge 시험은 주입값이라 무관 |

**새 앱 하나를 v0 그대로 붙일 때 바뀌는 곳(열거 A 에서):** A1 · A12 · A25 · A26 · A27(DOMAINS · 도구 수) · A28(선택) · A29(`domains.test.ts`) + 그 앱 쪽 domain.json · `/mcp/read` · `domain_knowledge` prompt · `mcp-config.json` · `DISCORD_CHANNEL_ID_<SUFFIX>` 사용 = **통합 층·시험 쪽 7곳 + 앱 쪽 5요소**. 자동으로 따라오는 곳: A10 · A14~A18 · A23.

## B. domain.json 현행 두 파일

명령: `cat apps/finance/domain.json apps/fitness/domain.json`

| # | 필드 | fin | fit |
|---|---|---|---|
| B1 | `$comment` | 있음 | 있음 |
| B2 | `contract` | `pleiades-domain/v0` | 같음 |
| B3 | `id` · `name` | `fin` · `재무` | `fit` · `건강` |
| B4 | `keySuffix` | `FINANCE` | `FITNESS` |
| B5 | `mcp.serverKey` · `mcp.defaultPort` | `myfinance` · 4210 | `myfitness` · 4301 |
| B6 | `tools.read` · `tools.write` 개수 | 25 · 34 | 27 · 1 (`generate_training_plan`) |

필드 총 7키(최상위) — 열거 B1~B6 의 키: `$comment, contract, id, name, keySuffix, mcp{serverKey,defaultPort}, tools{read,write}`.

**읽는 코드(통합 층 밖):**

| # | 위치 | 쓰는 필드 |
|---|---|---|
| B7 | `apps/finance/src/mcp/read-mode.ts:7,14` · `apps/fitness/src/mcp/read-mode.ts:7,14` | `tools.read` → `/mcp/read` 등록 거르기 |
| B8 | `apps/finance/src/lib/ai/advisor-tools.ts` · `apps/fitness/src/lib/ai/advisor-tools.ts:10-17` | `mcp.serverKey` · `tools.read`(앱 advisor 허용 목록) · `tools.write`(제외 목록) |
| B9 | 시험: `apps/{finance,fitness}/src/mcp/__tests__/read-mode.test.ts` · `apps/finance/src/lib/ai/__tests__/advisor-tools.test.ts` · `deploy/test_domain_contract.py` · `deploy/test_ssh_deploy.py` | 형식 · 분류 |
| B10 | 끝난 실험: `deploy/advisor-x1/x1.cjs` · `judge.cjs` · `deploy/test_advisor_x1.py` | (기록용 · 운영 무관) |

→ `name`·`keySuffix` 를 읽는 앱 코드는 없다(keySuffix 는 시험 A27 이 채널 키 문자열로 대조만). 앱이 실제로 쓰는 것은 `tools.*` · `mcp.serverKey` 다.

## C. hermes 가 내줄 수 있는 읽기 데이터

| # | 항목 | 값 | 출처 |
|---|---|---|---|
| C1 | 프로세스 | pm2 `pleiades-hrm-api` · cwd `apps/hermes` · `dist/hermes.cjs` · `max_memory_restart 384M` · `--max-old-space-size=256` | `deploy/hermes/pleiades-hrm.config.cjs:16,25-37` |
| C2 | 포트 · 바인드 | `PORT=4700` · `127.0.0.1` | 같은 파일 :17 · `apps/hermes/src/main.ts:25,143` |
| C3 | node | `engines >=22.13` · 빌드 target node24 · `node:sqlite` | `apps/hermes/package.json` · `queue.ts:11` |
| C4 | 열린 HTTP 경로 | **2개**: `POST /v1/messages`(출처 키 인증) · `GET /v1/health`(본문 `{ok:true}`) · 그 밖 404 | `server.ts:2,130-137,133` |
| C5 | MCP 의존 | **없음** — dependencies = `@pleiades/notify` 하나 (`@modelcontextprotocol/sdk` 0) | `apps/hermes/package.json` |
| C6 | 저장 위치 | `~/pleiades-hermes-data/state/hermes.db`(600 · `queue.ts:133`) · `state.json`(600 · `state.ts:61`) · 레지스트리 `~/pleiades-hermes-data/sources.json` · 상태 디렉터리 700(`main.ts:47`) | `pleiades-hrm.config.cjs:18,41-42` |
| C7 | `messages` 테이블 열 (14) | `id, source, idem_key, title, text, link_label, link_url, level(info/warn), status(queued/sent/dead/blocked), attempts, received_at, next_at, done_at, reason` | `queue.ts:79-94` |
| C8 | 입력 상한 | title 100자 · text 1500자 · link label 80 · url 2048(https · 사용자정보 없음) · 알 수 없는 필드 거부 | `validate.ts:19-22,26,58` |
| C9 | 보존 | 끝난 행(sent·dead·blocked) **30일** 뒤 삭제 · 정리 주기 1시간 · 중복 창 7일 | `queue.ts:73-76,119-120` · `main.ts:26,53-61` |
| C10 | 개인정보·비밀 검사 시점 | **게시 직전**(`poster.ts:121` `checkRaw(rawFields) ?? checkContent`) — 받기(enqueue) 때가 아니다 · 걸리면 `markBlocked(id, reason)`(:135) | `poster.ts:89,121,135` |
| C11 | 검사 범위 | ② 토큰 형식 · ③ 2000자 · ① 비밀 대조 · PII = 전화번호 · 이메일 패턴만 · **이름·주소는 기계로 못 잡는다**(주석) | `checks.ts:1-8,40-57` |
| C12 | 레지스트리 출처 필드 | `id, name, keySha256, enabled, expires, linkHosts, ratePerMinute` · name 은 토큰·PII 모양 거부 | `registry.ts:12-21,48,67` |
| C13 | `state.json` 필드 (13) | `updatedAt, queued, oldestQueuedAt, dead, deadToday, blockedToday, linkDroppedToday, lastSentAt, webhook, paused, registrySources, registryError, expiringSoon` — **수치·시각·출처 id 만** | `state.ts:9-22` |
| C14 | 로그 | 출처 id · 상태 · 길이만(본문·키 없음) | `server.ts:6,141` |

→ hermes 의 읽기 후보는 두 층이다: **(가) 수치 상태 = `state.json`**(C13 · 원문 없음) · **(나) 메시지 본문 = `hermes.db`**(C7 · 외부 출처가 쓴 텍스트 · 30일).

## D. ops 수집기가 남기는 것

| # | 항목 | 값 | 출처 |
|---|---|---|---|
| D1 | 실행 형태 | crontab 한 줄 · 5분(`periodMin: 5`) · 한 회 상한 120 s · **상주 프로세스 없음**(pm2 등록 없음 · 크론이 `node collect.cjs`) | `deploy/ops/collect.cjs:4,33,44` · 런북 `docs/runbooks/ops-collector.md:13` |
| D2 | 설치 | 체크아웃 밖 `~/pleiades-ops/collect.cjs` 커밋 고정 · 현 판 REF `18bab57f…` | 런북 :24 [인용] |
| D3 | 상태 디렉터리 | `${PLEIADES_PRIVATE_DIR:-~/pleiades-private}/ops` · 700(`collect.cjs:1094-1095`) · 파일 600(`:791,796`) | `collect.cjs:83-84` |
| D4 | 파일 | `state.json`(억제 상태 · 상한 1 MB) · `events.jsonl` · `posted.log`(게시 본문 그대로) · `dry-run.log` · `collect.log` · `collect.lock` | 런북 :12 · `collect.cjs:756,1025,1096,1113` |
| D5 | `events.jsonl` 필드 | obs 줄: `at, type:'obs', fp, app, role, src, sev, count`(`:1112`) · 게시 줄: `at, type, fp, app, role, src, sev, count, quiet?, blocked?`(`:1022`) | — |
| D6 | 지문 `fp` | `sha256(material)` 앞 12 hex · 재료는 허용 문자 칸만 | `collect.cjs:15,127` |
| D7 | `state.json` 최상위 | `files, fps, restarts, lastOk, growth, lastRunAt, summaryDate` · fps 항목에 `material, detail, kind, scope …` | `collect.cjs:631,759` |
| D8 | 보존 | events.jsonl **14일**(일일 요약 회에 한 번 정리 `:799-812`) · `collect.log`·`dry-run.log` **정리 없음** · `posted.log` 정리 코드 **없음**(grep 0 · 런북 :15 에도 없음) | `collect.cjs:38` · 런북 :15 |
| D9 | 일일 요약 | 09:05 KST · `[ops] 일일 요약 · 살아 있음 · 열린 이상 N (…) · 어제 상위 …` → `#ops` | `collect.cjs:37,736-752` |
| D10 | 원문 없음 보장 근거 | 코드 주석 규칙 "jlist 원문 · 로그 원문 · .env 값은 파일·출력에 쓰지 않는다 — 지문 재료는 허용 문자 칸만"(`:15`) · 008 §135-137 [인용] | 정적 근거(실행 검증은 미측정) |
| D11 | OS 사용자 · 권한 | 수집기 = 서비스 계정 crontab(008 Q97 · 런북 :13) · 통합 층 = 같은 `$HOME`(`adv-inplace.sh:107-119` `$HOME/pleiades-$a` · `$HOME/.pm2`) · 비공개 루트도 같은 `~/pleiades-private`(통합 층 `private-dir.ts:10-12` · 수집기 `collect.cjs:83`) · hermes 도 `~/pleiades-hermes`·`~/pleiades-hermes-data`(같은 HOME) | **같은 OS 사용자가 셋 다 읽을 수 있다**(700/600 은 다른 사용자만 막는다) — 정적 근거 · 서버 실제 사용자는 미확인(I-3) |

## E. 매 질문 비용 근거

| # | 값 | 출처 |
|---|---|---|
| E1 | 읽기 도구 수 fin 25 · fit 27 (합 52) | 운영 C4 [인용 012:469] · domain.json B6 |
| E2 | 지식 fin 7,904 B · fit 12,509 B (합 20,413) | 운영 C4 [인용 012:469] (설계 시점 7,894 · 12,513 — `domains.ts:13` 주석 [N10]) |
| E3 | BASE_SYSTEM_PROMPT 576 B | `node -e` 로 `advisor.ts` 의 템플릿 리터럴 `Buffer.byteLength` |
| E4 | 운영 첫 질문 `context=23677` · 도구 호출 0 · `cost=$0.0991` · `turns=1` · `domains=2` | [인용 012:469 · #742] — **도구 정의 + 시스템 프롬프트 + 질문**의 하한 근사(도구 호출이 없었으므로) |
| E5 | 읽기 도구 설명 문자열 바이트(첫 문자열 리터럴만 · **하한**) — fin 25개 2,119 B · fit 27개 5,628 B | 정규식 `\.(tool\|registerTool)\(\s*'name'\s*,\s*'desc'` 로 `server.ts` 에서 추출 · 읽기 분류만 합산 · 등록 수 fin 59 · fit 28 일치. 문자열 연결(`'a' + 'b'`)·템플릿 조각은 첫 조각만 잡혀 실제보다 작다 |
| E6 | 입력 스키마(zod → JSON Schema) 크기 · `tools/list` 응답 바이트 | **미측정** — zod 변환은 실행해야 나온다. 로컬 MCP 기동은 격리 경계 작업(DB · 사용자 확인 필요)이라 하지 않았다. 서버 probe 출력에도 없다 |
| E7 | 도메인당 토큰 비용 분해(지식 vs 도구 정의) | **미측정** — E4 하나뿐이고 분해 근거가 없다. 산술 대용: 지식 20,413 B 는 한국어 위주라 토큰 환산 계수 미측정 |

## F. CLI 의 MCP 도구 지연 로드/검색

| # | 사실 | 출처 |
|---|---|---|
| F1 | 기능이 **존재한다** — env `ENABLE_TOOL_SEARCH` · 켜면 모델이 `ToolSearch` 내장 도구를 `tool_use` 로 부른다 | `deploy/advisor-x1/x1.cjs:247` 주석 "MCP 도구 검색 끔(ToolSearch tool_use 가 J2 거짓 실패 · #632 9-1 major 2)" |
| F2 | 통합 층은 **끈다** — `ENABLE_TOOL_SEARCH: "false"` | `apps/advisor/src/cli.ts:63` · 근거 `_workspace/239/stage3/01_surveyor_runtime.md:194` · `_workspace/239/4b3/01_surveyor_4b3.md:140` |
| F3 | 끈 이유 = 판정기: `ToolSearch` 는 허용 목록 밖 이름이라 `outside` 로 잡혀 실패(`judge.ts:113,209` · `--tools ""` 와 `--allowedTools` 체계) | 위 + A18 |
| F4 | 두 앱 advisor 는 이 env 를 **설정하지 않는다**(grep 0) — CLI 기본값을 따른다 | `LC_ALL=C /usr/bin/grep -rn -a ENABLE_TOOL_SEARCH apps/finance/src apps/fitness/src` → 0 |
| F5 | 지연 로드 시 토큰 절감량 · CLI 기본값 · 판본별 동작 · 켰을 때 init `tools` 목록 모양 | **미측정**(`claude-code-mechanisms.md` 에 기록 0 · 웹·로컬 실행 금지 지시) |

## G. 위키 제공자 자리 (#837)

| # | 이어받는 제약 | 출처 |
|---|---|---|
| G1 | 쓰기는 코드 명령만 · 모델은 기억을 쓰지 못한다 → #837 권고 ②(모델 제안 → 사용자 승인 → 코드 커밋)는 이 줄의 **정정**이 필요 | 012 §5-2 · #837 미결 |
| G2 | 키 `<사용자ID>/<도메인>` · 도메인은 K-0 id — 위키 페이지 구조가 "도메인별" 이면 같은 키 자리 | 012 §5-2 · §6 |
| G3 | 주입은 "데이터 — 지시 아님" 절 · 힌트 있으면 그 도메인만 · 상한 [D5] | 012 §5-2 · R-14(012:527) |
| G4 | 원문은 서버 비공개 파일에만 · 로그 줄에는 개수만 | 012 §5-2 |
| G5 | 기억이 들어오는 길은 하나 · `judgeInit` hook 이벤트 = 위반 | 012 §5-3 |
| G6 | 원장 단일 사용자 — 허용 사용자를 늘리면 같은 데이터를 본다(다중 사용자는 데이터 분리와 함께) | 012 §6 |
| G7 | 비공개 위치 재사용: `private-dir.ts` — `PLEIADES_PRIVATE_DIR` 또는 `~/pleiades-private` · 디렉터리 700 · 파일 600 · **조상에 `.git` 이 있으면 throw**(`insideGit` :15-20 · `ensurePrivateDir` :23-27) | `apps/advisor/src/private-dir.ts` |
| G8 | ⚠ G7 의 `insideGit` 는 **위키 디렉터리 자체가 로컬 git 저장소이면**(#837 확정: 로컬 git · remote 없음) 그 안의 경로에서 throw 한다 — 그대로 재사용 불가 · 위키 루트만 예외로 두는 규칙이 필요 | `private-dir.ts:15-20` · #837 |
| G9 | 백업: 서버 밖 사본 = 라즈베리파이 암호화 경로(#447 계열) · hermes 대기열은 백업 대상이 아님(014:164) — 위키는 대상 | #837 · 014 |
| G10 | #837 설계 조건 "질문마다 위키 전체를 싣지 않고 `search`·`read_page` 도구로" — 현 통합 층에는 **MCP 도구만 허용**(A18) · 위키를 도구로 내려면 MCP 서버(또는 통합 층 안 MCP)가 필요하고 A3·A8(포트 · `domain_knowledge` prompt 필수)를 v1 이 풀어야 한다 | A3 · A8 · #837 |

---

## 가정을 뒤집는 발견

1. **v0 는 "MCP + 포트 + 쓰기 분류 + 지식 prompt + Discord 채널 키" 를 모든 제공자에게 요구한다** (A3 · A8 · A27). hermes(MCP 의존 0 · C5), 수집기(상주 0 · 파일만 · D1), 위키(파일 + git)는 셋 다 이 모양이 아니다. 시험 A27 의 `mcp-config.json`·`DISCORD_CHANNEL_ID_<SUFFIX>` 항목은 Next 앱 advisor 전용이라 v1 에서 필수 → 선택으로 나뉘어야 한다.
2. **선언 파일 하나의 오류가 통합 층 전체를 멈춘다** (A5): `loadDomains` 가 throw → 모든 질문 `refused config`. 제공자가 늘수록 위험이 커진다. 자동 발견으로 바꾸면 "깨진 선언 = 그 제공자만 제외" 로 바꿔야 한다.
3. **hermes 의 개인정보 검사는 게시 직전이다** (C10). 걸린 메시지도 `blocked` 행으로 **원문이 30일 남는다**(C7 · C9). 이름·주소는 아예 못 잡는다(C11). 그리고 본문은 **외부 앱이 쓴 텍스트**다(myTangerine 주문 알림 등). hermes 본문을 읽기 도구로 내면 (a) 차단된 PII 원문이 모델로 간다, (b) matrix-intake 와 같은 프롬프트 주입 경로가 생긴다. 수치 `state.json`(C13)은 원문이 없다.
4. **세 프로세스가 같은 OS 사용자·같은 HOME** 이다 (D11). 700/600 은 통합 층이 `~/pleiades-private/ops/*` · `~/pleiades-hermes-data/state/hermes.db` 를 **직접 읽는 것을 막지 않는다** — 권한은 장벽이 아니고, 범위 제한은 코드(읽기 제공자 API)가 지켜야 한다. (서버 실제 사용자는 I-3 으로 미확인.)
5. **수집기 `posted.log` 는 게시 본문 그대로이고 정리 코드가 없다** (D4 · D8). 읽기 제공자가 `events.jsonl`(원문 없음 · 14일)이 아니라 `posted.log` 를 읽으면 보존 무한 · 게시 본문 범위가 된다.
6. **도구 검색(지연 로드)은 이미 있고 일부러 꺼 두었다** (F1~F3). "도메인 선택" 을 CLI 기능으로 풀려면 `ENABLE_TOOL_SEARCH` + `judge` 의 outside 판정 재설계가 짝이다 — 꺼 둔 이유(J2 거짓 실패)가 그대로 살아 있다.
7. **시스템 프롬프트 여유는 32 KB 도메인 2개분**(A13 산술 ≈ 79,000 B). 지식을 상한까지 쓰는 제공자가 3개 늘면 `system-too-large` 로 **모든 새 세션이 거부**된다(한 도메인만 빼지 않는다 · `advisor.ts:203-207`).
8. **위키를 로컬 git 으로 두면 기존 비공개 위치 규칙(`insideGit` throw)과 정면 충돌**한다 (G8).
9. `test_ssh_deploy.py:337` 은 도메인 목록 == 모델 핀 목록을 단정한다(A26) — 모델을 쓰지 않는 제공자를 넣으면 이 시험이 깨진다. 두 목록은 v1 에서 분리돼야 한다.
10. 지시서의 `KNOWLEDGE_MAX_BYTES 32KB` 는 정확히 **32,000 B**(`domains.ts:14`) · `SYSTEM_MAX_BYTES` 는 **100,000 B**(`advisor.ts:45`) — KiB 가 아니다.

## 미측정 (이유)

- `tools/list` 응답 · 스키마 바이트(E6) — MCP 기동 필요(격리 경계).
- 도메인당 토큰 분해 · 바이트→토큰 계수(E7) — 기록 1건뿐.
- 도구 검색 켠 상태의 CLI 동작 · 절감량(F5) — 웹·실행 금지.
- 서버 실제 OS 사용자 · `posted.log` 크기 · hermes.db 행 수 · blocked 행 실재 여부 — 서버 접근 금지(I-3).
- 수집기 "원문 없음" 의 실행 검증(D10) — 정적 근거만.
