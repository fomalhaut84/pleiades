# 03 · auditor — 단계 1 `@pleiades/notify` 초안 감사

감사일 2026-09-03 · 대상 `/Users/sagan/workspace/pleiades/_workspace/02_writer_notify.md`
저장소 상태: myFinance `dev` / `c549fa6` / clean, myFitness `dev` / `2625600` / clean (초안 작성 시점과 동일)

대상 두 저장소는 **읽기만** 수행했다. 파일·git·빌드·npm install 무변경.

## 판정 요약

| # | 주장 | 판정 |
|---|---|---|
| 1 | 1a 는 DB 마이그레이션이 발생하지 않는다 | **확인** (근거 1건 경미 정정) |
| 2 | 1a 되돌리기 = 각 저장소로 재인라인, 며칠 | **정정** |
| 3 | 채널 되돌리기는 env 한 줄 | **정정** |
| 4 | D-a 는 마이그레이션이 아니다 | **확인** (근거 2건 정정 — 하나는 §5-4·Q14 를 무너뜨림) |
| 5 | vitest 도입 = devDep 3 + config 15줄 + scripts 3줄 | **정정** (경미) + 미확인 1 |
| 6 | 역변환기 위치는 파사드가 아니라 Transport 직전 | **정정** (결론 유지, 근거 오류 + 미발견 비용) |

**확인 2 / 정정 4 / 미확인 1.** 정정이 나왔으므로 문서는 초안 상태다.

**1a/1b 분할 결론 자체는 바뀌지 않는다.** 정정 4건은 전부 1a 를 더 비싸게, 1b-2d 롤백을 더 싸고 더 잘 경계지어진 것으로 만든다. 순서 강제(1a → 1b)의 논거(§3-1 b·c)는 살아남는다. 다만 **§2-2(b) 의 L3 근거 하나가 깨지고**(주장 6), **Q14 의 정당화 절반과 Q12 의 판돈이 사라진다**(주장 4).

---

## 주장 1 — "1a 는 DB 마이그레이션이 발생하지 않는다" → 확인

**근거**

```bash
grep -n "telegramMessageId\|telegramChatId" ~/workspace/myFitness/prisma/schema.prisma
# 359:  telegramMessageId    String?
# 360:  telegramChatId       String?
# 367:  @@index([telegramMessageId])

grep -n "telegram" ~/workspace/myFitness/prisma/migrations/20260716054043_workout_adjustment/migration.sql
# "telegramMessageId"    TEXT,      ← 길이 제약 없음
# "telegramChatId"       TEXT,

grep -rn "telegramMessageId\|telegramChatId" ~/workspace/myFitness/src --include='*.ts' | grep -v '/src/generated/'
# auto-adjust-cron.ts:97   telegramMessageId: sendResult.first
# auto-adjust-cron.ts:100  telegramChatId: sendResult.first?.chatId ?? null,
# auto-adjust.ts:418       telegramMessageId: String(sendResult.first.messageId),
# auto-adjust.ts:419       telegramChatId: sendResult.first.chatId,
```

`String?` / `TEXT` / nullable. `MessageRef = string` 은 스키마 무변경으로 들어간다. `String(...)` 변환 지점은 정확히 **2곳**(`auto-adjust.ts:418`, `auto-adjust-cron.ts:98-99`)이고 초안 말대로 소멸한다.

**단, 근거 하나가 틀렸다.** §2-3 은 *"`first.messageId` 가 **DB 인덱스**까지 걸려 있으므로 어댑터는 불투명 참조를 반환해야 한다"* 고 쓴다. 전체 저장소를 뒤져도 `telegramMessageId` **읽기 경로가 0건**이다. 매칭은 `callback_data` 에 embed 된 adjustment id 로 한다:

```
auto-adjust-callback.ts:231  const data = ctx.callbackQuery.data ?? "";
auto-adjust-callback.ts:232  const parsed = parseCallbackData(data);
auto-adjust-callback.ts:237  const adj = await prisma.workoutAdjustment.findUnique({
auto-adjust-callback.ts:238    where: { id: parsed.adjustmentId },
```

→ `@@index([telegramMessageId])` 는 **죽은 인덱스**다. 제약은 인덱스가 아니라 **컬럼 타입**(`String?`)에서 온다.

**문서 정정 지시** — §2-3 (177~178행):
- 현재: *"myFitness 의 `first.messageId` 가 **DB 인덱스**까지 걸려 있으므로"*
- 수정: *"myFitness 의 `first.messageId` 가 `String?` 컬럼으로 **영속화**되므로 (`schema.prisma:359`). `@@index([telegramMessageId])`(:367) 는 존재하지만 **읽기 경로 0건 — 죽은 인덱스**다. 제약은 인덱스가 아니라 컬럼 타입에서 온다."*
- §5-3 도입부(432~433행)의 인덱스 언급에 같은 각주 필요.

---

## 주장 2 — "1a 되돌리기 = 재인라인, 며칠" → **정정**

건수는 전부 맞다. 확인된 것:

```bash
grep -rn "sendHtml(" src --include='*.ts' | grep -v __tests__ | grep -v utils/telegram.ts | wc -l   # 20
grep -rn "for (const chatId of" src --include='*.ts' | grep -v __tests__ | wc -l                    # 22 (15 파일)
grep -rn "getAllowedChatIds" src --include='*.ts'                                                   # 정의 4 (cron.ts:13, budget-alert.ts:14, scheduler.ts:21, retry/route.ts:29)
wc -l ~/workspace/myFitness/src/bot/notifications/send.ts                                           # 124
```

(부수: 초안이 인용한 `getAllowedChatIds` 행번호 14/15/22/30 은 실제 13/14/21/29 다. 전부 −1. 무해하지만 `01_surveyor_transport.md` §1-3 도 같이 정정 대상.)

**틀린 것 일곱 가지.**

### (a) 파일 수가 어디에도 없다
초안은 호출 건수만 센다. 실제 union:

- myFinance: sendHtml 호출 **15파일** + `utils/telegram.ts` + `utils/formatter.ts` + `utils/error.ts` + `scheduler.ts`·`lib/cron.ts`·`retry/route.ts` + `error.ts` importer 중 미포함 4 + `package.json`·`package-lock.json`·`next.config.mjs` + `__tests__/alert-dispatcher.test.ts` ≈ **29파일**
- myFitness: `send.ts`(삭제) + 호출 4파일 + `utils/error.ts` + `utils/telegram.ts` + `auto-adjust.ts` escapeHtml 중복 + `standalone.ts` + `auto-adjust-callback.ts` + `package.json`·`package-lock.json`·`vitest.config.mts`·`next.config.mjs` ≈ **13파일**

**실서비스 두 곳 합계 40여 파일.** "호출 20건"이 주는 인상과 다르다.

### (b) `error.ts` 흡수가 §4-3("인바운드 전부 제외 · 변경 없음")을 깬다

```bash
grep -rn "sanitizeError\|isNetworkError\|isHtmlParseError" ~/workspace/{myFinance,myFitness}/src --include='*.ts' | grep import
```

myFinance 9곳 중 **인바운드/진입점 4곳**: `commands/watchlist.ts:6`, `commands/vest-confirm.ts:19`, `commands/ai.ts:14`, `standalone.ts:14`.
myFitness 7곳 중 **2곳**: `auto-adjust-callback.ts:8`(인바운드 callback), `standalone.ts:4`.

§3-2 "흡수하는 파일: `error.ts`" 와 §4-3 "인바운드 **변경 없음**" 이 정면 충돌한다. 로컬 re-export shim 을 남기는 완화책이 있지만 초안에 없다.

**문서 정정 지시** — §4-3 (352행) *"**변경 없음.**"* →
*"**변경 없음 — 단 하나 예외.** `error.ts` 를 패키지가 흡수하면 인바운드 파일 6곳(fin `commands/{watchlist,vest-confirm,ai}.ts` · `standalone.ts`, fit `auto-adjust-callback.ts` · `standalone.ts`)의 import 경로가 바뀐다. 로컬 `utils/error.ts` 를 `export * from '@pleiades/notify'` shim 으로 남기면 0으로 만들 수 있다. 어느 쪽을 택할지는 결정 사항이다."*

### (c) 패키지 의존성이 배포 파이프라인을 건드린다 — 초안에 전혀 없다

```bash
git -C ~/workspace/pleiades remote -v    # (출력 없음 — 원격 없음)
test -f ~/workspace/pleiades/package.json && echo yes || echo NO   # NO
grep -n "npm ci" ~/workspace/myFinance/deploy/deploy.sh ~/workspace/myFitness/deploy/deploy.sh
# myFinance/deploy/deploy.sh:106:npm ci
# myFitness/deploy/deploy.sh:  npm ci  (=== 3. Install dependencies ===)
grep -n "cwd" ~/workspace/myFitness/ecosystem.config.js   # cwd: '/home/nasty68/myFitness'
```

- pleiades 는 **package.json 도 git 원격도 없다.** 지금 상태로는 `file:` 도 git 의존성도 성립하지 않는다.
- 양쪽 deploy.sh 는 `npm ci` 다. `npm ci` 는 lockfile 과 package.json 불일치 시 **실패**한다.
- `file:../pleiades/...` → 실서비스 서버(`/home/nasty68/`)에 pleiades 체크아웃이 있어야 하고, **두 deploy.sh 모두에 pleiades pull 단계 신설**이 필요하다. 두 스크립트 모두 자기 저장소만 `git pull` 한다.
- git 의존성 → pleiades 원격 발행 + 서버 2대 접근 자격 + TS 라면 `prepare` 빌드 스크립트.

**되돌리기 실제 단위**: `git revert` + `package.json`/`package-lock.json` 되돌림 + **`npm ci`** + 재빌드 + `pm2 restart`, **실서비스 서버 2대에서**.

