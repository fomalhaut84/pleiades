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
