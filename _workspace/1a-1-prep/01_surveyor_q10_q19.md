# 실측 C — Q10 · Q19 의 DB 없이 알 수 있는 정적 근거

- **이슈**: pleiades #37 (1a-1 준비 결정 문서) Phase 1 실측 C
- **측정일**: 2026-09-09
- **대상 (모드 I — 통합 로드맵용이므로 worktree)**:
  | 저장소 | 경로 | ref | HEAD |
  |---|---|---|---|
  | myFinance | `~/workspace/pleiades/repos/myFinance` | `integration/pleiades` | `654215240cb3ddfa4c9bf0db3181c86642fee985` |
  | myFitness | `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` | `626a2016b30b9b79bc89ae7fb8080ea4d6187cbb` |
  둘 다 `git status --porcelain` 빈 결과(clean).
- **읽기 전용.** 두 저장소에 쓰기·빌드·설치 없음. 서버·DB 접근 없음.
- **`grammy` 소스는 워킹트리 전용 데이터**(`node_modules/`)라 ref 지정이 불가하다. 위 ref 가
  체크아웃돼 있고 clean 임을 확인한 뒤 `repos/myFinance/node_modules/grammy` 를 읽었다 (v1.44.0).

---

## ⚠ 뒤집힌 가정

### ① 절단·분할·폴백은 **로그를 하나도 남기지 않는다** → "서버 로그로 사후 계량" 경로는 존재하지 않는다

측정 요청은 *"절단 시 로그·카운터가 남으면 서버 로그로 사후 계량 가능 → Q14 없이 근거 확보 경로가 생긴다"* 를 전제했다.
**남지 않는다.** 네 지점 전부 무음이다.

| 지점 | 파일:줄 | 로그 |
|---|---|---|
| fit 절단 | `myFitness src/bot/notifications/send.ts:35-37` (`truncate`) | **없음** |
| fit plain 폴백 | `myFitness src/bot/notifications/send.ts:56-62` (`useHtml=false; attempt--; continue;`) | **없음** |
| fin 분할 | `myFinance src/bot/utils/formatter.ts:52-78` (`splitMessage`) | **없음** (파일 전체 `console.` 0건) |
| fin plain 폴백 | `myFinance src/bot/utils/telegram.ts:43-48`(inbound) · `:66-71`(outbound) | **없음** |

두 저장소에서 로그가 나오는 곳은 **재시도**(`fin telegram.ts:113` · `fit send.ts:68`)와 **전송 실패**
(`fit send.ts:87`·`:118`)뿐이다. 길이·폴백은 그 어느 것도 아니다.

→ **Q10 을 로그로 계량하려면 계측 코드를 먼저 넣어야 한다.** 그것 자체가 두 실서비스 저장소에 대한
쓰기이고 배포다. "Q14 없이 로그로 우회" 는 **현재 코드에서는 성립하지 않는다.**

### ② 003 §3-1 이 대비시킨 두 폴백 구현은 **둘 다 myFinance 파일**이고, 엔티티 디코드본은 **죽은 코드**다

003 §3-1(562-567행)은 `utils/telegram.ts:69`(태그만) 와 `utils/markdown.ts:96-103` `stripHtml`(태그+엔티티 디코드)을
대비시키며 *"어느 쪽을 고르든 **한쪽 저장소의** 폴백 출력이 관측 가능하게 바뀐다"* 고 적었다. 실측 결과:

- **두 경로 모두 myFinance 안에 있다.** myFitness 에는 `src/bot/utils/markdown.ts` 가 **존재하지 않는다**
  (`myFitness/src/bot/utils/` = `error.ts`, `formatter.ts`, `telegram.ts` 3개뿐).
- `myFinance src/bot/utils/markdown.ts:97 stripHtml` 의 **import 는 0건**이다.
  `../utils/markdown` / `@/bot/utils/markdown` 를 import 하는 6개 지점은 **전부 `markdownToTelegramHtml`** 만 가져간다
  (`commands/ai.ts:13` · `commands/briefing.ts:5` · `notifications/active-review.ts:12` ·
  `notifications/briefing.ts:10` · `notifications/monthly-report.ts:9` · `notifications/ta-signal-alert.ts:13`).
  `import ... stripHtml` 은 src 전체에서 1건이고 그것은 **다른 함수**다
  (`app/alerts/history/client-utils.ts:27` 의 동명 웹 UI 함수 — 자체 정의).

