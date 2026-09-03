# 측정 주제 B — Discord 로 옮길 때 깨지는 것

측정일 2026-09-03 · 대상 저장소는 **읽기만** 수행 (파일·git·빌드 무변경).

## 측정 시점 저장소 상태

```bash
for d in myFinance myFitness; do git -C ~/workspace/$d branch --show-current; git -C ~/workspace/$d status --porcelain | wc -l; git -C ~/workspace/$d log -1 --format='%h %ad %s' --date=short; done
```

| | myFinance | myFitness |
|---|---|---|
| 브랜치 | `dev` | `dev` |
| dirty | 0 | 0 |
| HEAD | `c549fa6` 2026-08-27 | `2625600` 2026-09-03 (PR #360 머지) |

> **정정 (2026-09-03 재측정).** measured-facts 최초 기록의 "myFitness 브랜치 `chore/359-1`" 은
> 더 이상 유효하지 않다. PR #360 이 `dev` 로 머지되어 지금은 `dev`/clean 이다.
> 아래 모든 수치는 이 HEAD 기준.

경로 분류 규약 (이 문서 전체에서 사용):
- **아웃바운드** = `src/bot/notifications/**` (단 `*-callback.ts` 제외) + `src/bot/utils/telegram.ts` 의 `sendHtml`/`sendToAll` + `src/lib/ai/advisor-monitor.ts` · `src/lib/monitoring/admin-alerts.ts`
- **인바운드** = `src/bot/commands/**` + `src/bot/middleware/**` + `*-callback.ts` + `replyHtml`/`replyLong`

---

## 1. 텔레그램 고유 기능 — 아웃바운드/인바운드 분포

측정 명령 (양쪽 동일):

```bash
for d in myFinance myFitness; do
  for feat in 'parse_mode' '<b>|<code>|<i>|<pre>' '4096' 'InlineKeyboard|reply_markup' \
              'callbackQuery|callback_query|answerCallbackQuery' 'chat_id|chatId|chatIds' \
              'sendPhoto|sendDocument|InputFile|getFile|message:photo|file_id'; do
    for area in bot/notifications bot/commands bot/middleware bot/utils; do
      grep -rEn "$feat" ~/workspace/$d/src/$area --include='*.ts' | wc -l
      grep -rlE "$feat" ~/workspace/$d/src/$area --include='*.ts' | wc -l
    done
    grep -rEn "$feat" ~/workspace/$d/src --include='*.ts' | grep -v "/src/bot/" | wc -l
  done
done
```

### 1-1. `parse_mode: "HTML"`

| 영역 | myFinance | myFitness |
|---|---|---|
| `bot/notifications` (아웃바운드) | 2 hits / 2 of 20 files | 2 hits / 1 of 5 files |
| `bot/commands` (인바운드) | 4 hits / 3 of 17 files | 5 hits / 5 of 13 files |
| `bot/utils` (양쪽 초크포인트 동거) | 9 hits / 2 of 6 files | 1 hit / 1 of 3 files |
| `src/bot` 밖 | 0 | 0 |

**아웃바운드에서 쓰인다 — 예.** 단 초크포인트 1곳으로 수렴한다:
`myFinance sendHtml()` (`bot/utils/telegram.ts:64`), `myFitness sendOneWithRetry()` (`bot/notifications/send.ts:51`) + `sendToAllWithKeyboard()` (`send.ts:111`).
아웃바운드 `parse_mode` 리터럴은 **양쪽 합쳐 4곳뿐** (fin 2 = `send.ts` 없음이라 `telegram.ts:64` + `rsu.ts:185`, fit 2 = `send.ts:51,111`).

### 1-2. HTML 태그 기반 포맷 (`<b>` `<code>` `<i>` `<pre>`)

| 영역 | myFinance | myFitness |
|---|---|---|
| `bot/notifications` | **15 hits / 6 of 20 files** | **13 hits / 3 of 5 files** |
| `bot/commands` | 2 / 1 of 17 | 17 / 6 of 13 |
| `bot/utils` | 11 / 2 of 6 | 6 / 1 of 3 |
| `src/bot` 밖 | 19 hits (아웃바운드 8 = `lib/ai/advisor-monitor.ts:60~74`, 나머지 11 은 웹 UI `stripHtml` + 테스트) | **11 hits 전부 아웃바운드** (`lib/monitoring/admin-alerts.ts:276~326`) |

**아웃바운드에서 쓰인다 — 예, 그리고 초크포인트 밖에서 쓰인다.**
`escapeHtml` / `h.b()` / `markdownToTelegramHtml` 이 **메시지 본문을 만드는 각 모듈**에 흩어져 있다.

```bash
grep -rn "from '@/bot/utils/telegram'\|markdownToTelegramHtml\|mdToHtml" ~/workspace/$d/src --include='*.ts'
```

| | myFinance | myFitness |
|---|---|---|
| 아웃바운드 모듈 중 `escapeHtml`/`h` import | **14 / 16** | 0 (fit 은 템플릿 리터럴에 태그 직타) |
| 아웃바운드 모듈 중 md→HTML 변환기 사용 | 4 (`briefing`,`active-review`,`ta-signal-alert`,`monthly-report`) | 1 (`scheduler.ts:33`) |
| 변환기 정의 위치 | `bot/utils/markdown.ts:51 markdownToTelegramHtml` | `bot/utils/telegram.ts:6 mdToHtml` |

→ 어댑터를 `send()` 한 곳에 넣어도 **본문 생성이 이미 HTML 이다.** Discord 마크다운으로 가려면
아웃바운드 모듈 20개(fin 16 + fit 4) 중 최소 fin 14 + fit 4(admin-alerts 포함 5) 의 본문 생성 코드를 손대거나,
어댑터 안에 HTML→Discord-md 역변환기를 둬야 한다.

### 1-3. 4096자 상수 — **상수 교체로 안 끝난다**

```bash
grep -rn "4096" ~/workspace/$d/src --include='*.ts'
```

| 저장소 | 상수 정의 개수 | 위치 | 경로 | 초과 시 동작 |
|---|---|---|---|---|
| myFinance | **1 + 리터럴 1** | `bot/utils/formatter.ts:50 TELEGRAM_MAX_LENGTH` | 인바운드·아웃바운드 **공유** | **분할** (`splitMessage`, 줄 단위) |
| | | `bot/commands/briefing.ts:98` 하드코딩 `4096` | 인바운드 | 분기 |
| myFitness | **4 (독립 정의)** | `bot/notifications/send.ts:9 MAX_MSG` | **아웃바운드** | **절단** (`slice(0, MAX-3) + "..."`) |
| | | `bot/utils/telegram.ts:3 MAX_MESSAGE_LENGTH` | 인바운드 | 분할 |
| | | `bot/commands/food-edit-format.ts:10 TELEGRAM_MAX_MESSAGE_LENGTH` | 인바운드 | — |
| | | `bot/commands/food-photo.ts:215 TELEGRAM_MAX_MESSAGE` | 인바운드 | 절단 |

**구조가 바뀌는 지점 3가지:**

1. **myFitness 아웃바운드는 분할이 아니라 절단이다** (`send.ts:35-37`).
   4096 → 2000 으로 낮추면 잘려나가는 양이 2배 이상 늘어난다. 상수만 바꾸면 알림 내용이 조용히 사라진다.
   → 아웃바운드에 분할 로직을 **새로 넣어야 한다** (myFinance 것 이식).
2. **어느 쪽 splitter 도 HTML 태그 인식을 하지 않는다.**
   `myFinance formatter.ts:52-77` 은 `\n` 기준, `myFitness telegram.ts:38-59` 는 `lastIndexOf('\n')` 기준.
   `<b>…</b>` 중간에서 잘리면 파서 오류 → 양쪽 다 "전체 태그 제거 후 plain 재전송" fallback 으로 넘어간다.
   한도가 절반으로 줄면 분할 지점이 약 2배 늘어 이 잠복 버그의 발생 확률이 함께 오른다.
3. myFinance 는 인바운드·아웃바운드가 **같은 상수 하나**를 공유한다. 아웃바운드만 2000 으로 낮추려면
   상수를 쪼개야 하고, 그러면 인바운드 텔레그램 경로도 함께 건드리게 된다.

### 1-4. `InlineKeyboard` / callback query — **아웃바운드에도 있다**

| 영역 | myFinance | myFitness |
|---|---|---|
| `bot/notifications` InlineKeyboard/reply_markup | **3 hits / 1 of 20 files** (`rsu.ts:178,186`) | **7 hits / 3 of 5 files** (`send.ts`, `auto-adjust.ts`, `auto-adjust-cron.ts`) |
| `bot/notifications` callback 핸들러 | 0 (핸들러는 `commands/vest-confirm.ts`) | **9 hits / 1 file** (`notifications/auto-adjust-callback.ts`) |
| `bot/commands` InlineKeyboard | 40 / 3 of 17 | 17 / 3 of 13 |
| `bot/commands` callback | 64 / 4 of 17 | 12 / 1 of 13 |

**아웃바운드에서 쓰인다 — 예. 2개 플로우가 아웃바운드→인바운드 루프를 이룬다.**

| 플로우 | 발신 (아웃바운드) | 수신 (인바운드) | 상태 저장 |
|---|---|---|---|
| myFinance RSU 베스팅 D-day 확정 | `notifications/rsu.ts:178-190` — `bot.api.sendMessage(chatId, msg, {parse_mode, reply_markup: keyboard})`, `callback_data = vest:confirm:<rsuId>` | `commands/vest-confirm.ts:22 bot.callbackQuery(/^vest:(confirm\|cancel):(.+)$/)` | 없음 (callback_data 에 id embed) |
| myFitness 훈련 자동조정 수락/거절/스누즈 | `notifications/auto-adjust.ts:394` → `send.ts:98 sendToAllWithKeyboard()`, `callback_data = auto_adjust:<action>:<id>` | `notifications/auto-adjust-callback.ts:230 bot.callbackQuery(/^auto_adjust:/)` | **DB** (아래 1-6) |

이 두 플로우는 **아웃바운드 어댑터만 갈아서는 완성되지 않는다.** Discord components 는
interaction 응답 엔드포인트(gateway 또는 HTTP interactions endpoint)가 있어야 동작하고,
`answerCallbackQuery` / `editMessageReplyMarkup` 에 대응하는 개념(deferred update, message edit)도 다르다.

### 1-5. 파일·사진 전송

```bash
grep -rn "sendPhoto\|sendDocument\|InputFile\|getFile\|message:photo\|file_id" ~/workspace/$d/src/bot --include='*.ts'
```

| | myFinance | myFitness |
|---|---|---|
| `bot/notifications` | **2 hits / 1 of 20** — `quarterly-report.ts:9,54` | **0** |
| `bot/commands` | 2 / 1 of 17 — `report.ts:1,55` `replyWithDocument` | 3 / 1 of 13 — `food-photo.ts:73,89,132` |
| 방향 | fin: **아웃바운드 O** (분기 PDF 리포트 발송) + 인바운드 | fit: **아웃바운드 X**, 인바운드만 |

- `myFinance notifications/quarterly-report.ts:54`
  `await bot.api.sendDocument(chatId, new InputFile(pdfBuffer, basename), { caption })`
  → 텍스트가 아닌 **바이너리 첨부 아웃바운드**. 어댑터 인터페이스가 `send(text)` 만으로는 부족하다.
- `myFitness commands/food-photo.ts` — `bot.on("message:photo")` + `ctx.api.getFile(file_id)` 다운로드.
  **전부 인바운드.** 질문에서 지목한 `food-photo.ts` 는 아웃바운드 어댑터 범위 밖이다.
- `sendPhoto` 는 양쪽 **0건**. (패턴이 틀린 게 아니라 실제로 0. `sendDocument`/`replyWithDocument` 는 잡힘.)

### 1-6. 수신자 식별 방식 — 타입 불일치 + DB 영속화

```bash
grep -rnE "chatIds?\s*:\s*(number|string)" ~/workspace/$d/src --include='*.ts' | wc -l
grep -niE "chatid|messageid|telegram" ~/workspace/$d/prisma/schema.prisma
```

| | myFinance | myFitness |
|---|---|---|
| `chatId: number` 시그니처 | **20건** | 10건 (전부 인바운드 `food-edit-state.ts` 등) |
| `chatId: string` 시그니처 | **0건** | 2건 (`send.ts:21,41` — 아웃바운드) |
| 아웃바운드 수신자 타입 | **`number[]`** (`sendHtml(bot, chatId: number, html)`) | **`string[]`** (`getChatIds(): string[]`) |
| 인바운드 인증 | `Set<number>` (`middleware/auth.ts:3`, `.map(Number)`) | `string[]` (`middleware/auth.ts:3`, `.toString()` 비교) |
| Prisma 스키마에 텔레그램 식별자 | **0건** (전부 in-memory `Map`) | **`WorkoutAdjustment.telegramMessageId` / `.telegramChatId` + `@@index([telegramMessageId])`** (`schema.prisma:358-367`) |

두 가지 별개 문제:

**(a) myFinance 의 `number` 는 Discord ID 를 담을 수 없다.**
```bash
node -e "const s='1234567890123456789'; console.log(Number(s), String(Number(s))===s)"
# → 1234567890123456800  false
```
Discord snowflake 는 64비트(19자리)라 `Number.MAX_SAFE_INTEGER`(2^53-1)를 넘는다.
`middleware/auth.ts:8` 의 `.map(Number)` 와 20개 시그니처를 그대로 두면
**조용히 잘못된 채널로 발송하거나 매칭이 실패한다.** 텔레그램 chat id(9~10자리)에서는 드러나지 않던 문제다.
myFitness 아웃바운드는 이미 `string` 이라 안전 — **양쪽이 비대칭**이다.

**(b) myFitness 는 텔레그램 message id 를 DB 에 저장한다.**
`prisma/migrations/20260716054043_workout_adjustment/migration.sql` 로 생성된 컬럼 2개 + 인덱스 1개.
Discord 전환은 **실서비스 DB 마이그레이션**을 동반한다 (컬럼 rename 또는 채널중립 컬럼 추가 + 백필).
measured-facts 에 없던 항목이다.

---

## 2. `src/bot` 밖 누수 6곳의 호출 형태

판정 기준 — (a) 봇 인스턴스 직접 생성 / (b) 초크포인트 함수 호출 / (c) 환경변수 이름만 참조

```bash
grep -nE "^import|grammy|new Bot|TELEGRAM|sendMessage|sendHtml|sendToAll" <file>
grep -rn "new Bot(" ~/workspace/$d/src --include='*.ts'
grep -rn "from ['\"]grammy" ~/workspace/$d/src --include='*.ts' | grep -v '/src/bot/'
```

| 파일 | 저장소 | 판정 | 실제 호출 형태 | 방향 | 어댑터 도입 비용 |
|---|---|---|---|---|---|
| `src/mcp/logger.ts` | fin `:197` / fit `:183` | **(c)** | redaction 키 목록 문자열 `'TELEGRAM_BOT_TOKEN'` 1개. grammY import 0, 전송 0 | 무관 | **0** (로그 마스킹 목록. 문자열만 추가/교체) |
| `src/lib/cron.ts` | fin `:14` | **(c)+(b)** | `process.env.TELEGRAM_ALLOWED_CHAT_IDS` 파싱 → `checkPriceAlerts(chatIds)` 등 `@/bot/notifications/*` 함수에 넘김. grammY import 0 | 아웃바운드 | 낮음 (수신자 해석만 어댑터로) |
| `src/lib/ai/advisor-monitor.ts` | fin `:199-222` | **(b)** | `const {getBot} = await import('@/bot')` / `const {sendHtml} = await import('@/bot/utils/telegram')` → `sendHtml(bot, chatId, message)`. **동적 import** (web 프로세스 순환참조 회피) | 아웃바운드 | 낮음 — 단 **본문이 HTML** (`:60-74`, 8 hits) |
| `src/app/api/alerts/history/[id]/retry/route.ts` | fin `:30,73` | **(c)+(b)** | env 파싱 → `redispatchAlert(row, chatIds)` (`@/bot/notifications/alert-dispatcher`). grammY import 0 | 아웃바운드 | 낮음 |
| `src/lib/garmin/sync.ts` | fit `:2,260,363` | **(c)** | `import type { Bot } from "grammy"` — **type-only**. `options.notifyBot` 을 `notifyGarminAuthFailedIfNeeded()` 로 **패스스루만** 함. 전송 호출 0 | 아웃바운드 (경유) | 낮음 (타입 1줄) |
| `src/lib/monitoring/admin-alerts.ts` | fit `:7,9,10,232` | **(b)** | `import type {Bot}` + `import { sendToAll } from "@/bot/notifications/send"` → `sendToAll(bot, message)` (`:232`). 본문 HTML 11 hits (`:276-326`) | 아웃바운드 | 낮음 — 단 **본문이 HTML** |

**판정 결과: (a) 봇 인스턴스 직접 생성 = 6곳 중 0곳.**

```
new Bot( 위치:  myFinance src/bot/index.ts:39   |  myFitness src/bot/index.ts:36   ← 각 1곳
grammy import (src/bot 밖):  myFinance 0건  |  myFitness 2건 (둘 다 `import type`)
getBot() 호출:  myFinance 19곳 (18곳이 src/bot 안, 1곳이 advisor-monitor.ts:218)
```

→ **어댑터 도입 비용은 크지 않다.** 누수 6곳 중 2곳은 env 이름 참조뿐(mcp/logger ×2),
1곳은 타입 패스스루(garmin/sync), 3곳은 초크포인트 호출이다.
남는 실질 작업은 **누수 지점이 아니라 본문 HTML 생성**(advisor-monitor 8 hits, admin-alerts 11 hits)이다.

### 2-1. 초크포인트 수렴 검증 (재확인)

```bash
for f in ~/workspace/$d/src/bot/notifications/*.ts; do
  echo "$(basename $f) sendHtml=$(grep -c sendHtml $f) raw=$(grep -c 'api\.sendMessage\|api\.sendDocument' $f) kb=$(grep -c 'InlineKeyboard\|reply_markup' $f)"
done
```

| | myFinance (16 모듈) | myFitness (4 모듈 + send.ts) |
|---|---|---|
| 초크포인트 경유 | 14 / 16 | 4 / 4 |
| 원시 `bot.api.*` 직접 호출 | **2** — `rsu.ts` (keyboard), `quarterly-report.ts` (sendDocument) | **0** (원시 호출은 초크포인트 `send.ts` 내부 3곳뿐) |

→ measured-facts 의 "아웃바운드 초크포인트 1개" 기록은 **myFitness 는 정확, myFinance 는 2곳 예외**.
그리고 그 예외 2곳이 정확히 **keyboard 와 document** — Discord 로 옮길 때 가장 어려운 두 기능이다.

---

## 3. myFitness 테스트 도입 전제

```bash
node -e "const p=require('~/workspace/$d/package.json'); console.log(p.scripts, p.devDependencies)"
ls ~/workspace/$d | grep -iE 'vitest|jest'
find ~/workspace/$d/src -name '*.test.ts' -o -name '*.test.tsx' | wc -l
find ~/workspace/$d/src -type d -name '__tests__' | wc -l
grep -rhoE "^\s*(it|test)\(" ~/workspace/myFinance/src --include='*.test.ts' | wc -l
```

| | myFinance | myFitness |
|---|---|---|
| 테스트 파일 | **42** (`*.test.ts`) / 424 src 파일 | **0** / 218 |
| `__tests__` 디렉터리 | **18** | **0** |
| `*.spec.ts` | 0 | 0 |
| `it(`/`test(` 블록 | **786** | 0 |
| 테스트 LOC | 7,572 | 0 |
| 설정 파일 | **`vitest.config.mts`** (루트, 15줄) | **없음** |
| setup 파일 | **없음** (`setupFiles` 미지정) | — |
| scripts | `test` `test:run` `test:coverage` | **없음** (대신 `typecheck` 있음 — fin 에는 없음) |
| 테스트 의존성 | `vitest@^4.1.8`, `@vitest/coverage-v8@^4.1.8`, `vite-tsconfig-paths@^6.1.1` | **0개** |

패턴: **`src/**/__tests__/**/*.test.ts`** (`.tsx` 는 include 에서 제외 — 실제 `.tsx` 테스트도 0개라 현재는 무해).

myFinance `vitest.config.mts` 전문:
```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**', 'src/lib/prisma.ts'],
    },
  },
})
```

### myFitness 에 vitest 를 붙이려면 (실측 기반 체크리스트)

| # | 항목 | 근거 |
|---|---|---|
| 1 | devDependency 3개: `vitest@^4.1.8`, `@vitest/coverage-v8@^4.1.8`, `vite-tsconfig-paths@^6.1.1` | myFinance 실측치 그대로 |
| 2 | `vitest.config.mts` 루트 신규 (15줄, coverage `include` 만 도메인에 맞게 조정) | 위 전문 |
| 3 | scripts 3줄 추가: `"test": "vitest"`, `"test:run": "vitest run"`, `"test:coverage": "vitest run --coverage"` | myFinance 와 동일 |
| 4 | setup 파일 — **불필요** | myFinance 도 `setupFiles` 없음 |
| 5 | tsconfig 조정 — **불필요** | 양쪽 `paths: {"@/*": ["./src/*"]}` 동일, `vite-tsconfig-paths` 가 해석 |
| 6 | `npm install` (실서비스 서버) | **쓰기 작업 → `dual-repo-operator` 소관** |

tsconfig 차이는 `jsx`(`preserve` vs `react-jsx`) 와 `include` 의 `.next/dev/types` 1줄뿐 — vitest 에 영향 없음.

### 첫 테스트의 참고 구현이 이미 있다

`myFinance/src/bot/notifications/__tests__/alert-dispatcher.test.ts` (332줄) 이 **아웃바운드 초크포인트를 테스트하는 기존 사례**다.
모킹 방식이 그대로 `@pleiades/notify` 테스트의 틀이 된다:

```ts
vi.mock('@/lib/prisma', () => ({ prisma: { alertHistory: { createMany: vi.fn() } } }))
vi.mock('../../index', () => ({ getBot: vi.fn(() => ({} as unknown)) }))
vi.mock('@/bot/utils/telegram', () => ({ sendHtml: vi.fn(), escapeHtml: (t: string) => ... }))
```

파일 주석이 남긴 제약(그대로 인용):
> `'../index' (getBot) 는 모듈 로드시 모든 command register 를 chain-import 하므로 env 미설정 테스트에서 crash 방지 위해 mock 필수`

→ **`src/bot/index.ts` 가 모든 command 를 chain-import 한다.** 어댑터를 `src/bot/index.ts` 에 의존시키면
테스트마다 봇 전체 그래프를 mock 해야 한다. `@pleiades/notify` 는 `index.ts` 를 참조하지 않고
transport 를 **주입받는** 형태여야 이 비용을 피한다.

---

## 4. 수신자·라우팅 설정

```bash
grep -rhoE "TELEGRAM_[A-Z_]+" ~/workspace/$d/src | sort | uniq -c
grep -oE "^[A-Z_]+" ~/workspace/$d/.env.example        # 이름만 (값 미열람)
grep -rn "ALLOWED_CHAT_IDS\|ADMIN_CHAT_IDS" ~/workspace/$d/src --include='*.ts'
```

`.env` 의 **값은 열람하지 않았다.** 변수 이름만 `.env.example` 및 소스에서 확인.

### 4-1. 환경변수 이름

| 변수 | myFinance | myFitness |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | O (`.env.example`, 소스 5회) | O (`.env.example`, 소스 4회) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | O (소스 16회) | O (소스 4회) |
| `TELEGRAM_ADMIN_CHAT_IDS` | **O (소스 3회)** | **X — 없음** |
| `TELEGRAM_WEBHOOK_SECRET` | O (`.env.example`) | X |

### 4-2. 파싱 위치 — 중앙화되어 있지 않다

동일한 `.split(',').map(trim).filter(Boolean)` 블록이 복사되어 있다.

| 저장소 | 파싱 지점 | 방향 | 결과 타입 |
|---|---|---|---|
| myFinance | `bot/middleware/auth.ts:3` | 인바운드 | `Set<number>` |
| | `bot/notifications/scheduler.ts:22` | 아웃바운드 | `number[]` |
| | `bot/notifications/budget-alert.ts:15` | 아웃바운드 | `number[]` |
| | `lib/cron.ts:14` | 아웃바운드 | `number[]` |
| | `app/api/alerts/history/[id]/retry/route.ts:30` | 아웃바운드 | `number[]` |
| | `lib/ai/advisor-monitor.ts:199` (**ADMIN**) | 아웃바운드 | `number[]` |
| **fin 소계** | **6곳** (아웃바운드 5 + 인바운드 1) | | |
| myFitness | `bot/middleware/auth.ts:3` | 인바운드 | `string[]` |
| | `bot/notifications/send.ts:25 getChatIds()` | 아웃바운드 | `string[]` |
| **fit 소계** | **2곳** (아웃바운드 1 + 인바운드 1) | | |

### 4-3. 알림 종류별 수신자 — 저장소마다 정책이 다르다

| 알림 종류 | myFinance 수신자 | myFitness 수신자 |
|---|---|---|
| 일반 알림 (가격/일간/브리핑/리포트/RSU/예산/TA/전략…) | `TELEGRAM_ALLOWED_CHAT_IDS` | `TELEGRAM_ALLOWED_CHAT_IDS` |
| 운영/관리자 alert (AI 어드바이저 실패, MCP 다운, Garmin 재인증 실패) | **`TELEGRAM_ADMIN_CHAT_IDS` (분리)** | **`TELEGRAM_ALLOWED_CHAT_IDS` (동일 — 분리 없음)** |
| 알림 종류별 세분 라우팅 | **없음** (2등급이 전부) | **없음** (1등급) |

myFinance `advisor-monitor.ts:187-194` 주석이 분리 이유를 명시한다 (원문):
> `TELEGRAM_ALLOWED_CHAT_IDS` (봇 사용자 화이트리스트, 가족 chat 포함) 는 alert 대상으로 사용 금지 —
> alert 본문에 `AdvisorError.detail` (stderr tail) 이 포함되며 … 가족 chat 에 internal 진단이 노출되면 안 됨.

그런데 **myFitness `lib/monitoring/admin-alerts.ts:232` 는 정확히 그 금지된 일을 하고 있다** —
`sendToAll()` → `TELEGRAM_ALLOWED_CHAT_IDS`. 관리자 alert 가 일반 수신자에게 간다.

→ 도메인 #3(캘린더)을 얹으려면 `@pleiades/notify` 는 최소 **(수신자 그룹 × 알림 등급)** 2축이 필요하다.
현재 실측은 fin 2등급 / fit 1등급이고, **도메인 축은 어느 쪽에도 없다.**
env 이름 자체가 도메인 중립이 아니라(`TELEGRAM_` prefix) 3도메인 공유 시 이름 재설계가 따라온다.

---

## 5. 못 잰 값

| 항목 | 이유 |
|---|---|
| 실제 수신자 chat id 개수 / 값 | `.env` 값 열람 금지. `.env.example` 에는 이름만 존재 |
| Discord 측 실제 제한 (2000자, embed 필드 한도, rate limit) | 대상 저장소에 Discord 코드가 0줄 — 저장소 실측 대상이 아님. 문서 값이므로 여기 적지 않음 |
| 아웃바운드 알림의 실제 평균/최대 메시지 길이 | 런타임 데이터. 정적 측정 불가. DB `alertHistory.message` 조회는 실서비스 DB 접근이라 미수행 |
| myFitness `WorkoutAdjustment` 중 telegram id 가 채워진 row 수 | 실서비스 DB 조회 필요 — 읽기 전용 규율상 미수행 |
| 전환 후 회귀 위험 커버리지 | myFitness 테스트 0개라 baseline 자체가 없음 |
