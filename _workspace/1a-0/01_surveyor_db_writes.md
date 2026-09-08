# 1a 발송 경로 DB 쓰기 · 병행 인스턴스 격리 조건 — 실측

> 이슈 `fomalhaut84/pleiades#31` (004 Q42 선행 측정) · 2026-09-08
> 모드 **I(통합 작업)** — 측정 대상은 worktree `~/workspace/pleiades/repos/{myFinance,myFitness}`.
> 원본 `~/workspace/myF*` 는 **보지 않았다** (앞선 1a 단계 변경이 없으므로).

⚠ **세 가정이 전부 뒤집혔다.**
1. **"발송 경로는 쓰기 불필요" 는 거짓이다.** fin 4개 알림 모듈이 **전송 전에 무가드 `prisma.alertConfig.upsert`** 로 on/off 를 판정하고, fit 리포트 경로는 **전송 전에 `reportJob.create` → syncAll 4쓰기 → `aIAdvice` `$transaction`** 을 거친다. RO 롤이면 이 지점에서 예외가 나고 **본문 전송에 도달하지 못한다.**
2. **"cron off" 는 env 스위치가 아니다.** 두 저장소 어디에도 `DISABLE_*`/`ENABLE_*`/`SCHEDULER_*` 류 on/off 플래그가 **0건**이다. 있는 것은 **스케줄 문자열 env 6개(fit만)** 뿐이고 **fin 은 cron 표현식이 전부 하드코딩**이다.
3. **fit 은 웹 프로세스 기동만으로 DB 를 쓴다.** `src/instrumentation.ts` → `sweepOrphanedJobs()` → `prisma.reportJob.updateMany` (부팅 1회 + 5분 주기). **끄는 env 가 없다.** fin 웹은 반대로 `register()` 가 no-op 이라 부팅 쓰기 0.

부수 발견 ⚠ **fit `ecosystem.config.js` 의 `cwd` 가 `/home/nasty68/myFitness` 로 하드코딩**돼 있어 병행 인스턴스는 파일 수정 없이 그 파일을 재사용할 수 없다(fin 은 `__dirname`).
부수 발견 ⚠ **로컬 Postgres 는 5432 에서 실제로 리슨 중**이다 — `measured-facts.md` "로컬에는 실행 중인 서비스가 없다"(1233행 절)는 pm2·4100/4200 에 한해 유효하다.

## 측정 시점 저장소 상태

```bash
for d in myFinance myFitness; do echo "$d $(git -C repos/$d rev-parse --abbrev-ref HEAD) $(git -C repos/$d rev-parse --short HEAD) dirty=$(git -C repos/$d status --porcelain | wc -l | tr -d ' ')"; done
```

| 대상 | 경로 | 브랜치 | HEAD | dirty |
|---|---|---|---|---|
| myFinance | `repos/myFinance` | `integration/pleiades` | `6542152` | 0 |
| myFitness | `repos/myFitness` | `integration/pleiades` | `626a201` | 0 |

## 방법론 주의 — 이번 측정에서 실제로 발생한 오탐

이 환경 셸은 **zsh** 다. `FILES="a.ts b.ts"; git grep … -- $FILES` 는 zsh 가 **단어 분할을 하지 않아**
한 덩어리 pathspec 이 되고, `git grep` 이 **경고 없이 0건**을 낸다. 실제로 첫 시도에서
`custom-strategy-alert.ts:310` 의 `prisma.customStrategy.updateMany` 를 "쓰기 0건"으로 오보고했다.
005 §4-11(ugrep `.gitignore`)·004(`--binary-files=text`) 와 같은 계열의 함정이다.
**아래 모든 명령은 `for f in … ; do … "$f" ; done` 루프로 재실행한 결과다.**

---

# M1. 아웃바운드 발송 경로의 DB 쓰기 지점 — 전수

## M1-0. 모집단 확인 (기존 값과 일치)

```bash
git -C repos/myFinance grep -n --text "sendHtml(" -- 'src/**/*.ts' | grep -v 'utils/telegram.ts' | grep -v '__tests__'
git -C repos/myFitness grep -n --text "sendToAll" -- 'src'
```

| | 호출 건수 | 호출부 모듈 수 |
|---|---|---|
| myFinance `sendHtml` | **20** | **15** |
| myFitness `sendToAll` 4 + `sendToAllWithKeyboard` 2 | **6** | **4** |

→ `measured-facts.md` "호출부는 텔레그램을 아는가" 표(20 / 6)와 **일치**. worktree 에서도 같다.

fit 6건 열거: `scheduler.ts:34`·`:59` · `auto-adjust.ts:395`·`:455` · `auto-adjust-cron.ts:78` · `admin-alerts.ts:232`.

## M1-1. 쓰기 탐지 명령