→ **`stripHtml` 은 봇 경로에서 한 번도 실행되지 않는 export 다.** 003 의 대비는 "라이브 구현 vs 라이브 구현"이 아니라
**"라이브 구현 vs 죽은 export"** 였다. "한쪽 저장소의 출력이 바뀐다"는 서술은 **불성립**한다 — 정확한 서술은 ③ 이다.

### ③ fit 아웃바운드 폴백이 보는 HTML 엔티티는 **0건** → Q10 의 plain 절반은 **fin 단독 · 단방향 결정**

폴백이 태그만 벗기느냐 엔티티까지 디코드하느냐는 **본문에 엔티티가 있을 때만** 관측 가능하다.

| | myFinance | myFitness |
|---|---|---|
| 엔티티 생성 함수 | `escapeHtml` (`bot/utils/telegram.ts:17-22`) + **`markdownToTelegramHtml` (`bot/utils/markdown.ts:59-61`)** | `escapeHtml` 2벌 (`bot/utils/telegram.ts:18-23`, `bot/notifications/auto-adjust.ts:112-116`) |
| `escapeHtml(` 호출 줄 / 파일 (정의·테스트 제외) | 87 / 23 | **16 / 2** |
| 그중 **아웃바운드** (`src/bot/notifications`) | **18줄** | 16줄 (`auto-adjust.ts` 11 · `auto-adjust-cron.ts` 5) |
| 엔티티를 만드는 **아웃바운드 모듈** | **11** (아래 열거) | 2 |
| **그중 plain 폴백 경로에 도달하는 것** | **11** (`sendHtml` → `telegram.ts:66-71`) | **0** |

myFinance 11개 모듈 열거 (`escapeHtml(` 또는 `markdownToTelegramHtml` 참조, `src/bot/notifications`):
`active-review.ts` · `alert-dispatcher.ts` · `briefing.ts` · `budget-alert.ts` · `custom-strategy-alert.ts` ·
`monthly-report.ts` · `monthly.ts` · `price-alert.ts` · `quarterly.ts` · `rsu.ts` · `ta-signal-alert.ts`.

**myFitness 가 0 인 이유 (경로 추적):** fit 의 엔티티 생성 지점 16줄은 전부 `auto-adjust.ts` / `auto-adjust-cron.ts` 이고,
이 둘의 전송은 **`sendToAllWithKeyboard`** 다 (`auto-adjust-cron.ts:78`, `auto-adjust.ts:395`) —
그 함수에는 **HTML 폴백이 없다** (`send.ts:98` 주석 *"HTML fallback 없음"*, 본문 `:104-121` 에 폴백 분기 부재).
폴백이 있는 `sendToAll` 로 가는 4개 호출의 본문은 전부 엔티티를 만들지 않는다:

| `sendToAll` 호출 | 본문 | 엔티티 |
|---|---|---|
| `scheduler.ts:34` | `` `${emoji} <b>${label}</b>\n\n${mdToHtml(report)}` `` — `mdToHtml`(`utils/telegram.ts:6-15`)은 **이스케이프하지 않는다**(정규식 7개 전부 태그 생성) | 0 |
| `scheduler.ts:59` · `auto-adjust.ts:455` | `formatUserFriendlyError(error)` = **정적 한국어 문자열 6종**(`lib/monitoring/admin-alerts.ts:137-153`) | 0 |
| `admin-alerts.ts:232` | `opts.buildMessage(errSnippet, kst)` 3벌(`:274`·`:295`·`:317`) — `<b>`/`<code>` 직타 + **이스케이프 안 한 `errSnippet`** | 0 |

