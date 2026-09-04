# 05 — myFinance 22곳 루프 본문 정적 측정 (1a-4 청구서 확정)

GitHub 이슈 #4. 003 §9 "1a 착수 직전 측정 1건" 의 이행.
감사(`_workspace/03_auditor_notify.md`)가 대표 4곳만 부분 수행한 것을 **전수**로 마감한다.

## 측정 시점 저장소 상태

```bash
cd ~/workspace/pleiades/repos/myFinance
git branch --show-current; git rev-parse --short HEAD; git status --porcelain | wc -l
find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
```

| | 값 |
|---|---|
| 측정 대상 | `~/workspace/pleiades/repos/myFinance` (git worktree, 004 배치) |
| 브랜치 | `integration/pleiades` |
| HEAD | `c549fa6` |
| dirty | 0 |
| `src` 파일 | 424 |
| (대조) myFitness | `integration/pleiades` / `ac034be` / dirty 0 |

`~/workspace/myFinance`(서비스 유지용 원본, `dev`)는 **열지 않았다.** 전 명령 읽기 전용.
모든 `grep` 에 `--binary-files=text` 를 붙였다 (004 표준).

---

## M0. 모집단 확정 — 루프는 22곳이 맞다. 다른 순회 형태는 0건

```bash
grep -rn --binary-files=text "for (const chatId of" src --include='*.ts' | wc -l          # 22
grep -rn --binary-files=text "for (const chatId of" src --include='*.ts' | grep -v '/__tests__/' | wc -l   # 22 (테스트에 0건)
grep -rn --binary-files=text -E "chatIds?\s*\.(forEach|map|filter|reduce|some|every)" src --include='*.ts'  # 0건
grep -rn --binary-files=text -E "Promise\.(all|allSettled)\(.*[Cc]hat" src --include='*.ts'                 # 0건
grep -rn --binary-files=text -E "for \(let [a-z]+ = 0.*chatIds" src --include='*.ts'                        # 0건
grep -rn --binary-files=text -E "for \((const|let) [A-Za-z_]+ of .*[Cc]hat" src --include='*.ts' | wc -l    # 22 (동일 집합)
```

**22곳 / 15 파일.** `forEach`·`map`·`Promise.all`·인덱스 루프 **전부 0건** — 빈 결과가 패턴 오류가
아님을 다른 패턴(`for ((const|let) X of .*Chat`)으로 교차 확인했고 같은 22곳이 나왔다.
루프는 **전부 `await` 이 붙은 순차 for-of** 다. 병렬 fan-out 은 한 곳도 없다.

전송 함수 대조:
```bash
grep -rn --binary-files=text "sendHtml(" src --include='*.ts' | grep -v 'src/bot/utils/telegram.ts' | wc -l   # 20
```
**22 루프 − 20 `sendHtml` = 2.** 나머지 둘이 `quarterly-report.ts:52`(`sendDocument`)와
`rsu.ts:182`(raw `sendMessage` + `reply_markup`) — 발견 12 의 그 둘이다. 1:1 대응 확인.

---

## M1. 루프 22곳 전수 분류

추출 명령 (루프 시작행에서 중괄호 깊이를 세어 본문 끝까지 출력):
```bash
awk -v s=<줄> 'NR>=s{d+=gsub(/\{/,"{")-gsub(/\}/,"}"); printf "%5d| %s\n",NR,$0; if(d<=0) exit}' <파일>
```

### 분류 결과 — 한눈에

| 분류 | 뜻 | 건수 |
|---|---|---|
| **(a) 순수 전송** | 본문이 전송 호출 하나뿐 | **15 / 22** |
| **(b) 전송 + 결과 수집** | 반환값/성공 카운터를 모은다 | **5 / 22** |
| **(c) 전송 + 부수효과** | DB 쓰기·상태 변경이 **루프 안**에 | **0 / 22** |
| **(d) 전송 + 분기** | 수신자별로 내용이 달라진다 | **0 / 22** |
| **(e) 전송 아님 / 포트 밖** | 초크포인트가 아닌 루프 | **1 / 22** (`quarterly-report.ts:52`) |

> **(c)·(d) 가 0 이라는 것이 이 측정의 1차 결론이다.** 1a-4 를 비싸게 만드는 요인은
> 루프 **안**에 없다. 비용은 전부 **루프 밖**으로 옮겨가 있다 — M1-B 와 M4.

### 전수 표