```bash
cd repos/<repo>
for f in <호출부 모듈 …>; do
  echo "### $f"
  grep -nE --binary-files=text \
    'prisma\.[A-Za-z]+\.(create|update|upsert|delete|updateMany|deleteMany|createMany)|\$executeRaw|\$transaction' \
    "$f" || echo "  (쓰기 0건)"
done
```

## M1-2. myFinance — 15 모듈 / 20 호출

| 파일:행(전송) | 호출부 모듈 | 쓰기 API (파일:행) | 테이블 | 전송 전/후 | 전송 실패 시에도 쓰나 | 예외 처리 |
|---|---|---|---|---|---|---|
| `active-review.ts:125`·`:142` | `sendReview` ← `sendClosingReview:154`·`sendWeeklyReview:168` | `alertConfig.upsert` (`active-review.ts:44`) | `AlertConfig` | **전** (게이트) | 전송 전이라 무관 | **무가드** — 실패 시 전송 자체 없음 |
| `alert-dispatcher.ts:124` | `redispatchAlert` ← `retry/route.ts:74` | `alertHistory.createMany` (`alert-history.ts:67`) | `AlertHistory` | **후** | **예** (`partial`/`failed` 로 기록) | try/catch **삼킴** |
| `briefing.ts:71`·`:93` | `sendBriefing` | — | — | — | — | 쓰기 0건 |
| `budget-alert.ts:83`·`:124` | `checkBudgetAlerts`·`checkGiftTaxLimit` | — | — | — | — | 쓰기 0건 |
| `custom-strategy-alert.ts:292` | `checkCustomStrategies` | `alertConfig.upsert` (`:61`, 게이트 `:131`) | `AlertConfig` | **전** | 전송 전 | **무가드** |
| 〃 | 〃 | `alertHistory.createMany` (`:302` → `alert-history.ts:67`) | `AlertHistory` | **후** | **예** | 삼킴 |
| 〃 | 〃 | `customStrategy.updateMany` **×2** (`:310`, `:316`) | `CustomStrategy` | **후** | **아니오** — `sentCount===0` 이면 `:304` 에서 `return` | **무가드** |
| `daily.ts:134` | `sendDailySummary` | — | — | — | — | 쓰기 0건 |
| `monthly-report.ts:55`·`:69` | `sendMonthlyReport` | — | — | — | — | 쓰기 0건 |
| `monthly.ts:67` | `sendMonthlySummary` | — | — | — | — | 쓰기 0건 |
| `networth-snapshot.ts:95` | `takeNetWorthSnapshot` | `netWorthSnapshot.upsert` (`:63`) | `NetWorthSnapshot` | **전** | 전송 전 | **무가드** |
| `price-alert.ts:340` | `checkPriceAlerts` | `alertHistory.createMany` (`:350`) | `AlertHistory` | **후** | **예** | 삼킴 |
| `quarterly-report.ts:39`·`:68` | `sendQuarterlyReport` | — | — | — | — | 쓰기 0건 |
| `quarterly.ts:107` | `sendQuarterlyCheck` | — | — | — | — | 쓰기 0건 |
| `rsu.ts:113` | `sendRsuNotification` | — | — | — | — | 쓰기 0건 |
| `ta-signal-alert.ts:334` | `checkTASignals` | `alertConfig.upsert` (`:51`, 호출 `:290`) | `AlertConfig` | **전** | 전송 전 | **무가드** |
| 〃 | 〃 | `alertHistory.createMany` (`:376`) | `AlertHistory` | **후** | **예** | 삼킴 |
| `advisor-monitor.ts:222` | `getGlobalAdvisorMonitor` sender | — (`lastAlertAt` 은 **메모리** `:133`) | — | — | — | 쓰기 0건 |

**상류 게이트 (cron 진입점 — 발송 함수 밖이지만 같은 tick):**

| 위치 | 쓰기 | 무엇을 게이트하나 |
|---|---|---|
| `lib/cron.ts:95` `refreshPrices()` → `price-fetcher.ts:76`·`:190` `priceCache.upsert` | `PriceCache` | `result.success > 0` 이어야 `checkPriceAlerts`·`checkCustomStrategies`·`checkTASignals` 실행 (`lib/cron.ts:97~110`) |

(`lib/cron.ts:244 $transaction` · `:307`·`:323 stockOptionVesting.updateMany` 는 반복거래·베스팅 cron 으로 **전송 경로 밖**.)
(`markTACheckDone` `lib/cron.ts:73` 은 **메모리** 변수다 — DB 아님.)

**M1-2 합계(위 표에서 셈):**

