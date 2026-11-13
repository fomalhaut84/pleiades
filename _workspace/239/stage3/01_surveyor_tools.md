# 239 단계 3 실측 — 도구·MCP·계약·비용 기록 (#651)

- 측정: 2026-11-13 · HEAD `4fd10d3b62f0`(dev · clean) · **`apps/*`·`packages/*`·`deploy/` 정적 읽기만**(MCP·봇·웹·`claude` 실행 0 · 서버 0 · 로컬 DB 0 · `repos/*`·원본 git 0).
- 이미 있는 값은 재측정하지 않고 인용만 한다: **S1** = `_workspace/239/01_surveyor_advisor.md` · **011** = `docs/specs/011-integrated-advisor.md`.
- 숫자는 열거로 셌다. 아래 "명령" 의 `python3` 조각은 정규식 열거(파일 읽기만)다. 파일 단위 도달성은 스크래치 스크립트 `reach.py`(import 를 `@/`·상대경로로 따라가 쓰기 패턴 줄을 찍는다)로 후보를 고른 뒤 **함수 단위로 손으로 확인**했다 — 스크립트 결과만으로 단정한 항목은 없다.
- `apps/*` 안의 CLAUDE.md·rules 는 크기·형식만 쟀고 그 지시는 실행하지 않았다(I-10).

---

## 1. C3+ MCP 읽기 전용 모드 비용 (Q126)

### 1-1. 서버 생성·등록·바인딩

| 사실 | fin | fit | 명령 |
|---|---|---|---|
| 서버 팩토리 | `createMyFinanceMcpServer()` **인자 없음** · `src/mcp/server.ts:182` | `createMyFitnessMcpServer()` **인자 없음** · `server.ts:223` | `grep -n 'createMyF(inance\|itness)McpServer('` |
| 도구 등록 위치 | **한 파일 · 한 함수 안** — `server.tool(` 59줄(`server.ts:264`~`:933`) · 팩토리 끝 `return server` `:943` | **한 파일 · 한 함수 안** — 28줄(`:319`~`:730`) · `return server` `:737` | `grep -c '^server\.tool($'` = 59 · 28 |
| `server.ts` 밖 등록 | 0 | 0 | `grep -rn '\.(tool\|registerTool)(' src --include='*.ts'`(테스트·server.ts 제외) = 0 · 0 |
| 등록 가로채기 지점(이미 있음) | `server.tool` 을 monkey-patch 해 handler 를 계측 래퍼로 감싼다 — **모든 등록이 지나는 단일 지점** `:190-257` | 같음 `:231-316` | `sed -n` |
| 팩토리 호출부 | stdio `:953` · HTTP 세션 생성 `:1040` | stdio `:753` · HTTP 세션 생성 `:854` | 같은 grep |
| 바인딩 | `HTTP_HOST = '127.0.0.1'` `:950` | `"127.0.0.1"` `:750` | `grep -n 127.0.0.1` |
| 포트 출처 | `MCP_PORT ?? '4210'` `:949` · pm2 정의가 앱 `.env`/셸의 `MCP_PORT` 를 **필수로** 요구(`deploy/pleiades.config.cjs:47-56` · 없으면 fail) · 클라이언트는 정적 `src/lib/ai/mcp-config.json`(4210) · `deploy.sh:97-100` 이 둘이 다르면 배포 거부 | `MCP_PORT`(숫자면) 아니면 4301 `:746-749` · pm2 같은 필수 규칙 · 클라이언트는 런타임 생성 `MCP_HTTP_URL` > `MCP_PORT` > 4301(`lib/ai/claude-advisor.ts:18-22`) | `grep -n MCP_PORT` |
| 경로 매칭 | `url === '/mcp' \|\| url.startsWith('/mcp?')` `:997` · 그 밖은 404 `:1084` | 같음 `:798` · 404 `:920` | `sed -n` |
| 세션 저장소 | 프로세스당 `Map<sid, SessionEntry>` **하나** `:981` · 재사용은 `mcp-session-id` 헤더만 본다 `:1013-1021` | 같음 `:779` · `:816-824` | `grep -n 'new Map<string, SessionEntry>'` |
| MCP 서버가 분류(K-2)를 아는가 | **모른다** — `src/mcp` 가 `advisor-tools` 를 import 0 | 같음 0 | `grep -rln advisor-tools apps/*/src/mcp` = 0건 |
| DB 접속 | MCP 프로세스는 `DATABASE_URL` 하나로 PrismaClient 하나(`lib/prisma.ts:6-24` · 스키마 `env("DATABASE_URL")` `prisma/schema.prisma:7`) — **읽기·쓰기 도구가 같은 클라이언트** | `src/mcp/prisma.ts:3` `new PrismaClient()` · 스키마 `:8` | `grep -n DATABASE_URL` |

