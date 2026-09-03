# 실측 데이터 — 2026-09-03

두 저장소를 직접 측정한 값. **재측정 전에 여기부터 확인한다.**
새 값을 측정하면 측정 명령과 함께 이 파일에 추가한다.

측정 환경: macOS(darwin 25.6.0), Claude Code 2.1.259

---

## 스택 대조

| | myFinance | myFitness |
|---|---|---|
| 도메인 | 가족 자산·가계부·세금 | Garmin 기반 피트니스 |
| Next.js | **15.5.16** | **16.2.6** |
| React | 19.2.7 | 19.2.5 |
| @prisma/client | 6.19.2 | 6.19.3 |
| DB | PostgreSQL | PostgreSQL |
| UI | Tailwind + Recharts | Tailwind + Recharts |
| 봇 | grammY standalone + node-cron | grammY standalone + node-cron |
| 로깅 | pino | pino |
| AI | `claude -p` + MCP | `claude -p` + MCP |
| 테스트 | vitest (`test`, `test:run`, `test:coverage`) | **없음** |
| 버전 | v0.16.4 | v2.27.2 |
| 브랜치(측정 시) | dev, clean | **`chore/359-1`, clean** ← 진행 중 작업 있음 |

> myFinance `CLAUDE.md` 는 "Next.js 14" 라고 적고 있으나 stale. `package.json` 실측은 15.5.16.

## 운영 프로세스 (PM2, 같은 Ubuntu 서버)

| 앱 | 포트 | 저장소 |
|---|---|---|
| `myfinance` (Next) | 4100 | myFinance |
| `myfinance-bot` | — | myFinance |
| `myfinance-mcp` (HTTP) | 4210 | myFinance |
| `myfitness` (Next) | 4200 | myFitness |
| `myfitness-bot` | — | myFitness |
| `myfitness-mcp` (HTTP) | 4301 | myFitness |

MCP 클라이언트 설정 실측:

```json
// myFinance src/lib/ai/mcp-config.json
{ "mcpServers": { "myfinance": { "type": "http", "url": "http://127.0.0.1:4210/mcp" } } }

// myFitness src/lib/ai/mcp-config.json
{ "mcpServers": { "myfitness": { "type": "http", "url": "http://127.0.0.1:4301/mcp" } } }
```

→ 둘 다 로컬 HTTP 상주.

> **정정 (2026-09-03 재측정).** 위 두 파일이 대칭이라는 기록은 절반이 틀렸다.
> **myFitness 의 `src/lib/ai/mcp-config.json` 은 죽은 파일이다** — 실제로는
> `claude-advisor.ts:108 ensureMcpConfig()` 가 매 호출마다 `.runtime/mcp-config.json` 을
> 생성해 `--mcp-config` 로 넘긴다. 저장소의 JSON 을 고쳐도 아무 일도 일어나지 않는다.
> 상세는 아래 "단계 0 의 실제 범위" 절.

## 코드 규모

```bash
find $DIR -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l   # 파일 수
find $DIR -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l   # 줄 수
```

| 영역 | myFinance | myFitness |
|---|---|---|
| `src/lib/ai` | 7 files / 2,469 lines | 3 files / 713 lines |
| `src/bot` | 46 / 7,994 | 25 / 3,435 |
| `src/mcp` | 28 / 5,660 | 19 / 4,546 |
| `src/lib` | 100 / 15,417 | 60 / 10,844 |
| `src/app` | 141 / 15,031 | 64 / 12,353 |
| `src/components` | 105 / 16,227 | 25 / 3,171 |

## 중복 모듈 — 공유 패키지(B1) 후보

같은 경로에 같은 목적의 파일이 양쪽에 존재. `diff` 로 실측한 드리프트:

| 파일 | myFinance | myFitness | diff 줄 |
|---|---|---|---|
| `src/mcp/session-utils.ts` | 44 | 44 | **22** ← 사실상 같은 파일이 갈라진 것 |
| `src/bot/utils/error.ts` | 101 | 85 | 118 |
| `src/bot/utils/telegram.ts` | 118 | 60 | 142 |
| `src/mcp/logger.ts` | 315 | 295 | 318 |
| `src/lib/ai/claude-advisor.ts` | 962 | 425 | 1,231 |

양쪽에 이름이 같은 파일: `src/lib/ai/{claude-advisor,system-prompt,mcp-config.json}`,
`src/mcp/{logger,server,session-utils}.ts`, `src/bot/utils/{error,formatter,telegram}.ts`

## 하네스 구성

| | myFinance | myFitness |
|---|---|---|
| agents | 4 | 5 |
| skills | 7 | 9 |
| rules | 5 | 3 |

**agents**
- myFinance: `feature-implementer`, `quality-guardian`, `release-manager`, `spec-planner`
- myFitness: `codex-liaison`, `db-migrator`, `ops-analyst`, `release-manager`, `workflow-conductor`

**skills — 역할 대조**

| 역할 | myFinance | myFitness |
|---|---|---|
| 세션 재개 | `session-resume` | `session-primer` |
| 세션 인계 | `session-boundary` | `session-handoff` |
| 오케스트레이터 | `milestone-workflow` | `myfitness-orchestrator` |
| 릴리즈 | `release-publisher` | `release-flow` |
| Codex 대응 | `codex-response-patterns` | `codex-review-loop` |
| 브랜치 워크플로우 | (`milestone-workflow` 내부) | `branch-workflow` |
| 검증 4종 | `project-verify` | — |
| 스펙 작성 | `project-spec-writer` | — |
| 운영 진단 | — | `ops-diagnose` |
| Prisma 드리프트 | — | `prisma-drift-fix` |
| orphan 커밋 확인 | (memory 로만) | `orphan-check` |

→ 역할은 쌍둥이인데 이름이 다르고, **양쪽이 서로 없는 스킬을 가지고 있다.**

**rules**
- myFinance: `api-routes`, `components`, `workflow`, `tax-logic`, `stock-trading-method`
- myFitness: `api-routes`, `components`, `workflow`

## auto memory 현황

```bash
wc -l ~/.claude/projects/-Users-sagan-workspace-<proj>/memory/MEMORY.md
```

| | MEMORY.md | 크기 | 토픽 파일 |
|---|---|---|---|
| myFinance | **126줄** | 11,557 B | 37 |
| myFitness | 16줄 | 2,244 B | 16 |
| pleiades | (이번에 시드) | — | — |

한도는 **200줄 / 25KB** (초과분은 세션 시작 시 조용히 누락).
myFinance+myFitness 합산 142줄 → 통합 시 여유 58줄뿐. **압축 선행 필요.**

## 열린 항목 (측정 시점)

- myFinance PR #58 — dependabot `next 14.2.35 → 16.1.6` (2026-03-11 오픈). **베이스가 틀림**, 폐기 대상
- myFinance 이슈 #97 — npm audit 취약점 (automated)
- myFinance 이슈 #230 — 기능개선 (상당 부분 Phase 20/29/30/31 에서 이미 구현됨, 정리 후 종료 가능)
- myFitness — 열린 PR/이슈 미확인 (필요 시 `gh` 로 조회)

---

# 추가 측정 — 2026-09-03 (알림 채널 교체 비용)

`002-platform-direction.md` 의 발견 4·5·6 근거. Q6(알림 채널 → Discord) 결정에 따라 측정.

## 봇 코드 구조 — 양쪽 완전 동일

```bash
for sub in $(find ~/workspace/$d/src/bot -maxdepth 1 -type d | tail -n +2); do
  echo "$(basename $sub): $(find $sub -name '*.ts' | wc -l) files / $(find $sub -name '*.ts' -exec cat {} + | wc -l) lines"
done
```