**문서 정정 지시** — §5-2 (413~414행):
- 현재: *"**1a 전체 되돌리기 = `git revert` 2개 저장소 + 재빌드 + `pm2 restart`.**"*
- 수정: *"**1a 전체 되돌리기 = `git revert`(package.json·package-lock.json 포함) + `npm ci` + 재빌드 + `pm2 restart`, 실서비스 서버 2대.** `npm ci` 가 들어가는 이유는 `@pleiades/notify` 가 의존성이기 때문이다 — 배포 스크립트가 `npm ci`(`myFinance/deploy/deploy.sh:106`, myFitness 동일)를 쓰므로 lockfile 이 배포 경로에 실린다. `file:` 링크를 택하면 **두 deploy.sh 에 pleiades 체크아웃 단계 신설**이 선결 조건이다 (현재 두 스크립트는 자기 저장소만 pull 한다)."*
- §5-2 표에 행 추가: `1a-0 | 패키지 배포 방식 확정(file: vs git dep) + pleiades 원격 발행 | 중간 | 배포 스크립트 되돌림 + 서버측 체크아웃 정리 | 미측정`

### (d) Next 빌드 그래프에 들어간다 → `transpilePackages`

```bash
grep -rln "alert-dispatcher" ~/workspace/myFinance/src/app
# src/app/api/alerts/history/[id]/retry/route.ts   ← alert-dispatcher → sendHtml
cat ~/workspace/myFinance/next.config.mjs   # experimental.instrumentationHook 뿐
cat ~/workspace/myFitness/next.config.mjs   # 빈 객체
```

myFinance 웹 라우트가 초크포인트에 도달한다. 패키지가 TS 소스를 배포하면 **양쪽 `next.config.mjs` 에 `transpilePackages` 추가**가 필요하다. 컴파일 JS 를 배포하면 대신 **설치 시점 빌드(패키지 우선 빌드 순서)** 가 생긴다. 어느 쪽이든 초안에 없는 비용이다.

### (e) 루프 22곳이 전부 제거되지 않는다

`quarterly-report.ts` 의 3개 루프 중 `:52` 는 `bot.api.sendDocument` 를 감싼다. §4-4 가 이걸 1a 범위 밖으로 명시했으므로 **이 루프는 남는다.** 그러면 `sendQuarterlyReport(chatIds: number[])` 시그니처도 남고, 누군가는 여전히 수신자 목록을 `number[]` 로 만들어야 한다.

**문서 정정 지시** — §3-2 표(272행) 및 §2-1 표(146행):
- *"루프 22곳 제거"* → *"루프 **21곳** 제거. `quarterly-report.ts:52`(sendDocument 루프)는 §4-4 로 인해 남고, `sendQuarterlyReport(chatIds: number[])` 도 함께 남는다."*

### (f) `getAllowedChatIds` 는 전송용이 아니라 **가드**로도 쓰인다

```
scheduler.ts:40   const chatIds = getAllowedChatIds()
scheduler.ts:41   if (chatIds.length === 0) { ... return }   ← 전체 스케줄 등록 스킵
lib/cron.ts:95-96 const chatIds = getAllowedChatIds(); if (chatIds.length > 0) { ... }
```

"4 → 0" 이 되려면 파사드가 `targetCount(route)` 같은 것을 노출해야 한다. §2-3 의 포트/파사드 정의에 그 표면이 없다.

**문서 정정 지시** — §2-3 `Notifier` 인터페이스에 `targetCount(route: Route): number` 추가하고, §3-2 표의 *"`getAllowedChatIds` 4곳 제거"* 옆에 *"단 `scheduler.ts:41` · `lib/cron.ts:96` 의 `length===0` 가드를 파사드가 대신 제공해야 한다"* 를 병기.

### (g) "드리프트 정지"가 아니라 "드리프트 이전"이다

두 저장소는 각자의 `package-lock.json` 에 패키지 버전/커밋을 **독립적으로 핀**한다. `npm ci` 라 패키지를 한 번 고치면 **두 저장소 각각에 PR 1개씩**이 필요하다. 코드 드리프트는 멈추지만 **버전 드리프트**가 생긴다.

**문서 정정 지시** — §3-2 "여기서 멈추면 무엇이 남나" 첫 항목(280행):
- 현재: *"fin/fit 이 갈라질 자리가 없어진다 (드리프트 정지)"*
- 수정: *"fin/fit 의 **코드** 가 갈라질 자리가 없어진다. 단 드리프트가 소멸하는 게 아니라 **버전 드리프트로 이전**된다 — 두 lockfile 이 각자 핀하므로 패키지를 고칠 때마다 저장소 2곳에 PR 1개씩이 필요하고, 한쪽이 버전을 안 올리면 다시 갈라진다."*

**등급 재판정**: 1a-4 는 *"되돌리기 1~2일"* 이 아니라 **"되돌리기 1~2일 + 서버 2대 `npm ci`·재빌드·restart, 그리고 배포 스크립트 변경이 있었다면 그것도 되돌림"**. 002 의 *"재인라인 며칠"* 은 **코드 부분만 정확하고, 의존성·배포 부분이 빠져 있다.**

---

## 주장 3 — "채널 되돌리기는 env 한 줄" → **정정**

