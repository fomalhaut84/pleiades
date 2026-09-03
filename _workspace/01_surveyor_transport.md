# 01 · surveyor — 전송 계층의 실제 모양 (단계 1 `@pleiades/notify` 설계용)

측정일 2026-09-03 · 두 저장소 **읽기 전용** 접근만 수행.

**측정 시점 저장소 상태 (인계 노트와 다름):**

| | 브랜치 | dirty |
|---|---|---|
| myFinance | `dev` | 0 |
| myFitness | **`dev`** (measured-facts 기록은 `chore/359-1`) | 0 |

→ myFitness 는 이전 측정 이후 `dev` 로 돌아왔다. 아래 값은 전부 `dev` 기준.

기존 측정(`measured-facts.md`)에서 **인용만 하고 재측정하지 않은 값**: 봇 디렉터리 구조,
전송 호출 총량 149/61, 추출 후보 3파일의 import 목록, `src/bot` → `next` import 0건,
`error.ts` 원시 diff 118줄, `telegram.ts` 원시 diff 142줄.

---

## 1. 초크포인트 시그니처 — 두 쪽은 **추상화 층위가 다르다**

### 1-1. 시그니처 원문

| 저장소 | 파일:행 | 시그니처 |
|---|---|---|
| myFinance | `src/bot/utils/telegram.ts:56` | `sendHtml(bot: Bot, chatId: number, html: string): Promise<void>` |
| myFinance | `src/bot/utils/telegram.ts:37` | `replyHtml(ctx: Context, html: string): Promise<void>` |
| myFinance | `src/bot/utils/telegram.ts:17` | `escapeHtml(text: string): string` |
| myFinance | `src/bot/utils/telegram.ts:27` | `h: { b, i, code, pre }` — 각 `(text: string) => string` |
| myFitness | `src/bot/notifications/send.ts:77` | `sendToAll(bot: Bot, text: string): Promise<SendResult>` |
| myFitness | `src/bot/notifications/send.ts:98` | `sendToAllWithKeyboard(bot: Bot, text: string, keyboard: InlineKeyboard): Promise<SendKeyboardResult>` |
| myFitness | `src/bot/utils/telegram.ts:26` | `replyLong(ctx: Context, text: string, html = false): Promise<void>` |
| myFitness | `src/bot/utils/telegram.ts:6` | `mdToHtml(md: string): string` |
| myFitness | `src/bot/utils/telegram.ts:18` | `escapeHtml(text: string): string` |

myFitness 반환 타입 (`send.ts:13-22`):

```ts
export interface SendResult { sent: number; failed: number; total: number }
export interface SendKeyboardResult extends SendResult {
  first?: { chatId: string; messageId: number }
}
```

### 1-2. 층위 차이 — 이게 핵심이다

| | myFinance `sendHtml` | myFitness `sendToAll` |
|---|---|---|
| 수신자 | **인자로 받음** (`chatId: number`, 1건) | **자기가 조회** (`getChatIds()` ← env), N건 |
| chatId 타입 | `number` | `string` |
| chatId 루프 | **호출부가 돈다** | **초크포인트가 흡수** |
| 반환 | `void` | `SendResult { sent, failed, total }` |
| 실패 처리 | **호출부의 per-chat try/catch** | 초크포인트가 집계 |

`for (const chatId of …)` 실측 (`__tests__` 제외):

| | myFinance | myFitness |
|---|---|---|
| 호출부 chatId 루프 | **22곳** (notifications 20 + `lib/ai/advisor-monitor.ts` 1 + rsu 2 중복 포함) | **2곳 — 둘 다 `send.ts` 내부** |
| 그 중 per-chat try/catch | 21 / 22 | (초크포인트 내부) |

myFinance 22곳 전체 목록: `advisor-monitor.ts:220`, `rsu.ts:111,182`,
`quarterly-report.ts:37,52,66`, `monthly.ts:65`, `ta-signal-alert.ts:332`,
`budget-alert.ts:81,122`, `briefing.ts:69,91`, `daily.ts:132`,
`active-review.ts:123,140`, `alert-dispatcher.ts:122`, `monthly-report.ts:53,67`,
`quarterly.ts:105`, `custom-strategy-alert.ts:290`, `price-alert.ts:338`,
`networth-snapshot.ts:93`