`try` 열 = 성공 경로가 하는 일. `catch` 열은 M3 에서 따로 다룬다.

| # | 파일:줄 | try 본문 | 분류 | 비고 |
|---|---|---|---|---|
| 1 | `lib/ai/advisor-monitor.ts:220` | `sendHtml` + `anySuccess = true` | **(b)** | ADMIN 라우트. 동적 import 안. 반환 `boolean` |
| 2 | `bot/notifications/budget-alert.ts:81` | `sendHtml` | (a) | 예산 경고 |
| 3 | `bot/notifications/budget-alert.ts:122` | `sendHtml` | (a) | 증여세 경고 |
| 4 | `bot/notifications/quarterly-report.ts:37` | `sendHtml`("생성 중…" 안내) | (a) | PDF 생성 **전** 진행 알림 |
| 5 | `bot/notifications/quarterly-report.ts:52` | **`bot.api.sendDocument` + `InputFile`** | **(e)** | §7-4 로 **남는다** |
| 6 | `bot/notifications/quarterly-report.ts:66` | `sendHtml`(실패 안내) | (a) | 바깥 `catch` 안 |
| 7 | `bot/notifications/alert-dispatcher.ts:122` | `sendHtml` + `successCount++` | **(b)** | 반환값이 API 응답 + DB |
| 8 | `bot/notifications/quarterly.ts:105` | `sendHtml` | (a) | |
| 9 | `bot/notifications/networth-snapshot.ts:93` | `sendHtml` | (a) | `chatIds.length > 0` 가드 안 (:85) |
| 10 | `bot/notifications/ta-signal-alert.ts:332` | `sendHtml` + `sendSuccess++` | **(b)** | 카운터가 **메모리 상태 + DB** 게이트 |
| 11 | `bot/notifications/monthly.ts:65` | `sendHtml` | (a) | |
| 12 | `bot/notifications/daily.ts:132` | `sendHtml` | (a) | |
| 13 | `bot/notifications/rsu.ts:111` | `sendHtml` | (a) | |
| 14 | `bot/notifications/rsu.ts:182` | **`bot.api.sendMessage` + `parse_mode` + `reply_markup`** | (a)* | **바깥 `for (const rsu of todayRsus)` 안에 중첩** (:149). 키보드는 **RSU별**, 수신자별 아님 |
| 15 | `bot/notifications/briefing.ts:69` | `sendHtml`(본문) | (a) | |
| 16 | `bot/notifications/briefing.ts:91` | `sendHtml`(폴백) | (a) | 바깥 `catch` 안 (:79) |
| 17 | `bot/notifications/active-review.ts:123` | `sendHtml`(본문) | (a) | |
| 18 | `bot/notifications/active-review.ts:140` | `sendHtml`(폴백) | (a) | 바깥 `catch` 안 (:132) |
| 19 | `bot/notifications/monthly-report.ts:53` | `sendHtml`(본문) | (a) | |
| 20 | `bot/notifications/monthly-report.ts:67` | `sendHtml`(폴백) | (a) | 바깥 `catch` 안 (:62) |
| 21 | `bot/notifications/price-alert.ts:338` | `sendHtml` + `sendSuccess++` | **(b)** | 카운터가 **DB** 게이트 |
| 22 | `bot/notifications/custom-strategy-alert.ts:290` | `sendHtml` + `sentCount++` | **(b)** | 카운터가 **DB 2건** 게이트 |

\* #14 는 구조상 (a)(본문이 전송 호출 하나)지만 페이로드에 `components` 가 붙는다. 아래 M2-2 참조.

### (d) 가 0 인 근거 — 실제로 확인했다

```bash
grep -rn --binary-files=text "chatId" src/bot/notifications/*.ts src/lib/ai/advisor-monitor.ts \
  | grep -vE "chatIds|for \(const chatId of|function |: number" \
  | grep -vE "sendHtml\(bot, chatId|sendMessage\(chatId|sendDocument\(chatId"
```
→ **19줄, 전부 `console.error` 템플릿 문자열.** 루프 본문에서 `chatId` 는 (1) 전송 대상 인자,
(2) 실패 로그 문자열 — 이 둘 외의 용도가 **0건**이다.
메시지 본문(`message`/`html`/`fullMessage`/`msg`/`combined`)은 **22곳 전부 루프 진입 전에 확정**된다.