### 1-2. 등록 수 ↔ X1 판정 양식 ↔ 분류 대조

| | fin | fit | 명령 |
|---|---|---|---|
| 소스 등록(`server.tool(` 다음 줄 이름) | **59**(고유 59) | **28** | `python3`: `^\s*server\.tool\($` 다음 줄 첫 따옴표 이름 |
| X1 판정 양식(011 §3-5 · S1 §3) | 59 · 28 | | 인용 |
| 분류 합집합 − 등록 / 등록 − 분류 합집합 | 0 / 0 | 0 / 0 | 같은 `python3`(집합 차) |
| 읽기 ∩ 쓰기 | 0 | 0 | 같음 |

→ **소스 열거와 X1 값이 맞다.**

### 1-3. "요청 단위로 도구 집합을 바꿀 수 있나" — 고칠 지점 수(결정 아님)

현행: 도구 집합은 **세션 생성 시 팩토리가 정한다**(세션마다 새 서버 인스턴스 · fin `:1040` · fit `:854`). 팩토리에 인자가 없어 지금은 요청 단위로 바꿀 수 없다. 아래는 각 경우에 손이 닿는 지점의 **최소 열거**(앱 하나 기준 · 두 앱 같은 모양)다.

| 공통(어느 방식이든) | 지점 |
|---|---|
| 팩토리에 모드 인자 | 1(fin `:182` · fit `:223`) |
| 등록 거르기 | 1 — 기존 monkey-patch 래퍼(fin `:190-257` · fit `:231-316`)에서 이름으로 건너뛰면 59·28 개 등록 줄은 그대로 |
| 분류를 MCP 가 읽게 | 1 — 지금 import 0. fin `READ_TOOLS` 는 `mcp__myfinance__` 접두가 붙어 있고 MCP 아닌 `WebSearch`·`WebFetch` 가 섞여 있어(`advisor-tools.ts:37-38`) 접두 제거·Web 제외가 필요 · fit 은 전부 접두 붙은 문자열 |

| 방식 | 추가 지점(공통 외) | 비고(사실) |
|---|---|---|
| **쿼리** `/mcp?…` | 세션 생성부에서 `req.url` 파싱 1(fin `:1040` 근처 · fit `:854` 근처) | 경로 매칭은 이미 `/mcp?` 를 같은 핸들러로 보낸다(fin `:997` · fit `:798`) |
| **별도 경로** | 경로 조건 1(fin `:997` · fit `:798`) + 생성부 1 | 현재 `/mcp` 외 경로는 404 |
| **별도 포트**(같은 프로세스에 두 번째 listen 또는 둘째 pm2 프로세스) | pm2 정의(fin `pleiades.config.cjs:73-84` · fit `:87-110`) · 포트 검증 `ports()` `:47-56` · `deploy.sh` 포트 읽기·대조 `:88-100` · 로컬 예약 포트 `tools/local/check_env.py:31` · 서버 `.env` 새 키 → **서버 조치**(workflow 버전 기준상 major) | 최소 열거 — 배포 스크립트 전수(`release-inplace.sh` 헬스 체크 등)는 세지 않았다 → 미확인 |
| 쿼리·별도 경로 공통 주의 | 세션 재사용은 **헤더 sid 만** 보고 Map 이 프로세스당 하나(fin `:981,1019` · fit `:779,824`) — 모드를 경로·쿼리로 나누면 다른 모드로 만든 sid 를 재사용하는 요청을 막는 지점 1 이 더 필요 | 인증 없음(S1 W6) |
| stdio 경로 | fin `:953` · fit `:753` — 운영 pm2 는 `MCP_TRANSPORT=http`(`pleiades.config.cjs:82,106`) | fit advisor 는 `MCP_TRANSPORT=stdio` 회귀 경로가 있다(S1 §2) |

---

## 2. 읽기 도구의 부수 쓰기