→ **myFitness 의 초크포인트가 한 층 위다.** 동일 인터페이스로 묶으면 한쪽은 반드시 호출부를 고쳐야 한다.

### 1-3. chatId 목록 관리 — myFinance 는 4중 복제

`getAllowedChatIds()` 가 파일마다 private 로 재정의됨:

| 저장소 | 정의 지점 | 반환 |
|---|---|---|
| myFinance | `src/lib/cron.ts:14` | `number[]` |
| myFinance | `src/bot/notifications/budget-alert.ts:15` | `number[]` |
| myFinance | `src/bot/notifications/scheduler.ts:22` | `number[]` |
| myFinance | `src/app/api/alerts/history/[id]/retry/route.ts:30` | `number[]` (`!Number.isNaN` — 나머지 3개는 `!isNaN`) |
| myFinance | `src/bot/middleware/auth.ts:3` | `Set<number>` (인바운드 인가용, 별개 목적) |
| myFitness | `src/bot/notifications/send.ts:25` `getChatIds()` | `string[]` (**유일**) |
| myFitness | `src/bot/middleware/auth.ts:3` | (인바운드 인가용, 별개 목적) |

→ 아웃바운드 목적으로 **myFinance 4개 / myFitness 1개.** 4개는 로직 동일, `isNaN` vs `Number.isNaN` 만 다름.

---

## 2. 기능 매트릭스 — 정본 선택의 근거

`○` 있음 / `✕` 없음 / `△` 다른 방식

| 기능 | myFinance `sendHtml` | myFitness `sendToAll` | myFitness `sendToAllWithKeyboard` |
|---|---|---|---|
| 네트워크 재시도 백오프 | ○ `[2000, 8000, 30000]` ms, 4회 | ○ `[2000, 8000, 30000]` ms, 4회 | **✕ (주석에 명시: "재시도 로직 없이 단순 전송")** |
| 재시도 판정 | `isNetworkError` (`./error`) | `isNetworkError` (`../utils/error`) | — |
| HTML 파싱 실패 폴백 | ○ | ○ | **✕ (주석: "HTML fallback 없음")** |
| 폴백 판정 함수 | **로컬 `isParseError`** (`error_code===400` \|\| `can't parse`) | **`isHtmlParseError`** (공유, 정규식) | — |
| 폴백 시 재시도 예산 | 폴백 전송도 `withRetry` 재진입 | `attempt--` 로 **예산 소모 없이** plain 전환 | — |
| 4096자 초과 처리 | **○ 분할** (`splitMessage`, 줄 경계 보존) | **✕ 절단** (`truncate`, `slice(0, 4093) + "..."`) | **✕ 절단** |
| chatId 목록 조회 | ✕ (호출부) | ○ (env) | ○ (env) |
| 다중 수신자 루프 | ✕ (호출부) | ○ | ○ |
| 전송 결과 집계 | ✕ (`void`) | ○ `{sent, failed, total}` | ○ + `first` |
| messageId 반환 | ✕ | ✕ | ○ `first.messageId` |
| 인라인 키보드 | **✕ (초크포인트 밖 — `rsu.ts:184` 가 raw 호출)** | ✕ | ○ |
| 로그 마스킹 | ○ `sanitizeError` | ○ `sanitizeError` | ○ `sanitizeError` |

**한쪽에만 있는 기능:**
- myFinance 만: **메시지 분할** (myFitness 는 절단 → 4096 초과분 유실)
- myFitness 만: **결과 집계 `SendResult`**, **`messageId` 반환**, **키보드 전송**, **폴백 예산 보존**

→ 정본을 한쪽으로 고르면 **양쪽 다 기능이 빠진다.** 합집합 설계가 필요하다.