→ **`notify(route, content)` 단일 content 로 22곳 전부 커버된다.** 수신자별 분기 설계는 1a-4 에 불필요.

### M1-B. **(c) 는 루프 안이 아니라 루프 바로 밖에 있다** — 진짜 청구서

(b) 5곳의 카운터가 루프 종료 직후 **부수효과를 게이트**한다. 이것이 003 §5-1 이 언급하지 않은 부분이다.

```bash
awk 'NR>=A&&NR<=B{printf "%5d| %s\n",NR,$0}' <파일>     # 각 루프 직후 구간 확인
grep -rn --binary-files=text "computeDeliveryStatus|recordAlertHistory" src --include='*.ts'
```

| 소비 지점 | 카운터 | 하는 일 | 등급 |
|---|---|---|---|
| `ta-signal-alert.ts:344-354` | `sendSuccess > 0` | **메모리 상태 변경** — `sentToday` dedupe Map + `lastAiAskByTicker` AI 쿨다운 Map 기록 | **상태 변경** |
| `ta-signal-alert.ts:375-376` | `sendSuccess`, `chatIds.length` | `computeDeliveryStatus` → `recordAlertHistory(...)` **DB write** | **DB** |
| `price-alert.ts:349-350` | `sendSuccess`, `chatIds.length` | 동일 **DB write** | **DB** |
| `custom-strategy-alert.ts:301-302` | `sentCount`, `chatIds.length` | 동일 **DB write** | **DB** |
| `custom-strategy-alert.ts:304-320` | `sentCount === 0` → `return` | **`prisma.customStrategy.updateMany` 2건을 스킵** (`lastTriggeredAt`, `isActive`) | **DB (게이트)** |
| `alert-dispatcher.ts:131-132` | `successCount`, `chatIds.length`, `lastError` | `RedispatchResult` 반환 → `retry/route.ts:74` `persistRetryHistory` **DB write** + `:76-86` **API 응답 body** | **DB + API 계약** |
| `advisor-monitor.ts:228` | `anySuccess` | `AlertSender = (msg) => Promise<boolean>` 반환 → 모니터 상태 진행(`:135` `delivered`) | **상태 변경** |

**= 7 지점 / 5 모듈.** 전부 루프 **밖**이므로 파사드가 못 옮기는 것이 아니라,
**파사드가 정확한 값을 돌려주면 그대로 유지된다.**

파사드가 반드시 돌려줘야 하는 것 (003 §4-2 `BroadcastResult` 대조):

| 필요한 값 | 현재 출처 | `BroadcastResult` 로 되나 |
|---|---|---|
| 성공 건수 | `successCount`/`sendSuccess`/`sentCount` | ○ `sent` |
| 전체 대상 수 (DB `recipientCount` 컬럼) | `chatIds.length` | ○ `total` |
| **마지막 실패 사유 문자열** | `lastError = error.message` | △ `deliveries[].error` **에서 파생 필요** — `deliveries.filter(d=>!d.ok).at(-1)?.error`. 4곳에 변환 코드가 붙는다 |
| 최소 1건 성공 여부 | `sendSuccess > 0` / `anySuccess` | ○ `sent > 0` |

→ **`BroadcastResult` 는 충분하다.** 단 `lastError` 는 필드가 아니라 **파생**이므로 호출부에
한 줄씩 4곳(`alert-dispatcher`·`ta-signal-alert`·`price-alert`·`custom-strategy-alert`)이 붙는다.
"루프 제거"가 순수 삭제가 아니라 **삭제 + 파생 코드 추가**라는 뜻이다.

### M1-C. 짝 루프 4쌍 — 003 이 세지 않은 구조

`briefing`·`active-review`·`monthly-report`·`quarterly-report` 는 루프가 **2개씩**이다.
두 번째 루프는 첫 번째를 감싼 **바깥 `try` 의 `catch` 블록 안**에 있고, AI 생성 실패 시
안내 메시지를 보낸다.

| 모듈 | 본문 루프 | 폴백 루프 | 바깥 catch |
|---|---|---|---|
| `briefing.ts` | :69 | :91 | :79 |
| `active-review.ts` | :123 | :140 | :132 |
| `monthly-report.ts` | :53 | :67 | :62 |
| `quarterly-report.ts` | :37(진행 알림) | :66 | :63 |