→ 정확한 서술: **태그-only 를 정본으로 고르면 두 저장소 모두 동작 변경 0.
엔티티 디코드를 고르면 myFinance 만 바뀌고(11개 모듈) myFitness 는 여전히 0 이다.**
Q10 의 plain 절반은 "저장소 간 절충"이 아니라 **fin 한쪽의 개선을 넣을지 말지**다.

### ④ Q19 — raw `error.message` 에는 **봇 토큰도 chat id 도 들어가지 않는다**. 그리고 `sanitizeError` 는 축소가 아니라 **확장**이다

⑤ 절 참조. 두 갈래 모두 003 의 Q19 서술 전제를 바꾼다.

---

## Q10-a. fit 절단의 실제 위치와 관측 가능성

### a-1. 절단 코드

```bash
git -C ~/workspace/pleiades/repos/myFitness grep -n --text "4096\|MAX_LENGTH\|truncate" \
  integration/pleiades -- 'src/**/*.ts' | cut -d: -f2-
```

`myFitness src/bot/notifications/send.ts:9,35-37`:

```ts
const MAX_MSG = 4096;
...
function truncate(text: string): string {
  return text.length > MAX_MSG ? text.slice(0, MAX_MSG - 3) + "..." : text;
}
```

| 항목 | 값 |
|---|---|
| 방식 | **하드 슬라이스 + 말줄임 표시** — `slice(0, 4093) + "..."` (줄·태그 경계 무시) |
| 적용 지점 | **3곳** — `send.ts:44`(html), `:45`(plain 폴백), `:104`(키보드 전송) |
| 로그·카운터 | **없음** (①) |
| 관측 흔적 | **전송된 메시지 말미의 `"..."`** — 텔레그램 대화에만 남는다. 로그·DB 에는 없다 |

**태그 절단 위험 (부수 발견).** `send.ts:44` 는 **HTML 을 먼저 자른다** — 4093자 경계가 태그 중간이면
`<b` 같은 조각이 남아 파싱 실패 → `isHtmlParseError` → plain 폴백. 반면 `:45` 의 plain 은
**태그를 벗긴 뒤 자른다**. 즉 절단과 폴백이 서로 맞물려 있고, 이 경로 역시 무음이다.

### a-2. fit 아웃바운드 6 호출 / 4 모듈의 본문 생성부 — 템플릿 vs LLM

측정 대상은 measured-facts 2346행의 **4 모듈 / 6 호출**이다.

| # | 호출 | 본문 생성 | 분류 | 정적 상한 |
|---|---|---|---|---|
| 1 | `scheduler.ts:34` | `generate()` = `generateMorningReport`/`generateEveningReport`/`generateWeeklyReport` → `lib/daily-report.ts:99 askAdvisor(prompt, …)` | **LLM** | **없음** |
| 2 | `scheduler.ts:59` | `formatUserFriendlyError` (`admin-alerts.ts:137-153`) | 정적 문자열 6종 | ~60자 + 라벨 |
| 3 | `auto-adjust.ts:395` | `formatAutoAdjustMessage` (`auto-adjust.ts:166-233`) | **템플릿** | 아래 |
| 4 | `auto-adjust.ts:455` | `formatUserFriendlyError` | 정적 문자열 6종 | ~60자 |
| 5 | `auto-adjust-cron.ts:78` | 템플릿 (`auto-adjust-cron.ts:35-51`) | **템플릿** | 아래 |
| 6 | `admin-alerts.ts:232` | `buildMessage` 3벌 (`:274`·`:295`·`:317`) | **템플릿** | **≈ 200자 + 고정 6~7줄** — `errSnippet = errMsg.slice(0, 200)` (`admin-alerts.ts:190`) |

**→ 4096 을 넘길 수 있는 것은 6개 중 `scheduler.ts:34` 하나뿐이다.**

**LLM 경로의 정적 상한 (요청 2의 핵심):**

```bash
git -C <repo> grep -n --text 'max_tokens\|maxTokens\|max_output_tokens' integration/pleiades -- 'src'
```