### 하드코딩 블로커는 없다 (그 부분은 확인)
라우트→채널 매핑을 설정으로 빼는 것을 막는 타입 분기·빌드 타임 import 는 찾지 못했다. 인바운드 인증 `Set<number>`(`middleware/auth.ts:3-9`)는 텔레그램에 남으므로 무관하다.

### 그러나 "env 한 줄"은 세 군데서 틀렸다

**(1) 그 한 줄은 git 밖에 있다.**
```bash
grep -n "env" ~/workspace/myFinance/.gitignore   # 28:.env
grep -n "env" ~/workspace/myFitness/.gitignore   # 28:.env
```
`.env` 는 양쪽 gitignore 다. 되돌리기는 `git revert` 가 아니라 **실서비스 서버 2대에서의 수동 편집**이다. 이력에 남지 않고 CI 가 검증하지 않는다. 시간은 더 싸지만 **추적성은 1a 보다 나쁘다.**

**(2) 재시작 없이는 반영되지 않는다 — 프로세스 4개.**
```
myFinance/src/bot/standalone.ts:10   import 'dotenv/config'          ← 부팅 시 1회
myFinance/src/bot/notifications/scheduler.ts:40  const chatIds = getAllowedChatIds()
myFinance/src/bot/notifications/scheduler.ts:68~ cron.schedule(..., () => sendDailySummary(chatIds))
```
`chatIds` 는 `scheduleNotifications()` 에서 **한 번 계산되어 모든 cron 콜백에 클로저로 캡처**된다. env 를 바꿔도 프로세스가 죽기 전까지 옛 값을 쓴다.
웹 프로세스도 대상이다 — `src/app/api/alerts/history/[id]/retry/route.ts` 가 아웃바운드 경로다.
→ **서버 2대 × {web, bot} = 재시작 4회.** 봇 재시작에는 텔레그램 long-poll 409 위험이 붙는다 (myFitness `deploy.sh` 가 이 때문에 `pm2 delete` + `pm2 start` 를 쓴다고 명시, `ecosystem.config.js` 주석 참조).

**(3) 플립이 env-only 인 것은 Discord 어댑터가 이미 배포된 뒤부터다.**
```bash
node -e "console.log(require('/Users/sagan/workspace/myFitness/package.json').scripts['build:bot'])"
# esbuild ... --external:grammy --external:node-cron --external:dotenv --external:@flow-js/garmin-connect --external:@prisma/client/runtime
```
`build:bot` 의 `--external:` 목록은 양쪽 저장소 `package.json` 에 하드코딩돼 있다. Discord SDK 를 넣으려면 **두 저장소의 `package.json` scripts 를 고치고 재빌드·재배포**해야 한다. 그 배포가 끝난 **후에만** 되돌리기가 env 플립이 된다. 그리고 되돌린 뒤에도 Discord SDK 는 번들에 남는다.

**문서 정정 지시** — §3-3 표 "되돌리기" 칸(295행) 과 §5-3 의 1b-1b 행(421행):
- 현재: *"**env 한 줄** (라우트→채널 매핑 되돌림)"* / *"**env 한 줄** 되돌림 + restart"*
- 수정: *"**env 값 1개 + 재시작 4회** — 실서비스 서버 2대 × {web, bot}. `.env` 는 양쪽 gitignore(`:28`)라 **git 이력에 남지 않는 수동 서버 편집**이고, `scheduler.ts:40` 이 `chatIds` 를 부팅 시 캡처하므로 재시작 없이는 반영되지 않는다. 봇 재시작은 텔레그램 409 위험을 동반(myFitness deploy.sh 가 `pm2 delete`+`start` 를 쓰는 이유). 소요 수 분. **단 이 플립이 env-only 인 것은 DiscordTransport 가 이미 양쪽에 빌드·배포된 뒤부터다** — `build:bot` 의 `--external:` 목록이 두 저장소 `package.json` 에 하드코딩돼 있어 Discord SDK 추가는 코드 변경 + 재배포다."*
- §5-3 1b-1b 등급: **즉시** → **즉시(운영) · 수 분 · git 이력 밖**
- §7 Q11 "002 연결" 칸의 *"채널 되돌리기는 env 한 줄"* 인용에 각주로 위 정정 링크.

---

## 주장 4 — "D-a 는 마이그레이션이 아니다" → **확인** (근거 2건 정정)

### 결론은 맞다
- 컬럼은 `TEXT`(migration.sql), **길이 제약·형식 검증·CHECK 없음.** 19자리 snowflake 문자열이 그대로 들어간다.
- 조인 없음. FK 는 `workoutId` 뿐.
- 인덱스는 있으나 **읽기 경로 0건**이라 인덱스 사용 방식이 깨질 여지가 없다.

### 그러나 "깨지는 지점"의 특정이 틀렸다

초안 §5-3 D-a 칸(440행): *"전환 기간에 Discord id 로 저장된 pending 조정 건은 **텔레그램 callback 과 매칭되지 않는다**"*.