→ 8 루프(22 중 **36%**)가 이 구조. **바깥 try/catch 4개는 AI 생성 실패용이지 전송 실패용이
아니므로 파사드가 흡수하지 않고 그대로 남는다.** 1a-4 후에도 이 4파일은 try/catch 구조를 유지한다.

---

## M2. 이미 알려진 예외 5개 재확인 + **누락 3건 추가**

### M2-1. `quarterly-report.ts:52` — 확인. 003 서술 그대로

```
   52|     for (const chatId of chatIds) {
   54|         await bot.api.sendDocument(chatId, new InputFile(pdfBuffer, path.basename(pdfPath)), {
   55|           caption: `📊 ${year}년 ${quarter}분기 리포트`,
```
포트 밖(§7-4). **루프·try/catch·`sendQuarterlyReport(chatIds: number[])` 시그니처 전부 남는다.** ✓
단 같은 파일의 `:37`·`:66` 두 루프는 `sendHtml` 이라 흡수 대상 — **한 파일 안에서 3개 중 2개만
바뀐다.** `chatIds` 파라미터는 `:52` 때문에 남으므로, 이 파일은 파사드와 `chatIds` 를 **동시에** 쓴다.

### M2-2. `rsu.ts` 키보드 — 확인. 단 003 이 적지 않은 것 2가지

```
  149|   for (const rsu of todayRsus) {          ← 바깥 루프. 남는다
  178|     const keyboard = new InlineKeyboard()
  179|       .text('✅ 확정', `vest:confirm:${rsu.id}`)
  182|     for (const chatId of chatIds) {        ← 이것만 제거 대상
  184|         await bot.api.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: keyboard })
```

(1) **중첩 루프다.** 바깥 `for (const rsu of todayRsus)` 는 남는다. 키보드는 **RSU별**이지
수신자별이 아니므로 `notify(route, {text, components})` 를 RSU마다 1회 호출하면 된다 — (d) 아님. ✓

(2) **⚠ 동작 변경이 발생한다.** 현재 `:184` 는 raw `bot.api.sendMessage` 라
**재시도 백오프도 HTML 폴백도 없다.** 파사드로 흡수하면 `[2000, 8000, 30000]`ms ×4 재시도와
HTML→plain 폴백이 **새로 붙는다.** 003 §5-2 가 *"Q10 이 '아니오'면 1a 는 관측 가능한 동작 변경이
0"* 이라 쓴 것은 이 지점에서 성립하지 않는다.
(003 은 myFitness `sendToAllWithKeyboard` 의 같은 개선은 §5-2 에 명시했으나 fin `rsu.ts` 쪽은 빠졌다.)

### M2-3. `length === 0` 가드 — **2곳이 아니라 10곳이다** ⚠

003 §5-1 은 `scheduler.ts:41` 과 `lib/cron.ts:96` **2곳**만 지목한다.

```bash
grep -rn --binary-files=text -E "chatIds\.length" src --include='*.ts'     # 21 hits
```

21 hits 를 **가드(제어 흐름)** 와 **분모(집계)** 로 갈랐다:

**가드 = 10곳** (파사드가 `targetCount(route)` 로 대신 제공해야 하는 것)

| # | 위치 | 형태 | 스킵되는 것 | 003 §5-1 언급 |
|---|---|---|---|---|
| 1 | `bot/notifications/scheduler.ts:41` | `=== 0` → return | **cron 등록 전체** | ○ |
| 2 | `lib/cron.ts:96` | `> 0` | 가격/전략/TA 체크 3건 | ○ |
| 3 | `app/api/alerts/history/[id]/retry/route.ts:64` | `=== 0` → `fail(…, 500)` | **API 400/500 응답 분기** | **✕ 누락** |
| 4 | `lib/ai/advisor-monitor.ts:205` | `=== 0` → `console.warn` + `return false` | ADMIN alert (별건) | ✕ (§5-1 이 별건으로 분리) |
| 5 | `bot/notifications/budget-alert.ts:29` | `=== 0 return` | 예산 경고 | **✕ 누락** |
| 6 | `bot/notifications/budget-alert.ts:96` | `=== 0 return` | 증여세 경고 | **✕ 누락** |
| 7 | `bot/notifications/custom-strategy-alert.ts:116` | `=== 0 return` | 전략 스캔 | **✕ 누락** |
| 8 | `bot/notifications/networth-snapshot.ts:85` | `> 0` | 알림만 (DB 저장은 이미 :80 에서 끝남) | **✕ 누락** |
| 9 | `bot/notifications/ta-signal-alert.ts:173` | `=== 0 return` | TA 시그널 | **✕ 누락** |
| 10 | `bot/notifications/price-alert.ts:80` | `=== 0 return` | 변동 알림 | **✕ 누락** |