| 항목 | myFitness | myFinance |
|---|---|---|
| `max_tokens` / `maxTokens` / `max_output_tokens` | **0건** | **0건** |
| 프롬프트의 **문자 수** 지시 | **0건** | **0건** |
| 프롬프트의 **줄 수** 지시 | **0건** — `lib/ai/system-prompt.ts:121` 의 `- 간결하게 핵심만` 같은 정성 문구뿐 | **2건** — `notifications/active-review.ts:69` `'리뷰 구성 (총 6~8줄, 간결하게):'` · `notifications/ta-signal-alert.ts:302` `'1~2줄 가이드'` |

```bash
git -C <repo> grep -n --text -iE '자 이내|글자|이내로|짧게|간결|characters|줄 이내|줄로' \
  integration/pleiades -- 'src/lib/ai' 'src/bot/notifications' 'src/bot/commands' | cut -d: -f2- | grep -v '__tests__'
```

→ **LLM 출력 길이에는 정적 상한이 존재하지 않는다.** 양쪽 모두 토큰 상한이 없고 문자 수 지시도 없다.
fin 의 줄 수 지시 2건은 **프롬프트 문구일 뿐 강제가 아니고**, 애초에 fit 의 초과 후보인 `scheduler.ts:34` 와 무관하다.
`4096자 초과 가능성`을 정적으로 배제할 수 없고, 반대로 빈도도 정적으로는 알 수 없다.

**템플릿 3·5 의 상한 유도 (근거 줄 명시):** 필드 수는 유한하다 —
`formatAutoAdjustMessage` 는 고정 줄 8 + `topFactors.slice(0, 3)`(`auto-adjust.ts:211`) + `reason`(`:228`) + `rationale`(`:229`).
`rationale` 은 **LLM 이 아니라 규칙 생성**이다 (`lib/training/workout-recommender.ts:169-191 rationaleFor` — 라벨 조합 템플릿).
다만 `intervalDesc`·`zone`·`label`·`detail` 은 Prisma `String?` 이고 **`@db.VarChar` 제약이 0건**이라
(`prisma/schema.prisma:317,344,351`) **하드한 문자 수 상한은 유도되지 않는다.** 필드가 유한·짧은 라벨이라 4096 도달은
이상값에서만 가능하다 — 이 문서는 그 이상의 수치를 만들지 않는다.

### a-3. fin 분할 지점

`myFinance src/bot/utils/formatter.ts:50-78`:

| 항목 | 값 |
|---|---|
| 상수 | `TELEGRAM_MAX_LENGTH = 4096` (`:50`) — 아웃바운드·인바운드 **공유** |
| 알고리즘 | 줄(`\n`) 누적. 한 줄이 한도 초과면 `:62-64` 하드 슬라이스 |
| 호출 지점 | `telegram.ts:38`(`replyHtml`, 인바운드) · `telegram.ts:61`(`sendHtml`, 아웃바운드) |
| 분할 시 로그 | **없음** (①) |
| 관측 흔적 | 메시지 **개수 증가**. 로그·DB 에는 없다 |

### a-4. Q14 없이 갈 수 있는 최대 지점 — 그리고 Q14 가 열릴 때의 최소 질의

정적으로 좁혀진 결과: **길이 분포가 필요한 대상은 fit `scheduler.ts:34` 하나이고, 나머지 5 호출은 정적으로 안전하다.**
그 하나의 원문은 **이미 fit DB 에 저장돼 있다**:

`lib/daily-report.ts:109-114` 가 `prisma.aIAdvice.create({ data: { category, reportDate, prompt, response: result } })`
— `response` 가 절단 **이전**의 리포트 본문이다 (`prisma/schema.prisma:228-238 model AIAdvice`,
`deleteMany` 후 create 이므로 `(category, reportDate)` 당 1행).

→ **Q14 가 승인되면 필요한 질의는 단일 테이블·단일 컬럼의 길이 집계 하나다** (`AIAdvice.response`,
`category IN ('morning_report','evening_report','weekly_report')`). chat id·개인 식별자 불필요.
**주의:** 전송본은 `` `${emoji} <b>${label}</b>\n\n${mdToHtml(report)}` `` (`scheduler.ts:33`)이라
`length(response)` 는 **하한**이다 — `mdToHtml` 이 태그를 추가한다.
이 문서는 그 분포를 **재지 않았다** (DB 접근 금지).