| 분류 | 지점 수 |
|---|---|
| 전송 **전** · **무가드** 쓰기 | **4** (`active-review:44` · `custom-strategy:61` · `networth-snapshot:63` · `ta-signal:51`) |
| 전송 **후** · try/catch 삼킴 | **1 코드 지점** (`alert-history.ts:67`) — **도달 호출부 4** (`:302`·`:350`·`:376`·`alert-dispatcher:178`) |
| 전송 **후** · **무가드** | **2** (`custom-strategy-alert.ts:310`·`:316`) |
| 쓰기 0건 모듈 | **10 / 15** |
| 상류 게이트 쓰기 | **2** (`price-fetcher.ts:76`·`:190`) |

## M1-3. myFitness — 4 모듈 / 6 호출

| 파일:행(전송) | 호출부 모듈 | 쓰기 API (파일:행) | 테이블 | 전송 전/후 | 전송 실패 시에도 쓰나 | 예외 처리 |
|---|---|---|---|---|---|---|
| `scheduler.ts:34` (본문) | `runReportCron` ← 모닝/이브닝/주간 cron | `reportJob.create` (`report-job.ts:74`) | `ReportJob` | **전** | 전송 전 | **무가드** |
| 〃 | 〃 | `reportJob.update` (`report-job.ts:129` running, `:153` completed/failed) | `ReportJob` | **전** | 전송 전 | **무가드** |
| 〃 | 〃 (`preSyncForReport` → `syncAll`) | `syncMetadata.upsert` ×3 (`garmin/sync.ts:137`·`:200`·`:214`) · `$executeRaw` (`:173`) | `SyncMetadata` 외 | **전** | 전송 전 | `preSyncForReport` **try/catch 삼킴** (`daily-report.ts:59`) |
| 〃 | 〃 | `$transaction([aIAdvice.deleteMany, aIAdvice.create])` (`daily-report.ts:109-113`, 주간은 `weekly-report.ts:185-190`) | `AIAdvice` | **전** | 전송 전 | **무가드** |
| `scheduler.ts:59` (에러 폴백) | `runReportCron` catch | — | — | — | — | 위 예외가 여기로 떨어져 **"생성 실패" 문구를 대신 전송** |
| `auto-adjust.ts:395` | `runAutoAdjustProposal` | `workoutAdjustment.create` (`:368`) | `WorkoutAdjustment` | **전** | 전송 전 | **무가드** |
| 〃 | 〃 (`preSyncForReport` `:277`) | 위 syncAll 4쓰기 | — | **전** | 전송 전 | 삼킴 |
| 〃 | 〃 | `workoutAdjustment.update` (`:415` — `telegramMessageId`/`telegramChatId`) | `WorkoutAdjustment` | **후** | **아니오** — `sent===0` 이면 `:407` throw 로 도달 안 함 | try/catch **삼킴** (best-effort) |
| 〃 | 〃 | `aIAdvice.create` (`:431`) | `AIAdvice` | **후** | **아니오** (동일) | 삼킴 |
| `auto-adjust.ts:455` (에러 폴백) | `runAutoAdjustProposal` catch | — | — | — | — | 위 예외가 여기로 |
| `auto-adjust-cron.ts:78` | `processSnoozed` ← `runAutoAdjustMaintenance` | `workoutAdjustment.updateMany` (`:91`) | `WorkoutAdjustment` | **후** | **아니오** — `sent===0` 이면 `:83` throw | **무가드** |
| 〃 | `runAutoAdjustMaintenance` | `workoutAdjustment.updateMany` (`:123` TTL expire) | `WorkoutAdjustment` | **같은 tick, 전송과 독립** | 예 | try/catch |
| `admin-alerts.ts:232` | `notifyAdminIfKnownFailure` | `systemAlertState.updateMany` (`:202`) + `systemAlertState.create` (`:212`) | `SystemAlertState` | **전** — **전송을 게이트한다** (`reserved` false → `:227 return`) | 전송 전 | 바깥 try/catch 삼킴 → **전송 자체가 안 됨** |
| 〃 | 〃 | `systemAlertState.deleteMany` (`:248`) | `SystemAlertState` | **후** (미전송 시 예약 해제) | **예** (`delivered=false` 일 때만) | 삼킴 |

**M1-3 합계(위 표에서 셈):**

| 분류 | 지점 수 |
|---|---|
| 전송 **전** · **무가드** 쓰기 | **5** (`report-job:74`·`:129`·`:153` · `daily-report:109` — 주간 경로는 `weekly-report:185` 로 치환 · `auto-adjust:368`) |
| 전송 **전** · 삼키지만 **전송을 게이트** | **2** (`admin-alerts.ts:202`·`:212`) |
| 전송 **전** · 삼킴 · 게이트 아님 | **4** (`garmin/sync.ts:137`·`:173`·`:200`·`:214` — `preSyncForReport` 가 흡수) |
| 전송 **후** · 삼킴 | **3** (`auto-adjust:415`·`:431` · `admin-alerts:248`) |
| 전송 **후** · **무가드** | **1** (`auto-adjust-cron:91`) |
| 쓰기 0건 모듈 | **1 / 4** (`send.ts` 초크포인트 자체) |

