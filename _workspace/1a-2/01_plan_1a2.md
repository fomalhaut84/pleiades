# 1a-2 집행 계획 — myFitness vitest 도입 (+ #51 fin 8-4 문장)

작성 2026-09-11 · 오케스트레이터 직접 실측(Phase 1) · **2회차** — 착수 직전 재감사(`03_auditor_1a2plan.md` · 정정 10건 · 블로커 3) 반영
입력: 003 §5-2 표 1a-2 행 + 정정 ③ · §9 U1(해소)·U2·U3 · §10 Q16·Q17·Q18(**사용자 확정 2026-09-11 — 전부 권고안**) ·
measured-facts "테스트 도입 전제"(2026-09-03) + 2026-09-04 정정 · "추가 측정 — 2026-09-04 (U1 원인 규명)" · `_workspace/05_operator_u1_vitest.md` ·
fit worktree 원문(아래 §0) · 이슈 #51 본문.

> **이 단계가 쓰는 곳은 `repos/myFitness` worktree(모드 I)와 — #51 만 — `repos/myFinance` worktree 다.** 원본 `~/workspace/myF*` 는
> **머지 후 하네스 동기화(감사 정정 5 · 게이트 항목 G-2 · #42 선례 `git archive … | tar -x`)에 한해** 쓴다 — 코드·의존성은 원본에 닿지 않는다.
> 서버·DB·텔레그램 무접촉. `integration/pleiades` 는 배포되지 않는다(fit `deploy.yml` 은 `release.published` 만 · §0).
> 되돌리기 **즉시** — 003 §5-2 "4파일 revert + `npm ci`" 그대로(§4).

## 0-1. 2회차에서 무엇이 바뀌었나 (감사 정정 번호)

| 감사 # | 반영 | 어디 |
|---|---|---|
| **3 (블로커)** | 1a-3 교체 대상은 `bot/utils` 가 아니라 **`src/bot/notifications/send.ts`(124줄)** — 절단 `:36` · 재시도 `[2000,8000,30000]` · HTML→plain 폴백 `:59` · `SendResult` 집계가 거기 있다. **`send.test.ts` 를 추가**(fake `bot.api.sendMessage` + `vi.stubEnv` + fake timers · 10건 · 스크래치 설치본에서 통과). coverage include 에 `src/bot/notifications/**` 추가. `telegram.ts` 는 인바운드(`report.ts`·`ai.ts` 소비)라 **1a-3 무관한 순수 함수 baseline** 으로 성격을 고쳐 적는다 | §0 · §1 · G-1 |
| **4 (블로커)** | fit 하네스 정정 지점 2 → **3** — `workflow.md:275`(8-5 작성 원칙 *"테스트 프레임워크 부재 시 … `scripts/*.ts` 로 대체"*)는 **살아 있는 지시**라 vitest 도입 후 남기면 회귀 테스트를 계속 스크립트로 대체하게 만든다. `docs/specs/` 6파일 8행은 **그 시점의 스펙 기록이라 고치지 않는다**(명시) | §1 · §4 |
| **5 (블로커)** | worktree 하네스만 고치면 세션이 로드하는 **원본 `~/workspace/myF*/.claude/`** 는 계속 거짓이다(`bin/claude-with` = `--add-dir` 원본 · `integration/pleiades` 는 `dev` 로 가지 않음). **(a) 머지 후 원본 동기화를 범위에 넣고 "원본 쓰기 0" 철회 / (b) 후속으로 미루고 한계 명시** — **게이트 G-2**(권고 a · #42 선례). #51 도 같다 | 머리말 · §3 E8·E9 · §5 · G-2 |
| 1 · 2 | `npm test` 참조 **9행 / 7파일**(누락 `ci.yml:66` 주석 · `docs/specs/bot-telegram-ipv6-timeout-202606.md:214` · `docs/specs/training-plan-ui.md:119`) · `ci.yml` 트리거 **`push`+`pull_request` 둘 다 `[dev, main]`**(결론 불변) | §0 표 |
| 6 | E10 pleiades 하네스 정정 대상 **1 → 5곳** + 선행 stale 1곳(`dual-repo-change:86-89` *"fit worktree 에 `.claude/` 없다"*) | §3 E10 |
| 7 | **U3 해소** — 스크래치 전체 설치(682 packages) + `npx vitest run` 통과 · vite 6.4.3 이 top-level esbuild 0.28.1 을 해석(중첩 없음) · 신규 EBADENGINE 0. §9 대안(`$esbuild` 리터럴화)·E3 별도 관문 **삭제** | §3 E3 · §6 |
| 8 | U4 *"실패 시 관측만"* 은 틀렸다 — `next build` 가 DB 를 요구하면 **E5 가 막힌다**(force-dynamic 없는 GET route 13/15 · fit CI 가 build 앞에 postgres+migrate). **로컬 postgres(5432 LISTEN 중)가 E5 의 전제** · 실패 시 **중단·보고** | §3 E5 · §6 |
| 9 | `ci.yml:64-68` 주석 + 스텝 이름 `Test — 회귀 검증 스크립트` 가 stale 해진다 → **이번 범위에서 제외**(신설 사유를 적은 이력 주석 · 서비스 저장소 CI 파일은 건드리지 않는다) · 후속 목록에 기록 | §1 · §8 |
| 10 | #51 정정 블록 형식 — 헤더는 `> **정정 (2026-09-11 · pleiades#51).**` 이슈 번호만, 출처(myFitness#373 Codex P2)는 본문 · fin 8절에는 8-5·8-6 이 없다(구조 차이 — 문장 1개만 옮긴다) | §2 |
| 실행 확인 | 초안 3파일(`error.test.ts` 25건 · `telegram.test.ts` 8건 · `send.test.ts` 10건 = **43건**)을 감사의 스크래치 설치본(`audit-1a2/u3`)에서 실행 — **43/43 통과 · `tsc --noEmit` 0 · `eslint src/ --max-warnings 0` 0**(U2 실질 해소 · 실제 파일 기준) | §0 · §6 |

## 0. 실측 (2026-09-11 · worktree `integration/pleiades` · fit `8b7a224` · fin `6542152` · 둘 다 clean · behind 0)

| 항목 | 값 | 출처 |
|---|---|---|
| fit `package.json` | `scripts.test` = `npm run verify:mcp-date-labels && npm run verify:food-edit-pending` · `overrides.postcss` = `"$postcss"` · `overrides.esbuild` = `"$esbuild"` · devDeps 15(vitest 계열 **0** · `postcss ^8.5.10` · `esbuild ^0.28.1` · `@types/node ^20`) · `engines`·`type` 없음 | `python3 -c json` |
| **lock 재현(스크래치 사본 · worktree 무변경)** | `"$postcss"`→`"^8.5.10"` 뒤 `npm install --package-lock-only --save-dev --ignore-scripts vitest@^4.1.8 @vitest/coverage-v8@^4.1.8 vite-tsconfig-paths@^6.1.1` → **EXIT 0 · lock 716 → 785(+69)** · vitest **4.1.11** · coverage-v8 4.1.11 · vite-tsconfig-paths 6.1.1 · **vite 6.4.3** · postcss 8.5.25 · esbuild 0.28.1 **무변경** · `dependencies` 오염 없음 · `vite/node_modules/esbuild` 중첩 **없음**(U3 그대로) | 스크래치패드 `u1/` · **2026-09-04 값과 전부 일치** |
| ⚠ npm 이 쓰는 범위 | `npm install vitest@^4.1.8` 은 devDeps 에 **`^4.1.11`** 을 적는다(해석값 기준). fin 은 `^4.1.8`. **직접 편집 후 인자 없는 `npm install` 은 `package.json` md5 를 바꾸지 않는다**(키 순서·`overrides` 재정렬 0 · 감사 주장 10) | 위 재현 · 감사 |
| **`npm audit`** | 도입 전 4(critical 1 · high 2 · moderate 1: `hono`·`js-yaml`·`next`·`sharp`) → 도입 후 **4 · 같은 집합**. vitest 3종이 새 취약점을 **더하지 않는다**. `--omit=dev` 3 | `npm audit --package-lock-only --json` |
| fit `security-audit.yml` | 트리거 `push: [main, dev]`(paths `package*.json`) + 주간 cron + dispatch — **`integration/pleiades` 무관** | `cat` |
| fit `ci.yml` | `push: [dev, main]` **+** `pull_request: [dev, main]` — **`integration/pleiades` 무관.** 단계: `npm ci` → prisma generate → migrate → lint → `npx tsc --noEmit` → **`npm test`**(#364 회귀 스크립트) → build | `cat` |
| fit `deploy.yml` | `release.published` · `workflow_dispatch(tag)` 만 | `sed` |
| **`npm test` 참조 9행 / 7파일** | `ci.yml:66`(주석)`,69` · `.claude/rules/workflow.md:135,165` · `.claude/skills/codex-review-loop/SKILL.md:68` · `.claude/skills/branch-workflow/SKILL.md:76,83` · `CLAUDE.md:34` · `docs/specs/bot-telegram-ipv6-timeout-202606.md:214` · `docs/specs/training-plan-ui.md:119` — **이름 `test` 를 유지하면 전부 유효.** 도입 후 **거짓이 되는 문장 3곳**: `workflow.md:165` · `branch-workflow:83`(사실 진술) · **`workflow.md:275`(살아 있는 지시)**. `docs/specs/` 는 그 시점 기록이라 두고, `ci.yml:64-68` 주석·스텝 이름은 제외(§1) | `/usr/bin/grep -rn` · 감사 정정 1·4 |
| fit `tsconfig.json` | `include: **/*.ts` → 테스트 파일이 **`npm run typecheck` 대상** · `paths @/* → ./src/*`(fin 동일) · `moduleResolution: bundler` | `cat` |
| fit lint | `eslint src/ --max-warnings 0` · `eslint.config.mjs` = `eslint-config-next` + `ignores: src/generated/**` → **`src/**/__tests__/` 검사 대상**(U2) | `cat` |
| fit `.gitignore` | `/coverage` · `/dist` · `/.next/` · `.env` 이미 ignored | `cat` |
| **U3 (해소)** | 스크래치 전체 설치 682 packages EXIT 0 → `npx vitest run` 통과 · `--coverage` 정상 · `require.resolve('esbuild')` = top-level 0.28.1 · 신규 EBADENGINE 0 | 감사 주장 8 |
| **로컬 postgres** | `127.0.0.1:5432`·`[::1]:5432` **LISTEN 중**(pid 2348) — E5 `next build` 의 전제(U4) | `lsof` · 감사 |
| 환경 | node **v20.18.0** · npm 10.8.2 · worktree `node_modules` 496 엔트리(2026-09-04) · `.bin/vitest` **0** · worktree `.env` = `localhost:5432/myfitness`(로컬 DB · 서버 아님) · `.next`·`dist` 는 **2026-09-09 15:02 빌드본**(H-3(fit) 세션에서 worktree 빌드 전례) | `stat` · `.env` 키 이름만 열람 |
| **테스트 대상 3파일** | **`src/bot/notifications/send.ts` 124줄 — 1a-3 교체 대상**(003 §5-2 1a-3 행 · 런타임 import `../utils/error` 하나 · `Bot`·`InlineKeyboard` 는 type · 호출부 `lib/monitoring/admin-alerts.ts:10` 외 5 · `truncate:35-37` · `sendOneWithRetry:39-75` · `sendToAll:77-91` · `sendToAllWithKeyboard:98-124`) · `src/bot/utils/error.ts` **85줄**(그 의존 · 순수 · `isHtmlParseError:82-85` = 1a-1 코어 폴백 판정 정본) · `src/bot/utils/telegram.ts` **60줄**(**인바운드** `report.ts`·`ai.ts` 소비 — 1a-3 무관 · `splitMessage` 비export → `replyLong` 경유 · grammy 는 `import type` 뿐) | `cat -n` · 감사 정정 3 |
| 기존 `__tests__` | fit **0** · fin 18 디렉터리 · fin 패턴 `src/**/__tests__/**/*.test.ts` | `find` |
| fin `vitest.config.mts` | 15줄 — `plugins: [tsconfigPaths()]` · `environment: node` · `include: src/**/__tests__/**/*.test.ts` · coverage v8 `include: src/lib/**/*.ts` · `exclude: [__tests__, prisma.ts]` | `cat` |

### 가정을 뒤집는 값 1건(감사 정정 3) + 보정 2건

| # | 무엇 | 왜 계획에 들어가나 |
|---|---|---|
| **S-1** | 1회차는 baseline 을 `bot/utils` 에 두고 *"1a 추출 대상"* 이라 적었다. **틀렸다** — 1a-3 이 통째로 교체하는 모듈은 `bot/notifications/send.ts` 이고 그 모듈에 테스트 0건이면 *"회귀 baseline 이 생긴다"*(003 §5-2 1a-2 행)가 미달한다 | `send.test.ts` 10건 추가(§1) · coverage include 에 `src/bot/notifications/**` |
| **B-1** | 003 은 *"scripts 3줄"* 을 **추가**로 읽히게 적었으나 fit 에는 이미 `test` 가 있고 CI·하네스·스펙 9행이 그 이름을 부른다 | `test` 는 **수정**(vitest + verify 유지) · `test:run`·`test:coverage` 는 **추가** → 3줄 그대로, 단 1 수정 + 2 추가(§1) |
| **B-2** | fit 하네스 **3곳**이 도입 직후 거짓·역행 지시가 된다(`workflow.md:165` · `:275` · `branch-workflow:83`) | 같은 PR 에 **정정 블록**(165·83 은 3줄 안팎 · 275 는 해당 줄 교체 + 블록) — 되돌리기 단위 4파일 → **8파일**(테스트 +2 · 문서 +2). 등급 즉시 불변. **게이트 G-1·G-2** |

## 1. 변경 파일 — fit (`repos/myFitness` · 브랜치 `integration/feature-pleiades-1a-2` · base `integration/pleiades`)

| 파일 | 변경 | 근거 |
|---|---|---|
| `package.json` | ① `overrides.postcss`: `"$postcss"` → **`"^8.5.10"`**(Q16 · 1줄) ② devDeps **3줄 직접 편집** — `"vitest": "^4.1.8"` · `"@vitest/coverage-v8": "^4.1.8"` · `"vite-tsconfig-paths": "^6.1.1"`(**fin 과 같은 범위** — npm 에 맡기면 `^4.1.11` 이 적혀 드리프트 · Q18 devDeps) ③ scripts — `"test"`: **`vitest run && npm run verify:mcp-date-labels && npm run verify:food-edit-pending`**(1줄 수정 · 참조 9행 무변경 · 회귀 baseline + #364 스크립트 유지) · `"test:run": "vitest run"` · `"test:coverage": "vitest run --coverage"`(2줄 추가 · fin 대칭) | 003 §5-2 · B-1 |
| `package-lock.json` | `npm install`(직접 편집 후 인자 없이) → **+69 엔트리 · 785** 예상(§0 재현과 대조 — 다르면 중단) | §0 |
| `vitest.config.mts` | 신규 **15줄** — fin 사본에서 coverage `include` 만 `['src/lib/**/*.ts', 'src/bot/notifications/**/*.ts', 'src/bot/utils/**/*.ts']`(1a-3 교체 대상 + 그 의존) · `exclude: ['src/**/__tests__/**', 'src/lib/prisma.ts']` · 따옴표는 fit 스타일(쌍따옴표·세미콜론) | fin `vitest.config.mts` · 정정 3 |
| **`src/bot/notifications/__tests__/send.test.ts`** | 신규 **10건** — `sendToAll`: env 파싱(trim·빈 항목) · 수신자 0 · **절단 4093+`...`** · HTML 파싱 실패 → plain 즉시 재전송(타이머 0) · 네트워크 오류 **2000·8000·30000ms 재시도 총 4회**(fake timers 로 경계 1999/2000 확인) · 4회 실패 집계 후 다음 수신자 · 비네트워크 오류 무재시도. `sendToAllWithKeyboard`: `reply_markup` · `first{chatId,messageId}` · 무재시도 · 전부 실패 시 `first` undefined. `console.warn/error` 는 spy 로 무음 | Q17 · 정정 3 · **1a-3 직접 baseline** |
| `src/bot/utils/__tests__/error.test.ts` | 신규 **25건** — `sanitizeMessage`(토큰 마스킹) · `sanitizeError`(중첩 `error`/`cause` · depth 5 · 비직렬화) · `getErrorCode` · `isNetworkError`(코드 6종 · grammy timeout 정규식 · AbortError · `type:'aborted'`) · **`isHtmlParseError`(1a-1 코어와 같은 정규식 — 1a-3 회귀 baseline)** | Q17 `src/**/__tests__/` |
| `src/bot/utils/__tests__/telegram.test.ts` | 신규 **8건**(인바운드 순수 함수 baseline · 1a-3 무관) — `mdToHtml`(헤더·굵게·기울임·코드·불릿) · `escapeHtml` · `replyLong`(fake `ctx.reply` 로 **분할 경계 4096 · 줄 경계 우선 · 절반 미만이면 하드 슬라이스 · 파싱 실패 → 태그 제거 폴백**) | 〃 |
| `.claude/rules/workflow.md` | **2곳** — `:165` 정정 블록(*"1a-2(pleiades#<issue>) 로 vitest 도입 · `npm run test` = `vitest run` + verify 2종"*) · **`:275` 작성 원칙 줄 교체**(*"테스트 프레임워크 부재 시 … 스크립트로 대체"* → *"vitest(`src/**/__tests__/**/*.test.ts`)로 쓴다. 프레임워크로 잡기 어려운 것만 재현 스크립트 + 스펙 갱신"*) + 정정 블록 | B-2 · 정정 4 |
| `.claude/skills/branch-workflow/SKILL.md` | `:83` 같은 정정 블록 | B-2 |
| **제외 (명시)** | `.github/workflows/ci.yml:64-68` 주석·스텝 이름(신설 사유 이력 · 서비스 CI 파일 무변경 · 후속 §8) · `docs/specs/` 6파일 8행(그 시점 기록) · `src/bot/utils/formatter.ts`(1a 무관) | 정정 4 · 9 |

**변경 파일 8** = `package.json` · `package-lock.json` · `vitest.config.mts` · 테스트 3 · 하네스 2. **원본 동기화(G-2 a)** 는 머지 후 `.claude/rules/workflow.md` · `.claude/skills/branch-workflow/SKILL.md` 2파일을 `git archive integration/pleiades <paths> | tar -x -C ~/workspace/myFitness` 로 — ignored 파일이라 index 무변경(#42 선례).

**fin 과 다른 지점(의도):** fit `test` 는 1회 실행형(fin `test` 는 watch). fit CI 가 `npm test` 를 부르고 `workflow.md` 8절 fit 칸이 `npm run test` 라서 watch 로 바꾸면 CI 가 멈춘다(8절 정정과 같은 근거). `test:run` 은 fin 대칭용 alias.

## 2. 변경 파일 — fin (#51 · `repos/myFinance` · 브랜치 `integration/chore-pleiades-51` · **별도 PR**)

| 파일 | 변경 |
|---|---|
| `.claude/rules/workflow.md:222` 8-4 | 마지막 문장 *"에러 메시지가 "model not supported…" 형태로 나오면 대개 쿼터 초과이므로 사용자에게 확인"* → **fit #373 머지본 문안**(`repos/myFitness/.claude/rules/workflow.md:257` — 오류 종류를 가른다: model 미지원은 `model` 지정 재시도 · usage/rate limit 이 쿼터 초과) + 정정 블록 **`> **정정 (2026-09-11 · pleiades#51).**`** 헤더에 이슈 번호만, 본문에 *출처 myFitness#373 Codex P2 · fin 원문 `e228c81`*(fit 관례 · 정정 10). 절 순서는 fin 이 이미 8-4 → 9 라 정정 없음. **fin 8절에는 8-5·8-6 이 없다 — 문장 1개만 옮기고 8절 대칭화는 하지 않는다** |

1a-2 와 #51 은 **이슈도 PR 도 다르다**(5절 1:1). 같은 세션에 묶는 이유는 승인 게이트 1회로 두 worktree 쓰기를 한 번에 승인받기 위해서다. 집행은 **fit 먼저 → 검증 통과 후 fin**(dual-repo-change §3 순차). **G-2 (a) 면 fin 원본 `~/workspace/myFinance/.claude/rules/workflow.md` 도 머지 후 동기화** — fin 은 tracked 라 원본이 `dev` 체크아웃이므로 `git archive` 가 아니라 **모드 S 미러 PR**(그 저장소 이슈 · `dev` base)이 정식 경로다(workflow.md 브랜치 전략 정정 · 004 Q43). 즉 #51 의 원본 도달은 **fin 미러 PR 1개**를 더 요구한다 — G-2 에서 fit(archive)·fin(미러 PR)을 따로 답한다.

## 3. 순서

| 단계 | 내용 | 통과 조건 |
|---|---|---|
| **E0** | ~~착수 직전 재감사~~ **완료**(정정 10 → 이 2회차에 반영 · 초안 3파일 스크래치 실행 43/43) → **승인 게이트 5항목 + G-1·G-2 → 명시 승인** | 승인 |
| **E1** | fit 이슈 신설(pleiades · `1a`) · 브랜치 `integration/feature-pleiades-1a-2` | — |
| **E2** | `package.json` 3곳 직접 편집 → **`npm install`**(worktree `node_modules`·lock 갱신 — 로컬 디스크뿐) → lock 엔트리 **785** · `.bin/vitest` 존재 · devDeps 범위 `^4.1.8` 확인 | EXIT 0 · 785 |
| **E3** | `vitest.config.mts` 배치 → `npx vitest run`(테스트 0 → `No test files found` exit 1 은 정상 · 기동만 확인 — U3 는 이미 해소) | 기동 |
| **E4** | 테스트 3파일(스크래치 초안 그대로 · RED 확인은 단언 1개를 일부러 뒤집어 1회) → `npm run test:run` **43건** | 43/43 |
| **E5** | 8절 fit 4종: `npm run lint`(U2 최종) · `npm run typecheck` · `npm run test`(vitest + verify 2) · `npm run build`(`next build` + esbuild 2 — worktree 로컬 · **전제: 로컬 postgres 5432 가동**(`.env` = `localhost:5432/myfitness`) · 2026-09-09 전례). **build 가 DB 로 실패하면 중단·보고**(정정 8) — 우회하지 않는다 | 전부 exit 0 · lint warning 0 |
| **E6** | 하네스 정정 3곳(2파일) → 커밋 `feat(test): vitest 도입 + bot/utils 회귀 baseline (pleiades#<issue>)` | — |
| **E7** | 9-1 사전 리뷰(`pr-review-toolkit:code-reviewer` · 대상 저장소 = 필수) → critical/major 0 → 재검증 | 0/0 |
| **E8** | PR → `integration/pleiades` · `Closes fomalhaut84/pleiades#<issue>`(수동 종료 #27) · 봇 루프 · 되돌리기 문구 → **머지 후**: worktree pull · **G-2 (a) 면 원본 fit `.claude/` 2파일 `git archive … \| tar -x` 동기화**(사용자 승인 · 사전 사본 스크래치패드) | — |
| **E9** | #51: fin 브랜치 → 1파일 → 8절 해당 없음(문서) → 9-1 사전 리뷰(대상 저장소 = 필수) → PR → **G-2 (a) 면 머지 후 fin 미러 PR**(모드 S · 원본 `dev` · fin 저장소 이슈) | — |
| **E10** | pleiades 쪽(별도 pleiades 이슈·PR · self-review): `measured-facts` 1a-2 절(§0 표 + E3~E5 실측) · 003 §9 U2·U3 이행 정정(U3 는 감사 스크래치 설치로 해소 · U2 는 E5 로) · §5-2 1a-2 행 완료 · pleiades 하네스 **5곳**(`dual-repo-change/SKILL.md:115,119-120` · `agents/dual-repo-operator.md:64,69-70` · `rules/workflow.md:231` — *"1a-2 가 vitest 를 도입할 때까지"* 소진) + 선행 stale `dual-repo-change:86-89`(*"fit worktree 에 `.claude/` 없다"* — #369 이후 거짓) · `.claude/rules/workflow.md:223` 8절 fit 행 무변경(`npm run test` 그대로 유효) · `CLAUDE.md` · 롤백 `_workspace/1a-2/04_operator_rollback.md` | — |

## 4. 되돌리기 — **즉시**

| 시점 | 행위 |
|---|---|
| 머지 전 | 브랜치 삭제 · worktree `git checkout integration/pleiades && npm ci`(node_modules 를 lock 대로 복원) |
| 머지 후 | revert 브랜치 → PR → 사용자 머지(직접 push 금지 · PR #60 Codex P1) → pull + `npm ci`(**실측: 되돌린 lock 에서 `node_modules/{vitest,vite,@vitest}`·`.bin/vitest` 전부 제거** — 감사 주장 5). 서버 무접촉(미배포 브랜치) |
| 원본 동기화 (G-2 a) | fit: `git -C ~/workspace/myFitness archive integration/pleiades .claude/rules/workflow.md .claude/skills/branch-workflow/SKILL.md \| tar -x -C ~/workspace/myFitness`(되돌린 커밋 기준 재실행) — ignored 파일 · index 무변경 · **중간**(git 이력 없음 · #42 와 같은 등급) · fin: 미러 PR revert(즉시) |
| #51 | 문서 1파일 revert |

003 §5-2 등급 **즉시** 불변(worktree·PR 단위). 파일 수 4 → 8 은 테스트 +2(정정 3) · 하네스 문서 +2(B-2). `node_modules` 는 산출물이라 되돌리기 단위가 아니다. **원본 fit 하네스 동기화만 중간**(git 이력 없음 — #42 선례와 동일).

## 5. 서비스 영향 — 없음

빌드·재시작·세션 초기화 **불필요**. `integration/pleiades` 는 `release.published` 에만 배포되고 CI 도 `dev`/`main` PR 에만 돈다. `npm install`·`npm run build` 는 로컬 worktree 디스크만 바꾼다. postcss 리터럴화는 해석 결과가 동일(8.5.25)이라 미래 `dev` 미러 시에도 빌드 산출물 무변경.

## 6. 미확인 (집행 중 해소)

| | 무엇 | 언제 | 실패 시 |
|---|---|---|---|
| **U2** | 테스트 3파일이 fit 실트리의 `eslint src/ --max-warnings 0` 통과 — **스크래치(fit `eslint.config.mjs` 사본)에서는 0/0**. 남은 차이는 `src/app` 존재 여부(Pages 경고 소멸)뿐 | E5 | 스타일 수정(범위 안) |
| ~~U3~~ | **해소**(감사 스크래치 설치 · 정정 7) | — | — |
| U4 | `next build` 가 로컬 DB(`localhost:5432/myfitness`)를 여는지 — 정적으로 닫히지 않음(force-dynamic 없는 GET route 13/15) · **로컬 postgres LISTEN 중이 전제** | E5 | **중단 · 보고**(정정 8). DB 를 요구하면 그 사실을 measured-facts 에 적고 사용자 결정(로컬 DB 마이그레이션 상태 확인 등) |
| U5 | 봇 리뷰 가동 여부(#57 은 24h 미게시) | E8 | 9-3 봇 불가 표 필수 경로 — 사전 리뷰가 최종 |

## 7. 감사 결과 (E0 완료) → 게이트에 올리는 결정 2건

감사 `03_auditor_1a2plan.md`: 확인 — `test` 스크립트 설계·verify 2종 DB 무접촉(lazy connect · fit 스펙 364:111) · `@/` 해석 · 두 utils 파일 순수성 · `npm ci` 제거 실측 · 세 워크플로우 트리거 · `npm install` 의 `package.json` 필드 보존 · `.mts` 는 `tsc` include 밖 · 생성 파일 gitignored. 정정 10 은 §0-1 에 반영.

| 게이트 | 질문 | 권고 | 대안 |
|---|---|---|---|
| **G-1** | `send.test.ts`(1a-3 교체 대상 직접 baseline · 10건)를 **이번 PR 에 포함**하나 | **포함** — 1a-2 의 목적이 그 모듈의 회귀 baseline 이고 이미 통과 상태 | 1a-3 착수 시로 미룸(그러면 1a-2 완료 선언은 "의존 모듈까지" 로 한정 명시) |
| **G-2** | 머지 후 **원본 하네스 동기화** — fit `~/workspace/myFitness/.claude/` 2파일(`git archive` · #42 선례) · fin #51 은 **모드 S 미러 PR**(fin 저장소 이슈 · `dev` base) | **(a) 둘 다 포함** — 세션이 읽는 파일은 원본이라 안 하면 1a-2 직후에도 fit 하네스가 *"vitest 가 아니라 verify 2개"* · *"스크립트로 대체"* 를 지시한다. 되돌리기: fit 중간(#42 동일) · fin 즉시 | (b) 후속 이슈로 미루고 §5 에 한계 명시 |

## 8. 후속 (이번 범위 밖 · 이슈로 남긴다)

- fit `ci.yml:64-68` 주석·스텝 이름 `Test — 회귀 검증 스크립트` — vitest 도입 후 부분 stale(서비스 CI 파일이라 제외 · 정정 9)
- fit `docs/specs/` 6파일 8행의 "테스트 프레임워크 없음" 서술 — 그 시점 기록, 고치지 않음(정정 4)
- pleiades `dual-repo-change:86-89` stale(*"fit worktree 에 `.claude/` 없다"*) — E10 에서 함께 정정