---

## Q10-b. plain 폴백 차이의 관측 범위

### b-1. 폴백 트리거 조건 (요청 4)

| | myFinance | myFitness |
|---|---|---|
| 판정 함수 | **로컬** `isParseError` (`bot/utils/telegram.ts:79-88`) | **공유** `isHtmlParseError` (`bot/utils/error.ts`) |
| 조건 | `error_code === 400` **또는** `error.message.includes("can't parse")` | 정규식 (measured-facts 기록) |
| 공유 `isHtmlParseError` 참조 | **0건 (죽은 export)** | 2건 |
| 폴백 시 재시도 예산 | 폴백도 `withRetry` **재진입** (`telegram.ts:68`) | `attempt--` 로 **예산 보존** (`send.ts:61`) |
| **폴백 발생 로그** | **없음** | **없음** |

→ **폴백 발생 빈도도 로그로 계량할 수 없다** (①). fin·fit 모두.

### b-2. 폴백 함수 원문 (요청 6)

**myFinance — 아웃바운드 (라이브).** `src/bot/utils/telegram.ts:63-72`:
```ts
      try {
        await withRetry(() => bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' }))
      } catch (error) {
        if (isParseError(error)) {
          const plain = chunk.replace(/<[^>]+>/g, '')
          await withRetry(() => bot.api.sendMessage(chatId, plain))
        } else {
          throw error
        }
      }
```
(인바운드 `replyHtml` `:40-49` 도 **같은 인라인 식** `chunk.replace(/<[^>]+>/g, '')`.)

**myFinance — `stripHtml` (죽은 export, importer 0).** `src/bot/utils/markdown.ts:93-103`:
```ts
/**
 * HTML 태그 + 엔티티를 제거하여 plain text로 변환.
 * parse_mode: 'HTML' 실패 시 fallback용.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
```
주석이 *"fallback용"* 이라고 선언하지만 **폴백 경로가 이 함수를 부르지 않는다.**

**myFitness — 아웃바운드 (라이브).** `src/bot/notifications/send.ts:45`:
```ts
  const plain = truncate(htmlText.replace(/<[^>]*>/g, ""));
```
(인바운드 `utils/telegram.ts:33` 도 `chunk.replace(/<[^>]*>/g, "")`.)

**세 구현의 실제 차이:**

| | 태그 제거 | 엔티티 디코드 | 라이브 |
|---|---|---|---|
| fin `telegram.ts:44,67` | `/<[^>]+>/g` | ✕ | **○** |
| fit `send.ts:45` (+ `telegram.ts:33`) | `/<[^>]*>/g` | ✕ | **○** |
| fin `markdown.ts:97-103` | `/<[^>]*>/g` | **○** | **✕ (importer 0)** |

→ **라이브 구현 둘은 정규식 수량자(`+` vs `*`)만 다르다.** 차이가 나는 입력은 리터럴 `<>` 뿐
(`+` 는 미매치, `*` 는 제거). **엔티티 처리는 라이브 두 구현이 동일하게 "안 한다".**

### b-3. 엔티티 생성 지점 수 (요청 5 — 핵심)

⚠ 뒤집힌 가정 ③ 표가 정본. 요약:

| | fin | fit |
|---|---|---|
| `escapeHtml(` 호출 줄 (전체, 정의·테스트 제외) | **87** | **16** |
| 같은 항목, 파일 | 23 | 2 |
| **아웃바운드**(`src/bot/notifications`) 호출 줄 | **18** | 16 |
| 엔티티 생성 **아웃바운드 모듈** | **11** | 2 |
| **plain 폴백 경로에 도달하는 모듈** | **11** | **0** |

fin 은 `escapeHtml` 외에 **`markdownToTelegramHtml` 자체가 `&`/`<`/`>` 를 이스케이프한다**
(`bot/utils/markdown.ts:59-61`) — 그래서 AI 리포트 4모듈도 엔티티 생성원이다.
fit 의 `mdToHtml` 은 **이스케이프하지 않는다** (`bot/utils/telegram.ts:6-15`).

