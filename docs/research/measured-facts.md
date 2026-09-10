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

> **정정 (2026-09-03 재측정, 전송 계층 상세).** 위 "이름이 같은 파일" 목록 중
> **`src/bot/utils/formatter.ts` 는 공유 후보가 아니다.** 이름만 같고 내용이 겹치지 않는다 —
> myFinance 는 금액·수익률 포맷(`formatKRWCompact` 등) + `splitMessage`, myFitness 는
> 거리·페이스 포맷(`fmtDistance` 등). **겹치는 export 0개.**
> 반대로 `error.ts` 는 diff 118줄에도 불구하고 **export 5개가 전부 일치**하고
> 정규화 diff 는 20줄, 실동작 차이는 2건뿐이다. 상세는 아래 "전송 계층 상세" 절.

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

---

# 추가 측정 — 2026-09-03 (전송 계층 상세)

단계 1 `@pleiades/notify` 알림 어댑터 인터페이스 설계용. 위 "알림 채널 교체 비용" 절의
*"아웃바운드는 어댑터 교체, 인바운드는 재작성"* 이 아웃바운드 쪽에서 어디까지 맞는지 확인.

**측정 시점 저장소 상태:**

```bash
for d in myFinance myFitness; do
  git -C ~/workspace/$d rev-parse --abbrev-ref HEAD
  git -C ~/workspace/$d status --porcelain | wc -l
done
```

| | 브랜치 | dirty |
|---|---|---|
| myFinance | `dev` | 0 |
| myFitness | **`dev`** | 0 |

> **정정 (2026-09-03 재측정).** 상단 "스택 대조" 표는 myFitness 브랜치를 `chore/359-1` 로
> 기록했다. 재측정 시점에는 **`dev`, clean** 이다. 이 절의 모든 값은 `dev` 기준.

## 초크포인트 시그니처 — 추상화 층위가 서로 다르다

```bash
grep -nE "^export (async )?function|^export const|^export interface" \
  ~/workspace/myFinance/src/bot/utils/telegram.ts \
  ~/workspace/myFitness/src/bot/utils/telegram.ts \
  ~/workspace/myFitness/src/bot/notifications/send.ts
```

| 저장소 | 파일:행 | 시그니처 |
|---|---|---|
| myFinance | `bot/utils/telegram.ts:56` | `sendHtml(bot: Bot, chatId: number, html: string): Promise<void>` |
| myFinance | `bot/utils/telegram.ts:37` | `replyHtml(ctx: Context, html: string): Promise<void>` |
| myFinance | `bot/utils/telegram.ts:17` | `escapeHtml(text: string): string` |
| myFinance | `bot/utils/telegram.ts:27` | `h: { b, i, code, pre }` — `(text: string) => string` |
| myFitness | `bot/notifications/send.ts:77` | `sendToAll(bot: Bot, text: string): Promise<SendResult>` |
| myFitness | `bot/notifications/send.ts:98` | `sendToAllWithKeyboard(bot, text, keyboard: InlineKeyboard): Promise<SendKeyboardResult>` |
| myFitness | `bot/utils/telegram.ts:26` | `replyLong(ctx: Context, text: string, html = false): Promise<void>` |
| myFitness | `bot/utils/telegram.ts:6` | `mdToHtml(md: string): string` |
| myFitness | `bot/utils/telegram.ts:18` | `escapeHtml(text: string): string` |

```ts
// myFitness send.ts:13-22
export interface SendResult { sent: number; failed: number; total: number }
export interface SendKeyboardResult extends SendResult {
  first?: { chatId: string; messageId: number }
}
```

| | myFinance `sendHtml` | myFitness `sendToAll` |
|---|---|---|
| 수신자 | 인자로 받음 (`chatId: number`, 1건) | 자기가 env 조회, N건 |
| chatId 타입 | `number` | `string` |
| chatId 루프 | **호출부** | **초크포인트 내부** |
| 반환 | `void` | `SendResult` |

```bash
grep -rn "for (const chatId of" ~/workspace/$d/src --include='*.ts' | grep -v '/__tests__/' | wc -l
```

| | myFinance | myFitness |
|---|---|---|
| 호출부 chatId 루프 | **22** | **2 (둘 다 `send.ts` 내부)** |
| 그중 per-chat try/catch | 21 / 22 | (초크포인트가 집계) |

→ **두 초크포인트는 층위가 다르다.** 하나의 인터페이스로 묶으면 한쪽은 호출부 마이그레이션이 붙는다.

## chatId 목록 관리 — myFinance 는 4중 복제

```bash
grep -rn "TELEGRAM_ALLOWED_CHAT_IDS" ~/workspace/$d/src --include='*.ts'
awk '/function getAllowedChatIds/,/^}/' ~/workspace/myFinance/<각 파일>
```

| 저장소 | 아웃바운드용 정의 지점 | 반환 |
|---|---|---|
| myFinance | `lib/cron.ts:14`, `bot/notifications/budget-alert.ts:15`, `bot/notifications/scheduler.ts:22`, `app/api/alerts/history/[id]/retry/route.ts:30` — **4곳** | `number[]` |
| myFitness | `bot/notifications/send.ts:25` `getChatIds()` — **1곳** | `string[]` |

myFinance 4개는 로직 동일. `retry/route.ts` 만 `!Number.isNaN`, 나머지는 `!isNaN`.
(양쪽 `bot/middleware/auth.ts` 에도 있으나 인바운드 인가용으로 목적이 다름.)