**분모 = 11곳** (DB 컬럼·API 필드·로그의 값)

| 위치 | 쓰임 |
|---|---|
| `alert-dispatcher.ts:131` · `ta-signal-alert.ts:375` · `price-alert.ts:349` · `custom-strategy-alert.ts:301` | `computeDeliveryStatus(success, total)` — `sent`/`partial`/`failed` 판정 |
| `ta-signal-alert.ts:376` · `price-alert.ts:350` · `custom-strategy-alert.ts:302` | `recordAlertHistory(…, chatIds.length, …)` → **DB `AlertHistory.recipientCount`** |
| `alert-dispatcher.ts:132` | `totalChats` → API 응답 body (`retry/route.ts:81`) |
| `ta-signal-alert.ts:378` · `price-alert.ts:352` · `custom-strategy-alert.ts:322` | `console.log` |

→ **`targetCount()` 는 "가드 2곳 대신"이 아니라 "가드 10곳 + 분모 11곳"의 대체재다.**
그리고 #8 `networth-snapshot.ts:85` 는 성격이 다르다 — DB 스냅샷 저장(`:80`)은 가드 **밖**이라
수신자가 없어도 실행된다. 파사드가 이 가드를 흡수하면 그 순서가 보존되는지 확인이 필요하다.

### M2-4. `advisor-monitor.ts:199` 5번째 파싱 지점 — 확인 ✓

```bash
grep -rn --binary-files=text -E "TELEGRAM_(ALLOWED|ADMIN)_CHAT_IDS" src --include='*.ts'
```
파싱 지점(`.split(',')` 동반) **총 6곳**:

| 위치 | env | 방향 | 함수명 |
|---|---|---|---|
| `bot/notifications/scheduler.ts:22` | ALLOWED | 아웃 | `getAllowedChatIds` |
| `bot/notifications/budget-alert.ts:15` | ALLOWED | 아웃 | `getAllowedChatIds` |
| `lib/cron.ts:14` | ALLOWED | 아웃 | `getAllowedChatIds` |
| `app/api/alerts/history/[id]/retry/route.ts:30` | ALLOWED | 아웃 | `getAllowedChatIds` |
| **`lib/ai/advisor-monitor.ts:199`** | **ADMIN** | 아웃 | **인라인 (이름 없음)** |
| `bot/middleware/auth.ts:4` | ALLOWED | **인** | 인라인 (범위 밖, §7-3) |

→ 아웃바운드 **5곳** 확정. 003 의 발견 E6 정정이 맞다. ✓

### M2-5. **누락 발견 — `chatIds: number[]` 파라미터가 18개 시그니처에 박혀 있다** ⚠⚠

003 §5-1 은 `getAllowedChatIds` 를 **함수 정의 4개**로 센다. 그러나 그 4개가 만든 값은
**함수 인자로 계속 전파된다.**

```bash
grep -rn --binary-files=text -E "chatIds\s*:\s*number\[\]" src --include='*.ts' | wc -l    # 18
```

| 대상 | 건수 |
|---|---|
| `chatIds: number[]` 파라미터를 받는 함수 시그니처 | **18** (알림 진입점 16 + 내부 위임 2: `doCheckTASignals`, `runScan`) |
| `chatIds` 를 실인자로 넘기는 호출 (테스트 제외) | **19** — `scheduler.ts` 14 + `lib/cron.ts` 3 + `retry/route.ts` 1 + 내부 위임 2 … 중 `sendBriefing`/`sendClosingReview` 4건 포함 |
| `getAllowedChatIds()` **호출** 지점 | 5 (`retry/route.ts:63`, `cron.ts:95`, `budget-alert.ts:28`·`:95`, `scheduler.ts:40`) |

`scheduler.ts` 는 `:40` 에서 한 번 만든 `chatIds` 를 **14개 cron 콜백에 클로저로 캡처**해 넘긴다
(`:81,95,108,121,135,148,161,186,200,213,226,243,256`).