## M1-4. 결론 — RO 롤에서 무엇이 되고 무엇이 안 되나

| 경로 | RO 롤 결과 | 근거 |
|---|---|---|
| fin `briefing`·`daily`·`monthly`·`monthly-report`·`quarterly`·`quarterly-report`·`rsu`·`budget-alert`·`advisor-monitor` | **전송까지 도달** (쓰기 0) | M1-2 표 |
| fin `active-review`·`custom-strategy`·`ta-signal` | **전송 도달 못 함** — 게이트 `alertConfig.upsert` 무가드 | M1-2 |
| fin `networth-snapshot` | **전송 도달 못 함** — `:63` 무가드 upsert 가 `:95` 앞 | M1-2 |
| fin `price-alert` | 상류 `priceCache.upsert` 가 먼저 실패 → cron 경로로는 도달 못 함. 함수 직접 호출이면 도달 후 `recordAlertHistory` 만 로그 실패 | M1-2 상류 표 |
| fin `alert-dispatcher` (`POST /api/alerts/history/[id]/retry`) | **전송 도달** — 쓰기는 전송 **후** 이고 `recordAlertHistory` 가 예외를 삼킨다. **응답 200 도 정상** | `alert-history.ts:83` catch · `retry/route.ts:76` |
| fit 리포트 3종 | 본문 **전송 도달 못 함**. 대신 `scheduler.ts:59` 이 **"❌ … 생성 실패" 문구를 전송** | `report-job.ts:74` → `runReportCron` catch |
| fit auto-adjust 제안 | 제안 **전송 도달 못 함**. 대신 `auto-adjust.ts:455` 가 **에러 문구를 전송** | `:368` → `:448` catch |
| fit auto-adjust snooze 재전송 | **전송 도달** (쓰기가 전송 후 `:91`) — 단 그 뒤 무가드 `updateMany` 가 throw → tick 실패 로그 | `auto-adjust-cron.ts:78`→`:91` |
| fit admin alert | **전송 도달 못 함** — 예약 쓰기가 게이트 | `admin-alerts.ts:202`~`:227` |

→ **RO 롤로도 아웃바운드 전송 자체는 관측 가능하다.** 다만 관측되는 것은 **정상 본문이 아니라 폴백/에러 문구**인 경로가 fit 은 4/6, fin 은 4/15 모듈이다. 1a(어댑터 교체) 검증이 "메시지가 실제로 도착하는가"만 본다면 RO 로 충분하고, "정상 본문이 그대로 나오는가"까지 보려면 **쓰기 가능한 별도 DB(복제본)** 가 필요하다.

---

# M2. 웹 프로세스 기동만으로 도는 쓰기

## M2-1. instrumentation hook

```bash
git -C repos/<repo> ls-files | grep -iE 'instrumentation|ecosystem|middleware'
cat repos/<repo>/next.config.mjs repos/<repo>/src/instrumentation.ts
```

| | myFinance | myFitness |
|---|---|---|
| `next.config.mjs` | `experimental.instrumentationHook: true` | **`{}`** (빈 설정) |
| `src/instrumentation.ts` | **존재 · `register()` 본문이 주석 1줄뿐 — no-op** | **존재 · 실행 있음** |
| 웹 프로세스가 시작하는 것 | **없음** (주석: *"cron + 알림 스케줄러는 standalone 봇 프로세스에서 실행"*) | `EventEmitter.defaultMaxListeners=30` · `sweepStalePhotoTempFiles()` · `startPhotoTempSweeper()` · **`startCronJobs()`** · **`sweepOrphanedJobs()`** · **`startOrphanSweeper()`** |

> fit 은 `next.config.mjs` 가 비어 있는데도 `instrumentation.ts` 가 돈다 — Next 15 부터 훅이 stable 이라 `experimental` 플래그가 불필요하다. **파일 존재만으로 실행된다.**

## M2-2. 기동 시점 쓰기 — 파일:행 열거

| 저장소 | 기동 시 실행 | 쓰기 | 끄는 env |
|---|---|---|---|
| myFinance | (없음) | **0건** | 해당 없음 |
| myFitness | `instrumentation.ts:33` `sweepOrphanedJobs()` | `prisma.reportJob.updateMany` (`report-job.ts:270`) — `status:'failed'`, `errorMessage:'orphaned by process restart'` | **없음** |
| myFitness | `instrumentation.ts:38` `startOrphanSweeper()` | 위와 동일 쓰기를 **5분 주기 반복** (`report-job.ts:290`) | **없음** |
| myFitness | `instrumentation.ts:30` `startCronJobs()` | 등록만. 첫 발화 시 `syncAll` 쓰기 4 + backfill + `recalculateCalorieBalance` | **없음** (스케줄 문자열 `SYNC_CRON` 만) |
| myFitness | `instrumentation.ts:24` `sweepStalePhotoTempFiles()` / `:28` `startPhotoTempSweeper()` | **로컬 fs 만** (`photo-temp-cleanup`) — DB 쓰기 아님 | 없음 |

