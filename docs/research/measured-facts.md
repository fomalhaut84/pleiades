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