→ **`getAllowedChatIds` 4개 정의를 지우는 것은 청구서의 일부일 뿐이다.**
수신자 해석이 파사드로 내려가면 **18개 시그니처에서 파라미터가 빠지고 19개 호출부가 따라 바뀐다.**
(대안: 시그니처를 `route: Route` 로 치환 — 그래도 같은 37 지점을 건드린다.)
`quarterly-report.ts` 만은 `:52` 때문에 `chatIds: number[]` 를 **유지**해야 하므로,
18 중 1개는 남고 그 호출부(`scheduler.ts:108`)도 여전히 목록을 만들어야 한다 → **`getAllowedChatIds`
정의 4개 중 최소 1개(`scheduler.ts:21`)는 실질적으로 지울 수 없다** (혹은 파사드가
`targets(route): string[]` 같은 목록 조회 표면을 추가로 노출해야 한다).

> **003 §5-1 의 "`getAllowedChatIds` 4곳 제거" 는 `targetCount()` 만으로는 성립하지 않는다.**
> `quarterly-report.ts:52` 가 목록 자체를 요구하기 때문이다. §4-2 의 파사드 표면
> (`notify` + `targetCount`)에 **목록 반환 표면이 하나 더 필요하거나**, `sendDocument` 를
> 1a 에 포함시켜야 한다. 감사 (e) 가 "루프 21곳"까지는 정정했으나 이 파급은 짚지 않았다.

---

## M3. try/catch 22곳 — 무엇을 하는가

```bash
for f in src/bot/notifications/*.ts; do
  echo "$(basename $f) try=$(grep -c --binary-files=text -E '^\s*try \{' $f) catch=$(grep -c --binary-files=text -E '^\s*\} catch' $f)"
done
```

`bot/notifications/` 전체 `try` = **50개.** 그중 **per-chat 은 21개**(+`advisor-monitor.ts:221` 1개 = 22).
나머지 29개는 AI 호출·DB·cron 스케줄용이라 파사드와 무관하다.

### 22개 catch 의 실제 동작 — 전수

**재던지는 것 0건. 사용자에게 알리는 것 0건. 전부 삼킨다** (per-chat 실패는 절대 위로 전파되지 않는다).

| 유형 | 건수 | 내용 | 파사드 흡수 |
|---|---|---|---|
| **A. `console.error(raw error)`** | **12** | `console.error(\`[X] … (chatId: ${chatId}):\`, error)` — 에러 객체 그대로 2번째 인자 | ○ (라벨만 넘기면) |
| **B. `console.error(sanitizeError(error))`** | **5** | 템플릿에 `${sanitizeError(error)}` 보간 | ○ |
| **C. `lastError = error.message` + `console.error(raw)`** | **4** | A + 마지막 실패 사유 캡처 | △ **파생 필요** |
| **D. 빈 `catch {}`** | **5** | `// 무시` 주석만 | ○ |

유형별 위치:

| 유형 | 위치 |
|---|---|
| A (12) | `budget-alert:84`·`:125`, `quarterly:108`, `networth-snapshot:96`, `monthly:68`, `daily:135`, `quarterly-report:57`, `alert-dispatcher:126`, `ta-signal-alert:336`, `price-alert:342`, `custom-strategy-alert:294`, `advisor-monitor:224` |
| B (5) | `rsu:114`·`:188`, `briefing:72`, `active-review:126`, `monthly-report:56` |
| C (4) | `alert-dispatcher:126`, `ta-signal-alert:336`, `price-alert:342`, `custom-strategy-alert:294` (A 와 겹침 — A 12 중 4건이 C 를 겸한다) |
| D (5) | `briefing:94`, `active-review:143`, `monthly-report:70`, `quarterly-report:42`·`:71` |

(A 12 + B 5 + D 5 = 22. C 4 는 A 의 부분집합.)