## M2-3. cron on/off 스위치 전수

```bash
git -C repos/<repo> grep -nE --text "DISABLE_[A-Z_]+|ENABLE_[A-Z_]+|[A-Z_]*CRON[A-Z_]*|SCHEDULER_[A-Z_]+" -- src | grep "process.env"
```

| | 결과 |
|---|---|
| myFinance | **on/off 플래그 0건.** cron 표현식도 env 없음 — `lib/cron.ts:84 '*/10 * * * *'` · `:131` · `:156 '0 6 * * *'` · `:193 '0 7 * * 1'` · `:218` · `:298` 과 `bot/notifications/scheduler.ts` **13곳**이 전부 **하드코딩** |
| myFitness | **on/off 플래그 0건.** 스케줄 문자열 env **6개** — `SYNC_CRON`(`lib/cron.ts:21`) · `MORNING_REPORT_CRON`(`scheduler.ts:68`) · `EVENING_REPORT_CRON`(`:80`) · `REPORT_CRON`(`:91`) · `AUTO_ADJUST_CRON`(`:103`) · `AUTO_ADJUST_MAINTENANCE_CRON`(`:110`) |

→ **"cron off" 의 실제 스위치:**

| 저장소 | 프로세스 | cron off 방법 | 등급 |
|---|---|---|---|
| fin | 웹 | **불필요** — 웹은 cron 을 등록하지 않는다 | 즉시 |
| fin | 봇 | **그 pm2 앱을 안 띄우면 끝** (`standalone.ts:30-36` 이 유일한 등록 지점) | 즉시 |
| fit | 봇 | 그 pm2 앱을 안 띄운다 | 즉시 |
| fit | **웹** | `SYNC_CRON` 에 **발화하지 않는 표현식**(예: `0 0 30 2 *`)을 넣어 우회 — **문서화된 off 플래그가 아님**. `startOrphanSweeper()` 는 **우회 수단이 없어 코드 변경 필요** | **중간 (코드 변경 or 편법 env)** |

## M2-4. 그 밖의 기동·첫 요청 쓰기

| 검사 | myFinance | myFitness |
|---|---|---|
| 세션/로그인 테이블 쓰기 | **없음** — `next-auth ^5.0.0-beta.31` 이지만 `lib/auth.ts:109 strategy:'jwt'` · `PrismaAdapter` **0건** | **next-auth 의존성 자체가 없음** (`package.json` 0건) |
| 마이그레이션 자동 실행 | **없음** — `prisma migrate deploy` 는 `deploy/deploy.sh:109` 와 `.github/workflows/ci.yml:56` 에만 | **없음** — `deploy/deploy.sh:52` · `ci.yml:56` |
| 시드 | 앱 부팅 경로에 없음 (`active-review.ts:24` 주석: *"deploy.sh 는 migrate deploy 만 실행, seed 재실행 X"*) | 부팅 경로 0건 |
| 초기화성 `upsert` | `ensure*Setting()` **4개** (`active-review:29`·`custom-strategy-alert:44`·`price-alert:29`·`ta-signal-alert:38`) — 호출은 `bot/notifications/scheduler.ts:49`·`:53`·`:57`·`:62` 로 **봇 프로세스 전용**. 전부 try/catch 삼킴 | 없음 |

## M2-5. 답 — "RO 롤로 웹 프로세스만 띄우면 기동 시점에 실패하는 쓰기가 있는가"

| 저장소 | 답 | 근거 |
|---|---|---|
| **myFinance** | **아니오** | `instrumentation.ts` no-op · auth JWT · migrate 는 배포 스크립트 전용 → 부팅 쓰기 0건 |
| **myFitness** | **예 (1건, 그러나 크래시는 아님)** | `sweepOrphanedJobs()` 의 `reportJob.updateMany` 가 부팅 시 실행. 실패해도 `instrumentation.ts:34 .catch()` 가 삼켜 **프로세스는 뜬다.** 5분마다 같은 에러 로그가 반복된다 (`report-job.ts:291`) |

> **RO 롤을 쓰지 않는 경우의 위험이 오히려 크다.** fit `sweepOrphanedJobs` 는 **동일 DB 를 보는 실서비스 웹의 pending/running job 을 `failed` 로 마킹**할 수 있다 (cutoff 밖이면). 병행 인스턴스를 쓰기 가능 롤로 띄우는 것은 실서비스 데이터를 건드린다.