**매칭에 `telegramMessageId` 를 쓰는 코드가 없다.** 매칭은 `callback_data` → `adjustmentId` → `findUnique({where:{id}})` 다 (`auto-adjust-callback.ts:231-238`). 컬럼에 뭐가 들어 있든 매칭은 성공한다.

실제 실패 모드는 다르다: **롤백 후 Discord 메시지의 components 를 받아줄 interaction 엔드포인트가 사라져 사용자가 응답할 수 없다.** DB 가 아니라 인프라 문제이고, D-a/D-b 선택과 **무관**하다.

### 그리고 "건수 미측정"이 틀렸다 — 정적으로 상한이 나온다

```
auto-adjust-cron.ts:13        const TTL_HOURS = 8;
auto-adjust-callback.ts:16    const TTL_HOURS = 8;
auto-adjust-callback.ts:19-25 isTtlExpired: proposedAt+8h 초과 OR KST 자정 지남 → true
auto-adjust-cron.ts:4         (pending|snoozed) + 8h 초과 or 자정 지남 → decision=expired
auto-adjust-cron.ts:123-136   maintenance cron 이 updateMany 로 자동 expired 마킹
scheduler.ts:103-104          AUTO_ADJUST_CRON ?? "30 6 * * *"   ← 하루 1회 제안
```

제안은 **하루 1회**(06:30 KST), TTL 은 **8시간 또는 KST 자정 중 이른 쪽**, cron 이 자동으로 `expired` 마킹. `processSnoozed`(`auto-adjust-cron.ts:88-107`)는 같은 row id 로 재전송하므로 snoozed 는 자가 치유된다.

→ **미응답 pending 노출은 최대 1건, ≤8시간, 자동 소멸.** 실서비스 DB 조회가 필요 없다.

**문서 정정 지시**
- §5-3 D-a "되돌리는 행위" 칸(440행): *"코드 revert. **단 전환 기간에 Discord id 로 저장된 pending 조정 건은 텔레그램 callback 과 매칭되지 않는다** (건수 **미측정** — §5-4)"* →
  *"코드 revert. DB 컬럼은 무해하다 — 매칭은 `callback_data` 의 adjustment id 로 하고(`auto-adjust-callback.ts:231-238`), `telegramMessageId` 는 **읽기 경로가 0건**이다. 실제 잔여물은 **롤백 후 Discord 메시지의 버튼이 응답 대상을 잃는 것**이며, 이는 D-a/D-b 선택과 무관한 1b-2a(인터랙션 엔드포인트) 문제다. 노출은 **정적으로 상한이 있다** — 제안은 하루 1회(`scheduler.ts:103`), TTL 은 8h 또는 KST 자정(`auto-adjust-cron.ts:13`, `auto-adjust-callback.ts:19-25`), maintenance cron 이 자동 `expired` 마킹(`auto-adjust-cron.ts:123-136`). **최대 ~1건, ≤8시간, 자가 소멸.**"*
- §5-3 말미 인용 블록(448~450행): *"그 건수를 모르므로(§5-4) 롤백 창을 짧게 잡는 것이 유일한 완화책이다"* → **삭제**. 상한이 알려져 있고 8h 자동 소멸이므로 완화책이 필요 없다.
- §5-4 두 번째 행(`WorkoutAdjustment ... pending row 수`) → **삭제**. 정적으로 유도된다.
- §7 Q14: *"§5-4 의 미측정 **2건**"* → *"미측정 **1건**(알림 길이 분포)"*. Q14 우선순위를 중간 → 낮음 으로 재검토 권고.
- §7 Q12 판돈 축소: D-a 의 잔여 리스크가 사실상 0 이므로 Q12 는 "권고 D-a"로 사실상 결론난 상태에 가깝다.

---

## 주장 5 — "vitest 도입 = devDep 3 + config 15줄 + scripts 3줄" → **정정** (경미) + 미확인 1

### 확인된 것
```bash
cat ~/workspace/myFinance/vitest.config.mts   # 정확히 15줄. 인용 전문 일치
# 양쪽 tsconfig paths 동일:
#   "paths": { "@/*": ["./src/*"] }   ← fin·fit 완전 일치
# 차이: jsx (preserve vs react-jsx), include 의 .next/dev/types 1줄. vitest 무관
grep -rl "from 'vitest'" ~/workspace/myFinance/src --include='*.test.ts' | wc -l   # 42
find ~/workspace/myFinance/src -name '*.test.ts' | wc -l                          # 42
```
**42/42 테스트가 `vitest` 를 명시 import** → `globals: true` 도 `types: ["vitest/globals"]` 도 불필요. §6 표의 4·5번(setup 불필요 / tsconfig 조정 불필요) **확인**. 1·2·3번 수치도 확인.

§6-1 의 제약 인용도 정확하다 — `alert-dispatcher.test.ts:11-12` 에 원문 그대로 있고, 실제 테스트 파일에서의 발현은 `vi.mock('../../index', () => ({ getBot: vi.fn(...) }))` 다. `Transport` 를 주입받아야 한다는 결론은 유효하다. **확인.**

### 빠진 진입 비용 둘

