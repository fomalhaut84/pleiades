# 1a-3 착수 직전 재감사 — `01_plan_1a3.md` 1회차 반증

감사일 2026-09-30 · `reversibility-auditor`(읽기 전용 — 본문을 오케스트레이터가 저장) · 대상 저장소·원본·pleiades 정본 쓰기 0.
기준 ref: fit worktree `integration/pleiades` = `02707a33…`(로컬=원격 · clean) · pleiades `origin/dev` = `d9d15355039f5a2ef0871231f608abc72eb067c1`.
감사 후 fit worktree `status --porcelain` 0줄 · HEAD `02707a3` 불변. 설치·실행은 스크래치 `…/scratchpad/1a3-audit/{m1,m1short,m1cli,m3}` 안에서만.

## 판정 요약

**확인 21 · 정정 10(블로커 3 · 비블로커 7) · 미확인 1(M-7 · 좁힘) · info 2.** 정정이 나왔으므로 계획은 초안으로 돌아간다.
블로커 3건(B1~B3)은 전부 **사용자 결정 항목(U-2·U-3·U-7)의 전제**가 틀린 것이다. fit 코드 변경 설계(D-1·D-2·D-4 · 호출 6 · 테스트 이식)는 코드·스크래치 실측 양쪽에서 성립했다.
스크래치에서 닫음: **M-1·M-2·M-3·M-8·M-10** · M-4 부분.

## 1. 주장별 판정 표