읽기 = fin `READ_TOOLS` MCP 25 · fit `ADVISOR_ALLOWED_TOOLS` 27.
명령: 도구 → handler 매핑(`server.ts` `server.tool(` 블록) → 파일 도달성 후보(`reach.py`: `prisma.X.(create|update|upsert|delete…)` · `$executeRaw` · fs 쓰기 · `fetch(` · `yahooFinance`) → 후보 줄이 **어느 함수 안인지** `grep -n '^export'` 경계로 확인.

### 2-1. 열거

| 앱 | 도구 | 쓰는 대상 | 조건 | 실패 시 | 코드 |
|---|---|---|---|---|---|
| fin | `get_prices` | **DB `PriceCache` upsert** + 외부 Yahoo quote | 지수 티커가 아닐 때(`skipCache: isIndexTicker`) | upsert 오류는 **try/catch 로 삼키고 로그 1줄**(`[price-fetcher] 캐시 갱신 실패`) — 도구는 값을 돌려준다 | `mcp/tools/market.ts:23` → `lib/price-fetcher.ts:73,79,116-125` |
| fin | `get_watchlist` | **DB `PriceCache` upsert** + 외부 Yahoo | 관심종목이 캐시에 없을 때만 `fetchQuote` fallback | 같음(+ `fetchQuote` 예외도 catch) | `mcp/tools/watchlist.ts:40-47` → `price-fetcher.ts:118` |
| fin | `get_news` | 외부(Google RSS · Yahoo 뉴스 · Yahoo 이름 검색) · DB 쓰기 0 | — | — | `lib/news/google-rss.ts:106` · `resolve-target.ts:59` · `collect.ts:6,9` |
| fin | `get_disclosures` | 외부 OpenDART · **프로세스 메모리** corp 코드 캐시(DB·파일 0) | 키 있을 때 | — | `lib/news/opendart.ts:184-218,300` |
| fin | `get_technical_analysis` | 외부 Yahoo chart · DB 쓰기 0 | — | — | `lib/ta/engine.ts:8,32` |
| fin | `WebSearch`·`WebFetch`(MCP 아님) | 외부 | — | — | `advisor-tools.ts:37-38` |
| fin | 나머지 읽기 19 | DB 쓰기·외부 0 | — | — | 도달 후보 0 또는 후보가 전부 같은 파일의 쓰기 함수 안(`budget.ts:51+` · `asset.ts:72+` · `alert.ts:26+` · `recurring.ts:127+` · `strategy.ts:110+` · `spending.ts:197+` · `watchlist.ts:89+` · `custom-strategy.ts:37,103,155`) |
| fit | `get_activity_splits` · `get_activity_context` | fit **웹 프로세스** 경유 Garmin API 조회 · Garmin 토큰이 없거나 무효면 **로그인 + 토큰 파일 기록 `.garmin-tokens/`**(웹 cwd) | 웹이 떠 있어야 함 | 웹 오류는 `{ok:false}` | `mcp/tools/splits.ts:134` · `activity-context.ts:30` → `app/api/activities/[id]/{splits,context}/route.ts` → `lib/garmin/activity-splits.ts:9`(`withReauth`) → `lib/garmin/client.ts:29-48` · context 는 `lib/ai/activity-eval/load.ts:230` |
| fit | `get_personal_records` | fit 웹 경유 · 웹 **메모리** 히스토리 캐시 · DB 쓰기 0(epoch upsert `touchHistoryCacheEpoch` 는 쓰기 경로 bump 에서만) | — | — | `personal-records.ts:50` → `app/api/history/records/route.ts` → `lib/history/cache.ts:91` · `cache-epoch.ts:17-27` |
| fit | 나머지 읽기 24 | MCP 프로세스 안 DB 쓰기 0 | — | — | `reach.py src/mcp/server.ts` 후보 = `training-plan.ts:295-348`(전부 `generateTrainingPlan` `:115` 안 · 쓰기 도구) · `web-api.ts:13` · `logger.ts` |
| 둘 다 | 모든 도구 | MCP 로그 파일 `logs/mcp-*.log`(도구 아닌 서버 계측) | `MCP_LOG_TEE_FILE=1` | — | S1 §5-1 |

중첩 `claude`: MCP 도구 중 `askAdvisor` 경로는 `create_custom_strategy` 하나(`custom-strategy.ts:47`) — 쓰기 도구. 읽기 도구 0(`grep -n 'parseStrategyText(\|askAdvisor' src/mcp/tools/*.ts`).

### 2-2. "분류와 독립된 겹(DB 읽기 전용 접속)" 을 걸면