### 2-1. `SendResult` 는 장식이 아니다 — 실제로 분기·영속화된다

| 소비 지점 | 무엇을 하는가 |
|---|---|
| `scheduler.ts:35,39` | `total===0` → 대상 없음 로그 / `sent===0` → 실패 alert |
| `auto-adjust.ts:402,406` | 동일 분기 |
| `auto-adjust-cron.ts:79,83` | 동일 분기 |
| `lib/monitoring/admin-alerts.ts:233` | `delivered = r.sent > 0` → **rate-limit 상태 결정** |
| `auto-adjust.ts:413-419`, `auto-adjust-cron.ts:97-100` | `first.messageId` / `first.chatId` 를 **DB 에 저장** |

DB 스키마 실측 — `~/workspace/myFitness/prisma/schema.prisma:359-360`:

```prisma
  // Telegram callback 매칭용.
  telegramMessageId    String?
  telegramChatId       String?
  ...
  @@index([telegramMessageId])
```

myFinance `prisma/schema.prisma` 에는 `messageId` / `telegramMessageId` 필드 **0건**.

→ **`Promise<void>` 인터페이스는 myFitness 를 깨뜨린다.** 반환 타입은 협상 대상이 아니다.
   또한 messageId 가 **DB 인덱스**까지 걸려 있어, 채널 중립 어댑터는 불투명(opaque) 메시지 참조를
   반환하고 그 참조가 String 으로 영속화 가능해야 한다.

---

## 3. 호출자는 텔레그램을 아는가 — 어댑터 경계

### 3-1. myFinance `sendHtml` 호출 20건 — **형태가 100% 균일**

전 호출이 `await sendHtml(bot, chatId, <string>)` 단일 형태. 옵션 인자 0건.

```
src/bot/notifications/alert-dispatcher.ts:124:      await sendHtml(bot, chatId, safeMessage)
src/bot/notifications/briefing.ts:71:        await sendHtml(bot, chatId, html)
src/bot/notifications/daily.ts:134:      await sendHtml(bot, chatId, fullMessage)
src/bot/notifications/price-alert.ts:340:      await sendHtml(bot, chatId, combined)
src/lib/ai/advisor-monitor.ts:222:            await sendHtml(bot, chatId, message)
```

3번째 인자 표현식 분포 (20건): `message` 6, `fullMessage` 4, `html` 3, `fallback` 3,
`safeMessage` 1, `combined` 1, 멀티라인 2.

### 3-2. myFitness 호출 6건 — 결과를 받아 분기

```
src/bot/notifications/scheduler.ts:34:    const r = await sendToAll(bot, html);
src/bot/notifications/scheduler.ts:59:      await sendToAll(bot, `❌ ${label} 생성 실패\n${friendly}`);
src/bot/notifications/auto-adjust.ts:455:      await sendToAll(bot, `❌ Auto-adjust 알림 실패\n${friendly}`);
src/lib/monitoring/admin-alerts.ts:232:      const r = await sendToAll(bot, message);
src/bot/notifications/auto-adjust-cron.ts:78:  const sendResult = await sendToAllWithKeyboard(bot, message, keyboard);
src/bot/notifications/auto-adjust.ts:395:    const sendResult: SendKeyboardResult = await sendToAllWithKeyboard(
```

### 3-3. 텔레그램 고유 개념의 호출부 노출

```bash
grep -rn "parse_mode|reply_markup|InlineKeyboard|chat_id" $DIR/src --include='*.ts'
```

| 개념 | myFinance (src 전체 / notifications 내) | myFitness (src 전체 / notifications 내) |
|---|---|---|
| `parse_mode` | 15 / 2 | 8 / 2 |
| `reply_markup` | 29 / 1 | 12 / 2 |
| `InlineKeyboard` | 15 / 2 | 14 / 5 |
| `chat_id` (snake) | **0 / 0** | **0 / 0** |

`notifications/` 내 실제 노출 라인 (테스트 제외) — **전부 열거 가능한 소수**:

| 저장소 | 라인 | 성격 |
|---|---|---|
| myFinance | `rsu.ts:13,178,184,185,186` | **유일한 누수.** `InlineKeyboard` + raw `bot.api.sendMessage({parse_mode, reply_markup})` |
| myFinance | `alert-dispatcher.ts:111` | 주석뿐 |
| myFitness | `send.ts:6,51,53,101,110-112` | **초크포인트 내부** (정상) |
| myFitness | `auto-adjust.ts:9,62,63` | `buildAutoAdjustKeyboard()` — 키보드 **조립**은 호출부 |
| myFitness | `auto-adjust-callback.ts:308` | `ctx.editMessageReplyMarkup` — **인바운드** |

### 3-4. 초크포인트 커버리지 — raw `api.sendMessage` 분포

```bash
grep -rn "bot\.api\.sendMessage|api\.sendMessage(" $DIR/src --include='*.ts' | grep -v '/__tests__/'
```

| 저장소 | 총 raw 호출 | 초크포인트 내부 | 밖 (누수) |
|---|---|---|---|
| myFinance | 4 | 3 (`utils/telegram.ts`) | **1** (`notifications/rsu.ts:184`) |
| myFitness | 4 | 3 (`notifications/send.ts`) | **1** (`commands/start.ts:23` — 인바운드 `/help`) |

→ **아웃바운드 어댑터 경계는 실제로 깨끗하다.** 아웃바운드 알림 경로에서 초크포인트를 우회하는
   곳은 **myFinance `rsu.ts` 단 1곳**뿐이며, 그 이유는 "myFinance 초크포인트에 키보드 지원이 없어서"다.
   myFitness `commands/start.ts:23` 은 인바운드 `/help` 응답이라 알림 어댑터 범위 밖.

→ 단, 호출부는 여전히 **HTML 문자열**을 넘긴다. `parse_mode` 는 몰라도 콘텐츠 모델이 HTML 이다.
   Discord/Slack 로 바꾸려면 콘텐츠 모델까지 손대야 한다. §5 참조.

---

## 4. `src/bot/utils/error.ts` — diff 118줄의 98%는 껍데기

### 4-1. export 목록 — **완전히 동일 (5/5)**

| export | myFinance 행 | myFitness 행 |
|---|---|---|
| `sanitizeMessage(msg: string): string` | 19 | 11 |
| `sanitizeError(err: unknown): string` | 27 | 15 |
| `getErrorCode(err: unknown): string \| undefined` | 55 | 41 |
| `isNetworkError(err: unknown): boolean` | 78 | 60 |
| `isHtmlParseError(err: unknown): boolean` | 98 | 82 |

**한쪽에만 있는 export: 없음.**

> `measured-facts.md` 는 diff 118줄만 기록했다. 실제 시그니처는 5개 전부 일치한다.
> 118줄 중 대부분은 myFinance 쪽 JSDoc 주석(12줄)과 세미콜론·따옴표 스타일 차이다.

### 4-2. 정규화 diff — 주석·세미콜론·따옴표 제거 후

```bash
norm() { sed -E 's://.*$::; s:/\*.*\*/::' "$1" | sed -E '/^\s*\*/d; /^\s*\/\*/d' \
  | tr -d ';' | tr "'" '"' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//' | grep -v '^$'; }
```

| | 원시 diff | 정규화 후 줄수 | 정규화 diff |
|---|---|---|---|
| `error.ts` | 118줄 | fin 89 / fit 77 | **20줄** |

그 20줄 중 **실제 동작 차이는 단 2건**:

| # | 차이 | myFinance | myFitness | 영향 |
|---|---|---|---|---|
| 1 | `NETWORK_CODES` 에 `ENOTFOUND` | **있음 (7개)** | 없음 (6개) | myFitness 는 DNS 일시 실패를 재시도하지 않음 |
| 2 | `sanitizeError` 최종 마스킹 | `return sanitizeMessage(parts.join(" | "))` | `return parts.join(" | ")` | myFitness 는 **join 단계 토큰 누출 이중 보호가 없음** |