**(1) myFitness 에만 `typecheck` 가 있다.**
```
myFitness/package.json scripts: "typecheck": "tsc --noEmit"   ← myFinance 에 없음
myFitness/tsconfig.json include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ...]
```
새 테스트 파일이 `src/**/__tests__/**/*.test.ts` 로 들어가면 **myFitness 에서는 `tsc --noEmit` 의 검사 대상**이 된다 (myFinance 에서는 아님). 비대칭 제약이고, 같은 패키지 테스트를 양쪽에서 다르게 취급하게 된다.

**(2) lint 스택이 다르고 myFitness 는 zero-warning 게이트다.**
```
myFinance: "lint": "next lint"                     eslint ^8  / eslint-config-next ^15.5.16
myFitness: "lint": "eslint src/ --max-warnings 0"  eslint ^9.39.4 / eslint-config-next ^16.2.6
myFitness/eslint.config.mjs: ignores: ["src/generated/**"]   ← __tests__ 는 제외 안 됨
```
myFitness 에 추가되는 테스트 파일은 **더 최신 lint 스택에서 경고 0** 을 통과해야 한다. 통과 여부는 lint 실행이 필요해 확인하지 못했다.

**(3) "6. npm install" 이 과소평가돼 있다.**
초안 §6 표 6번은 *"`npm install` (실서비스 서버) → 쓰기, `dual-repo-operator` 소관"*. 실제로는 배포 스크립트가 **`npm ci`** 라 lockfile 변경이 **배포 파이프라인에 실린다.** 되돌리기(§5-2 1a-2 "3파일 revert + `npm install`, 1시간 미만")도 `package-lock.json` 을 포함한 4파일 + `npm ci` 다.

### 미확인
`vitest@^4.1.8` + `@vitest/coverage-v8@^4.1.8` + `vite-tsconfig-paths@^6.1.1` 이 myFitness 의존성 트리(eslint 9 / eslint-config-next 16 / prisma 6.19.3)에서 **충돌 없이 resolve 되는지 확인하지 못했다.** `npm install`·`npm ci` 가 읽기 전용 규율 밖이다. myFinance 는 eslint 8 / eslint-config-next 15 / prisma 6.19.2 라 트리가 다르다. → **미확인.** 확인하려면 `dual-repo-operator` 가 `npm install --dry-run --package-lock-only` 를 한 번 돌려야 한다.

**문서 정정 지시** — §6 표에 행 3개 추가:
```
| 7 | myFitness 는 `typecheck: tsc --noEmit` 보유 (fin 은 없음) | 새 테스트가 `tsc --noEmit` 대상. 비대칭 |
| 8 | myFitness lint = `eslint src/ --max-warnings 0` (eslint 9 / config-next 16) | 테스트 파일이 zero-warning 게이트 통과 필요. **미확인** |
| 9 | 의존성 resolve 가능 여부 | **미확인** — install 금지. `npm install --dry-run --package-lock-only` 필요 |
```
그리고 6번 항목: *"`npm install`"* → *"`npm ci` (배포 스크립트가 `npm ci` — lockfile 이 배포 경로에 실린다)"*.
§5-2 1a-2 행: *"3파일 revert + `npm install`"* → *"4파일 revert(`package.json`·`package-lock.json`·`vitest.config.mts`·테스트) + `npm ci`"*.

---

## 주장 6 — "역변환기 위치는 파사드가 아니라 Transport 직전" → **정정**

### 사실 확인은 전부 통과
```bash
grep -rn "PRE_ESCAPED_KINDS" ~/workspace/myFinance/src --include='*.ts' | grep -v __tests__
# bot/notifications/alert-dispatcher.ts:100        (정의)
# app/alerts/history/client-utils.ts:43            (정의)
# app/api/alerts/history/export/csv-format.ts:46   (정의)
```
3중 정의 확인. 집합 3곳 동일: `{target_hit, stop_loss, watch_buy, watch_zone}`.

**escape 혼재가 발생하는 kind** (`alert-dispatcher.ts:96-99`, `client-utils.ts:48-51` 주석):
- **pre-escaped**: `target_hit` · `stop_loss` · `watch_buy` · `watch_zone` — `price-alert.ts:219-220, 284-285` 의 `escapeHtml(displayName)` / `escapeHtml(ticker)` 로 build 후 그대로 store
- **raw**: `custom_strategy` · `drop` · `surge` · `fx` · `ta_signal`

### 결론은 맞지만 **근거가 non sequitur 다**

초안 §4-1 (336~337행): *"fin 의 escape 혼재 상태가 역변환기 입력에 그대로 들어오므로, 역변환기는 `alert-dispatcher` 의 round-trip **이후** 문자열을 받아야 한다. 즉 역변환기의 위치는 파사드가 아니라 Transport 직전이다."*

round-trip 은 **전송 호출 전에** 끝난다:
```
alert-dispatcher.ts:117  const isPreEscaped = PRE_ESCAPED_KINDS.has(row.kind)
alert-dispatcher.ts:118  const normalized = isPreEscaped ? decodeHtmlEntities(row.message) : row.message
alert-dispatcher.ts:119  const safeMessage = escapeHtml(normalized)
alert-dispatcher.ts:124  await sendHtml(bot, chatId, safeMessage)     ← 여기부터가 파사드 자리
```
**파사드도 `:119` 이후다.** 따라서 이 근거는 파사드를 배제하지 못한다.