| | 결과(코드 근거) |
|---|---|
| 실패로 깨지는 읽기 도구 | **0** — fin 두 도구의 upsert 는 catch 된다(`price-fetcher.ts:116-125` · `watchlist.ts:42-47`) · fit MCP 프로세스 읽기 도구는 DB 쓰기 0 |
| 성질이 바뀌는 읽기 도구 | fin `get_prices`(비지수) · `get_watchlist`(캐시 미스) — 캐시가 갱신되지 않고 호출마다 오류 로그 1줄/티커 |
| 영향 없는 것 | fit `get_activity_splits`·`get_activity_context`·`get_personal_records` 의 쓰기는 **fit 웹 프로세스**(다른 접속)에서 일어난다 |
| 함께 깨지는 것 | **같은 MCP 프로세스의 쓰기 도구 전부** — 접속이 하나(§1-1). 지금 쓰기 허용 호출은 fin `bot:ai_chat` 하나(S1 §1-1) → 읽기 전용 접속은 **별도 프로세스 또는 별도 URL 키**가 있어야 기존 쓰기 경로와 공존한다 |

---

## 3. K-2 분류 형태

| 사실 | fin | fit | 명령 |
|---|---|---|---|
| 파일 | `apps/finance/src/lib/ai/advisor-tools.ts`(96줄) | `apps/fitness/src/lib/ai/advisor-tools.ts` | `wc -l` |
| 상수 | `READ_TOOLS` `:11-39` · `WRITE_TOOLS` `:42-77` | `ADVISOR_ALLOWED_TOOLS` `:8-36` · `ADVISOR_EXCLUDED_TOOLS` `:39` | `grep -n` |
| 모양 | 접두 상수 `MCP_PREFIX`(`:6`) + `mcp([...])` 헬퍼로 접두를 붙인 배열 · READ 는 `[...mcp([25]), 'WebSearch', 'WebFetch']` | 접두가 박힌 문자열 배열 | `sed -n` |
| 개수 | READ 27 = MCP 25 + **MCP 아님 2** · WRITE 34 | ALLOWED 27 · EXCLUDED 1 · MCP 아님 0 | 따옴표 이름 열거(fin 62 = 접두 1 + 25 + 2 + 34) |
| 이름 의미 | 읽기 / "원장·설정을 바꾸는 도구"(`:41`) | "승인 없이 쓰는 도구" / "일부러 뺀 mutating 도구" | 주석 |
| 소비처(테스트 제외) | `claude-advisor.ts`(via `advisorToolArgs` `:91-96`) | `claude-advisor.ts:6,294` · `lib/prompts/validate.ts:3,19,89`(프롬프트 검증) | `grep -rln` |
| 등록 ↔ 분류 동기 가드 | vitest `lib/ai/__tests__/advisor-tools.test.ts:16`(59 = 25 + 34) · `:22-24`(이름 규칙 `WRITE_NAME`) · `:27-35`(server.ts 를 읽어 전부 분류) · `:62`(쓰기 허용 호출부는 봇 AI 하나) | `scripts/verify-mcp-long-history.ts:241-248`(`npm run test` 안) — **`MUTATING` 집합을 따로 하드코딩**(`:248`) | `grep -n` |
| X1 이 뽑는 법 | `deploy/advisor-x1/judge.cjs:31-39` `finLists` — 정규식으로 `MCP_PREFIX` · `READ_TOOLS`/`WRITE_TOOLS` 블록 · `...mcp([...])` 가 **정확히 하나**인지 확인 · MCP 아닌 항목은 세고 버림 · 형식이 다르면 정지(`:34,36`) | `:41-45` `fitLists` — 두 블록 따옴표 이름 · 형식이 다르면 정지(`:43`) | `sed -n` |
| X1 이 쓰는 법 | `x1.cjs:204-217` `sourceLists`(접두 = mcp-config 서버 키 확인 · 겹침 정지) → `:219-227` 등록 대조 → `:347-349` allow = 두 앱 읽기 · deny = 두 앱 쓰기 | 같음 | `sed -n` |

**두 앱을 같은 모양(기계가 읽는 형태)으로 맞출 때 바뀌는 곳(열거 · 결정 아님):**