| # | 주장 (계획 위치) | 판정 | 근거 |
|---|---|---|---|
| 1 | §0 fit ref `02707a3` · clean · behind dev 1(`a984b85` #492) · 충돌 0 · 하네스 밖 차이 `.gitignore` 1파일 | 확인 | `rev-list --count origin/integration/pleiades..origin/dev` = 1 · `diff --stat … ':!.claude' ':!CLAUDE.md'` = `.gitignore` 1파일(+2/−1) |
| 2 | §0 pleiades `origin/dev` = `051ab0e` · 열린 PR #93 | 정정(N6) | 지금 `d9d1535`(#93 머지). `git diff --quiet 051ab0e d9d1535 -- packages package.json` → 패키지 동일 |
| 3 | §0 `send.ts` 124줄 · 줄 번호 | 확인 | `git show integration/pleiades:src/bot/notifications/send.ts \| cat -n` |
| 4 | 호출 6 · import 4파일 · re-export 소비자 0 · scripts 0 (R1) | 확인 | `git grep -n --text -E "notifications/send\|sendToAll\|SendResult\|SendKeyboardResult"` 열거 — `sendToAll` `scheduler.ts:34`·`:59` · `auto-adjust.ts:455` · `admin-alerts.ts:232` = 4, `sendToAllWithKeyboard` `auto-adjust.ts:395` · `auto-adjust-cron.ts:78` = 2, 합 6. scheduler importer 는 `standalone.ts:3` 1곳 |
| 5 | §0 `first` 소비 2곳 · 콜백은 messageId 로 매칭 안 함 | 확인 | `auto-adjust.ts:418-419` · `auto-adjust-cron.ts:97-100` · `telegramMessageId` 는 쓰기만 |
| 6 | §0 grammy lock 1.42.0 · deps 정렬 · lock 782 · overrides 16 · engines/.npmrc 없음 | 확인 | python json 검사 · `ls-tree` |
| 7 | §0 grammy `sendMessage` `{}` 와 생략 같은 payload | 확인 | `node_modules/grammy/out/core/api.js:139-140` |
| 8 | §0 fit 웹 발송 0 · admin-alerts 는 bot undefined 면 skip | 확인 | `admin-alerts.ts:192-197` · 웹 호출부에 `notifyBot` 전달 0 |
| 9 | §0 `[bot]` 로그 의존 절차 0 | 확인 | `/usr/bin/grep -rn --binary-files=text` — 매치 1건은 `connector[bot]` 무관 |
| 10 | S-1 발송 6건 전부 봇 프로세스 → 조건 5 β2 는 교체 경로 미관측 | 확인 | 8행 · 003:1633 |
| 11 | S-2 키보드 2모듈이 폴백 도달 · 엔티티 리터럴 | 확인(전제) | `plain.ts:3` · `auto-adjust.ts:141-148` · `auto-adjust-cron.ts:35-51`. "지금은 에러 문구가 대신 나간다" 는 #3 에만 맞다 → N2 |
| 12 | S-3 003 내부 불일치 | 확인 | 003:1100 · 003:1064 · Q27(003:1503) |
| 13 | S-4 패키지 7코드(ENOTFOUND) · fit 6 | 확인 | 두 `error.ts` diff — `ENOTFOUND` 1줄 + `sanitizeError` 최종 재마스킹 |
| 14 | S-5 분할 → 부분 전송 | 확인 | `deliver.ts:44-49` |
| 15 | S-6 / U-7 behind 1 을 "동기화 PR" **또는 "면제 명시"** 로 | **정정(B2)** | 아래 |
| 16 | Q48 (a) 40자 SHA 설치·유지·재현 (M-1·M-2) | 확인(실측) | §2 |
| 17 | lock `resolved` `git+ssh…` 표기일 뿐 ssh 0 | 확인(강화) | `GIT_SSH_COMMAND=/usr/bin/false npm ci` 성공 |
| 18 | #3·#5 교체 후 "최대 40 s/청크" · M-14 "대상×청크×40 s" | **정정(B3)** | 아래 |
| 19 | #5 "지금" = "#3 과 같다(`:83-86` throw)" | 정정(N2) | 아래 |
| 20 | #3 "두 번째 클릭은 무동작" | 정정(N3) | 아래 |
| 21 | `BroadcastResult` 3필드 유지 · `first.ref` = `String(message_id)` | 확인 | `types.ts:82-89` · `telegram.ts:39` · 프로브 `first:{target:"1",ref:"42"}` |
| 22 | 로그 문자열 동일 · `keyboard ` 소실 | 확인 | `deliver.ts:84-86` · `notifier.ts:81` · vitest 프로브 정규식 통과 |
| 23 | D-1 W2 · D-4 re-export 삭제 | 확인 | 4행 · `scheduler.ts:13-21` |
| 24 | D-2 `bot.api` 직접 대입 `tsc` exit 0 | 확인(재실측) | m3 에서 `notifierFor(bot: Bot)` 프로브 `npx tsc --noEmit --strict --moduleResolution bundler` exit 0 |
| 25 | D-3 근거 "shim 이면 ENOTFOUND·이중 마스킹이 인바운드로 번진다" | 정정(N4) | 아래 |
| 26 | 변경 파일 9 (1+1+1+6) · 하네스 언급 0 | 확인 | worktree `.claude`·`CLAUDE.md` 매치 0 |
| 27 | python 직접 편집 +1줄 | 확인(실측) | `diff pkg.orig package.json` = `33a34 >` 1줄 |
| 28 | baseline 11 = 불변 9 + 의도 변경 2 · 이식 단언 성립 | 확인(프로브) + I1 | 핵심 5건 fit vitest 4.1.11 로 5/5 통과 |
| 29 | §5-3 β2-I 명령(`.env` 없이 `npx prisma generate` → `npm run build`) | **정정(B1)** | 아래 |
| 30 | §6 등급 중간 · 근거 ①(M-10) ②(결합) | 정정(N5) | 아래 |
| 31 | `integration/pleiades` 미배포 · CI 는 dev/main 만 | 확인 | fit `deploy.yml`(`release.published`·`workflow_dispatch(tag)`) · `ci.yml`(push/PR `[dev, main]`) |
| 32 | M-10 명령 `gh api …/branches/dev/protection` (404 = 보호 없음) | 정정(N1) | 아래 |
| 33 | M-7 Next 가 CJS `dist` 를 번들 | 미확인(좁힘) | §2 |
| 34 | §10 반영 목록 | 정정(N7) · 누락 3 | 아래 |

## 2. 스크래치에서 닫은 미측정 항목 (로컬 node v20.18.0 · npm 10.8.2)

### M-1 · M-2 — https + 40자 SHA

```bash
# 1a3-audit/m1 — 빈 프로젝트 package.json 직접 편집
"@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#d9d15355039f5a2ef0871231f608abc72eb067c1"
npm install --foreground-scripts   # prepare(tsc -p packages/notify) · "added 1 package in 4s" · 3.60 s
```

- 표기 유지 — 설치 후 `package.json` 그대로(M-2 확인).
- lock 엔트리 `node_modules/@pleiades/notify` = `{"name":"pleiades","version":"0.1.0","resolved":"git+ssh://git@github.com/fomalhaut84/pleiades.git#d9d1535…","integrity":"sha512-sAEt…"}`. `integrity` 기록됨(info: npm 이 매번 `npm warn skipping integrity check for git dependency ssh://…` 출력 — 서버 로그에도 나온다).
- CJS `require` → export 17 · ESM named import(`createNotifier,createTelegramTransport,csvEnv,html,Route`) 성공.
- `rm -rf node_modules && GIT_SSH_COMMAND=/usr/bin/false npm ci` 성공(1.69 s) · lock `cmp` 무변경 · `dist/index.js` 존재 — ssh 0 실증.
- 짧은 SHA(`m1short`)도 설치 — `package.json` 짧은 표기 유지 · lock 은 40자 핀. 40자 권고는 필수가 아니라 가독성·충돌 회피 선택.
- `m1cli`: `npm install "@pleiades/notify@git+https://…#<sha>"` 는 `github:fomalhaut84/pleiades#<sha>` 로 정규화 — "직접 편집" 요구가 맞다.

### M-3 — fit lock 증가분

```bash
# 1a3-audit/m3 — fit package.json·package-lock.json 사본 → §3-3 python 편집 →
npm install --package-lock-only --ignore-scripts   # EBADENGINE(entities@8.0.0 >=20.19.0)만 · 1.73 s
```

- lock 782 → 783 · 추가 `node_modules/@pleiades/notify` 1 · 제거 0 · 루트 `""` deps +1 · `git diff --no-index --stat` +7줄. 계획 예상과 일치.
- fit 전체 트리 `npm ci` 680 packages · 8.8 s(1회 · M-4 참고치 · worktree 실측 아님) · lock 무변경.
- `npm ci` 는 `prisma generate` 를 돌리지 않는다 — 계획의 별도 단계가 맞다.
- 로컬 EBADENGINE 대상은 `@csstools/*` 가 아니라 `entities@8.0.0` 로 관측(영향 없음).

### M-8 — 봇 esbuild 번들: 인라인된다 (닫음)

`build:bot` 과 같은 `--external`(grammy · node-cron · dotenv · garmin-connect · @prisma/client/runtime) 로 프로브 번들 → `grep -c createNotifier out.cjs` = 6 · `require("@pleiades/notify")` = 0. 실행: 5000자 + 키보드 → `send 1 4096 {"parse_mode":"HTML"}` → `send 1 904 {"parse_mode":"HTML","reply_markup":{…}}`. **키보드는 마지막 청크에만 · `first.ref` 는 마지막 청크.** MCP 번들은 admin-alerts 미도달(`git grep` 0).

### M-10 — pleiades `dev` force-push 보호: 있다 (닫음 · 명령 정정)

```
gh api repos/fomalhaut84/pleiades/rules/branches/dev
  → deletion · non_fast_forward · pull_request · required_status_checks[verify (20.x), verify (24.x)] (ruleset 24220405 · active)
gh api repos/fomalhaut84/pleiades/rulesets/24220405 → bypass_actors [] · current_user_can_bypass "never"
gh api repos/fomalhaut84/pleiades/branches/dev/protection → 404 "Branch not protected"   ← 계획의 명령(거짓 음성)
```

### M-7 — Next 웹 번들: 미확인 (좁힘)

`next.config.mjs` = `{}`. 루트 `exports` 는 `types`·`default` 뿐. 정적 장애 요인 0 이나 Turbopack 실빌드는 E5 에서만 판정. admin-alerts 는 `lib/garmin/sync.ts:7` → `app/api/sync/route.ts` 로 웹에 번들되므로 **웹 빌드가 패키지를 실제로 해석해야 한다.**

## 3. 정정 상세

### B1 (블로커) — β2-I 명령은 `npx prisma generate` 에서 실패 · "`.env` 없음 → 접속 대상 없음" 미검증

- fit `prisma.config.ts` 는 `import "dotenv/config"` + `datasource: { url: env("DATABASE_URL") }`(prisma 6.19.3).
- `env -u DATABASE_URL npx prisma generate` → `PrismaConfigEnvError: Missing required environment variable: DATABASE_URL` · exit 1.
- `DATABASE_URL="postgresql://none:none@127.0.0.1:1/none" npx prisma generate` → exit 0(generate 는 접속 안 함).
- 계획 명령은 서버에서 5행째에 멈춘다. 계획은 build 실패에만 "중단·보고" 를 적어 generate 실패가 즉흥 우회를 부른다.
- 반대 경우가 더 위험: **서버 셸에 `DATABASE_URL` 이 export 돼 있으면** generate 통과 → `next build` 가 실 DB 를 가리킨 채 돈다. 조건 #2 "해당 없음" · #8 "없음" 은 이 경로를 배제하지 못한다.
- 고침: β2-I 앞에 `env | grep -c DATABASE_URL` = 0 확인 · generate·build 에 **도달 불가 더미 URL 을 명령줄 env 로만** · 조건 #2·#8 을 "더미 URL · 셸 env 부재 확인" 으로 · `next build` 가 더미 URL 로 실패할 수 있음을 미확인으로 명시. 되돌리기(`rm -rf`) 즉시.

### B2 (블로커) — U-7 "(나) 면제 명시" 는 규정에 없다

- `dual-repo-change/SKILL.md:193` = 0 요구 · "아니면 먼저 동기화 PR". 면제는 동기화 PR 자신에게만.
- `workflow.md` `dev 수용` 행: "0 이 아닌 저장소는 … 전에 동기화한다". 미러 조항의 "다음 동기화가 무충돌로 흡수" 는 예측이지 면제가 아니다.
- 실측 `git merge-tree --write-tree origin/integration/pleiades origin/dev` = `21ef21a4…` = `origin/integration/pleiades^{tree}` — 트리 변화 0(#489 선례 형태).
- 고침: U-7 을 선택지에서 빼고 E0b 를 (가) 고정. (나)는 룰 개정 필요. E0b 에 이슈 1:1 · 9-1(diff 0) · 머지 후 `git log -1 --format=%P` 부모 2 확인 명시(I2).

### B3 (블로커) — 키보드 경로 최악 지연 7배 과소

- fit 봇 `timeoutSeconds: 60`(`bot/index.ts:30,39`). grammy 타임아웃은 패키지 `GRAMMY_TIMEOUT_RE` 로 네트워크 오류 → 재시도(`error.ts:71,85`).
- 청크 1·대상 1 최악 = **4 × 60 s + 백오프 40 s = 280 s**. 계획 "40 s" 는 백오프만.
- M-14: `runAutoAdjustMaintenance` `take: 10`(`auto-adjust-cron.ts:161`) → tick 최악 10 × 대상 × 청크 × 280 s(= 2,800 s). **지금도** 10 × 60 s = 600 s > 300 s — tick 겹침은 기존 가능성이고 1a-3 은 창을 약 4.7배 넓힌다. 겹치면 뒤 tick 의 `findMany(snoozed, snoozeUntil<=now)` 가 전송 중인 건을 다시 집어 **중복 재전송** 가능. 조건부 `updateMany` 는 메시지 중복을 막지 않는다.
- 고침: U-3 ① 지연을 "최악 280 s/청크/대상" 으로 · M-14 에 `take:10` 과 기존 600 s. 사용자가 이 수치를 보고 U-3 에 답한다.

### N1 — M-10 명령

`branches/dev/protection` 은 ruleset 을 못 봐 보호가 있어도 404 — "404 = 보호 없음" 은 거짓 음성. `rules/branches/dev` 로 바꾸고 결과 기록. SHA 도달성의 남은 전제는 **PUBLIC 유지**((a)·(b) 공통).

### N2 — #5 "지금" 동작

`processSnoozed` throw(`:83-86`)는 `runAutoAdjustMaintenance:166-169` 에서 `console.error` 로만 끝난다 — 사용자 문구 없음. decision 이 `snoozed` 로 남아 **5분 뒤 tick 이 재전송**(TTL 만료 전까지). S-2 의 "에러 문구가 대신 나간다" 는 #3 에만 맞고, #5 는 이미 tick 단위 재전송이 있으며 "타임아웃 후 실제 도달 → 중복" 은 #5 에서 오늘도 가능하다. U-3 ① 을 #3·#5 로 나눈다.

### N3 — "두 번째 클릭은 무동작"

콜백 갱신 조건 `decision in [pending, snoozed]`(`auto-adjust-callback.ts:141,193,208`). 첫 클릭이 Snooze 면 두 번째 클릭은 동작한다. 무동작은 첫 클릭이 Accept·Reject 일 때만. 새 위험은 아니나 문장 부정확.

### N4 — D-3 근거

`send.ts` 삭제 후 fit `utils/error.ts` importer = 운영 6 + 테스트 1. 운영 6곳은 전부 `sanitizeError` 만 import — `isNetworkError`·`isHtmlParseError`·`getErrorCode` 는 운영 소비자 0(죽은 export). shim 의 실제 파급은 ① `sanitizeError` 재마스킹(출력 동일) ② **`error.test.ts:101`**(`isNetworkError({code:"ENOTFOUND"})` → `false` baseline) 깨짐. 결정(교체 안 함)은 성립 — 근거 문장만 고치고 죽은 export 사실 추가.

### N5 — §6 등급 근거·시점 한정

근거 ①(M-10) 해소. 근거 ②(이후 pleiades 변경과 결합)는 SHA 핀이라 되돌리는 행위와 무관. 머지 후 행위 = revert PR + `npm ci` + `prisma generate` + 8절 4종 · 서버·pm2 0(β2-R 미실행 · 미배포 전제) — 1a-2 와 같은 행위이고 1a-2 는 **즉시**(003:1063 · `_workspace/1a-2/04_operator_rollback.md:6`). (i) "즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간" 으로 시점 한정, 또는 (ii) 중간 유지 시 실제 이유를 적는다. §6 "pleiades 쪽" 행도 "pleiades revert 즉시 · fit 관측 동작 되돌림은 fit PR(SHA 갱신)" 으로 분리. 003:1062 "삭제가 양쪽 `npm ci` 를 깬다" 는 SHA 핀에서 불성립(이력 재작성·비공개 전환 때만) — §10 에 추가.

### N6 — §0 stale · U-2 영향

`origin/dev` = `d9d1535`(패키지 동일). #93 CI `verify (24.x)` 가 루트 `npm ci`(= `prepare`)를 node 24 에서 돈다(dev push run success 2026-09-30 01:01). Q45 ④ 중 "node 24 에서 prepare 가 도는가" 는 CI 가 대리 검증. β2-I 고유 가치는 **서버 자체**(레지스트리·github 경로 · 임시 클론 · 서버 자원 · 서버에서의 fit `next build`)로 좁혀 적는다.

### N7 — §10 반영 목록 누락 3

- `dual-repo-change/SKILL.md:124` fit `npm run test` = "vitest run + verify 스크립트 2개" stale(실제 5종).
- 003:1062 (N5).
- 003 §5-2 1a-3 행 "import 6건 되돌림" → 호출 6 · import 4파일.

## 4. info

- I1: §4 `:147` 새 기대값(재시도 4회 후 실패 · 호출 5)은 fake timers 필요 — real timers 면 40 s 가 흘러 vitest 5 s timeout. 프로브는 `vi.useFakeTimers()` + `runAllTimersAsync()` 로 통과.
- I2: E0b 동기화 PR 의 이슈·9-1 (B2).

## 5. 사용자 결정 항목에 영향을 주는 사실

| 항목 | 영향 |
|---|---|
| U-1 (Q48) | (a) 40자 SHA 실측 성립 — 설치·표기 유지·lock 핀·`npm ci` 재현·ssh 0·짧은 SHA 도 동작. dev 는 ruleset 으로 force-push·삭제 차단 · bypass 0. 남은 전제는 PUBLIC 유지 |
| U-2 (β2) | B1: 명령 그대로면 실패, 셸 env 에 `DATABASE_URL` 있으면 실 DB. N6: node 24 prepare 는 CI 가 대리 검증. 명령·가치 고친 뒤 묻는다 |
| U-3 (관측 변경) | B3: 최악 280 s/청크/대상 · tick 최악 2,800 s · 중복 재전송 창 확대. N2: #5 는 이미 tick 재전송 · 실패 시 문구 없음. N3 |
| U-4 (D-1~D-4) | 성립(tsc·vitest·esbuild 프로브). D-3 근거만 정정 |
| U-5 (label `'bot'`) | 로그 형식 동일 프로브 확인 · 의존 절차 0 |
| U-6 (γ-live) | M-13(Q46 토큰 발급) 사용자 확인 |
| U-7 | B2: 선택지 아님 — (가) 동기화 PR 만. (나)는 룰 개정 필요 |
| 등급 | N5: 1a-2 선례로 머지 후 행위는 즉시 급. 중간 유지 시 실제 이유, 즉시로 내리면 시점 한정 |

## 6. 결론

fit 코드 교체 설계(호출 6 전수 · D-1/2/4 · 테스트 이식 · Q48 (a) 40자 SHA 설치·`npm ci` 재현)는 코드·스크래치 실측 양쪽에서 성립한다. 그러나 사용자 결정의 전제에 블로커 3 — β2-I 는 `DATABASE_URL` 없이 `prisma generate` 에서 실패 · U-7 면제는 규정에 없는 경로 · 키보드 경로 최악 지연은 40 s 가 아니라 280 s. 비블로커 7 포함 계획은 초안으로 돌아간다. 고친 뒤 승인 게이트로.