---

# M3. 격리 6조건의 코드 측 근거

## M3-1. 포트

```bash
cat repos/<repo>/ecosystem.config.js ; sed -n '/"scripts"/,/^  }/p' repos/<repo>/package.json
```

| | myFinance | myFitness |
|---|---|---|
| `package.json` `start` | `next start` (포트 인자 없음 → `PORT` env) | `next start` (동일) |
| `ecosystem.config.js` | `args: 'start -p 4100'` **+** `env.PORT: 4100` | `args: 'start -p 4200'` **+** `env.PORT: 4200` |
| MCP 포트 | `env.MCP_PORT: '4210'` | 코드 기본값 4301 (`ecosystem` 은 shell override 있을 때만 전달) |

→ **`-p` 플래그가 `PORT` env 를 이긴다.** `ecosystem.config.js` 를 그대로 쓰면 **env 만으로는 포트를 못 바꾼다.**
   `pm2 start npm --name <이름> -- start` 형태로 **ecosystem 을 쓰지 않으면 `PORT` env 만으로 충분**하다 (`start` 스크립트에 `-p` 가 없으므로). **파일 수정 불필요.**

## M3-2. pm2 이름 · cwd

| | myFinance | myFitness |
|---|---|---|
| 앱 이름 | `myfinance` · `myfinance-bot` · `myfinance-mcp` | `myfitness` · `myfitness-bot` · `myfitness-mcp` |
| 웹 앱 `cwd` | **`__dirname`** (파일 위치 기준 — 이식 가능) | **`'/home/nasty68/myFitness'`** (절대경로 하드코딩, 3개 앱 전부) |
| script | `node_modules/.bin/next` (웹) · `dist/bot/standalone.cjs` (봇) · `dist/mcp/server.cjs` (MCP) | 동일 |

→ **fin**: `ecosystem.config.js` 를 병행 체크아웃에서 그대로 실행하면 `__dirname` 이 그 체크아웃을 가리켜 동작한다. 단 **앱 이름이 충돌**하므로 `pm2 start ecosystem.config.js` 는 못 쓰고 `pm2 start node_modules/.bin/next --name myfinance-pleiades -- start` 류가 필요하다.
→ **fit**: `cwd` 가 실서비스 경로로 고정돼 **그 파일을 재사용하면 병행 인스턴스가 실서비스 디렉터리에서 뜬다.** 병행 인스턴스는 **별도 ecosystem 파일이거나 `pm2 start … --name … --cwd …`** 여야 한다. `pm2 start --name` 만으로는 부족하다.

## M3-3. DB 연결 — 롤 전환

```bash
sed -n '/^datasource/,/^}/p' repos/<repo>/prisma/schema.prisma
```