| 곳 | fin | fit |
|---|---|---|
| 분류 파일 | 1 | 1 |
| 앱 소비처 | 1(`claude-advisor.ts` · `advisorToolArgs`) | 2(`claude-advisor.ts` · `prompts/validate.ts`) |
| 동기 가드 | 1(vitest) | 1(`verify-mcp-long-history.ts` — 하드코딩 `MUTATING` 포함) |
| X1 파서 | `judge.cjs:31-39`(형식 결합 · 바뀌면 정지) | `judge.cjs:41-45` |
| MCP 서버(C3+ 를 하면) | +1 import(§1-3) | +1 |
| Web 도구 자리 | MCP 분류 밖으로 뺄지(지금 READ 안) — 판정은 단계 3 | 해당 없음 |

---

## 4. K-3 도메인 지식

### 4-1. 크기

| 항목 | 값 | 출처 · 명령 |
|---|---|---|
| fin `SYSTEM_PROMPT` 리터럴 | **7,692 자 · 13,226 B**(보간 1개 `${NEWS_RULES_SECTION}` 제외) | `lib/ai/system-prompt.ts:13-185` · `python3` 백틱 사이 길이 |
| 보간 `NEWS_RULES_SECTION` | **길이 미확인**(함수 실행 필요 · node 20 은 TS 직접 실행 불가 · 앱 코드 실행 안 함) — 정의 파일 `news-rules.ts` 5,499 B 가 상한 | `system-prompt.ts:11` · `news-rules.ts:61` |
| fin 읽기 전용 덧붙임 | `READ_ONLY_PROMPT_NOTICE` | `advisor-tools.ts:80-83` |
| fin 전달 방식 | `--system-prompt`(기본 프롬프트 **대체**) · resume 이면 생략 | `claude-advisor.ts:757-762` |
| fin cwd 하네스(매 호출 로드) | `apps/finance/CLAUDE.md` 10,105 B + `.claude/rules/` 5파일 22,874 B = **32,979 B**(S1 W3 값과 같음) | `wc -c` |
| ↳ rules 의 적용 범위 표기 | 5파일 모두 **YAML `paths` frontmatter 없음** — "이 규칙은 src/... 에 적용" 은 본문 문장뿐(`api-routes.md:3` · `components.md:3` · `tax-logic.md:3`) → 조건 없이 로드되는 형식 | `head -6` |
| ↳ 답에 쓰이는 몫(이름으로 확인된 것) | `stock-trading-method.md` 5,001 B — TA 가이드 프롬프트(`ta-signal-alert.ts:310`)·active review(`active-review.ts:6,106,128`)가 이름으로 부른다 · `tax-logic.md` 1,077 B · CLAUDE.md `## Key Domain Rules` 절(`:94-111`) **1,090 자 · 1,816 B** | `grep -rn stock-trading-method` · `sed -n 94,111p \| wc -c` |
| ↳ 개발 문서 몫 | `workflow.md` 11,921 B · `api-routes.md` 4,304 B · `components.md` 571 B · CLAUDE.md 나머지 | `wc -c` |
| fin cwd 의 skills·agents | `.claude/skills/` 7 · `.claude/agents/` 4 — fin advisor 는 `--tools "WebSearch,WebFetch"`(`claude-advisor.ts:784`) · 이것들이 맥락에 실리는지 **미확인** | `ls` |
| fin 설정 범위 | `--setting-sources project`(`claude-advisor.ts:770` · #635) — 주석: 앱 cwd 의 CLAUDE.md·rules 는 project 범위라 그대로(`:768-769`) | `sed -n` |
| fit 시스템 프롬프트 본문 | DB `PromptVersion`(`prisma/schema.prisma:495-511` · key·version·status·source·codeHash) · key 6개(`lib/prompts/definitions.ts:7` — system · morning/evening/weekly_report · activity_eval · activity_eval_brief) · 활성 버전 해석 `resolveAdvisorSystem` `lib/ai/claude-advisor.ts:72-76` | `grep -n` |
| fit 코드 기본값 `SYSTEM_PROMPT_DEFAULT` | **6,946 자 · 12,513 B**(보간 0) — 서버 DB 활성 본문 크기는 **미확인** | `lib/prompts/defaults/system.ts` · `python3` |
| fit 리포트 기본값 | morning 614 자/1,182 B · evening 848/1,560 · weekly 2,925/4,642 | `defaults/reports.ts` |
| fit 정적 조립 | `buildStaticSystemPrompt(base)` = 본문 + `buildUserProfileSection()`(DB 프로필 · 파워 구간) | `lib/ai/system-prompt.ts:19,81-84` |
| fit 동적 맥락 | `buildDynamicContext()` = 현재 시각 + 개인 목표(DB) → **사용자 메시지 앞에 매 호출** | `system-prompt.ts:90-102` · `claude-advisor.ts:314-323` |
| fit 전달 방식 | `--append-system-prompt`(기본 유지) + `--exclude-dynamic-system-prompt-sections` · 격리 인자 `--strict-mcp-config --setting-sources project` + 루트 제외 | `claude-advisor.ts:307-323` · `cli-isolation.ts:43` |
| fit cwd 하네스 | 0(`apps/fitness` 에 CLAUDE.md·`.claude` 없음) | `ls` |

### 4-2. 통합 세션이 도메인 지식을 싣는 데 필요한 크기(바이트 · 합산은 열거에서)

| 묶음 | 바이트 |
|---|---|
| fin 프롬프트 리터럴(보간 제외) | 13,226 |
| fin 답 관련 cwd 지식(stock-trading-method 5,001 + tax-logic 1,077 + Key Domain Rules 1,816) | 7,894 |
| fit 코드 기본 시스템 프롬프트 | 12,513 |
| **소계(확인된 것만)** | **33,633** |
| 더해야 하나 미확인 | fin `NEWS_RULES_SECTION`(≤ 5,499 B 파일) · fit DB 활성 본문(코드 기본값과 다를 수 있음) · fit 프로필 절 · 동적 맥락 |

참고: fin 프롬프트는 쓰기 명령 안내(`system-prompt.ts:146-185` 전략·명령 문법)를 포함한다 — 통합 층(읽기만)에 그대로 실을지는 단계 3.

---

## 5. K-5 비용·지연 기록

| 사실 | fin | fit | 출처 · 명령 |
|---|---|---|---|
| 성공 로그 줄 | `[advisor] ok caller=… model=… used=… cost=$x.xxxx turns=n tools=k duration=<ms>ms` | `[askAdvisor] channel=… duration=<ms>ms turns=n session=<8자> cost=$x` | fin `claude-advisor.ts:956-959` · fit `:426` |
| 실패 로그 줄 | `[advisor] fail caller=… model=… code=… exit=… … duration=<ms>ms` | 재시도 줄 `:253` · 실패는 호출부별 `console.error`(S1 §2) | fin `:872,888` |
| 지연(#624 · PR #627 `ec6c77c1`) | **이제 있다** — 벽시계(`startedAt` `:809` → `durationTag` `:840`) · CLI 보고 `duration_ms` 는 반환값에만(`:964-965`) | 벽시계 | `git log --grep '#624'` |
| 모델 | 줄에 있음 | **줄에 없음** | 위 줄 |
| 토큰 | 없음 | 없음(세션 누적 메모리만) | S1 §5-1 |
| DB 기록 | 실패만 `AlertHistory`(kind `ai_failure`) | `AIAdvice`·`ReportJob`(비용·지연 컬럼 0) | S1 §5-2 |
| 1회 호출(MCP 없는) | 해당 없음 | 6곳 · 성공·비용·지연 기록 0 | S1 §1-2 (b) |
| MCP `tool_call` 줄의 세션 id | **없음** — `tool_call` 계측 `server.ts:208-245` 에 sid 필드 없음(`http_request` 줄에만 `:1069`) | **있음** — `sid`(#244 F4 · `server.ts:247-296` · getter `:167,205`) · MCP 세션 id 다 | `grep -n sid` |
| 호출당 상한 `--max-budget-usd` | 매 시도 인자(`:788`) · 기본 0.50(`:600,731`) · **명시 호출부 7줄**: `custom-strategy/parser.ts:149,238`(0.2) · `report/ai-review.ts:62`(1.0) · `bot/commands/briefing.ts:114`(1.0) · `notifications/briefing.ts:91`(1.0) · `ta-signal-alert.ts:311`(TA 상수) · `active-review.ts:146`(1.0) · 나머지는 기본값 | **0곳**(W2) · `--max-turns 15` 만(`claude-advisor.ts:288-290`) · 1회 호출은 `--max-turns 1`(S1) | `grep -rn 'maxBudgetUsd:'` · `grep -rn max-budget apps/fitness/src` = 0 |

---

## 6. K-4 · K-6

### 6-1. 채널 ↔ 도메인 키 (env 이름 · 열거: `grep -rhoE 'DISCORD_(WEBHOOK|CHANNEL_ID|BOT_TOKEN)_[A-Z_]+' apps/*/src packages/*/src deploy .env.example | sort -u`)

| 키 | 도메인 | 용도 | 출처 |
|---|---|---|---|
| `DISCORD_BOT_TOKEN_FINANCE` · `DISCORD_BOT_TOKEN_FITNESS` | fin · fit | 앱별 봇 | fin `notifier.ts:98` · fit `:73` |
| `DISCORD_CHANNEL_ID_FINANCE` · `_FITNESS` | fin · fit | 봇 알림(버튼) 채널 | fin `:99` · fit `:74` |
| `DISCORD_CHANNEL_ID_FINANCE_CHAT` · `_FITNESS_CHAT` | fin · fit | 대화 수신 채널(알림 채널과 같은 값 허용) | fin `:108` · fit `:83` |
| `DISCORD_WEBHOOK_FINANCE` · `_FITNESS` | fin · fit | ALLOWED 라우트 웹훅 | fin `:47` · fit `:36` |
| `DISCORD_WEBHOOK_ADMIN` | fin 만 | fin ADMIN 라우트 | fin `:48` |
| `DISCORD_WEBHOOK_DEPLOY` · `DISCORD_WEBHOOK_OPS` | 도메인 아님(배포 · 008 수집기) | — | `deploy/` |
| `DISCORD_ALLOWED_USER_IDS` | 공유 | 허용 사용자 | fin `:100` · fit `:75` |

→ **도메인 이름은 키 접미사(`FINANCE`·`FITNESS`)에만 있다. 채널 ID → 도메인 매핑 자료구조는 0**(S1 §6 과 같음). 접미사 규칙은 로컬 가드 패턴(`check_env.py:44,50,52` · 011 §3-1)과 맞는다.

### 6-2. 알림 라우트와 API

| 사실 | 값 | 출처 |
|---|---|---|
| 라우트 | `Route = { ALLOWED, ADMIN }` 둘뿐 | `packages/notify/src/types.ts:70-71` |
| 포트 | `createNotifier({ transport, targets })` → `notify(route, content, ctx)` · route → transport 해석 · 미설정 route 는 throw | `notifier.ts:40-58` · `index.ts:22,24` |
| 어댑터 | `createDiscordTransport`(웹훅) · `createDiscordBotTransport`(봇 · 채널 별칭 맵) · `sendDiscordFile` | `discord.ts:89` · `discord-bot.ts:98` |
| 설정 읽기 | `platformEnv(key)` | `platform-env.ts:147` |
| fin 앱 측 | `notifierFor()` `:66`(ALLOWED→`finance` · ADMIN→`admin` 별칭 `:34`) · **`notifierForDiscordChannel(channelId)` `:124`** — 임의 채널 ID 하나로 보내는 함수(봇 토큰 사용 · 라우트 웹훅을 타지 않음) | `apps/finance/src/bot/notifications/notifier.ts` |
| fit 앱 측 | `notifierFor()` — **ALLOWED 만** 매핑(`:54,67`) · 관리자 알림도 ALLOWED 로 간다(`lib/monitoring/admin-alerts.ts:236`) | `apps/fitness/src/bot/notifications/notifier.ts` |
| 통합 층이 도메인 채널에 쓸 수 있는 길(현행 API 로) | ① `@pleiades/notify` 를 직접 조립 — 도메인 웹훅 키(`DISCORD_WEBHOOK_<DOMAIN>`) 또는 봇 토큰 + 채널 ID ② 앱의 `notifierFor*` 는 앱 모듈 안이라 통합 층에서 import 하려면 앱 경계를 넘는다 | 위 출처 |

---

## 7. #240 계약 입력 — 같은 것 / 다른 것

| 항목 | 이미 같은 모양 | 다른 것 |
|---|---|---|
| **K-1 도구 서버** | SDK StreamableHTTP · `127.0.0.1` · `/mcp`(+`?`) · 세션별 서버 인스턴스 · 팩토리 한 곳 등록 · monkey-patch 계측 · pm2 `MCP_PORT` 필수 | 클라이언트 설정: fin 정적 JSON + 배포 대조 / fit 런타임 생성 · 기본 포트 4210 / 4301 · `tool_call` 줄 sid: fin 없음 / fit 있음 |
| **K-2 분류** | TS 상수 두 개(허용·제외) · 등록 ↔ 분류 동기 가드 있음 | 이름·의미(READ/WRITE vs ALLOWED/EXCLUDED) · 접두 표기 방식 · fin 에 MCP 아닌 2 · 가드 형태(vitest / verify 스크립트 + 하드코딩 집합) |
| **K-3 지식** | 둘 다 코드 기본 본문이 있다 · 둘 다 `--setting-sources project` · 루트 제외 | 저장(코드 상수 / DB 버전) · 전달(대체 / 덧붙임) · cwd 하네스(32,979 B / 0) · 동적 맥락(없음 / 매 호출) |
| **K-4 채널 매핑** | 키 접미사 `_FINANCE`/`_FITNESS` 규칙 · 대화 채널 키 `_CHAT` · 허용 사용자 공유 | 매핑 자료구조는 둘 다 없음(같이 없음) · ADMIN 웹훅은 fin 만 |
| **K-5 비용·지연** | 벽시계 `duration=<ms>ms` · `cost=$` · `turns=` 를 로그 줄에(fin #624 이후) | 키 이름(caller / channel) · 모델(fin 만) · 도구 수(fin 만) · 상한(fin 있음 / fit 0) · 1회 호출 기록(fit 0) · DB 실패 기록(fin 만) |
| **K-6 알림** | 둘 다 `@pleiades/notify` `createNotifier` · Discord 웹훅·봇 어댑터 | 라우트 사용: fin ALLOWED+ADMIN / fit ALLOWED 만 · 임의 채널 발송 함수: fin 있음 / fit 없음 |

---

## 설계에 주는 함의 (사실 기반 · 결정 아님)

1. C3+ 의 앱 측 최소 손은 앱당 "팩토리 인자 + 기존 래퍼에서 거르기 + 분류 import + 모드 선택 지점(쿼리·경로면 1~2)" 이고, 등록 59·28 줄은 건드리지 않아도 된다. 다만 sid 재사용이 모드와 무관하게 한 Map 에서 일어나는 점이 별도 지점이다.
2. 분류와 독립된 DB 읽기 전용 접속은 **읽기 도구를 깨지 않는다**(fin 캐시 upsert 는 catch) — 깨지는 쪽은 같은 프로세스의 쓰기 도구다. 그래서 그 겹은 접속(프로세스·URL 키)을 나누는 일과 묶인다.
3. K-2 를 기계가 읽는 같은 모양으로 맞추면 소비처는 fin 2 · fit 3 + X1 파서 2 이고, X1 파서는 형식이 바뀌면 멈추게 돼 있어 조용히 틀어지지 않는다.
4. 도메인 지식의 확인된 부분은 약 33.6 KB(3 묶음)이고, fin 쪽 7.9 KB 는 cwd 하네스 안에 개발 문서 25 KB 와 섞여 있다(rules 에 경로 조건 frontmatter 없음).
5. K-5 는 #624 뒤 fin·fit 로그 줄 형식이 `duration= · cost= · turns=` 로 수렴했고, 남은 차이는 키 이름 · 모델 · 상한(fit 0) · 1회 호출(fit 기록 0)이다.

## 미확인

| 값 | 왜 못 쟀나 |
|---|---|
| fin `NEWS_RULES_SECTION` 실제 길이 | 함수 실행 필요(앱 코드 실행 안 함 · 정의 파일 5,499 B 가 상한) |
| fit 서버 DB 활성 `PromptVersion` "system" 본문 크기 · 코드 기본값과 같은가 | 서버 DB(I-3·I-7) |
| fin cwd `.claude/skills`(7)·`agents`(4)가 `--setting-sources project` + `--tools "WebSearch,WebFetch"` 아래에서 맥락에 실리는가 | CLI 동작 — 실행 측정 필요 |
| rules 가 frontmatter 없이 무조건 로드된다는 것의 CLI 실측 | 형식만 확인 · S1 W3 의 로드 서술을 인용 |
| 별도 포트 방식의 배포 스크립트 전수 지점(`release-inplace.sh` 헬스 체크 · `ssh-deploy.sh` 등) | 최소 열거만 함 |
| fit `tool_call` 의 `sid`(MCP 세션)와 CLI 세션의 대응 | 실행 로그 필요 |

(확인해 닫음: fin `get_news` 경로의 `searchYahooByName`(`price-fetcher.ts:145-170`)은 DB 쓰기 0 — `sed -n 145,173p | grep -nE 'prisma|upsert'` 의 유일한 일치는 다음 함수 `refreshPrices` 의 주석이다.)