**판정:** *"엔티티가 0 이면 두 폴백 구현의 출력 차이는 관측 불가"* 라는 요청의 기준으로,
**fit 은 0 이다** → fit 에서 plain 폴백 정본 선택은 **동작 변경 아님**.
**fin 은 0 이 아니다**(11 모듈 / 18+ 지점) → fin 에서만 관측 가능한 변경.
즉 Q10 의 plain 절반은 **"양쪽 저장소 절충"에서 "fin 단독 개선 여부"로 축소**된다.

---

## Q19. `lastError` 의 흐름과 위험

### 19-1. 쓰기 4줄 · 읽기 5 표면 (요청 7 — 재측정, 행번호 갱신)

```bash
git -C ~/workspace/pleiades/repos/myFinance grep -n --text 'lastError' integration/pleiades -- 'src' \
  | cut -d: -f2- | grep -v '__tests__'
git -C ~/workspace/pleiades/repos/myFinance grep -n --text 'errorMessage' integration/pleiades -- 'src' \
  | cut -d: -f2- | grep -v '__tests__'
```

**쓰기 (raw `error.message` 캡처) — 4곳.** 전부 동일 식 `error instanceof Error ? error.message : String(error)`:

| # | 파일:줄 | 비고 |
|---|---|---|
| 1 | `bot/notifications/alert-dispatcher.ts:127` | measured-facts M3 는 `:126`(catch 줄). **대입은 `:127`** |
| 2 | `bot/notifications/custom-strategy-alert.ts:295` | M3 `:294` |
| 3 | `bot/notifications/price-alert.ts:343` | M3 `:342` |
| 4 | `bot/notifications/ta-signal-alert.ts:337` | M3 `:336` |

> **정정 (2026-09-09 재측정).** measured-facts M3 표 C 행의 4개 행번호는 **`catch` 줄**이고
> **대입 줄은 각각 +1** 이다. 두 값은 인접해 있어 결론은 바뀌지 않는다. 1a-4 가 편집할 줄은 위 표다.

**읽기 — 5 표면** (measured-facts 발견 20 의 4 표면 + API body):

| 표면 | 위치 |
|---|---|
| DB 쓰기 | `bot/notifications/alert-history.ts:63,76` → `prisma/schema.prisma:344 errorMessage String?` |
| API 응답 (history) | `app/api/alerts/history/route.ts:77` |
| **화면 1** | `app/alerts/history/AlertHistoryClient.tsx:448-449` (`↳ {r.errorMessage}`) |
| **화면 2** | `components/alerts/AlertHistoryDetailModal.tsx:101-103` (`에러: {row.errorMessage}`) |
| **CSV** | `app/api/alerts/history/export/csv-format.ts:19`(헤더)·`:131`(타입)·`:146`(값) |
| **API 응답 (retry, DB 미경유 직접 반환)** | `app/api/alerts/history/[id]/retry/route.ts:82` (`lastError: result.lastError ?? null`) |

→ **retry 경로는 DB 를 거치지 않고 `lastError` 를 응답 body 로 바로 내보낸다.** 발견 20 의 "DB → UI → CSV" 3단
서술에 **API 계약 1개가 더 있다** (measured-facts M1-B 는 이미 *"DB + API 계약"* 으로 적었다 — 발견 20 쪽 서술만 좁다).

### 19-2. raw `error.message` 가 실제로 담을 수 있는 것 (요청 8 — 핵심)

**grammY 1.44.0** (`repos/myFinance/node_modules/grammy/package.json`), `out/core/error.js`:

`GrammyError` — `out/core/error.js:19-36, 38-48`:
```js
class GrammyError extends Error {
    constructor(message, err, method, payload) {
        super(`${message} (${err.error_code}: ${err.description})`);
        this.method = method;
        this.payload = payload;      // ← chat_id·text 는 여기. message 가 아니다
        ...
function toGrammyError(err, method, payload) {
    ...
    return new GrammyError(`Call to '${method}' failed!`, err, method, payload);
}
```
→ `message` = `` Call to '<method>' failed! (<error_code>: <description>) ``.
**포함: 메서드명·에러코드·텔레그램 description. 미포함: 봇 토큰, chat id.**
호출 payload(= `chat_id`, `text`)는 **`.payload` 프로퍼티**에만 있고 `message` 에 직렬화되지 않는다.

`HttpError` — `out/core/error.js:62-70, 76-82`:
```js
function toHttpError(method, sensitiveLogs, err) {
    let msg = `Network request for '${method}' failed!`;
    if (isTelegramError(err))
        msg += ` (${err.status}: ${err.statusText})`;
    if (sensitiveLogs && err instanceof Error)
        msg += ` ${err.message}`;      // ← 토큰이 들어올 수 있는 유일한 경로
    return new HttpError(msg, err);
}
```

**`sensitiveLogs` 판정:**

| 항목 | 값 | 근거 |
|---|---|---|
| grammY 기본값 | **`false`** | `out/core/client.js:82` — `sensitiveLogs: options.sensitiveLogs ?? false` |
| myFinance 설정 | **미설정** (`client: { baseFetchConfig, timeoutSeconds }` 만) | `src/bot/index.ts:39-44`, `grep 'sensitiveLogs' src` → **0건** |
| myFitness 설정 | **미설정** (동일 형태) | `src/bot/index.ts:36-41`, `grep` → **0건** |