```prisma
// 양쪽 동일
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

| 항목 | 실측 |
|---|---|
| `directUrl` / `shadowDatabaseUrl` | **양쪽 0건** — 두 번째 URL 없음 |
| 롤 전환 | **`DATABASE_URL` 하나로 충분** |
| fin 추가 동작 | `lib/prisma.ts:20` 가 URL 에 `connection_limit=10`·`pool_timeout=5`·`connect_timeout=5` 를 **주입**해 `datasourceUrl` 로 넘긴다. 롤/DB 자체는 안 바꾼다 |
| generator | fin `prisma-client-js`(기본 위치) / fit `prisma-client` + `output = "../src/generated/prisma"` |
| 연결 시점 자동 쓰기 | **코드·설정 범위에서 0건** — 앱 부팅 경로에 `migrate`/`db push` 호출 없음(M2-4). Prisma advisory lock 은 `migrate` 계열 명령에서만 쓰이고 `PrismaClient` 연결에는 쓰이지 않는다 — **다만 이는 런타임 미검증** (아래 "못 잰 값") |

## M3-4. 봇 — 웹 프로세스가 봇을 기동하는가

```bash
git -C repos/<repo> grep -n --text -E "from ['\"](@/bot|\.\./bot)" -- 'src/app' 'src/lib' | grep -v __tests__
git -C repos/<repo> grep -n --text "import(\"@/bot\|import('@/bot" -- src
```

| | myFinance | myFitness |
|---|---|---|
| long polling 시작 지점 | **`bot/standalone.ts:54 bot.start()`** 만 (+ `:28 deleteWebhook()`) | `bot/standalone.ts` (동일 구조) |
| `getBot()` 이 하는 일 | `new Bot(token)` + 커맨드 등록만 — **네트워크 연결 없음** (`bot/index.ts:34~`) | 동일 |
| 웹 계층의 봇 참조 | **정적 3 + 동적 2** — `app/api/alerts/history/[id]/retry/route.ts:21` · `app/api/deposits/route.ts:5` · `lib/cron.ts:6,7,8` · 동적 `lib/ai/advisor-monitor.ts:216`·`:217` | **정적 2** — `lib/monitoring/admin-alerts.ts:9`·`:10`. **`bot` 인스턴스를 인자로 받으므로 웹에서는 `null`** (`admin-alerts.ts:193 if (!bot) … return`) |
| 토큰 미설정 시 | `bot/index.ts:37` **throw** — 단 `getBot()` 이 호출될 때만. 부팅 시 호출 없음 → **웹은 크래시하지 않는다** | 동일 (웹은 `getBot()` 을 호출하지 않음) |

→ **"봇 미기동" 은 pm2 봇 앱을 안 띄우는 것으로 충분하다.** 웹 프로세스는 스스로 polling 을 시작하지 않는다.
→ ⚠ **역으로, 병행 *봇* 프로세스는 띄우면 안 된다.** `standalone.ts:28` 이 `deleteWebhook()` 을 부르고 `:54` 가 long polling 을 시작하므로 **같은 토큰의 실서비스 봇과 409 충돌**한다.
→ ✅ **fin 은 봇 없이도 아웃바운드 전송을 트리거할 수 있다.** `POST /api/alerts/history/[id]/retry` 는 웹 프로세스에서 `getBot()`(연결 없음) + `sendHtml`(HTTP 호출)만 쓴다. **1a 검증의 자연스러운 트리거 후보**이며 M1-4 대로 **RO 롤에서도 200 을 돌려준다.**
→ fit 에는 대응하는 웹 트리거가 없다 (`admin-alerts` 는 `bot` 이 null).

## M3-5. 병행 인스턴스가 반드시 달라야 하는 env

```bash
git -C repos/<repo> grep -oh --text -E 'process\.env\.[A-Z0-9_]+' -- src scripts deploy ecosystem.config.js prisma.config.ts | sed 's/process\.env\.//' | sort -u
grep -oE --binary-files=text '^[A-Z0-9_]+' repos/<repo>/.env.example | sort -u     # 값은 읽지 않음
```

`.env.example` 이 **양쪽 다 존재**한다 (키 이름만 인용, 값 미열람).

| 키 | fin | fit | 병행 인스턴스에서 |
|---|---|---|---|
| `DATABASE_URL` | ○ | ○ | **반드시 다름 — RO 롤 URL** |
| `PORT` | ○(.env.example) | ○ | **반드시 다름** (4100/4200 회피) |
| `TELEGRAM_BOT_TOKEN` | ○ | ○ | **판단 필요** — 같은 토큰이면 전송은 되지만(폴링 안 하므로 409 없음) **실사용자에게 실제 메시지가 간다.** 별도 테스트 봇 토큰 권장 |
| `TELEGRAM_ALLOWED_CHAT_IDS` | ○ | ○ | **반드시 다름** — 검증용 chat 만 |
| `TELEGRAM_ADMIN_CHAT_IDS` | ○ | — | 동일 사유 |
| `TELEGRAM_WEBHOOK_SECRET` | ○(.env.example) | — | src 참조 0건 — 현재 미사용으로 보임 |
| `MCP_PORT` / `MCP_TRANSPORT` / `MCP_HTTP_URL` | ○ | ○ | **반드시 다름** (4210/4301 회피) — MCP 앱을 띄울 때만 |
| `MCP_LOG_DIR` / `MCP_LOG_TEE_FILE` / `MCP_LOG_LEVEL` / `MCP_LOG_RETENTION_DAYS` | ○ | ○ | 로그 파일 충돌 회피 위해 분리 권장 |
| `AUTH_PIN` / `AUTH_SECRET` / `AUTH_TRUST_HOST` | ○ | — | `AUTH_SECRET` 은 다르게 두면 실서비스 세션과 격리됨 |
| `BASE_URL` / `APP_BASE_URL` | ○ / — | — / ○ | 포트가 다르므로 함께 변경 |
| `SYNC_CRON` | — | ○ | **cron off 우회에 사용** (M2-3) |
| `MORNING_REPORT_CRON`·`EVENING_REPORT_CRON`·`REPORT_CRON`·`AUTO_ADJUST_CRON`·`AUTO_ADJUST_MAINTENANCE_CRON` | — | ○ | 봇 앱을 안 띄우면 무관 |
| `GARMIN_EMAIL`/`GARMIN_PASSWORD` | — | ○ | 같은 계정 동시 로그인 위험 — cron off 로 회피 |
| `MFDS_API_KEY`/`MFDS_BASE_URL`·`WHOOING_WEBHOOK_URL`·`CLAUDE_BIN`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH`·`NODE_ENV`·`TZ`·`NEXT_RUNTIME` | 혼재 | 혼재 | 그대로 재사용 가능 |

