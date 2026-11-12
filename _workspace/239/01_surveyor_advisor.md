# 239 Phase 1 실측 — 현행 advisor (fin·fit) · 통합 어드바이저 설계 입력

- 측정: 2026-11-12 · HEAD `1d9eadc23d49`(브랜치 `chore/239-1` · 측정 시점 dev 와 같음) · **`apps/*` 정적 읽기만**(봇·웹·MCP·`claude` 실행 0 · 서버 0 · 로컬 DB 0)
- `measured-facts.md` 의 2026-09 advisor 측정(원본 저장소 기준)은 참고만 했고 아래 값은 전부 `apps/*` 현행에서 다시 쟀다.
- 서버 값(호출 수 · 지연 · 비용 · 실패)은 **못 쟀다** → 판정 스크립트 `.server-scripts/23-server-239-advisor-cost.sh`(§5-3 · 사용자 실행).

## 0. 경고 — 가정을 뒤집는 발견

| # | 발견 | 뒤집는 가정 | 근거 |
|---|---|---|---|
| W1 | **fin 성공 로그에 지연이 없다.** `[advisor] ok` 줄은 caller·모델·cost·turns·tools 만 쓰고 `durationMs` 는 반환값에만 있다(웹 `/api/ai/ask` 응답 · 기록 없음). **fin 성공 호출의 지연은 서버 어디에도 남지 않는다** — 크론 caller 만 "끝 시각 − 크론 시각" 상한으로 추정 가능 | 이슈 축 H *"advisor 호출당 지연은 측정 필요"* — 측정할 기록이 fin 절반에 없다. 정확한 기준선은 로그 1줄 추가(코드 변경) 뒤에야 생긴다 | `apps/finance/src/lib/ai/claude-advisor.ts:950-953` |
| W2 | **fit advisor 에는 비용 상한이 없다.** fit `askAdvisorOnce` 는 `--max-budget-usd` 를 넘기지 않는다(턴 상한 `--max-turns 15` 만). fin 은 호출마다 상한(기본 $0.50 · 크론 $1.0 · 재시도 합산 cap) | "advisor 비용은 앱마다 묶여 있다" — fit 쪽은 턴 수로만 묶인다 | fit `claude-advisor.ts:268-300` · `git grep -n "max-budget" -- apps/fitness/src` = 0 |
| W3 | **fin advisor 의 답변 맥락에 개발 규칙이 섞인다.** CLI cwd = `apps/finance` 라 `apps/finance/CLAUDE.md`(10,105 B) + `.claude/rules/` 5파일 22,874 B(그중 개발 `workflow.md` 11,921 B · `api-routes.md` 4,304 B)가 매 호출 로드된다(루트 것만 #247 로 뺐다). **TA 가이드 프롬프트는 `stock-trading-method 프레임워크` 를 이름으로 부른다 — 그 정의가 이 rules 자동 로드에 기대고 있다.** fit 은 `apps/fitness` 에 CLAUDE.md·`.claude` 가 없다(0) | "도메인 지식은 시스템 프롬프트에 있다" — fin 은 일부가 **cwd 의 하네스 파일**에 있다. 통합 세션의 cwd 를 바꾸면 fin 매매 방법론이 조용히 빠진다 | fin `cli-isolation.ts:14-17` · `ta-signal-alert.ts:310` · `wc -c` §2-4 |
| W4 | **fin MCP 쓰기 도구 하나가 그 안에서 `claude` 를 또 띄운다.** `create_custom_strategy` → `parseStrategyText` → `askAdvisor`(caller `strategy:parse`) — MCP 프로세스에서 중첩 CLI. 쓰기 허용 호출(`bot:ai_chat`)에서만 닿는다 | "MCP 도구는 DB 조회·쓰기뿐" — 다단 호출 비용(축 H)이 MCP 도구 안에도 있다 | `apps/finance/src/mcp/tools/custom-strategy.ts:9,47` |
| W5 | **fit Discord 대화는 사용자·채널 구분 없이 세션 1개 · 동시 1건(프로세스 전체)이다.** 세션 키 = 고정 문자열 `"discord"` · 잠금 = 모듈 전역 `isProcessing`. fin 은 `discord:<채널>:<사용자>` 별 세션·잠금 | 축 D *"대화 연속 단위"* 의 현재값이 앱마다 다르다(fin 채널×사용자 · fit 전역) | fit `bot/commands/ai.ts:16,19,113` · fin `bot/commands/ai.ts:37-46` · `core/state-key.ts` |
| W6 | **교차 도메인 경로는 현재 0 이고, 막는 것은 코드가 아니라 실행 위치다.** 두 MCP 서버 모두 `127.0.0.1` HTTP · 인증 없음 · 다중 세션이라, 서버에서 같은 OS 사용자로 뜬 셋째 프로세스가 `--mcp-config` 하나에 둘을 적으면 앱 코드 변경 없이 붙는다. 다만 **MCP 서버 쪽에 읽기 전용 모드가 없다** — fin 은 59 도구 전부를 아무 클라이언트에 노출하고, 쓰기 차단은 CLI 인자(`--allowedTools`/`--disallowedTools`/`--tools`)뿐이다 | 006 Q59·002 단계 0 의 *"서비스 코드 변경 필요"* — 최소 실험만 보면 앱 코드 변경 0 으로 가능(서버 실행이 필요) | §7 |

## 1. 진입점 전수

### 1-1. fin — 호출부 12 caller · 모두 `askAdvisor`(`apps/finance/src/lib/ai/claude-advisor.ts`) 하나를 거친다

명령: `git -C apps/finance grep --text -nE "askAdvisor\(" -- 'src/**' | grep -v __tests__` → 호출 12줄(정의·주석 제외) · 각 줄 앞뒤 `sed -n` 으로 옵션 확인 · 크론은 `src/bot/notifications/scheduler.ts`·`src/lib/cron.ts`.

모델 ID(`apps/finance/src/lib/ai/models.ts`): sonnet = `claude-sonnet-5` · haiku = `claude-haiku-4-5-20251001`. 기본값: timeout 180,000 ms · `maxBudgetUsd` 0.50(재시도 합산 총 cap) · 세션 없음(`--no-session-persistence`) · 읽기 전용.

| # | caller | 진입 | 프로세스 | 시각/빈도 | 모델 | timeout · 예산 | 재시도 | 세션 | 쓰기 도구 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `bot:ai_chat` | Discord `!ai` · 자유 텍스트 AI 판정(`isAiQuestion` · 소비→AI 거래 뒤 fallback) | bot | 사람 | sonnet | 180 s · $0.50 | 없음 | **`--resume`** · 키 `discord:<채널>:<사용자>` · 메모리 24 h TTL · `persist: true`(CLI 디스크 저장) | **예 — 유일**(READ 25 + WRITE 34 + Web 2) |
| 2 | `bot:trade_parse` | 자유 텍스트 거래 문장 | bot | 사람 | haiku | 180 s · $0.50 | 없음 | 없음 | 아니오 |
| 3 | `bot:expense_parse` | 자유 텍스트 소비 | bot | 사람 | haiku | 60 s · $0.50 | 없음 | 없음 | 아니오 |
| 4 | `bot:brief_command` | Discord `!briefing <티커>` | bot | 사람 | sonnet | 300 s · $1.0 · 전체 900 s | `no_tool_used` 5회 · 90 s backoff | 없음 | 아니오 |
| 5 | `cron:briefing` | 크론 | bot | `30 8 * * 1-5`(KR) · `0 23 * * 1-5`(US) | sonnet | 300 s · $1.0 · 900 s | 5회 | 없음 | 아니오 |
| 6 | `cron:active_review` | 크론(클로징·주간) | bot | `40 15 * * 1-5` · `15 7 * * 2-6` · `0 9 * * 6` | sonnet | 300 s · $1.0 · 900 s | 5회 | 없음 | 아니오 |
| 7 | `cron:monthly_report` | 크론 | bot | `30 9 * * *` → 설정일(기본 1일) | sonnet | 300 s · **$0.50(기본값)** · 900 s | 5회 | 없음 | 아니오 |
| 8 | `cron:ta_signal` | `lib/cron.ts` `*/10 * * * *` 장중 → TA 체크 → 가이드 | bot | 티커당 6 h 쿨다운 · 회당 최대 3 · `ta_ai_guide` 토글 | haiku | 30 s · $0.25 | 없음 | 없음 | 아니오 |
| 9 | `report:ai_review` | 분기 PDF — 크론 `0 10 7 1,4,7,10 *` · Discord `!report` · 웹 `/api/reports` | bot · web | 분기 + 사람 | sonnet | 300 s · $1.0 | 없음 | 없음 | 아니오 |
| 10 | `strategy:parse` | Discord `!customstrategy` · 웹 `/api/custom-strategies`(+`/preview`) · **MCP `create_custom_strategy`** | bot · web · **mcp** | 사람 | sonnet | 60 s · $0.2 | 없음 | 없음 | 아니오 |
| 11 | `strategy:edit` | 웹 `/api/custom-strategies/[id]/nl-edit` | web | 사람 | sonnet | 60 s · $0.2 | 없음 | 없음 | 아니오 |
| 12 | `web:ai_chat` | 웹 `/api/ai/ask` | web | 사람 | sonnet | 180 s · $0.50 | 없음 | 없음(세션 없는 웹) | 아니오 |

- 크론 caller 4(5~8) + 분기 1(9) · 사람 caller 7(1~4 · 10~12, 9 의 사람 경로 포함). 크론은 전부 **bot 프로세스**(`bot/standalone.ts` 가 `lib/cron.ts` 도 등록).
- `expectsTools` 는 4·5·6·7 만 — `mcp__myfinance__*` 성공 호출 0 이면 실패 처리.

### 1-2. fit — `claude` 를 띄우는 곳 7파일 · MCP 를 쓰는 것은 `askAdvisor` 하나

명령: `git -C apps/fitness grep --text -nE "spawn\(|CLAUDE_BIN" -- 'src/**' 'scripts/**'` → spawn 7곳 · 각 파일 `grep -nE '"--max-turns"|"--tools"|timeout|claudeModelId'` · 호출부는 함수명 grep.

**(a) `askAdvisor`**(`src/lib/ai/claude-advisor.ts`) — sonnet 고정(`ADVISOR_MODEL`) · 시도당 180 s(spawn `timeout`) · **예산 상한 없음**(W2) · `--max-turns 15` · `--tools ""`(Web 없음) · MCP 읽기 27(전부 읽기 · 쓰기 도구 0) · 세션 = 채널 이름별 메모리 Map(6 h 무활동 · 누적 입력 100k 토큰 · 시스템 프롬프트 버전이 바뀌면 리셋) · **`--no-session-persistence` 없음**(CLI 가 모든 호출을 디스크 저장).

| # | 채널(=로그 `channel=`) | 진입 | 프로세스 | 시각 | minTurns · 재시도 | 세션 |
|---|---|---|---|---|---|---|
| 1 | `discord` | Discord `!ai` · 자유 텍스트 fallback | bot | 사람 | 0 · 없음 | **이어간다** · 사용자·채널 무관 1개 · 프로세스 전역 동시 1건(W5) |
| 2 | `cron-morning` | 크론 · `!report`·`!ai 모닝 리포트` · 웹 `/api/reports`(ReportJob) | bot · web | `0 8 * * *`(env `MORNING_REPORT_CRON`) | 2 · 최대 2회(env `ASK_ADVISOR_MAX_RETRIES` · 최악 540 s) | 매번 리셋 |
| 3 | `cron-evening` | 같음 | bot · web | `0 23 * * *`(`EVENING_REPORT_CRON`) | 2 · 2회 | 매번 리셋 |
| 4 | `cron-weekly` | 같음 | bot · web | `0 7 * * 1`(`REPORT_CRON`) | 2 · 2회 | 매번 리셋 |
| 5 | `web` | 웹 `/api/ai` | web | 사람 | 0 | 이어간다 |
| 6 | `activity-eval` | 웹 `/api/activities/[id]/evaluate` | web | 사람 | 0 | 매번 리셋 |
| 7 | `prompt-trial` | 웹 프롬프트 시험 실행 | web | 사람 | 2 또는 0 | 매번 리셋 |

**(b) 1회 호출(MCP 없음 · `--strict-mcp-config` 만 · `--tools ""` · `--max-turns 1` · sonnet · 비용·지연 로그 없음 · 실패 줄만)**

| 파일 | 함수 | timeout | 호출부 |
|---|---|---|---|
| `lib/checkup/import/extract.ts` | `extractCheckupPage` | 50 s | 웹 `/api/checkups/extract` |
| `lib/nutrition/estimate-nutrition.ts` | `estimateNutritionFromText` | 18 s | 웹 `/api/food` · bot 식단 · `lib/cron.ts` backfill(웹 프로세스 · 싱크 뒤) |
| `lib/nutrition/estimate-nutrition-photo.ts` | `estimateNutritionFromPhoto` | 45 s | 웹 `/api/food` · bot 사진 |
| `lib/nutrition/extract-food-query.ts` | `extractFoodQuery` | 18 s | MFDS 경로(웹 food · bot food · backfill) |
| `lib/prompts/suggest.ts` | `runSuggestCli` | 180 s | 웹 프롬프트 제안 |
| `lib/nutrition/estimate-kcal.ts` | `estimateKcalFromText` | 15 s | **호출부 0**(`git grep estimateKcalFromText` = 정의·주석뿐) |

## 2. 실행 구조 (fin · fit 나란히)

| 항목 | fin | fit |
|---|---|---|
| 실행 | `spawn('sh', ['-c', cmd])` · 인자 shell escape · 바이너리 `claude`(PATH) | `spawn(CLAUDE_BIN, args)` · `CLAUDE_BIN` env 또는 `claude` |
| 출력 | `--output-format stream-json --verbose`(도구 호출 열 파싱) | `--output-format json`(result 1개) |
| 모델 | `--model` 고정 ID + 자식 env 3키(`ANTHROPIC_DEFAULT_*`·`ANTHROPIC_SMALL_FAST_MODEL`) | 같음 |
| 시스템 프롬프트 | `--system-prompt`(기본 프롬프트 **대체**) · 코드 상수 `SYSTEM_PROMPT`(`system-prompt.ts` 13,752 B) · 읽기 전용 호출은 `READ_ONLY_PROMPT_NOTICE` 덧붙임 · resume 이면 생략 | `--append-system-prompt`(기본 **유지**) + `--exclude-dynamic-system-prompt-sections` · 본문 = **DB `PromptVersion` "system"**(웹에서 버전 관리 · `system-prompt.ts` 4,979 B 는 조립·기본값) · 동적 맥락(시각·목표)은 매 호출 사용자 메시지 앞에 붙임 |
| cwd 메모리 | `apps/finance` → 앱 `CLAUDE.md`·rules 로드(W3) · 루트 4개는 `--settings {claudeMdExcludes}` | `apps/fitness` → 앱 메모리 0 · 루트 제외 같음 |
| MCP 설정 | 정적 `src/lib/ai/mcp-config.json`(`http://127.0.0.1:4210/mcp`) · `MCP_CONFIG_PATH` 로 덮기 · `release-inplace.sh` 가 이 파일 변경 시 배포 중단(007 Q83) | 런타임 생성 `<cwd>/.runtime/mcp-config.json` · `MCP_HTTP_URL` > `MCP_PORT` > 4301 · `MCP_TRANSPORT=stdio` 회귀 시 `dist/mcp/server.cjs` 를 매번 spawn(이때 `DATABASE_URL` 이 그 파일에 들어간다) |
| 격리 | `--strict-mcp-config` · `--tools "WebSearch,WebFetch"` · `--permission-mode dontAsk` | `--strict-mcp-config` · `--tools ""` · permission-mode 미지정(`-p` 에서 미허용 도구는 거부) |
| 도구 인자 | 읽기 호출: `--allowedTools READ` + `--disallowedTools WRITE` · 쓰기 호출: `--allowedTools READ+WRITE` | `--allowedTools` 27 · `--disallowedTools` 없음 |
| 턴·예산 | `--max-budget-usd` 매 시도(잔액) · 턴 상한 없음 | `--max-turns 15` · 예산 없음 |
| 세션 | `--resume <id>`(bot:ai_chat 만) · 그 외 `--no-session-persistence` | `--resume`(채널에 세션 있으면) · persistence 플래그 없음 |
| 동시성 | **앱 전체 제한 없음.** bot:ai_chat 만 상태 키별 1건(`chatBusy`) · `packages/chat` 이 채널별 직렬 큐 | **앱 전체 제한 없음.** bot `!ai`·자유 텍스트만 프로세스 전역 1건 · 크론·웹은 각자 |
| 실패 감시 | `advisor-monitor` caller별 연속 3회(예산 초과는 1회) → `#admin` 웹훅 · 실패마다 DB `AlertHistory`(kind `ai_failure`) | 호출부별 `console.error` · 알려진 실패(인증 등)는 관리자 알림(`notifyAdminIfKnownFailure`) · DB 기록 없음 |

MCP 서버(둘 다 `src/mcp/server.ts`): `@modelcontextprotocol/sdk` StreamableHTTP · `127.0.0.1` 바인딩 · **인증 없음** · 세션마다 transport+server 쌍(`mcp-session-id`) · 무활동 30분 정리 · `/health`(세션 수) · pm2 이름 `pleiades-<fin|fit>-mcp`(`deploy/pleiades.config.cjs:79,103` · `MCP_TRANSPORT=http` · `MCP_LOG_TEE_FILE=1`) · 포트 fin 기본 4210 · fit 기본 4301(서버 실제 `MCP_PORT` 미측정). fit MCP 의 splits 도구는 fit 웹 API(`APP_BASE_URL`)를 부른다 — fit 웹이 떠 있어야 한다.

## 3. 도구 범위

명령: fin `grep -n -A1 -E "server\.tool\($" src/mcp/server.ts` 로 등록 이름 → `advisor-tools.ts` 의 `READ_TOOLS`·`WRITE_TOOLS` 와 집합 비교(python) · fit `git grep -nE -A2 "(registerTool|server\.tool)\("` → `ADVISOR_ALLOWED_TOOLS`·`ADVISOR_EXCLUDED_TOOLS` 와 비교.

| | fin | fit |
|---|---|---|
| MCP 등록 도구 | **59** | **28** |
| 읽기(어드바이저 허용) | 25 | 27 |
| 쓰기 | 34(`WRITE_TOOLS` · bot:ai_chat 만 허용) | 1(`generate_training_plan` · 어디에도 허용 안 함) |
| 등록 ↔ 목록 차이 | 0 / 0 | 0 / 0 |
| WebSearch · WebFetch | 허용(모든 호출) | 차단(`--tools ""`) |
| 다른 도메인 도구 | `git grep -l "myfitness" -- apps/finance/src` = 0 | `git grep -l "myfinance" -- apps/fitness/src` = 0 |
| `packages/*` 의 claude·mcp | `git grep -l "claude\|mcp" -- 'packages/*/src/**'` = 0 | — |

→ **한 세션에서 두 도메인 도구를 쓰는 경로: 0.** (CLAUDE.md 의 "fin `ALLOWED_TOOLS` 57 중 쓰기 34"(11-02)는 그 뒤 읽기 2 추가(`get_news` · `get_disclosures`)로 지금 59.)

## 4. 세션·기억

| | fin | fit |
|---|---|---|
| 세션 ID 보관 | bot 프로세스 메모리 `Map<StateKey,{sessionId,lastUsed}>` · 재시작 시 소실 | 프로세스별 메모리 `Map<channel,{sessionId,lastActiveAt,cumulativeInputTokens,systemVersionId}>`(bot·web 따로) |
| 키 | `discord:<channelId>:<userId>`(플랫폼 접두) | 채널 이름 문자열(`discord` · `web` · `cron-*` · …) — 사용자·Discord 채널 구분 없음 |
| 만료 | 24 h 미사용 | 6 h 무활동 · 누적 입력 100k 토큰 · 시스템 프롬프트 버전 변경 |
| 수동 리셋 | `!reset`(그 키) | `!reset`(`discord` 채널) · 크론·시험은 호출 전 리셋 |
| CLI 디스크 기록 | bot:ai_chat 만(`persist: true`) | 모든 호출(플래그 없음 · 1회 호출 포함) — 서버 `~/.claude/projects/` 누적량 미측정 |
| 기억(장기) | 없음 — 맥락은 MCP 조회 + 세션 | 없음 — 동적 맥락(목표·시각)을 매 호출 붙인다 |

## 5. 비용·지연 계측 지점

### 5-1. 로그 줄 형식(pm2 `log_date_format: 'YYYY-MM-DD HH:mm:ss'` 접두)

| 앱 | 줄 | 담는 것 | 없는 것 |
|---|---|---|---|
| fin | `[advisor] ok caller=<c> model=<id> used=<ids> cost=$<x.xxxx> turns=<n> tools=<k>` | caller · 모델 · 비용(재시도 합 아님 — **시도 1회분**) · turns · 도구 호출 수 | **지연**(W1) · 토큰 |
| fin | `[advisor] fail caller=<c> model=<id> code=<code> exit=<e> subtype=… [terminal_reason=…] [cost=$…] [turns=…]` | 실패 코드 · 비용 | 타임아웃(`AdvisorTimeoutError` 는 이 줄 없음) · `no_tool_used` 판정 실패(줄 없음) |
| fin | `[advisor] no_tool_used → retry <i>/<n> (caller=<c>, sleep 90000ms, costSpent=$…)` | 재시도 | — |
| fin | `[advisor] 모델 드리프트 caller=… expected=… used=…` | 드리프트 | — |
| fit | `[askAdvisor] channel=<ch> duration=<ms>ms turns=<n> session=<8자> cost=$<x>[ is_error=true]` | 채널 · **벽시계 지연** · turns · 비용 | 토큰 · 모델 |
| fit | `[askAdvisor] channel=<ch> session=… turns=<n> < minTurns=<m> — attempt …` | 재시도 | — |
| fit | `[bot-cron] <라벨> 시작` / `… 전송 완료` | 크론 리포트 전체 시간(Garmin 사전 싱크 포함) | — |
| fit 1회 호출 | `[kcal]`·`[nutrition]`·`[nutrition-photo]`·`[extract-food-query]`·`[checkup-extract]` + 실패 종류 | 실패만 | 성공 · 비용 · 지연 전부 |
| MCP(둘 다) | `apps/<dir>/logs/mcp-YYYY-MM-DD.log` pino JSON `msg: tool_call|tool_call_reported_error` · `tool` · `latency_ms` · `status` · `args`(요약) · 14일 보존 | 도구별 지연 | 어느 advisor 호출인지(시각 창으로만 조인) |

`modelUsage`(토큰·모델별 사용량)는 두 앱 다 **드리프트 판정에만 쓰고 기록하지 않는다.** 토큰은 fit 이 세션 누적(`usage.input_tokens`)만 메모리에 둔다.

### 5-2. DB

명령: `grep -niE "durationMs|duration_ms|costUsd|cost_usd" apps/*/prisma/schema.prisma` = **0** — 비용·지연 컬럼은 두 스키마 어디에도 없다.

| 앱 | 테이블 | 쓸 수 있는 것 |
|---|---|---|
| fin | `AlertHistory`(kind `ai_failure` · #269) | 실패 시도 1건 = 1행 · message 첫 줄 `🤖 AI 실패 · <caller> · <code>` · 타임아웃 포함 · 웹 [알림 이력] "AI 실패" 가 이것 |
| fit | `AIAdvice`(category · prompt · response · createdAt) | 결과 행 수(범주별) — 비용·지연 없음 |
| fit | `ReportJob`(startedAt · completedAt · status) | 웹에서 시작한 리포트의 시작→완료 시간 |

### 5-3. 서버 판정 스크립트 — `.server-scripts/23-server-239-advisor-cost.sh`(gitignored · 사용자 실행)

- 입력: `${PM2_HOME:-~/.pm2}/logs/pleiades-{fin,fit}-*.log*`(회전·gz 포함) · `~/pleiades-{fin,fit}/apps/<dir>/logs/mcp-*.log` · 선택 `DB=1`(앱 cwd `.env` 로 Prisma SELECT · URL 출력 없음).
- 출력: caller(fin)·채널(fit)별 성공·실패 코드별·재시도 수 · 비용 합/평균/p50/p90/max · fit 지연 p50/p90/max · fin 크론 caller 의 "끝 − 크론 시각" **상한** · fit `[bot-cron]` 시작→전송 · fit 1회 호출 실패 종류 · 드리프트 줄 수 · MCP 도구별 호출 수·오류·지연 상위 15 · (DB=1) fin `ai_failure` caller·code 별 · fit `AIAdvice` 범주별 · `ReportJob` 시간.
- 출력하지 않는 것: 질문·응답 원문 · 세션 ID · args · 경로 · 계정 · env · 오류 문구.
- `set -u` · Darwin 거부(`PLEIADES_SCRIPT_TEST` 로만 로컬 시험) · 읽기만. 로컬 합성 로그로 파서 시험 통과(fin ok/fail/retry · fit ok/retry/bot-cron · gz · 기간 밖 줄 제외 · MCP JSON) · `bash -n` · node 조각 3개 `node --check` 통과. DB 조각은 실DB 미실행.

## 6. Discord 진입 (재사용 지점)

| 항목 | 값 | 출처 |
|---|---|---|
| 수신 계층 | `packages/chat` — `createChat({ allowedUserIds, allowedChannelIds, messageChannelIds? })` · gateway 1 + REST | `packages/chat/src/chat.ts:25-34,137` |
| 허용 | `isAllowed` = 사용자 ID **AND** 채널 ID · 문자열 비교 · 목록 비면 전부 거부 · 허용 채널의 낯선 사용자는 경고 로그 | `packages/chat/src/auth.ts` |
| 직렬화 | 채널 ID 별 tail promise 큐(`enqueue`) — 같은 채널 메시지는 순서대로 | `chat.ts:178-191` |
| 라우터 | `createRouter({ commandPrefix })` · `.command/.hears/.attachment/.fallback/.action` · 명령은 접두 필수가 기본(`prefix:'optional'` 예외) | `packages/chat/src/router.ts` |
| 접두 | 두 앱 `!`(`DISCORD_COMMAND_PREFIX`) | fin `bot/discord/reply.ts:22` · fit `reply.ts:10` |
| 봇 토큰 | `DISCORD_BOT_TOKEN_FINANCE` · `DISCORD_BOT_TOKEN_FITNESS`(앱별 봇 2) | `bot/notifications/notifier.ts` |
| 알림 채널 / 대화 채널 | `DISCORD_CHANNEL_ID_FINANCE` / `_FINANCE_CHAT` · `DISCORD_CHANNEL_ID_FITNESS` / `_FITNESS_CHAT`(대화 키는 선택 · 같은 값 허용) | 같은 파일 · `discord-interactions.ts` |
| 허용 사용자 | `DISCORD_ALLOWED_USER_IDS` 하나(두 앱 공유) | 같은 파일 |
| 설정 위치 | 루트 플랫폼 env(`platformEnv` · 서버 `~/pleiades-platform.env`) | 009 · isolation I-4′ |

→ 통합 advisor 봇(축 E (a))은 `packages/chat` + 셋째 토큰 키 + 대화 채널 키(들) + 같은 `DISCORD_ALLOWED_USER_IDS` 로 앱 코드 없이 조립 가능한 계층이 이미 있다. 채널 ID → 도메인 힌트 매핑은 지금 어디에도 없다(앱마다 자기 채널만 안다).

## 7. 교차 도메인 최소 실험 — 경로·전제(실행하지 않음)

**필요한 것(앱 코드 변경 0 기준):**
1. `--mcp-config` 하나에 `myfinance`(http 4210) + `myfitness`(http 4301) — 두 서버 모두 `127.0.0.1` 바인딩이라 **서버 안에서** 돌아야 한다. 인증이 없으므로 추가 자격 증명은 필요 없다(대신 같은 호스트의 아무 프로세스나 붙을 수 있다는 뜻이기도 하다).
2. 쓰기 차단: `--allowedTools` = fin READ 25 + fit 27 · `--disallowedTools` = fin WRITE 34 + `mcp__myfitness__generate_training_plan` · `--tools ""`(또는 `"WebSearch,WebFetch"`) · `--strict-mcp-config` · `--permission-mode dontAsk` · `--max-budget-usd`. 서버 쪽 읽기 전용 모드가 없으므로 이 인자가 유일한 차단(W6) — fin `create_custom_strategy` 는 중첩 `claude` 까지 띄우므로(W4) 반드시 막는다.
3. 맥락: 시스템 프롬프트는 두 앱이 형식부터 다르다(fin 코드 상수 · 대체 / fit DB 버전 · 덧붙임 + 동적 맥락). cwd 를 어디로 두느냐가 fin rules 로드를 가른다(W3) — `apps/finance` 밖이면 `stock-trading-method` 가 빠진다.
4. 모델·격리 인자: 두 앱 `models.ts` 고정 ID 가 같다(sonnet `claude-sonnet-5` · haiku `claude-haiku-4-5-20251001`) · 루트 문서 제외(`--settings claudeMdExcludes`) 패턴 재사용.
5. fit MCP 의 일부 도구는 fit 웹(`APP_BASE_URL`)이 떠 있어야 한다.

**로컬에서 되는 것(실데이터 없음):** MCP 두 서버를 `pleiades_fin`·`pleiades_fit` 로컬 DB 에 붙여 예약 포트 밖(`check_env.py RESERVED_PORTS = {3000,4100,4200,4210,4301}`)으로 띄우고 위 인자로 배선·쓰기 차단·도구 목록을 확인하는 것. 단 **MCP 기동 = 격리 경계 작업(사용자 확인)** · `claude` 실행은 로컬 advisor 차단 shim(I-8 · `tools/local/README.md` "MCP 서버는 띄우지 않는다")을 푸는 결정 + advisor 계정 쿼터 소비. 빈 DB 라 **답의 가치는 판정 불가**(006 Q59 와 같은 이유).

**서버(실데이터)가 필요한 것:** 교차 도메인 답이 쓸 만한가(002 단계 0 의 목적) · 실제 지연·비용 · 두 MCP 의 동시 세션 부하. Claude 는 서버에 접근하지 않으므로(I-3) 실행은 사용자 또는 배포된 새 프로세스 몫이다.

## 8. 설계 축(A~I)에 바로 쓰일 사실

| 축 | 사실 |
|---|---|
| A 오케스트레이터 위치 | 지금 "오케스트레이터" 는 없다 — 라우팅은 앱 봇 라우터의 정규식·명령(`!` · `isAiQuestion` · 한글 28 정규식)이다. 채널→도메인 매핑도 없다 |
| B 에이전트 단위 | 현행 단위 = 앱(도메인) × 용도(caller 12 · 채널 7 + 1회 호출 6). 이미 기능별 분화가 있다 — 파서(haiku/sonnet 1회) · 대화(세션) · 리포트(크론 · 도구 필수 검증) |
| C 도구 범위 | fin 59(읽기 25) · fit 28(읽기 27) · 교차 0 · 쓰기 허용은 fin 대화 1경로 · Web 도구는 fin 만 · 서버 쪽 읽기 전용 모드 없음 |
| D 세션·기억 | fin 채널×사용자 24 h · fit 채널이름 전역 6 h/100k · 둘 다 메모리(재시작 소실) · 장기 기억 없음 |
| E 봇·진입점 | 봇 2(앱별 토큰) · `packages/chat` 이 허용·큐·라우터를 이미 제공 · 허용 사용자 키 공유 |
| F 기존 advisor | 사람 없는 호출 = fin 크론 4 + 분기 1 · fit 크론 3 + 웹 백필 · 대부분 bot 프로세스 node-cron. 텔레그램 `/ai` 는 이미 0(009 D-5) — 이슈 본문 F 의 "텔레그램 `/ai`" 는 Discord `!ai` 로 읽는다 |
| G 배치 | MCP 가 `127.0.0.1` 이라 통합 advisor 는 같은 서버에 있어야 붙는다 · pm2 이름 규칙 `pleiades-<app>-<역할>` |
| H 비용 | 기준선 기록: fin 비용·실패는 로그에 있고 **지연은 없다**(W1) · fit 은 비용·지연 다 있으나 **상한 없음**(W2) · 1회 호출은 둘 다 없음 · 토큰 기록 0 · 다단 호출은 MCP 안에도 있다(W4) · 크론 재시도가 비용을 최대 6시도로 늘린다(fin 총액 cap 있음 · fit 3시도 cap 없음) |
| I 허용 | `isAllowed` = 사용자 AND 채널 · fail-closed · 그대로 재사용 가능 |

## 9. 못 잰 것 (서버 필요)

| 값 | 어떻게 |
|---|---|
| caller·채널별 호출 수 · 비용 합/평균 · fit 지연 분포 · 실패 코드 분포 · 재시도 빈도 | 스크립트 23 |
| fin 성공 호출 지연 | **기록 없음(W1)** — 크론 caller 상한만 스크립트 23 · 정확값은 로그 줄에 `duration=` 추가(코드 변경) 뒤 |
| fit 1회 호출 비용·지연 | 기록 없음 |
| 토큰(입력·출력·캐시) | 기록 없음 — `modelUsage` 를 남기는 변경 필요 |
| MCP 도구 지연 분포 | 스크립트 23(MCP 로그 14일) |
| 서버 실제 `MCP_PORT` · MCP 프로세스 online · 서버 CLI 버전 · advisor 계정 플랜·쿼터 잔량 | 사용자 확인(I-3) |
| CLI 세션 디스크 누적(`~/.claude/projects/`) | 사용자 확인 |
| 통합 세션의 답 품질 | 서버 실데이터 최소 실험(§7) |