검증 명령:
```bash
grep -rn --binary-files=text -E 'console\.error\(`.*chat.*`, err' src/bot/notifications src/lib/ai/advisor-monitor.ts --include='*.ts' | grep -vc __tests__   # A = 12
grep -rn --binary-files=text -E 'console\.error\(`.*chat.*sanitizeError\(err' src/bot/notifications src/lib/ai/advisor-monitor.ts --include='*.ts' | grep -vc __tests__  # B = 5
grep -rn --binary-files=text -E 'lastError = error instanceof Error' src/bot/notifications --include='*.ts' | grep -vc __tests__   # C = 4
grep -rn --binary-files=text -A2 '} catch {$' src/bot/notifications --include='*.ts' | grep -v __tests__   # D = 5 (전부 `// 무시`)
```

> **방법론 주의 (이번 측정에서 실제로 발생).** 위 명령의 대상 경로를 셸 변수에 담아
> `"$F"` 로 인용하면 glob 이 전개되지 않아 `ugrep` 이 **경고와 함께 0건**을 낸다.
> 004 의 `--binary-files=text` 와 같은 성격의 함정이다 — **빈 결과를 0 으로 단정하지 않고**
> 경로를 직접 나열해 재실행한 뒤 위 값을 얻었다.

### 파사드가 흡수할 수 있는 것 / 없는 것

| | 건수 | 판정 |
|---|---|---|
| **무손실 흡수 가능** | **17 / 22** | A(비-C) 8 + B 5 + D 5 … 단 **로그 문자열이 바뀐다**(아래) |
| **흡수 가능하나 파생 코드 필요** | **4 / 22** | C — `lastError` 를 `deliveries[]` 에서 뽑는 한 줄이 호출부에 붙는다 |
| **흡수 불가 (범위 밖)** | **1 / 22** | `quarterly-report.ts:57` (§7-4 로 남는 `sendDocument` 루프) |

### ⚠ 흡수하면 반드시 바뀌는 것 3가지

**(1) 로그 문자열이 17종이다.** 로깅하는 catch 17곳이 **전부 다른 문자열**을 쓴다 —
`[notification]`(9종 세부 문구) · `[alert-retry]` · `[active-review]` · `[briefing]` ·
`[custom-strategy]` · `[networth]` · `[report]` · `[ta-signal]` · `[advisor-monitor]`.
파사드가 한 형식으로 찍으면 **운영 로그 grep 패턴이 전부 깨진다.**
→ 파사드에 **호출부 라벨(context) 인자**가 필요하다. 003 §4-2 의 `notify(route, content)` 시그니처에
그 자리가 **없다.**

**(2) `sanitizeError` 적용이 지금은 일관되지 않다.** 12곳은 raw `error`, 5곳은 `sanitizeError(error)`.
파사드가 통일하면 **12곳 또는 5곳의 로그 내용이 바뀐다.** (`sanitizeError` 는 봇 토큰만 마스킹하므로
보안 개선이지 손실은 아니다 — `error.ts:sanitizeMessage` 는 `TOKEN_RE → 'bot<REDACTED>'`.)

**(3) `lastError` 가 DB 를 거쳐 UI 에 그대로 노출된다.** ⚠

```bash
grep -rn --binary-files=text "errorMessage" src prisma --include='*.ts' --include='*.tsx' --include='*.prisma' | grep -v '__tests__'
```

| 경로 | 위치 |
|---|---|
| 쓰기 | `alert-history.ts:76` → `prisma/schema.prisma:344 errorMessage String?` |
| 읽기 → API | `app/api/alerts/history/route.ts:77` |
| 읽기 → **화면** | `app/alerts/history/AlertHistoryClient.tsx:449` (`↳ {r.errorMessage}`), `components/alerts/AlertHistoryDetailModal.tsx:103` (`에러: {row.errorMessage}`) |
| 읽기 → **CSV 내보내기** | `app/api/alerts/history/export/csv-format.ts:19,146` |

현재 이 값은 **raw `error.message`** 다(C 4곳). 파사드가 `sanitizeError` 를 적용하면
**UI·CSV 에 보이는 문자열이 바뀐다** — 관측 가능한 동작 변경이다.
(부수: 지금 상태는 CLAUDE.md 의 *"catch 블록에서 `error.message` 원문 노출 금지"* 컨벤션과
어긋난다. 1a-4 가 만드는 문제가 아니라 **1a-4 가 손대는 바로 그 4줄에 이미 있는 문제**다.)

---

## M4. `getAllowedChatIds` 4곳 — 호출부가 반환값을 어떻게 쓰는가

```bash
grep -rn --binary-files=text "getAllowedChatIds" src --include='*.ts'
```
정의 4 + 호출 5 = 9 hits. (정의보다 호출이 많다 — `budget-alert.ts` 가 2번 호출)

| # | 정의 | 호출 | 반환값 용도 | `targetCount()` 로 대체 |
|---|---|---|---|---|
| 1 | `bot/notifications/scheduler.ts:21` | `:40` | ① `:41` `length===0` 가드 ② **14개 cron 콜백에 `chatIds` 를 클로저로 전달** (`:81`~`:256`) | **✕ — 가드만 대체됨.** 전달분은 18개 시그니처 개편이 따라온다. 그리고 `:108 sendQuarterlyReport(chatIds)` 는 §7-4 로 **목록 자체가 계속 필요** |
| 2 | `bot/notifications/budget-alert.ts:14` | `:28`, `:95` | ① `:29`·`:96` `length===0` 가드 ② `:81`·`:122` 루프 대상 | **○ 완전 대체** — 파일 안에서 생성·소비가 닫혀 있다 |
| 3 | `lib/cron.ts:13` | `:95` | ① `:96` `length>0` 가드 ② `checkPriceAlerts(chatIds)`·`checkCustomStrategies(chatIds)`·`checkTASignals(chatIds)` **3개 함수에 전달** | **△** — 3개 시그니처를 함께 바꾸면 대체 가능. 그 3개는 각자 내부에 또 `length===0` 가드를 갖는다(#7·#9·#10) → **가드 중복 4중** |
| 4 | `app/api/alerts/history/[id]/retry/route.ts:29` | `:63` | ① `:64` `length===0` → **HTTP 500 `fail('발송 대상 chat 이 설정되지 않았습니다.')`** ② `redispatchAlert(row, chatIds)` 전달 → 반환 `totalChats` 가 **API 응답 필드** | **△** — 가드는 `targetCount()` 로, 목록 전달은 `redispatchAlert` 시그니처 개편으로. **API 응답 계약(`totalChats`)이 걸려 있어** 값 의미가 바뀌면 안 됨 |

**요약: 4곳 중 완전 대체 가능은 1곳(`budget-alert.ts`)뿐이다.**
나머지 3곳은 `chatIds` 를 **다른 모듈로 전달**하므로, 제거하려면 수신 측 시그니처를 함께 바꿔야 한다.

`.split(',')` 파싱 로직 자체의 미세 차이도 재확인했다 (measured-facts 기존 기록과 일치):

| 정의 | NaN 필터 |
|---|---|
| `scheduler.ts:27` · `budget-alert.ts` · `lib/cron.ts:19` | `!isNaN(n)` |
| `retry/route.ts:35` · `advisor-monitor.ts:204` | `!Number.isNaN(n)` |

---

## M5. 테스트 파급 (부수 측정)

```bash
grep -rln --binary-files=text -E "chatIds|sendHtml" src --include='*.test.ts'
find src -name '*.test.ts' -o -name '*.test.tsx' | wc -l
awk '/^[[:space:]]*it\(/{if(started&&hit)n++;started=1;hit=0;next}{if(started&&$0~/sendHtml/)hit=1}END{if(started&&hit)n++;print n}' \
  src/bot/notifications/__tests__/alert-dispatcher.test.ts
```

| 항목 | 값 |
|---|---|
| `chatIds`/`sendHtml` 를 참조하는 테스트 파일 | **1 / 42** (`bot/notifications/__tests__/alert-dispatcher.test.ts`) |
| 그 파일의 `it()` 블록 | 25 |
| 그중 `sendHtml` 을 직접 assert 하는 것 | **9 / 25** (`toHaveBeenNthCalledWith(1, fakeBot, 1, '…')` 형태 — **인자 순서까지 고정**) |
| `TELEGRAM_ALLOWED_CHAT_IDS` env 를 세팅하는 테스트 | `retry/__tests__/route.test.ts` (`it()` 6개, `:42`·`:178`·`:196`) — 단 `redispatchAlert` 를 mock 하므로 파사드 교체와 무관 |

→ **테스트 결합은 얕다. 고쳐야 할 것은 1 파일 · 9 블록.** 이 부분에서 1a-4 가 비싸지지는 않는다.

---

## 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| 실제 수신자 chat id 개수 | `.env` 값 열람 금지 (기존 기록과 동일) |
| `AlertHistory.errorMessage` 에 현재 들어 있는 문자열의 실제 분포 | 실서비스 DB 조회 필요 (→ Q14). **`sanitizeError` 적용 시 UI 표시가 얼마나 바뀌는지**는 이 값 없이는 모른다 |
| 파사드 전환 후 로그 volume 변화 | 런타임 데이터 |
| `npm run lint`/`tsc --noEmit` 이 18개 시그니처 변경을 어떻게 걸러내는가 | 읽기 전용 규율상 실행 안 함 (003 §9 U2 와 같은 성격) |