**또한** `new Error(\`…${chatId}…\`)` 형태로 chat id 를 메시지에 넣어 던지는 코드는 fin src 전체에서 **0건**이다
(`git grep -nE 'new Error\(`[^`]*\$\{[^}]*(chatId|token|Token)'` → 빈 결과).

**→ Q19 위험 판정: 현행 유지는 `CLAUDE.md` 컨벤션(형식) 위반이지, 실측 가능한 비밀 노출 경로가 아니다.**
현재 구성(sensitiveLogs 미사용)에서 `lastError` 에 봇 토큰·chat id 가 들어가는 경로는 **발견되지 않았다.**
남는 실질 노출은 **텔레그램 description 원문**(예: `Bad Request: chat not found`)과
**비-grammY 예외**(Prisma 등)의 message 가 웹 UI·CSV 에 그대로 뜨는 것이다.

> **단서.** 이 판정은 **`sensitiveLogs` 가 꺼져 있다는 사실에 전적으로 의존한다.** 누가 디버깅용으로
> `client: { sensitiveLogs: true }` 를 켜면 `HttpError.message` 에 내부 fetch 에러 메시지(URL = `…/bot<TOKEN>/…`)가
> 붙고, **`lastError` 는 마스킹을 하지 않으므로 토큰이 DB·화면·CSV·API 로 나간다.** 그때는 즉시 노출 경로가 된다.

### 19-3. `sanitizeError` 는 마스킹이 아니라 **체인 확장 + 마스킹**이다 (⚠)

`myFinance src/bot/utils/error.ts:8, 19-53`:
```js
const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g

export function sanitizeMessage(msg: string): string {
  return msg.replace(TOKEN_RE, 'bot<REDACTED>')
}

export function sanitizeError(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  ...
    if (cur instanceof Error) {
      parts.push(`${cur.name}: ${sanitizeMessage(cur.message)}`)
      const withInner = cur as { error?: unknown; cause?: unknown }
      cur = withInner.error ?? withInner.cause     // ← 깊이 5까지 순회
  ...
  return sanitizeMessage(parts.join(' | '))
}
```

**마스킹 대상은 정규식 하나뿐이다: `bot\d+:[A-Za-z0-9_-]+` (봇 토큰 형식).** chat id·개인정보·URL 은 마스킹 대상이 아니다.

**raw → sanitize 로 바꿀 때 문자열이 어떻게 변하는가 (정적 추론):**

| 에러 유형 | raw `error.message` | `sanitizeError(error)` | 차이 |
|---|---|---|---|
| `GrammyError` (대부분의 400/403) | `Call to 'sendMessage' failed! (400: Bad Request: …)` | `GrammyError: Call to 'sendMessage' failed! (400: …)` | **`"GrammyError: "` 접두만 추가.** `.error`/`.cause` 없음 → 체인 없음 |
| `HttpError` (네트워크) | `Network request for 'sendMessage' failed!` | `HttpError: Network request … \| <inner name>: <inner message>` | **내부 fetch 에러가 추가된다** (`.error` 를 순회) — **정보 증가** |

→ **`sanitizeError` 통일은 "노출을 줄이는 변경"이 아니다.** 토큰이 없는 현재 상황에서는
마스킹이 사실상 no-op 이고, 남는 실제 효과는 **① 이름 접두 추가 ② HttpError 의 내부 체인 노출**이다.
즉 **UI·CSV 문자열은 더 길고 더 기술적으로 바뀐다.** Q19 를 *"sanitize 로 통일하면 안전해진다"* 로 읽으면 틀린다.
(안전 이득은 `sensitiveLogs` 를 켰을 때의 **방어**로서 존재한다 — 19-2 단서.)

### 19-4. 두 설계의 호출부 변경 지점 (요청 9 — 정적 열거)

| 설계 | 파사드 계약 | **호출부 변경 지점** | 관측 변경 |
|---|---|---|---|
| **A. 파사드가 sanitize** (`deliveries[].error` = sanitized) | `error: string` (이미 sanitize) | **0** — 4곳은 `lastError` 를 그대로 파생 | **5 표면 전부** (DB·API history·화면 2·CSV·API retry). 문자열이 19-3 표대로 바뀐다 |
| **B. raw 유지 + 호출부가 sanitize** | `error: string` (raw) | **4** — `alert-dispatcher.ts:127` · `custom-strategy-alert.ts:295` · `price-alert.ts:343` · `ta-signal-alert.ts:337` 에 `sanitizeError(...)` 적용 | 동일하게 5 표면. **A 와 결과가 같고 지점만 늘어난다** |
| **C. raw 유지 · sanitize 하지 않음 (현행 보존)** | `error: string` (raw) | **0** | **없음** |

**A 와 B 는 결과가 같다** — 둘 다 5 표면의 문자열을 바꾼다. 차이는 *어디서* 바꾸느냐뿐이다.
**관측 변경을 피하는 유일한 안은 C** 이고, C 는 컨벤션 위반을 존치한다.
19-2 판정(비밀 노출 경로 미발견)을 받아들이면 **C 의 실질 위험은 형식 위반에 그친다.**

**참고 — 함께 바뀌는 인접 표면.** 파사드가 per-chat 루프를 흡수하면 `console.error` 로그 문자열 17종과
`sanitizeError` 적용 불일치(12 raw / 5 sanitized)도 같이 통일된다 (measured-facts M3).
그 12곳 중 4곳이 위 `lastError` 지점과 겹친다. 로그는 DB·UI 표면이 아니므로 위 표에서 분리해 세었다.

---

## 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| 아웃바운드 메시지 **실제 길이 분포** | DB 조회 필요 (Q14 미승인). **로그 우회 경로는 존재하지 않음이 확인됐다**(①). fit 은 `AIAdvice.response` 단일 컬럼 집계면 충분하다는 것까지만 좁혔다 (a-4) |
| 4096 초과 **발생 빈도** (fit 절단 손실량) | 위와 동일 + 절단 로그 0 |
| **plain 폴백 발동 빈도** | 폴백 로그 0 (b-1). 코드 계측 없이는 불가 |
| `AlertHistory.errorMessage` 의 **현재 문자열 분포** | 실서비스 DB 조회 필요 (Q14). 19-3 은 *문자열이 어떻게 바뀌는지*를 정적으로 유도했을 뿐, *현재 무엇이 들어 있는지*는 모른다 |
| 텔레그램 `description` 원문이 실제로 무엇을 담는지 | 런타임 응답. 정적으로는 grammY 가 그대로 전달한다는 것만 확인 |