| | myFinance | myFitness |
|---|---|---|
| `bot/middleware` | 1 / 37 | 1 / 15 |
| `bot/utils` | 6 / 471 | 3 / 176 |
| `bot/commands` | 17 / 3,968 | 13 / 1,843 |
| `bot/notifications` | 20 / 3,378 | 5 / 1,212 |
| `bot/` 루트 | `index.ts` `standalone.ts` | `index.ts` `prisma.ts` `standalone.ts` |
| cron 정의 | `lib/cron.ts`, `bot/standalone.ts`, `bot/notifications/scheduler.ts` | `lib/cron.ts`, `bot/notifications/scheduler.ts` |

→ `src/bot/{middleware,utils,commands,notifications}` + `standalone.ts` + `src/lib/cron.ts` 레이아웃 동일.

## 텔레그램 결합도

```bash
# grammy/telegram 을 참조하는 파일 수
grep -rlE "from ['\"]grammy|telegram|TELEGRAM|Telegraf" ~/workspace/$d/src --include='*.ts' --include='*.tsx' | wc -l
# src/bot 밖 누수
grep -rlE "from ['\"]grammy|sendTelegram|TELEGRAM_" ~/workspace/$d/src --include='*.ts' --include='*.tsx' | grep -v '/src/bot/'
```

| | myFinance | myFitness |
|---|---|---|
| 텔레그램 참조 파일 / src 전체 | 43 / 424 | 27 / 218 |

**`src/bot` 밖 누수** — 채널 교체 시 함께 손대야 하는 곳:

- 양쪽 공통: `src/mcp/logger.ts`
- myFinance: `src/lib/cron.ts`, `src/lib/ai/advisor-monitor.ts`, `src/app/api/alerts/history/[id]/retry/route.ts`
- myFitness: `src/lib/garmin/sync.ts`, `src/lib/monitoring/admin-alerts.ts`

## 전송 호출 분포 — 아웃바운드는 초크포인트, 인바운드는 산재

```bash
grep -rn "api\.sendMessage\|ctx\.reply\|\.reply(" ~/workspace/$d/src --include='*.ts' | wc -l
grep -rln "api\.sendMessage\|ctx\.reply" ~/workspace/$d/src/bot/notifications/
```

| | myFinance | myFitness |
|---|---|---|
| 전체 전송 호출 | **149** | **61** |
| 최다 파일 | `commands/ai.ts` 27 | `commands/food-edit-callback.ts` 13 |
| `notifications/` 내 원시 전송 파일 | `rsu.ts` 1개 (모듈 16개 중) | `send.ts` 1개 (모듈 5개 중) |
| 아웃바운드 초크포인트 | `bot/utils/telegram.ts` (`sendHtml`) | `bot/notifications/send.ts` (`sendToAll`) |

→ **아웃바운드는 어댑터 교체, 인바운드는 재작성.** 인바운드 210건이 grammY `Context` 에 묶여 있다.

## 추출 후보의 외부 의존 — Next 무관

```bash
grep -rn "from ['\"]next" ~/workspace/$d/src/bot/ | wc -l    # 양쪽 다 0
grep -nE "^import" ~/workspace/$d/src/bot/utils/error.ts
```

| 파일 | myFinance | myFitness | import |
|---|---|---|---|
| `bot/utils/error.ts` | 101줄 | 85줄 | **0건 (양쪽 다)** |
| `bot/utils/telegram.ts` | 118줄 | 60줄 | grammY + `./formatter` `./error` |
| `bot/notifications/send.ts` | 없음 | 124줄 | grammY + `../utils/error` |

`src/bot` → `next` import: **양쪽 다 0건**. (`@/lib` import 는 fin 72 / fit 25 건이지만
추출 후보 3파일에는 없다.)

→ **`@pleiades/notify` 추출은 Next 16 정렬을 기다리지 않아도 된다.**

---