나머지 18줄은 전부 주석(myFinance 만 12줄 JSDoc).

### 4-3. 각 export 의 실제 참조 수 (`error.ts` 자신 제외, src 전체)

| export | myFinance | myFitness |
|---|---|---|
| `sanitizeError` | 29 | 33 |
| `isNetworkError` | 2 | 2 |
| `isHtmlParseError` | **0** | 2 |
| `sanitizeMessage` | **0** | **0** |
| `getErrorCode` | **0** | **0** |

→ **myFinance 의 `isHtmlParseError` 는 죽은 export 다.** `telegram.ts:79` 가 별도의 로컬
   `isParseError`(400 코드 기반)를 쓴다. 즉 **두 저장소는 HTML 파싱 실패를 다른 기준으로 판정한다.**
→ `sanitizeMessage` / `getErrorCode` 는 양쪽 다 내부 전용. `@pleiades/notify` 공개 API 에서 뺄 수 있다.

---

## 5. `src/bot/utils/formatter.ts` — **같은 이름, 다른 파일. 중복이 아니다**

| | myFinance (78줄) | myFitness (31줄) |
|---|---|---|
| 성격 | **금액·수익률 포맷 + 메시지 분할** | **거리·페이스·시간 포맷** |
| exports | `accountEmoji`, `formatKRWCompact`, `formatKRWFull`, `formatPercent`, `formatSignedKRW`, `formatSignedKRWCompact`, `profitEmoji`, `formatUSD`, **`splitMessage`** | `fmtDistance`, `fmtPace`, `fmtDuration`, `fmtSleepTime`, `fmtTime` |
| 겹치는 export | **0개** | **0개** |

> **정정 대상.** `measured-facts.md` 는 `src/bot/utils/{error,formatter,telegram}.ts` 를
> "같은 목적의 파일이 양쪽에 존재 — 공유 패키지(B1) 후보"로 묶었다.
> `formatter.ts` 는 **이름만 같고 도메인 포맷터다. 공유 후보가 아니다.**
> 단 myFinance `formatter.ts:52` 의 `splitMessage` 하나만 채널 중립이며 추출 대상이다.

### 5-1. 메시지 분할 — myFitness 에 "대응물"은 있으나 위치도 정책도 다르다

| | myFinance `splitMessage` | myFitness `splitMessage` |
|---|---|---|
| 위치 | `src/bot/utils/formatter.ts:52` — **export** | `src/bot/utils/telegram.ts:38` — **비 export (모듈 private)** |
| 시그니처 | `(text, maxLength = 4096): string[]` | `(text, maxLength): string[]` |
| 알고리즘 | 줄 단위 누적, `maxLength` 초과 줄은 하드 슬라이스 | `lastIndexOf("\n", maxLength)`, 경계가 절반 미만이면 하드 컷 |
| 아웃바운드에서 쓰이나 | **○** (`sendHtml`, `replyHtml` 둘 다) | **✕ — `replyLong`(인바운드)에서만** |
| 아웃바운드 길이 정책 | **분할** | **절단** (`send.ts:35 truncate` → `slice(0, 4093) + "..."`) |
| 참조 수 | 8 | 2 |

→ **myFitness 아웃바운드는 4096자 초과 알림 내용을 조용히 버린다.** 통합 어댑터가 myFinance
   방식(분할)을 채택하면 이건 기능 개선이지만 **동작 변경**이다 (사용자에게 메시지 수가 늘어난다).

---

## 6. 그 밖 — 어댑터 표면에 얹힐 후보

### 6-1. HTML 헬퍼 사용량

```bash
grep -rl "\bescapeHtml\b" $DIR/src --include='*.ts' | wc -l
grep -rn "\bh\.\(b\|i\|code\|pre\)(" $DIR/src --include='*.ts' | wc -l
```