**필수 분리 키(위 표에서 셈): fin 7 · fit 6.**
(fin: `DATABASE_URL`·`PORT`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_ALLOWED_CHAT_IDS`·`TELEGRAM_ADMIN_CHAT_IDS`·`MCP_PORT`·`AUTH_SECRET` /
 fit: `DATABASE_URL`·`PORT`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_ALLOWED_CHAT_IDS`·`MCP_PORT`·`SYNC_CRON`)

---

# M4. 로컬 `repos/*` 개발 루프 성립 여부

```bash
for d in myFinance myFitness; do for f in .env .env.local node_modules .next dist src/generated/prisma .garmin-tokens; do
  [ -e "repos/$d/$f" ] && echo "$d/$f 존재" || echo "$d/$f 없음"; done; done
lsof -iTCP -sTCP:LISTEN -P -n | grep -iE 'postgres|5432'
pg_isready
lsof -iTCP -sTCP:LISTEN -P -n | grep -E ':(4100|4200|4210|4301)'
command -v pm2
```

| 항목 | myFinance | myFitness |
|---|---|---|
| `.env` | **존재** (키 이름·값 미열람) | **존재** |
| `.env.local` | 없음 | 없음 |
| `node_modules` | **존재** | **존재** |
| `.next` | **없음** | **없음** |
| `dist` (봇·MCP 번들) | **없음** | **없음** |
| `src/generated/prisma` | 해당 없음 (기본 위치) | **없음** ⚠ |
| `node_modules/.prisma/client` | **존재** (`libquery_engine-darwin-arm64.dylib.node` 포함) | `node_modules/.prisma` 존재하나 앱은 `@/generated/prisma/client` 를 import (`src/lib/prisma.ts:1`) |
| `.garmin-tokens` | 해당 없음 | **존재** |

| 로컬 런타임 | 실측 |
|---|---|
| Postgres 5432 리슨 | **있음** — `postgres` pid 2348, `[::1]:5432` · `127.0.0.1:5432` |
| `pg_isready` | **`/tmp:5432 - accepting connections`** |
| 4100/4200/4210/4301 리슨 | **없음** |
| `pm2` | **미설치** |

**결론:**
- `measured-facts.md` "로컬에는 실행 중인 서비스가 없다"(pm2 미설치 · 4100/4200 리슨 없음)는 **여전히 유효**하다. 다만 **로컬 Postgres 는 돌고 있다** — 그 절이 다루지 않은 값이다.
- 로컬 `repos/*` 에서 `next start` 를 하려면 **양쪽 다 `npm run build` 가 선행**돼야 한다 (`.next` 없음).
- **fit 은 build·typecheck 이전에 `npx prisma generate` 가 필요하다** — `src/generated/prisma` 가 없고 소스가 그 경로를 import 한다. 이는 **worktree 에 파일을 쓰는 행위**라 이번 측정에서는 실행하지 않았다.
- 즉 **로컬 병행 인스턴스는 "env 만 바꿔 띄우기" 가 아니다.** fit 은 `prisma generate` + `build`, fin 은 `build` 가 선행 조건이다.

---

# 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| RO 롤에서 `prisma.alertConfig.upsert` 가 **실제로** 던지는지 | 실행 필요. Postgres 는 `INSERT … ON CONFLICT` 를 **conflict 여부와 무관하게** INSERT 권한으로 검사하므로 거부가 예상되나, **런타임 미검증**이다 |
| `PrismaClient` 연결 자체가 RO 롤에서 쓰기를 시도하는지 (advisory lock 등) | 실행 필요. 코드·설정에는 `migrate` 호출이 없다는 것까지만 확인 |
| `pm2 start … --cwd` 로 fit ecosystem 우회가 실제로 되는지 | 로컬 pm2 미설치 · 서버 접근 없음 |
| 서버의 실제 pm2 앱 목록·env | 서버 접근 없음. `ecosystem.config.js` 기준으로만 기술 |
| `.env` 실제 값 (어떤 키가 이미 세팅돼 있는지) | **값 열람 금지.** 키 목록은 `.env.example` 과 `process.env.*` 전수로 대체 |
| Nginx 설정에 4100/4200 외 포트가 열려 있는지 | 저장소에 nginx 설정 파일 없음 |
| fit `SYNC_CRON="0 0 30 2 *"` 를 node-cron 이 수용하는지 | 실행 필요 (문법상 유효하나 미검증) |
| 병행 인스턴스가 같은 `TELEGRAM_BOT_TOKEN` 으로 전송할 때 실사용자 영향 | 정책 판단 — 측정 대상 아님 |
| `.next` 빌드 시간·디스크 | 빌드 미실행 (읽기 전용 규율) |