> **정정·보완 (2026-09-04 전수 측정 · 이슈 #4).** 위 표는 `getAllowedChatIds` **정의 4곳**만 센다.
> 그 4곳이 만든 값은 **함수 인자로 계속 전파된다** — `chatIds: number[]` 파라미터가
> **18 시그니처**, 실인자 호출이 **19곳**이고, `scheduler.ts:40` 값 하나를 **13개 cron 콜백이
> 클로저로 캡처**한다. 그리고 `quarterly-report.ts:52`(`sendDocument`)가 **목록 자체**를 요구하므로
> **`scheduler.ts:21` 정의는 실질적으로 지울 수 없다.**
> **완전 제거 가능한 것은 `budget-alert.ts:14` 1곳뿐이다.** 상세는 이 문서 하단
> *"추가 측정 — 2026-09-04 (myFinance 22곳 루프 본문 전수)"* M2-5 / M4.
> 행번호는 위 표(`14/15/22/30`)가 아니라 **`13/14/21/29`** 가 맞다 (003 §3 발견 8 정정, 전부 −1).

## 기능 매트릭스 — 정본을 한쪽으로 고르면 양쪽 다 기능이 빠진다

| 기능 | myFinance `sendHtml` | myFitness `sendToAll` | myFitness `…WithKeyboard` |
|---|---|---|---|
| 재시도 백오프 | ○ `[2000,8000,30000]`ms ×4회 | ○ 동일 상수 | **✕** |
| HTML 파싱 폴백 | ○ | ○ | **✕** |
| 폴백 판정 | 로컬 `isParseError` (`error_code===400`) | 공유 `isHtmlParseError` (정규식) | — |
| 폴백 시 재시도 예산 | 폴백도 `withRetry` 재진입 | `attempt--` 로 예산 보존 | — |
| 4096자 초과 | **분할** (`splitMessage`) | **절단** (`truncate`, `slice(0,4093)+"..."`) | **절단** |
| 수신자 목록·루프 | ✕ (호출부) | ○ | ○ |
| 결과 집계 | ✕ (`void`) | ○ | ○ |
| messageId 반환 | ✕ | ✕ | ○ `first.messageId` |
| 인라인 키보드 | **✕** (`rsu.ts:184` 가 raw 우회) | ✕ | ○ |
| 로그 마스킹 | ○ `sanitizeError` | ○ | ○ |

→ myFinance 만: **메시지 분할**. myFitness 만: **결과 집계·messageId·키보드·폴백 예산 보존**.
   **합집합 설계가 필요하다.**

## `SendResult` 는 분기·영속화된다 — `void` 인터페이스 불가

```bash
grep -rn "sendResult\.\|r\.failed\|r\.total\|r\.sent" ~/workspace/myFitness/src --include='*.ts' | grep -v 'send.ts'
grep -rn "telegramMessageId" ~/workspace/myFitness/prisma/schema.prisma
grep -rn "telegramMessageId\|messageId" ~/workspace/myFinance/prisma/schema.prisma
```

| 소비 지점 | 하는 일 |
|---|---|
| `scheduler.ts:35,39` · `auto-adjust.ts:402,406` · `auto-adjust-cron.ts:79,83` | `total===0` / `sent===0` 분기 |
| `lib/monitoring/admin-alerts.ts:233` | `delivered = r.sent > 0` → rate-limit 상태 결정 |
| `auto-adjust.ts:413-419` · `auto-adjust-cron.ts:97-100` | `first.messageId`/`first.chatId` **DB 저장** |

myFitness `prisma/schema.prisma:359-360` — `telegramMessageId String?`, `telegramChatId String?`,
`@@index([telegramMessageId])`.
myFinance `prisma/schema.prisma` 의 `messageId`/`telegramMessageId`: **0건**.

→ **`Promise<void>` 를 정본 시그니처로 쓰면 myFitness 가 깨진다.** 어댑터는 불투명 메시지 참조를
   반환하고, 그 참조가 `String` 으로 영속화 가능해야 한다.

## 호출부는 텔레그램을 아는가 — 어댑터 경계

```bash
grep -rn "sendHtml(" ~/workspace/myFinance/src --include='*.ts' | grep -v 'utils/telegram.ts'
grep -rn "sendToAll\b\|sendToAllWithKeyboard(" ~/workspace/myFitness/src --include='*.ts' | grep -v 'notifications/send.ts'
for p in parse_mode reply_markup InlineKeyboard chat_id; do grep -rn "$p" ~/workspace/$d/src --include='*.ts' | wc -l; done
grep -rn "bot\.api\.sendMessage\|api\.sendMessage(" ~/workspace/$d/src --include='*.ts' | grep -v '/__tests__/'
```

| | myFinance | myFitness |
|---|---|---|
| 초크포인트 호출 건수 | **20** (전부 `await sendHtml(bot, chatId, <string>)` — **옵션 인자 0건**) | **6** (`sendToAll` 4 + `sendToAllWithKeyboard` 2) |
| `parse_mode` (src 전체 / notifications 내) | 15 / 2 | 8 / 2 |
| `reply_markup` | 29 / 1 | 12 / 2 |
| `InlineKeyboard` | 15 / 2 | 14 / 5 |
| `chat_id` (snake) | **0 / 0** | **0 / 0** |
| raw `api.sendMessage` 총 / 초크포인트 내 / 밖 | 4 / 3 / **1** (`notifications/rsu.ts:184`) | 4 / 3 / **1** (`commands/start.ts:23`, 인바운드 `/help`) |

`notifications/` 내 텔레그램 개념 노출 (테스트 제외) 전량:
- myFinance: `rsu.ts:13,178,184-186` (유일한 아웃바운드 누수 — 초크포인트에 키보드가 없어서),
  `alert-dispatcher.ts:111` (주석뿐)
- myFitness: `send.ts:6,51,53,101,110-112` (초크포인트 내부), `auto-adjust.ts:9,62,63`
  (`buildAutoAdjustKeyboard` — 키보드 조립은 호출부), `auto-adjust-callback.ts:308` (인바운드)

→ **아웃바운드 경계는 깨끗하다.** 우회는 myFinance `rsu.ts` 1곳뿐.
   단 호출부는 여전히 **HTML 문자열**을 넘긴다 — `parse_mode` 는 몰라도 콘텐츠 모델이 HTML 이다.

## `src/bot/utils/error.ts` — diff 118줄의 실체

```bash
grep -nE "^export (function|const|interface|type)" ~/workspace/$d/src/bot/utils/error.ts
norm() { sed -E 's://.*$::; s:/\*.*\*/::' "$1" | sed -E '/^\s*\*/d; /^\s*\/\*/d' \
  | tr -d ';' | tr "'" '"' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//' | grep -v '^$'; }
diff <(norm ~/workspace/myFinance/src/bot/utils/error.ts) <(norm ~/workspace/myFitness/src/bot/utils/error.ts)
```

**export 목록 — 5/5 완전 동일. 한쪽에만 있는 함수 없음.**
`sanitizeMessage`, `sanitizeError`, `getErrorCode`, `isNetworkError`, `isHtmlParseError`
(myFinance 행 19/27/55/78/98, myFitness 행 11/15/41/60/82)

| | 원시 diff | 정규화 후 줄수 | 정규화 diff |
|---|---|---|---|
| `error.ts` | 118 | fin 89 / fit 77 | **20** |

정규화 diff 20줄 중 **실동작 차이 2건**, 나머지 18줄은 myFinance 쪽 JSDoc:

| # | 차이 | myFinance | myFitness | 영향 |
|---|---|---|---|---|
| 1 | `NETWORK_CODES` | `ENOTFOUND` **포함 (7개)** | 없음 (6개) | myFitness 는 DNS 일시 실패 미재시도 |
| 2 | `sanitizeError` 반환 | `sanitizeMessage(parts.join(" \| "))` | `parts.join(" \| ")` | myFitness 는 join 단계 토큰 누출 이중 보호 없음 |

각 export 의 실제 참조 수 (`error.ts` 제외, src 전체):

```bash
for f in sanitizeMessage sanitizeError getErrorCode isNetworkError isHtmlParseError; do
  grep -rn "\b$f\b" ~/workspace/$d/src --include='*.ts' | grep -v "src/bot/utils/error.ts" | wc -l
done
```

| export | myFinance | myFitness |
|---|---|---|
| `sanitizeError` | 29 | 33 |
| `isNetworkError` | 2 | 2 |
| `isHtmlParseError` | **0** | 2 |
| `sanitizeMessage` | **0** | **0** |
| `getErrorCode` | **0** | **0** |

→ **myFinance 의 `isHtmlParseError` 는 죽은 export** — `telegram.ts:79` 의 로컬 `isParseError`
  (`error_code===400`) 를 쓴다. **두 저장소는 HTML 파싱 실패를 다른 기준으로 판정한다.**
→ `sanitizeMessage`/`getErrorCode` 는 양쪽 다 내부 전용 → 공개 API 에서 제외 가능.

## `src/bot/utils/formatter.ts` — 이름만 같다

```bash
grep -nE "^export function" ~/workspace/$d/src/bot/utils/formatter.ts
grep -rn "splitMessage\|truncate(" ~/workspace/$d/src --include='*.ts'
```

| | myFinance (78줄) | myFitness (31줄) |
|---|---|---|
| exports | `accountEmoji`, `formatKRWCompact`, `formatKRWFull`, `formatPercent`, `formatSignedKRW`, `formatSignedKRWCompact`, `profitEmoji`, `formatUSD`, **`splitMessage`** | `fmtDistance`, `fmtPace`, `fmtDuration`, `fmtSleepTime`, `fmtTime` |
| 겹치는 export | **0** | **0** |

메시지 분할 대응물:

| | myFinance | myFitness |
|---|---|---|
| 위치 | `bot/utils/formatter.ts:52` — **export** | `bot/utils/telegram.ts:38` — **모듈 private** |
| 알고리즘 | 줄 누적, 초과 줄은 하드 슬라이스 | `lastIndexOf("\n", max)`, 경계 절반 미만이면 하드 컷 |
| 아웃바운드에서 쓰이나 | **○** (`sendHtml`·`replyHtml`) | **✕ — `replyLong`(인바운드) 전용** |
| 아웃바운드 길이 정책 | **분할** | **절단** (`send.ts:35`) |
| 참조 라인 | 8 | 2 |

→ **myFitness 아웃바운드는 4096자 초과 알림 내용을 버린다.** 어댑터가 분할을 채택하면 기능 개선이지만
  **관측 가능한 동작 변경**이다.

## HTML 헬퍼 — 어댑터 표면을 어디까지 넓힐 것인가

```bash
grep -rl "\bescapeHtml\b" ~/workspace/$d/src --include='*.ts' | wc -l
grep -rn "\bh\.\(b\|i\|code\|pre\)(" ~/workspace/$d/src --include='*.ts' | wc -l
```

| | myFinance | myFitness |
|---|---|---|
| `escapeHtml` 정의 지점 | 1 (`utils/telegram.ts:17`) | **2** (`utils/telegram.ts:18`, `notifications/auto-adjust.ts:112` — 로직 동일) |
| `escapeHtml` 사용 파일 / src ts 파일 | **26 / 264** | **3 / 154** |
| `h.b`/`h.i`/`h.code`/`h.pre` 참조 라인 / 파일 | **91 / 19** | **0 / 0** (헬퍼 없음) |
| md→HTML 변환기 | `utils/markdown.ts` `markdownToTelegramHtml` (103줄 — 표→리스트, 코드블록, 인용, 취소선) + `stripHtml` | `utils/telegram.ts:6` `mdToHtml` (10줄, 정규식 7개) |
| 변환기 참조 라인 | 13 | 9 |

→ `h` 헬퍼를 어댑터로 옮기면 myFinance **19개 파일**이 어댑터에 의존한다. 표면이 "전송"에서
  "포매팅"으로 넓어진다. md→HTML 은 역량 차가 커서 정본은 myFinance.

## HTML 이 myFinance 에서는 저장 포맷이다

```bash
grep -rn "decodeHtmlEntities\|PRE_ESCAPED_KINDS" ~/workspace/myFinance/src --include='*.ts' | grep -v '/__tests__/'
```

`PRE_ESCAPED_KINDS = {target_hit, stop_loss, watch_buy, watch_zone}` 가 **3개 파일에 중복 정의**:
`bot/notifications/alert-dispatcher.ts:100`, `app/alerts/history/client-utils.ts:43`,
`app/api/alerts/history/export/csv-format.ts:46`.
저장된 alert 메시지가 kind 에 따라 escape 됨/raw 로 **혼재**하고, 전송 직전
`decodeHtmlEntities`→`escapeHtml` round-trip 을 kind 로 gating 한다 (`alert-dispatcher.ts:117-119`).

→ **채널 중립화는 봇 코드 안에서 끝나지 않는다.** alert 히스토리 저장 규약, 웹 UI
  (`app/alerts/history`), CSV export 까지 걸린다. 단계 1 범위에서 명시적으로 제외해야 할 영역.

## 측정하지 못한 것

| 항목 | 왜 못 쟀나 |
|---|---|
| 실제 전송 실패율·재시도 발동 빈도 | 런타임 로그가 필요. 정적 측정 범위 밖이고 서버 접근은 읽기 전용 규율 밖 |
| 4096자 초과가 실제로 몇 번 발생하는지 (myFitness 절단 손실량) | 위와 동일 — 운영 로그 필요 |
| `@pleiades/notify` 추출 후 남는 호출부 수정 라인 수 | 인터페이스가 확정되기 전에는 계산 불가 (§ 층위 차이가 변수) |

---

# 추가 측정 — 2026-09-03 (Discord 이식 제약)

단계 1 (`@pleiades/notify` 추출 + Discord 아웃바운드 전환) 설계 근거.
상세 표는 `_workspace/01_surveyor_porting.md`.

## 측정 시점 저장소 상태

```bash
for d in myFinance myFitness; do
  git -C ~/workspace/$d branch --show-current
  git -C ~/workspace/$d status --porcelain | wc -l
  git -C ~/workspace/$d log -1 --format='%h %ad %s' --date=short
done
```

| | myFinance | myFitness |
|---|---|---|
| 브랜치 / dirty | `dev` / 0 | `dev` / 0 |
| HEAD | `c549fa6` (2026-08-27) | `2625600` (2026-09-03, PR #360 머지) |

> **정정 (2026-09-03 재측정).** 이 문서 상단 "스택 대조" 의 myFitness 브랜치 `chore/359-1` 은
> 더 이상 유효하지 않다. PR #360 이 `dev` 로 머지되어 현재 `dev`/clean.
> 아래 수치는 모두 이 HEAD 기준.

경로 분류: **아웃바운드** = `bot/notifications/**`(단 `*-callback.ts` 제외) + `sendHtml`/`sendToAll`
+ `lib/ai/advisor-monitor.ts` + `lib/monitoring/admin-alerts.ts`.
**인바운드** = `bot/commands/**` + `bot/middleware/**` + `*-callback.ts` + `replyHtml`/`replyLong`.

## 텔레그램 고유 기능 — 아웃바운드/인바운드 분포

```bash
for d in myFinance myFitness; do
  for feat in 'parse_mode' '<b>|<code>|<i>|<pre>' '4096' 'InlineKeyboard|reply_markup' \
              'callbackQuery|callback_query|answerCallbackQuery' \
              'sendPhoto|sendDocument|InputFile|getFile|message:photo|file_id'; do
    for area in bot/notifications bot/commands bot/middleware bot/utils; do
      grep -rEn "$feat" ~/workspace/$d/src/$area --include='*.ts' | wc -l
      grep -rlE "$feat" ~/workspace/$d/src/$area --include='*.ts' | wc -l
    done
    grep -rEn "$feat" ~/workspace/$d/src --include='*.ts' | grep -v "/src/bot/" | wc -l
  done
done
```

hits / (해당 패턴 포함 파일 수 of 디렉터리 전체 `.ts` 수)

| 기능 | fin 아웃바운드 | fin 인바운드 | fit 아웃바운드 | fit 인바운드 | 아웃바운드에 있나 |
|---|---|---|---|---|---|
| `parse_mode: HTML` | 2 / 2 of 20 | 4 / 3 of 17 | 2 / 1 of 5 | 5 / 5 of 13 | **예** (초크포인트 수렴) |
| HTML 태그 `<b><code><i><pre>` | 15 / 6 of 20 **+ `lib/ai/advisor-monitor.ts` 8** | 2 / 1 of 17 | 13 / 3 of 5 **+ `lib/monitoring/admin-alerts.ts` 11** | 17 / 6 of 13 | **예 — 초크포인트 밖, 본문 생성부에 산재** |
| 4096 상수 | 공유 상수 1개 경유 | 리터럴 1 | 독립 상수 1 (`send.ts:9`) | 독립 상수 3 | **예** |
| `InlineKeyboard`/`reply_markup` | **3 / 1 of 20** (`rsu.ts`) | 40 / 3 of 17 | **7 / 3 of 5** | 17 / 3 of 13 | **예** |
| callback query 핸들러 | 0 (핸들러는 `commands/vest-confirm.ts`) | 64 / 4 of 17 | **9 / 1 of 5** (`auto-adjust-callback.ts`) | 12 / 1 of 13 | 발신은 아웃바운드, 수신은 인바운드 |
| 파일·문서 전송 | **2 / 1 of 20** — `quarterly-report.ts:54 sendDocument+InputFile` | 2 / 1 of 17 | **0** | 3 / 1 of 13 (`food-photo.ts`, `message:photo`+`getFile`) | **fin 만 예** |
| `sendPhoto` | 0 | 0 | 0 | 0 | 실제로 0 (패턴 오류 아님) |

HTML 본문 생성 확산:

```bash
grep -rn "from '@/bot/utils/telegram'\|markdownToTelegramHtml\|mdToHtml" ~/workspace/$d/src --include='*.ts'
```

| | myFinance | myFitness |
|---|---|---|
| 아웃바운드 모듈 중 `escapeHtml`/`h` import | **14 / 16** | 0 (템플릿 리터럴에 태그 직타) |
| 아웃바운드 모듈 중 md→HTML 변환기 사용 | 4 | 1 (`scheduler.ts:33`) |
| 변환기 | `bot/utils/markdown.ts:51 markdownToTelegramHtml` | `bot/utils/telegram.ts:6 mdToHtml` |

## 4096 → 2000 은 상수 교체가 아니다

```bash
grep -rn "4096" ~/workspace/$d/src --include='*.ts'
sed -n '50,77p' ~/workspace/myFinance/src/bot/utils/formatter.ts
sed -n '35,37p;38,59p' ~/workspace/myFitness/src/bot/notifications/send.ts
```

| | myFinance | myFitness |
|---|---|---|
| 상수 정의 수 | 1 (`bot/utils/formatter.ts:50 TELEGRAM_MAX_LENGTH`) + 하드코딩 리터럴 1 (`commands/briefing.ts:98`) | **4개 독립 정의** (`notifications/send.ts:9`, `utils/telegram.ts:3`, `commands/food-edit-format.ts:10`, `commands/food-photo.ts:215`) |
| 아웃바운드 초과 처리 | **분할** (`splitMessage`, 줄 단위) | **절단** (`send.ts:36` `slice(0, MAX-3) + "..."`) |
| 인바운드/아웃바운드 상수 공유 | **공유** (하나를 둘이 씀) | 분리 |
| splitter 가 HTML 태그 인식하나 | **아니오** | **아니오** |

→ 구조 변경 3건: (1) myFitness 아웃바운드에 **분할 로직 신규 도입** (지금은 절단이라 2000 에서 손실 2배),
(2) 어느 splitter 도 태그 경계를 모름 — 한도 절반이면 분할 지점 약 2배 → 태그 절단 fallback 발동 확률 상승,
(3) myFinance 는 상수를 인바운드와 공유해 아웃바운드만 낮추려면 상수를 쪼개야 함.

## 아웃바운드에 붙은 인터랙션 2건

| 플로우 | 발신 (아웃바운드) | 수신 (인바운드) | 상태 |
|---|---|---|---|
| fin RSU 베스팅 D-day 확정 | `notifications/rsu.ts:178-190` `bot.api.sendMessage(..., {parse_mode, reply_markup})`, `callback_data=vest:confirm:<rsuId>` | `commands/vest-confirm.ts:22 bot.callbackQuery(/^vest:(confirm\|cancel):(.+)$/)` | callback_data 에 embed |
| fit 훈련 자동조정 수락/거절/스누즈 | `notifications/auto-adjust.ts:394` → `send.ts:98 sendToAllWithKeyboard()`, `callback_data=auto_adjust:<action>:<id>` | `notifications/auto-adjust-callback.ts:230` | **DB 영속** (아래) |

## 수신자 식별 — 타입 불일치 + DB 영속화

```bash
grep -rnE "chatIds?\s*:\s*(number|string)" ~/workspace/$d/src --include='*.ts' | wc -l
grep -niE "chatid|messageid|telegram" ~/workspace/$d/prisma/schema.prisma
node -e "const s='1234567890123456789'; console.log(Number(s), String(Number(s))===s)"
```

| | myFinance | myFitness |
|---|---|---|
| `chatId: number` 시그니처 | **20건** (전부 아웃바운드) | 10건 (전부 인바운드) |
| `chatId: string` 시그니처 | **0건** | 2건 (아웃바운드 `send.ts:21,41`) |
| 인바운드 인증 | `Set<number>`, `.map(Number)` (`middleware/auth.ts:3-9`) | `string[]`, `.toString()` (`middleware/auth.ts:3-10`) |
| Prisma 스키마 텔레그램 식별자 | **0건** (in-memory `Map` 만) | **`WorkoutAdjustment.telegramMessageId` / `.telegramChatId` + `@@index([telegramMessageId])`** (`schema.prisma:358-367`, 마이그레이션 `20260716054043_workout_adjustment`) |

Discord snowflake 정밀도 실측:
`Number('1234567890123456789')` → `1234567890123456800`, 왕복 불일치.
(19자리 > `Number.MAX_SAFE_INTEGER`. 텔레그램 chat id 9~10자리에서는 드러나지 않던 문제)

## `src/bot` 밖 누수 6곳의 호출 형태

판정: (a) 봇 인스턴스 직접 생성 / (b) 초크포인트 함수 호출 / (c) 환경변수 이름만 참조

```bash
grep -nE "^import|grammy|new Bot|TELEGRAM|sendMessage|sendHtml|sendToAll" <file>
grep -rn "new Bot(" ~/workspace/$d/src --include='*.ts'
grep -rn "from ['\"]grammy" ~/workspace/$d/src --include='*.ts' | grep -v '/src/bot/'
```

| 파일 | 판정 | 형태 | 방향 |
|---|---|---|---|
| fin·fit `src/mcp/logger.ts` (`:197`/`:183`) | **(c)** | redaction 키 문자열 `'TELEGRAM_BOT_TOKEN'` 1개. grammY import 0, 전송 0 | 무관 |
| fin `src/lib/cron.ts:14` | (c)+(b) | env 파싱 → `checkPriceAlerts(chatIds)` 등 notifications 함수 호출. grammY import 0 | 아웃바운드 |
| fin `src/lib/ai/advisor-monitor.ts:199-222` | **(b)** | `await import('@/bot')` + `await import('@/bot/utils/telegram')` → `sendHtml(bot, chatId, msg)` (동적 import, 순환참조 회피) | 아웃바운드 |
| fin `src/app/api/alerts/history/[id]/retry/route.ts:30,73` | (c)+(b) | env 파싱 → `redispatchAlert(row, chatIds)` | 아웃바운드 |
| fit `src/lib/garmin/sync.ts:2,260,363` | **(c)** | `import type { Bot }` — type-only. `options.notifyBot` 패스스루. 전송 0 | 아웃바운드(경유) |
| fit `src/lib/monitoring/admin-alerts.ts:7,10,232` | **(b)** | `import type {Bot}` + `sendToAll(bot, message)` | 아웃바운드 |

**(a) = 6곳 중 0곳.** `new Bot(` 은 각 저장소 `src/bot/index.ts` 1곳뿐
(fin `:39`, fit `:36`). `src/bot` 밖 grammY import: fin 0건 / fit 2건(둘 다 `import type`).
→ **어댑터 도입 비용 자체는 작다.** 남는 실질 작업은 누수 지점이 아니라 **본문 HTML 생성**
(advisor-monitor 8 hits, admin-alerts 11 hits).

## 초크포인트 예외 2곳 (measured-facts 이전 기록 보완)

```bash
for f in ~/workspace/$d/src/bot/notifications/*.ts; do
  echo "$(basename $f) sendHtml=$(grep -c sendHtml $f) raw=$(grep -c 'api\.sendMessage\|api\.sendDocument' $f)"
done
```

| | myFinance | myFitness |
|---|---|---|
| 초크포인트 경유 아웃바운드 모듈 | 14 / 16 | 4 / 4 |
| 원시 `bot.api.*` 직접 호출 | **2** — `rsu.ts`(keyboard), `quarterly-report.ts`(sendDocument) | 0 (원시 호출은 `send.ts` 내부 3곳) |

> **보완 (2026-09-03 재측정).** 위 "전송 호출 분포" 절의 "myFinance `notifications/` 내 원시 전송 파일
> `rsu.ts` 1개" 는 개수는 맞으나 `quarterly-report.ts:54` 의 `bot.api.sendDocument` 가 누락돼 있었다.
> 실제로는 **2개**이며, 그 둘이 각각 keyboard 와 파일 첨부 — Discord 이식 난도가 가장 높은 두 기능이다.

## 테스트 도입 전제

```bash
node -e "const p=require('~/workspace/$d/package.json'); console.log(p.scripts, p.devDependencies)"
find ~/workspace/$d/src -name '*.test.ts' -o -name '*.test.tsx' | wc -l
find ~/workspace/$d/src -type d -name '__tests__' | wc -l
grep -rhoE "^\s*(it|test)\(" ~/workspace/myFinance/src --include='*.test.ts' | wc -l
```

| | myFinance | myFitness |
|---|---|---|
| 테스트 파일 | **42 / 424 src 파일** | **0 / 218** |
| `__tests__` 디렉터리 | 18 | 0 |
| `it(`/`test(` 블록 | **786** | 0 |
| 테스트 LOC | 7,572 | 0 |
| 설정 | `vitest.config.mts` (루트, 15줄) | **없음** |
| setup 파일 | **없음** (`setupFiles` 미지정) | — |
| scripts | `test`,`test:run`,`test:coverage` | 없음 (대신 `typecheck` 있음 — fin 에는 없음) |
| 테스트 의존성 | `vitest@^4.1.8`, `@vitest/coverage-v8@^4.1.8`, `vite-tsconfig-paths@^6.1.1` | **0개** |
| 패턴 | `src/**/__tests__/**/*.test.ts` (`.tsx` 미포함) | — |

myFitness 도입에 필요한 것: devDep 3개 + `vitest.config.mts` 15줄 + scripts 3줄. **setup 파일·tsconfig 변경 불필요**
(양쪽 `paths: {"@/*": ["./src/*"]}` 동일, `vite-tsconfig-paths` 가 해석. tsconfig 차이는 `jsx` 와 `include` 1줄뿐).
`npm install` 은 실서비스 서버 쓰기 → `dual-repo-operator` 소관.

참고 구현: `myFinance/src/bot/notifications/__tests__/alert-dispatcher.test.ts` (332줄) 이
아웃바운드 초크포인트 테스트 사례. 단, 파일 주석이 남긴 제약 —
`'../index' (getBot) 는 모듈 로드시 모든 command register 를 chain-import` 하므로 mock 필수.
→ `@pleiades/notify` 는 `src/bot/index.ts` 를 참조하지 말고 transport 를 **주입**받아야 한다.

> **보완 (2026-09-04 집행 · 이슈 #2).** 위 *"myFitness 도입에 필요한 것: devDep 3개 + …"* 는
> 목록으로는 맞으나 **`npm install` 이 그대로는 실패한다.** fit `package.json` `overrides` 의
> **`"postcss": "$postcss"`** 한 줄 때문이다 (`npm error Unable to resolve reference $postcss`).
> vitest 3종 자체는 **peer 충돌 없이 resolve 된다** — `ERESOLVE` 0건, vitest 4.1.11 /
> coverage-v8 4.1.11 / vite-tsconfig-paths 6.1.1 / **vite 6.4.3 (fin 과 동일)**, lock 716 → 785.
> 상세·재현·수정안은 이 문서 하단 *"추가 측정 — 2026-09-04 (myFitness vitest resolve · U1 원인 규명)"*.
> 위 표의 *"scripts: 없음 (대신 `typecheck` 있음 — fin 에는 없음)"* 은 맞다. 단
> **fin 도 `next build` 가 타입 검사를 하므로** 비대칭은 "검사 유무"가 아니라 **"검사 단계"** 다.

## 수신자·라우팅

```bash
grep -rhoE "TELEGRAM_[A-Z_]+" ~/workspace/$d/src | sort | uniq -c
grep -oE "^[A-Z_]+" ~/workspace/$d/.env.example      # 이름만. .env 값은 미열람
grep -rn "ALLOWED_CHAT_IDS\|ADMIN_CHAT_IDS" ~/workspace/$d/src --include='*.ts'
```

| 변수 | myFinance | myFitness |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | O | O |
| `TELEGRAM_ALLOWED_CHAT_IDS` | O (소스 16회) | O (소스 4회) |
| `TELEGRAM_ADMIN_CHAT_IDS` | **O** | **X — 없음** |
| `TELEGRAM_WEBHOOK_SECRET` | O | X |

파싱 지점 (같은 `.split(',')` 블록이 복사됨, 중앙화 안 됨):

| 저장소 | 위치 | 방향 | 타입 |
|---|---|---|---|
| fin | `bot/middleware/auth.ts:3` | 인 | `Set<number>` |
| fin | `bot/notifications/scheduler.ts:22` / `budget-alert.ts:15` / `lib/cron.ts:14` / `app/api/alerts/history/[id]/retry/route.ts:30` | 아웃 | `number[]` |
| fin | `lib/ai/advisor-monitor.ts:199` (**ADMIN**) | 아웃 | `number[]` |
| fit | `bot/middleware/auth.ts:3` | 인 | `string[]` |
| fit | `bot/notifications/send.ts:25 getChatIds()` | 아웃 | `string[]` |

**fin 6곳 / fit 2곳.**

알림 종류별 수신자:

| 종류 | myFinance | myFitness |
|---|---|---|
| 일반 알림 전부 | `TELEGRAM_ALLOWED_CHAT_IDS` | `TELEGRAM_ALLOWED_CHAT_IDS` |
| 운영/관리자 alert | **`TELEGRAM_ADMIN_CHAT_IDS` (분리)** | **`TELEGRAM_ALLOWED_CHAT_IDS` (동일)** |
| 종류별 세분 라우팅 | 없음 (2등급) | 없음 (1등급) |
| 도메인 축 | **없음** | **없음** |

myFinance `advisor-monitor.ts:187-194` 가 분리 이유를 명시 (원문 인용):
`TELEGRAM_ALLOWED_CHAT_IDS (봇 사용자 화이트리스트, 가족 chat 포함) 는 alert 대상으로 사용 금지 —
alert 본문에 AdvisorError.detail (stderr tail) 이 포함되며 … 가족 chat 에 internal 진단이 노출되면 안 됨.`
그런데 **myFitness `admin-alerts.ts:232` 는 정확히 그 금지된 동작을 한다** (`sendToAll` → ALLOWED).

→ 도메인 #3(캘린더) 전제라면 `@pleiades/notify` 는 (수신자 그룹 × 알림 등급) 2축이 필요.
현재 fin 2등급 / fit 1등급, 도메인 축은 양쪽 다 0. env 이름도 `TELEGRAM_` prefix 라 3도메인 공유 시 재설계 동반.

## 못 잰 값

| 항목 | 이유 |
|---|---|
| 실제 수신자 chat id 개수·값 | `.env` 값 열람 금지 (이름만 확인) |
| 아웃바운드 알림의 실제 평균/최대 길이 | 런타임 데이터. 실서비스 DB 조회 필요 → 읽기 전용 규율상 미수행 |
| myFitness `WorkoutAdjustment` 중 telegram id 채워진 row 수 | 위와 동일 |
| Discord 측 제한값 | 대상 저장소에 Discord 코드 0줄 — 저장소 실측 대상 아님 |
| 전환 회귀 커버리지 baseline | myFitness 테스트 0개 |

---

# 추가 측정 — 2026-09-04 (저장소 배치 변형 A — pleiades 하위 이동)

사용자 질문 "두 프로젝트를 pleiades 하위에 두는 게 낫지 않나"의 비용 측정.
**변형 A** = `pleiades/repos/{myFinance,myFitness}` 에 **독립 git 저장소**로 배치.
원격·배포·릴리즈 격리 유지. (**변형 B** = 진짜 모노레포 = 002 단계 4 = 003 §2, 재측정 안 함.)
상세는 `_workspace/01_surveyor_layout.md`.

## 측정 시점 저장소 상태

```bash
for d in myFinance myFitness; do
  git -C ~/workspace/$d branch --show-current
  git -C ~/workspace/$d status --porcelain | wc -l
  git -C ~/workspace/$d log -1 --format='%h %ad %s' --date=short
  git -C ~/workspace/$d stash list | wc -l
done
```

| | myFinance | myFitness |
|---|---|---|
| 브랜치 / dirty | `integration/pleiades` / 0 | `integration/pleiades` / 0 |
| HEAD | `c549fa6` (2026-08-27) | `ac034be` (2026-09-04) |
| `git stash` | 0건 | 0건 |
| worktree / submodule | 1 / 없음 | 1 / 없음 |

> **정정 (2026-09-04 재측정).** 위 "Discord 이식 제약" 절은 브랜치 `dev`, myFitness HEAD `2625600`
> (2026-09-03) 로 기록했다. 현재는 **양쪽 `integration/pleiades`**, myFitness HEAD 는
> `ac034be` 로 이동했다 (PR #366 머지). 이 절의 값은 새 HEAD 기준.

> **정정 (2026-09-04 재측정).** 위 "테스트 도입 전제" 절은 myFitness `scripts` 에
> "테스트 없음 (대신 `typecheck`)" 으로 기록했다. 현재 `package.json` 에
> **`test`, `verify:mcp-date-labels`, `verify:food-edit-pending` 3개가 추가**됐다
> (`test` = 두 verify 를 tsx 로 실행). **vitest 의존성은 여전히 0개**이므로
> CLAUDE.md 의 미확인 U1(myFitness vitest resolve)은 그대로 유효하다.

## M1. clone 으로는 따라오지 않는 것

```bash
git -C ~/workspace/$d status --porcelain --untracked-files=all           # untracked
git -C ~/workspace/$d ls-files --others --ignored --exclude-standard --directory   # ignored
git -C ~/workspace/myFinance ls-files .claude | wc -l
```

untracked(비ignore) 파일: **양쪽 0**. 소스로 보이는 untracked 없음.

**ignored 중 clone 후 수동 복사가 필요한 것** (생성물 제외)

| | myFinance | myFitness |
|---|---|---|
| `.env` | 332 B | 221 B |
| `.claude/settings.local.json` | 17,469 B | (아래 `.claude/` 에 포함) |
| **`.claude/` 전체** | **tracked (16 files)** | **ignored — 18 files / 104 K** |
| **`CLAUDE.md`** | **tracked** | **ignored — 8,621 B** |
| `.garmin-tokens/` | — | 2 files / 8 K (`oauth2_token.json` 2,839 B, `oauth1_token.json` 113 B) |
| `.vscode/settings.json` | tracked | ignored / 4 K (`{"jira-plugin.workingProject":""}` 1줄) |
| 재생성 가능 | `node_modules` 38,795f/822M · `.next` 881f/1.1G · `dist` 13M · `coverage` 1.8M | `node_modules` 43,402f/825M · `.next` 1,266f/286M · `dist` 3.2M · `src/generated/prisma` 25f/20M (`npx prisma generate`) |

**`.gitignore` 비대칭이 원인**

| | myFinance | myFitness |
|---|---|---|
| claude 관련 ignore 줄 | `.claude/settings.local.json` 1줄 | `.claude/` · `CLAUDE.md` · `.runtime/` 3줄 |
| `.claude/` tracked 파일 수 | **16** | **0** |

→ **myFinance 는 clone 하면 하네스가 따라오고, myFitness 는 통째로 사라진다.**
   이 문서 "하네스 구성" 절의 myFitness agents 5 / skills 9 / rules 3 은 **전부 로컬 전용 파일**이다.

**`.env` 키 (값 미열람)**

```bash
grep -oE '^[A-Za-z_][A-Za-z0-9_]*' ~/workspace/$d/.env | sort -u
comm -23 <(.env 키) <(.env.example 키)
```

| | myFinance | myFitness |
|---|---|---|
| `.env` 키 수 / `.env.example` 키 수 | 7 / 10 | 4 / 12 |
| **example 에 없는 `.env` 키** | **`NEXTAUTH_SECRET`, `NEXTAUTH_URL`** | **0개** |

→ myFinance 는 `cp .env.example .env` 로 복구하면 2개가 **조용히 빠진다.** 원본 복사만 안전.

**로컬 전용 브랜치·커밋·태그**

```bash
git -C ~/workspace/$d for-each-ref --format='%(refname:short)|%(upstream:short)|%(upstream:track)' refs/heads
git -C ~/workspace/$d log --oneline --branches --not --remotes=origin
comm -23 <(git tag|sort) <(git ls-remote --tags origin|sed 's|.*refs/tags/||;s|\^{}||'|sort -u)
```

| 저장소 | upstream 없는 브랜치 | origin 에 없는 커밋 |
|---|---|---|
| myFinance | `integration/pleiades` (커밋 0) | 1 — `0e662df` on `feat/45-error-loading` (ahead 1) |
| myFitness | `integration/pleiades` (커밋 0) | 2 — `54c2f57`, `84086b8` on `fix/261-2` (upstream **gone**) |

로컬 전용 태그: **양쪽 0**. → clone 시 손실은 커밋 3개 + 브랜치 이름 2개. `mv` 면 0.

## M2. 디스크

```bash
du -sh ~/workspace/$d/{.git,node_modules,.next,dist,coverage} ~/workspace/$d
cd ~/workspace/$d && git ls-files | while read f; do stat -f%z "$f"; done | awk '{s+=$1}END{print s}'
df -h ~
```

| | myFinance | myFitness | 합계 |
|---|---|---|---|
| `.git` | 16 MB | 32 MB | 48 MB |
| tracked 워킹트리 | 733 files / 8.6 MB | 396 files / 2.9 MB | 11.5 MB |
| `node_modules` | 822 MB | 825 MB | 1.65 GB |
| `.next` | 1.1 GB | 286 MB | 1.39 GB |
| `dist` / `coverage` | 13 MB / 1.8 MB | 3.2 MB / — | 18 MB |
| **디렉터리 총계** | **1.9 GB** | **1.1 GB** | **3.06 GB** |

`df -h ~` → `/dev/disk3s5 926Gi size / 856Gi used / **21Gi avail** / 98% capacity`

| 방식 | 추가 디스크 | 여유 잔량 |
|---|---|---|
| `mv` (이동) | **0** | 21 GiB |
| `git clone` (원본 유지) + `npm ci` + `build` | **+3.06 GB** | 약 18 GiB |

## M3. 절대 경로 의존 — **6곳, 전부 권한 파일**

```bash
grep -rn -- "/workspace/myFinance\|/workspace/myFitness\|/Users/sagan" ~/workspace/$d \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=dist --exclude-dir=coverage
```

| 파일:줄 | 저장소 | 영향 |
|---|---|---|
| `.claude/settings.local.json:22,43,44,102,103,112` | myFinance | 허용 규칙 6/150 (4.0%) 매칭 실패 → **권한 프롬프트 재발.** 앱은 무사 |
| (myFitness) | — | **소스·설정 전체 0건** |

**경로 무관 확인**

| 대상 | 실측 | 이동 영향 |
|---|---|---|
| `ecosystem.config.js` fin `:7,:21,:46` | `cwd: __dirname` | 없음 |
| `ecosystem.config.js` fit `:7,:23,:73` | `cwd: '/home/nasty68/myFitness'` — **서버 경로** | 없음 |
| `tsconfig.json` paths | 양쪽 `"@/*": ["./src/*"]` 상대 | 없음 |
| `next.config.mjs` / `prisma.config.ts` / `vitest.config.mts` | 절대경로 0 | 없음 |
| 런타임 경로 | 전부 `process.cwd()`/`__dirname` (fin 8곳, fit 9곳) | 없음 |
| `.mcp.json` | **양쪽 다 없음** (MCP 설정은 `src/lib/ai/` 안) | 해당 없음 |
| 로컬 cron | `crontab -l` → `no crontab for sagan` (exit 1) | 없음 |
| launchd | `~/Library/LaunchAgents` 에 workspace 참조 0 | 없음 |
| node-cron | 전부 앱 내부 (`src/lib/cron.ts` 등) | 없음 |

유일한 env 탈출구: `myFinance/src/lib/ai/claude-advisor.ts:753`
`process.env.MYFINANCE_ROOT ?? process.cwd()` — `.env` 에 `MYFINANCE_ROOT` 미설정.

**pleiades 쪽 갱신 대상**: `grep -rn "workspace/myF" ~/workspace/pleiades --exclude-dir=.git | wc -l` → **46**
(+ auto memory 3). 그중 실제 갱신 필요는 **12** (`.claude/` 5 · `CLAUDE.md` 3 · `README.md` 1 · memory 3).
나머지 34 는 `measured-facts.md` 의 측정 명령 16 + `_workspace/` 과거 초안 20 → **손대지 않는다.**

## M4. 서버 배포는 로컬 경로에 묶여 있지 않다 — **확정**

```bash
grep -rn "rsync\|scp \|ssh \|sshpass" ~/workspace/$d --exclude-dir=node_modules \
  --exclude-dir=.next --exclude-dir=.git --exclude-dir=dist --exclude-dir=coverage | grep -v '\.md:'
```

| | myFinance | myFitness |
|---|---|---|
| `rsync` / `scp` hit | **0 / 0** | **0 / 0** |
| `ssh` hit | 1 — `.github/workflows/deploy.yml:4` **주석** (자동화 이전 수동 절차 설명) | 1 — 동상 |

실제 배포 경로 (양쪽 동일):
`GitHub Release publish` → `.github/workflows/deploy.yml` (ubuntu runner) →
`appleboy/ssh-action@v1.2.2` (host/user/key/port/fingerprint = GitHub Secrets) →
서버에서 `cd "$DEPLOY_PATH"` → `git fetch origin --tags --force` → `git checkout -f "$RELEASE_TAG"` →
`./deploy/deploy.sh` → `npm ci` → `prisma migrate deploy` → build → `pm2`.

서버 경로: fin `secrets.DEPLOY_PATH`, fit `deploy/deploy.sh:10` `cd /home/nasty68/myFitness`.
**둘 다 서버 파일시스템 기준.** 로컬에서 배포에 도달하는 접점은 `git push` + Release 생성뿐이고
그건 cwd 가 저장소 안이기만 하면 되므로 절대 경로 무관.

→ **변형 A 는 실서비스 배포를 깨지 않는다.** 변형 A 안전성의 핵심 근거.

## M5. 중첩 git 저장소 — `.gitignore` 한 줄로 충분

pleiades 현재 `.gitignore`: `.DS_Store` / `node_modules/` / `*.log` / `_workspace_prev/`.
**`repos/` 항목 없음 → 현재는 무방비.**

스크래치패드 실증 (outer/inner 두 git init 후):

| 상황 | 결과 |
|---|---|
| ignore 없이 `git status` | `?? repos/` |
| ignore 없이 `git add .` | `warning: adding embedded git repository` → 인덱스에 **`160000 <sha> 0 repos/inner`** (gitlink). pleiades clone 시 **빈 디렉터리** |
| `.gitignore` 에 `repos/` 후 `git add .` | repos/ **미포함** |
| ignore 상태에서 명시 `git add repos/inner` | `paths are ignored … Use -f` → **차단** |
| outer 에서 `git grep` | inner 파일 **미검색** |

→ **submodule 불필요.** submodule 은 SHA 핀 고정·`--recurse-submodules` 요구를 만들어
  "독립 저장소 유지"라는 변형 A 전제를 깬다.
  방치 시 실패 모드는 gitlink 커밋 1개, 되돌리기는 `git rm --cached repos/<name>`.

## M6. workspaces 흔적 — **양쪽 0**

```bash
node -e "console.log(JSON.stringify(require('.../package.json').workspaces ?? null))"
node -e "console.log(require('.../package-lock.json').lockfileVersion)"
ls ~/workspace/$d | grep -iE 'lock|\.yarn|pnpm|npmrc'
```

| | myFinance | myFitness |
|---|---|---|
| `workspaces` 필드 | **null** | **null** |
| 매니저 / lockfile / version | npm / `package-lock.json` 393,371 B / **3** | npm / `package-lock.json` 352,306 B / **3** |
| pnpm·yarn·`.npmrc`·`.yarn/` | 없음 | 없음 |
| `package.json` name / version | `myfinance` / `0.1.0` | `myfitness` / `0.1.0` |
| `overrides` 항목 수 | 3 | **13** |

→ 변형 A 에 workspaces 는 불필요. 흔적 0 이므로 `repos/` 하위에 두어도 npm 이 상위를 올려다보지 않는다.
  (`overrides` 13 vs 3 은 변형 B 병합 충돌 지점 — 이번 범위 밖.)

## 부수 발견 — Claude Code 프로젝트 상태가 경로로 키잉된다

```bash
ls -1 ~/.claude/projects/ | grep -i "myF\|pleiades"
du -sh ~/.claude/projects/<key>; ls <key>/*.jsonl | wc -l; ls <key>/memory/*.md | wc -l
# 키 9개 전수: 세션 jsonl 의 cwd 필드 vs 키 문자열 대조 → MISMATCH 0건
```

| 키 | 총 크기 | 세션 `.jsonl` | memory 토픽 |
|---|---|---|---|
| `-Users-sagan-workspace-myFinance` | **113 MB** | 7 | **38** |
| `-Users-sagan-workspace-myFitness` | **141 MB** | 6 | **18** |
| `-Users-sagan-workspace-pleiades` | 6.4 MB | 2 | 4 |

키 전수 검사에서 키 ≠ cwd 경로 파생 사례 **0건** (`/`→`-` 치환만, `_` 는 보존).

→ `~/workspace/pleiades/repos/myFinance` 로 옮기면 키가
`-Users-sagan-workspace-pleiades-repos-myFinance` 로 바뀐다.
**memory 토픽 56개 + 세션 히스토리 13개 (254 MB) 가 고아가 된다.**
`claude-code-mechanisms.md:33` 은 "`<project>` 는 git 저장소 기준 파생"이라 적었으나,
어느 규칙이든 결과는 **경로 문자열**이고 그 경로가 바뀐다.
회피안 (a) `~/.claude/projects/` 디렉터리를 새 키로 `mv`, (b) `autoMemoryDirectory` 절대 경로 고정
— **둘 다 실증 미측정.**

## 못 잰 값

| 항목 | 이유 |
|---|---|
| `.env` 값 (chat id·DB URL·토큰·Garmin 자격) | 시크릿. 이름·크기만 측정 |
| `~/.claude/projects/` 키를 `mv` 하면 세션·메모리가 살아나는지 | 실행 검증 필요, 읽기 전용 범위 밖 |
| `autoMemoryDirectory` 가 이동 후에도 memory 를 잇는지 | 위와 동일 |
| pleiades 를 cwd 로 열었을 때 `repos/*/.claude/skills` 자동 탐색 여부 | 런타임 동작. 정적 측정 불가. `claude-code-mechanisms.md:125` 는 "패키지별 `.claude/skills/` 지원"이라 하나 이 배치에서 미실증 |
| GitHub Secrets `DEPLOY_PATH` 실제 값 (myFinance) | 저장소에 없음 |
| 서버 파일시스템 상태 | 읽기 전용 규율상 서버 미접속 |

---

# 추가 측정 — 2026-09-04 (배치 집행: `git worktree` · 감사 반증)

위 "저장소 배치 변형 A" 절의 후속. 감사(`_workspace/03_auditor_layout.md`)와 집행 과정에서
나온 값이다. **위 절의 기존 줄은 고치지 않았다.** 정정은 아래 블록으로 남긴다.
결정 문서는 `docs/specs/004-repo-layout.md`.

## ⚠ 방법론 — 절대경로 측정은 `--binary-files=text` 를 붙인다

```bash
grep -rn --binary-files=text -- "/Users/sagan/workspace" <path>
```

> **정정 (2026-09-04 감사).** 위 **M3** 절의 측정 명령은 `grep -rn` 만 썼다.
> `grep -r` 은 `.next/cache` 의 팩 파일들을 **binary 로 판정해 건너뛴다.**
> 그 결과 `01_surveyor_layout.md` M3 과 감사 1차 스캔이 **둘 다 `.next/cache` 를 0건으로
> 오탐**했다 (독립적으로 2회).
>
> **경고 — 이 문서의 다른 grep 기반 "0건" 결론들이 같은 결함을 가질 수 있다.**
> 특히 M3 의 *"myFitness 소스·설정 전체 0건"*, M4 의 *"`rsync`/`scp` hit 0/0"*.
> 재검증 전까지 그 0 들은 **"텍스트 파일 범위에서 0건"** 으로 읽는다.
> 재검증은 004 §6 **Q22**.

## `.next/cache` 는 절대경로로 키잉된다 — **M3 정정**

```bash
grep -rl --binary-files=text -- "/Users/sagan/workspace" ~/workspace/$d/.next/cache | wc -l
grep -o --binary-files=text -- "/Users/sagan/workspace[^\"]*" .next/cache/**/index.pack | sort -u | wc -l
```

| | myFinance | myFitness | 합 |
|---|---|---|---|
| 절대경로를 담은 `.next/cache` 파일 | **160** | **9** | 169 |
| 단일 `index.pack` 안 **distinct** 절대경로 | **1,144** | — | — |
| 관련 캐시 용량 | — | — | **1.35 GB** |

> **정정 (2026-09-04 감사).** 위 M3 절은 절대경로 의존을 **"6곳, 전부 권한 파일"** 로 적었다.
> 소스·설정 범위에서는 맞다. **`.next/cache` 는 그 범위 밖이었다.**
> 디렉터리를 `mv` 하면 앱은 안 깨지지만 **첫 빌드 1회가 콜드**가 되고, 되돌릴 때 **한 번 더**다.
> `git worktree` 채택으로 이 비용은 **발생하지 않았다** — 원본 `.next`(fin 1.1 GB · fit 286 MB)가
> 제자리에서 warm 유지된다.

## 이동해도 재설치·재생성은 **불필요** (실증)

| 검사 | 실측 | 판정 |
|---|---|---|
| `node_modules` 심링크 중 절대경로 | fin **0 / 45**, fit **0 / 39** | 전부 상대 |
| lockfile 안 절대경로 | **0건** | 무관 |
| `.git/hooks` 절대경로 | **0건** | 무관 |
| Prisma 쿼리 엔진 바이너리 경로 임베드 | **0건** | 무관 |
| `.prisma/client/index.js:525,539` 의 절대경로 | 존재하나 **inert metadata** | 런타임은 `__dirname` 기준 |

`.prisma/client` 는 **APFS 복제본을 새 경로에서 실제 기동**해 확인했다 —
**DB 연결 단계에서만** 실패(경로 해석 단계는 통과).
→ `npm ci` / `prisma generate` / 재빌드는 경로 이동 때문에 필요한 것이 아니다.

## `~/.claude` 경로 키잉 저장소는 **3개** — 부수 발견 정정

| # | 저장소 | 담긴 것 | 디렉터리 rename 으로 해결되나 |
|---|---|---|---|
| ① | `~/.claude/projects/<slug>/` | 세션 `.jsonl` · `memory/` | **예** — rename 후 memory 주입 · `--resume` 회수 · 신규 세션 기록 **실증** |
| ② | `~/.claude.json` 의 `projects["<절대경로>"]` | 신뢰 대화상자 · `codex-cli` MCP 등록 · `lastSessionId` | **아니오** (키가 절대경로) |
| ③ | `~/.claude/history.jsonl` | 프롬프트 **2,046건** | **아니오** |

**슬러그 규칙 정정**

| | 이 문서의 기존 기록 | 실측 (CLI **v2.1.260**) |
|---|---|---|
| 치환 | `/` → `-`, **`_` 보존** | **`/` · `_` · `.` → `-`** |
| 안정성 | 규칙 | **CLI 버전 의존** |

> **정정 (2026-09-04 감사).** 위 "부수 발견" 절은 `-Users-sagan-workspace-knou_python` 을 근거로
> **"`_` 는 보존"** 이라 적었다. 그 키는 **과거 CLI 버전이 만든 것**이고, 현재 버전은 `_`·`.` 도
> 치환한다. 즉 **슬러그를 손으로 계산해 rename 하는 절차는 CLI 업그레이드에 깨진다.**
> 또한 회피안 (a) 는 **①만 덮는다** — ②③ 은 그 절에 등장하지 않았다.
> `autoMemoryDirectory`(회피안 b)는 실재하나 **세션 키는 못 옮길 가능성이 높아 (a)의 대안이
> 아니다** — **미확인**으로 남긴다.
>
> **`git worktree` 채택으로 ①②③ 비용이 전부 0 이다** — 원본 경로가 유지되므로 키가 바뀌지 않는다.
> memory 토픽 56개 · 세션 13개 · **254 MB 는 제자리에 온전하다.**

## `.gitignore` 한 줄의 한계 — **M5 정정**

| 검사 | 실측 | 판정 |
|---|---|---|
| ignore 상태에서 `git add repos/inner` | 차단 | M5 대로 |
| ignore 상태에서 **`git add -f repos/inner`** | **뚫린다 — gitlink 생성** | **M5 반증** |
| `git clean -fdx` | 중첩 저장소 **보호** | 안전 |
| **`git clean -ffdx`** | **`repos/` 통째로 삭제** | **M5 미기재 위험** |

> **정정 (2026-09-04 감사).** M5 는 `.gitignore` 한 줄을 **"충분하다"** 고 적었다.
> 정확히는 **기본값을 바꾸는 장치이지 사고를 막는 장치가 아니다.** `-f` 를 두 번 치면 뚫린다.
> **worktree 채택으로 판돈은 줄었다** — `repos/` 가 삭제돼도 원본 체크아웃이 남으므로
> 편도가 아니다(`git worktree add` 재실행 + gitignored 사본 재복사로 복구).
> **작업 규율: pleiades 루트에서 `git clean -ffdx` 금지.**

## Grep 도구는 차단되지 않는다 — 루트 traversal 제외

| 검색 | 결과 |
|---|---|
| 루트 검색 (경로 미지정) | ❌ 미검색 |
| `path: repos/inner` | ✅ `FOUND:repos/inner/src.txt` |
| `path: repos/` | ✅ 검색됨 |

실제 Grep 도구로 확인. → **규칙 한 줄**: *"`repos/` 하위 검색 시 `path` 를 명시한다."*

## **중첩 `.claude/` 는 로드되지 않는다** (신규 · 결정적)

| 배치 | `.claude/skills` | `.claude/agents` |
|---|---|---|
| 하위 디렉터리(`repos/*/.claude/`) — **gitignore 유무와 무관** | **미발견** | **미발견** |
| **`--add-dir` 로 붙인 경우** | **발견** | **발견** |

> **정정 (2026-09-04 실측).** 위 "못 잰 값" 표의 *"pleiades 를 cwd 로 열었을 때
> `repos/*/.claude/skills` 자동 탐색 여부 — 정적 측정 불가"* 는 **측정됐다. 탐색되지 않는다.**
> `docs/research/claude-code-mechanisms.md:125` 의 *"패키지별 `.claude/skills/` 지원"* 은
> **이 배치에 적용되지 않는다.**
> → 귀결: **하네스 통합(002 단계 2)은 이 배치의 선결 조건**이다 (004 §6 Q20).

## `cp -Rc` (APFS clonefile)

```bash
time cp -Rc <src> <dst>
```

| 항목 | 실측 |
|---|---|
| 1.9 GB 복제 소요 | **8.25초** |
| 실제 디스크 소비 | **~0** (COW) |
| 따라온 것 | `.env` · `.git` · `.claude` · `node_modules` · `.next` · 로컬 브랜치 6개 **전부** |

→ M2 의 **"clone = +3.06 GB · 수동 복사 6종"** 은 `git clone` 을 전제한 값이다.
  `cp -Rc` 는 그 둘을 동시에 없앤다. **그럼에도 clone 계열은 채택되지 않았다** —
  남는 문제가 용량이 아니라 **저장소 2벌의 분기 가능성**이기 때문 (004 §2-2).

## `git worktree` — 채택안 실측

```bash
git -C ~/workspace/$d worktree add ~/workspace/pleiades/repos/$d integration/pleiades
git -C ~/workspace/$d worktree list
```

**worktree 에 안 따라오는 gitignored 필수 파일**

| | myFinance | myFitness |
|---|---|---|
| tracked 파일 (따라옴) | **733** | **396** |
| 수동 복사 필요 | `.env` (4K) | `.env` (4K) · `.garmin-tokens/` (8K) · `.claude/` (104K) · `CLAUDE.md` (12K) |

**집행 후 상태 (2026-09-04)**

```bash
git -C ~/workspace/myFinance worktree list
# /Users/sagan/workspace/myFinance                 c549fa6 [dev]
# /Users/sagan/workspace/pleiades/repos/myFinance  c549fa6 [integration/pleiades]
git -C ~/workspace/myFitness worktree list
# /Users/sagan/workspace/myFitness                 5809c48 [main]
# /Users/sagan/workspace/pleiades/repos/myFitness  ac034be [integration/pleiades]
```

| 항목 | 값 |
|---|---|
| 원본 체크아웃 브랜치 | fin **`dev`** / fit **`main`** (04 집행 전 상태로 복귀) |
| worktree clean | **0** (양쪽) |
| 복사한 gitignored 파일 | fin `.env` / fit `.env`·`.garmin-tokens/`·`CLAUDE.md`. **fit `.claude/` 는 의도적 제외** (하네스 통합 대상) |
| fin `.claude/` | **tracked 16파일이라 자동으로 따라옴.** 제거는 `git rm` 커밋 = 소스 변경이므로 단계 2 로 미룸 (004 Q21) |
| `node_modules` | `cp -Rc` COW 복사. 양쪽 `@prisma/client` 로드 확인 |
| **실제 디스크 소비** | **90 MB** |
| `du -sh repos/` (참고) | **1.7 GB** — `du` 는 COW 공유 블록을 각 사본에 중복 계상하므로 **실소비가 아니다** (`myFinance` 852 MB / `myFitness` 839 MB) |
| pleiades `.gitignore` | `repos/` 1줄 추가 |

## 로컬에는 실행 중인 서비스가 없다

| 검사 | 실측 |
|---|---|
| 로컬 `pm2` | **미설치** |
| 4100 / 4200 리슨 | **없음** |
| 배포 경로 | `appleboy/ssh-action@v1.2.2` → **서버**에서 `git fetch`/`checkout` (fin `deploy.yml:54,78,96,97,127` / fit `deploy.yml:54,78,86,87,89`) |

→ **M4 재확인** — 깨질 로컬 배포 절차가 존재하지 않는다.

> **미결 제기 (2026-09-04, 판정 아님).** `CLAUDE.md` 핵심 전제 3 —
> *"두 MCP 서버가 이미 **로컬** HTTP 로 상주 중"* — 은 위 측정과 어긋난다
> (로컬 pm2 없음 · 리슨 없음). 문장이 기술한 대상은 **서버**로 보인다.
> 전제 3 은 **002 단계 0** 의 근거이므로 착수 전 확인이 필요하다 → 004 §6 **Q23**.

## 못 잰 값 (이 절 범위)

| 항목 | 이유 |
|---|---|
| `git worktree remove` 가 `--force` 없이 성공하는지 | 복사한 gitignored 파일·`node_modules` 가 남아 있음. **미검증** (004 §4-3) |
| `autoMemoryDirectory` 가 세션 키까지 옮기는지 | **미확인.** worktree 채택으로 지금은 아무것도 막지 않음. 002 단계 4 에서 재활성 |
| 이 문서의 기존 grep 기반 "0건" 결론 재검증 | **미수행** — `--binary-files=text` 로 재실행 필요 (004 Q22) |

---

# 추가 측정 — 2026-09-04 (myFinance 22곳 루프 본문 전수 · 1a-4 청구서)

출처 `_workspace/05_surveyor_fin_loops.md` (GitHub 이슈 #4). 003 §9 *"1a 착수 직전 측정 1건"* 의 이행.
감사(`03_auditor_notify.md`)가 대표 4곳만 부분 수행한 것을 **전수**로 마감했다.

## 측정 시점 저장소 상태

| | 값 |
|---|---|
| 측정 대상 | `~/workspace/pleiades/repos/myFinance` (git worktree, 004 배치) |
| 브랜치 / HEAD / dirty | `integration/pleiades` / `c549fa6` / **0** |
| `src` 파일 | 424 |
| (대조) myFitness | `integration/pleiades` / `ac034be` / dirty 0 |

`~/workspace/myFinance`(서비스 유지용 원본, `dev`)는 **열지 않았다.** 전 명령 읽기 전용.
모든 `grep` 에 `--binary-files=text` (004 표준).

## M0. 모집단 — 루프는 22곳이 맞다. 다른 순회 형태는 0건

```bash
grep -rn --binary-files=text "for (const chatId of" src --include='*.ts' | wc -l                              # 22
grep -rn --binary-files=text -E "chatIds?\s*\.(forEach|map|filter|reduce|some|every)" src --include='*.ts'     # 0
grep -rn --binary-files=text -E "Promise\.(all|allSettled)\(.*[Cc]hat" src --include='*.ts'                    # 0
grep -rn --binary-files=text -E "for \(let [a-z]+ = 0.*chatIds" src --include='*.ts'                           # 0
grep -rn --binary-files=text -E "for \((const|let) [A-Za-z_]+ of .*[Cc]hat" src --include='*.ts' | wc -l       # 22 (교차 확인)
grep -rn --binary-files=text "sendHtml(" src --include='*.ts' | grep -v 'src/bot/utils/telegram.ts' | wc -l    # 20
```

**22곳 / 15 파일. 전부 `await` 순차 for-of — 병렬 fan-out 0건.** 테스트에는 0건.
`22 − 20 sendHtml = 2` 가 `quarterly-report.ts:52`(`sendDocument`)와 `rsu.ts:182`(raw `sendMessage`)로 1:1 대응.

## M1. 전수 분류 — **(c) 부수효과 0 · (d) 수신자별 분기 0**

| 분류 | 뜻 | 건수 |
|---|---|---|
| (a) 순수 전송 | 본문이 전송 호출 하나뿐 | **16 / 22** |
| (b) 전송 + 결과 수집 | 반환값·성공 카운터를 모은다 | **5 / 22** |
| **(c) 전송 + 부수효과** | DB 쓰기·상태 변경이 루프 안에 | **0 / 22** |
| **(d) 전송 + 분기** | 수신자별로 내용이 달라진다 | **0 / 22** |
| (e) 포트 밖 | `quarterly-report.ts:52` | **1 / 22** |

(b) 5곳: `advisor-monitor.ts:220`(`anySuccess`) · `alert-dispatcher.ts:122`(`successCount`) ·
`ta-signal-alert.ts:332`(`sendSuccess`) · `price-alert.ts:338`(`sendSuccess`) ·
`custom-strategy-alert.ts:290`(`sentCount`).

**(d) = 0 의 근거 (실제로 확인함):**
```bash
grep -rn --binary-files=text "chatId" src/bot/notifications/*.ts src/lib/ai/advisor-monitor.ts \
  | grep -vE "chatIds|for \(const chatId of|function |: number" \
  | grep -vE "sendHtml\(bot, chatId|sendMessage\(chatId|sendDocument\(chatId"
```
→ **19줄, 전부 `console.error` 템플릿 문자열.** 루프 본문의 `chatId` 용도는 (1) 전송 대상 인자,
(2) 실패 로그 문자열 — 그 외 **0건**. 메시지 본문은 **22곳 전부 루프 진입 전에 확정**된다.

## M1-B. 카운터가 게이트하는 부수효과 — **7 지점 / 5 모듈** (전부 루프 **밖**)

| 소비 지점 | 카운터 | 하는 일 | 등급 |
|---|---|---|---|
| `ta-signal-alert.ts:344-354` | `sendSuccess > 0` | `sentToday` dedupe Map + `lastAiAskByTicker` AI 쿨다운 Map | 메모리 상태 |
| `ta-signal-alert.ts:375-376` | `sendSuccess`, `chatIds.length` | `computeDeliveryStatus` → `recordAlertHistory` | **DB** |
| `price-alert.ts:349-350` | 〃 | 동일 | **DB** |
| `custom-strategy-alert.ts:301-302` | `sentCount`, `chatIds.length` | 동일 | **DB** |
| `custom-strategy-alert.ts:304-320` | `sentCount === 0` → `return` | `prisma.customStrategy.updateMany` **2건 스킵** | **DB (게이트)** |
| `alert-dispatcher.ts:131-132` | `successCount`, `chatIds.length`, `lastError` | `persistRetryHistory` + **API 응답 body**(`retry/route.ts:76-86`) | **DB + API 계약** |
| `advisor-monitor.ts:228` | `anySuccess` | 모니터 상태 진행(`:135` `delivered`) | 상태 변경 |

`BroadcastResult` 대조: `sent`/`total`/`sent>0` 으로 충족. **`lastError` 만 `deliveries[]` 파생**이라
호출부 **4곳**(`alert-dispatcher`·`ta-signal-alert`·`price-alert`·`custom-strategy-alert`)에 한 줄씩 붙는다.

## M1-C. 짝 루프 4쌍 — 22 중 8 (36%)

| 모듈 | 본문 루프 | 폴백 루프 | 바깥 catch |
|---|---|---|---|
| `briefing.ts` | :69 | :91 | :79 |
| `active-review.ts` | :123 | :140 | :132 |
| `monthly-report.ts` | :53 | :67 | :62 |
| `quarterly-report.ts` | :37 | :66 | :63 |

폴백 루프는 **AI 생성 실패용 바깥 catch 안**에 있다. 그 바깥 try/catch 4개는 전송 실패용이 아니므로
**파사드가 흡수하지 않고 남는다.**

## M2-3. `chatIds.length` 21 hits = **가드 10 + 분모 11**

```bash
grep -rn --binary-files=text -E "chatIds\.length" src --include='*.ts'      # 21 hits
```

**가드 10곳** — `scheduler.ts:41`(cron 등록 전체 스킵) · `lib/cron.ts:96` ·
`retry/route.ts:64`(**HTTP 500 분기**) · `advisor-monitor.ts:205` · `budget-alert.ts:29`·`:96` ·
`custom-strategy-alert.ts:116` · `networth-snapshot.ts:85`(**DB 스냅샷 저장 `:80` 은 가드 밖**) ·
`ta-signal-alert.ts:173` · `price-alert.ts:80`.

**분모 11곳** — `computeDeliveryStatus(success,total)` 4 ·
`recordAlertHistory(…, chatIds.length, …)` **3 → DB 컬럼 `AlertHistory.recipientCount`** ·
`alert-dispatcher.ts:132` `totalChats` **→ API 응답 body 1** · `console.log` 3.

## M2-5 / M4. `chatIds` 전파 — **18 시그니처 · 19 호출부**

```bash
grep -rn --binary-files=text -E "chatIds\s*:\s*number\[\]" src --include='*.ts' | wc -l    # 18
grep -rn --binary-files=text "getAllowedChatIds" src --include='*.ts'                      # 정의 4 + 호출 5
```

| 대상 | 건수 |
|---|---|
| `chatIds: number[]` 파라미터 시그니처 | **18** (진입점 16 + 내부 위임 2: `doCheckTASignals`·`runScan`) |
| 실인자 호출 (테스트 제외) | **19** |
| `getAllowedChatIds()` 호출 지점 | 5 (`budget-alert.ts` 가 2회) |

`scheduler.ts:40` 이 만든 값 하나를 **13개 cron 콜백이 클로저로 캡처**
(`:81,95,108,121,135,148,161,186,200,213,226,243,256`).

**완전 제거 가능한 `getAllowedChatIds` 는 `budget-alert.ts:14` 1곳뿐** (파일 안에서 생성·소비가 닫힘).
`scheduler.ts:21` 은 `:108 sendQuarterlyReport(chatIds)` 가 **목록 자체**를 요구해 **실질적으로 못 지운다.**
`lib/cron.ts:13`·`retry/route.ts:29` 는 수신 측 시그니처를 함께 바꿔야 하고, 후자는 **API 응답 계약**(`totalChats`)이 걸려 있다.

## M3. per-chat `catch` 22곳 — **재던지기 0 · 사용자 통지 0 (전부 삼킨다)**

| 유형 | 건수 | 위치 |
|---|---|---|
| A `console.error(raw error)` | **12** | `budget-alert:84`·`:125`, `quarterly:108`, `networth-snapshot:96`, `monthly:68`, `daily:135`, `quarterly-report:57`, `alert-dispatcher:126`, `ta-signal-alert:336`, `price-alert:342`, `custom-strategy-alert:294`, `advisor-monitor:224` |
| B `console.error(sanitizeError(error))` | **5** | `rsu:114`·`:188`, `briefing:72`, `active-review:126`, `monthly-report:56` |
| C `lastError = error.message` + A | **4** | `alert-dispatcher:126`, `ta-signal-alert:336`, `price-alert:342`, `custom-strategy-alert:294` (A 의 부분집합) |
| D 빈 `catch {}` (`// 무시`) | **5** | `briefing:94`, `active-review:143`, `monthly-report:70`, `quarterly-report:42`·`:71` |

흡수 판정: **무손실 17 / 파생 코드 필요 4 / 범위 밖 1**(`quarterly-report:57`).

**흡수 시 반드시 바뀌는 것 3가지**

1. **로그 문자열 17종** — `[notification]`(세부 9종) · `[alert-retry]` · `[active-review]` ·
   `[briefing]` · `[custom-strategy]` · `[networth]` · `[report]` · `[ta-signal]` · `[advisor-monitor]`.
   한 형식으로 통일하면 **운영 로그 grep 패턴이 깨진다.**
2. **`sanitizeError` 적용 불일치** — 12 raw / 5 sanitized.
3. **`lastError` 가 raw `error.message` 로 DB → UI → CSV 에 노출된다.**

| 경로 | 위치 |
|---|---|
| 쓰기 | `alert-history.ts:76` → `prisma/schema.prisma:344 errorMessage String?` |
| 읽기 → API | `app/api/alerts/history/route.ts:77` |
| 읽기 → **화면** | `AlertHistoryClient.tsx:449` · `AlertHistoryDetailModal.tsx:103` |
| 읽기 → **CSV** | `app/api/alerts/history/export/csv-format.ts:19,146` |

→ **현재 상태가 `CLAUDE.md` 컨벤션 위반**(*"catch 에서 `error.message` 원문 노출 금지"*)이다.
1a-4 가 만드는 문제가 아니라 **1a-4 가 손대는 그 4줄에 이미 있는 문제**다.

> **방법론 주의 (이번 측정에서 실제 발생).** 대상 경로를 셸 변수에 담아 `"$F"` 로 인용하면
> glob 이 전개되지 않아 `ugrep` 이 **경고와 함께 0건**을 낸다. 004 의 `--binary-files=text` 와
> 같은 성격의 함정이다 — **빈 결과를 0 으로 단정하지 않고** 경로를 직접 나열해 재실행했다.

## M5. 테스트 파급 — 결합은 얕다

| 항목 | 값 |
|---|---|
| `chatIds`/`sendHtml` 참조 테스트 파일 | **1 / 42** (`bot/notifications/__tests__/alert-dispatcher.test.ts`) |
| 그 파일의 `it()` 블록 | 25 |
| 그중 `sendHtml` 직접 assert (`toHaveBeenNthCalledWith(1, fakeBot, 1, '…')` — **인자 순서 고정**) | **9 / 25** |
| `TELEGRAM_ALLOWED_CHAT_IDS` 를 세팅하는 테스트 | `retry/__tests__/route.test.ts` `it()` 6개 — `redispatchAlert` 를 mock 하므로 **무관** |

## 정정 — 003 §5-1 의 세 서술

> **정정 (2026-09-04 전수 측정).** 003 §5-1 의 myFinance 변경 칸은 세 군데가 과소·불성립이다.
> ① *"`scheduler.ts:41`·`lib/cron.ts:96` 의 가드 2곳"* → **가드 10곳 + 분모 11곳 = 21지점.**
> ② *"`getAllowedChatIds` 4곳 제거"* → **완전 제거 가능은 1곳**(`budget-alert.ts`).
> ③ *"루프 21곳 제거"* 는 개수는 맞으나 **순수 삭제가 아니다** — `lastError` 파생 4곳 추가 +
> `chatIds: number[]` 18 시그니처 / 19 호출부 개편이 따라온다.
> 개정 청구서는 003 §5-1 정정 표(합계 약 94 지점 · 최소 60 지점).

> **정정 (2026-09-04 전수 측정).** 003 §5-2 의 *"Q10 이 '아니오'면 1a 는 관측 가능한 동작 변경이 0"*
> 은 **fin 쪽에서 불성립한다.** `rsu.ts:184` 는 raw `bot.api.sendMessage` 라 **재시도도 HTML 폴백도
> 없다.** 파사드 흡수 시 `[2000,8000,30000]`ms ×4 재시도 + plain 폴백이 **새로 붙는다.**
> 003 은 fit `sendToAllWithKeyboard` 의 동일 개선만 적었다.

## 못 잰 값 (이 절 범위)

| 항목 | 왜 못 쟀나 |
|---|---|
| 실제 수신자 chat id 개수 | `.env` 값 열람 금지 |
| `AlertHistory.errorMessage` 의 현재 문자열 분포 | 실서비스 DB 조회 필요 (→ 003 Q14). **`sanitizeError` 적용 시 UI 표시가 얼마나 바뀌는지**는 이 값 없이 모른다 |
| 파사드 전환 후 로그 volume 변화 | 런타임 데이터 |
| `npm run lint`/`tsc --noEmit` 이 18 시그니처 변경을 어떻게 걸러내는가 | 읽기 전용 규율상 미실행 |

---

# 추가 측정 — 2026-09-04 (myFitness vitest resolve · U1 원인 규명)

출처 `_workspace/05_operator_u1_vitest.md` (GitHub 이슈 #2). 003 §9 U1 의 이행.
환경 node v20.18.0 / npm 10.8.2 / darwin 25.6.0. **대상 저장소 파일 변경 0** (md5·`git status` 검증).

## 실행한 명령과 결과

```bash
cd ~/workspace/pleiades/repos/myFitness
npm install --dry-run --package-lock-only \
  'vitest@^4.1.8' '@vitest/coverage-v8@^4.1.8' 'vite-tsconfig-paths@^6.1.1'
# → npm error Unable to resolve reference $postcss   (EXIT=1)

npm install --dry-run --package-lock-only          # 인자 없이 (대조군)
# → up to date / 210 packages / EXIT=0
```

**`ERESOLVE` 가 아니다.** peer dependency 충돌이 아니라 **npm overrides 참조 해석 실패**다.
현재 트리는 정상이고, 실패는 **패키지를 추가할 때만** 발생한다.

## 원인 분리 (scratchpad 사본 — 대상 저장소 무관)

| 사본 | overrides | 추가 패키지 | 결과 |
|---|---|---|---|
| A | 원본 (`$postcss`, `$esbuild`) | 3종 / `vitest` 만 / `coverage-v8` 만 | **실패** (동일 메시지) |
| A | 원본 | `vite-tsconfig-paths` 만 | 성공 (212 packages) |
| A | 원본 | `is-odd` (무관 패키지) | 성공 (210 packages) |
| **D** | **`$postcss` 만 리터럴** (`$esbuild` 유지) | 3종 | **성공** (223) |
| E | `$esbuild` 만 리터럴 (`$postcss` 유지) | 3종 | **실패** |
| B | 둘 다 리터럴 | 3종 | **성공** (223) |

**유일한 blocker 는 `"postcss": "$postcss"` 한 줄이다. `$esbuild` 는 무관하다.**

npm 디버그 스택:
```
Error: Unable to resolve reference $postcss
    at get spec        (@npmcli/arborist/lib/edge.js:202:15)
    at #nodeFromEdge   (build-ideal-tree.js:1036:46)
    at #loadPeerSet    (build-ideal-tree.js:1294:35)   ← peer set 확장 경로
silly unfinished npm timer idealTree:node_modules/vitest
```
**peer set 확장 경로에서 npm 이 `$name` 참조를 해석하지 못한다.**
`vitest → vite → postcss` 로 postcss 가 트리에 들어올 때만 드러난다.
→ **원래부터 깨져 있었고 vitest 가 조건을 처음 만족시켰을 뿐이다.**

## resolve 되는 실제 버전 (사본 B lock 판독)

| 패키지 | 현재 fit | 추가 후 |
|---|---|---|
| `vitest` / `@vitest/coverage-v8` | 없음 | **4.1.11** / **4.1.11** |
| `vite-tsconfig-paths` | 없음 | **6.1.1** |
| `vite` | 없음 | **6.4.3** — **fin 과 동일** |
| `postcss` | 8.5.25 | **8.5.25 (무변경)** — 중복 사본 없음 |
| `esbuild` | 0.28.1 | **0.28.1 (무변경)** |
| lock 엔트리 | 716 | **785** (+69) |

**`ERESOLVE` 0건 · peer dependency 충돌 0건.**

## 필요한 수정 (미승인 — 적용하지 않음)

```diff
   "overrides": {
-    "postcss": "$postcss",
+    "postcss": "^8.5.10",
```
**의미 동일** — npm 의 `$postcss` 는 "루트 `package.json` 의 postcss spec 을 쓰라"는 뜻이고
fit `devDependencies.postcss` 가 정확히 `^8.5.10`. 사본 D 에서 lock 결과 동일함을 실증(양쪽 8.5.25).
되돌리기 **즉시**(1줄) · 서비스 영향 **없음** · 단 1a-2 승인 범위 밖 → 003 **Q16**.
`npm install --legacy-peer-deps` 는 이 오류를 피하지 못한다(override 해석 단계가 별개).

## lint / typecheck 비대칭 (정적 판독)

| 항목 | myFinance | myFitness |
|---|---|---|
| eslint 설정 | `.eslintrc.json` (eslintrc) | `eslint.config.mjs` (flat) |
| eslint / eslint-config-next / next | ^8 / ^15.5.16 / ^15.5.16 | ^9.39.4 / ^16.2.6 / ^16.2.6 |
| `lint` 스크립트 | `next lint` | **`eslint src/ --max-warnings 0`** |
| `--max-warnings 0` 게이트 | 없음 | **있음** |
| lint 대상 경로 | `next lint` 기본 | **`src/` 로 한정** |
| `ignores` 에 `__tests__`/`*.test.ts` | 없음 | **없음** (`src/generated/**` 뿐) |
| `typecheck` 스크립트 | **없음** (단 `next build` 가 타입 검사 — `ignoreBuildErrors` 없음) | `tsc --noEmit` |
| `tsconfig.include` | `["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"]` | 동일 + `.next/dev/types/**/*.ts` |
| `tsconfig.jsx` | `preserve` | `react-jsx` |
| 기존 테스트 파일 | 44개+ (`src/**/__tests__/`) | 0개 |

`repos/myFitness/eslint.config.mjs` 전문 (127 bytes):
```js
import nextConfig from "eslint-config-next";
export default [ ...nextConfig, { ignores: ["src/generated/**"] } ];
```

→ **테스트 파일 경로가 결정 사항이다.** fit `lint` 는 `src/` 밖을 아예 검사하지 않으므로,
fin 과 대칭(`src/**/__tests__/`)을 지키면 **zero-warning 게이트에 그대로 걸리고**,
루트에 두면 게이트를 피하는 대신 경로 컨벤션이 갈라진다 → 003 **Q17**.

> **정정 (2026-09-04).** 003 §9 의 *"myFitness 에만 `typecheck` 가 있고 `tsconfig.include` 가
> `**/*.ts` 다"* 중 **include 부분이 부정확**하다 — fin 도 동일하다. 비대칭의 원인은
> **`typecheck` 스크립트 유무**뿐이고, fin 도 `next build` 가 타입 검사를 한다.
> 즉 비대칭은 "검사되냐"가 아니라 **"어느 단계에서 걸리냐"** 다.

## 신규 리스크 — esbuild override 가 vite 를 선언 범위 밖으로 민다

`vite@6.4.3` 선언: `esbuild: "^0.25.0"`, `postcss: "^8.5.3"`

| | vite 가 쓰게 되는 esbuild | 방식 |
|---|---|---|
| **myFinance (현재 실동작)** | `vite/node_modules/esbuild@0.25.12` | 중첩 설치. 선언 범위 **안** |
| **myFitness (추가 시 예상)** | `esbuild@0.28.1` (top-level) | `"esbuild": "$esbuild"` override 가 **중첩을 막는다** |

npm overrides 는 범위 검사를 우회하므로 **resolve 는 통과하지만 런타임 동작은 미확인**이다.

## 못 잰 값 (이 절 범위)

| 항목 | 이유 |
|---|---|
| fit 에서 vitest 가 **런타임에 실제로 도는지** | 설치 후 `npx vitest run` 필요. 읽기 전용 범위 밖 → 003 §9 **U3** |
| fit 테스트 파일이 `eslint src/ --max-warnings 0` 을 **통과하는지** | 테스트 파일 미작성 → 003 §9 **U2 여전히 미확인** |
| `$postcss` 를 **유지한 채** 회피하는 방법 | 확인하지 못함. `--legacy-peer-deps` 는 아님 |

---

# 하네스 통합 실측 (2026-09-07)

Q20(하네스 통합 · 이슈 #1) 범위 산정용. 사용자가 정한 분할 원칙 **"공통은 pleiades 로,
저장소별 특수는 그 저장소에 유지"** 를 파일 단위로 옮기기 위한 측정.
상세 표는 `_workspace/harness/01_surveyor_harness_content.md`. **읽기 전용 — 대상 저장소 쓰기 0건.**

## 측정 대상과 ref

| 대상 | 경로 | ref/상태 |
|---|---|---|
| pleiades | `~/workspace/pleiades/.claude/` + `CLAUDE.md` | `dev` |
| myFinance | `~/workspace/pleiades/repos/myFinance/.claude/` + `CLAUDE.md` | worktree · `integration/pleiades` · clean |
| myFitness | **원본** `~/workspace/myFitness/.claude/` + `CLAUDE.md` | 원본 · `main` |

> **fit 만 원본을 쟀다.** fit `.claude/` 는 `.gitignore:35` 로 ignored 이고 004 배치 때
> **의도적으로 worktree 에 복사하지 않았다**(하네스 통합 대상). **잴 수 있는 체크아웃이 원본뿐이다.**
> fin 은 tracked 라 규율대로 worktree 를 쟀다.

## H1. 하네스 규모 (파일 · LOC · 바이트)

```bash
find <root>/.claude -type f | sort            # 파일 목록
wc -l <f> ; wc -c <f>                          # LOC · 바이트
git -C ~/workspace/pleiades/repos/myFinance ls-files .claude | wc -l   # → 16
```

| | agents | rules | skills | settings | **`.claude/` 계** | `CLAUDE.md` |
|---|---:|---:|---:|---:|---:|---:|
| **myFinance** 파일 | 4 | 5 | 7 | 0 | **16** | 1 |
| LOC | 322 | 524 | 783 | 0 | **1,629** | 163 |
| bytes | 17,126 | 20,344 | 31,352 | 0 | **68,822** | 9,549 |
| **myFitness** 파일 | 5 | 3 | 9 | **1** | **18** | 1 |
| LOC | 231 | 281 | 1,262 | 111 | **1,885** | 173 |
| bytes | 10,409 | 11,180 | 39,583 | 6,749 | **67,921** | 8,621 |
| **pleiades** 파일 | 4 | 1 | 7 | 0 | **12** | 1 |
| LOC | 520 | 486 | 1,012 | 0 | **2,018** | 147 |
| bytes | 32,382 | 29,635 | 51,304 | 0 | **113,321** | 12,587 |

**이관 대상 = fin 16 + fit 18 = 34파일 / 3,514 LOC / 136,743 B.**
pleiades 기존 12파일(2,018 LOC / 113,321 B)과 합치면 **46파일 / 5,532 LOC / 250,064 B** (중복 제거 전 상한).
검산: 종류별 합 = 저장소별 합 (9행 전부 일치, 상세 산출물 §1-4).

> **정정 (2026-09-07 재측정).** 위 M1 표의 *"myFitness `.claude/` 전체 — ignored, 18 files / 104 K"* 중
> **파일 수 18 은 맞고 크기는 `du` 값**이다. 실제 내용 합은 **67,921 B (66.3 KB)** —
> 차이는 `du` 의 블록 단위 계상(파일 18 + 디렉터리 13)이다. 이관 비용 계산에는 66.3 KB 를 쓴다.

## H2. 쌍둥이 드리프트 — 역할 쌍은 텍스트 쌍이 아니다

```bash
diff <fin파일> <fit파일> | grep -c '^<'    # fin 전용 줄
diff <fin파일> <fit파일> | grep -c '^>'    # fit 전용 줄
# 공통줄 = fin 총 줄수 − fin 전용 줄수  (빈 줄 포함이므로 상한값)
```

| 역할 | fin / fit | fin줄 | fit줄 | fin전용 | fit전용 | 공통줄 | 공통/fin |
|---|---|---:|---:|---:|---:|---:|---:|
| rules `api-routes` | `api-routes.md` / 동명 | 119 | 8 | 115 | 4 | 4 | **3.4%** |
| rules `components` | `components.md` / 동명 | 11 | 9 | 5 | 3 | 6 | 54.5% |
| rules `workflow` | `workflow.md` / 동명 | 241 | 264 | 47 | 69 | 194 | **80.5%** |
| 세션재개 | `session-resume` / `session-primer` | 98 | 103 | 65 | 70 | 33 | 33.7% |
| 인계 | `session-boundary` / `session-handoff` | 133 | 122 | 95 | 84 | 38 | 28.6% |
| 오케스트레이터 | `milestone-workflow` / `myfitness-orchestrator` | 123 | 119 | 105 | 101 | 18 | **14.6%** |
| 릴리즈 | `release-publisher` / `release-flow` | 134 | 223 | 89 | 178 | 45 | 33.6% |
| Codex | `codex-response-patterns` / `codex-review-loop` | 87 | 113 | 57 | 83 | 30 | 34.5% |
| 브랜치 | `milestone-workflow` / `branch-workflow` | 123 | 175 | 100 | 152 | 23 | 18.7% |
| agent `release-manager` | 동명 | 103 | 46 | 84 | 27 | 19 | 18.4% |
| (참고) `CLAUDE.md` | 동명 | 163 | 173 | 90 | 100 | 73 | 44.8% |

→ **`rules/workflow.md`(80.5%)를 빼면 10쌍 중 9쌍이 공통줄 55% 미만, 6쌍은 35% 미만.**
`api-routes.md` 는 3.4%(119줄 대 8줄)로 사실상 다른 문서다.
위 "하네스 구성" 절의 *"역할은 쌍둥이인데 이름이 다르고"* 는 **이름 대응이지 텍스트 대응이 아니다.**
합치는 작업은 **병합이 아니라 재작성**이다.

## H3. `workflow.md` 3자 비교 (fin · fit · pleiades)

```bash
norm() { sed 's/^[[:space:]]*//;s/[[:space:]]*$//' "$1" | grep -v '^$' | sort -u; }
norm <fin>/.claude/rules/workflow.md > fin.w ; norm <fit>/… > fit.w ; norm ~/workspace/pleiades/… > ple.w
comm -12 fin.w fit.w | wc -l ; comm -12 fin.w ple.w | wc -l ; comm -12 fit.w ple.w | wc -l
cat fin.w fit.w | sort -u > orig.w ; comm -13 orig.w ple.w | wc -l ; comm -23 orig.w ple.w | wc -l
```

| 집합 | 줄 |
|---|---:|
| fin / fit / pleiades 유니크 비공백 줄 | 161 / 172 / **344** |
| fin ∩ fit | 118 |
| fin ∪ fit | 215 |
| (fin ∪ fit) ∩ pleiades | **34** |
| pleiades 신규 (원본에 없는 줄) | **310 / 344 = 90.1%** |
| pleiades 가 버린 원본 줄 | **181 / 215 = 84.2%** |

**절 구조는 계승됐다** — 최상위 4절 동일, 10단계 유지, fit 의 8-0·8-5·8-6 이 9-0·9-5·9-6 으로 이어짐,
`4. UI/UX 디자인` 삭제 · `2. 실측`·`4. 되돌리기 비용 산정` 신설.
**그러나 exact-line 계승률은 15.8%(34/215)** 다. `.claude/rules/workflow.md` 머리말의 "계승"은
**구조 계승**이고, fin·fit 원본을 "이미 흡수했으니 버려도 된다"고 볼 근거는 이 숫자에 없다.
버려진 181줄의 의도성 판정은 **미측정** (줄 단위 대응 필요).

## H4. 저장소 결합도 · 3등급 분류

```bash
occ() { grep -o --binary-files=text -E "$2" "$1" | wc -l; }   # 파일 경로를 직접 지정 (H6 참조)
P_ABS='(~|/Users/sagan)/workspace/my(Finance|Fitness)|/Users/sagan'
P_APP='src/(app|lib|components|bot|mcp|generated)/|prisma/(schema|migrations)|prisma/[a-z]'
P_PORT='\b(4100|4200|4210|4301)\b' ; P_PM2='pm2|PM2'
P_REPO='myFinance|myFitness|myfinance|myfitness|fomalhaut84'
P_DOMAIN='세금|주식|매매|배당|증권|환율|자산|가계부|지출|수익률|Garmin|garmin|체중|운동|식단|칼로리|러닝|수면|바디|영양|health|Health'
```

**성분별 출현 건수 (fin 17파일 + fit 19파일 = 36파일 / 3,850 LOC)**

| 성분 | fin | fit | 합 | 파라미터화 |
|---|---:|---:|---:|---|
| 절대경로 | 0 | 3 | 3 | 가능 |
| 앱경로 | 17 | 27 | 44 | 불필요 (레이아웃 동일) |
| 포트 | 3 | 5 | 8 | 가능 |
| pm2 | 7 | 24 | 31 | 가능 (`X`/`X-bot`/`X-mcp` 명명 동일) |
| 저장소명 리터럴 | 39 | 57 | 96 | 가능 |
| **도메인 용어** | **40** | **36** | **76** | **불가** |
| **합계** | **106** | **152** | **258** | |

→ **258건 중 182건(70.5%)은 `{repo}`·`{port}`·`{pm2-app}` 치환으로 흡수 가능.**
흡수 불가한 도메인 76건은 **4파일에 61건(80.3%)이 집중** — fin `tax-logic`(6)·`stock-trading-method`(5)·
`feature-implementer`(4), fin `CLAUDE.md`(21) + fit `CLAUDE.md`(19)·`ops-diagnose`(10).

**3등급 (규칙: 참조 0 → 무파라미터 / 도메인≥3 또는 총≥20 → 고유 / 나머지 → 파라미터화)**

| 등급 | 파일 | 비율 | LOC |
|---|---:|---:|---:|
| 무파라미터 공통화 | **3** | 8.3% | 362 |
| 파라미터화 필요 | **26** | 72.2% | 2,652 |
| 저장소 고유 | **7** | 19.4% | 836 |

무파라미터 3: fin `rules/workflow.md` · fit `rules/api-routes.md` · fit `skills/orphan-check`.
저장소 고유 7: fin `rules/tax-logic`·`rules/stock-trading-method`·`agents/feature-implementer`·`CLAUDE.md`,
fit `skills/ops-diagnose`·`settings.local.json`·`CLAUDE.md`.

**pleiades 자신(13파일)**: 총 175건 · 저장소명 리터럴 125건 · **도메인 용어 0건.**

## H5. pleiades 와의 중복 — 34파일 중 15파일만 역할이 겹친다

| | 파일 | LOC |
|---|---:|---:|
| pleiades 에 **대응 역할 없음** | **19** | 1,371 |
| pleiades 와 **역할 겹침** | **15** | 2,143 |
| 계 (`.claude/` 만) | 34 | 3,514 |

역할 겹침 15 = fin 8 (`session-resume`·`session-boundary`·`milestone-workflow`·`project-spec-writer`·
`project-verify`·`release-publisher`·`codex-response-patterns`·`rules/workflow`)
+ fit 7 (`session-primer`·`session-handoff`·`myfitness-orchestrator`·`release-flow`·
`codex-review-loop`·`branch-workflow`·`rules/workflow`).

**"겹친다 = 대체 가능"이 아니다** (기능 대조, 산출물 §4-2):

| 역할 | 대체 가능? | 근거 |
|---|---|---|
| 세션 재개 | **불가** | `pleiades-resume` 에 없는 것 5종: `project_session_active.md` 소비·삭제 / `gh pr·issue list` / 미커밋 하네스 안내 / 태그·릴리즈 상태 / 백로그 우선순위. **교집합은 "인계 노트 읽고 3문단 브리핑" 1개** |
| 세션 인계 | **불가** | pleiades 5절 중 대응 3절. fin 6 Step 중 3개, fit 6 Step 중 4개가 대응 없음 |
| 오케스트레이터 | **불가** | 라우팅 대상 에이전트가 다르다 (pleiades 4 / fin 4 / fit 5, 이름 겹침 0) |
| 스펙 작성 | **불가** | `decision-doc`(결정 문서 7절) vs `project-spec-writer`(Sub-Phase 분할 + 서브이슈 템플릿 + `gh issue` 발행). **공통 절 1개(제외 사항)** |
| 워크플로우 룰 | **가능(조건부)** | 절 구조 계승 확인. 단 exact-line 15.8% (H3) |
| 검증·Codex·릴리즈·브랜치 | **부분** | 절차는 pleiades `workflow.md` 에 흡수, **Prisma/MCP 특수 검증 · 응답 패턴 템플릿 · 배포 확인·롤백 절차는 미포함** |

## H6. `settings.local.json` 2열

```bash
python3 -c "import json,re,collections; d=json.load(open(F)); a=d['permissions']['allow']; ..."
```

| | myFinance | myFitness |
|---|---|---|
| 위치 | **원본만** (gitignored · worktree tracked 16파일에 **없음**) | fit `.claude/` 18파일 **안에 포함** |
| 크기 | 17,469 B / 156줄 | **6,749 B / 111줄** |
| `permissions.allow` | **150** | **105** |
| 도구별 | Bash 135 · WebFetch 9 · codex-cli 4 · WebSearch 1 · Read 1 | Bash 96 · WebFetch 4 · codex-cli 3 · WebSearch 1 · Read 1 |
| 절대경로 규칙 | **6 (4.0%)** | **1 (1.0%)** |
| 저장소명 리터럴 규칙 | 9 | 4 |
| 앱경로 규칙 | 4 | **10** |
| 포트 규칙 | 1 | 3 (4301·4302) |
| **저장소에 묶인 규칙(합집합)** | **14 / 150 = 9.3%** | **15 / 105 = 14.3%** |
| **그대로 이식 가능** | **136 / 150 = 90.7%** | **90 / 105 = 85.7%** |

fit 의 절대경로 규칙 1건: `Bash(ls /Users/sagan/workspace/myFitness/src/generated/prisma/index*)`.

> **004 Q21 보정.** Q21 은 fin `.claude/` **16파일(tracked)** 만 이관 단위로 잡는데,
> fin 하네스에는 **gitignored `settings.local.json`(156줄 / 17,469 B / allow 150)** 이 하나 더 있고
> **worktree 에 따라오지 않았다.** 실제 이관 단위는 **fin 17 + fit 18 = 35파일**이고,
> fin 쪽은 `git rm` 커밋(16) + **수동 복사(1)** 로 **작업 종류가 둘**이다.

## H7. **`grep` 이 `.gitignore` 를 따른다 — `--binary-files=text` 로는 못 막는다**

```bash
type grep
# grep is a shell function ... exec -a ugrep "$CLAUDE_CODE_EXECPATH" \
#   -G --ignore-files --hidden -I --exclude-dir=.git ... "$@"
grep --version    # → ugrep 7.8.4  (GNU grep 아님)
```

`--ignore-files` 는 **`.gitignore` 를 존중한다.** myFitness `.gitignore:35` 가 `.claude/` 를
**디렉터리째** 무시하므로 저장소 루트 재귀 grep 은 **하네스 18파일을 통째로 건너뛴다.**

| 명령 | 결과 |
|---|---:|
| `grep -rn --binary-files=text -- "/workspace/myFitness" ~/workspace/myFitness` | **0** |
| `grep -rn --binary-files=text --no-ignore-files -- (동)` | **1,617** |
| `/usr/bin/grep -rn --binary-files=text -- (동)` | **1,617** |
| `grep -rn --binary-files=text -- "…" ~/workspace/myFitness/.claude` (경로 직접) | **3** |

**비대칭**: myFinance 는 `.gitignore:35` 가 `.claude/settings.local.json` 을 **파일 단위**로 무시하는데
이 경우 래퍼 grep 이 **여전히 찾는다** (M3 의 6건이 그래서 재현된다). **디렉터리 패턴일 때만 사라진다.**

> **정정 (2026-09-07 재측정).** M3 의 *"(myFitness) 소스·설정 전체 **0건**"* 은 틀렸다.
> `/usr/bin/grep` 으로 재측정하면 (`node_modules`·`.next`·`dist`·`.git` 제외)
> **`.claude/settings.local.json` · `.claude/skills/branch-workflow/SKILL.md` ·
> `.claude/skills/session-primer/SKILL.md` 3건** + `src/generated/prisma/internal/class.ts` 1건(생성물)이 나온다.
> **손으로 쓴 앱 소스·설정은 여전히 0건**이므로 M3 의 결론 방향(이동해도 앱은 무사)은 유지된다.
> 바뀌는 것은 **하네스 이관 시 경로 치환이 3곳 필요**하다는 점이다.

**규율 보강 필요.** `CLAUDE.md` 와 `.claude/rules/workflow.md` 2절의
*"`grep` 에는 반드시 `--binary-files=text`"* 는 **binary 오탐만** 막고 **gitignore 오탐은 못 막는다.**
ignored 경로를 재는 측정에는 셋 중 하나가 필요하다:
**(a) `--no-ignore-files` · (b) `/usr/bin/grep` 직접 호출 · (c) 검색 경로를 그 디렉터리로 직접 지정.**
이 절의 측정은 (c) 로 했고, 표본 3파일을 (b) 로 재계산해 건수 일치를 확인했다.
→ 004 **Q22** 의 재검증 범위는 *"binary 를 포함할 수 있는 측정"* 에서
***"ignored 경로를 포함하는 모든 grep 측정"*** 으로 넓어진다.

## 못 잰 값 (이 절 범위)

| 항목 | 이유 |
|---|---|
| 버려진 `workflow.md` 181줄의 의도성(삭제 vs 누락) | 줄 단위 대응 필요. 이번 범위 밖 |
| 하네스 파일 간 상호 참조(`[[wikilink]]`) 그래프 | 이번 과제 범위 밖 |
| 하네스가 실제로 로드·발동되는지 | 정적 측정 불가. 004 §3-2 가 "중첩 `.claude/` 는 로드 안 됨"으로 이미 실측 |
| auto memory 재측정 | 위 "auto memory 현황" 절 값을 그대로 인용 (fin 126줄/37토픽 · fit 16줄/16토픽) |

---

## 하네스 참조 그래프 실측 (2026-09-07)

Q20 / 이슈 #1(하네스 통합) 근거. 초안 `_workspace/harness/01_surveyor_harness_refs.md`.
**읽기 전용 — 대상 저장소 쓰기 0건.**

**측정 대상과 ref**

| 대상 | 디렉터리 | ref |
|---|---|---|
| myFinance 하네스 | `repos/myFinance` (worktree) | `integration/pleiades` (모드 I) |
| myFitness 하네스 | **원본 `~/workspace/myFitness/.claude/`** | **ref 없음 — gitignored.** `git ls-files .claude` → 0, worktree 에 `.claude/` 자체가 없다 |
| fin `workflow.md` (#8) | `repos/myFinance` | **`dev`** — #8 은 원본 저장소 결함. `diff dev integration/pleiades` = **0줄** |
| pleiades 하네스 | `~/workspace/pleiades` | 워킹트리 (`dev`, clean) |

### H1. 참조 그래프 — 총 285줄

```bash
# 인벤토리
ls <root>/.claude/agents | sed 's/\.md$//'
ls -d <root>/.claude/skills/*/ | xargs -n1 basename
ls <root>/.claude/rules | sed 's/\.md$//'
# 각 이름을 하네스 md + CLAUDE.md 전체에서 검색 (자기 정의 파일 제외)
#   agent·skill → \b<name>\b      rule → rules/<name>\.md | `<name>\.md`
grep -nE --binary-files=text "<pattern>" <file>
# 전수 스크립트: _workspace/harness/refgraph.sh
```

| 방향 | myFinance | myFitness | pleiades |
|---|---|---|---|
| `CLAUDE.md` → rule | 7 | 4 | 5 |
| `CLAUDE.md` → skill | **0** | **13** | 4 |
| `CLAUDE.md` → agent | **0** | **0** | **0** |
| agent → agent | 32 | 17 | 30 |
| agent → skill | **0** | 7 | 6 |
| agent → rule | 7 | 1 | 7 |
| skill → agent | 40 | 18 | 19 |
| skill → skill | 11 | 16 | 15 |
| skill → rule | 3 | 4 | 8 |
| rule → agent | 0 | 0 | 2 |
| rule → skill | 0 | 0 | 9 |
| **합** | **100** | **80** | **105** |

→ **fin `CLAUDE.md` 는 skill·agent 를 한 번도 부르지 않는다.** fin 하네스의 유일한 진입점은
`CLAUDE.md:128` 의 `.claude/rules/workflow.md` 한 줄. fit 은 `CLAUDE.md` → skill 13건.
**두 저장소의 트리거 구조가 다르다.**

**에이전트 호출 구문 전수** (`grep -rnE --binary-files=text --include='*.md' 'subagent_type|Task\(|Skill\('`)

| | 건수 | 저장소 로컬 에이전트를 부르는 것 |
|---|---|---|
| fin | 7 | **5** (`skills/milestone-workflow/SKILL.md:33,40,46,53,57`) |
| fit | 4 | **1** (`skills/myfitness-orchestrator/SKILL.md:77` → codex-liaison) |
| pleiades | 1 | **0** |

나머지는 전부 외부 플러그인 `pr-review-toolkit:code-reviewer`. 그 외 파급은 **산문 참조**다.

### H2. 저장소 간 이름 참조 = **6방향 전부 0**

```bash
grep -rnE --binary-files=text --include='*.md' "<상대 저장소의 agent+skill+rule 이름 전부>" \
  <root>/.claude <root>/CLAUDE.md | wc -l
```

pleiades→fin 0 · pleiades→fit 0 · fin→fit 0 · fit→fin 0 · fin→ple 0 · fit→ple 0.

→ **옮겨도 끊길 참조가 없다. 위험은 통합 네임스페이스의 이름 충돌이다.**

| 충돌 이름 | 종류 | fin | fit | ple | 그 이름을 가리키는 참조 |
|---|---|---|---|---|---|
| `release-manager` | agent | ✅ | ✅ | — | fin 18 · fit 7 = **25** |
| `workflow` | rule | ✅ | ✅ | ✅ | fin 8 · fit 5 · ple 20 = **33** |
| `api-routes` | rule | ✅ | ✅ | — | **5** |
| `components` | rule | ✅ | ✅ | — | **4** |
| skill 23개 | skill | 7 | 9 | 7 | **충돌 0** |

**충돌 4건이 67줄의 참조를 모호하게 만든다.**

### H3. 실재하지 않는 참조 (이관 전부터 dangling)

| 저장소 | 파일:줄 | 참조 | 판정 |
|---|---|---|---|
| fin | `CLAUDE.md:92` | `stock-trading-method 스킬` | **종류 불일치** — 실체는 **rule** |
| fin | `docs/specs/321-api-response-envelope.md:12` | `.claude/rules/common/patterns.md` | 경로 없음 |
| fin | `docs/milestone-2.md:233` | `.claude/config.toml` | 경로 없음 |
| fit | `docs/specs/m2-8-date-fix.md:22` | `.claude/plans/jiggly-hugging-kahan.md` | 경로 없음 |

외부 플러그인으로 해소되는 것(이관 대상 아님): `frontend-design` · `pr-review-toolkit:code-reviewer`
— 둘 다 `~/.claude/settings.json` `enabledPlugins` 에 **user scope 활성**.

### H4. fin `.claude/` 16파일 `git rm` 파급 — **활성 5건 · 빌드/CI 0**

```bash
cd ~/workspace/pleiades/repos/myFinance
git grep --text -n '\.claude' integration/pleiades -- ':!.claude/**' | cut -d: -f2-            # 20
git grep --text -nE '<fin agent 4 + skill 7 이름>' integration/pleiades -- ':!.claude/**' | wc -l   # 0
git grep --text -n 'claude' integration/pleiades -- package.json '.github/**' 'scripts/**' '*.yml' 'ecosystem.config.js' | cut -d: -f2-   # 1 (오탐)
git grep --text -n -i 'claude' integration/pleiades -- 'README*' | cut -d: -f2-                # 4 (전부 산문)
git grep --text -n -E '\.claude/(rules|agents|skills)/' integration/pleiades -- ':!.claude/**' | cut -d: -f2-   # 15
```

| 검색 | 히트 | 깨지는 것 |
|---|---|---|
| `.claude` 문자열 전체 | 20 | 15 |
| **하네스 이름 (agent 4 + skill 7)** | **0 / 733 tracked 파일** | **0** |
| `package.json`·`.github/**`·`scripts/**`·`*.yml`·`ecosystem.config.js` | 1 | **0** (`deploy.yml:109` 주석의 `claude-advisor.ts`) |
| `README.md` | 4 | **0** (`.claude/` 경로 0) |
| 삭제 대상 16파일 직접 참조 | **15** | 15 |

**15건 중 갱신이 필요한 활성 참조는 5건**:
`CLAUDE.md:62,118,128,140` + **`src/app/api/alerts/history/export/route.ts:5`**.
나머지 10건은 완료 스펙·로드맵의 이력 기록(1건은 이미 dangling).

> **그 5건 중 1건이 `src/` 실행 파일이다.** `.claude/rules/workflow.md` 9-0 표의
> *"대상 저장소 변경 — 경로 무관"* 은 **에이전트 사전 리뷰 필수**이므로 이 PR 은 self-review 경로를 탈 수 없다.

**fit 대칭** (`repos/myFitness`, `integration/pleiades`): `.claude` 히트 **5** —
`.gitignore:35` · `docs/specs/359-…:14`·`364-…:129`(둘 다 `.claude/rules/workflow.md`) ·
`docs/specs/m2-8-date-fix.md:22`(이미 dangling) · `src/lib/monitoring/admin-alerts.ts:272`(`ALERT_TYPE.claude_auth_expired` **오탐**).
fit 하네스 **이름** 참조: **0 / 396 tracked 파일**.

### H5. auto memory 의존 — 11파일

```bash
d=~/.claude/projects/-Users-sagan-workspace-<proj>/memory
grep -rnE --binary-files=text '\.claude/(rules|agents|skills)' $d
grep -rnE --binary-files=text '<그 저장소의 agent+skill 이름 전부>' $d
```

(rule 이름 `components`·`api-routes` 는 `src/components/`·API 산문과 구분 불가 → 이름 검색에서 제외. 경로 검색에는 포함)

| | memory 파일 | `.claude/**` 경로 줄 | skill·agent 이름 줄 | 참조를 가진 파일 |
|---|---|---|---|---|
| myFinance | 38 + MEMORY.md | **6** | **12** (1건 오탐) | **6 / 39** |
| myFitness | 18 | **2** | **1** | **3 / 18** |
| pleiades | 4 | **1** | **1** | **2 / 5** |

**세션 동작을 실제로 좌우하는 트리거 줄 4개**:
fin `MEMORY.md:4,5,7`(`session-resume`·`session-boundary`) · ple `MEMORY.md:4`(`pleiades-resume`). fit 은 0.
memory 는 git 대상이 아니므로 **스킬 이름을 바꾸면 PR 밖에서 따로 고쳐야 한다.**

> **fin memory 에 이미 틀린 기록이 있다.** `feedback_session_management.md:59` 가
> `.claude/agents/`·`.claude/skills/` 를 **untracked** 로 기술하나 fin `.claude/` 는 **tracked 16파일**이다.

### H6. `--add-dir` 영속 설정 — **키는 있으나 설정된 곳은 0**

```bash
python3 -c "import json;d=json.load(open('/Users/sagan/.claude.json'));print(sorted(d['projects']['/Users/sagan/workspace/pleiades'].keys()))"
grep -l --binary-files=text 'additionalDirectories' ~/.claude/settings.json ~/.claude.json ~/workspace/pleiades/.claude
ls -la ~/workspace/pleiades/.claude/
claude --help | grep -i -B2 -A2 'add-dir'
B=/Users/sagan/.local/share/claude/versions/2.1.263      # CLI v2.1.263 (Mach-O)
grep -o --binary-files=text '.\{200\}permissions\.additionalDirectories.\{200\}' $B
grep -o --binary-files=text 'if(Ie(a.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD)).\{700\}' $B
grep -o --binary-files=text 'function mp(.\{0,400\}' $B
```

| 위치 | `additionalDirectories` |
|---|---|
| `~/.claude/settings.json` | **0건** |
| `~/.claude/settings.local.json` | **파일 없음** |
| pleiades `.claude/settings.json` · `settings.local.json` | **파일 없음** — pleiades `.claude/` 는 `agents/`·`rules/`·`skills/` 3디렉터리뿐 |
| `~/.claude.json` `projects[…/pleiades]` (키 28개) | **0건** — 디렉터리 목록 키 자체가 없다 |
| `~/.claude.json` `projects` 전체 14키 | **0건** |

**그러나 CLI 에는 정식 키가 있다** (v2.1.263 문자열 실측):

```
permissions.additionalDirectories
  tip: 'Must be an array of directory paths. Example: ["~/projects", "/tmp/workspace"].
        You can also use --add-dir flag or /add-dir command'
  로딩 스코프: projectSettings(".claude/settings.json") · localSettings(".claude/settings.local.json")
```

CLAUDE.md·rules 로딩은 **별도 조건**이 붙는다:

```js
if(Ie(a.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD)){
  let Me=mp();   // = extensionsConfig.additionalDirectoriesForClaudeMd()
  for(let xe of Me){ ...ak(xe,"CLAUDE.md") ...ak(xe,".claude","CLAUDE.md")
                     ...ak(xe,".claude","rules") ...ak(xe,"CLAUDE.local.md") }
}
```

| 사실 | 판정 |
|---|---|
| 툴 접근 디렉터리를 settings 로 영속화 가능 | **확인** |
| additional dir 의 `CLAUDE.md`·`.claude/rules/` 로딩은 **환경변수 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` 필요** | **확인** |
| 그 환경변수를 settings 파일로 고정 가능한지 | **미측정** — CLI 문자열에서 settings `env` 키 미확인 |
| `permissions.additionalDirectories` 가 `mp()` 목록에 반영되는지 | **미측정** — 별도 접근자. 런타임 검증 필요 |
| 그 경로의 `.claude/skills`·`agents` 발견 여부 | **미측정** — `--add-dir` **플래그**로는 발견됨이 기존 실측(§"중첩 `.claude/` 는 로드되지 않는다") |

> **정정 (2026-09-07 실측).** `004-repo-layout.md` §6 Q20 의 *"회피는 `--add-dir` 를 계속 넘기는 것뿐"* 은
> **단정할 수 없다.** `permissions.additionalDirectories` 라는 영속 키가 CLI 에 실재한다.
> 다만 그 키가 하네스(skills·agents) 로딩까지 커버하는지는 **미측정**이므로,
> Q20 의 결론(하네스 통합이 선결 조건)이 뒤집힌 것은 아니다. **런타임 검증 1회로 갈린다.**

### H7. fit 하네스는 **버전 관리 밖**

```bash
grep -n --binary-files=text -E '^\s*(\.claude|CLAUDE\.md|\.runtime)' ~/workspace/myFitness/.gitignore
git -C ~/workspace/myFitness check-ignore -v CLAUDE.md .claude/rules/workflow.md .claude/
git -C ~/workspace/myFitness ls-files .claude | wc -l
grep -n --binary-files=text -i 'claude' ~/workspace/pleiades/repos/myFinance/.gitignore
```

```
myFitness/.gitignore:35  .claude/
myFitness/.gitignore:36  CLAUDE.md
myFitness/.gitignore:37  .runtime/
check-ignore -v (exit 0):
  .gitignore:36:CLAUDE.md	CLAUDE.md
  .gitignore:35:.claude/	.claude/rules/workflow.md
  .gitignore:35:.claude/	.claude/
myFinance/.gitignore:35  .claude/settings.local.json
```

| | myFitness | myFinance |
|---|---|---|
| `.claude/` tracked | **0** | **16** |
| `CLAUDE.md` | **ignored** | tracked |
| worktree(`repos/*`)에 존재 | **`.claude/` 없음**, `CLAUDE.md` 는 수동 복사분 | `.claude/` 16파일 자동 · **`settings.local.json` 없음** |

→ **"fit 특수 하네스를 저장소에 유지" = "버전 관리 밖·원본 워킹 디렉터리에만 유지".**
통합 작업 중에는 보이지 않고 PR·리뷰·이력에도 남지 않는다.
tracked 로 바꾸려면 `.gitignore` 2줄 변경 = **fit 소스 변경(사용자 확인 대상)**.

**부수**: worktree fin `.claude/` 에는 `settings.local.json`(원본 17,469 B)이 **없다**.
권한 허용 규칙은 원본 세션에만 있다.

### H8. #8 · #10 잔여 항목 — **전부 미수정**

```bash
cd ~/workspace/pleiades/repos/myFinance
diff <(git show dev:.claude/rules/workflow.md) <(git show integration/pleiades:.claude/rules/workflow.md) | wc -l  # 0
git show dev:.claude/rules/workflow.md | grep -n --binary-files=text -E 'git merge dev|git tag|git push origin main'
git show dev:.claude/rules/workflow.md | grep -n --binary-files=text -E 'P0|P1|P2'
grep -n --binary-files=text -E 'P0|P1|P2' ~/workspace/myFitness/.claude/rules/workflow.md
cd ~/workspace/pleiades
grep -n --binary-files=text '체크아웃' .claude/skills/repo-measure/SKILL.md .claude/agents/repo-surveyor.md
grep -n --binary-files=text '/tmp/'   .claude/skills/repo-measure/SKILL.md .claude/agents/repo-surveyor.md
```

| 이슈 | 결함 | 이슈 기재 | 현재 실측 | 상태 |
|---|---|---|---|---|
| #8 ① | 릴리즈가 `main` 직접 push | fin `:34-36` / fit `:35-37` | fin **34,35,36** · fit **35,36,37** | **미수정 (일치)** |
| #8 ② | `P0` 를 최저로 정의 | fin `:169` / fit `:166` | fin 정의 **145-147** · **169** · fit 정의 **142-144** · **166** | **미수정 (일치)** |
| #10 ① | 낡은 체크아웃 게이트 | `repo-measure/SKILL.md:22` · `repo-surveyor.md` | `repo-measure:22,92,94` · `repo-surveyor:24,70,72` = **6줄** | **미수정. 표면이 이슈 기재보다 넓다** |
| #10 ② | 공유 `/tmp` 임시파일 | `repo-surveyor.md:85` · `repo-measure/SKILL.md` | `repo-measure:117-119` · `repo-surveyor:84-86` = **6줄** | **미수정** |

**#8 ②의 실제 수정 표면**: `P0/P1/P2` 를 쓰는 줄이 **fin 17줄**(241줄 중) · **fit 26줄**(264줄 중) = **43줄**.

**이슈 #8 에 없는 같은 계열 결함 1건**: fin `workflow.md:240` / fit `workflow.md:262` 의
hotfix 절차 `리뷰(1회, P2만)` — 그 척도에서 `P2`=critical 이므로 **로직·엣지케이스(major) 리뷰를
건너뛴 채 실서비스로 나간다.** pleiades 는 이미 고쳤다(`.claude/rules/workflow.md` 긴급 수정 절 정정 블록).

> **이 측정이 #10 ①에 실제로 걸렸다.** fit `.claude/` 는 gitignored 라 **ref 자체가 없다.**
> 체크아웃 게이트를 문자 그대로 따르면 유효한 측정을 "미확인"으로 버려야 했다.
> 사유를 명시하고 원본 파일시스템으로 측정했다.

### H9. 못 잰 값 (이 절 범위)

| 항목 | 이유 |
|---|---|
| `permissions.additionalDirectories` 가 skills·agents 발견까지 커버하는지 | 런타임 동작. 정적 문자열로 판별 불가 |
| `settings.json` 으로 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` 고정 가능 여부 | CLI 문자열에서 settings `env` 키 미확인 |
| 이름 충돌 시 CLI 의 우선순위·경고 유무 | 실제 통합 전에는 관측 불가 |
| fit 하네스의 변경 이력 | `.claude/` 가 커밋된 적이 없어 git 이력 자체가 없다 |

## `permissions.additionalDirectories` 는 하네스를 로드하지 않는다 (2026-09-07 런타임 실측 · 결정적)

앞 절 "하네스 참조 그래프 실측" H4 가 미측정으로 남긴 두 항목을 런타임으로 확인했다.
CLI v2.1.263, 모델 `claude-haiku-4-5-20251001`, `--permission-mode plan`, cwd = `~/workspace/pleiades`(신뢰됨).
질문: myFitness 고유 skill(`fitness`·`ops-`·`prisma`·`orphan`·`session-` 포함) · agent(`db-migrator` 등 4개) ·
fit `api-routes.md`/`workflow.md` 노출 여부를 JSON 으로 답하게 했다.

```bash
Q='Answer with only a JSON object {"skills":[...],"agents":[...],"rules_seen":bool} ...'
J='{"permissions":{"additionalDirectories":["/Users/sagan/workspace/myFitness"]}}'
# (6)(7) --settings 플래그
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q" --settings "$J" < /dev/null
claude -p "$Q" --settings "$J" < /dev/null
# (9)(10) 신뢰된 프로젝트의 .claude/settings.local.json 에 같은 JSON 을 쓰고 (테스트 후 삭제)
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q" < /dev/null
claude -p "$Q" < /dev/null
# (8) 대조군
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q" --add-dir /Users/sagan/workspace/myFitness < /dev/null
```

| # | 경로 | env | skills | agents | rules |
|---|---|---|---|---|---|
| 6 | `--settings` JSON | 켬 | 0 | 0 | 아니오 |
| 7 | `--settings` JSON | 끔 | 0 | 0 | 아니오 |
| 9 | `.claude/settings.local.json` (신뢰된 프로젝트) | 켬 | 0 | 0 | 아니오 |
| 10 | `.claude/settings.local.json` (신뢰된 프로젝트) | 끔 | 0 | 0 | 아니오 |
| **8** | **`--add-dir`** | 켬 | **6** (`myfitness-orchestrator`·`session-handoff`·`session-primer`·`prisma-drift-fix`·`orphan-check`·`ops-diagnose`) | **4** (전부) | **예** |

부수 관측: 신뢰되지 않은 디렉터리(스크래치)에서는 `Ignoring 1 permissions.additionalDirectories entry ... this workspace has not been trusted` 로 키 자체가 무시된다.
`--add-dir` 는 variadic 이라 **프롬프트를 플래그 앞에** 두지 않으면 프롬프트가 디렉터리로 먹힌다 (`Input must be provided ...` 오류로 1회 실패).

> **판정.** `permissions.additionalDirectories` 는 **툴 접근 권한만** 영속화한다. skills·agents·rules·CLAUDE.md 로딩은
> **`--add-dir` 플래그 경로에만** 붙어 있다. 따라서 004 Q20 의 *"회피는 `--add-dir` 를 계속 넘기는 것뿐"* 은
> 앞 절 H4 의 유보에도 불구하고 **결과적으로 맞다.** 저장소별 특수 하네스를 저장소에 남기면
> **세션마다 `--add-dir` + 환경변수**를 넘겨야 하고 `--resume` 시 복원되지 않는다 (`CLAUDE.md` 안내 그대로).

## `--add-dir` 로딩 범위와 환경변수 (Q37 · 2026-09-07 런타임 실측)

앞 절과 같은 방식(haiku · plan 모드 · 프롬프트를 플래그 앞에). 변별 질문: `ple_rules` = *"pleiades 고유"* 리터럴(pleiades `workflow.md` 에만 4회 존재)을 포함한 룰을 봤는가.

```bash
Q='Answer with only a JSON object {"skills":[...],"agents":[...],"fit_rules":bool,"ple_rules":bool} ...'
cd ~/workspace/pleiades;  claude -p "$Q" --add-dir ~/workspace/myFitness < /dev/null                                     # a
cd ~/workspace/pleiades;  CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q" --add-dir ~/workspace/myFitness < /dev/null   # a2
cd ~/workspace/myFitness; claude -p "$Q" --add-dir ~/workspace/pleiades < /dev/null                                      # b
cd ~/workspace/myFitness; CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q" --add-dir ~/workspace/pleiades < /dev/null    # b2
grep -c "pleiades 고유" ~/workspace/pleiades/.claude/rules/workflow.md   # → 4
```

| # | cwd | `--add-dir` | env | add-dir 쪽 skills | add-dir 쪽 agents | add-dir 쪽 rules |
|---|---|---|---|---|---|---|
| a | pleiades | fit | 끔 | 6 (전부) | 4 (전부) | (변별 불가 — fit skill 설명에 리터럴 포함) |
| a2 | pleiades | fit | 켬 | 6 | 4 | (동) |
| **b** | fit | pleiades | **끔** | 3 (전부) | 2 (전부) | **아니오** (`ple_rules: false`) |
| **b2** | fit | pleiades | **켬** | 3 | 2 | **예** (`ple_rules: true`) |

> **판정.** ① `--add-dir` 는 **환경변수 없이 skills·agents 를 로드**한다. ② **rules·CLAUDE.md 는 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` 이 있어야** 로드된다 (b vs b2). ③ 방향은 **대칭** — 대상 저장소 cwd 세션도 `--add-dir` 로 pleiades 하네스를 본다.
> 이름 충돌 시 우선순위는 이 실측 범위 밖(감사 3회차 항목).

부수 관측 (b·b2): cwd 가 fit 일 때 `Permission allow rule (.claude/settings.local.json): Bash(grep -n "SplitChart..." ...) has a wildcard before the rest of the command` 경고가 매번 출력된다 — fit `settings.local.json` 의 허용 규칙 1건이 CLI 검사에 걸린다.

## fit 하네스 민감 문자열 스캔 (Q33 · 2026-09-07)

```bash
/usr/bin/grep -rniE --binary-files=text \
  -e 'token|secret|password|passwd|api[_-]?key|bearer|BEGIN (RSA|OPENSSH)|AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|@gmail|@[a-z0-9-]+\.(com|net|kr)|ssh [a-z]+@|https?://[^ )]*:[^ )]*@' \
  ~/workspace/myFitness/.claude ~/workspace/myFitness/CLAUDE.md
```

| 매치 | 판정 |
|---|---|
| `.claude/settings.local.json:88` — curl User-Agent 문자열 (`Mozilla/5.0 (X11; ...)`) 안의 `.` 패턴 | 무해 |
| `.claude/skills/ops-diagnose/SKILL.md:102` — `curl -sf http://127.0.0.1:4301/health` | 무해 (loopback) |

**비밀·자격 증명·개인 식별자 0건.** (`~/workspace/myFitness` 디렉터리 절대경로 3건은 앞 절 M3 정정에서 이미 셌다 — 사용자명 `sagan` 이 경로에 노출되는 것은 fin `.claude/` 가 이미 PUBLIC 으로 공개 중인 것과 동일한 수준.)

---

## workflow.md 계승 시 버린 줄 분류 (2026-09-07)

**측정 목적.** Q31 — fin·fit `.claude/rules/workflow.md` 를 폐기해도 되는가.
pleiades 판이 버린 원본 줄 중 **단독 작업·핫픽스에 필요한데 pleiades 에 없는 것**이 있으면 폐기 불가다.
상세: `_workspace/harness/01_surveyor_harness_workflow_diff.md`

**측정 대상 `(디렉터리, ref)`** — fin 은 worktree(`integration/pleiades`), fit 은 **원본**(`main`).
**fit 원본을 잰 이유: fit `.claude/` 는 디렉터리째 gitignored 라 worktree 에 존재하지 않고
`git show <ref>:<path>` 도 불가능하다.** tracked 가 아니므로 1a 단계 변경의 영향을 받지 않아
통합 트리 측정과 어긋나지 않는다. 이 셸의 `grep` 은 ugrep 래퍼로 `.gitignore` 를 따르므로
fit `.claude/` 접근에는 `/usr/bin/grep` 을 썼다.

### 1. 기존 숫자 재현 — 재현됨 (정정 없음)

```bash
norm() { sed 's/^[[:space:]]*//;s/[[:space:]]*$//' "$1" | /usr/bin/grep -v '^$' | sort -u; }
norm ~/workspace/pleiades/repos/myFinance/.claude/rules/workflow.md > fin.w
norm ~/workspace/myFitness/.claude/rules/workflow.md                > fit.w
norm ~/workspace/pleiades/.claude/rules/workflow.md                 > ple.w
cat fin.w fit.w | sort -u > orig.w
comm -12 orig.w ple.w | wc -l    # 유지 34
comm -23 orig.w ple.w | wc -l    # 버림 181
```

fin 161 · fit 172 · ple 344 · fin∪fit 215 · 유지 **34** · 버림 **181 / 215 = 84.2%**.
`01_surveyor_harness_content.md` §2-2 의 값과 **전 항목 일치**.

**제외 규칙.** 빈 줄 제외 · 앞뒤 공백 정규화 · `sort -u`. 표 구분선(`|---|`)·코드펜스는
추가 제외가 **불필요했다** — 버린 181줄 안에 0건이다
(`/usr/bin/grep -cE '^(\|[-: |]*\||```|---+$)' dropped.w` → 0). 원본과 pleiades 가 같은 표기를
쓰므로 그 줄들은 전부 *유지된* 34줄 쪽으로 갔다.

### 2. 유지된 34줄의 성분 — 실질 계승은 12줄

| 성분 | 줄 |
|---|---:|
| heading (`#`~`####`) | 11 |
| 구조 노이즈 (코드펜스 2 · 표 구분선 1 · ASCII 다이어그램/화살표 6) | 9 |
| 프롬프트 템플릿 placeholder | 2 |
| **실질 산문·명령** | **12** |

→ **exact-line 계승률 15.8%(34/215)는 상한.** 실질은 **5.6%(12/215)**.

### 3. 버린 181줄의 등급 분류

절 귀속은 **코드펜스 인식 파서**로 했다 — `# 릴리즈 절차`·`# 1. 이슈에 완료 코멘트` 등이
bash 주석이라 단순 `grep '^#'` 은 오귀속한다. 181줄 전부 귀속(미귀속 0).
**(c) 판정은 주관이 아니라 hard zero 실측**: 그 줄의 주제어가 pleiades 판에 0건인 것.

```bash
for pat in 'docs/designs' 'frontend-design' 'roadmap' '마이그레이션' 'phase-'; do
  printf '%-18s: ' "$pat"; /usr/bin/grep -c "$pat" ~/workspace/pleiades/.claude/rules/workflow.md; done
# 전부 0
```

| 등급 | 줄 수 | 비율 |
|---|---:|---:|
| (a) pleiades 판에 의미상 흡수됨 | 92 | 50.8% |
| (b) 의도적 삭제·대체 (pleiades 가 결함으로 명시 지적한 것 포함) | 39 | 21.5% |
| **(c) 단독 작업에 필요한데 pleiades 에 없음** | **35** | **19.3%** |
| (d) 판단 불가 (`8-4 codex-cli MCP` 운영 파라미터 14 + 릴리즈 `배포` 1) | 15 | 8.3% |
| 합계 | **181** | 100% |

**(c) 35줄의 주제:** UI/UX 디자인 단계 19 (`docs/designs/<issue>-<feature>/`·`frontend-design` 스킬·
프로토타입·디자인 범위 판단) · 이슈 라벨 taxonomy 3 (`phase-N`/`feature`/`bug`/`chore`) ·
`docs/specs/<issue-number>-<feature>.md` 명명 + 필수 항목 2 · DB 마이그레이션 3 (구현 계획 + 리뷰 트리거) ·
`docs/roadmap.md` 체크 1 · PR 제목 `[Phase N]` 1 · 릴리즈 major=`Phase 완료` 1 · 기타 디자인 연계 5.

**(c) 는 죽은 문서가 아니다 — 산출물 실측:**

| | `docs/designs/` | `docs/specs/*.md` | `docs/roadmap.md` |
|---|---:|---:|---:|
| myFinance | **25 디렉터리** | 126 | 419줄 |
| myFitness | **8 디렉터리** | 95 | 381줄 |

`docs/specs` 실제 명명도 원본 규약과 일치 — fin `170-nav-improvement.md`, fit `10-heart-body-page.md`
= `<issue-number>-<feature>.md`. **pleiades 의 `<NNN>-<주제>` 가 아니다.**

### 4. pleiades 판의 위임 문구 — 1줄

```bash
/usr/bin/grep -n 'workflow\.md' ~/workspace/pleiades/.claude/rules/workflow.md
# 5:   출처 표기 (계승한다)
# 165: 단독 작업은 그 저장소 자신의 `.claude/rules/workflow.md`(계승 전 원본)를 따르고…
```

**위임은 165행 1줄뿐이고 `단독 작업`(모드 S) 에만 걸린다.** 그 1줄이 (c) 35줄 전부를 가리킨다.

**핫픽스 절(모드 H)의 (c) = 0건.** `## 긴급 수정 (Hotfix)` 이 버린 4줄은 a 3 · b 1 이고
pleiades 판은 원본보다 **강화**됐다(봇 게이트 분리 · 재검증 ★ · 척도 정정).
→ **폐기를 막는 것은 핫픽스가 아니라 단독 작업이다.**

### 5. (c) 가 저장소별로 다른가 — 30/35(85.7%)가 공통

```bash
diff <(sed -n '61,93p' <fin>)   <(sed -n '62,88p' <fit>)     # 4. UI/UX 디자인
diff <(sed -n '51,60p' <fin>)   <(sed -n '52,61p' <fit>)     # 2·3·5절
diff <(sed -n '218,235p' <fin>) <(sed -n '240,257p' <fit>)   # 10. 머지 완료 후
```

| 절 | diff |
|---|---|
| `4. UI/UX 디자인` | **fin 에만 5줄** (기존 디자인 시스템 준수 블록 + 텔레그램 커맨드). 나머지 동일 |
| `2·3·5절` | **1줄** — 라벨 `phase-1~phase-6`(fin) vs `phase-1~phase-N`(fit) |
| `10. 머지 완료 후` | **차이 0** |

(c) 귀속: 공통 24 · fin 전용 7 · fit 전용 4. 다만 `DB 스키마/마이그레이션`은 fin 8-1 / fit 8-0 으로
**같은 주제가 다른 절에 놓인 것**이고 라벨 2줄은 한 토큰 차이다.
**주제 단위로는 (c) 30/35(85.7%)가 공통이고, 진짜 fin 고유는 디자인 시스템 5줄뿐이다**
(`Tailwind + Recharts` · 다크 테마 · `docs/examples/dashboard-prototype.jsx` · 텔레그램 커맨드).

### 6. 결론 — 가정을 뒤집는 숫자

1. **`181줄 / 84.2%` 는 재현되지만 그 숫자만으로는 폐기 판단이 불가능했다.**
   분해하면 **(c) 35줄(19.3%)** 이 나온다 → **fin·fit `workflow.md` 폐기는 성립하지 않는다.**
2. **폐기를 막는 것은 핫픽스가 아니라 단독 작업이다** — 핫픽스 절 (c) = 0건.
   "핫픽스 때문에 원본을 남긴다"고 적으면 틀린다.
3. **위임 고리는 165행 1줄**인데 거기 매달린 것이 (c) 35줄 전부다.
4. **(c) 는 저장소 고유가 아니라 공통(85.7%)** → "저장소별 워크플로우라 저장소별로 둬야 한다"가 뒤집힌다.
   **pleiades 에 단독 작업 절을 신설(+30줄)하고 저장소별 잔여를 5줄로 줄이는 선택지**가 열린다.
5. **계승 34줄도 상한** — 실질 12줄(5.6%).

## 정정 — 하네스 참조 그래프 실측 H4·H5 (2026-09-07 감사 1·2회차)

> 위 "하네스 참조 그래프 실측" 절의 두 요약 숫자가 감사에서 정정됐다. 원문은 그대로 두고 여기서 바로잡는다.
> 근거: `_workspace/harness/03_auditor_harness.md` 1회차 정정 ④·⑥, 2회차 ⑤.

| 원문 | 원값 | 정정값 | 근거 |
|---|---|---|---|
| H4 *"fin `.claude/` 16파일 `git rm` 파급 — 활성 5건"* | 5 | **6** | `repos/myFinance/CLAUDE.md:145` 누락. 열거: `CLAUDE.md` 5줄(62·118·128·140·145) + `src/app/api/alerts/history/export/route.ts:5`(JSDoc 주석) |
| H5 *"auto memory 의존 — 11파일"* | 11 | **13** | fin 6→**9** · fit 3→**2** · ple 2 (재열거는 감사 1회차 정정 ④ 표) |

재현: `/usr/bin/grep -rn --binary-files=text -e '\.claude/' -e 'workflow\.md' ~/workspace/pleiades/repos/myFinance/CLAUDE.md`

---

# 추가 측정 — 2026-09-08 (1a 발송 경로 DB 쓰기 · 병행 인스턴스 격리 조건)

출처 `_workspace/1a-0/01_surveyor_db_writes.md` (GitHub 이슈 `fomalhaut84/pleiades#31`).
004 Q42 가 확정한 **병행 인스턴스**(읽기 전용 DB 롤 · 별도 포트/pm2 이름 · Nginx 미연결 · 봇 미기동 · cron off)가
성립하는지에 대한 선행 측정. **모드 I** — 측정 대상은 worktree 다.

## 측정 시점 저장소 상태

```bash
for d in myFinance myFitness; do echo "$d $(git -C repos/$d rev-parse --abbrev-ref HEAD) $(git -C repos/$d rev-parse --short HEAD) dirty=$(git -C repos/$d status --porcelain | wc -l | tr -d ' ')"; done
```

| 대상 | 경로 | 브랜치 | HEAD | dirty |
|---|---|---|---|---|
| myFinance | `~/workspace/pleiades/repos/myFinance` | `integration/pleiades` | `6542152` | 0 |
| myFitness | `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` | `626a201` | 0 |

> 이 절의 모든 값은 **worktree(`integration/pleiades`)** 기준이다. 이 문서 상단의 2026-09-03/04 측정은
> 원본(`~/workspace/myF*`, fin `dev` / fit `main`)에서 잰 것이다. 모집단(fin 20 / fit 6 호출)은 양쪽이 일치했다.

## 방법론 주의 — zsh 는 미인용 변수를 단어 분할하지 않는다

```bash
FILES="a.ts b.ts"; git grep -n --text "prisma" -- $FILES     # ← zsh 에서 0건 (경고 없음)
```
`bash` 와 달리 zsh 는 `$FILES` 를 **한 덩어리 pathspec** 으로 넘긴다. 이번 측정 첫 시도에서
`custom-strategy-alert.ts:310` 의 `prisma.customStrategy.updateMany` 를 **"쓰기 0건"으로 오보고**했다.
004 의 `--binary-files=text`, 005 §4-11 의 ugrep `.gitignore`, 2026-09-04 의 `"$F"` glob 함정과 같은 계열이다.
**대상 파일 목록은 `for f in … ; do … "$f" ; done` 루프로 넘긴다.**

## M1. 아웃바운드 발송 경로의 DB 쓰기 — 전수

```bash
cd repos/<repo>
for f in <호출부 모듈 …>; do
  echo "### $f"
  grep -nE --binary-files=text \
    'prisma\.[A-Za-z]+\.(create|update|upsert|delete|updateMany|deleteMany|createMany)|\$executeRaw|\$transaction' \
    "$f" || echo "  (쓰기 0건)"
done
```

**myFinance — 15 모듈 / 20 호출**

| 파일:행(전송) | 쓰기 API (파일:행) | 테이블 | 전/후 | 전송 실패 시에도 쓰나 | 예외 |
|---|---|---|---|---|---|
| `active-review.ts:125`·`:142` | `alertConfig.upsert` (`active-review.ts:44`, 호출 `:154`·`:168`) | `AlertConfig` | **전 · 게이트** | 전송 전 | **무가드** |
| `alert-dispatcher.ts:124` | `alertHistory.createMany` (`alert-history.ts:67` ← `retry/route.ts:74`) | `AlertHistory` | 후 | **예** | 삼킴 (`alert-history.ts:83`) |
| `briefing.ts:71`·`:93` · `budget-alert.ts:83`·`:124` · `daily.ts:134` · `monthly-report.ts:55`·`:69` · `monthly.ts:67` · `quarterly-report.ts:39`·`:68` · `quarterly.ts:107` · `rsu.ts:113` · `advisor-monitor.ts:222` | — | — | — | — | **쓰기 0건 (10 모듈)** |
| `custom-strategy-alert.ts:292` | `alertConfig.upsert` (`:61`, 게이트 `:131`) | `AlertConfig` | **전 · 게이트** | 전송 전 | **무가드** |
| 〃 | `alertHistory.createMany` (`:302`) | `AlertHistory` | 후 | **예** | 삼킴 |
| 〃 | `customStrategy.updateMany` **×2** (`:310`·`:316`) | `CustomStrategy` | 후 | **아니오** (`sentCount===0` → `:304 return`) | **무가드** |
| `networth-snapshot.ts:95` | `netWorthSnapshot.upsert` (`:63`) | `NetWorthSnapshot` | **전** | 전송 전 | **무가드** |
| `price-alert.ts:340` | `alertHistory.createMany` (`:350`) | `AlertHistory` | 후 | **예** | 삼킴 |
| `ta-signal-alert.ts:334` | `alertConfig.upsert` (`:51`, 호출 `:290`) | `AlertConfig` | **전 · 게이트** | 전송 전 | **무가드** |
| 〃 | `alertHistory.createMany` (`:376`) | `AlertHistory` | 후 | **예** | 삼킴 |
| **상류** `lib/cron.ts:95` | `priceCache.upsert` (`price-fetcher.ts:76`·`:190`) | `PriceCache` | **전 · 게이트** | — | `result.success > 0` 이어야 price/TA/custom 알림 실행 |

| fin 합계 (위 표에서 셈) | 값 |
|---|---|
| 전송 **전 · 무가드** | **4** (`active-review:44` · `custom-strategy:61` · `networth-snapshot:63` · `ta-signal:51`) |
| 전송 **후 · 삼킴** | **1 코드 지점**(`alert-history.ts:67`) · **도달 호출부 4**(`:302`·`:350`·`:376`·`alert-dispatcher:178`) |
| 전송 **후 · 무가드** | **2** (`custom-strategy-alert:310`·`:316`) |
| 쓰기 0건 모듈 | **10 / 15** |
| 상류 게이트 쓰기 | **2** (`price-fetcher:76`·`:190`) |

**myFitness — 4 모듈 / 6 호출** (`scheduler.ts:34`·`:59` · `auto-adjust.ts:395`·`:455` · `auto-adjust-cron.ts:78` · `admin-alerts.ts:232`)

| 파일:행(전송) | 쓰기 API (파일:행) | 테이블 | 전/후 | 전송 실패 시에도 쓰나 | 예외 |
|---|---|---|---|---|---|
| `scheduler.ts:34` | `reportJob.create` (`report-job.ts:74`) | `ReportJob` | **전** | 전송 전 | **무가드** |
| 〃 | `reportJob.update` (`report-job.ts:129`·`:153`) | `ReportJob` | **전** | 전송 전 | **무가드** |
| 〃 | `$transaction([aIAdvice.deleteMany, aIAdvice.create])` (`daily-report.ts:109-113` · 주간은 `weekly-report.ts:185-190`) | `AIAdvice` | **전** | 전송 전 | **무가드** |
| 〃 | `syncMetadata.upsert` ×3 + `$executeRaw` (`garmin/sync.ts:137`·`:200`·`:214`·`:173`) | `SyncMetadata` 외 | **전** | 전송 전 | `preSyncForReport` 삼킴 (`daily-report.ts:59`) |
| `scheduler.ts:59` | — | — | — | — | 위 예외가 여기로 → **"❌ … 생성 실패" 문구를 대신 전송** |
| `auto-adjust.ts:395` | `workoutAdjustment.create` (`:368`) | `WorkoutAdjustment` | **전** | 전송 전 | **무가드** |
| 〃 | `workoutAdjustment.update` (`:415` — `telegramMessageId`/`telegramChatId`) | `WorkoutAdjustment` | 후 | **아니오** (`sent===0` → `:407` throw) | 삼킴 |
| 〃 | `aIAdvice.create` (`:431`) | `AIAdvice` | 후 | **아니오** (동일) | 삼킴 |
| `auto-adjust.ts:455` | — | — | — | — | 위 예외가 여기로 |
| `auto-adjust-cron.ts:78` | `workoutAdjustment.updateMany` (`:91`) | `WorkoutAdjustment` | 후 | **아니오** (`sent===0` → `:83` throw) | **무가드** |
| 〃 (같은 tick, 전송 독립) | `workoutAdjustment.updateMany` (`:123` TTL expire) | `WorkoutAdjustment` | — | 예 | try/catch |
| `admin-alerts.ts:232` | `systemAlertState.updateMany` (`:202`) + `.create` (`:212`) | `SystemAlertState` | **전 · 전송을 게이트** (`reserved` false → `:227 return`) | 전송 전 | 삼킴 → **전송 자체 안 됨** |
| 〃 | `systemAlertState.deleteMany` (`:248`) | `SystemAlertState` | 후 (미전송 롤백) | **예** (`delivered=false` 시) | 삼킴 |

| fit 합계 (위 표에서 셈) | 값 |
|---|---|
| 전송 **전 · 무가드** | **5** (`report-job:74`·`:129`·`:153` · `daily-report:109`(주간은 `weekly-report:185`) · `auto-adjust:368`) |
| 전송 **전 · 삼키지만 전송을 게이트** | **2** (`admin-alerts:202`·`:212`) |
| 전송 **전 · 삼킴 · 게이트 아님** | **4** (`garmin/sync.ts:137`·`:173`·`:200`·`:214`) |
| 전송 **후 · 삼킴** | **3** (`auto-adjust:415`·`:431` · `admin-alerts:248`) |
| 전송 **후 · 무가드** | **1** (`auto-adjust-cron:91`) |
| 쓰기 0건 모듈 | **1 / 4** (`send.ts` 초크포인트) |

> **⚠ "1a 발송 경로는 DB 쓰기가 불필요하다" 는 성립하지 않는다.**
> RO 롤에서 **정상 본문 전송에 도달하는** 경로는 fin **10 / 15 모듈**, fit **0 / 3 발송 흐름**이다
> (fit 리포트·auto-adjust 제안은 폴백 에러 문구로, admin alert 는 아예 미전송으로 바뀐다).
> **전송 자체는 관측 가능하다** — fin `POST /api/alerts/history/[id]/retry` 는 쓰기가 전송 **후**이고
> `recordAlertHistory` 가 예외를 삼키므로 **RO 롤에서도 실제 전송 + HTTP 200** 을 낸다.

## M2. 웹 프로세스 기동만으로 도는 쓰기

```bash
git -C repos/<repo> ls-files | grep -iE 'instrumentation|ecosystem|middleware'
cat repos/<repo>/next.config.mjs repos/<repo>/src/instrumentation.ts
git -C repos/<repo> grep -nE --text "DISABLE_[A-Z_]+|ENABLE_[A-Z_]+|[A-Z_]*CRON[A-Z_]*|SCHEDULER_[A-Z_]+" -- src | grep "process.env"
```

| | myFinance | myFitness |
|---|---|---|
| `next.config.mjs` | `experimental.instrumentationHook: true` | **`{}`** (그럼에도 훅은 돈다 — Next 15 stable) |
| `src/instrumentation.ts` `register()` | **no-op** (주석 1줄: cron 은 standalone 봇에서) | `startCronJobs()` · **`sweepOrphanedJobs()`** · `startOrphanSweeper()` · photo sweep 2 |
| **기동 시 DB 쓰기** | **0건** | **1건** — `reportJob.updateMany` (`report-job.ts:270`), 부팅 1회 + **5분 주기** (`:290`) |
| 세션/로그인 테이블 쓰기 | **0건** (`next-auth ^5.0.0-beta.31` 이나 `lib/auth.ts:109 strategy:'jwt'`, `PrismaAdapter` 0건) | **0건** (next-auth 의존성 없음) |
| `prisma migrate deploy` | 앱 부팅 경로 **0건** — `deploy/deploy.sh:109` · `.github/workflows/ci.yml:56` 에만 | 동일 (`deploy/deploy.sh:52` · `ci.yml:56`) |
| 시드 | 부팅 경로 0건 (`active-review.ts:24` 주석이 *"deploy.sh 는 migrate deploy 만, seed 재실행 X"* 라 명시) | 0건 |
| 초기화 `upsert` (`ensure*Setting`) | **4** (`active-review:29`·`custom-strategy-alert:44`·`price-alert:29`·`ta-signal-alert:38`) — 호출은 `bot/notifications/scheduler.ts:49`·`:53`·`:57`·`:62` 로 **봇 프로세스 전용**, 전부 삼킴 | 없음 |

**cron on/off 스위치 — 양쪽 다 0건.**

| | 실측 |
|---|---|
| `DISABLE_*` / `ENABLE_*` / `SCHEDULER_*` on-off 플래그 | **fin 0 · fit 0** |
| 스케줄 문자열 env | **fin 0 (전부 하드코딩)** — `lib/cron.ts:84`·`:131`·`:156`·`:193`·`:218`·`:298` + `bot/notifications/scheduler.ts` 13곳 |
| 〃 | **fit 6** — `SYNC_CRON`(`lib/cron.ts:21`) · `MORNING_REPORT_CRON`(`scheduler.ts:68`) · `EVENING_REPORT_CRON`(`:80`) · `REPORT_CRON`(`:91`) · `AUTO_ADJUST_CRON`(`:103`) · `AUTO_ADJUST_MAINTENANCE_CRON`(`:110`) |

| "cron off" 의 실제 스위치 | 방법 | 등급 |
|---|---|---|
| fin 웹 | 불필요 — 웹은 cron 을 등록하지 않는다 | 즉시 |
| fin 봇 · fit 봇 | 그 pm2 앱을 안 띄운다 (`standalone.ts` 가 유일한 등록 지점) | 즉시 |
| **fit 웹** | `SYNC_CRON` 에 발화하지 않는 표현식(`0 0 30 2 *`)을 넣는 **편법**. `startOrphanSweeper()` 는 우회 수단이 없어 **코드 변경 필요** | **중간** |

> **⚠ "cron off" 는 env 토글이 아니다.** fit 웹 프로세스는 **기동만으로 `reportJob.updateMany` 를 쓰고**,
> 그 쓰기를 끄는 env 가 없다. 병행 인스턴스를 **쓰기 가능 롤로** 띄우면 실서비스 웹의 pending/running job 을
> `failed` 로 마킹할 수 있다 — **RO 롤이 오히려 안전 장치다.** RO 에서는 `instrumentation.ts:34 .catch()` 가
> 삼켜 **프로세스는 정상 기동**하고 5분마다 에러 로그만 남는다.

## M3. 격리 6조건의 코드 측 근거

```bash
cat repos/<repo>/ecosystem.config.js
sed -n '/"scripts"/,/^  }/p' repos/<repo>/package.json
sed -n '/^datasource/,/^}/p' repos/<repo>/prisma/schema.prisma
git -C repos/<repo> grep -oh --text -E 'process\.env\.[A-Z0-9_]+' -- src scripts deploy ecosystem.config.js prisma.config.ts | sed 's/process\.env\.//' | sort -u
grep -oE --binary-files=text '^[A-Z0-9_]+' repos/<repo>/.env.example | sort -u    # 값 미열람
```

| 조건 | myFinance | myFitness |
|---|---|---|
| **포트** | `package.json` `start`=`next start` (인자 없음) / `ecosystem` `args:'start -p 4100'` + `env.PORT:4100` | 동일 구조, 4200 |
| → 별도 포트로 띄우기 | **`-p` 가 `PORT` 를 이긴다.** ecosystem 을 안 쓰고 `pm2 start npm --name … -- start` 로 띄우면 **`PORT` env 만으로 충분 · 파일 수정 불필요** | 동일 |
| **pm2 이름** | `myfinance`·`myfinance-bot`·`myfinance-mcp`. `cwd: __dirname` — **이식 가능** | `myfitness`·`myfitness-bot`·`myfitness-mcp`. **`cwd: '/home/nasty68/myFitness'` 하드코딩 (3개 앱 전부)** |
| → 병행 인스턴스 | 이름 충돌만 피하면 됨 (`--name` 으로 충분) | ⚠ **`--name` 만으로는 부족** — `cwd` 를 덮거나 별도 ecosystem 파일 필요 |
| **DB 롤** | `datasource db { provider="postgresql"; url=env("DATABASE_URL") }` · `directUrl`/`shadowDatabaseUrl` **0건** → **`DATABASE_URL` 하나로 전환** | 동일 |
| → 연결 시점 자동 쓰기 | 코드·설정 범위 **0건** (부팅 경로에 `migrate`/`db push` 없음). fin 은 `lib/prisma.ts:20` 이 URL 에 `connection_limit/pool_timeout/connect_timeout` 을 주입할 뿐 | 동일 |
| **봇 미기동** | long polling 시작은 `bot/standalone.ts:54 bot.start()` 뿐(+`:28 deleteWebhook()`). `getBot()`(`bot/index.ts:34~`)은 **연결하지 않는다** → **pm2 봇 앱을 안 띄우면 충분** | 동일 |
| → 웹의 봇 참조 | 정적 3(`retry/route.ts:21`·`deposits/route.ts:5`·`lib/cron.ts:6,7,8`) + **동적 2**(`advisor-monitor.ts:216`·`:217`). 토큰 미설정 시 `bot/index.ts:37` throw 이나 **호출될 때만** → 웹은 크래시 안 함 | 정적 2(`admin-alerts.ts:9`·`:10`) — `bot` 인자가 웹에서는 null (`:193` 가드) |
| **Nginx 미연결** | 저장소에 nginx 설정 없음 — 측정 불가 | 동일 |

> ⚠ **병행 *봇* 프로세스는 띄우면 안 된다.** `standalone.ts:28` 의 `deleteWebhook()` + `:54` 의 long polling 이
> **같은 토큰의 실서비스 봇과 409 로 충돌**한다.
> ✅ 반대로 **fin 은 봇 없이 아웃바운드를 트리거할 수 있다** — `POST /api/alerts/history/[id]/retry` 는
> 웹에서 `getBot()`(연결 없음)+`sendHtml`(HTTP)만 쓴다. **1a 검증 트리거 후보.** fit 에는 대응 경로가 없다.

**병행 인스턴스가 반드시 달라야 하는 env (열거에서 셈: fin 7 · fit 6)**

| 키 | fin | fit | 이유 |
|---|---|---|---|
| `DATABASE_URL` | ● | ● | RO 롤 |
| `PORT` | ● | ● | 4100/4200 회피 |
| `TELEGRAM_BOT_TOKEN` | ● | ● | 같은 토큰이면 **실사용자에게 실제 메시지가 간다** (폴링 안 하므로 409 는 없음) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | ● | ● | 검증용 chat 만 |
| `TELEGRAM_ADMIN_CHAT_IDS` | ● | — | 동일 |
| `MCP_PORT` | ● | ● | 4210/4301 회피 |
| `AUTH_SECRET` | ● | — | 실서비스 세션과 격리 |
| `SYNC_CRON` | — | ● | cron off 우회 (위) |

그 밖의 키(참고, 그대로 재사용 가능): fin `MCP_TRANSPORT`·`MCP_LOG_*`·`AUTH_PIN`·`AUTH_TRUST_HOST`·`BASE_URL`·`WHOOING_WEBHOOK_URL`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH`·`NODE_ENV` /
fit `MCP_TRANSPORT`·`MCP_HTTP_URL`·`MCP_LOG_*`·`APP_BASE_URL`·`GARMIN_EMAIL`·`GARMIN_PASSWORD`·`MFDS_API_KEY`·`MFDS_BASE_URL`·`CLAUDE_BIN`·`NODE_ENV`·`TZ`·`NEXT_RUNTIME`·리포트 cron 5종.
`.env.example` 은 **양쪽 다 존재**한다 (키 이름만 인용 — 값은 열람하지 않았다).

## M4. 로컬 `repos/*` 개발 루프

```bash
for d in myFinance myFitness; do for f in .env .env.local node_modules .next dist src/generated/prisma .garmin-tokens; do
  [ -e "repos/$d/$f" ] && echo "$d/$f 존재" || echo "$d/$f 없음"; done; done
lsof -iTCP -sTCP:LISTEN -P -n | grep -iE 'postgres|5432'; pg_isready
lsof -iTCP -sTCP:LISTEN -P -n | grep -E ':(4100|4200|4210|4301)'; command -v pm2
```

| 항목 | myFinance | myFitness |
|---|---|---|
| `.env` / `.env.local` | 존재 / 없음 | 존재 / 없음 |
| `node_modules` | 존재 | 존재 |
| `.next` · `dist` | **둘 다 없음** | **둘 다 없음** |
| Prisma client | `node_modules/.prisma/client` **존재** (`libquery_engine-darwin-arm64.dylib.node`) | **`src/generated/prisma` 없음** ⚠ — `src/lib/prisma.ts:1` 이 `@/generated/prisma/client` 를 import |
| `.garmin-tokens` | 해당 없음 | 존재 |

| 로컬 런타임 | 실측 |
|---|---|
| Postgres 5432 리슨 | **있음** — pid 2348, `[::1]:5432` · `127.0.0.1:5432` |
| `pg_isready` | **`/tmp:5432 - accepting connections`** |
| 4100 / 4200 / 4210 / 4301 리슨 | **없음** |
| `pm2` | **미설치** |

> **보완 (2026-09-08 측정).** 위 *"로컬에는 실행 중인 서비스가 없다"* 절(2026-09-04)은
> **pm2 미설치 · 4100/4200 리슨 없음** 에 한해 여전히 유효하다. 그 절이 재지 않은 값으로
> **로컬 Postgres 는 5432 에서 리슨 중이고 연결을 받는다.** 로컬 개발 루프의 DB 전제는 성립한다.

> **로컬 병행 인스턴스는 "env 만 바꿔 띄우기" 가 아니다.** 양쪽 다 `.next` 가 없어 `npm run build` 가 선행돼야 하고,
> **fit 은 그 앞에 `npx prisma generate`** 가 필요하다 (`src/generated/prisma` 부재). 둘 다 worktree 에 파일을 쓰므로
> 이번 측정(읽기 전용)에서는 실행하지 않았다.

## 못 잰 값 (이 절 범위)

| 항목 | 왜 못 쟀나 |
|---|---|
| RO 롤에서 `alertConfig.upsert` 가 **실제로** 던지는지 | 실행 필요. Postgres 는 `INSERT … ON CONFLICT` 를 conflict 여부와 무관하게 INSERT 권한으로 검사하므로 거부가 예상되나 **런타임 미검증** |
| `PrismaClient` 연결 자체의 RO 쓰기 시도 (advisory lock 등) | 실행 필요. 부팅 경로에 `migrate` 호출이 없다는 것까지만 확인 |
| `pm2 start … --cwd` 로 fit ecosystem 우회가 실제로 되는지 | 로컬 pm2 미설치 · 서버 접근 없음 |
| 서버의 실제 pm2 앱 목록·env·Nginx 설정 | 서버 접근 없음. `ecosystem.config.js` 기준으로만 기술. nginx 설정 파일은 저장소에 없다 |
| `.env` 실제 값 | **값 열람 금지.** 키 목록은 `.env.example` + `process.env.*` 전수로 대체 |
| fit `SYNC_CRON="0 0 30 2 *"` 를 node-cron 이 수용하는지 | 실행 필요 (문법상 유효하나 미검증) |
| 빌드 시간·`.next` 디스크 | 빌드 미실행 (읽기 전용 규율) |

---

# 추가 측정 — 2026-09-08 (npm git 의존성 역학 · Q28)

출처 `_workspace/1a-0/01_surveyor_gitdep.md` (GitHub 이슈 #31). 003 §1-1·§2-1·§5-2(Q28)·§8-1 정정 4 의 이행.
환경 node **v20.18.0** / npm **10.8.2** / git **2.50.1 (Apple Git-155)** / darwin 25.6.0.
측정 장소는 스크래치패드 `…/scratchpad/gitdep/` — **대상 저장소 쓰기 0건**(M3 는 `repos/*` worktree `integration/pleiades` ref 에서 `git show` 로만 읽음, 모드 I).
`~/.gitconfig` 에 `insteadOf` URL 재작성 **없음**(측정 전 확인).

## 요약 — 가정을 뒤집는 값 3건

| # | 뒤집힌 가정 | 실측 |
|---|---|---|
| 1 | *"패키지를 `packages/notify/` 에 두고 `git+ssh://…/pleiades#tag` 로 설치한다"* (003 §1-1 + §2-1) | **불가.** npm 은 클론 **루트의 `package.json`** 만 읽는다. 루트에 없으면 `ENOENT`(EXIT 254). 서브디렉터리 지정 문법은 npm 10 문서에 **없다** |
| 2 | Q28 — *"어느 형태가 자격 증명 없이 설치되나"* | **셋 다 된다.** pacote 가 GitHub-hosted spec 을 **https 우선**으로 해석하고 ssh 는 폴백이다. `git+ssh://` 로 써도 **ssh 호출 0회** |
| 3 | *"`prepare` 는 설치 때 한 번"* | **`npm ci` 마다 재실행된다.** 두 저장소 `deploy/deploy.sh` 가 `npm ci` 를 쓰므로 **배포마다 서버에서 클론+devDeps+`tsc`** 가 돈다 |

## M1. git 의존성과 서브디렉터리

더미 저장소 3종(각 tag `v0.0.1`, `dist` 는 gitignore):
`fake-A` = 루트 `package.json` 없음 · `fake-B` = 루트가 곧 `@pleiades/notify`(`exports`/`files`/`prepare`) · `fake-C` = 루트가 `name:pleiades, private:true, workspaces:["packages/*"]` (**003 §2-1 형태**).

| 케이스 | 명령 | 결과 |
|---|---|---|
| **A** (루트 pkg 없음) | `npm install "git+file://$S/fake-A#v0.0.1"` | **실패 EXIT 254** — `npm error enoent Could not read package.json: … /_cacache/tmp/git-cloneoobaAt/package.json`. `node_modules` 미생성 |
| **B** (루트 = 패키지) | `npm install "git+file://$S/fake-B#v0.0.1"` | **성공.** `added 1 package … in 5s` |
| **C** (workspaces 루트) | `npm install "git+file://$S/fake-C#v0.0.1"` | 설치는 되나 **`node_modules/pleiades/`** 로 들어온다. `prepare` 미실행 → `dist` 없음 → `require('@pleiades/notify')` = `MODULE_NOT_FOUND`. `private:true` 는 git 설치를 막지 않는다 |

케이스 B 설치 내용 (`find node_modules/@pleiades/notify -maxdepth 3`):
```
node_modules/@pleiades/notify/package.json
node_modules/@pleiades/notify/packages/notify/dist          ← prepare 가 생성
node_modules/@pleiades/notify/packages/notify/package.json
```
`dist/index.js`(`exports.hello = 'notify';`) · `dist/index.d.ts` 생성 · `require('@pleiades/notify')` → `{"hello":"notify"}` ·
`src/`·`tsconfig.json` 은 `files` 가 제외 · 크기 **16 KB**(`node_modules` 전체 20 KB, typescript 잔존 없음).

**서브디렉터리 문법은 없다.** `npm help package-spec`(NPM@10.8.2) git urls 절과 `npm help install` 의 URL 문법:
```
 <protocol>://[<user>[:<password>]@]<hostname>[:<port>][:][/]<path>[#<commit-ish> | #semver:<semver>]
 <protocol> is one of git, git+ssh, git+http, git+https, or git+file.
```
`#<commit-ish>` 와 `#semver:` **둘뿐**. `npm help {install,package-spec,package-json,ci} | col -b | grep -iE 'subdirector|#path:|sub-?folder'` → git spec 관련 hit **0**.
실행 확인: `#path:packages/notify` → 같은 루트 `ENOENT` · `git+file://…/fake-A/packages/notify#v0.0.1` → `fatal: … does not appear to be a git repository`.

**`prepare` 문서 (`npm help scripts`):**
```
NOTE: If a package being installed through git contains a prepare script, its
dependencies and devDependencies will be installed, and the prepare script will be run,
before the package is packaged and installed.
```
실측(격리 캐시 `--cache $S/npmcache --loglevel verbose --foreground-scripts`): `npm verbose cwd …/_cacache/tmp/git-clone9axX7V` 에서 실행되고,
빈 캐시에 `registry.npmjs.org/typescript/-/typescript-5.9.3.tgz` 가 적재됐다(캐시 19 MB).
**단 devDeps 는 클론 *루트* 것만 설치된다** — 서브디렉터리 패키지의 devDeps 는 루트 `prepare` 안의 `npm --prefix packages/notify install` 이 끌어왔다.

**lockfile 은 커밋 해시로 핀한다** (lockfileVersion 3):
```json
"node_modules/@pleiades/notify": { "version": "0.0.1",
  "resolved": "git+file:///…/fake-B#e63696c268e92976ede31fbcfe1719ff79828baa" }
```
`git rev-parse v0.0.1^{commit}` = `e63696c…` (일치). 루트 `dependencies` 에는 태그 표기(`#v0.0.1`)가 남는다.

**`npm ci` 비용** (`rm -rf node_modules` 후):

| 시나리오 | real |
|---|---|
| `npm install <git dep>` 최초 | **5.24 s** |
| `npm ci` cold 캐시 | **4.74 s** (캐시 19 MB) |
| `npm ci` warm 1회 / 2회 | **4.05 s** / **4.32 s** |
| 대조군 — git dep 없는 빈 consumer `npm ci` | **0.19 s** |

cold·warm 차이가 0.4~0.7초뿐 → **비용의 본체는 다운로드가 아니라 매번 반복되는 클론 + devDeps + `tsc`** 다. 산출물은 16 KB.
`npm ci --foreground-scripts` 로그에 `> @pleiades/notify@0.0.1 build` / `> tsc -p .` 가 그대로 찍힌다.

## M2. Q28 — 형태별 자격 증명 (public `github.com/fomalhaut84/pleiades`)

전제 확인: `git cat-file -e origin/dev:package.json` → `does not exist`. 따라서 **"클론 성공 → 루트 `package.json` ENOENT"** 로 끝나면 접근에 성공한 것이다.

```bash
npm install --dry-run --loglevel silly "<spec>" --cache $S/npmcache-t-<n>
```

| spec | EXIT | 종료 지점 | 키 무력화 시 |
|---|---|---|---|
| `github:fomalhaut84/pleiades#dev` | 254 | 루트 `package.json` ENOENT (= 클론 성공) | **동일 (성공)** |
| `git+https://github.com/fomalhaut84/pleiades.git#dev` | 254 | 동일 | **동일 (성공)** |
| `git+ssh://git@github.com/fomalhaut84/pleiades.git#dev` | 254 | 동일 | **동일 (성공)** |

**방법론 함정 1건.** `~/.ssh/config` 에 `Host github.com / IdentityFile ~/.ssh/id_ed25519` 가 있어
`GIT_SSH_COMMAND='ssh -o IdentitiesOnly=yes -o IdentityFile=/dev/null -o BatchMode=yes'` 만으로는 **ssh 가 차단되지 않는다**(그대로 성공).
**`-F /dev/null -o IdentityAgent=none` 을 함께 줘야** `Permission denied (publickey)` 가 난다. 이 검증 없이 "키 없이도 됐다"고 적으면 오측이다.

**ssh 호출 계측** — `GIT_SSH_COMMAND` 를 호출 기록 + 항상 실패하는 래퍼(`$S/ssh-fail.sh`)로 교체:

| 대상 | ssh 호출 횟수 | 결과 |
|---|---|---|
| `github:` / `git+https://` / `git+ssh://` (GitHub) | **0 / 0 / 0** | 셋 다 클론 성공 |
| 대조군 `git ls-remote git@github.com:…` (npm 아님) | **2** | 실패 |
| 대조군 `npm install git+ssh://git@example.invalid/x/y.git#main` (비-hosted) | **2** | `npm error command git --no-replace-objects ls-remote ssh://git@example.invalid/x/y.git` |

→ 래퍼는 npm 의 git 자식에게 확실히 전달된다(`npm help install` 의 인식 환경변수 목록에 `GIT_SSH_COMMAND` 포함,
`@npmcli/git/lib/opts.js` 가 `env: { ...finalGitEnv, ...process.env }` 로 통째 상속). 그럼에도 GitHub-hosted 는 **0회**다.

**근거 — `pacote/lib/git.js`:**
```js
// Fall back to SSH to support private repos
#resolvedFromHosted (hosted) {
  return this.#resolvedFromRepo(hosted.https && hosted.https()).catch(er => {
    if (er instanceof git.errors.GitPathspecError) { throw er }
    const ssh = hosted.sshurl && hosted.sshurl()
    if (!ssh || hosted.auth) { throw er }
    return this.#resolvedFromRepo(ssh)
  })
}
```
**https 우선 · ssh 는 catch 폴백.** 입력 표기와 무관하다.

**lockfile 함정** — 같은 파일의 `repoUrl` 은 resolved 필드를 **ssh 우선**으로 만든다
(`h.sshurl && !(h.https && h.auth) && addGitPlus(h.sshurl(opts)) || h.https && …`). 실측:
```bash
npm install "github:isaacs/inherits#v2.0.4"
# lock → "resolved": "git+ssh://git@github.com/isaacs/inherits.git#9a2c2940…"
rm -rf node_modules && GIT_SSH_COMMAND=<항상 실패 래퍼> npm ci --cache <빈 캐시>
# ssh 호출 0회 · require('inherits') 정상
```
**lockfile 의 `git+ssh://` 는 표기일 뿐 요구사항이 아니다.**

**Q28 답:** 세 형태 모두 public 저장소에서 자격 증명 **불필요**, 실제 전송은 **https**.
실측 차이 0. 남는 차이는 (i) `package.json` 문자열, (ii) **https 가 막힌 망에서는 ssh 폴백이 유일 경로** 뿐이다.

## M3. 소비자 측 호환 조건 (읽기 전용 · 모드 I)

대상 `~/workspace/pleiades/repos/{myFinance,myFitness}` @ `integration/pleiades`
(fin `654215240cb3ddfa4c9bf0db3181c86642fee985` · fit `626a2016b30b9b79bc89ae7fb8080ea4d6187cbb`, 둘 다 clean).
명령: `git -C <worktree> show integration/pleiades:<path>`.

| 항목 | myFinance | myFitness |
|---|---|---|
| `module` | `esnext` | `esnext` |
| **`moduleResolution`** | **`bundler`** | **`bundler`** |
| `target` | `ES2017` | `ES2017` |
| `esModuleInterop` | `true` | `true` |
| `jsx` | `preserve` | `react-jsx` |
| `package.json` `"type"` | **없음**(CJS 기본) | **없음** |
| `next` / `react` | `^15.5.16` / `^19.2.7` | `^16.2.6` / `^19.2.5` |
| `engines` · `packageManager` · `.nvmrc` | **전부 없음** | **전부 없음** |
| `grammy` spec / lock 설치본 | `^1.41.1` / **1.44.0** | `^1.42.0` / **1.42.0** |
| `grammy` import 하는 `src` 파일 | **24** | **20** |

**둘 다 `moduleResolution: bundler` → `exports.types` 를 읽는다.** 최상위 `types` 필드는 불필요(둬도 무해).
실증 — fin/fit 옵션을 복제한 소비자에서 `npx tsc --noEmit` 오류 0, `--traceResolution`:
```
File '…/@pleiades/notify/packages/notify/dist/index.d.ts' exists - use it as a name resolution result.
```

**`transpilePackages` — 양쪽 `next.config.mjs` 에 없다** (003 §8-1 정정 4 재확인). 원문 전체:
```js
// myFinance
const nextConfig = { experimental: { instrumentationHook: true } };
export default nextConfig;
// myFitness
const nextConfig = {};
export default nextConfig;
```
→ 패키지가 컴파일된 JS 를 배포하면 **두 저장소 코드 변경 0**. TS 소스를 배포하면 두 파일 모두 수정해야 한다.

**`deploy/deploy.sh` 가 `npm ci` 를 쓴다** (fin 106행 부근 · fit 49행 부근):
```
echo "=== 3. Install dependencies ==="
npm ci
```
→ M1 의 `prepare` 재실행 비용이 **배포마다** 발생하고, 서버에 `git` + registry/github 네트워크가 필요하며 `prepare` 실패 = 배포 실패다.

**grammy peer 표기:** `^1.41.1`(= `>=1.41.1 <2.0.0`) 이 양쪽을 만족한다.
`^1.42.0` 으로 적으면 fin 의 선언 하한 `1.41.1` 을 배제한다(semver 검증: `satisfies('1.41.1','^1.42.0') === false`).

## 못 잰 값 (이 절 범위)

| 항목 | 왜 못 쟀나 |
|---|---|
| **서버 node / npm 버전** | 코드에 핀이 없다 — `.nvmrc`·`engines`·`ecosystem.config.js`·`deploy/deploy.sh` 전부 무지정. 간접 단서는 `build:mcp:staged` 의 `esbuild --target=node20` 뿐 |
| **서버의 github.com https 아웃바운드 허용 여부** | 로컬에서 확인 불가. 막히면 M2 결론이 뒤집혀 **ssh 폴백 = 키 필요**가 된다 |
| **서버 git 설치 여부 · 배포 사용자 ssh 키** | 동일 |
| **PRIVATE 저장소일 때의 동작** | pleiades 는 현재 PUBLIC. private 전환 시 https 가 인증을 요구해 ssh 폴백이 실제로 발동한다 — 그때 재측정 필요 |
| **npm 11/12 동작** | 로컬 10.8.2. npm 12.0.2 존재(설치 중 notice). pacote 의 https-우선 로직 유지 여부 미확인 |
| **실제 `@pleiades/notify` 로 두 저장소를 빌드한 `npm ci` 시간** | 대상 저장소 설치·쓰기 금지. 위 수치는 **더미 패키지 기준** |
| **`dist` 를 커밋해 `prepare` 를 없앤 변형의 비용** | 더미로 재현 안 함. 대조군 0.19초가 하한 근사 |

# 추가 측정 — 2026-09-08 (1a-0 실제 스캐폴딩의 소비자 설치 · RM-3 부분)

측정 시점: pleiades `feat/31-1` `baceb96` (E3 스캐폴딩 커밋). 두 대상 저장소 무접촉.
감사(`_workspace/1a-0/03_auditor_1a0.md`)의 ALT-d 재현은 **더미 저장소**였다 — 여기는 **실제 pleiades 저장소를 git 의존성으로** 설치한 값이다. 명령은 `_workspace/1a-0/04_operator_1a0.md` §2.

| 항목 | 값 | 비고 |
|---|---|---|
| 소비자 `npm install` (cold, `prepare` 포함) | 2.75 s | `added 2 packages` (`@pleiades/notify` + typescript) |
| 소비자 `npm ci` ×3 | **2.35 / 2.13 / 2.18 s** | 감사 더미 2.01~2.14 s 와 같은 대역 |
| 설치 트리 | `package.json` · `README.md` · `packages/notify/package.json` · `packages/notify/dist/{index.js,index.d.ts}` | `src`·`tsconfig`·`package-lock` 미포함. README 는 `files` 와 무관하게 npm 이 포함 |
| 설치 크기 | 20 K | |
| `require('@pleiades/notify').VERSION` | `0.0.0` | CJS |
| `tsc --noEmit` (fin·fit 옵션 `bundler`/`esnext`/`ES2017`) | exit 0 | `exports.types` 해석 |
| lockfile `resolved` | `git+file:///…/pleiades#baceb967…` | 커밋 SHA 핀 |
| pleiades 루트 `node_modules` registry 패키지 | **typescript 1개** | S-2 형태 |
| pleiades 서브 `npm --prefix packages/notify install` | 41 packages · ~5 s | vitest **4.1.11** 해석 (`^4.1.8`) — 소비자 경로 밖 |

**못 잰 값:** 실제 GitHub 원격(`git+https://github.com/…`)에서의 설치 — 이 측정은 `git+file://` 이다. 프로토콜 측면은 2026-09-08 "npm git 의존성 역학 · Q28" 절이 이미 쟀다(https 우선). 서버 값(Q45)은 보류.

---

## Q41 — 하네스 이름 전수 (2026-09-09)

이슈 #37 Phase 1 실측 A. **모드 I** — 대상은 worktree(`repos/*` · `integration/pleiades`).
fit 원본은 *"fit `.claude/` 는 원본만 잴 수 있다"*(H1)는 전제의 유효성 확인을 위해 함께 쟀다.
산출물: `_workspace/1a-1-prep/01_surveyor_q41.md`.

**측정 시점 저장소 상태**

| 체크아웃 | 브랜치 | HEAD | dirty |
|---|---|---|---|
| `~/workspace/pleiades` | `chore/37-1` | `362e6e8` | 0 |
| `~/workspace/pleiades/repos/myFinance` | `integration/pleiades` | `6542152` | 0 |
| `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` | `626a201` | 0 |
| `~/workspace/myFitness` (원본, 참조) | `main` | `5809c48` | 0 |

```bash
# 파일·이름 전수
find <root>/.claude -type f | sed "s|^<root>/.claude/||" | sort
awk 'NR==1&&/^---/{fm=1;next} fm&&/^---/{exit} fm&&/^name:/{sub(/^name:[ ]*/,"");print;exit}' <file>

# 이름 우주 + 중복(= 이름 충돌)
for p in repos/myFinance repos/myFitness .; do
  find "$p/.claude/skills" -name SKILL.md | sed 's|.*/skills/||;s|/SKILL.md||'
  find "$p/.claude/agents" -name '*.md'   | sed 's|.*/agents/||;s|\.md$||'
done | sort -u | wc -l        # → 35 (유니크)
# 위에서 -u 없이 | sort | uniq -d  → orphan-check · release-manager
```

### Q41-1. 전수 목록 (frontmatter `name` = 디렉터리/파일명, **불일치 0건**)

| 층 | fin | fit | pleiades |
|---|---|---|---|
| **skills** | `codex-response-patterns` · `milestone-workflow` · `project-spec-writer` · `project-verify` · `release-publisher` · `session-boundary` · `session-resume` (**7**) | `branch-workflow` · `codex-review-loop` · `myfitness-orchestrator` · `ops-diagnose` · `orphan-check` · `prisma-drift-fix` · `release-flow` · `session-handoff` · `session-primer` (**9**) | `decision-doc` · `dual-repo-change` · `orphan-check` · `pleiades-handoff` · `pleiades-orchestrator` · `pleiades-resume` · `repo-measure` · `reversibility-audit` (**8**) |
| **agents** | `feature-implementer` · `quality-guardian` · `release-manager` · `spec-planner` (**4**) | `codex-liaison` · `db-migrator` · `ops-analyst` · `release-manager` · `workflow-conductor` (**5**) | `decision-writer` · `dual-repo-operator` · `repo-surveyor` · `reversibility-auditor` (**4**) |
| **rules** (frontmatter 없음) | `api-routes` · `components` · `stock-trading-method` · `tax-logic` · `workflow` (**5**) | `api-routes` · `components` · `workflow` (**3**) | `workflow` (**1**) |

- skill·agent 엔트리 **37** → 유니크 **35** · rule 엔트리 **9** → 유니크 **5** (rule 5개는 skill·agent 35개와 정확 일치 0)
- 3층 합산: 엔트리 **46** / 유니크 **40**

### Q41-2. **정정 (2026-09-09 재측정) — skill 층 이름 충돌은 이미 1건 있다**

> **정정 (2026-09-09 재측정).** 005 §4-5 표는 skill 층을 *"H-1 산출물이 pleiades 에만 있으면 **0**"* 으로,
> 정정 G 는 *"H-1 이 `codex-*` 이름을 쓰면 **첫** 충돌"* 로 적었다. **둘 다 H-1b 집행 전 값이다.**
> H-1b(PR #22 · pleiades `4ed13aa`)가 **형태 B(복사)** 로 `pleiades/.claude/skills/orphan-check/` 를 만들었고
> **fit 원본이 그대로 남아 있는 것이 형태 B 의 정의**이므로, 디렉터리명·`name` 이 완전히 같은 **skill 충돌이 이미 존재**한다.
> **현 이름 충돌은 4건이 아니라 5건**이다: rule `workflow`·`api-routes`·`components` · agent `release-manager` · **skill `orphan-check`**.
> 따라서 *"겹치는 이름을 고르면 skill 충돌 런타임 측정 1회가 선결"* 이라는 Q41 조건은 **H-1 의 이름 선택과 무관하게 이미 성립**해 있다
> (skill 충돌 런타임 동작은 여전히 **미측정** — N18 은 rule·agent 만 쟀다). H-1 이 겹치지 않는 이름을 고르면 **부채를 늘리지 않을 뿐**이다.

> **정정 (2026-09-09 재측정) — H-1 입력 LOC.** 005 §4-13 H-1 행의 *"입력 **200** LOC / 2파일"*(fin 87 + fit 113)에서
> fin 값은 **`dev` 의 값**이다. `integration/pleiades` 에서는 H-3(fin) / myFinance#492(`6542152`)가 척도 정정을 전파해 **91줄**이다.
> 모드 I 의 피연산자는 worktree 이므로 **정본은 91 + 113 = 204 LOC**.
> ```bash
> git -C repos/myFinance show dev:.claude/skills/codex-response-patterns/SKILL.md | wc -l   # 87
> wc -l repos/myFinance/.claude/skills/codex-response-patterns/SKILL.md                     # 91
> ```

**H1 표 대비 변화 (측정 오류 아님 — 집행 결과):** pleiades skill **7 → 8** · `.claude/` 파일 **12 → 13** (H-1b).
fit worktree tracked `.claude/` 는 **17파일**(H-4 가 `settings.local.json` 을 제외하고 tracked 화 — 원본은 18).
fin·fit 의 skill·agent·rule 개수(7·4·5 / 9·5·3)는 **005 기재와 전부 일치**.

**fit 원본 vs worktree**: `diff -rq` 결과 **`settings.local.json` 1파일 차이뿐, 나머지 17파일 바이트 동일**.
`.gitignore` 는 갈라졌다 — 원본 `main` 은 `:35 .claude/` · `:36 CLAUDE.md`(디렉터리 ignore, H7 의 ugrep 함정 유효),
worktree `integration/pleiades` 는 `:35 .claude/settings.local.json`(파일 단위, **함정 해소**).

### Q41-3. H-1 입력 2파일 frontmatter

| | fin `codex-response-patterns` (91줄) | fit `codex-review-loop` (113줄) |
|---|---|---|
| `name` | `codex-response-patterns` | `codex-review-loop` |
| 성격 | **패턴 카탈로그** — 반복 P0/P1 결함 10종(`### 1.`~`### 10.`) + `## 대응 워크플로우` 1절 | **7-Step 실행 루프** — fetch → severity → fix → commit → 재리뷰 + 릴리즈 특수 처리 · orphan 감지 |
| 겹침 | H2 측정: 공통줄 30 / fin 87 = **34.5%** (당시 값) — 실질 겹침은 severity 판단 1절 | |

`description` 원문은 산출물 §3 참조.

### Q41-4. 후보 이름 판정 (E = 정확 일치 · S = 부분 문자열)

| 후보 | E | S | 판정 |
|---|---:|---|---|
| `codex-liaison-patterns` | **0** | **fit agent `codex-liaison`** | **회피 권고.** 005 가 든 "불가"는 **접두 중복(S)** 근거이고 **정확 일치는 0**이다 — 판정 기준(E vs S)이 005 에 명시돼 있지 않다 |
| `pleiades-codex-loop` | 0 | 없음 | **가능 — 최우선** (소유 저장소가 이름에 드러남) |
| `bot-review-response` | 0 | 없음 | 가능 |
| `review-bot-playbook` | 0 | 없음 | 가능 |

**접두 규약 (실측 관찰).** pleiades skill 8개 중 `pleiades-*` 는 **3개(37.5%)** 이고 **세션 생애주기 스킬에만** 붙는다
(`pleiades-handoff`·`pleiades-orchestrator`·`pleiades-resume`). 나머지 5개와 agent 4개는 전부 **무접두 `<명사>-<명사/행위자>`**.
→ *"pleiades 스킬은 `pleiades-*`"* 는 규약이 아니라 **세션 스킬 표지**다.

**못 잰 값 (의도적 미측정):**
- Claude Code 가 skill 이름 충돌 시 **디렉터리명과 frontmatter `name` 중 무엇을 기준으로** 삼는지 — 본 측정에서 **둘이 100% 일치**하므로 이 저장소들에서는 결과가 같다. 구분이 필요한 사례 자체가 없다
- **skill 충돌 런타임 동작**(rule 처럼 공존 vs agent 처럼 조용한 드롭) — Q41-2 때문에 H-1 과 무관하게 이미 필요조건. 별건 등재 권고

---

## #32 I1 — 테스트 타입체크 게이트 실측 (2026-09-09)

이슈 #37 Phase 1 실측 B. 산출물 `_workspace/1a-1-prep/01_surveyor_i1.md`.
**대상은 pleiades `packages/notify` 뿐이다** — 두 대상 저장소 무접촉(모드 무관).
측정은 전부 **스크래치패드 사본**(`…/scratchpad/i1/root/`, 루트 `package.json` + `packages/notify/` 를
위임형 구조 그대로 복사)에서 했다. 원본 `packages/notify`·`package-lock.json`·루트 `node_modules` **쓰기 0건**.

환경 node **v20.18.0** / npm **10.8.2** / tsc **5.9.3** / vitest **4.1.11**(`^4.1.8` 해석 · `packages/notify/package-lock.json`) / darwin 25.6.0
— 1a-0(E5·E6, 위 2026-09-08 절)과 동일 환경.

### 1. 현행 게이트 재현 — 세 개가 전부 통과한다

주입: 사본 `src/index.test.ts` 말미에 `const bad: number = VERSION;`

| 명령 (사본 `packages/notify/`) | 주입 전 | **주입 후** | 판정 |
|---|---|---|---|
| `npx tsc --noEmit -p .` | 0 | **0** | 못 잡음 — 테스트가 `exclude` |
| `npx tsc -p .` (= `prepare`) | 0 | **0** | **정상** (안전 조건이 의도대로 동작) |
| `npx vitest run` | 0 | **0** | 못 잡음 — transpile-only |

루트 스크립트도 동일: `npm run typecheck`=0 · `npm test`=0 · `npm run build`=0. **#32 I1 서술은 그대로 재현된다.**

### 2. ⚠ 가정을 뒤집는 값 6건

| # | 값 |
|---|---|
| **F1** | **`vitest --typecheck` 는 기본값으로 `.test.ts` 를 보지 않는다.** vitest 4.1.11 기본 include = `**/*.{test,spec}-d.?(c\|m)[jt]s?(x)` (`node_modules/vitest/dist/chunks/defaults.9aQKnqFk.js:73-77`). 설정 없이 `npx vitest run --typecheck` → **exit 0 · `Type Errors no errors`** |
| **F2** | **`typecheck.include: ['**/*.test.ts']` 를 넣어도 안 잡힌다** — base `tsconfig.json` 의 `exclude`(손대면 안 되는 안전 조건)가 tsc 프로그램에서 테스트를 뺀다. `npx tsc -p . --showConfig` → `files: ["./src/index.ts"]`. `typecheck.tsconfig: './tsconfig.test.json'` 을 **함께** 줘야 exit 1 로 잡는다. → **(a) = (b) + 10줄. 배타적 선택지가 아니다** |
| **F3** | **`vitest.config.ts` 는 로드 자체가 실패한다** — `ERR_REQUIRE_ESM` (`vitest/dist/config.cjs:4` → `std-env/dist/index.mjs`). `packages/notify` 에 `"type":"module"` 이 없고 node v20.18.0 에 `require(esm)` 이 없다. **`.mts` 확장자 필수.** `"type":"module"` 추가는 불가 — `dist` 가 `module:"commonjs"` |
| **F4** | **두 안 모두 `@types/node` devDep 이 선결.** 현재 `packages/notify` devDeps 는 `vitest` 1개뿐인데, `exclude` 를 푸는 순간 기존 `build-config.test.ts` 가 TS2307×2 + TS2304×1 을 먼저 낸다(`node:fs`·`node:path`·`__dirname`). 기본 설치는 **`^26.5.0`** 이 들어온다 — 런타임 v20 에 맞추려면 **`^20` 핀**(해석 20.19.43) |
| **F5** | **`"noEmit": true` 를 `tsconfig.test.json` 파일 안에 박지 않으면** 누가 플래그 없이 `tsc -p tsconfig.test.json` 을 돌렸을 때 **테스트가 `dist/` 로 산출된다**(실측 6파일: `index.test.js`·`build-config.test.js`·`.d.ts` 등). 루트 `files` 가 `packages/notify/dist` 라 **소비자 tarball 로 나간다.** 파일에 박으면 `dist` 미생성 |
| **F6** | **vitest 4.1.11 은 타입 오류를 잡고도 요약줄에 `Type Errors  no errors` 를 찍는다.** 실패는 `Failed Suites` 로 보고. **exit code 는 정확(1)** — 요약줄을 읽으면 오판한다 |

### 3. 최소 설정 원문

`packages/notify/tsconfig.test.json` — **5줄** ((a)·(b) 공용):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "exclude": []
}
```
(`include` 는 `extends` 로 상속되므로 불필요 — 4줄판도 검출은 되나 F5 위험.)

`packages/notify/vitest.config.mts` — **10줄** ((a) 만):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    typecheck: {
      include: ['**/*.test.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
});
```

`packages/notify/package.json` devDependencies **+1줄** `"@types/node": "^20"` (양 안 공통) → `packages/notify/package-lock.json` **+18줄**(`@types/node` + `undici-types`, 2 packages, 2.3 M).

### 4. 소요 (각 3회 · 중앙값 · warm)

**사본 루트 npm 스크립트** (실제 8절 검증 형태)

| 게이트 | 3회 (s) | **중앙값** | 현행 대비 |
|---|---|---|---|
| 현행 `npm run typecheck` | 0.618/0.563/0.565 | **0.565** | — |
| 현행 `npm test` | 0.651/0.628/0.603 | **0.628** | — |
| 현행 `npm run build` | 0.563/0.585/0.568 | **0.568** | — |
| **(b)** `npm run typecheck:test` | 0.639/0.610/0.620 | **0.620** | **+0.620** |
| **(a)** `npm run test:types` | 1.085/1.030/1.041 | **1.041** | `npm test` 대체 시 **+0.413** · 추가 시 **+1.041** |

**패키지 디렉터리 직접** (npm 오버헤드 제외)

| 명령 | 3회 (s) | 중앙값 |
|---|---|---|
| `npx vitest run` | 0.600/0.575/0.575 | 0.575 |
| `npx vitest run --typecheck` | 1.114/1.025/1.039 | **1.039** (내부 계측 `typecheck 304~534 ms`) |
| `npx tsc --noEmit -p .` | 0.661/0.661/0.657 | 0.661 |
| `npx tsc --noEmit -p tsconfig.test.json` | 0.724/0.734/0.731 | **0.731** |
| (참고) `npx tsc --noEmit -p . --types` | 0.332/0.315/0.321 | 0.321 |

> **`@types/node` 도입 자체가 기존 `npm run typecheck` 를 약 +0.34 s 늘린다** (tsc 자동 @types 포함).
> 위 0.565/0.661 은 이미 그것을 포함한 값이고, 현행 원본(= `@types/node` 없음)은 0.321 s 쪽이다.

**(c) 둘 다** = **+1.661 s** (tsc 가 사실상 2회). **(c) 가 (a)·(b) 보다 더 잡는 오류는 이번 범위에서 0건.**
**(d)** = 0 s · 0 파일, 대신 §1 세 행이 그대로 남는다.

### 5. 소비자 계약 무영향 — 3중 확인 + end-to-end

| 확인 | 명령 | 결과 |
|---|---|---|
| `prepare` 가 `tsconfig.test.json` 을 읽는가 | 그 파일을 **고의 파손**(`{ THIS IS NOT JSON`) 후 `npx tsc -p .` | **exit 0** — 읽지 않는다 (대조군 `tsc -p tsconfig.test.json` 은 exit 2) |
| `tsc -p .` 해석 결과 | `npx tsc -p . --showConfig` | `files: ["./src/index.ts"]` · `exclude` 4패턴 유지 · `tsconfig.test.json` 흔적 0 |
| tarball | 사본 루트 `npm pack --dry-run` | **4파일** — `package.json` · `packages/notify/dist/index.{js,d.ts}` · `packages/notify/package.json`. `tsconfig*`·`vitest.config.mts`·`src` 미포함 (1a-0 E6 의 5파일과 차이는 `README.md` — 사본에 없음) |

**소비자 end-to-end** — (a)+(b) 적용본을 커밋(`21de95f`)해 `git+file://…#21de95f` 로 설치:

| 항목 | 값 |
|---|---|
| `npm install` exit | **0** — 임시 클론 `prepare` 정상 |
| 설치 트리 | `package.json` · `packages/notify/dist/` · `packages/notify/package.json` (1a-0 E4 와 동일) |
| `@types/node` · `vitest` 누수 | **0 · 0** (`node_modules/@types` 자체가 없다) |
| `require('@pleiades/notify').VERSION` | `0.0.0` |
| `npm ci` 3회 | 1.65/1.55/1.51 s → 중앙값 **1.55 s** · 설치 크기 16 K |

> `npm ci` 는 1a-0 E4 의 2.13/2.18/2.35(중앙값 2.18) 보다 빠르나 **다른 세션·캐시 상태라 통제된 비교가 아니다.**
> 말할 수 있는 것은 **"증가가 관측되지 않았다"** 까지다.

**`build-config.test.ts` 단언은 (b) 에 걸리지 않는다** — 그 테스트는 `../tsconfig.json` 을 읽고, (b) 는 별도 파일에서
`exclude: []` 를 쓴다. (a)+(b) 적용 후 `npx vitest run` = `3 passed (3)`.
> 다만 **그 M2 단언이 곧 F2 의 원인**이다 — base `exclude` 를 고정하고 있어 두 안 모두 두 번째 tsconfig 없이는 성립하지 않는다.
> 어느 안을 골라도 `build-config.test.ts` 는 그대로 둔다(지우면 `prepare` 안전 조건이 풀린다).

### 6. `workflow.md` 8절 pleiades 행 — 안별 1줄

| 안 | 8절 변경 | 추가 스크립트(루트) |
|---|---|---|
| **(a)** | **테스트** 칸 `npm test` → `npm test` + `npm run test:types` (또는 `packages/notify` 의 `test` 를 `vitest run --typecheck` 로 → 칸 표기 무변경) | `"test:types": "npm --prefix packages/notify run test -- --typecheck"` |
| **(b)** | **타입** 칸 `npm run typecheck` → `npm run typecheck && npm run typecheck:test` (또는 `typecheck` 를 두 tsc 의 `&&` 로 합쳐 칸 무변경) | `"typecheck:test": "tsc --noEmit -p packages/notify/tsconfig.test.json"` |
| **(c)** | 위 두 줄 모두 | 위 두 스크립트 모두 |
| **(d)** | 없음 | 없음 |

선행 조건 `npm --prefix packages/notify install` 은 그대로 필요(`vitest` + `@types/node` 둘 다 서브 devDep).
`npm test -- --typecheck` 인자 전달은 동작 확인(clean 0 · 주입 1).

### 7. 되돌리기

| 안 | 등급 | 행위 | 규모 |
|---|---|---|---|
| (a) | **즉시** | `vitest.config.mts`·`tsconfig.test.json` 삭제 · 루트 `test:types` 1줄 · `@types/node` 1줄 삭제 · 서브 `npm install` | 삭제 2파일(15줄) · 수정 2파일(−2줄) · lockfile −18줄 |
| (b) | **즉시** | `tsconfig.test.json` 삭제 · 루트 `typecheck:test` 1줄 · `@types/node` 1줄 삭제 · 서브 `npm install` | 삭제 1파일(5줄) · 수정 2파일(−2줄) · lockfile −18줄 |
| (c) | **즉시** | (a) + 스크립트 1줄 더 | 삭제 2파일(15줄) · 수정 2파일(−3줄) · lockfile −18줄 |
| (d) | — | 해당 없음 | — |

**되돌릴 수 없는 것: 없다.** 세 안 모두 `files`·`exports`·`dist` 계약 무변경(§5).
단 `@types/node` 되돌리기는 **1a-1 테스트가 이미 `node:*` 를 쓰면 `build-config.test.ts` 가 다시 깨진다** —
"게이트 도입 이전 상태로" 만 즉시다.

### 8. 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| node 22.12+ 에서 F3 재현 여부 | 로컬 node 는 v20.18.0 하나. 22.12+ 는 `require(esm)` 기본 활성이라 **재현되지 않을 수 있다.** 서버 node 버전은 Q45 미측정 |
| 1a-1 실테스트 유입 후 소요 | 그 코드가 없다. 위 값은 **테스트 2파일 3케이스** 기준 — 하한 |
| `grammy` peerDep 이 `exclude: []` 경로에서 TS2583 을 내는지 | grammy 미설치. base 의 `skipLibCheck: true` 를 상속한다는 것까지만 확인 |
| GitHub 원격(`git+https`) 소비자 설치 | 이번도 `git+file://` — 1a-0 과 동일한 한계 |
| `@types/node@^20` vs `^26` 의 실제 API 표면 차이 | 범위 밖. 게이트 통과 여부(둘 다 0)만 쟀다 |

---

# Q10·Q19 정적 근거 (2026-09-09)

**맥락:** 이슈 #37 Phase 1 실측 C. 003 §10 Q10(fit 절단→분할 + plain 폴백 정본) · Q19(`lastError` raw 노출)를
**실서비스 DB 읽기(Q14, 미승인) 없이 정적으로 좁힐 수 있는 만큼 좁힌다.**
산출물 초안: `_workspace/1a-1-prep/01_surveyor_q10_q19.md`.

**측정 대상 (모드 I — 통합 로드맵용이므로 worktree):**

| 저장소 | 경로 | ref | 측정 시점 HEAD | 워킹트리 |
|---|---|---|---|---|
| myFinance | `~/workspace/pleiades/repos/myFinance` | `integration/pleiades` | `654215240cb3ddfa4c9bf0db3181c86642fee985` | clean |
| myFitness | `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` | `626a2016b30b9b79bc89ae7fb8080ea4d6187cbb` | clean |

`grammy` 소스만 워킹트리 전용(`node_modules/`)이라 ref 지정 불가 — 위 ref 가 체크아웃·clean 임을 확인 후 읽었다 (v1.44.0).

## C-1. 절단·분할·폴백은 로그를 남기지 않는다 — 로그 기반 사후 계량 경로 부재

```bash
for f in ~/workspace/pleiades/repos/myFinance/src/bot/utils/telegram.ts \
         ~/workspace/pleiades/repos/myFinance/src/bot/utils/formatter.ts \
         ~/workspace/pleiades/repos/myFitness/src/bot/notifications/send.ts \
         ~/workspace/pleiades/repos/myFitness/src/bot/utils/telegram.ts; do
  echo "--- $f"; grep -n --binary-files=text 'console\.' "$f"; done
```

| 지점 | 파일:줄 | 로그 |
|---|---|---|
| fit 절단 | `myFitness send.ts:35-37` `truncate` | **없음** |
| fit plain 폴백 | `myFitness send.ts:56-62` | **없음** |
| fin 분할 | `myFinance formatter.ts:52-78` `splitMessage` | **없음** (파일 전체 `console.` 0건) |
| fin plain 폴백 | `myFinance telegram.ts:43-48`·`:66-71` | **없음** |

로그가 나오는 곳은 **재시도**(`fin telegram.ts:113` · `fit send.ts:68`)와 **전송 실패**(`fit send.ts:87`·`:118`)뿐이다.

→ **"서버 로그로 4096 초과·폴백 빈도를 사후 계량한다"는 경로는 현재 코드에 존재하지 않는다.**
계량하려면 계측 코드를 먼저 넣어야 하고, 그것은 두 실서비스 저장소에 대한 쓰기·배포다.
799행·1430행 "못 잰 값"의 *"운영 로그 필요"* 는 **"운영 로그에 그 정보가 없다"** 로 정정한다.

> **정정 (2026-09-09 재측정).** 557행 *"4096자 초과가 실제로 몇 번 발생하는지 → 운영 로그 필요"* 는
> 로그만 확보하면 알 수 있다는 뜻으로 읽힌다. **로그에 기록 자체가 없다.** 남은 경로는
> (a) 계측 코드 추가 후 대기, (b) DB 조회(Q14) 둘뿐이다.

## C-2. fit 아웃바운드 6 호출 중 4096 초과 가능한 것은 1개뿐

measured-facts 2346행의 **4 모듈 / 6 호출**을 본문 생성부로 분류했다.

| # | 호출 | 본문 생성 | 분류 | 정적 상한 |
|---|---|---|---|---|
| 1 | `scheduler.ts:34` | `lib/daily-report.ts:99 askAdvisor(prompt, …)` | **LLM** | **없음** |
| 2 | `scheduler.ts:59` | `formatUserFriendlyError` (`lib/monitoring/admin-alerts.ts:137-153`) | 정적 문자열 6종 | ~60자 + 라벨 |
| 3 | `auto-adjust.ts:395` | `formatAutoAdjustMessage` (`auto-adjust.ts:166-233`) | 템플릿 | 유한 필드 (하드 상한 없음 ↓) |
| 4 | `auto-adjust.ts:455` | `formatUserFriendlyError` | 정적 문자열 6종 | ~60자 |
| 5 | `auto-adjust-cron.ts:78` | 템플릿 (`auto-adjust-cron.ts:35-51`) | 템플릿 | 〃 |
| 6 | `admin-alerts.ts:232` | `buildMessage` 3벌 (`:274`·`:295`·`:317`) | 템플릿 | **≈200자 + 고정 6~7줄** (`errSnippet = errMsg.slice(0, 200)`, `admin-alerts.ts:190`) |

**LLM 경로의 상한:**
```bash
git -C <repo> grep -n --text 'max_tokens\|maxTokens\|max_output_tokens' integration/pleiades -- 'src'
git -C <repo> grep -n --text -iE '자 이내|글자|이내로|짧게|간결|characters|줄 이내|줄로' \
  integration/pleiades -- 'src/lib/ai' 'src/bot/notifications' 'src/bot/commands' | cut -d: -f2-
```

| 항목 | myFitness | myFinance |
|---|---|---|
| `max_tokens`/`maxTokens`/`max_output_tokens` | **0건** | **0건** |
| 프롬프트 **문자 수** 지시 | 0건 | 0건 |
| 프롬프트 **줄 수** 지시 | 0건 (`lib/ai/system-prompt.ts:121` `- 간결하게 핵심만` 정성 문구뿐) | 2건 (`active-review.ts:69` `총 6~8줄` · `ta-signal-alert.ts:302` `1~2줄 가이드`) |

→ **LLM 출력 길이의 정적 상한은 없다.** 템플릿 3·5 도 `intervalDesc`·`zone`·`label`·`detail` 이
Prisma `String?` 이고 `@db.VarChar` 제약 **0건**(`myFitness prisma/schema.prisma:317,344,351`)이라
하드 상한은 유도되지 않는다 — 다만 필드 수가 유한하고 짧은 라벨이라 4096 도달은 이상값에서만 가능하다.
`rationale` 은 LLM 이 아니라 **규칙 생성**이다 (`lib/training/workout-recommender.ts:169-191 rationaleFor`).

**절단 방식:** `myFitness send.ts:35-37` = `text.slice(0, MAX_MSG - 3) + "..."` — 하드 슬라이스 + 말줄임.
적용 3곳(`:44` html · `:45` plain · `:104` 키보드). `:44` 는 **HTML 을 먼저 자르므로** 경계가 태그 중간이면
파싱 실패 → 폴백을 유발한다(`:45` 의 plain 은 태그를 벗긴 뒤 자른다).

**Q14 가 열릴 때의 최소 질의 (정적으로 좁힌 결과).** 길이 분포가 필요한 대상은 `scheduler.ts:34` 하나이고
그 원문은 이미 fit DB 에 있다 — `lib/daily-report.ts:109-114` 가 `prisma.aIAdvice.create({ data: { …, response: result } })`
(`prisma/schema.prisma:228-238 model AIAdvice`, `deleteMany` 후 create 이라 `(category, reportDate)` 당 1행).
→ **단일 테이블·단일 컬럼 길이 집계 하나면 충분하다.** chat id·개인 식별자 불필요.
단 전송본은 `` `${emoji} <b>${label}</b>\n\n${mdToHtml(report)}` ``(`scheduler.ts:33`)이라 `length(response)` 는 **하한**이다.

## C-3. plain 폴백 — 라이브 구현은 둘 다 "엔티티를 디코드하지 않는다"

```bash
git -C <repo> grep -n --text 'replace(/<\[\^>\]' integration/pleiades -- 'src' | cut -d: -f2-
git -C ~/workspace/pleiades/repos/myFinance grep -n --text 'stripHtml' integration/pleiades -- 'src' | cut -d: -f2-
```

| 구현 | 태그 제거 | 엔티티 디코드 | 라이브 |
|---|---|---|---|
| fin `bot/utils/telegram.ts:44`(inbound)·`:67`(**outbound**) | `/<[^>]+>/g` | ✕ | **○** |
| fit `bot/notifications/send.ts:45`(**outbound**) · `bot/utils/telegram.ts:33`(inbound) | `/<[^>]*>/g` | ✕ | **○** |
| fin `bot/utils/markdown.ts:97-103` `stripHtml` | `/<[^>]*>/g` | **○** | **✕ — importer 0** |

> **정정 (2026-09-09 재측정) — 003 §3-1(562-567행)의 대비 구도.**
> ① 003 이 든 두 구현은 **둘 다 myFinance 파일**이다. myFitness 에는 `src/bot/utils/markdown.ts` 가
> **존재하지 않는다** (`myFitness/src/bot/utils/` = `error.ts`·`formatter.ts`·`telegram.ts`).
> ② `myFinance markdown.ts:97 stripHtml` 은 **import 0건 — 죽은 export** 다. `utils/markdown` 을 import 하는
> 6곳(`commands/ai.ts:13`·`commands/briefing.ts:5`·`notifications/active-review.ts:12`·`notifications/briefing.ts:10`·
> `notifications/monthly-report.ts:9`·`notifications/ta-signal-alert.ts:13`)은 **전부 `markdownToTelegramHtml`** 만
> 가져간다. src 전체의 `import … stripHtml` 1건은 **동명의 다른 함수**다(`app/alerts/history/client-utils.ts:27`, 자체 정의).
> → 003 의 *"어느 쪽을 고르든 **한쪽 저장소의** 폴백 출력이 관측 가능하게 바뀐다"* 는 **불성립**한다. 정확한 서술은 C-4 다.
> **라이브 두 구현의 실제 차이는 정규식 수량자(`+` vs `*`)뿐**이고, 차이가 나는 입력은 리터럴 `<>` 하나다.

**폴백 트리거 (참고, 484·516행 기록 보완):** fin 은 로컬 `isParseError`(`telegram.ts:79-88` —
`error_code===400` **또는** `message.includes("can't parse")`), fit 은 공유 `isHtmlParseError`.
**양쪽 다 폴백 발생 로그 0** (C-1).

## C-4. 엔티티 생성 지점 — fit 아웃바운드 폴백이 보는 엔티티는 0건

```bash
git -C <repo> grep -n --text '\bescapeHtml(' integration/pleiades -- 'src' \
  | cut -d: -f2- | grep -v '__tests__' | grep -v 'export function escapeHtml' | wc -l
git -C ~/workspace/pleiades/repos/myFinance grep -l --text '\bescapeHtml(\|markdownToTelegramHtml' \
  integration/pleiades -- 'src/bot/notifications' | cut -d: -f2- | sort -u
```

| | myFinance | myFitness |
|---|---|---|
| `escapeHtml(` 호출 줄 / 파일 (정의·테스트 제외) | **87 / 23** | **16 / 2** |
| 그중 아웃바운드(`src/bot/notifications`) 줄 | **18** | 16 |
| md→HTML 변환기가 엔티티를 만드나 | **○** — `markdownToTelegramHtml` (`bot/utils/markdown.ts:59-61` `&`→`&amp;` 등) | **✕** — `mdToHtml` (`bot/utils/telegram.ts:6-15`, 태그 생성만) |
| 엔티티를 만드는 **아웃바운드 모듈** | **11** | 2 |
| **그중 plain 폴백 경로에 도달하는 모듈** | **11** | **0** |

fin 11개 모듈 열거: `active-review` · `alert-dispatcher` · `briefing` · `budget-alert` · `custom-strategy-alert` ·
`monthly-report` · `monthly` · `price-alert` · `quarterly` · `rsu` · `ta-signal-alert` (`src/bot/notifications/*.ts`).

**fit 이 0 인 이유 (경로 추적).** fit 의 엔티티 생성 16줄은 전부 `auto-adjust.ts`·`auto-adjust-cron.ts` 이고,
둘의 전송은 **`sendToAllWithKeyboard`**(`auto-adjust-cron.ts:78` · `auto-adjust.ts:395`) — **HTML 폴백이 없는 함수**다
(`send.ts:98` 주석 *"HTML fallback 없음"*, 본문 `:104-121` 에 폴백 분기 부재 — 384행 기능 매트릭스와 일치).
폴백이 있는 `sendToAll` 로 가는 4개 호출의 본문은 전부 엔티티를 만들지 않는다:
`scheduler.ts:34`(`mdToHtml`, 미이스케이프) · `scheduler.ts:59`·`auto-adjust.ts:455`(정적 문자열 6종) ·
`admin-alerts.ts:232`(`<b>`/`<code>` 직타 + **미이스케이프** `errSnippet`).

→ **Q10 의 plain 절반 판정: 태그-only 를 정본으로 고르면 두 저장소 모두 동작 변경 0.
엔티티 디코드를 고르면 myFinance 만 바뀌고(11 모듈) myFitness 는 0 이다.**
"양쪽 저장소 절충"이 아니라 **fin 한쪽의 개선을 넣을지 말지**의 단방향 결정이다.

## C-5. Q19 — `lastError` 쓰기 4줄 · 읽기 **5 표면**

```bash
git -C ~/workspace/pleiades/repos/myFinance grep -n --text 'lastError' integration/pleiades -- 'src' | cut -d: -f2- | grep -v '__tests__'
git -C ~/workspace/pleiades/repos/myFinance grep -n --text 'errorMessage' integration/pleiades -- 'src' | cut -d: -f2- | grep -v '__tests__'
```

**쓰기 4곳** (전부 `error instanceof Error ? error.message : String(error)`):
`alert-dispatcher.ts:127` · `custom-strategy-alert.ts:295` · `price-alert.ts:343` · `ta-signal-alert.ts:337`.

> **정정 (2026-09-09 재측정).** 1379~1381행 M3 표 C 행의 행번호(`:126`·`:294`·`:342`·`:336`)는 **`catch` 줄**이고
> **대입 줄은 각각 +1** 이다. 결론은 바뀌지 않지만 **1a-4 가 편집할 줄은 위 4개**다.

**읽기 5 표면** (발견 20 의 4 표면 + retry API):

| 표면 | 위치 |
|---|---|
| DB 쓰기 | `bot/notifications/alert-history.ts:63,76` → `prisma/schema.prisma:344 errorMessage String?` |
| API (history) | `app/api/alerts/history/route.ts:77` |
| 화면 1 | `app/alerts/history/AlertHistoryClient.tsx:448-449` |
| 화면 2 | `components/alerts/AlertHistoryDetailModal.tsx:101-103` |
| CSV | `app/api/alerts/history/export/csv-format.ts:19,131,146` |
| **API (retry) — DB 미경유 직접 반환** | `app/api/alerts/history/[id]/retry/route.ts:82` |

→ 발견 20 의 "DB → UI → CSV" 3단 서술에 **API 계약 1개가 더 있다** (M1-B 1321행은 이미 *"DB + API 계약"* 으로 적었다).

## C-6. Q19 위험 판정 — 비밀 노출이 아니라 형식 위반

**grammY 1.44.0** (`repos/myFinance/node_modules/grammy`, `out/core/error.js`) — message 조립부:

- `GrammyError` (`:19-36`, `:38-48`): `super(\`${message} (${err.error_code}: ${err.description})\`)`,
  `toGrammyError` 가 `message = \`Call to '${method}' failed!\``.
  → **메서드명·에러코드·텔레그램 description 만.** 호출 payload(`chat_id`, `text`)는 **`this.payload` 프로퍼티**에만 있고
  message 에 직렬화되지 않는다. **봇 토큰 없음, chat id 없음.**
- `HttpError` (`:62-70`, `toHttpError` `:76-82`):
  `msg = \`Network request for '${method}' failed!\`` (+ status/statusText) **+ `sensitiveLogs` 일 때만 `err.message`**
  ← 토큰이 들어올 수 있는 **유일한 경로**.

| `sensitiveLogs` | 값 | 근거 |
|---|---|---|
| grammY 기본값 | **`false`** | `out/core/client.js:82` (`options.sensitiveLogs ?? false`) |
| myFinance | **미설정** | `src/bot/index.ts:39-44` (`client: { baseFetchConfig, timeoutSeconds }`), `grep sensitiveLogs src` → 0건 |
| myFitness | **미설정** | `src/bot/index.ts:36-41` (동형), `grep` → 0건 |

또한 chat id·토큰을 메시지에 넣어 던지는 코드는 fin src 전체 **0건**
(백틱 템플릿 리터럴 안에 `chatId`/`token` 보간을 넣어 `new Error(...)` 를 던지는 패턴 → 빈 결과).

→ **판정: 현행 유지(raw)는 `CLAUDE.md` 컨벤션(형식) 위반이지, 실측 가능한 비밀 노출 경로가 아니다.**
남는 실질 노출은 텔레그램 description 원문과 비-grammY 예외(Prisma 등) message 가 웹 UI·CSV 에 그대로 뜨는 것.
**단서:** 이 판정은 `sensitiveLogs` 가 꺼져 있다는 사실에 전적으로 의존한다. 누가 켜면
`HttpError.message` 에 `…/bot<TOKEN>/…` URL 이 붙고 **`lastError` 는 마스킹하지 않으므로** 즉시 노출 경로가 된다.

**⚠ `sanitizeError` 는 축소가 아니라 확장이다** (`myFinance src/bot/utils/error.ts:8,19-53`).
마스킹 대상은 정규식 **하나뿐**: `TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g`. chat id·URL·개인정보는 대상이 아니다.
그리고 `.error ?? .cause` 를 **깊이 5까지 순회해 `' | '` 로 join** 한다:

| 에러 유형 | raw `error.message` | `sanitizeError(error)` | 차이 |
|---|---|---|---|
| `GrammyError` | `Call to 'sendMessage' failed! (400: Bad Request: …)` | `GrammyError: Call to … (400: …)` | **`"GrammyError: "` 접두만** (`.error`/`.cause` 없음) |
| `HttpError` | `Network request for 'sendMessage' failed!` | `HttpError: Network request … \| <inner name>: <inner message>` | **내부 fetch 에러 추가 — 정보 증가** |

→ *"sanitize 로 통일하면 안전해진다"* 는 **틀린 독법**이다. 토큰이 없는 현 상황에서 마스킹은 사실상 no-op 이고,
실제 효과는 **이름 접두 추가 + HttpError 내부 체인 노출** — **UI·CSV 문자열이 더 길고 더 기술적으로 바뀐다.**
(안전 이득은 `sensitiveLogs` 를 켰을 때의 방어로서만 존재한다.)

## C-7. Q19 두 설계의 호출부 변경 지점 (정적 열거)

| 설계 | `deliveries[].error` | **호출부 변경 지점** | 관측 변경 |
|---|---|---|---|
| **A. 파사드가 sanitize** | sanitized | **0** (4곳이 그대로 파생) | **5 표면 전부** — 문자열이 C-6 표대로 바뀐다 |
| **B. raw 유지 + 호출부가 sanitize** | raw | **4** — `alert-dispatcher.ts:127`·`custom-strategy-alert.ts:295`·`price-alert.ts:343`·`ta-signal-alert.ts:337` | **A 와 동일** (지점만 늘어난다) |
| **C. raw 유지 · sanitize 안 함 (현행 보존)** | raw | **0** | **없음** |

**A 와 B 는 결과가 같다** — 둘 다 5 표면의 문자열을 바꾼다. **관측 변경을 피하는 유일한 안은 C** 이고,
C 는 컨벤션 위반을 존치한다. C-6 판정(비밀 노출 경로 미발견)을 받아들이면 **C 의 실질 위험은 형식 위반에 그친다.**
참고로 파사드가 루프를 흡수하면 `console.error` 로그 17종과 `sanitizeError` 적용 불일치(12 raw / 5 sanitized, M3)도
함께 통일되며 그 12곳 중 4곳이 위 지점과 겹친다 — 로그는 DB·UI 표면이 아니라 위 표에서 분리해 세었다.

> **정정 (2026-09-09 · 이슈 #37 · 감사 1회차 정정 1) — *"A 와 B 는 결과가 같다"* 는 조건부다.**
> 위 문단 원문: *"**A 와 B 는 결과가 같다** — 둘 다 5 표면의 문자열을 바꾼다. **관측 변경을 피하는 유일한 안은 C** 이고,"*
> **같아지는 것은 Q26 ②(`onError`)를 함께 고른 조합에서만**이다.
> `sanitizeError` 는 **객체를 받아** `.error ?? .cause` 를 깊이 5까지 순회해 `' | '` 로 join 하고 `${name}: ` 접두를 붙이므로
> (`repos/myFinance/src/bot/utils/error.ts:27-52`), **포트가 주는 문자열에서는 재계산할 수 없다.**
> ∴ **Q26 ①·③ 에서 B 는 성립하지 않고**, 호출부가 쓸 수 있는 것은 `sanitizeMessage`(`:19-21` · `TOKEN_RE` 치환 1개)뿐인 **축퇴형 B′** 이며
> **그 문자열은 A 와도 C 와도 다르다**(토큰이 있을 때만 C 와 갈린다).
> 그리고 *"관측 변경을 피하는 유일한 안은 C"* 도 한정이 필요하다 —
> **무조건 0 은 C 뿐 · B′ 는 현 상황(마스킹 대상 0건 — C-6)에서만 0 이고 `sensitiveLogs` 를 켜는 순간 갈린다. 포트를 건드리지 않는 것은 C·B′ 둘 다.**
> **확정 (사용자 2026-09-09 · #37): Q26 ①(`label` 만) + Q19 C(포트 raw)** — 003 §4-2 · §10 참조. **B 는 닫혔다.**

## 못 잰 값 (이 절 범위)

| 항목 | 왜 못 쟀나 |
|---|---|
| 아웃바운드 메시지 **실제 길이 분포** | DB 조회 필요 (Q14). **로그 우회 경로는 존재하지 않음이 확인됐다**(C-1). fit 은 `AIAdvice.response` 단일 컬럼 집계면 충분한 데까지 좁혔다 (C-2) |
| 4096 초과 **발생 빈도**(fit 절단 손실량) | 위와 동일 + 절단 로그 0 |
| **plain 폴백 발동 빈도** | 폴백 로그 0 (C-1). 코드 계측 없이는 불가 |
| `AlertHistory.errorMessage` **현재 문자열 분포** | 실서비스 DB 조회 필요 (Q14). C-6 은 *어떻게 바뀌는지*를 정적으로 유도했을 뿐 *지금 무엇이 들어 있는지*는 모른다 |
| 텔레그램 `description` 원문이 담는 값 | 런타임 응답. grammY 가 그대로 전달한다는 것만 확인 |

---

## #37 감사 실측 (2026-09-09)

> **출처.** 이슈 #37 · `_workspace/1a-1-prep/03_auditor_1a1prep.md` 2회차 B-12.
> 초안(`02_writer_1a1prep.md`)이 **대장에 없는 숫자 6개**를 본문에서 만들었다는 정정에 따라,
> 그 값들을 **측정 명령과 함께 여기로 옮기고 초안은 이 절을 인용**한다 (005 R1 — *"대장에 없는 숫자를 본문에 새로 만들지 않는다"*).
> **파생값 `66.7%` 는 기록하지 않는다** — 열거 `78/117` 이 정본이다.
> 아래 값은 **2026-09-09 에 다시 돌려 확인**했다(감사 2회차 값과 전부 일치).

### A. 003 §4-2 의 정정 블록 비중 — 산출물 형태 3안의 근거

| 값 | 측정 | 명령 |
|---|---:|---|
| §4-2 총 행수 | **117** | `sed -n '597,713p' docs/specs/003-notify-package.md \| wc -l` |
| 그중 정정 블록 | **78** (636~713) | `sed -n '636,713p' docs/specs/003-notify-package.md \| wc -l` |
| 정정 블록 **개수** | **5** | `awk 'NR>=597 && NR<=713 && /^> \*\*정정/ {print NR}' docs/specs/003-notify-package.md` |

**절 경계:** `### 4-2. 시그니처` = **597행** · `### 4-3.` = **714행** → §4-2 = 597~713 (`grep -n '^### 4-' docs/specs/003-notify-package.md`).

**블록 5개의 시작 행 (열거 — 합계를 신뢰하지 않는다):**

| # | 행 | 블록 |
|---|---:|---|
| 1 | **636** | 정정 ① (2026-09-04 · 이슈 #4 · 발견 19) |
| 2 | **645** | 정정 ② (2026-09-04 · 이슈 #4 · 발견 18) — 파사드 표면이 하나 부족하다 |
| 3 | **659** | 정정 (PR #9 Codex P2) — ADMIN 인라인 파싱은 "별건"이 아닐 수 있다 |
| 4 | **668** | 정정 (PR #9 Codex P2) — ②도 `targetCount` 를 남긴다 |
| 5 | **682** | 정정 ③ (2026-09-04 · 이슈 #4 · 발견 20) — 호출부 라벨 자리가 없다 |

> **부수 확인 — 맨 위 코드 블록이 이미 정본이 아니다.** `003:609-611` 의 `interface Notifier` 는
> `notify(route, content)` + `targetCount` **둘뿐**이고, `targets?()` 와 `ctx?: NotifyContext` 는
> **정정 ③ 안의 개정안(`003:691-698`)에만** 있다. `deliveries[].error?: string` 은 `003:617`.
> (`sed -n '600,620p;690,700p' docs/specs/003-notify-package.md`)

### B. 하네스 LOC — N1·N2 의 기준 확인용 (재기준화 아님)

| 대상 | 파일 | LOC | 명령 |
|---|---:|---:|---|
| fin `.claude/` (worktree `integration/pleiades`) | **16** | **1,662** | `find repos/myFinance/.claude -type f \| wc -l` · `find repos/myFinance/.claude -type f -print0 \| xargs -0 cat \| wc -l` |
| fit `.claude/` tracked (worktree `integration/pleiades`) | **17** | **1,774** | `git -C repos/myFitness ls-tree -r --name-only integration/pleiades -- .claude \| wc -l` · 같은 목록을 `git show` 로 이어 `wc -l` |
| fit `.claude/` 원본 (`~/workspace/myFitness`) | **18** | **1,885** | `find ~/workspace/myFitness/.claude -type f \| wc -l` · `… -print0 \| xargs -0 cat \| wc -l` |

**005 §3-1 N1 의 기준은 그대로 성립한다.** N1 = fin **1,629**(`dev` 기준) + fit **1,885**(원본) = **3,514**.
fin 이 1,629 → **1,662** 로 움직인 것은 **집행 결과**(H-3(fin) / myFinance#492 가 `integration/pleiades` 에 전파)이고 측정 오류가 아니다.
→ **N1·N2 는 재기준화하지 않고 측정 시점·기준 라벨만 붙인다** (근거는 초안 §4 각주).

### C. pleiades `.claude/` 현황 — 005 정정 G 의 열거가 stale 하다

| 값 | 측정 | 명령 |
|---|---:|---|
| pleiades skill | **8** | `ls .claude/skills` → `decision-doc` · `dual-repo-change` · **`orphan-check`** · `pleiades-handoff` · `pleiades-orchestrator` · `pleiades-resume` · `repo-measure` · `reversibility-audit` |
| pleiades `.claude/` 파일 | **13** | `find .claude -type f \| wc -l` |

> **`005:427-428` 의 열거는 7개**(`orphan-check` 누락)로 **H-1b(PR #22) 집행 전 값**이다 — 정정 대상.
> **`measured-facts.md:1596`·`:1601`**(H1 표 pleiades 행 · 12파일 / 2,018 LOC)은 **Q41-2 의 "H1 표 대비 변화" 블록이 이미 정정했다** — 인용만 한다.

### D. PR 상태 — `CLAUDE.md:7` 정정용

| PR | 상태 | 명령 |
|---|---|---|
| **#35** (#14 봇 불가 대체 경로) | **MERGED** 2026-09-08T04:55:33Z | `gh pr view 35 --json number,state,mergedAt` |
| **#36** (인계 #34) | **MERGED** 2026-09-08T04:55:07Z | `gh pr view 36 --json number,state,mergedAt` |

`CLAUDE.md:7` 은 여전히 *"**열린 PR: #35**(#14 봇 불가 대체 경로) · 인계 **#34**"* 로 적혀 있다 → **열린 PR 0** 으로 정정.

> **측정 단서.** `cat | wc -l` 은 **개행 수**를 센다 — 마지막 줄에 개행이 없는 파일은 1 적게 세어진다.
> 위 세 LOC 값은 그 정의 아래의 값이고, **005 의 LOC 도 같은 정의**(`wc -l`)라 비교 가능하다.

---

## H-3(fit) 집행 실측 (2026-09-09)

측정 시점: `repos/myFitness` `integration/pleiades` HEAD `626a201` (분기점) · 작업 브랜치 `integration/chore-pleiades-8-fit` · 원본 `~/workspace/myFitness` = `main`, 무접촉.

### 1. #8 결함 표면 — 정정 (H8 · 005 §4-13 대조)

```bash
cd ~/workspace/pleiades/repos/myFitness
W=$(git show integration/pleiades:.claude/rules/workflow.md)
printf '%s\n' "$W" | wc -l                                                                    # 264
printf '%s\n' "$W" | /usr/bin/grep -cE --binary-files=text '\bP[0-3]\b'                       # 29
printf '%s\n' "$W" | /usr/bin/grep -cE --binary-files=text 'P0|P1|P2'                         # 30
printf '%s\n' "$W" | /usr/bin/grep -cE --binary-files=text 'git merge dev|git push origin main|git tag'   # 3 (:35-37)
printf '%s\n' "$W" | /usr/bin/grep -cE --binary-files=text 'P2만'                             # 1 (:262)
printf '%s\n' "$W" | /usr/bin/grep -cE --binary-files=text 'self-review only'                 # 2 (:125,203)
for f in $(git ls-tree -r --name-only integration/pleiades -- .claude CLAUDE.md); do
  n=$(git show integration/pleiades:$f | /usr/bin/grep -cE --binary-files=text '\bP[0-3]\b|git merge dev|git push origin main|P2만|self-review only'); echo "$n	$f"; done | sort -rn
# 34 workflow.md · 8 branch-workflow · 6 codex-review-loop · 2 release-flow · 1 CLAUDE.md · 1 session-handoff · 1 workflow-conductor · 1 codex-liaison · 나머지 0
```

| 값 | 기존 기재 | 실측 | 정정 |
|---|---|---|---|
| fit `workflow.md` P 표기 줄 | **26** (H8 표 아래 문장) | **30** (`P0\|P1\|P2`) / **29** (`\bP[0-3]\b`, `:262` `P2만` 은 한글 인접이라 `\b` 불성립) | H8 정정 |
| fit `workflow.md` #8 대상 줄 | **33** (005 §4-13 "fit 33줄" = P 30 + 릴리즈 3) | **35** = 29 + 릴리즈 3(`:35-37`) + `P2만` 1 + `self-review only` 2 (#8 결함 ⑥ fit 전용 누락) | 005 §4-13 정정 |
| 대상 파일 | (fin 선례 10파일) | **grep 8파일 / 54 hit** + grep 0 인 `agents/release-manager.md`(봇 게이트 부재) + 3-check 4종화로 `skills/myfitness-orchestrator/SKILL.md` = **10파일** | — |
| `.claude`·`CLAUDE.md` 밖 절차성 결함 | — | **0** (`git grep --text -nP` — 히트는 과거 리뷰 기록·Prisma `P2025`·CI 주석뿐). PR/이슈 템플릿 부재 | — |

> **방법론 — `git grep -E` 는 `\b` 를 지원하지 않는다.** POSIX ERE 에 `\b` 가 없어 `-lE '\bP[0-3]\b|…'` 는 8파일 중 2파일만 낸다(감사 중 실제 발생). `git grep` 은 `-P`, `/usr/bin/grep` 은 `-E`.

### 2. 검증 5단계 (CI 는 base 가 `integration/pleiades` 라 미발동 — 로컬이 전부)

```bash
ls -d src/generated/prisma        # 없음 → typecheck·test·build 실패. npx prisma generate 선행 필수 (ci.yml 순서와 동일)
npx prisma generate               # exit 0 · "Prisma config detected, skipping environment variable loading" — .env 접속 없음
npm run lint && npm run typecheck && npm run test && npm run build   # 전부 exit 0
rm -rf .next && time npm run build
```

| 단계 | 결과 |
|---|---|
| `npm run test` (= verify 스크립트 2개) | exit 0 · DB·env 불요(소스 판정 · CI 주석 `# DB 불필요` 일치) |
| `npm run build` warm | 12.159 s wall |
| `npm run build` **cold** (`.next` 삭제 후) | **9.515 s** wall · 35.69 s user · 5.40 s sys · 431 % cpu (Next.js 16.3.0 Turbopack + esbuild 3종) |
| 실서비스 DB 접촉 | **0** — 14 페이지 중 13 `force-dynamic` + 1 `use client`(prisma 참조 0) → 프리렌더 쿼리 없음. worktree `.env` 의 `DATABASE_URL` 은 실서비스 `myfitness` 이므로 이 확인이 필수였다 |
| 산출물 | `.next`(`.gitignore:11`) · `src/generated/prisma`(`:54`) · `dist`(`:16`) 전부 ignored |

### 3. #27 함정의 방향 — 원본은 안 지워지고 **안 고쳐진다**

```bash
git -C ~/workspace/myFitness rev-parse --abbrev-ref HEAD                 # main
git -C ~/workspace/myFitness check-ignore -v .claude/rules/workflow.md   # .gitignore:35:.claude/
grep -n 'target=\|--add-dir' ~/workspace/pleiades/bin/claude-with        # :23 fit → ~/workspace/myFitness · :46 --add-dir "$target"
```

원본 `main` 은 `.claude/` 전체가 ignored(untracked 물리 파일). `bin/claude-with fit` 은 원본을 읽는다. **머지만 하면 실사용 세션은 옛 척도를 계속 읽는다** → 원본 동기화(`git archive integration/pleiades <10파일> | tar -x`)는 원본 쓰기 · git 이력 없음 → 사전 사본 필수 · 되돌리기 **중간**. 부수: `bin/claude-with:12` 주석("fit .claude/ 는 worktree 에 없고")은 #369 이후 stale.

### 못 잰 값
- 옛 척도로 분류된 살아 있는 백로그(`docs/specs/backlog-code-review-issues.md` 등)의 건수 — 범위 밖, 후속 이슈 후보

### 4. 집행 결과 (2026-09-09 · myFitness#372 머지 `2195854`)

- 봇 라운드 **5**(오픈 1 + `@codex review` 2 + push 자동 2): P1 2(1·2회차) · P2 6 — 전부 반영. 3회차부터 P1 0. 사전 리뷰 major 1 · info 4.
- **원본 동기화 실행**: `git archive integration/pleiades <10경로 명시> | tar -x -C ~/workspace/myFitness` → `diff -rq` 차이 = `settings.local.json` 뿐 · 원본 index 무변경 · `main` 유지. 사전 사본은 세션 스크래치패드(`fit-original-claude-backup-20260909-161547.tar`, 32 entries) — 세션 한정이므로 되돌리기는 `git archive 626a201 <같은 10경로> | tar -x` 폴백(롤백 문서 `_workspace/harness/04_operator_h3fit_rollback.md`).
- **zsh 함정 재발**: `FILES="a b c"; git archive ref $FILES` 가 **단일 pathspec** 으로 넘어가 `did not match any files` — 이 파일 "방법론 주의 — zsh 는 미인용 변수를 단어 분할하지 않는다" 그대로. 경로를 인자로 직접 나열해 해결.
- `git pull --ff-only` 는 worktree `integration/pleiades` 에 upstream 이 없어 실패 → `git branch --set-upstream-to=origin/integration/pleiades` 후 성공. **`repos/*` worktree 두 곳 모두 upstream 설정 여부는 미확인**(fin 은 이번에 안 당겼다).

---

# 1a-1 집행 실측 (2026-09-10 · 이슈 #47)

**맥락:** `_workspace/1a-1/01_plan_1a1.md`(2회차) E1·E6. 대상은 pleiades `packages/notify` 뿐 — 두 대상 저장소 무접촉(`repos/*/node_modules/grammy` 는 **읽기만**).
스크래치패드 `…/scratchpad/e6/`(스크립트 `run.sh`). 환경 node v20.18.0 / npm 10.8.2 / tsc 5.9.3 (1a-0 · #32 I1 · 감사 `03_auditor_1a1plan.md` 와 동일).

## E1. `typecheck:test` 게이트 — #32 I1 (b) 재현

| 확인 | 결과 |
|---|---|
| `tsconfig.test.json` 5줄 · `@types/node ^20` → lockfile `node_modules/@types/node` 1건 | 일치 |
| 주입 `const bad: number = VERSION;` → `npm run typecheck` | exit 0 (못 잡음 — 설계대로) |
| 〃 → **`npm run typecheck:test`** | **`index.test.ts(11,7): error TS2322`** · exit 2 |
| 제거 후 | exit 0 |
| 부수: 새 테스트의 `new Error(msg, { cause })` 3곳을 게이트가 잡았다 (target ES2017 lib 에 `ErrorOptions` 없음) | `Object.assign` 으로 교체 — tsconfig 무변경 |

## E6. 소비자 e2e — 결함 1건 발견 · 수정 후 통과

```bash
bash …/scratchpad/e6/run.sh   # 사본 git init → 소비자 package.json {"@pleiades/notify":"git+file://…#<sha>"} → npm install → node run.js → tsc 프로브
```

**1차 (커밋 `faebe87`) — `npm install` 실패.** 임시 클론 `prepare` 로그:
```
packages/notify/src/targets.ts(15,21): error TS2580: Cannot find name 'process'. Do you need to install type definitions for node?
packages/notify/src/targets.ts(17,13): error TS7006 · (19,46): error TS7006
```
원인: git 의존성은 **루트 devDependencies 만** 설치한다(M1 · `--include=dev --include=peer` 는 루트 기준). `@types/node` 는 서브 `packages/notify` devDep 이라 임시 클론에 없고,
`process.env` 참조가 TS2580. **로컬 4종 게이트는 통과했다** — 게이트용 `@types/node` 가 로컬에는 있기 때문. 1a-0 `exclude` 누락 · 감사 케이스 B 와 같은 경로.
수정(`40f1497`): `targets.ts` 에 모듈 스코프 `declare const process: { env: Record<string, string | undefined> }`. 회귀 `build-config.test.ts` **M3** —
빈 `--typeRoots` 로 `tsc -p packages/notify --noEmit` (수정 전 TS2580 1 + TS7006 2 · 수정 후 0).

**2차 (수정 후 · 사본 sha `c5bee83`) — 전부 통과.**

| 항목 | 값 |
|---|---|
| `npm install` (임시 클론 `prepare` 포함) | **exit 0** |
| 소비자 설치 트리 | `node_modules/@pleiades/notify/` — `package.json` + `packages/notify/dist/` **20파일**(10 모듈 × `.js`/`.d.ts`) + `packages/notify/package.json` = **22파일 · 100 K** |
| 누수 | `node_modules/@types` **0** · `grammy` **0** · `vitest` **0** |
| `require('@pleiades/notify')` | `VERSION` `0.0.0` · export 18개 (`createNotifier` · `createTelegramTransport` · `csvEnv` · `html` · `Route` · `deliverOne` · `splitMessage` · `toPlain` · `escapeHtml` · error 5 · 상수 3) |
| fake api 전송 1건 (본문 `<b>hi</b>\n` + 5000자 · 키보드 · 대상 2 · 1회차 파싱 실패 주입) | `sent 2 · failed 0 · total 2 · first {111, ref "4"}` · API 호출 **7** = 대상 111: html 9자 → **plain 2자**(폴백) → 4096 → 904(+`reply_markup`) · 대상 222: 9 → 4096 → 904(+`reply_markup`). `ref` = 마지막 청크(4 · 7) · `targetCount(ADMIN)` **0** |
| 소비자 `npm ci` ×3 (warm · 같은 캐시) | 1.91 / 1.84 / 1.94 → **중앙값 1.91 s** · 트리 100 K (감사 대조군 1.56 s 와 다른 시점 — 통제 비교 아님) |
| `README.md` | `packages/notify/README.md` 는 **tarball 에 실리지 않는다**(`files` 밖 · npm 은 루트 README 만 자동 포함). 저장소 독자용 — #32 I3 의 두 선택지 중 후자 |

## E6b. grammy 대입 프로브 — 감사 A-1 블로커 해소 확인

```bash
# tsconfig paths: { grammy: [repos/<repo>/node_modules/grammy], "@pleiades/notify": [<소비자 설치본 dist/index.d.ts>] } · strict · skipLibCheck · types []
tsc -p …/scratchpad/e6/probe/<repo>/tsconfig.json
```
프로브 내용: `const api: TelegramApi = bot.api` · `createTelegramTransport({ api: () => bot.api })` · `new InlineKeyboard()` → `components` · `api.sendMessage('1','x',{ parse_mode:'HTML', reply_markup: kb })`.

| grammy | tsc |
|---|---|
| myFinance **1.44.0** | **exit 0** |
| myFitness **1.42.0** | **exit 0** |
| 대조군 — `parse_mode?: 'HTML'` 리터럴(1회차 계획 시그니처) | **`error TS2322`** 재현 (감사 A-1 그대로) |

→ `TelegramApi { sendMessage(chatId, text, other?: { parse_mode?: string; reply_markup?: unknown }) }`(메서드 단축 문법)가 두 저장소의 `bot.api` 를 받는다. **1a-3·1a-4 에서 이 자리는 막히지 않는다.**

## 못 잰 값 (이 절 범위)

| 항목 | 왜 |
|---|---|
| `npm pack --dry-run` 파일 목록 | 사본 루트에 `node_modules` 가 없어 `pack` 이 `prepare`(`tsc`) 에서 127 로 멈춘다. 소비자 설치 트리(위 22파일)로 갈음 — 1a-0 E6 의 5파일(당시 `dist` 2 + README)과 같은 구성에 `dist` 가 20 으로 늘었다 |
| GitHub 원격(`git+https`) 경유 설치 | 이번도 `git+file://` (1a-0 · #32 I1 · 감사와 같은 한계 · M2 가 https 우선을 실측) |
| fin 비-파싱 400 폴백 빈도 · `TELEGRAM_*_CHAT_IDS` 비숫자 토큰 유무 | 감사 §11 그대로 (계측 코드 없음 · `.env` 열람 금지) |

## E7 후속 — 사전 리뷰 반영 뒤 재실측 (2026-09-10)

`pr-review-toolkit:code-reviewer` 1회: critical 0 · major 5 · info 5. major 5 전부 + info 2(NaN 가드 · `targetCount` 복사 제거) 반영 · 회귀 테스트 10건 추가(82 → 92).
- **M-3 재프로브** — `Components = Record<string, unknown>` 은 grammy `InlineKeyboard`(클래스)를 받지 못한다(`TS2322: Index signature for type 'string' is missing`). `object` 로 바꾼 뒤 위 E6b 프로브에서 **`kb as unknown as …` 캐스트를 제거**(`html('<b>x</b>', kb)` 직접 전달) → fin 1.44.0 · fit 1.42.0 **둘 다 exit 0**. 대조군 TS2322 재현 유지.
- **M-1 재현** — `splitMessage('\n'.repeat(5000), 4096)` → `[]`(fin 정본의 성질). 수정 전 `deliverOne` 은 전송 0회에 `ref undefined` 를 성공으로 집계했다. 수정 후 throw → `deliveries[].error`.
- **M-2 재현** — `splitMessage('x', 0)` · `(-1)` 무한 루프(배열 무한 증식) → `RangeError` 가드. `NaN` 은 `Number.isFinite` 판정에서 어댑터 소유 모드로 새던 것을 `=== Infinity` 로 좁혀 같은 가드에 걸린다.
- E6 소비자 e2e 재실행: `npm install` exit 0 · 누수 0 · 결과 동일(호출 7 · ref 4/7).
# #38 — skill 이름 충돌 런타임 동작 (2026-09-10 · 읽기 전용)

**맥락:** Q41 부수 결정 (i) 의 미측정 가정(*"skill 충돌은 이름 단위"*)을 N18 과 같은 방식으로 잰다. 충돌 대상은 `orphan-check`
(pleiades `.claude/skills/orphan-check/SKILL.md` 135줄 — H-1b 형태 B 복사 · `<base>` 파라미터화 / fit 원본 `~/workspace/myFitness/.claude/skills/orphan-check/SKILL.md` 113줄 — `dev` 리터럴).
frontmatter `name` 은 둘 다 `orphan-check`. CLI **v2.1.267** · 모델 `claude-haiku-4-5-20251001` · `--permission-mode plan` · 환경변수 켬 · 두 저장소 워킹트리 쓰기 0(전후 `git status` 0줄).

## 방법 — 3단계 (앞 둘은 변별 실패 · 셋째가 결정적)

```bash
# Q1: 목록에서 orphan-check 개수 · description 인용 (JSON)              → count 1 · descriptions [] (인용 불가)
# Q2: description 에 "<base>" 인지 "dev" 인지                          → 4세션 전부 "목록에 설명이 없다" (haiku 가 받는 목록 형식의 한계 — 변별 불가)
# Q3: Skill 도구로 orphan-check 를 로드만 하고(Bash·Edit·Write·Agent 차단) Base directory · 첫 본문 줄 · "pleiades 판" 포함 여부 보고
cd ~/workspace/pleiades;  CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q3" --model claude-haiku-4-5-20251001 --permission-mode plan \
  --disallowedTools "Bash,Edit,Write,MultiEdit,NotebookEdit,Agent" --add-dir ~/workspace/myFitness < /dev/null      # a2
cd ~/workspace/myFitness; CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude -p "$Q3" … --add-dir ~/workspace/pleiades < /dev/null   # b2
```
프롬프트 원문은 스크래치패드 `i38/Q{1,2,3}.txt`(세션 종료 시 소멸) — 위 요약이 정본.

## 결과

| # | cwd | `--add-dir` | 목록의 `orphan-check` 수 | 로드된 Base directory | 첫 본문 줄 |
|---|---|---|---|---|---|
| **a2** | pleiades | fit | **1** | **`/Users/sagan/workspace/pleiades/.claude/skills/orphan-check`** | `> **pleiades 판 (005 §4-4 · Q29 형태 B 복사).** …` (`<base>` 포함 true) |
| **b2** | fit | pleiades | **1** | **`/Users/sagan/workspace/myFitness/.claude/skills/orphan-check`** | `Squash merge 특성상 … 첫 커밋만 dev 로 압축된다 …` (`pleiades 판` false) |

Q1 에서도 두 방향 모두 `orphan_check_count: 1` · 나머지 skill 은 양쪽 합집합(pleiades 9 + fit 9 − 중복 1 = 17 + 플러그인)이 전부 보였다.

> **판정 (N18 에 셋째 규칙이 추가된다).**
> - **rule**: N 벌 전부 공존 (N18) · **agent**: 마지막 `--add-dir` 이 이기고 나머지 조용한 드롭 (N18) ·
>   **skill: 이름 단위로 1개만 남고 `cwd` 쪽이 이긴다 — `--add-dir` 쪽이 조용히 드롭된다.** agent 와 **방향이 반대**다.
> - 충돌 판정은 **이름 단위**다 — 다른 이름의 skill 은 양쪽 것이 전부 보였다(층 단위 드롭 아님). Q41 (i) 의 전제는 **성립**한다.
> - `bin/claude-with fit`(cwd pleiades)에서는 **pleiades 판**(`<base>` 파라미터화)이 로드되고, fit cwd 세션에서는 **fit 판**이 로드된다.
>   → 각 저장소 세션이 자기 판을 쓴다. **(ii) pleiades 쪽 개명은 불필요** — 개명하면 오히려 pleiades 세션에 두 벌(`orphan-check` fit 판 + 개명본)이 공존해 혼선이 는다.
> - 남는 부채는 **fit 원본의 Step 2~4 결함**(pleiades PR #22 Codex P1 2건이 pleiades 판에만 정정됨)이고, 그것은 이름과 무관한 fit 이슈다.

## 못 잰 값

| 항목 | 왜 |
|---|---|
| 디렉터리명 ≠ frontmatter `name` 일 때의 기준 | 두 파일 모두 100% 일치 — 구분할 사례가 없다 (Q41-4 와 같음) |
| `--add-dir` 를 둘 붙였을 때 add-dir 끼리의 skill 충돌 순서 | 한 번에 한 저장소만 붙인다(Q30)라 운영에 없는 조합 — 측정하지 않았다 |
| description 만으로의 변별 | haiku 세션 4회 전부 "목록에 설명이 없다" — 모델·목록 형식의 한계이지 로딩 실패가 아니다(Q3 가 본문을 로드했다) |