# 추가 측정 — 2026-09-03 (단계 0 의 실제 범위)

001 의 발견 3 은 단계 0 을 "`mcp-config.json` 에 두 항목 추가, 되돌리기는 JSON 두 줄"로 기록했다.
어드바이저 호출부를 실측하니 **양쪽 다 그보다 넓다.**

## MCP 설정이 실제로 만들어지는 곳

```bash
grep -rn "mcp-config" ~/workspace/$d/src --include='*.ts'
sed -n '108,140p' ~/workspace/myFitness/src/lib/ai/claude-advisor.ts
sed -n '752,760p' ~/workspace/myFinance/src/lib/ai/claude-advisor.ts
```

| | myFinance | myFitness |
|---|---|---|
| 설정 출처 | **저장소 JSON 파일** (`src/lib/ai/mcp-config.json`) | **코드가 런타임 생성** (`ensureMcpConfig()` → `.runtime/mcp-config.json`) |
| 경로 결정 | `process.env.MCP_CONFIG_PATH ?? projectRoot + 'src/lib/ai/mcp-config.json'` | `path.resolve(process.cwd(), ".runtime/mcp-config.json")` |
| 저장소 JSON 수정으로 반영되나 | **예** | **아니오 — 죽은 파일** |
| 서버 항목 정의 위치 | JSON | `claude-advisor.ts:130` 의 `config` 객체 리터럴 |

myFitness 는 `MCP_TRANSPORT`(http/stdio)에 따라 서버 항목을 분기 생성한다.
교차 도메인을 넣으려면 **JSON 이 아니라 TypeScript 를 고쳐야 한다.**

## `--strict-mcp-config` + `--allowedTools` 화이트리스트

설정에 서버를 추가해도 **도구가 허용 목록에 없으면 쓸 수 없다.** 양쪽 다 명시 화이트리스트다.

| | myFinance | myFitness |
|---|---|---|
| 화이트리스트 위치 | `claude-advisor.ts` 의 `ALLOWED_TOOLS` 상수 (486줄~) | `claude-advisor.ts:275` 인라인 문자열 |
| 등재된 도구 수 | `mcp__myfinance__*` 다수 | `mcp__myfitness__*` 20개 |
| 관련 플래그 | `--strict-mcp-config`, `--tools "WebSearch,WebFetch"`, `--permission-mode dontAsk` | `--strict-mcp-config`, `--tools ""` |

`--tools` 는 built-in 도구 availability allowlist, `--allowedTools` 는 permission bypass 목록이다.
**교차 도메인 도구를 추가하려면 상대 저장소의 도구 이름을 이 목록에 전부 등재해야 한다.**

## 시스템 프롬프트도 도메인 고정

```bash
grep -n "mcp__myfitness__\*\|mcp__myfinance__\*" ~/workspace/$d/src/lib/ai/*.ts
```

myFitness `claude-advisor.ts:162` — *"먼저 필요한 mcp__myfitness__\* 도구를 병렬로 호출해…"*.
프롬프트가 자기 도메인 도구만 지시한다. 상대 도구를 등록만 하고 프롬프트를 그대로 두면
모델이 호출하지 않을 가능성이 높다.

## 결론 — 단계 0 의 실제 범위

| | 001 의 기록 | 실측 |
|---|---|---|
| 변경 대상 | JSON 2파일 | **TS 2파일 + JSON 1파일** (myFitness JSON 은 무의미) |
| 변경 내용 | 항목 2줄 | 서버 항목 + allowedTools 등재 + 시스템 프롬프트 |
| 반영 방법 | 텔레그램 `/reset` | **빌드 + `pm2 restart`** (코드 변경이므로) + `/reset` |
| 되돌리기 | JSON 2줄 삭제 | `git revert` + 재빌드 + restart |

여전히 가역적이지만 **"설정 토글"이 아니라 "실서비스 두 곳의 코드 변경"이다.**
