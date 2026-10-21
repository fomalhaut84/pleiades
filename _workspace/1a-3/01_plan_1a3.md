# 1a-3 집행 계획 — myFitness `send.ts` → `@pleiades/notify` 교체

작성 2026-09-30 · `decision-writer` · ~~**1회차 초안 — 감사 전**~~ ~~**2회차 개정 (2026-09-30) — 착수 직전 재감사 `03_auditor_1a3plan.md`(확인 21 · 정정 10 · 블로커 3) 반영 · 재감사 또는 승인 게이트 대기**~~ **3회차(감사 r2 직접 반영 · 2026-09-30)** — 2회차 재감사 `03_auditor_1a3plan_r2.md`(정정 7 · 블로커 1 · "문안 수준 · 직접 반영 후 게이트 가능") 를 재감사 없이 반영(#37 선례) · **승인 게이트 대기**
입력: 003 §1-1(2026-09-08 · 2026-09-30 정정) · §3-1 · §4-1(a) · §4-2(맨 위 시그니처 + 2026-09-10 정정) · §5-1 · §5-2 1a-3 행과 그 아래 정정들 ·
§8-1 · §10 Q10(Q10-L ①) · **Q48** · Q44 · Q46 · §10-1 10조건 · §10 끝 2026-09-30 Q45 정정 ·
measured-facts M1·M2·M3 · C-1~C-4 · 1a-1 E6·E6b · 1a-2 집행 실측 · 2026-09-28 절 · 2026-09-30 Q45 절 ·
`_workspace/1a-2/01_plan_1a2.md`·`03_auditor_1a2plan.md`(형식·재발 방지) · 이슈 #48(I2·I3) · 코드 원문(§0).

> **이 단계가 쓰는 곳은 `repos/myFitness` worktree 하나다(모드 I · 단독 — 대칭 변경 아님).** 원본 `~/workspace/myF*` 는 읽기 전용(#80).
> `repos/myFinance` 무접촉(1a-4 몫). **pleiades 는 이 단계에서 코드를 바꾸지 않는다** — 소비자가 dev 의 한 커밋을 참조할 뿐이다(Q48).
> 서버는 **β2 를 이 단계에서 소비할 때만**(§5-3 · 사용자 결정 U-2), **사용자가 실행**한다.
> 되돌리기 ~~**중간**(003 §5-2 · 등급 하향 여부는 감사 판정 — §6)~~ **즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간**(2회차 · 감사 N5 · 003 §5-2 값과 달라 **사용자 확인 U-8** — §6).
> **이 초안은 정본 문서를 고치지 않는다.** 정본 반영 목록은 §10.

## 0-0. 변경 이력 — 2회차에서 무엇이 바뀌었나 (감사 정정 번호)

1회차 서술은 지우지 않았다 — 틀린 자리는 취소선 또는 `> **정정 (2회차 · 감사 <번호>).**` 블록으로 남겼다.

| 감사 # | 반영 | 어디 |
|---|---|---|
| **B1 (블로커)** | β2-I 명령이 서버에서 `npx prisma generate` 에 멈춘다 — fit `prisma.config.ts` 가 `env("DATABASE_URL")` 을 요구(`PrismaConfigEnvError` · 스크래치 실측). 반대로 **서버 셸에 `DATABASE_URL` 이 export 돼 있으면** `next build` 가 실 DB 를 가리킨 채 돈다. → 명령 앞에 **`env \| grep -c DATABASE_URL` = 0 확인** · generate·build 에 **도달 불가 더미 URL 을 명령줄 env 로만** · 조건 #2·#8 문구 교체 · generate·build 어느 쪽이 실패해도 **중단·보고(우회 금지)** · 더미 URL 로 `next build` 가 실패할 수 있음을 미확인(M-15)으로 | §5-3 · §8 · §9-2 |
| **B2 (블로커)** | U-7 의 "(나) 면제 명시" 는 규정에 없는 경로(`dual-repo-change:193` · `workflow.md` `dev 수용` 행). merge-tree 결과 트리 = `origin/integration/pleiades^{tree}`(트리 변화 0) → **U-7 을 결정 항목에서 뺀다 · E0b = 트리 변화 0 동기화 PR 고정**(이슈 1:1 · 9-1 · merge commit · 머지 후 부모 2 확인) | S-6 · §3-4 E0b · §9-1 |
| **B3 (블로커)** | 키보드 경로 최악 지연을 40 s 로 적었다 — 백오프만 셌다. fit 봇 `timeoutSeconds: 60` + 패키지가 grammy 타임아웃을 네트워크 오류로 재시도 → **최악 280 s/청크/대상**(4 × 60 + 40). maintenance tick 은 `take: 10` → **기존에도 최악 600 s > 5분**이고 1a-3 은 그 창을 **약 4.7배**(2,800 / 600) 넓힌다 → 겹친 tick 의 **중복 재전송** 가능 | §2 #3·#5 · §8 M-14 · U-3 |
| N1 | M-10 명령 `branches/dev/protection` 은 ruleset 을 못 봐 거짓 음성(404) → `rules/branches/dev` · **닫힘**(force-push·삭제 차단 · bypass 0). SHA 도달성의 남은 전제 = **PUBLIC 유지** | §1 · §8 |
| N2 | #5 의 "지금" 동작 — throw 는 `console.error` 로만 끝나고 사용자 문구 없음 · `snoozed` 로 남아 5분 뒤 재전송. S-2 "에러 문구가 대신 나간다" 는 #3 에만 맞다 → U-3 ① 을 #3·#5 로 나눈다 | S-2 · §2 · U-3 |
| N3 | "두 번째 클릭은 무동작" → 첫 클릭이 Accept·Reject 일 때만. Snooze 면 두 번째 클릭은 동작 | §2 #3 |
| N4 | D-3 근거 — 운영 importer 6곳은 전부 `sanitizeError` 만 import(나머지 export 는 운영 소비자 0). shim 의 실제 파급은 재마스킹(출력 동일) + `error.test.ts:101` baseline 파손 | §3-1 D-3 |
| N5 | 등급 — 머지 후 행위(revert PR + `npm ci` + `prisma generate` + 8절)는 1a-2 와 같고 1a-2 는 즉시. → **"즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간"** 으로 시점 한정(**사용자 확인 항목 U-8**) · pleiades 쪽 행 분리 | §6 · §9 |
| N6 | `origin/dev` = `d9d1535`(#93 머지 · 패키지 동일). CI `verify (24.x)` 가 node 24 에서 `prepare` 를 대리 검증 → β2-I 의 고유 가치는 **서버 자체**(경로·자원·서버에서의 fit `next build`)로 축소 | §0 · §5-3 |
| N7 | §10 누락 3 — `dual-repo-change/SKILL.md:124`(verify 2 → 5) · 003:1062 *"삭제가 양쪽 `npm ci` 를 깬다"*(SHA 핀에서 불성립) · 003 §5-2 1a-3 행 *"import 6건"* → 호출 6 · import 4파일 | §10 |
| I1 | §4 `:147` 새 기대값은 fake timers 필수 | §4 |
| 닫힌 미측정 | **M-1·M-2·M-3·M-8·M-10** 닫힘 · M-4 부분 · M-7 좁힘(감사 §2) | §8 |
| **3회차 · r2 R1 (블로커)** | β2-I 의 `.env` 확인 줄 `ls -a \| grep -c '^\.env'` 는 tracked `.env.example` 에 매치해 **항상 1 → 거짓 중단** → `ls -a \| grep -cE '^\.env(\.local\|\.production\|\.production\.local)?$'` = 0 | §5-3 |
| 3회차 · r2 R2 | N5 가 §10 에서 되돌려져 있었다(*"1a-1 산출물의 되돌리기가 중간으로 넘어갔음"*) → 감사 문구로 교체 | §10 |
| 3회차 · r2 R3 | `\| tee` 가 exit code 를 가린다 → β2-I 묶음 첫 줄 `set -o pipefail` + 각 단계 뒤 `echo "exit $?"` | §5-3 |
| 3회차 · r2 R4 | "신규 5" 는 고정값이 아니다 → "신규 ①~⑤(⑤는 E3 판정 · 건수는 E5 실측 M-9)" | §4 · 9-2′ |
| 3회차 · r2 R5 | 닫힌 측정 stale 4곳(M-10 명령·실패 칸 · §0 fit 빌드 행 · §3-2 행 2 · §0 로컬 행) 취소선/정정 | §0 · §3-2 · §8 |
| 3회차 · r2 R6 | E0b 동기화 PR 이 1a-3 게이트 승인에 묶인다는 것 + E0b 도 9-3 봇 루프(또는 봇 불가 표) | §3-4 · 9-2′ |
| 3회차 · r2 R7 | 머지 후 롤백에 base 재체크아웃·revert 브랜치 삭제 · 상태 판정 표 E0b 행 · 사전 사본 "해당 없음(tracked · 이력 보존)" | §6 · 9-2′ |
| 3회차 · M-15·M-7 | **로컬 닫힘**(감사 r2 §2 — 더미 URL `next build` exit 0 · 12.7 s · Turbopack 이 `createNotifier` 를 서버 chunk 에 번들 · `transpilePackages` 불필요). 서버분은 E9 | §5-3 · §8 |

## 0. 실측 (2026-09-30 · 이 초안 작성 중 읽기 명령만)

| 항목 | 값 | 명령 · 출처 |
|---|---|---|
| fit worktree | `integration/pleiades` = **`02707a3`**(#499) · clean · 로컬 = 원격 | `git -C repos/myFitness rev-parse integration/pleiades origin/integration/pleiades` · `status -sb` |
| **fit behind dev** | **1** — `a984b85`(#492 · 1a-2 마지막 미러 · 내용 동일). `merge-tree` 충돌 **0**. `.claude`·`CLAUDE.md` 밖 차이는 `.gitignore` 1파일 | `git fetch -q origin && git rev-list --count origin/integration/pleiades..origin/dev` · `git merge-tree --write-tree --name-only --no-messages …` · `git diff --stat … -- . ':!.claude' ':!CLAUDE.md'` |
| pleiades `origin/dev` | ~~**`051ab0ee911c32df03895c205e3057acc225c15f`**(#92) · 열린 PR **#93**~~ → **`d9d15355039f5a2ef0871231f608abc72eb067c1`**(#93 CI 머지 · 감사 N6) · `git diff --quiet 051ab0e d9d1535 -- packages package.json` → **패키지 동일** · 태그 **0**. #93 CI `verify (24.x)` 가 루트 `npm ci`(= `prepare`)를 node 24 에서 돈다(dev push run success 2026-09-30) | `git rev-parse origin/dev` · 감사 §1 행 2 |
| 패키지 설치 키 | 루트 `name` = **`pleiades`** · 버전 `0.1.0`(#86). **소비자 키는 반드시 `@pleiades/notify`** — 키 없이 설치하면 `node_modules/pleiades` | 루트 `package.json` · `packages/notify/README.md` · M1 케이스 C |
| 공개 API (1a-3 이 쓰는 것) | `createNotifier` · `createTelegramTransport` · `csvEnv` · `html` · `Route` · 타입 `Notifier`·`BroadcastResult` | `packages/notify/src/index.ts` |
| fit `send.ts` | **124줄**. `getChatIds:24-29`(fit 규칙) · `truncate:35-37`(4093+`...`) · `sendOneWithRetry:39-75`(재시도 `[2000,8000,30000]` 총 4회 · HTML 파싱 실패 → plain 즉시 · `attempt--`) · `sendToAll:77-91` · `sendToAllWithKeyboard:98-124`(**재시도·폴백 없음** · `first{chatId,messageId:number}`) · 로그 3종 `:69`·`:87`·`:119` | `cat -n` |
| **호출 6건 · import 4파일** | `sendToAll` 4 = `scheduler.ts:34`·`:59` · `auto-adjust.ts:455` · `admin-alerts.ts:232` / `sendToAllWithKeyboard` 2 = `auto-adjust.ts:395` · `auto-adjust-cron.ts:78`. import = `scheduler.ts:15-21`(re-export 블록 + import) · `auto-adjust.ts:20` · `auto-adjust-cron.ts:10` · `admin-alerts.ts:10`. **`scheduler.ts` re-export 의 소비자 0**(scheduler 를 import 하는 곳은 `standalone.ts:3` 의 `startBotScheduler` 뿐) · `scripts/` 0 | `git grep -n --text -E "notifications/send\|sendToAll\|SendResult\|SendKeyboardResult" integration/pleiades -- src scripts` · `git grep … "notifications/scheduler"` |
| `first` 소비 2곳 | `auto-adjust.ts:418-419` · `auto-adjust-cron.ts:97-100` — 둘 다 `String(first.messageId)` → `telegramMessageId`(String? 컬럼) · `first.chatId` → `telegramChatId` | `grep -n first` |
| 콜백 매칭 키 | `callback_data = auto_adjust:<action>:<adjustmentId>` · 갱신은 `decision in [pending, snoozed]` 조건부 — **messageId 로 매칭하지 않는다** | `auto-adjust-callback.ts:46-57,141,193,208,238-239` |
| 1a-2 baseline | `src/bot/notifications/__tests__/send.test.ts` **`it()` 11**(sendToAll 8 · keyboard 3). fit vitest 전체는 **63파일 433건 + verify 5종**(2026-09-28 동기화 후) | `grep -c "^\s*it("` · measured-facts 2026-09-28 §3 |
| fit 검증 스크립트 | `test` = `vitest run && verify 5종`(dev 동기화로 2 → 5) · `test:run` · `typecheck` = `tsc --noEmit` · `lint` = `eslint src/ --max-warnings 0` | `package.json` scripts |
| fit 의존성 | `grammy ^1.42.0` → lock **1.42.0**(E6b 프로브 버전과 같다) · `next ^16.3.5` · lock `packages` **782** · `engines` 없음 · `.npmrc` 없음 · `overrides` 16키(`esbuild: "$esbuild"` 남음) | `python3 -c json` · `ls .npmrc` |
| fit 빌드 | `build` = `next build` + esbuild(mcp · **bot `--external:grammy …` — `@pleiades/notify` 는 external 이 아니므로 `dist/bot/standalone.cjs` 에 ~~인라인될 것**(미측정 §8 M-8)~~ **인라인된다 — 감사 프로브 `grep -c createNotifier` = 6 · `require("@pleiades/notify")` 0 (M-8 닫힘 · 3회차 R5)**) | `package.json` `build:bot` |
| fit 웹의 발송 | **0 재확인** — `admin-alerts` 는 웹에도 번들되나(`lib/garmin/sync.ts` → `app/api/sync/route.ts`) 웹 경로는 `notifyBot` 을 넘기지 않아 `bot` undefined → `admin-alerts.ts:192-197` 에서 skip | `git grep "syncAll(" -- src/app src/lib/cron.ts` · `sync.ts:425` |
| 봇 스케줄 env | `MORNING_REPORT_CRON`·`EVENING_REPORT_CRON`·`REPORT_CRON`·`AUTO_ADJUST_CRON`·`AUTO_ADJUST_MAINTENANCE_CRON`(`scheduler.ts:68,80,91,103,110`) — **끄는 env 는 없고 재지정만** | `git grep "process.env.[A-Z_]*CRON"` |
| grammy payload | `sendMessage(chat_id, text, other)` = `raw.sendMessage({ chat_id, text, ...other })` → **`other = {}` 와 인자 생략은 같은 payload** | `node_modules/grammy/out/core/api.js:139-140` |
| `[bot]` 로그 의존 | fit `.claude`·`CLAUDE.md`·`deploy`·`scripts`·`.github` 에 `[bot]`·`keyboard 메시지 전송 실패` grep 절차 **0**. `docs/specs/bot-telegram-ipv6-timeout-202606.md:15,147,201,228` 에 기록만(`:228` 은 본문 `메시지 전송 실패` 0건 확인 — 본문은 보존된다) | `/usr/bin/grep -rn --binary-files=text …` |
| fit 원격 | **PUBLIC** · 기본 브랜치 `main` → 서버에서 자격 증명 없이 클론 가능(서버 https 200 · Q45) | `gh repo view fomalhaut84/myFitness --json visibility` |
| 서버 | 1대 · node **v24.12.0** · npm **11.6.2** · git 2.53.0 · `engine-strict` false · github https 200 | measured-facts 2026-09-30 |
| 로컬 | node **v20.18.0** · npm **10.8.2** (~~dev 유래 `@csstools/*` `>=20.19.0` EBADENGINE 경고~~ **정정 (3회차 · r2 R5): 감사 스크래치에서 관측된 대상은 `entities@8.0.0`(`>=20.19.0`)** EBADENGINE 경고 — 설치·검증 영향 없음 · 2026-09-28 §3 · 감사 §2 M-3) | `node -v` · `npm -v` |

### 0-1. 가정을 뒤집는 값 · 계획에 들어가는 발견

| # | 무엇 | 왜 계획에 들어가나 |
|---|---|---|
| **S-1** | **fit 의 아웃바운드 발송 6건은 전부 봇 프로세스에서 나간다**(웹은 0 — §0). 그런데 §10-1 조건 5 는 *"봇 미기동"* 이다 | **조건 5 를 지키는 β2 는 fit 의 교체된 발송 경로를 한 번도 밟지 못한다.** β2 로 발송을 관측하려면 조건 5 의 예외(Q46 검증 토큰으로 봇 기동)가 필요하다 — §5-3 에서 β2 를 **설치·빌드(β2-I)** 와 **기동·발송(β2-R)** 으로 쪼개는 이유 |
| **S-2** | **키보드 경로가 plain 폴백을 얻는 순간 C-4 의 전제가 깨진다.** C-4(Q10-P ① 근거)는 *"fit 에서 엔티티를 만드는 모듈 2개는 폴백 분기가 없는 `sendToAllWithKeyboard` 로 나간다 → fit 폴백이 보는 엔티티 0"* 이었다. 1a-3 이후 그 2개(`auto-adjust.ts`·`auto-adjust-cron.ts` — `escapeHtml` 로 `&amp;` 등을 만든다)가 **폴백 경로에 도달한다** | 파싱 실패 시 키보드 메시지가 **엔티티가 리터럴(`&amp;`)로 남은 plain** 으로 나간다. ~~지금은 같은 상황에서 **전송 자체가 실패**하고 에러 문구가 대신 나간다(§2 #3·#5)~~ **지금은 같은 상황에서 전송 자체가 실패한다 — #3 은 에러 문구가 대신 나가고, #5 는 사용자 문구 없이 `console.error` 로 끝나 5분 뒤 tick 이 재전송한다**(감사 N2 · §2) — 개선이지만 **관측 변경이고 Q10-P ① 의 "fit 0" 서술은 1a-3 과 함께 정정 대상**(§10) |
| **S-3** | 003 안의 불일치 — §5-2 정정 ①은 *"1a-0~1a-3 은 여전히 동작 변경 0"* 이라 적었고, 같은 절 표 1a-3 행은 *"fit 아웃바운드가 재시도·폴백을 키보드 전송에서도 얻는다"* 고 적었다. fin 쪽 **같은 성격의 변경**(`rsu.ts:184` 재시도 ×4 + 폴백)은 *"지연 또는 중복 전송이 보일 수 있다"* 는 이유로 **Q27 사용자 확인 대상**이 됐다 | 같은 기준을 fit 에 적용하면 **키보드 경로 신뢰성 획득도 확인 대상**이다 → 사용자 결정 **U-3**. 정본 정정은 §10 |
| **S-4** | 패키지의 `isNetworkError` 는 fin 정본(**`ENOTFOUND` 포함 7코드** · 003 §3-1)이고 fit 로컬판은 6코드다 | fit 6 호출 전부에서 **DNS 일시 실패가 새로 재시도 대상**이 된다(최대 2+8+30 s 지연 후 성공 가능). 관측 변경 묶음(U-3)에 넣는다. fit `bot/utils/error.ts`(importer 7파일)는 **이 단계에서 교체하지 않는다**(D-3) |
| **S-5** | 분할 도입으로 **부분 전송 상태**가 새로 생긴다 — 청크 1 성공 후 청크 2 가 최종 실패하면 그 대상은 `failed` 로 집계되지만 사용자는 앞부분을 받았다. 지금(절단)은 메시지 1건이라 이 상태가 없다 | 관측 변경 묶음(U-3). 발생 조건은 **4096 초과 + 청크 중 하나의 최종 실패**라 좁다 — 빈도는 측정 경로 없음(C-1) |
| **S-6** | fit 은 `origin/dev` 대비 **1 뒤처져 있다**(§0). `dual-repo-change` 체크리스트(모드 I)는 **`= 0`** 을 요구하고, `workflow.md` 브랜치 전략 표는 이 1커밋을 *"다음 동기화가 무충돌로 흡수"* 로 적었다 | ~~둘을 함께 만족하는 길은 **트리 변화 0 동기화 PR**(#75 myFitness#489 선례)이거나 **면제 명시**다 → 사용자 결정 **U-7**(낮음)~~ **정정 (2회차 · 감사 B2).** 면제는 규정에 없다 — `dual-repo-change:193` 은 `= 0` 이 아니면 *"먼저 동기화 PR"* 이고 면제는 동기화 PR 자신에게만, `workflow.md` `dev 수용` 행은 *"0 이 아닌 저장소는 … 전에 동기화한다"*. 미러 조항의 *"다음 동기화가 무충돌로 흡수"* 는 예측이지 면제가 아니다. `git merge-tree --write-tree origin/integration/pleiades origin/dev` = `21ef21a4…` = `origin/integration/pleiades^{tree}` → **트리 변화 0**. **E0b = 동기화 PR 로 고정**(#489 선례 형태) — 결정 항목 아님 |

## 1. Q48 — 1a-3 이 패키지를 무엇으로 참조하나 · **사용자 결정 U-1**

전제: 첫 릴리즈(`dev` → `main` + 태그)는 모노레포 흡수 + Discord 통합 알림 이후(#88). URL 부분(`git+https://…` + **`package.json` 직접 편집**)은 확정(Q28 · 003 §1-1)이고 **`#` 뒤만** 정한다.
공통 사실: **lockfile 은 어느 참조든 커밋 SHA 로 핀하고 `resolved` 를 `git+ssh://…#<sha>` 로 적는다**(표기일 뿐 ssh 호출 0 — M1·M2). lock 의 `version` 은 **설치된 루트 `package.json` 의 `version`** 이다(M1: 가짜 패키지 `0.0.1` 이 그대로 적혔다) → 지금은 어느 커밋이든 `0.1.0`.

| | 소비자 `package.json` | 갱신 절차 | `workflow.md` 릴리즈 절과의 관계 | 되돌리기 (등급 · 행위) | 대가 |
|---|---|---|---|---|---|
| **(a) 커밋 SHA 고정 (권고)** | `"@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#<SHA40>"` | pleiades `dev` 에 머지된 새 커밋의 SHA 로 **한 줄 직접 편집 → 인자 없는 `npm install` → lock `resolved` 변경 확인 → fit PR**(모드 I) | **충돌 없음** — 태그를 만들지 않는다 | **즉시** — 한 줄 + `npm install`(참조 방식을 나중에 태그로 바꾸는 것도 같은 행위) | ① 사람이 읽을 버전이 없다(lock `version` 은 SHA 마다 `0.1.0`) → **SHA ↔ pleiades PR 대응을 fit PR body 와 measured-facts 에 적는다** ② **SHA 도달성이 전제** — `dev` 에 머지된 **squash 결과 커밋만** 쓴다(PR 브랜치 head 는 `dev` 의 조상이 아니다 — 두 저장소 PR 전부 squash · measured-facts #62 §4). ~~`dev` force-push 금지가 전제(보호 설정 미측정 · §8 M-10)~~ **`dev` 는 ruleset 으로 force-push·삭제 차단 · bypass 0(M-10 닫힘 · 감사 N1). 남은 전제는 저장소 PUBLIC 유지**((a)·(b) 공통 — 비공개 전환 시 003 §11 재측정 조건) |
| (b) `dev` 에 태그만 (릴리즈 없이) | `…#v0.1.0` 류 | 태그 push → 소비자 한 줄 | **충돌** — *"dev → main 머지 후 태그"* 를 어긴다 → 룰 개정 필요. `v0.1.0` 이면 #88 이 모노레포 이후로 미룬 **첫 릴리즈 태그 이름을 선점**한다. 변형 (b′) 비-semver 네임스페이스(`notify-int-<n>`)는 릴리즈 태그와 구분되지만 **새 태그 종류 신설**이라 여전히 룰 개정 | 소비자 한 줄은 **즉시** · 룰 개정 revert 1건 · 원격 태그 삭제는 lock 이 SHA 로 핀하므로 `npm ci` 를 깨지 않으나 **`npm install` 재해석은 깨진다** | 버전이 읽힌다. 그러나 (a) 대비 얻는 것은 가독성뿐이고 룰 개정 + #88 결정과의 긴장을 산다 |
| (c) 브랜치 참조 `#dev` | `…#dev` | 없음(움직인다) | 무관 | 즉시 | **배제** — `package.json` 이 움직이는 대상을 가리켜 재해석 시 **무검토 갱신**이 들어온다. 재현성이 lock 에만 걸린다 |
| (d) `#semver:^0.1` | — | — | (b) 에 종속 | — | **배제** — `#semver:` 는 태그가 있어야 해석된다(M1 문법 · `#<commit-ish>` 와 `#semver:` 둘뿐) |
| (e) 전용 고정 브랜치(`notify-pin` 등) | `…#notify-pin` | 브랜치 이동 | 룰 밖 브랜치 신설 | 즉시 | **배제** — (c) 와 같은 부동 문제 + 브랜치 관리 비용 |

**권고 (a).** 이유 셋 — ① 재현성은 태그와 같다(lock 은 어느 경우든 SHA · 003 §1-1 2026-09-30 정정) ② 릴리즈 절차·#88 결정을 건드리지 않는 **유일한** 안 ③ 되돌리기가 한 줄이라 첫 릴리즈 때 태그로 옮기는 비용도 한 줄이다.
**하위 구현 세부(결정 요청 아님):** SHA 는 **40자 전체** — ~~짧은 SHA 해석은 미측정 · M-1~~ 짧은 SHA 도 설치되고 lock 은 40자로 핀한다(감사 M-1) → 40자는 필수가 아니라 **가독성·충돌 회피 선택** · 대상은 **E1 시점의 `origin/dev` HEAD**(~~현재 `051ab0e…`~~ 현재 `d9d1535…` · 패키지 내용은 `051ab0e` 와 동일).
**실측 근거 (감사 §2 · 스크래치):** 직접 편집 `…#d9d1535…` → `npm install` 3.60 s · 표기 유지 · lock 엔트리 `{"name":"pleiades","version":"0.1.0","resolved":"git+ssh://…#d9d1535…","integrity":"sha512-…"}` · CJS·ESM import 성공 · **`GIT_SSH_COMMAND=/usr/bin/false npm ci` 성공**(ssh 0 실증) · CLI 설치는 `github:` 로 정규화(직접 편집 요구 재확인). npm 이 매번 `skipping integrity check for git dependency` 경고를 낸다(info — 서버 로그에도 나온다).
**관측 지표:** 이 방식의 갱신은 매번 **pleiades PR + fit PR 2개짜리 왕복**이다 — 003 §2-4 / 002 단계 4 진입 병렬 조건의 **계수 대상**이다. 갱신마다 인계 노트에 센다.

## 2. 호출 6건 전수 — 교체 전후 동작

교체 형태는 **D-1 W2**(§3 — 호출부가 파사드를 직접 쓴다). 모든 호출은 `Route.ALLOWED`(`csvEnv('TELEGRAM_ALLOWED_CHAT_IDS')` — fit 규칙 그대로 · §4-2 Q25 하위 A: fit 은 ADMIN 미매핑)로 가고 `label: 'bot'`(U-5).
본문 분류·상한은 measured-facts **C-2**, 엔티티는 **C-4**.

| # | 파일:줄 | 함수 → 교체 | 본문 (C-2) | 지금 | 교체 후 | 사용자 가시 변경 |
|---|---|---|---|---|---|---|
| 1 | `scheduler.ts:34` | `sendToAll` → `notify(ALLOWED, html(t), {label:'bot'})` | 리포트 · **LLM · 정적 상한 없음** | 4096 초과 시 **4093+`...` 절단**(HTML 을 먼저 잘라 태그 중간이면 파싱 실패 → 폴백 유발 · C-2) · 재시도 · 폴백 | **줄 경계 분할**(Q10-L ①) · 청크마다 재시도·폴백(최악 지연이 **청크 수배**가 된다 — 대상당 청크 × 280 s) · `ENOTFOUND` 재시도(S-4) | **예 — 4096 초과 시만**: 메시지 수 증가 · 말미 복원(승인됨 · Q10-L). 빈도 미측정(C-1 — 로그 없음). 부분 전송 상태(S-5) |
| 2 | `scheduler.ts:59` | 〃 | 에러 문구 정적 6종 · ~60자 | 재시도 · 폴백 | 동일 + `ENOTFOUND` 재시도 | DNS 일시 실패 시 지연 후 성공 가능(S-4)만 |
| 3 | `auto-adjust.ts:395` | `sendToAllWithKeyboard` → `notify(ALLOWED, html(t, keyboard), {label:'bot'})` | 템플릿 · **엔티티 생성**(`escapeHtml`) | **재시도·폴백 없음** · 절단 · 실패 시 `:405-408` throw → `:455` 에러 문구 전송 | 재시도 ×4 · 파싱 실패 → **plain + 키보드 유지** · 분할 시 **키보드는 마지막 청크** · `first.ref` = 마지막 청크 | **예(U-3)**: ① 실패하던 제안이 성공 — ~~최대 40 s/청크 지연~~ **최악 280 s/청크/대상**(fit 봇 `timeoutSeconds: 60` × 4회 + 백오프 40 s · 감사 B3) ② 네트워크 타임아웃 후 실제로는 도달한 경우 **재시도가 중복 제안 메시지**를 만들 수 있다 — 콜백은 `adjustmentId` 매칭 + `decision in [pending, snoozed]` 조건부 갱신이라 ~~**두 번째 클릭은 무동작**~~ **첫 클릭이 Accept·Reject 면 두 번째 클릭은 무동작, Snooze 면 동작한다**(감사 N3 — 새 위험은 아니다) ③ 폴백 시 **엔티티 리터럴**(S-2) |
| 4 | `auto-adjust.ts:455` | `sendToAll` → `notify(…)` | 에러 문구 정적 6종 | #2 와 같다 | 〃 | #2 와 같다 |
| 5 | `auto-adjust-cron.ts:78` | `sendToAllWithKeyboard` → `notify(…)` | 스누즈 재전송 템플릿 · **엔티티 생성** | ~~#3 과 같다(실패 시 `:83-86` throw)~~ **재시도·폴백 없음 · 절단 · 실패 시 `:83-86` throw 는 `runAutoAdjustMaintenance:166-169` 에서 `console.error` 로만 끝난다 — 사용자 문구 없음 · `decision` 이 `snoozed` 로 남아 5분 뒤 tick 이 재전송**(TTL 만료 전까지 · 감사 N2). 타임아웃 후 실제 도달 → 중복은 **오늘도 가능** | #3 과 같다 | **예(U-3 ②)**: 실패 → 다음 tick 재전송이 **tick 안 재시도**로 바뀐다(최악 280 s/청크/대상). ~~5분 주기 tick 안에서 최악 지연 40 s — tick 겹침 여부는 미측정~~ tick 은 `take: 10` 이라 최악 = 10 × 대상 × 청크 × 280 s(대상 1·청크 1 이면 2,800 s). **지금도** 최악 10 × 60 s = 600 s > 300 s 로 tick 겹침은 기존 가능성이고, 1a-3 은 그 창을 **약 4.7배** 넓힌다. 겹친 tick 의 `findMany(snoozed, snoozeUntil<=now)` 가 전송 중인 건을 다시 집으면 **중복 재전송** — 조건부 `updateMany` 는 메시지 중복을 막지 않는다(M-14 · 감사 B3) |
| 6 | `admin-alerts.ts:232` | `sendToAll` → `notify(…)` | 템플릿 ≈200자 + 고정 6~7줄 | 재시도 · 폴백 · `delivered = r.sent > 0` → 예약 해제 로직 | 동일(`sent` 의미 불변) + `ENOTFOUND` 재시도 | #2 와 같다 |

**결과 형태 변화 (호출부 편집 · DB 값 불변).** `SendResult{sent,failed,total}` → `BroadcastResult` 가 같은 세 필드를 갖는다(003 §5-1 *"`SendResult` 형태 유지"*). `first{chatId, messageId:number}` → `first{target, ref:string}` — 두 저장 지점의 `String(first.messageId)` 가 `first.ref` 로 바뀌고 **저장되는 문자열 값은 같다**(`TelegramTransport` 가 `String(message_id)` 를 돌려준다 · 003 §4-2 *"변환 지점 2곳이 사라진다"*). 호출부 자신의 throw 문구 `sendToAll: 모든 채팅 전송 실패 …`(`scheduler.ts:42` · `auto-adjust.ts:408`)는 **그대로 둔다** — 함수 이름이 사라져도 운영 로그 문자열은 보존한다(fit 스펙 `bot-telegram-ipv6-timeout-202606.md:20` 이 그 문자열을 인용).

**로그 문자열 (#48 I2·I3).**

| 지금 (`send.ts`) | 교체 후 (`label: 'bot'`) | 변화 |
|---|---|---|
| `:69` `[bot] 전송 재시도 n/4 (<id>, <ms>ms 후): <sanitized>` | `deliver.ts:84-86` 같은 형식 | **동일** |
| `:87` `[bot] 메시지 전송 실패 (<id>): <sanitized>` | `notifier.ts:81` 같은 형식 | **동일** |
| `:119` `[bot] keyboard 메시지 전송 실패 (<id>): …` | `[bot] 메시지 전송 실패 (<id>): …` | **`keyboard ` 소실**(I3) — 의존 절차 0(§0) |
| (없음 — 키보드 경로 재시도 로그) | `[bot] 전송 재시도 …` | **키보드 경로에 새로 생긴다** |

`sanitizeError` 는 fin 정본(최종 이중 마스킹)이라 출력 문자열은 fit 판과 같다(각 part 가 이미 마스킹됨). **label 을 빠뜨리면 기본값 `[notify]`** 가 찍힌다(`notifier.ts:21`) — 6곳 전부 `label` 을 넘기는지를 테스트가 잡는다(§4).

## 3. 변경 파일 · 순서 · 의존성 추가 절차

### 3-1. 구현 결정 (게이트에서 확인)

| | 질문 | 권고 | 대안 · 차이 |
|---|---|---|---|
| **D-1** | 교체 형태 | **W2 — 호출부가 파사드를 직접 쓴다.** fit 로컬 팩토리 `src/bot/notifications/notifier.ts`(`notifierFor(bot: Bot): Notifier` — `createNotifier({ transport: createTelegramTransport({ api: bot.api }), targets: { ALLOWED: csvEnv('TELEGRAM_ALLOWED_CHAT_IDS') } })`) · `send.ts` 삭제. 003 §5-1 *"`send.ts` 삭제 → 패키지"* · §5-2 되돌리기 *"import 6건 되돌림"* 과 같은 형태이고 1a-4(fin 호출부 → 파사드)와 대칭 | W1 — `send.ts` 를 얇은 어댑터로 남겨 호출부 0 변경. 되돌리기 단위는 작아지나 `first.messageId` 를 `Number(ref)` 로 되돌려야 해 **`MessageRef` 파싱 금지(§4-2)를 어긴다** |
| **D-2** | 봇 주입 | `bot.api` 를 직접 넘긴다 — 호출부가 이미 `bot: Bot` 을 인자로 받는다. §4-3 제약 1(지연 생성)은 **봇 인스턴스를 패키지가 정적으로 참조하지 않는 것**이고 지켜진다. `TelegramApi` ← `bot.api` 대입은 grammy **1.42.0** 에서 `tsc` exit 0(E6b) | 팩토리 `api: () => bot.api` — 차이 없음 |
| **D-3** | fit `src/bot/utils/error.ts` | **이 단계에서 교체하지 않는다**(importer 7파일 · 인바운드 포함 · 003 §5-1 shim 결정은 착수 시 구현 결정). 1a-2 baseline `error.test.ts` 25건도 그대로 | shim(`export * from '@pleiades/notify'`) — ~~`ENOTFOUND`·이중 마스킹이 **인바운드 전체**로 번져 범위가 커진다.~~ **정정 (2회차 · 감사 N4).** `send.ts` 삭제 후 importer 는 운영 6 + 테스트 1이고, **운영 6곳은 전부 `sanitizeError` 만 import** 한다(`isNetworkError`·`isHtmlParseError`·`getErrorCode` 는 운영 소비자 0 — 죽은 export). shim 의 실제 파급은 ① `sanitizeError` 최종 재마스킹(출력 동일) ② **1a-2 baseline `error.test.ts:101`**(`isNetworkError({code:"ENOTFOUND"})` → `false`) 파손. 결정(교체 안 함)은 그대로 — 이득 0 에 baseline 1건을 깬다. 1a-4 또는 모노레포 흡수 때 |
| **D-4** | `scheduler.ts` re-export 블록(주석 `:13-14` · export `:15-20` · import `:21`) | **삭제** — 소비자 0(§0). `SendResult`·`SendKeyboardResult` 타입이 사라지므로 남기면 컴파일이 깨진다 | 패키지 타입으로 re-export 유지 — 소비자가 없으므로 이득 없음 |

### 3-2. 변경 파일 — fit (`repos/myFitness` · 브랜치 `integration/feature-pleiades-1a-3` · base `integration/pleiades`)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `package.json` | `dependencies` 에 **1줄 직접 편집** — `"@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#<SHA40>"`(키 정렬 위치 `@modelcontextprotocol…` 뒤 · `@prisma/client` 앞). **devDeps 가 아니다** — 런타임 코드가 import 한다 |
| 2 | `package-lock.json` | 인자 없는 `npm install` 결과. 예상 `node_modules/@pleiades/notify` 1엔트리 추가(런타임 의존성 0 — README) · 나머지 무변경 — ~~**예상이며 미측정**(M-3)~~ **감사 스크래치 실측 782 → 783 · 추가 1 · 제거 0 · +7줄(M-3 닫힘 · 3회차 R5)** — worktree 결과가 이와 다르면 중단 |
| 3 | `src/bot/notifications/notifier.ts` | **신규** — `notifierFor(bot)`(D-1·D-2) |
| 4 | `src/bot/notifications/send.ts` | **삭제**(124줄) |
| 5 | `src/bot/notifications/scheduler.ts` | re-export 블록 + import 삭제(D-4) · 호출 `:34`·`:59` |
| 6 | `src/bot/notifications/auto-adjust.ts` | import `:20` · 호출 `:395`(키보드)·`:455` · `SendKeyboardResult` 타입 → `BroadcastResult` · `:418-419` `first.ref`/`first.target` |
| 7 | `src/bot/notifications/auto-adjust-cron.ts` | import `:10` · 호출 `:78` · `:97-100` `first.ref`/`first.target` |
| 8 | `src/lib/monitoring/admin-alerts.ts` | import `:10` · 호출 `:232` |
| 9 | `src/bot/notifications/__tests__/send.test.ts` → **`notifier.test.ts`** | baseline 11건 이식 + 신규(§4) — `git mv` 로 이력 연결 |

**변경 파일 9** = 위 표 행 1~9(신규 1 · 삭제 1 · 이동 1 · 수정 6 — 행 1·2·5·6·7·8). fit 하네스(`.claude/`·`CLAUDE.md`)의 `send.ts`·`sendToAll` 언급 **0** → 하네스 변경 0. fit `docs/specs/`(M13 · m2-8 · ipv6) 의 `sendToAll` 서술은 **그 시점 기록이라 고치지 않는다**(1a-2 정정 4 와 같은 규칙).

### 3-3. 의존성 추가 절차 (003 §1-1 2026-09-08 정정 · 1a-3 집행 지시 3항목)

```bash
cd ~/workspace/pleiades/repos/myFitness
SHA=$(git -C ~/workspace/pleiades rev-parse origin/dev)      # E1 시점 · 40자
# ① package.json 직접 편집 — npm install "<spec>" 로 넣지 않는다(github: 로 정규화된다 · M1)
python3 - "$SHA" <<'EOF'
import json, sys, collections
p = json.load(open('package.json'), object_pairs_hook=collections.OrderedDict)
d = p['dependencies']; d['@pleiades/notify'] = f'git+https://github.com/fomalhaut84/pleiades.git#{sys.argv[1]}'
p['dependencies'] = collections.OrderedDict(sorted(d.items()))
open('package.json','w').write(json.dumps(p, indent=2, ensure_ascii=False) + '\n')
EOF
git diff --stat package.json                                  # +1줄 · 다른 변화 0 (정렬로 다른 키가 움직이면 중단)
npm install                                                   # 인자 없이 — 임시 클론 prepare(tsc) 포함
# ② 정규화 확인
node -p "require('./package.json').dependencies['@pleiades/notify']"   # git+https://…#<SHA> 그대로여야 한다 (github: 이면 중단)
# lock 확인
python3 -c "import json;l=json.load(open('package-lock.json'));e=l['packages']['node_modules/@pleiades/notify'];print(len(l['packages']),e.get('version'),e.get('resolved'))"
# ③ npm ci 재현성
rm -rf node_modules && npm ci && ls node_modules/@pleiades/notify/packages/notify/dist/index.js
npx prisma generate                                           # 8절 fit 선행 (2026-09-28 §3 — npm install 이 postinstall 을 돌리지 않을 수 있다)
```

> **주의 (1a-2 감사 정정 1·3 유형 방지).** fit `dependencies` 는 **이미 사전순으로 정렬돼 있다**(이 초안 · `python3 -c "d=list(json.load(open('package.json'))['dependencies']); print(d==sorted(d))"` → `True`) — 정렬 삽입이 다른 키를 움직이지 않는다. 그래도 `git diff --stat` 이 +1줄이 아니면 중단한다.

### 3-4. 순서

| 단계 | 내용 | 통과 조건 |
|---|---|---|
| **E0** | **착수 직전 재감사**(`reversibility-auditor` · ref: fit `02707a3` · pleiades `origin/dev` 실값) → 정정 반영 → **승인 게이트 5항목 + ~~U-1~U-7~~ U-1~U-6 · U-8 → 명시 승인** (재감사 1회차 완료 — 정정 10 → 이 2회차) | 정정 0 · 승인 |
| **E0b** | ~~U-7 에 따라 — (가) … / (나) 면제 명시~~ **고정 (2회차 · 감사 B2): 트리 변화 0 동기화 PR** — pleiades 이슈 신설(이슈-PR 1:1 · 라벨 `fit`) → `git fetch origin && git checkout integration/pleiades && git pull --ff-only` → `integration/chore-pleiades-sync-20260930` → `git merge --no-ff origin/dev`(트리 변화 0 이면 `-s ours` 와 결과 동일 · #489 형태) → 8절 4종 → **9-1 사전 리뷰**(diff 0 · 머지 위생만) → PR(base `integration/pleiades`) → 사용자가 **"Create a merge commit"**(squash 금지) → **9-3 봇 루프**(봇이 안 오면 9-3 봇 불가 표 — 대상 저장소 = 에이전트 필수 경로 · 9-1 결과가 판정) → 머지 후 **`git log -1 --format=%P` 부모 2 확인** → worktree pull. **사용자 승인은 1a-3 게이트(9-2′)에 묶어 한 번에 받는다**(3회차 · r2 R6 · `dual-repo-change:193` — 동기화 PR 에도 승인·검증·9-1·봇 적용) | `rev-list --count origin/integration/pleiades..origin/dev` = **0** · 부모 2 |
| **E1** | pleiades 이슈 신설(라벨 `1a` · `fit`) · `SHA` 확정(§1) · fit 브랜치 `integration/feature-pleiades-1a-3` | — |
| **E2** | §3-3 ①②③ — 직접 편집 · 정규화 확인 · lock 확인 · `npm ci` 재현 · `prisma generate` | 표기 유지 · lock 차이 = 예상 · `dist/index.js` 존재 |
| **E3** | **테스트 먼저(RED)** — `send.test.ts` 를 `git mv` → `notifier.test.ts`, import 를 `../notifier` 로 바꾸고 §4 표대로 단언 조정 + 신규 → `npm run test:run` **실패 확인**(모듈 없음) | RED |
| **E4** | `notifier.ts` 신규 → 호출부 4파일 교체 → `send.ts` 삭제 → `npm run test:run` | GREEN |
| **E5** | 8절 fit 4종: `npm run lint`(warning 0) · `npm run typecheck` · `npm run test`(vitest + verify 5) · `npm run build` — build 후 **M-7·M-8 관측**(웹 번들 · 봇 번들 인라인) | 전부 exit 0 |
| **E6** | (U-6 승인 시) **γ-live** — 로컬에서 검증 토큰(Q46)으로 5000자 HTML + 키보드 1건 발송(§5-2) | 분할 2건 · 키보드는 둘째에만 |
| **E7** | 커밋 `feat(notify): send.ts → @pleiades/notify 교체 · 호출 6건 (pleiades#<issue>)` → 9-1 사전 리뷰(대상 저장소 = 필수) → critical/major 0 → 재검증 | 0/0 |
| **E8** | PR → `integration/pleiades` · `Closes fomalhaut84/pleiades#<issue>`(**수동 종료** #27) · body 에 **SHA ↔ pleiades PR 대응** · 되돌리기 문구 · 봇 루프(9-3·9-4) → **사용자 머지(squash)** → worktree `git pull --ff-only` | 봇 P0/P1 0 |
| **E9** | (U-2 에 따라) **β2-I** — 사용자가 서버에서 §5-3 명령 실행(**셸 `DATABASE_URL` 부재 확인 → 더미 URL 명령줄 env** · 2회차 B1) · 결과를 measured-facts 에 | `DATABASE_URL` 0 · `npm ci`(prepare) · generate · build exit 0 — **어느 단계든 실패하면 중단·보고(우회 금지)** |
| **E10** | 롤백 문서 `_workspace/1a-3/04_operator_rollback.md`(5-1 형식 · 머지 SHA 실값) · pleiades 쪽 반영(§10 · 별도 pleiades 이슈·PR · self-review) · #48 종료(I2·I3 처리 기록) | — |

## 4. 테스트 — 1a-2 baseline 11건의 처리와 회귀 판정

**원칙: baseline 은 지우지 않고 새 모듈로 이식한다.** 같은 fake(`bot.api.sendMessage` spy · `vi.stubEnv` · fake timers)와 같은 입력으로 `notifierFor(fakeBot).notify(Route.ALLOWED, html(…), { label: 'bot' })` 를 부른다. 단언은 **결과 형태만** 옮긴다(`toMatchObject({sent,failed,total})` · `first{target,ref}`). 기본 `sleep` 이 `setTimeout` 이라(`notifier.ts:23`) fake timers 경계 단언(1999/2000 ms)이 그대로 성립한다.

| baseline (`send.test.ts`) | 분류 | 이식 후 단언 |
|---|---|---|
| `:31` env trim·빈 항목 제거 · HTML 전송 | **불변** | 호출 대상 `["1","2","3"]` · `("1","<b>hi</b>",{parse_mode:"HTML"})` |
| `:40` 수신자 0 → 무전송 | **불변** | `{sent:0,failed:0,total:0}` · 호출 0 |
| `:47` 4096 초과 → 4093+`...` | **의도 변경 (Q10-L ①)** | `"a"×5000`(한 줄) → **하드 슬라이스 2청크 4096 + 904** · `...` 없음. 주석에 `Q10-L ① · pleiades 003 §5-2` |
| `:56` 파싱 실패 → plain 즉시 · 타이머 0 | **불변** | 둘째 호출 `["1","bold x",{}]` — **셋째 인자 `{}` 는 payload 동일**(grammy `api.js:140` 펼침 · §0). 타이머 0 |
| `:72` 재시도 2000·8000·30000 · 총 4회 · 경계 1999/2000 | **불변** | 그대로 |
| `:93` 4회 실패 → 집계 후 다음 수신자 · 호출 5 | **불변** | 그대로 |
| `:106` 비네트워크 → 무재시도 | **불변** | 그대로 |
| `:115` 실패 로그 토큰 마스킹 | **불변** | 그대로 **+ prefix `[bot]` 단언 추가**(I2 — label 누락 시 `[notify]` 를 잡는다) |
| `:130` 키보드 첨부 · `first` 첫 성공 | **불변 (형태만)** | `reply_markup: keyboard` · `first: { target: "1", ref: "10" }`(문자열) |
| `:147` 키보드 — 재시도·폴백 없음 | **의도 변경 (§4-1(a) · U-3)** | chat 1 `ETIMEDOUT` → **재시도 4회 후 실패** · 호출 **5** · `first: { target: "2", ref: "7" }`. 주석에 `003 §4-1(a)`. **fake timers 필수**(`vi.useFakeTimers()` + `vi.runAllTimersAsync()`) — real timers 면 백오프 40 s 가 흘러 vitest 기본 5 s timeout(감사 I1 · 프로브 통과) |
| `:163` 전부 실패 → `first` undefined | **불변** | 그대로 |

**분류 합계:** 불변 **9**(형태 조정 포함) · 의도 변경 **2** = baseline 11 (위 표 11행).
**신규 ①~⑤(⑤는 E3 판정 · 건수는 E5 실측 M-9)** (3회차 · r2 R4 — ④는 호출부 4파일이라 1건이 아닐 수 있다) **(9-5 성격 — 새로 생기는 동작을 고정):** ① 키보드 경로 파싱 실패 → plain **+ `reply_markup` 유지** ② 키보드 + 4096 초과 → 키보드는 **마지막 청크에만** · `first.ref` = 마지막 청크 ③ `ENOTFOUND` → 재시도(S-4) ④ 호출부 4파일이 `label: 'bot'` 을 넘긴다 — 모듈 mock 으로 `notify` 의 셋째 인자를 단언(호출부 테스트 · 없으면 `[notify]` 가 조용히 찍힌다) ⑤ `first.ref` 가 `telegramMessageId` 에 그대로 저장된다 — `auto-adjust` 계열은 prisma 를 부르므로 **호출부 단위 테스트 가능 여부는 E3 에서 판정**(불가하면 ⑤는 타입체크 + 사전 리뷰로 갈음하고 그 사실을 PR body 에 적는다).

**회귀 판정 규칙.** ① 불변 9건 중 하나라도 실패 = **회귀** — 교체를 멈추고 원인 보고 ② 의도 변경 2건이 **새 기대값으로** 통과하지 않음 = 교체 미완 ③ fit 기존 vitest(63파일 − 이 파일)·verify 5종 중 하나라도 실패 = 회귀 ④ 전체 건수는 **433 − 11 + (이식 11 + 신규 N)** 이어야 한다 — 실측은 E5(M-9).
**RED 확인:** E3 에서 새 모듈이 없을 때 실패를 한 번 본다(1a-2 E4 와 같은 방식). 교체 **전** 마지막 녹색은 E2 직후 `npm run test:run` 1회(baseline 11 통과)로 기록한다.

## 5. 검증

### 5-1. 8절 fit 행 4종 + γ (로컬 · 필수)

순서: `npm install`(E2 에서 이미) → **`npx prisma generate`** → `npm run lint` → `npm run typecheck` → `npm run test` → `npm run build`(로컬 postgres 5432 가동 전제 — 1a-2 U4 는 *"로그상 DB 요구 없음, 단 LISTEN 중이라 배제 불가"*).
추가 관측(E5): `grep -c "createNotifier" dist/bot/standalone.cjs`(봇 번들 인라인 · M-8) · `next build` 가 `@pleiades/notify` 를 해석했는가(빌드 성공 = 해석 · M-7).

### 5-2. γ-live (선택 · 사용자 결정 U-6)

로컬에서 **Q46 검증 봇 토큰 + 사용자 검증 채팅 id** 를 셸 env 로만 주고(파일에 쓰지 않는다) `npx tsx` 1회 — 5000자 HTML + `InlineKeyboard` 1건. 관측: 분할 2건 · 키보드는 둘째에만 · `first.ref` = 둘째 메시지 id.
**되돌리기: 이미 나간 메시지는 불가**(검증 채팅 한정 — 실사용자 무접촉). 서버 무접촉.
**전제 미확인:** Q46 토큰이 실제로 발급됐는지(M-13). 없으면 E6 을 건너뛰고 β2-R 과 함께 미룬다.

### 5-3. β2 (서버 · Q44) — 이 단계에서 소비하나 · **사용자 결정 U-2**

003 §10-1 은 *"β2 의 서버 승인 게이트는 1a-3 과 함께 소비"*, 2026-09-30 Q45 정정 ④는 *"`prepare` 가 서버에서 실제로 도는지는 1a-3 의 첫 `npm ci` 가 곧 측정"* 이라 적었다.
그런데 `integration/pleiades` 는 배포되지 않으므로(fit `deploy.yml` = `release.published` 만) **β2 를 하지 않으면 그 "첫 `npm ci`" 는 모노레포 흡수 때까지 오지 않는다.** 그리고 S-1 때문에 **조건 5 를 지키는 β2 는 fit 발송을 관측하지 못한다.** 그래서 쪼갠다.

| | 무엇을 하나 | 무엇을 증명하나 | 서버 행위 (사용자 실행) | 되돌리기 |
|---|---|---|---|---|
| β2-0 | 소비 안 함 (γ 만) | 없음 — Q45 ④ 미해소 유지 | 없음 | — |
| **β2-I (권고)** | 서버 **별도 디렉터리**에 fit `integration/pleiades` 클론 → `npm ci` → `npx prisma generate` → `npm run build`. **프로세스 기동 없음 · `.env` 없음 · ~~DB 없음~~ 셸 `DATABASE_URL` 부재 확인 + 도달 불가 더미 URL(명령줄 env 한정) · 2회차 B1** | ~~① 서버 node 24 / npm 11 에서 git dep `prepare` 성공 ② lock 재현 ③ `.env` 없이 빌드~~ **정정 (2회차 · 감사 N6) — "node 24 에서 `prepare` 가 도는가" 는 pleiades CI `verify (24.x)` 가 이미 대리 검증한다.** β2-I 의 고유 가치는 **서버 자체**다: ① 서버의 레지스트리·github 경로로 임시 클론 + `prepare` 가 끝나는가(Q45 ④ 의 서버 부분) ② 로컬 npm 10 이 만든 lock 이 서버 npm 11 `npm ci` 로 재현 ③ 서버 자원에서 fit `next build`(더미 URL) 가 끝나는가 | 아래 명령 | **즉시** — `rm -rf` 1회. 실서비스 무접촉(단 **같은 서버의 CPU·메모리를 빌드 동안 쓴다** — 여유 미측정 M-6) |
| β2-R | β2-I + 병행 봇 기동(검증 토큰) + 빈 스키마 `myfitness_int` + 트리거 | 교체된 경로의 **실 텔레그램 발송**(키보드·분할·폴백) | §10-1 10조건 전부 + 조건 5 예외 | **중간** — `pm2 delete` · `DROP DATABASE` · env 정리 / **이미 나간 메시지는 불가**(검증 채팅 한정) |

**β2-I 명령 (사용자가 서버에서 · 디렉터리 이름은 사용자가 정한다 — `/home/nasty68/myFitness` 가 아닌 곳):**

~~1회차 명령~~ — **정정 (2회차 · 감사 B1).** 1회차 명령은 `.env` 없이 `npx prisma generate` 를 불러 서버에서 `PrismaConfigEnvError: Missing required environment variable: DATABASE_URL`(fit `prisma.config.ts` = `import "dotenv/config"` + `env("DATABASE_URL")`)로 멈춘다(스크래치 `env -u DATABASE_URL` 재현 · 더미 URL 이면 exit 0). 그리고 **서버 셸에 `DATABASE_URL` 이 export 돼 있으면** generate 가 통과하고 `next build` 가 실 DB 를 가리킨 채 돈다 — 1회차 조건 #2 *"해당 없음"* 은 이 경로를 배제하지 못했다. 교체본:

~~2회차 교체본의 `.env` 확인 줄 `ls -a | grep -c '^\.env'` · `| tee` 줄의 exit 판정~~ — **정정 (3회차 · 감사 r2 R1·R3).** 그 줄은 fit 이 tracked 로 둔 `.env.example` 에 매치해 **항상 1 → 거짓 중단**했고(B1 이 막으려던 즉흥 판단 유형), `| tee` 는 pipefail 없이 tee 의 exit 를 돌려준다. 3회차 명령:

```bash
set -o pipefail                                               # tee 뒤에서도 앞 명령의 실패가 exit 로 드러난다 (bash·zsh 공통)
env | grep -c DATABASE_URL; echo "exit $?"                    # 출력 0 이어야 한다 — 1 이상이면 중단·보고 (셸에 실 DB URL 이 있다)
free -m; echo "exit $?"                                       # 빌드 전 메모리 여유 (M-6) — 낮으면 중단
mkdir -p ~/pleiades-int && cd ~/pleiades-int; echo "exit $?"
git clone --branch integration/pleiades --single-branch https://github.com/fomalhaut84/myFitness.git myFitness-1a3; echo "exit $?"
cd myFitness-1a3 && git log -1 --format=%H; echo "exit $?"   # = 1a-3 머지 SHA 인지 확인
ls -a | grep -cE '^\.env(\.local|\.production|\.production\.local)?$'; echo "exit $?"   # 출력 0 이어야 한다 (.env.example 은 tracked 라 세지 않는다)
npm ci --foreground-scripts 2>&1 | tee ~/pleiades-int/1a3-npm-ci.log; echo "exit $?"      # prepare 로그(> tsc -p packages/notify) 포함 · exit 0 아니면 중단·보고
ls node_modules/@pleiades/notify/packages/notify/dist/index.js; echo "exit $?"
DUMMY_DB='postgresql://none:none@127.0.0.1:1/none'            # 도달 불가 (포트 1) — export 하지 않는다
DATABASE_URL="$DUMMY_DB" npx prisma generate; echo "exit $?"  # exit 0 아니면 중단·보고 (우회 금지 — 다른 URL 을 넣지 않는다)
DATABASE_URL="$DUMMY_DB" npm run build 2>&1 | tee ~/pleiades-int/1a3-build.log; echo "exit $?"   # exit 0 아니면 중단·보고 (우회 금지)
# 되돌리기: rm -rf ~/pleiades-int
```

> `grep -c` 는 매치 0 이면 exit 1 을 낸다 — `env | grep -c DATABASE_URL`·`.env` 확인 두 줄은 **출력(개수) 0 · exit 1 이 통과**다. 판정은 출력으로 한다.

~~**미확인 (M-15):**~~ **로컬 닫힘 (3회차 · 감사 r2 §2):** 이 교체본 순서(`.env` 줄 제외)를 스크래치 `git archive integration/pleiades` + notify 추가 사본에서 돌려 `npm ci` exit 0(680 packages · 8 s) · 더미 URL `prisma generate` exit 0 · **더미 URL `npm run build` exit 0 · 12.7 s · DB 오류·`ECONNREFUSED` 0** — fit `next build` 는 DB 를 요구하지 않는다(1a-2 U4 의 "LISTEN 중이라 배제 불가" 도 해소). **서버 성공 여부(자원 · npm 11)는 E9 에 남는다.** 1회차~2회차 서술: 더미 URL 로 `next build` 가 끝나는지. 로컬 1a-2 U4 는 *"로그상 DB 요구 없음"* 이었으나 postgres 가 LISTEN 중이라 배제하지 못했다 — 더미 URL(연결 거부)에서 빌드가 실패하면 **그것이 곧 측정 결과**(fit `next build` 가 DB 를 요구한다)이고 중단·보고한다. 실 DB 로 바꿔 재시도하지 않는다.

**β2 조건 매핑 (§10-1 10조건 정본 기준)**

| # | 조건 | β2-I | β2-R |
|---|---|---|---|
| 1 | 텔레그램 격리 | 해당 없음(발송 0) | **필수** — Q46 토큰 + `TELEGRAM_ALLOWED_CHAT_IDS` = 검증 채팅만 |
| 2 | DB 격리 | ~~해당 없음(`.env` 없음 → 접속 대상 없음)~~ **필수 — 셸 `DATABASE_URL` 부재 확인(`env \| grep -c` = 0) + generate·build 에만 도달 불가 더미 URL**(2회차 B1) | **필수** — `myfitness_int` 빈 스키마 |
| 3 | 별도 포트 | 해당 없음 | 웹을 띄울 때만 |
| 4 | pm2 이름 + cwd | 해당 없음(pm2 미사용) | **필수** — `myfitness-int-bot` · `--cwd`(동작 미검증 · 원문 그대로) |
| 5 | 봇 미기동 | **충족** | **위반 — 예외가 필요하다.** 근거(409)는 *같은 토큰의 동시 long polling* 이라 검증 토큰이면 소멸하는 것으로 **판단**(미검증 · `ecosystem.config.js` 주석의 409 서술) |
| 6 | cron off | 충족(프로세스 0) | **"끄기" 는 없다** — 봇 스케줄 5개는 env 로 **재지정만** 가능(§0). 트리거용으로 1개만 가까운 시각, 나머지는 먼 시각 — 도달 불가능한 식이 node-cron 에서 허용되는지 미측정 |
| 7 | Nginx 미연결 | 해당 없음 | 웹을 띄우지 않으면 해당 없음 |
| 8 | env | ~~없음~~ **`.env` 파일 없음 · 셸 `DATABASE_URL` 부재 확인 · 명령줄 env 는 더미 `DATABASE_URL` 1개뿐(export 금지)**(2회차 B1) | fit 8키(a) + `CLAUDE_BIN`(b) — `GARMIN_*` 실값 금지(β2 → β1) |
| 9 | MCP 포트·로그 | 해당 없음 | 리포트 **본문**을 보려면 필수. 에러 문구 경로(#2·#4)만 보면 불필요 |
| 10 | 선행 빌드 | **필수** — `prisma generate` → `build` | 필수 |

**권고: β2-I 를 1a-3 에서 소비하고 β2-R 은 미룬다.** ~~β2-I 는 서버 쪽 유일한 미확인(Q45 ④)을 되돌리기 즉시로 닫는다.~~ β2-I 는 Q45 ④ 중 **CI 가 대리하지 못하는 서버 부분**(서버 네트워크 경로 · 서버 npm 11 의 lock 재현 · 서버 자원에서의 fit 빌드)을 되돌리기 즉시로 닫는다(2회차 N6). 대가는 서버에서 사용자가 위 명령 한 묶음을 돌리는 것 · 빌드 동안의 자원 공유다. β2-R 이 새로 증명하는 것(실 API 와의 결합)은 003 §10-1 이 *"어떤 인스턴스 검증도 '한 번 맞았다' 이상을 주지 못한다"* 고 적은 잔여이고, **γ-live(U-6)가 서버 없이 같은 것을 한 번 보여준다.** β2-R 은 1a-4(fin — 웹 경로 발송 셋이 있어 조건 5 를 지키고도 관측 가능)와 묶어 다시 판단한다.

## 6. 되돌리기 — ~~**중간** (003 §5-2 · 시점 한정)~~ **즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간** (2회차 · 감사 N5 · **사용자 확인 U-8**)

| 시점 | 행위 | 등급 |
|---|---|---|
| **머지 전** | `gh pr close -R fomalhaut84/myFitness <pr> --delete-branch` · worktree `git checkout integration/pleiades && git branch -D integration/feature-pleiades-1a-3` · **`npm ci`**(`@pleiades/notify` 제거) · `npx prisma generate` · 8절 4종 | **즉시** |
| **머지 후** | `integration/chore-pleiades-revert-1a-3` 브랜치 → `git revert <squash SHA>` → push → `gh pr create --base integration/pleiades` → **사용자 머지** → ~~`git pull --ff-only`~~ **`git checkout integration/pleiades && git pull --ff-only` · 로컬 revert 브랜치 삭제**(3회차 · r2 R7-1) → `npm ci` → `npx prisma generate` → 8절 4종. `send.ts`(124줄)·`send.test.ts` 가 revert 로 복원된다(`git mv` 이력) | ~~**중간**~~ **즉시 (미배포 · β2-R 미실행 동안)** — 1a-2 머지 후 행위와 같다(1a-2 = 즉시 · 003:1063 · `_workspace/1a-2/04_operator_rollback.md:6`). **배포 경로에 들어가거나 β2-R 병행 인스턴스가 이 코드로 돌기 시작하면 `npm ci` + 재빌드 + `pm2 restart` 가 붙어 중간** |
| **E0b 동기화 PR** (3회차 · r2 R7-2) | **되돌리지 않는다** — 트리 변화 0 · `dev` 를 조상으로 들이는 것이 목적이고, 되돌리면 다음 동기화가 같은 커밋을 다시 요구한다 | — |
| **사전 사본** (3회차 · r2 R7-3) | 해당 없음 — `notifier.ts`·`notifier.test.ts` 는 tracked · revert 가 이력을 보존한다 | — |
| **β2-I 를 했으면** | 서버 `rm -rf ~/pleiades-int`(사용자) | 즉시 |
| **β2-R 을 했으면** | `pm2 delete myfitness-int-bot` · `DROP DATABASE myfitness_int` · 검증 env 정리(사용자) / **이미 나간 메시지 불가** | 중간 |
| **원본 도달분** | **없음**(#80 — 원본에 쓰지 않는다) | — |
| ~~**pleiades 쪽**~~ | ~~없음 — … 003 전반의 *"즉시 (1a-3 착수 전까지 · 이후 중간)"* 가 전부 *"중간"* 쪽으로 넘어간다(§10)~~ | — |
| **pleiades 코드 revert** (2회차 · N5 분리) | 1a-3 은 pleiades 코드를 바꾸지 않는다. 이후 pleiades `dev` 의 패키지 커밋을 revert 해도 **fit 은 SHA 로 핀돼 있어 영향 0** — pleiades revert 는 PR 1개로 **즉시** | 즉시 |
| **fit 이 받은 패키지 동작 되돌림** (2회차 · N5 분리) | fit 이 관측하는 동작을 되돌리려면 **fit PR(SHA 한 줄 갱신 + `npm install`)** 이 필요하다 — pleiades 쪽 revert 만으로는 fit 이 바뀌지 않는다 | 즉시 (미배포 동안) |

> **정정 (2회차 · 감사 N5) — 1회차 "등급 판단" 문단(아래 원문)의 근거 둘이 성립하지 않는다.** ① M-10 은 닫혔다(ruleset 이 `dev` force-push·삭제 차단 · bypass 0). ② *"이후 pleiades 패키지 변경과의 결합"* 은 SHA 핀이라 **되돌리는 행위와 무관**하다(pleiades 가 움직여도 fit lock 은 그대로). 남는 머지 후 행위는 revert PR + `npm ci` + `prisma generate` + 8절 — 서버·pm2 0 — 으로 1a-2 와 같다. 그래서 **시점 한정 즉시**로 개정하고, 003 §5-2 의 1a-3 행 **중간** 과 다르므로 **사용자 확인 항목(U-8)** 으로 올린다. 003:1062 *"삭제가 양쪽 `npm ci` 를 깬다"* 는 SHA 핀에서 불성립(이력 재작성·비공개 전환 때만 참) — §10.

~~**등급 판단.**~~ (1회차 원문 — 위 정정으로 대체) **등급 판단.** 003 §5-2 는 *"`send.ts` 복원 + import 6건 되돌림 + `package.json`/lockfile revert + `npm ci` + 재빌드 + `pm2 restart`(서버 1대 × {web, bot})"* 로 **중간**을 매겼다. 그 뒤 Q42 로 *pm2 restart* 는 **병행 인스턴스만** 가리키게 됐다(§10-1). 이 계획에서 **β2-R 을 하지 않으면 서버 행위는 `rm -rf` 1회**이고 나머지는 worktree 안의 revert PR + `npm ci` 다.
~~**이 초안은 등급을 내리지 않는다** — ① SHA 고정의 도달성 전제(dev force-push 금지 · 미측정 M-10) ② 이후 pleiades 패키지 변경이 fit 을 깨지 않게 조율해야 하는 **결합이 새로 생긴다**는 점이 남는다. 하향 여부는 감사 판정 사항.~~ → 위 정정 블록(2회차: 시점 한정 즉시 · U-8).
**불가한 것:** γ-live·β2-R 로 이미 나간 메시지(검증 채팅) · 이미 찍힌 로그. **DB 무변경**(`telegramMessageId` 값 형식 동일 · 스키마 무변경).
**소요:** 이 저장소에 실작업 시간 기록이 없어 **등급으로 갈음한다**(R2).
**롤백 문서는 머지 후 `_workspace/1a-3/04_operator_rollback.md` 에 `dual-repo-change` 5-1 형식으로 쓴다** — 상태 판정 표(PR 1행 · β2 행) · 세 시점 · SHA 실값.

## 7. 서비스 영향 — 없음 (β2 선택분 제외)

실서비스 pm2 6개(`myfitness`·`myfitness-bot`·`myfitness-mcp` 포함) **무접촉** · 재시작 없음 · 세션 초기화 불필요. `integration/pleiades` 는 배포되지 않는다(`deploy.yml` = `release.published`·`workflow_dispatch(tag)`) · CI(`ci.yml`)·`security-audit.yml` 은 `dev`/`main` 만(1a-2 실측 §6).
**β2-I 는 같은 서버에서 `npm ci` + `next build` 를 돌린다** — 실서비스 프로세스를 건드리지 않으나 빌드 동안 자원을 나눠 쓴다(여유 미측정 · M-6 을 먼저 본다).

## 8. 미측정 · 미확인 (추정하지 않는다 — 명령 제시)

| | 무엇 | 언제 | 명령 · 방법 | 실패 시 |
|---|---|---|---|---|
| ~~**M-1**~~ | **닫힘 (감사 §2).** `…#d9d1535…` 직접 편집 → `npm install` 3.60 s · CJS·ESM import 성공 · `GIT_SSH_COMMAND=/usr/bin/false npm ci` 1.69 s 성공 · 짧은 SHA 도 설치(lock 은 40자 핀) — 1회차 서술: GitHub **https + 40자 SHA** 로 설치되는가(실측은 `git+file://…#<sha>` 뿐 · 1a-1 E6) · 짧은 SHA 해석 | E0 감사(스크래치) | 스크래치에서 `npm init -y` → `npm pkg set 'dependencies.@pleiades/notify'='git+https://github.com/fomalhaut84/pleiades.git#<SHA40>'` → `npm install --loglevel verbose` → `node -e "require('@pleiades/notify').createNotifier"` | Q48 (a) 재검토 |
| ~~**M-2**~~ | **닫힘 (감사 §2).** 표기 유지. CLI 설치(`npm install "@pleiades/notify@git+https://…"`)는 `github:` 로 정규화 — 직접 편집 요구 재확인 — 1회차 서술: 직접 편집 + 인자 없는 `npm install` 뒤 **SHA 표기가 유지되는가**(1a-0 은 태그로만 확인) | E0 감사(스크래치) · E2 | 위 스크래치에서 `npm pkg get dependencies` | `github:` 로 바뀌면 §1-1 대안(정규화 수용) 을 사용자에게 |
| ~~**M-3**~~ | **닫힘 (감사 §2).** fit 사본 → lock **782 → 783**(추가 `node_modules/@pleiades/notify` 1 · 제거 0 · 루트 deps +1 · +7줄) · 엔트리 `name:"pleiades"`·`version:"0.1.0"`·`resolved:"git+ssh://…#<sha>"`·`integrity` 기록. `npm ci` 는 `prisma generate` 를 돌리지 않는다(별도 단계 유지). 로컬 EBADENGINE 대상은 `entities@8.0.0` — 1회차 서술: fit lock 증가분(예상 +1) · lock 엔트리의 `name`·`version`·`resolved` 필드 · 인자 없는 `npm install` 이 dev 동기화 후 lock(782)의 다른 엔트리를 건드리는가 | E0 감사(스크래치 사본) · E2 | fit `package.json`·`package-lock.json` 사본에 §3-3 ① → `npm install --package-lock-only --ignore-scripts` → 엔트리 수·diff | 다르면 중단 |
| **M-4** | **부분 (감사 §2).** fit 전체 트리 사본 `npm ci` 680 packages · **8.8 s(1회 · 참고치 — worktree 실측 아님)**. worktree 3회 측정은 E2 에 남는다 — 1회차 서술: fit 실트리에서 git dep 포함 `npm ci` 소요(1a-1 E6 은 빈 소비자 기준 1.91 s) | E2 | `time npm ci` ×3 | 관측만 |
| **M-5** | 서버 `prepare` 성공 (Q45 ④) | E9 (β2-I) | §5-3 명령 | 중단 · 보고 — **배포 경로의 실패 모드**이므로 1a-4 전 해결 대상 |
| **M-6** | 서버 메모리 여유 · ~~`.env` 없는 서버 `npm run build`~~ → M-15 로 이동(2회차 B1) | E9 | `free -m` · §5-3 | 여유 부족 시 저부하 시각 재시도 |
| ~~**M-15**~~ | **로컬 닫힘 (3회차 · 감사 r2 §2)** — 더미 URL `prisma generate` exit 0 · `npm run build` exit 0 · 12.7 s · DB 오류 0. **서버분(자원 · npm 11)은 E9** — 2회차 서술: 셸 `DATABASE_URL` 부재 · 도달 불가 더미 URL 로 `prisma generate`·`next build` 가 끝나는가 | E9 (서버분) | §5-3 3회차 명령 | **어느 단계든 실패 → 중단·보고(우회 금지 — 실 DB URL 을 넣지 않는다)** |
| ~~**M-7**~~ | **로컬 닫힘 (3회차 · 감사 r2 §2)** — 스크래치에서 `admin-alerts.ts` 에 `import { createNotifier } from "@pleiades/notify"` 프로브 → `rm -rf .next dist && npx next build` exit 0 · `createNotifier` 가 `.next/server/chunks/[root-of-the-server]__….js` 에 번들 → **`transpilePackages` 없이 CJS `dist` 번들 확인**. 실트리 확인은 E5 빌드가 겸한다 — 2회차 서술: 좁힘(정적 장애 요인 0 · Turbopack 실빌드만 판정) | E5 | `npm run build` | 실트리에서 실패하면 중단·보고 |
| ~~**M-8**~~ | **닫힘 (감사 §2).** `build:bot` 과 같은 `--external` 프로브 번들 → `grep -c createNotifier` = 6 · `require("@pleiades/notify")` 0(인라인). 5000자 + 키보드 실행 → 4096 `{parse_mode}` → 904 `{parse_mode, reply_markup}` — **키보드는 마지막 청크 · `first.ref` = 마지막 청크**. MCP 번들은 admin-alerts 미도달 — 1회차 서술: 봇 esbuild 번들에 패키지가 인라인되는가(`--external` 목록 밖) | E5 | `grep -c createNotifier dist/bot/standalone.cjs` | external 이면 런타임에 `node_modules` 필요 — 배포 영향 없음(npm ci 가 설치) · 기록만 |
| **M-9** | 교체 후 fit vitest 건수 | E5 | `npm run test:run` 요약 | §4 규칙 ④ 대조 |
| ~~**M-10**~~ | **닫힘 · 명령 정정 (감사 N1).** ~~`gh api …/branches/dev/protection` (404 = 보호 없음)~~ 은 ruleset 을 못 봐 **거짓 음성**. `gh api repos/fomalhaut84/pleiades/rules/branches/dev` → `deletion` · `non_fast_forward` · `pull_request` · `required_status_checks[verify (20.x), verify (24.x)]`(ruleset 24220405 · active) · `rulesets/24220405` → `bypass_actors []` · `current_user_can_bypass "never"`. SHA 도달성의 남은 전제 = PUBLIC 유지 — 1회차 서술: pleiades `dev` force-push 보호 여부 (SHA 도달성 전제) | E0 | ~~`gh api repos/fomalhaut84/pleiades/branches/dev/protection` (404 = 보호 없음)~~ **`gh api repos/fomalhaut84/pleiades/rules/branches/dev`**(3회차 R5) | ~~보호 없으면 "dev force-push 금지" 를 룰로 명시하는 후속~~ **해당 없음 — 보호 있음(닫힘)** |
| **M-11** | 4096 초과 · 폴백 발생 빈도 | — | **측정 경로 없음**(C-1 — 로그 없음). Q14(DB 길이 집계) 가 열릴 때만 | 이 단계의 판단에 쓰지 않는다 |
| **M-12** | 리터럴 `<>` 가 폴백 입력에 실제로 나타나는가(fin `+` vs fit `*` 수량자 차이 · C-3) | — | 측정 경로 없음(C-1) | 〃 |
| **M-13** | Q46 검증 토큰이 **실제로 발급됐는가** | E0 게이트 | 사용자 확인 | 없으면 U-6·β2-R 불가 |
| **M-14** | ~~`AUTO_ADJUST_MAINTENANCE_CRON` 5분 tick … 교체 후 스누즈 1건의 최악 지연은 대상 × 청크 × 40 s 로 늘어난다 — 5분 초과 가능성은 **미측정**(스누즈 건수 분포 모름)~~ **정정 (2회차 · 감사 B3).** 정적 사실: `scheduler.ts:108-117` `cron.schedule` 옵션 `{ timezone }` 뿐(`noOverlap` 0) · 콜백이 `runAutoAdjustMaintenance(bot)` 를 await 하지 않는다 · 한 tick 이 `take: 10`(`auto-adjust-cron.ts:161`)건을 순차 처리 · fit 봇 `timeoutSeconds: 60`(`bot/index.ts:30,39`). **지금:** 1건 최악 60 s(재시도 없음) → tick 최악 **600 s > 300 s** — 겹침은 **기존 가능성**. **교체 후:** 1건 최악 **280 s/청크/대상**(4 × 60 + 백오프 40 — grammy 타임아웃이 `GRAMMY_TIMEOUT_RE` 로 재시도 대상) → tick 최악 10 × 대상 × 청크 × 280 s(대상 1·청크 1 이면 **2,800 s** · 기존 대비 **약 4.7배**). 겹친 tick 의 `findMany(snoozed, snoozeUntil<=now)` 가 전송 중인 건을 다시 집으면 **중복 재전송** — 조건부 `updateMany` 는 메시지 중복을 막지 않는다. 실제 발생 빈도(스누즈 건수 · 타임아웃 빈도)는 미측정 | E0 게이트(U-3 ②) · E7 사전 리뷰 focus | 사용자가 이 수치를 보고 U-3 ② 에 답한다 · 사전 리뷰에 명시 | U-3 ② 에서 가드를 요구하면(예: tick 재진입 방지 플래그) **범위 변경 → 재승인** · 리뷰 major 도 같다 |

## 9. 사용자 결정 · 승인 게이트

### 9-1. 사용자 결정 항목 — 1회차 (**2회차 최종본은 9-1′** · 이 표는 이력)

| | 질문 | 권고 | 무엇을 가르는가 | 우선 |
|---|---|---|---|---|
| **U-1 (Q48)** | 참조 방식 | **(a) 40자 SHA** | 릴리즈 룰 개정 필요 여부 · #88 결정과의 긴장 · 갱신 절차(§1) | **높음 — E0** |
| **U-2** | β2 를 1a-3 에서 소비하나 | **β2-I 만** | Q45 ④(서버 `prepare`) 가 닫히는지 · 서버 작업 범위 · 되돌리기(즉시 vs 중간)(§5-3) | 높음 — E0 |
| **U-3** | 1a-3 이 fit 에 들여오는 **관측 변경 묶음** 승인 — ① 키보드 경로 재시도 ×4 · plain 폴백 · 분할(중복 제안 가능 · 두 번째 클릭 무동작) ② `ENOTFOUND` 재시도(6 호출 전부) ③ 부분 전송 상태(S-5) ④ 키보드 폴백 시 엔티티 리터럴(S-2) | **승인** — ①은 003 §4-1(a)·§5-3 이 적은 1a-3 의 목적이고 ②~④는 그 부산물. Q10-L(분할)은 이미 승인 | 거부하면 키보드 경로는 `send.ts` 를 남기는 W1 변형이 되고 §4-1(a) 가 해소되지 않는다. **003 은 이것을 확인 대상으로 분류하지 않았다(S-3) — 같은 성격의 fin 항목은 Q27** | 높음 — E0 |
| **U-4** | (결정 아님 · 확인) D-1~D-4 구현 결정 | W2 · `bot.api` 직접 · fit `error.ts` 유지 · re-export 삭제 | 되돌리기 단위(9파일)와 호출부 편집 수 | E0 |
| **U-5** | 로그 label (#48 I2·I3) | **`'bot'` 6곳 전부** — `[bot]` 형식 보존 · `keyboard ` 한 단어 소실 수용 | 운영 grep 호환. 대안: 호출부별 label(`bot-cron`·`auto-adjust`·`auto-adjust-cron`·`admin-alert`) — 로그가 풍부해지나 `[bot]` grep 이 깨진다(의존 절차는 0 · §0) · **이미 찍힌 로그는 되돌릴 수 없다** | 중간 — E0 |
| **U-6** | γ-live(로컬 · 검증 토큰 · 1건) | **한다** — 토큰이 있으면(M-13) | 서버 없이 실 API 결합을 한 번 본다 · 되돌리기 "이미 나간 메시지 불가"(검증 채팅) | 중간 |
| ~~**U-7**~~ | ~~behind dev 1(S-6)~~ **취소 (2회차 · 감사 B2) — 결정 항목 아님 · E0b 동기화 PR 고정** | **(가) 트리 변화 0 동기화 PR** — 체크리스트 `= 0` 을 문자 그대로 만족 · 되돌리기 즉시 | (나) 면제 명시 — PR 1개 절약 · 체크리스트와 규정의 긴장을 기록으로 남긴다 | 낮음 |

### 9-2. 승인 게이트 5항목 — 1회차 초안 (**2회차 본은 9-2′** · 이 블록은 이력 — β2-I 명령·등급이 틀렸다)

```markdown
## 집행 계획 — 1a-3 (myFitness send.ts → @pleiades/notify)

### 건드릴 파일
| 저장소 | 파일 | 변경 |
|---|---|---|
| myFitness (worktree) | package.json | dependencies +1줄 `@pleiades/notify` = git+https://…pleiades.git#<SHA40> (직접 편집) |
| myFitness | package-lock.json | npm install 결과 (예상 +1 엔트리 · M-3) |
| myFitness | src/bot/notifications/notifier.ts | 신규 — notifierFor(bot) |
| myFitness | src/bot/notifications/send.ts | 삭제 (124줄) |
| myFitness | src/bot/notifications/scheduler.ts · auto-adjust.ts · auto-adjust-cron.ts · src/lib/monitoring/admin-alerts.ts | 호출 6건 · import 4 · first.ref/target 2곳 · re-export 삭제 |
| myFitness | src/bot/notifications/__tests__/send.test.ts → notifier.test.ts | baseline 11 이식(불변 9 · 의도 변경 2) + 신규 |
| (서버 · U-2 승인 시 · 사용자 실행) | ~/pleiades-int/ (별도 디렉터리) | 클론 → npm ci → prisma generate → build. 프로세스 기동 없음 |

### 반영에 필요한 것
- 빌드: worktree 로컬 `npm run build`(검증) · 서버 β2-I 빌드(사용자)
- 재시작: **없음** — 실서비스 pm2 6개 무접촉 · integration/pleiades 미배포
- 세션 초기화: 불필요

### 롤백 — 머지 전 · 머지 후 · 원본 도달분
```bash
# 머지 전
gh pr close -R fomalhaut84/myFitness <pr> --delete-branch
git -C repos/myFitness checkout integration/pleiades && git -C repos/myFitness branch -D integration/feature-pleiades-1a-3
(cd repos/myFitness && npm ci && npx prisma generate)
# 머지 후
git -C repos/myFitness checkout integration/pleiades && git -C repos/myFitness pull --ff-only
git -C repos/myFitness checkout -b integration/chore-pleiades-revert-1a-3
git -C repos/myFitness revert <squash SHA>
git -C repos/myFitness push -u origin integration/chore-pleiades-revert-1a-3
gh pr create -R fomalhaut84/myFitness --base integration/pleiades --head integration/chore-pleiades-revert-1a-3 --title "revert: 1a-3 (pleiades#<issue>)" --body "…"
# → 사용자 머지 → pull --ff-only → npm ci → npx prisma generate → 8절 4종
# β2-I: 서버 rm -rf ~/pleiades-int (사용자)
# 원본 도달분: 없음 (#80)
```
등급: **중간** (머지 전 즉시) · 불가: γ-live 로 이미 나간 검증 메시지 · 소요는 등급으로 갈음(R2)

### 서비스 중단 가능성
없음. 단 β2-I 빌드가 같은 서버 자원을 쓴다(free -m 선확인 · M-6)
```

### 9-1′. 사용자 결정 항목 — 최종 (2회차 작성 · 3회차 갱신)

| | 질문 | 권고 | 되돌리기 (등급 · 행위) | 무엇을 가르는가 | 우선 |
|---|---|---|---|---|---|
| **U-1 (Q48)** | 소비자가 패키지를 무엇으로 참조하나 | **(a) 40자 SHA 고정** — 설치·표기 유지·lock 핀·`npm ci` 재현·ssh 0 실측(감사 §2) · `dev` ruleset 이 force-push·삭제 차단 | **즉시** — `package.json` 한 줄 + `npm install`(나중에 태그로 옮기는 것도 같은 행위) | 릴리즈 룰 개정 필요 여부((b) 는 필요) · #88 첫 릴리즈 태그 선점 여부 · 갱신 절차. 남은 전제 = **PUBLIC 유지** | **높음 — E0** |
| **U-2** | β2 를 1a-3 에서 어디까지 소비하나 | **β2-I 만** — 서버 별도 디렉터리에서 클론·`npm ci`·generate·build(**셸 `DATABASE_URL` 0 확인 · 도달 불가 더미 URL 명령줄 한정** · 실패 시 중단·보고) · 프로세스 기동 없음 | β2-I **즉시**(`rm -rf ~/pleiades-int`) · β2-R **중간**(`pm2 delete` · `DROP DATABASE` · env 정리) / 이미 나간 검증 메시지 불가 | Q45 ④ 중 **CI 가 대리하지 못하는 서버 부분**(서버 네트워크 경로 · 서버 npm 11 lock 재현 · 서버 자원에서의 fit 빌드)이 닫히는지. 같은 명령 순서가 로컬 스크래치에서는 전부 exit 0(더미 URL build 12.7 s · M-15 로컬 닫힘). node 24 `prepare` 는 pleiades CI `verify (24.x)` 가 이미 대리 검증(N6). β2-R 은 조건 5 예외(Q46 토큰)가 필요(S-1) | 높음 — E0 |
| **U-3 ①** | **#3 `auto-adjust.ts:395` 제안 메시지**가 재시도 ×4 · plain 폴백(키보드 유지 · 엔티티 리터럴) · 분할(키보드는 마지막 청크)을 얻는 것 | **승인** — 003 §4-1(a)·§5-3 이 적은 1a-3 의 목적. 지금은 실패 시 에러 문구가 대신 나간다 | 코드 **즉시**(미배포 동안 · U-8) / 이미 나간 메시지 불가 | **최악 지연 280 s/청크/대상**(봇 `timeoutSeconds: 60` × 4 + 백오프 40) · 타임아웃 후 실제 도달 시 **중복 제안** 가능(첫 클릭 Accept·Reject 면 두 번째 클릭 무동작 · Snooze 면 동작) · 폴백 시 `&amp;` 리터럴(S-2). 003 은 이것을 확인 대상으로 분류하지 않았다 — 같은 성격 fin 항목은 Q27(S-3) | 높음 — E0 |
| **U-3 ②** | **#5 `auto-adjust-cron.ts:78` 스누즈 재전송**이 같은 것을 얻는 것 | **승인** — 가드 없이. 단 옆 칸의 창 확대를 보고 답한다 | 코드 **즉시**(미배포 동안) / 이미 나간 메시지 불가. 가드를 요구하면 범위 변경 → 재승인 | 지금은 실패 시 **사용자 문구 없이** 5분 뒤 tick 이 재전송(N2) — 교체 후 tick **안에서** 재시도. tick 은 `take: 10` · 겹침 방지 없음 → **기존 최악 600 s > 5분**(겹침은 이미 가능) → 교체 후 대상 1·청크 1 기준 **2,800 s(약 4.7배)** — 겹친 tick 이 전송 중인 건을 다시 집어 **중복 재전송** 창이 넓어진다(M-14). 발생 빈도는 미측정 | 높음 — E0 |
| **U-3 ③** | 6 호출 공통 부산물 — `ENOTFOUND` 재시도(S-4) · 분할 시 부분 전송 상태(S-5) | **승인** | 코드 **즉시**(미배포 동안) | DNS 일시 실패가 백오프 후 성공할 수 있게 된다 · 4096 초과 + 청크 최종 실패 시 앞부분만 도달 | 중간 — E0 |
| **U-4** | (확인) D-1~D-4 구현 결정 | 호출부 직접 교체(W2) · `bot.api` 직접 · fit `error.ts` 유지(운영 importer 6곳 전부 `sanitizeError` 만 · shim 이면 `error.test.ts:101` 파손 — N4) · re-export 삭제 | **즉시** — revert PR 1개(9파일) | 되돌리기 단위와 호출부 편집 수. 감사가 `tsc`·vitest·esbuild 프로브로 성립 확인 | E0 |
| **U-5** | 로그 label (#48 I2·I3) | **`'bot'` 6곳 전부** — 재시도·실패 로그 형식 동일(프로브 확인) · `keyboard ` 한 단어 소실 · 키보드 경로에 재시도 로그 신설 | 코드 **즉시** / **이미 찍힌 로그는 불가** | 운영 grep 호환(의존 절차 0). 대안: 호출부별 label — 로그가 풍부해지나 `[bot]` grep 이 깨진다 | 중간 — E0 |
| **U-6** | γ-live — 로컬에서 Q46 검증 토큰으로 5000자 + 키보드 1건 | **한다** — 토큰이 발급돼 있으면(M-13) | 서버 무접촉 / **이미 나간 메시지 불가**(검증 채팅 한정) | 서버 없이 실 API 결합을 한 번 본다 — β2-R 을 미루는 근거 | 중간 |
| **U-8** | **1a-3 되돌리기 등급을 003 §5-2 의 "중간" 에서 시점 한정 "즉시" 로 적는 것** | **승인** — "즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간" | 문구 **즉시**(003 §5-2 정정 블록 1개) | 머지 후 행위(revert PR + `npm ci` + `prisma generate` + 8절)가 서버·pm2 0 이라 1a-2(즉시)와 같다(N5). 거부하면 "중간" 을 유지하되 **실제 이유**(현재 근거 둘은 해소됨)를 적어야 한다 | 중간 — E0 |

~~U-7~~ 은 결정 항목에서 뺐다 — E0b 트리 변화 0 동기화 PR 로 고정(감사 B2).

### 9-2′. 승인 게이트 5항목 — 최종 (2회차 작성 · 3회차 r2 반영)

```markdown
## 집행 계획 — 1a-3 (myFitness send.ts → @pleiades/notify)

### 건드릴 파일
| 저장소 | 파일 | 변경 |
|---|---|---|
| myFitness (worktree) — E0b | (동기화 PR) `integration/chore-pleiades-sync-20260930` | `git merge --no-ff origin/dev` — 트리 변화 0 · merge commit(squash 금지) · 이슈 1:1 · 8절 4종 · 9-1 사전 리뷰 · **9-3 봇 루프(봇 불가 시 9-3 봇 불가 표 필수 경로 행)** · 머지 후 부모 2 확인. **이 게이트 승인이 E0b 승인을 겸한다**(3회차 · r2 R6) |
| myFitness (worktree) | package.json | dependencies +1줄 `"@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#<SHA40>"` (직접 편집 · 정렬 위치) |
| myFitness | package-lock.json | `npm install` 결과 — +1 엔트리(782 → 783 · 감사 실측과 대조 · 다르면 중단) |
| myFitness | src/bot/notifications/notifier.ts | 신규 — `notifierFor(bot)` |
| myFitness | src/bot/notifications/send.ts | 삭제 (124줄) |
| myFitness | scheduler.ts · auto-adjust.ts · auto-adjust-cron.ts · src/lib/monitoring/admin-alerts.ts | 호출 6 · import 4파일 · `first.ref`/`first.target` 2곳 · re-export 삭제 · label `'bot'` |
| myFitness | __tests__/send.test.ts → notifier.test.ts (`git mv`) | baseline 11 이식(불변 9 · 의도 변경 2 — fake timers) + ~~신규 5~~ 신규 ①~⑤(⑤는 E3 판정 · 건수는 E5 실측 M-9) |
| 서버 (U-2 · 사용자 실행) | `~/pleiades-int/` 별도 디렉터리 | §5-3 3회차 명령 — `set -o pipefail` · 셸 `DATABASE_URL` 0 확인 → 클론 → `.env`(`.example` 제외) 0 확인 → `npm ci` → 더미 URL 로 generate·build · 각 단계 exit 출력 · 실패 시 중단·보고. 프로세스 기동 없음 |

### 반영에 필요한 것
- 빌드: worktree 로컬 `npm run build`(8절 검증) · 서버 β2-I 빌드(사용자 · 더미 URL)
- 재시작: **없음** — 실서비스 pm2 6개 무접촉 · `integration/pleiades` 미배포
- 세션 초기화: 불필요

### 롤백 — 머지 전 · 머지 후 · 원본 도달분
```bash
# 머지 전
gh pr close -R fomalhaut84/myFitness <pr> --delete-branch
git -C repos/myFitness checkout integration/pleiades && git -C repos/myFitness branch -D integration/feature-pleiades-1a-3
(cd repos/myFitness && npm ci && npx prisma generate)          # → 8절 4종
# 머지 후
git -C repos/myFitness checkout integration/pleiades && git -C repos/myFitness pull --ff-only
git -C repos/myFitness checkout -b integration/chore-pleiades-revert-1a-3
git -C repos/myFitness revert <squash SHA>
git -C repos/myFitness push -u origin integration/chore-pleiades-revert-1a-3
gh pr create -R fomalhaut84/myFitness --base integration/pleiades --head integration/chore-pleiades-revert-1a-3 --title "revert: 1a-3 (pleiades#<issue>)" --body "…"
# → 사용자 머지 후:
git -C repos/myFitness checkout integration/pleiades && git -C repos/myFitness pull --ff-only   # base 재체크아웃 (3회차 · r2 R7-1)
git -C repos/myFitness branch -D integration/chore-pleiades-revert-1a-3                        # 로컬 revert 브랜치 삭제
(cd repos/myFitness && npm ci && npx prisma generate)          # → 8절 4종
# E0b 동기화 PR 은 되돌리지 않는다 (트리 변화 0 · dev 를 조상으로 들이는 것이 목적 — 되돌리면 다음 동기화가 같은 커밋을 다시 요구)
# β2-I: 서버 rm -rf ~/pleiades-int (사용자)
# 원본 도달분: 없음 (#80)
```

**상태 판정 표 (5-1 필수 항목 1 · PR 마다 한 행 · 3회차 r2 R7-2)**

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| E0b 동기화 PR (myFitness · `integration/chore-pleiades-sync-20260930`) | `<머지 SHA>` (merge commit · 부모 2) | 없음 | 없음 | 없음 — **되돌리지 않는다**(트리 변화 0 · 되돌리면 다음 동기화가 같은 커밋을 다시 요구) |
| 1a-3 PR (myFitness · `integration/feature-pleiades-1a-3`) | `<squash SHA>` | 없음(미배포) · β2-I 는 서버 별도 디렉터리(프로세스 0) | 없음 (#80) | 있음 — `@pleiades/notify` +1 · 되돌리면 `npm ci` |

**사전 사본 (5-1 원칙 3):** 해당 없음 — 사유: 되돌리기가 지우는 `notifier.ts`·`notifier.test.ts` 는 **tracked** 이고 revert 는 이력을 보존한다(3회차 · r2 R7-3).
등급: **즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간**(U-8) · 불가: γ-live 로 이미 나간 검증 메시지 · 이미 찍힌 로그 · 소요는 등급으로 갈음(R2)

### 서비스 중단 가능성
없음. 단 β2-I 의 `npm ci`·`next build` 가 같은 서버 자원을 쓴다(`free -m` 선확인 · M-6). 셸에 `DATABASE_URL` 이 있으면 명령을 시작하지 않는다(M-15)
```

## 10. pleiades 쪽 반영 (E10 · 별도 pleiades 이슈·PR · self-review) — 이 초안은 손대지 않는다

| 대상 | 무엇 |
|---|---|
| 003 §10 **Q48** | 답(U-1) 기록 — 확정 행 + 정정 블록 |
| 003 §5-2 1a-3 행 | 집행 블록(계획·감사·머지 SHA·pin SHA · 인계) — 1a-2 집행 블록 형식 |
| 003 §5-2 정정 ① | *"1a-0~1a-3 은 여전히 동작 변경 0"* 불성립 정정 — fit 키보드 경로 · `ENOTFOUND` · 부분 전송(S-3·S-4·S-5 · U-3 답) |
| 003 §3-1 2026-09-09 정정 · measured-facts **C-4** | *"fit 폴백이 보는 엔티티 0"* 은 **1a-3 전까지 참** — 이후 키보드 모듈 2개가 폴백에 도달(S-2) · 정정 블록(지우지 않는다) |
| 003 전반 *"즉시 (1a-3 착수 전까지 · 이후 중간)"* | ~~시점 도달 — 1a-1 산출물의 되돌리기가 **중간**으로 넘어갔음을 한 곳(§8-1)에 기록~~ **정정 (3회차 · 감사 r2 R2):** SHA 핀이라 pleiades 쪽 즉시 유지 · fit 관측 동작은 fit PR 필요 · '1a-3 착수 전까지' 조건은 SHA 핀 아래 무의미해졌음을 §8-1 에 기록 |
| 003 §10-1 조건 5 | fit 은 발송이 봇 전용이라 조건 5 하에서 관측 불가(S-1) — β2-R 을 할 때의 예외 조건 명시 |
| `packages/notify/README.md` | `<ref>` 설명을 Q48 답으로 |
| measured-facts | 1a-3 집행 실측 절(§0 · M-1~M-10 결과 · β2-I 로그 요약) |
| pleiades 하네스 stale 2곳 | `dual-repo-change/SKILL.md:125` · `agents/dual-repo-operator.md:98` 의 *"myFitness 는 `bot/notifications/send.ts`"* |
| 이슈 #48 | I2·I3 처리 기록 후 종료 |
| **(2회차 · N7)** `dual-repo-change/SKILL.md:124` | fit `npm run test` = *"vitest run + verify 스크립트 2개"* stale → dev 동기화 후 verify **5종** |
| **(2회차 · N5·N7)** 003:1062 | *"삭제가 양쪽 `npm ci` 를 깬다"* 는 SHA 핀에서 불성립 — pleiades 이력 재작성·비공개 전환 때만 참 · 정정 블록 |
| **(2회차 · N7)** 003 §5-2 1a-3 행 | *"import 6건 되돌림"* → **호출 6 · import 4파일** · 등급 칸은 U-8 답에 따라 정정 블록 |
| **(2회차 · B3)** 003 §5-2 · §4-1(a) | 키보드 경로 최악 지연 **280 s/청크/대상** · maintenance tick 겹침 창(기존 600 s → 약 4.7배) 기록 — U-3 ② 답과 함께 |
| `CLAUDE.md` 상태 · 인계 노트 | 표준 |

## 11. 이 초안이 하지 않은 것

- 대상 저장소·서버·원본 쓰기 **0**. 스크래치 설치·실행 **0**(M-1~M-3 은 감사 또는 E2 몫).
- 숫자는 §0 의 읽기 명령과 인용 출처에서만 왔다. 소요 시간은 적지 않았다(R2).