Transport 직전이 옳은 **진짜** 이유는 다르다: **파사드는 채널 무관 층인데 변환은 채널 의존적이다.** 혼합 운영(Q11)에서 같은 `Content` 가 텔레그램(HTML 유지)과 Discord(md 변환)로 동시에 fan-out 될 수 있다. 파사드에서 변환하면 텔레그램 배송이 망가진다.

**문서 정정 지시** — §4-1 "대가" 문단(335~337행) 전체 교체:
> **대가:** 역변환기가 하나 더 생긴다 (HTML→Discord-md). 위치는 **파사드가 아니라 Transport 직전**이다 — 이유는 `alert-dispatcher` 의 round-trip 때문이 **아니다**(그 round-trip 은 `:117-119` 에서 전송 호출 전에 끝나므로 파사드도 그 이후다). 진짜 이유는 **변환이 채널 의존적**이라는 것이다: 혼합 운영(Q11)에서 같은 `Content` 가 텔레그램(HTML 유지)과 Discord(md 변환)로 동시에 나갈 수 있으므로, 채널 무관 층인 파사드에서 변환하면 텔레그램 배송이 깨진다.

### 그리고 새 문제가 실제로 생긴다 — 초안에 없다

**(A) 역변환은 `markdownToTelegramHtml` 의 대칭 역함수가 아니다.**
```
utils/markdown.ts:57-60   result.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
```
정방향은 `& < >` 만 escape 한다. **마크다운 메타문자(`*` `_` `~` `` ` `` `|` `\`)는 손대지 않는다** — 정방향에서는 그것들이 *입력 구조*였기 때문이다. 역방향은 반대로 그것들을 *출력 구조*로 쓰면서, 동시에 **텍스트 노드 안의 같은 문자를 escape** 해야 한다. 정방향에 대응물이 없는 단계다.

이건 이론이 아니다. `displayName` / `ticker` / custom strategy 이름은 사용자 입력이고 `escapeHtml` 만 거친다. `csv-format.ts:67-68` 와 `alert-dispatcher.ts:112-113` 주석이 `SOXL < 40 > RSI` 같은 이름이 실재함을 명시한다. `_TSLA_` 나 `AAPL*` 은 Discord 에서 **서식으로 렌더된다.**

**문서 정정 지시** — §4-1 (329~330행): *"`markdownToTelegramHtml`(fin, 103줄)의 역방향이므로 정본 참조가 이미 있다"* →
*"`markdownToTelegramHtml`(`utils/markdown.ts:51`, 103줄)이 **부분** 참조가 된다. 대칭 역함수가 아니다 — 정방향은 `& < >` 만 escape 하고(`markdown.ts:57-60`) 마크다운 메타문자를 **소비**하지만, 역방향은 그것들을 **생성**하면서 동시에 텍스트 노드 안의 `* _ ~ \` | \\` 를 escape 해야 한다. 정방향에 대응 단계가 없다. 사용자 입력(`displayName`·`ticker`·전략명)이 그대로 실려 있으므로(`price-alert.ts:219,284`) 이 escape 를 빠뜨리면 Discord 에서 서식 주입이 된다. 또 `convertTables`(`markdown.ts:55`)로 리스트가 된 표는 복원 불가다."*

**(B) plain 폴백 구현이 이미 둘로 갈라져 있다.**
```
utils/telegram.ts:69  const plain = chunk.replace(/<[^>]+>/g, '')          ← 엔티티 디코드 안 함
utils/markdown.ts:96-103 stripHtml: 태그 제거 + &amp;/&lt;/&gt; 디코드     ← 디코드 함
```
`sendHtml` 의 인라인 폴백은 `&amp;` 를 리터럴로 남긴다. 패키지가 정본 하나를 골라야 하고, 어느 쪽을 고르든 **한쪽 저장소의 폴백 출력이 관측 가능하게 바뀐다.** §2-4 "기능 합집합" 표에 이 행이 없다.

**(C) 분할은 채널 무관 로직이 아니다 — §2-2(b) 가 깨진다.**
2000자 한도는 **Discord-md 문자열**에 걸린다. HTML 문자열이 아니다. `<b>…</b>` 태그와 `&amp;` 엔티티는 길이를 부풀리므로 두 문자열의 길이가 다르다. 변환기가 Transport 에 있고 분할이 §2-2(b) 대로 "어댑터 밖 공용 코어"에 있으면, **분할이 잘못된 문자열의 길이로 계산된다.**

초안 §2-2(b)(163~164행)는 *"길이 분할은 전부 **채널 무관 로직**이다. 이것들을 어댑터 안에 넣을 이유가 없다"* 고 쓴다. 역변환기를 Transport 에 두는 순간 이 문장은 거짓이 된다.

**문서 정정 지시** — §2-2(b) 마지막 문장에 단서 추가:
> …전부 채널 무관 로직이다 — **단 길이 분할은 예외다.** 한도는 변환 **후** 문자열에 걸리는데(§4-1 의 HTML→Discord-md 역변환기는 Transport 직전에 있다), HTML 태그·엔티티가 길이를 부풀려 변환 전후 길이가 다르다. 따라서 분할은 **변환 뒤**, 즉 Transport 경계 안쪽이거나, 포트가 "변환 후 길이 예산"을 코어에 알려주는 형태여야 한다. **L3 의 근거 (b) 는 재시도·폴백·집계·수신자 해석에 대해서만 성립한다.**

L3 권고 자체는 (a)·(c) 로 유지된다. 근거 (b) 만 축소된다.

---

## 초안이 놓친 비용 (추가 발견)

| # | 항목 | 근거 | 초안 반영 |
|---|---|---|---|
| E1 | pleiades 에 `package.json` 도 **git 원격도 없다** | `git -C ~/workspace/pleiades remote -v` 무출력, `package.json` 부재 | **없음.** §5-2 1a-1 "반나절 · 되돌리기 즉시" 는 npm 스캐폴딩·빌드(`.d.ts`·exports map)·원격 발행·서버 2대 접근을 계산에 넣지 않았다. 그리고 "아직 아무도 안 씀"은 1a-3/1a-4 착수 전까지만 참이다 — 그 뒤엔 디렉터리 삭제가 `npm ci` 를 깬다 |
| E2 | 양쪽 배포가 `npm ci` | `myFinance/deploy/deploy.sh:106`, myFitness 동일 | 없음 (주장 2-c) |
| E3 | 빌드 순서 의존 | TS 배포 → 양쪽 `next.config.mjs` 에 `transpilePackages`; JS 배포 → 설치 시 패키지 선행 빌드 | 없음 (주장 2-d) |
| E4 | `build:bot` esbuild `--external:` 목록이 두 `package.json` 에 하드코딩 | `myFitness/package.json` `build:bot` | 없음 (주장 3-3) |
| E5 | 버전 드리프트 재발 구조 | lockfile 2개, 핀 2개, PR 2개 | 없음 (주장 2-g) |
| E6 | `advisor-monitor` 의 **동적 import** 제약 | `advisor-monitor.ts:216-217` `await import('@/bot')` — 웹/봇 순환참조 회피 목적, 주석 `:213-214` 명시 | 없음. `TelegramTransport` 가 `getBot()` 을 필요로 하므로 이 동적 import 는 주입 지점에 그대로 남아야 한다. 또 `:199-205` 의 `TELEGRAM_ADMIN_CHAT_IDS` 인라인 파싱은 `getAllowedChatIds` 4개에 **포함되지 않는 5번째 파싱 지점**이다 (`!Number.isNaN` 사용) |
| E7 | myFitness `escapeHtml` 2중 정의 중 하나가 **인바운드가 아닌 아웃바운드 로컬** | `utils/telegram.ts:18`, `auto-adjust.ts:112` | §4-2 가 "패키지가 흡수하면 자동 해소"로 처리. `utils/telegram.ts:18` 은 인바운드 `replyLong` 도 쓰므로(`:30,33`) 파일이 통째로 사라지지 않는다 — 부분 발췌다 |

---

## 오케스트레이터 통지

- 정정 4건이므로 **`02_writer_notify.md` 는 초안 상태 유지**. `docs/specs/003-*.md` 발행 보류.
- **부분 수정으로 충분하다.** 개정본 발행은 불필요 — 정정 대부분이 §5 의 되돌리기 표와 §4-1·§6 의 근거 문장에 국한되고, §2·§3 의 구조적 결론(L3, 1a/1b 분할, 1a→1b 순서)은 살아남는다.
- **로드맵 단계 순서 변경 없음.**
- **재검토 요청 2건**:
  1. **Q14(실서비스 DB 읽기 허용) 우선순위 하향.** 두 정당화 중 하나(§5-4 pending row 수)가 정적으로 해결됐다. 남은 것은 알림 길이 분포뿐이고 그건 Q10 하나만 막는다.
  2. **Q8 이전에 답이 필요한 새 질문 하나** — "패키지 배포 방식(`file:` vs git 의존성 vs 사설 레지스트리)". 이게 정해지기 전에는 1a 의 되돌리기 비용을 확정할 수 없고, 두 저장소의 `deploy.sh` 변경 여부가 여기서 갈린다. **Q8/Q9 와 동급(최상) 우선.** 초안 §7 에 이 질문이 없다.
- `repo-surveyor` 재호출 필요 없음. §5-4 의 "22곳 루프 본문 분류"는 이번 감사에서 부분 수행했고(대표 4곳), 나머지는 1a 착수 직전 측정으로 충분하다.
- `dual-repo-operator` 에게 사전 확인 1건 위임: myFitness 에서 `npm install --dry-run --package-lock-only vitest@^4.1.8 @vitest/coverage-v8@^4.1.8 vite-tsconfig-paths@^6.1.1` (주장 5 미확인 해소).