| | myFinance | myFitness |
|---|---|---|
| `escapeHtml` 정의 지점 | 1 (`utils/telegram.ts:17`) | **2** (`utils/telegram.ts:18`, `notifications/auto-adjust.ts:112` — 로직 동일, 인자명만 다름) |
| `escapeHtml` 사용 파일 / src ts 파일 | **26 / 264** | **3 / 154** |
| `escapeHtml` 참조 라인 | 117 | 19 |
| `h.b/h.i/h.code/h.pre` 참조 라인 / 파일 | **91 / 19파일** | **0 / 0** (`h` 헬퍼 없음) |
| md→HTML 변환기 | `utils/markdown.ts` `markdownToTelegramHtml` (103줄, 표→리스트 변환 포함) + `stripHtml` | `utils/telegram.ts:6` `mdToHtml` (10줄, 정규식 7개) |
| 변환기 참조 라인 | 13 | 9 |

→ **`h` 헬퍼는 myFinance 전용 관용구(91회)다.** 채널 중립 어댑터로 옮기려면
   myFinance 19개 파일이 어댑터에 의존하게 된다 — 어댑터 표면이 "전송"을 넘어 "포매팅"으로 넓어진다.
→ md→HTML 변환기는 **역량 차가 크다** (103줄 vs 10줄). myFinance 쪽이 표 변환·코드블록·
   인용·취소선까지 처리. 정본은 myFinance.

### 6-2. HTML 이스케이프 상태가 DB 에 섞여 있다 (myFinance)

`alert-dispatcher.ts:100,117-119` / `client-utils.ts:43,56` / `csv-format.ts:46,76`
— `PRE_ESCAPED_KINDS = {target_hit, stop_loss, watch_buy, watch_zone}` 가 3개 파일에 중복 정의되어 있고,
저장된 alert 메시지가 kind 에 따라 **이미 escape 된 상태 / raw 상태로 혼재**한다.
전송 직전 `decodeHtmlEntities` → `escapeHtml` round-trip 을 kind 로 gating 한다.

→ **HTML 은 myFinance 에서 전송 포맷을 넘어 저장 포맷이다.** 채널 중립화(Discord 마크다운 등)는
   봇 코드뿐 아니라 alert 히스토리 테이블의 저장 규약과 웹 UI(`app/alerts/history`), CSV export 까지
   건드린다. 단계 1 범위에서 **명시적으로 제외**해야 할 영역.

---

## 7. 설계 함의 요약

| # | 발견 | 뒤집는 가정 |
|---|---|---|
| A | 두 초크포인트의 **추상화 층위가 다르다** (per-chat vs broadcast). 호출부 chatId 루프 myFinance 22 / myFitness 2 | "아웃바운드는 어댑터 교체" — 한쪽은 **호출부 마이그레이션**이 붙는다 |
| B | `SendResult` 와 `messageId` 가 **분기 5곳 + DB 컬럼 2개 + 인덱스 1개**로 영속화됨 | `Promise<void>` 시그니처를 정본으로 못 쓴다 |
| C | 길이 정책이 **분할(fin) vs 절단(fit)** 로 상반됨 | "두 구현이 사실상 같다" |
| D | `error.ts` 정규화 diff **20줄, 실동작 차 2건** | "diff 118줄 = 갈라진 파일" — 사실상 같은 파일 |
| E | myFinance `isHtmlParseError` **참조 0건** (로컬 `isParseError` 사용) | 두 저장소가 HTML 실패를 같은 기준으로 판정한다는 가정 |
| F | `formatter.ts` 는 **겹치는 export 0개** — 이름만 같음 | "중복 모듈 = B1 공유 후보" 목록에서 제외해야 함 |
| G | myFitness `sendToAllWithKeyboard` 는 **재시도·폴백 둘 다 없음** | "키보드 전송은 일반 전송의 확장" |
| H | myFinance `h` 헬퍼 **91회/19파일**, myFitness 0 | 어댑터 표면을 "전송"으로 좁게 잡으면 myFinance 쪽 이득이 작다 |
| I | HTML 이 myFinance 의 **저장 포맷** (`PRE_ESCAPED_KINDS`) | 채널 중립화가 봇 코드 안에서 끝난다 |
