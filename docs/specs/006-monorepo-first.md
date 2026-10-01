# 006 — 모노레포 먼저: 두 서비스를 이력째 pleiades 로 가져오되 서비스에는 닿지 않는다

작성 2026-09-30 · 상태 **방향 확정 · M-0 대기**
읽기용 아티팩트: 없음
(**정본은 이 파일이다.**)

**근거 계보:** 실측 `_workspace/006/01_surveyor_monorepo.md`(이하 **[S]**) · `_workspace/006/01_surveyor_monorepo_r2.md`(**[S2]**) →
초안 `_workspace/006/02_writer_006_r1.md`(1회차) · `_workspace/006/02_writer_006.md`(2·3회차) →
감사 `_workspace/006/03_auditor_006.md`(**[A]** · 정정 19 · 블로커 2) · `_workspace/006/03_auditor_006_r2.md`(**[A2]** · 정정 11 · 블로커 1 · 직접 반영 · #37 전례) → **이 문서**.
개정 이력(취소선·정정 블록·회차별 변경 표)은 **초안에 남아 있다.** 이 문서는 확정 결정 기준으로 정돈한 것이다. 추적 이슈 #97.

> **숫자 규율.** 이 문서의 숫자는 전부 [S]·[S2]·[A]·[A2] 와 기존 정본의 **인용**이다. 소요 시간은 적지 않는다(005 R2). 없는 값은 **미측정**으로 적는다.
> **001~005 는 지우지 않는다.** 이 문서가 그 문서들에 되돌려 보내는 정정·소진 블록은 §9 가 목록이고, **M-0(PR B)** 에서 붙인다.

---

## 0. 한 줄 요약

**두 서비스의 `dev` 를 GitHub 에서 읽기만 해서, pleiades 밖 스크래치에서 `git filter-repo` 로 경로(`apps/<app>/`)와 메시지(자동 링크 → 비링크)를 재작성한 뒤 `apps/{finance,fitness}` 로 이력째 들여오고, 이후에도 같은 방식으로 주기적으로 따라간다.** 서비스 저장소 쓰기 0 · 운영 영향 0 — 허용되는 흔적은 소유자 traffic 통계뿐이다(U97-6).
첫 목표는 가져온 두 앱이 **pleiades 안에서(CI · 로컬 · 검증 봇 포함)** 서비스와 같은 상태로 도는 것이다. notify(텔레그램) → Discord 는 그 뒤에 pleiades 안에서만 한다. **pleiades 가 서비스를 대체하는 전환(cutover)은 이 문서의 범위 밖이다**(§8 · Q60).

---

## 1. 무엇이 바뀌었나

> "myFitness, myFinance는 현재 독립적으로 실행하게 두고 플레이아데스에서 테스트가 필요하다면 그건 플레이아데스 내부적으로 테스트를 하는거야. 플레이아데스는 절대 지금 서비스중인 두 서비스를 어떤 목적으로도 영향을 주면 안되."
> — 사용자, 2026-09-30 (이슈 #97)

| # | 이전 전제 | 깨진 방식 | 출처 |
|---|---|---|---|
| **P1** | 단계 4(모노레포)는 **도메인 #3(캘린더)을 붙일 때** 들어간다 (002 §4) | **앞당긴다.** 첫 목표가 "두 앱이 pleiades 에서 도는 것" 이 됐다 | U97-4 |
| **P2** | pleiades 발 변경은 서비스 저장소의 `integration/pleiades` 로 간다 (workflow.md 7절 모드 I · #25) | **서비스 저장소에 쓰지 않는다.** 그 브랜치조차 쓰기다 | 원칙 |
| **P3** | 1a 는 **git 의존성**(`git+https://…pleiades.git#<ref>`)으로 서비스 저장소가 패키지를 소비하고, 서버 병행 인스턴스(β2)로 검증한다 (003 Q15 · Q42 · Q44) | 소비자가 **pleiades 안의 `apps/*`** 가 된다. 서버는 쓰지 않는다 | U97-4 · 원칙 |
| **P4** | 서비스 `dev` 는 서비스 저장소 안에서 `dev` → `integration/pleiades` 머지 PR 로 받는다 (#70) | **pleiades 안에서** 읽기 전용 fetch 로 받는다 | U97-2 |
| **P5** | 기존 산출물(`integration/pleiades` · `repos/*` · 이관 이슈)이 작업 표면이다 | **동결.** 삭제는 별도 결정 | U97-3 |

**대체한다:** 002 단계 4 의 진입 조건 · 003 의 배포·소비·검증 경로(git dep · Q48 · β2 · 1a-3/1a-4 의 대상 저장소 절차) · 004 의 worktree 작업 표면 · workflow.md 의 모드 I·`dev 수용` 행 · 이관 이슈 정책(#83).
**대체하지 않는다:** 002 의 목표(개인 비서 플랫폼 · Q1·Q5·Q6) · 003 의 **패키지 설계**(L3 · §4-2 시그니처 · Q10·Q19·Q25·Q26 · 1a-1 산출물) · 1a-3 계획(`_workspace/1a-3/`)의 **코드 결정**(D-1~D-4 · U-3 동작 변경 묶음 · U-5) · 005 의 pleiades 하네스 자체.

> **기호 주의.** 이 문서의 결정은 **`U97-<n>`** 이다. 1a-3 계획과 003 §4-2 에 이미 D-1~D-4 가 있어 겹치지 않게 했다([A] N17).

---

## 2. 확정된 답 (사용자 · 2026-09-30)

| | 질문 | 답 | 근거 |
|---|---|---|---|
| **U97-1** | 가져오기 | **이력 포함** → `apps/*`. 방법은 U97-5 | #97 |
| **U97-2** | 서비스 추종 | **정기 수용** — 서비스 `dev` 를 읽기 전용 fetch → pleiades 안에서 머지. 서비스 저장소에는 쓰지 않는다 | #97 |
| **U97-3** | 기존 작업물 | **동결** — 서비스 저장소 `integration/pleiades` · `repos/*` worktree · 이관 이슈 7건 그대로(삭제는 별도 결정). myFitness#504 닫음 · #95 보류 | #97 |
| **U97-4** | 첫 목표 | **가져온 두 앱이 pleiades 에서 도는 것**(CI lint/typecheck/test/build + 로컬 별도 DB·**검증 봇**) → notify 통합(텔레그램) → Discord | #97 |
| **원칙** | 서비스 영향 | **어떤 목적으로도 0.** 서비스 저장소 쓰기·PR·서버 사용 전부 금지. 테스트는 pleiades 내부(로컬·CI)만 | #97 |
| **U97-5** | 가져오기 방법 | **`git filter-repo` 재작성**(#97 원문의 `git subtree` 를 사용자가 변경). 조건: ① 경로 `apps/<app>/` ② **모든 자동 링크 형식을 비링크 형식으로**(`fin#N`·`fit#N` 류 · **소유자 포함 형식 금지**) ③ **push 전 grep-0 게이트**(재작성본 `git log --format=%B` 에 다섯 형식 0 — §4-2) ④ **조상 가드**(서비스 dev 무보호 대비) ⑤ filter-repo·git 버전·옵션 **고정 기록** ⑥ **서비스 원 SHA 트레일러** ⑦ `--no-tags` | [A] B1·B2·N2·N14 · [A2] R1 |
| **U97-6** | 원칙 경계 — 읽기 | **서비스 저장소 https 읽기 허용.** 소유자 traffic 통계에 흔적이 남는 것은 영향으로 보지 않는다. 경계: **"쓰기 0 · 운영 영향 0 · 관측 흔적 허용"** | [A] N4 |
| **U97-7** | M-4 의 검증 봇 | **M-4 에 검증 봇 기동을 포함한다.** 사용자가 BotFather 로 토큰 발급(두 앱 · 검증 채팅) | [A] N7 |
| **U97-8** | 로컬 DB 위치 | **기존 5432 인스턴스에 새 DB 두 개 `pleiades_fin`·`pleiades_fit`**(감사 권고 `initdb` 불채택). 이름은 서비스 기본값(`myfinance`·`myfitness`)과 겹치지 않게 · **기존 DB 무접촉**(생성·삭제는 그 두 이름만) · `.env.example`·원본/worktree `.env` **복사 금지** · 되돌리기 = `DROP DATABASE` 두 개(**즉시**) | [A] N10 |
| **U97-9** | **M-0 규칙 일괄** | **Q55** 새 발견은 **pleiades 이슈에만**(#83 대체) · **Q56** 서비스 참조는 비링크 `fin#N`·`fit#N` · **Q56b 차단 훅을 둔다**(`gh api` 메서드·필드 플래그 · graphql `mutation` · deploy 실행 · pleiades 안 filter-repo) · **Q58** `bin/claude-with` 소진 · `apps/*/.claude` 무수정 · **룰 한 줄 + 훅이 방어선** · `claudeMdExcludes` 는 CLAUDE.md·rules 보조 | 사용자 2026-09-30 |
| **U97-10** | **M-1 설정 일괄** | **Q66** venv 에 `git-filter-repo==2.47.0` 핀 + `tools/import/VERSIONS` · **Q62** 가져온 메시지의 `@멘션` **제로폭 무해화**(대가: `@prisma/client` 류 검색이 깨진다) · **Q63** 서비스 원 SHA 트레일러는 **수용 머지 커밋에 필수** · 커밋별 트레일러는 X15(결정성) 확인 후 · **Q65** M-1 PR 을 **draft 로 열어 봇 자동 리뷰 회피가 되는지 확인** · 안 되면 workflow.md 9-3 "봇이 돌지 않을 때" 경로 | 사용자 2026-09-30 |
| **U97-11** | 동기화 PR 머지 방식 (Q67) | **가드 C 로 충분 — 추가 강제 수단은 두지 않는다**(squash 실수 전례 #75 · #501 을 알고 결정) | 사용자 2026-09-30 · [A2] R3 |
| **U97-12** | 설치·lock 전략 (Q51) | **L2 — 앱별 lock 유지 · workspaces 없음** | 사용자 2026-09-30 |

**U97-5 가 subtree 를 대체한 이유.** subtree 는 커밋 메시지를 그대로 들인다. 서비스 dev 에 저장소 한정 참조 3건(`Closes fomalhaut84/myFinance#494` · `fomalhaut84/myFitness#108` · `Refs fomalhaut84/pleiades#51`)이 있고, 커밋 참조의 `referenced` 이벤트는 **push 시점**에 생긴다 → push 하는 순간 서비스 저장소 이슈·PR 타임라인에 이벤트가 남는다(편도 · 원칙 위반 — [A] B1). subtree 는 경로 이력도 끊는다(§3 ①). `--squash` 는 경로 이력이 없고 `pull --squash` 가 서비스 커밋 제목을 전부 메시지에 넣는다([A] N1). filter-repo 는 경로 이력을 살리고 메시지를 무해화한다. 대가는 **서비스 SHA 가 pleiades 이력에 남지 않는다**는 것이고, 수용 머지 커밋 트레일러(U97-5 ⑥)가 대응표다.

---

## 3. 실측 근거 — 대장 (인용만)

| # | 값 | 출처 |
|---|---|---|
| ① | **경로 이력:** subtree 는 끊긴다 — `git log -- apps/finance/package.json` **1**(서비스 **19**) · `blame` **1**(서비스 **16**). **filter-repo 는 이어진다** — `log` fin **19** · fit **32** · `blame` fin **16** · fit **28** = 서비스와 동일 | [S] §3 · [S2] X2 |
| ② | **크기:** filter-repo 재작성 두 앱 모노 pack(gc) **11.45 MiB · 821 커밋**(현재 pleiades 1.1 MiB · 48 커밋). 참고: subtree 이력 포함 11.81~12.15 MiB · `--squash` 8.80 MiB | [S2] X2 · [S] §3 |
| ③ | `HEAD:apps/<a>` == 서비스 `dev^{tree}` **YES ×2** · 재작성본 루트는 `apps` 만 → 루트 충돌 **0** | [S] §3 · [S2] X2 |
| ④ | **filter-repo:** 결정적(두 번 실행 tip 동일 · fit `2110825` · fin `71f7c4e`) · 증분 성립(dev~5 재작성 tip 이 최신 재작성본의 조상 → 일반 merge 로 +5 · 충돌 0) · 조건: **같은 filter-repo 버전·옵션·callback + 서비스 dev 이력 무재작성** · 실행 < 1 s · 메시지 안 커밋 해시 약어도 새 SHA 로 바꾼다(결정적) · pip 버전 **`2.47.0`**(`--version` 출력 `a40bce548d2c`) · git 은 Apple Git 2.50.1(venv 고정 불가) · 시스템에는 미설치 | [S2] X2 · [A2] R5 |
| ⑤ | GitHub https URL 로 리모트 등록·자격 증명 없이 읽힌다 | [S] §3 |
| ⑥ | 이력 비밀값(정규식 12종) **0 / 0** · `.env` 커밋 이력 0 / 0 · 세 저장소 모두 **PUBLIC** — 새로 공개되는 이력 없음. 한계: 엔트로피 검사 없음 · 도달 가능 객체만 | [S] §2 |
| ⑦ | `apps/*/.github/` 는 **동작 0** · 루트로 올리면 이름 충돌 **2** · `deploy.yml` 트리거 `release: published` + `workflow_dispatch` · pleiades Actions secrets **0** | [S] §4 |
| ⑧ | fin `.claude/` **tracked 16 + `CLAUDE.md`** 가 `apps/finance/` 로 들어온다 · fit 은 **0**. **추적되는 `apps/*` 파일을 읽으면 중첩 `CLAUDE.md`·`.claude/rules` 가 지연 로드되고 중첩 skill 도 발견된다**(시작 시에는 로드되지 않음 · 1회 실험 · Claude Code 2.1.285). fin 하네스: skill 7(`release-publisher`) · agent 4(`release-manager`) · rule 5 · `CLAUDE.md`(`./deploy/deploy.sh dev` 지시) | [S] §4 · [S2] X10 · [A] N5 |
| ⑨ | 주버전 충돌 **3**: `next` 15↔16 · `eslint` 8↔9 · `eslint-config-next` 15↔16 · `overrides` fin **3** · fit **16** | [S] §5 |
| ⑩ | 앱별 `npm ci` node_modules 합 **1,545 MB** · workspaces `npm install`(lock 새로 생성) **1,160 MB** | [S] §5 |
| ⑪ | workspaces lock 을 새로 만들면 서비스 lock 과 갈라진다 — fin **221**(직접 의존 21) · fit **242**(직접 의존 22) | [S] §5 |
| ⑫ | **npm 은 workspace 하위 `overrides` 를 무시한다** — 보안 override **19** 를 루트로 합쳐야 하고 `$` 참조는 뜻이 바뀐다 | [S] §5 |
| ⑬ | EBADENGINE 7(`>=20.19.0`) — 로컬 node 20.18.0 만 해당 | [S] §5 |
| ⑭ | **fit 웹은 기동만으로 Garmin 싱크 cron 을 등록한다** + sweeper 2 · fin 웹은 cron 0 · `SYNC_CRON` 은 끄는 env 가 아니다 | [S] §6 |
| ⑮ | **서비스 봇 토큰으로 두 번째 long polling 을 하면 `getUpdates` 409 로 서비스 봇 수신이 끊긴다** — 문서화된 동작 · 실측하지 않음 | [S] §6 |
| ⑯ | 외부 계정 env: fin `WHOOING_WEBHOOK_URL` · fit `GARMIN_EMAIL`·`GARMIN_PASSWORD` · `MFDS_API_KEY`. **advisor:** fit `src/lib/ai/claude-advisor.ts:28` `CLAUDE_BIN \|\| "claude"` → 빈 값이면 PATH `claude` 폴백 · fin 은 `:758`·`:814` 에 `'claude'` 하드코딩 + `spawn('sh', ['-c', cmd])`(`CLAUDE_BIN` 미사용) · 호출부 fin 봇 `briefing`·`active-review`·`monthly-report`·`ta-signal-alert`·`/ai`·`expense` · fin `src/lib/ai/mcp-config.json` 은 `http://127.0.0.1:4210/mcp` 하드코딩 | [S] §6 · [A2] B1 |
| ⑰ | `integration/pleiades` ↔ 서비스 `dev` 의 `src/`·테스트·`package.json` 차이 **0 / 0** · 1a-2 는 이미 서비스 dev 에 있다 · 1a-3 = fit `fd8b7c5`(`src/` 8 재사용 · `package.json`/lock 2 폐기) | [S] §7 |
| ⑱ | **서비스 커밋 메시지의 참조:** 닫기 키워드 fin 42 · fit 34 · **∩ pleiades 열린 이슈 0** · **저장소 한정 참조 3** · 모든 `#N` fin **1,331** · fit **1,945** · URL 0 · `GH-N` 0 · 호스트 없는 형식 0 · **`/#N` fin 3 · fit 3**(1차 callback 이 건너뜀) | [S2] X1 · [A2] R1 |
| ⑲ | GitHub: 커밋 메시지 닫기 키워드는 **기본 브랜치에 머지되면** 이슈를 닫는다 · 다른 저장소는 `OWNER/REPO#N` · **`referenced` 이벤트는 push 된 저장소 기준으로 push 시점에 생긴다** · 파일 안 참조는 자동 링크를 만들지 않는다. 렌더 API 로 링크되는 형식: `owner/repo#N`(대소문자 무관) · 호스트 없는 `owner/repo/pull/N` · `www.github.com/…/issues/N` · `gh-N`(대소문자 무관) · `fin/#N`·`x:#N`·`.#N`·`fin-#N`·`fin #N`. **링크되지 않는 형식(X11 확인):** `Closes fin#494` · `fit#108` · `myFinance#494` · `pleiades#51` | [S2] X1 · [A] B1·B2 · [A2] R1·R2 |
| ⑳ | **서비스 `dev` 는 무보호** — `rules/branches/dev` → `[]` · `branches/dev` → `protected:false`(두 저장소) | [A] N2 |
| ㉑ | **8절 4종(앱별 lock · 스크래치 모노):** fin lint·tsc·test(**50 파일 866**) 통과 · **build 는 더미 DB 로 rc 1**(prerender 가 Prisma 호출 · 모노레포 무관) · **스키마 적용 DB(migrate 27)면 rc 0** · fit **4/4**(더미 DB · test 63 파일 433 + verify 5). Next build *"multiple lockfiles"* 경고(실패 아님) | [S2] X3 |
| ㉒ | **`file:../../packages/notify` + 1a-3 src(fit):** lock `link:true` · `npm ci` 심링크 유지 · typecheck·lint·test(**442**)·build **전부 rc 0** · esbuild bot 번들에 인라인. **선행: `packages/notify/dist`** — 루트 `npm ci`(`prepare`)를 빼면 rc 127 → fit typecheck rc 2 · test·build rc 1 | [S2] X3 · [A] N8 |
| ㉓ | 최근 90일: fit 1a-3 대상 6 파일 → **4 커밋**(전체 158) · fin 1a-4 대상 19 파일 → **17 커밋**(전체 59) | [S2] X7 |
| ㉔ | 로컬 postgres 15.14 가 **127.0.0.1:5432 · [::1]:5432 리슨** · `.env` 가 원본 fin·fit · worktree fin·fit **4곳 모두 존재**(내용 미열람) · `.env.example`: fin `…@localhost:5432/myfinance` · `PORT=4100` · fit `…:5432/myfitness` · `PORT=4200` · `next dev` 기본 3000 | [S2] X9 · [A] N10 |
| ㉕ | 셸 env 우선: 두 앱 `prisma.config.ts` · fin `standalone.ts:10`·`mcp/server.ts:4` · fit `scripts/*` 가 `import "dotenv/config"` 로 cwd `.env` — dotenv·`@next/env` 는 기존 `process.env` 를 덮지 않는다(셸 export 가 이긴다) · Next 는 `.env.local`·`.env.development`·`.env.production` 을 `.env` 보다 먼저 · 현재 셸 관련 export 0 · 프로필 `DATABASE_URL` 0 | [A2] R6 |
| ㉖ | pleiades `dev` ruleset: force-push·삭제 차단 · PR 필수 · `allowed_merge_methods: [merge, squash, rebase]` · 필수 체크 `verify (20.x)`·`verify (24.x)` · `allow_merge_commit: true` · 평소 squash 머지. 서비스 CI: `postgres:16` 서비스 컨테이너 · `npm ci → prisma generate → prisma migrate deploy → lint → tsc --noEmit → (fit 만 npm test) → build` — **fin CI 에는 테스트 단계가 없다** | [A] C1~C3 · [A2] R3 |
| ㉗ | pleiades `vulnerability-alerts` 404 · `automated-security-fixes enabled:false`(Dependabot 꺼짐) · 서비스 태그 fin 27 · fit 85 · `traffic/clones` 는 소유자 Insights 집계 | [A] N4·N14 |

> **정정 (2026-10-01 · #107).** ⑧ 은 **추적 경로의 값만** 적었다. [S2] X10 은 **gitignored 경로에서도** 그 경로의 파일을 읽으면 중첩 `CLAUDE.md`·`.claude/rules` 가 지연 로드되고, gitignored 에서 안 되는 것은 **skill 발견뿐**이라고 쟀다(measured-facts X10 · 같은 날 004 §3-2 정정 블록). 따라서 **`repos/*`(gitignored · 동결 worktree) 파일을 읽는 것만으로 서비스 규칙이 로드될 수 있다** — I-11 은 git 명령만 막고 파일 읽기는 막지 않는다(§5 정정 블록). 그리고 X10 은 **agents 를 시험하지 않았다** — agent 발견은 어느 조건에서도 **미측정**이다(U8). 되돌리기: 문구 (**즉시**).

**미측정·미확인 (남은 것):**

| # | 항목 | 무엇을 가르나 |
|---|---|---|
| X4 | 서비스 lock 시드 단일 workspaces lock | 전환 설계 때 workspaces 재검토 |
| X5 | gitleaks 급 스캔 | ⑥ 한계 — 도구 설치는 사용자 결정 |
| X6 | Telegram 409 · Garmin 동시 세션의 실제 영향 | **영구 미측정**(측정 자체가 서비스 영향) — 차단 규칙만 둔다 |
| X8 | 서버 `claude -p` 와 로컬 Claude 가 같은 계정·쿼터인가 · Codex 봇 쿼터가 저장소 간 공유인가 · draft PR 이 자동 리뷰를 피하는가 | I-8 · U97-10 Q65 |
| X12 | 같은 SHA 재 push 시 이벤트 중복 제거 · 대량 push 처리 상한 | 게이트로 참조가 0 이면 무관 |
| X13 | 커밋 메시지 `@멘션` 알림 여부 | U97-10 Q62 는 확인 없이 무해화로 결정 |
| X14 | pleiades push protection 이 M-1 push 를 막는가(fin 문서의 `PRIVATE KEY` 플레이스홀더) | 막히면 I-18 |
| X15 | filter-repo `commit-callback` 으로 **커밋마다** 원 SHA 트레일러를 붙였을 때의 결정성 | U97-10 Q63 커밋별 트레일러 |
| U8 | 중첩 로드 재현성 · `claudeMdExcludes` 효과 · skill·agent 발견 차단 수단 | I-10 |
| — | 렌더 파서 = 커밋 참조 추출 파서인가 | 소유자 없는 형식은 pleiades 로만 해석 가능 → 틀려도 **pleiades 잡음(편도) · 서비스 영향 없음** |

---

## 4. 경로 — 단계 사다리

**각 단계의 완료 상태가 그대로 멈춤 지점이다.** 모든 단계의 서비스 영향은 **"쓰기 0 · 운영 영향 0"** 이어야 한다(허용 흔적은 traffic 통계뿐 · U97-6).

### 4-0. 한 장 요약

| 단계 | 내용 | 서비스 영향 | 되돌리기 (등급 · 행위 · 시점) | 멈추면 남는 것 |
|---|---|---|---|---|
| **M-0** (PR B) | 상위 문서 정정·소진 블록(§9) · **격리 불변식 룰**(§5) · 차단 훅 · `CLAUDE.md` · **`tools/import/`**(callback · 게이트 · 가드 · `VERSIONS` · `STATE.json`(M-1 이 생성) · `claude` shim · env 검사 헬퍼) | 0 | **즉시** — 문서·룰·스크립트 revert PR · 훅은 설정 1블록 삭제 | 방향·규칙·도구. 코드 무변경 |
| **M-1** | 가져오기 — filter-repo 재작성 → `apps/finance` · `apps/fitness` | 쓰기 0 · traffic 흔적 | **push 전: 즉시**(로컬 ref 삭제) · **PR push 후 머지 전: 트리 즉시(PR 닫기) · 객체 편도**(PR ref 가 보존) · `referenced` 이벤트는 게이트 통과 시 기대값 0(파서가 달라도 pleiades 잡음뿐 · 서비스 영향 없음) · **머지 후: 트리 즉시**(revert PR `-m 1`) · **이력·pack 편도** · 재도입은 revert 의 revert → **중간** | `apps/*` = 서비스 dev 트리의 정지 사본(경로 이력 포함). 설치·CI 없음 → 아무것도 돌지 않는다 |
| **M-2** | 설치·검증 — 앱별 lock(U97-12) · **`pleiades_fin` 생성 + `prisma migrate deploy`**(fin build 선행) · 두 앱 8절 4종 로컬 통과 · 헬퍼(`apps/*` 밖) | 0 | **즉시** — 스크립트 삭제 · `DROP DATABASE pleiades_fin`. `apps/*` 무변경 | 서비스와 **같은 lock** 으로 빌드·테스트된다는 사실 |
| **M-3** | CI — `apps-ci.yml` · 앱별 job · postgres 서비스 컨테이너 · **secrets 0** | 0 | **즉시** — 파일 삭제(필수 체크였다면 ruleset 에서도) | 수용 PR 마다 자동 신호 |
| **M-4** | 로컬 실행 격리 — `pleiades_fit` · 새로 쓴 `.env` · 실효 env 검사 · 포트 분리 · **검증 봇 기동**(U97-7) · Garmin·Whooing·MFDS 비움 · **advisor 차단**(fit 없는 경로 · fin PATH shim) | 0 | **즉시** — `DROP DATABASE` 두 개 · `.env` 삭제 · 프로세스 정지 · **검증 봇이 보낸 메시지는 불가**(검증 채팅이라 무해) | 두 앱의 웹·봇이 로컬에서 기동. **첫 목표(U97-4) 달성** |
| **S** | 정기 수용(M-1 이후 반복 · §4-S) | 쓰기 0 · traffic 흔적 | 머지 전 **즉시** · 머지 후 **중간**(revert `-m 1` → revert 의 revert) · 가드 A/B 실패(서비스 force-push) 시 재병합 **중간** · 이력·pack 중복 **편도** · 가드 C 실패(이전 동기화 PR squash) 시 `-s ours` 복구 PR **즉시** | 서비스 dev 를 따라간 `apps/*` |
| **M-5** | notify 통합 — M-5a fit(1a-3 재사용) · M-5b fin(1a-4 · Q27). 참조 `file:../../packages/notify` · **루트 `npm ci` 선행** | 0 | **즉시** — pleiades revert PR. 전환 전 미배포. **수용 충돌 표면이 커진다**(㉓ · 머무는 비용) | `apps/*` 가 서비스와 **의도적으로 갈라진** 첫 지점 |
| **M-6** | Discord(1b) — 검증 Discord 서버 · 스키마 무변경 우선(Q61) | 0 | **즉시** — env · 어댑터 revert. 스키마를 바꾸면 전환 시점에 편도 요소 이월 | 첫 릴리즈(#88) 조건의 절반 |
| ~~전환~~ | pleiades 가 서비스를 대체 | 정의상 서비스 영향 | — | **범위 밖**(Q60) |

### 4-1. M-0 — 문서·룰·도구 (PR B)

| 항목 | 내용 |
|---|---|
| 산출물 | ① §9 체크리스트 전부(상위 문서 정정·소진 블록) ② **격리 불변식**을 `.claude/rules/` 에(신설 파일 또는 `workflow.md` 한 절) — 첫 줄: **"`apps/*` 안의 하네스(CLAUDE.md·rules·skills·agents)는 pleiades 세션에서 효력이 없다 — 충돌 시 pleiades 룰"** ③ `CLAUDE.md` 대상 저장소 절·작업 규칙·하네스 절 ④ **차단 훅**(`.claude/settings.json` · 아래) ⑤ `claudeMdExcludes`(`apps/*/CLAUDE.md`·`apps/*/.claude/**` — CLAUDE.md·rules 만 배제 · 보조) ⑥ **`tools/import/`** — 앱별 callback · 게이트 `gate.py` · 가드 스크립트 · `VERSIONS`(`git-filter-repo==2.47.0` 핀 · `git-filter-repo --version` · `git --version` 출력 · callback 해시) · pleiades 로컬 `bin/` 의 **`claude` shim(exit 1)** · 기동·migrate 헬퍼(실효 env 검사 · §4-6) |
| 훅 | 서비스 저장소 대상 `gh api` 는 **메서드·필드 플래그 없음 또는 `-X GET`** 만(`-f`/`-F`/`--input` 이 있으면 기본 POST) · **`--method`·`-XPOST` 붙여 쓰기 형태도 매칭** · **`gh api graphql` 은 `mutation` 포함 시 거부**(경로 없이 node id 로 쓸 수 있다) · `gh issue\|pr\|release\|label … -R fomalhaut84/myF…` 는 `view`·`list`·`diff`·`checks` 만 · `repos/*` 안 `git` 거부 · `ssh` 거부 · **`apps/*/deploy/**`·`ecosystem.config.js` 실행 거부** · **cwd 가 pleiades 안이면 `git-filter-repo` 거부** |
| 서비스 영향 | 0 |
| 되돌리기 | **즉시** |
| 멈추면 | 방향·규칙·도구만 남는다. 손해 0 |
| 주의 | 훅은 **룰의 대체가 아니다** — 텍스트 매칭이라 우회 경로가 있다. 룰이 정본, 훅은 실수 방지. `claudeMdExcludes` 는 skill·agent 발견을 막지 못한다(U8) |

> **정정 (2026-10-01 · #107).** 주의 칸 *"`claudeMdExcludes` 는 skill·agent 발견을 막지 못한다(U8)"* 는 단정할 근거가 없다 — U8 은 미측정이다(§3 미확인 표). **정본 강도는 §5 I-10 의 *"skill·agent 차단 수단은 미확인"*** 이다: `claudeMdExcludes` 는 CLAUDE.md·rules 를 배제하는 보조로 두고, skill·agent 에 대한 효과는 잰 적이 없다. 되돌리기: 문구 (**즉시**).

### 4-2. M-1 — 가져오기

**공통 규율:**

- **출처는 항상 GitHub https URL.** 로컬 원본 `~/workspace/myF*` 나 worktree `repos/*` 에서 가져오지 않는다(worktree 는 원본과 `.git` 을 공유한다).
- **재작성은 pleiades 밖 스크래치 클론에서만.** filter-repo 는 **현재 디렉터리**를 재작성하고 `--force` 는 fresh-clone 검사도 끈다 — pleiades 에서 돌리면 로컬 이력 재작성·reflog 만료(원격 무사 → **중간** · 미커밋 작업 손실 — [A2] R4).
- **`--no-tags`** — 스크래치 클론과 pleiades 로의 fetch 둘 다. fetch 는 가져온 이력을 가리키는 태그를 자동으로 따라온다(서비스 태그 fin 27 · fit 85).
- **리모트를 등록하지 않는다.**
- PR 은 **"Create a merge commit"**(squash 하면 재작성 이력이 dev 의 조상이 되지 않는다 — 가드 C 가 감지 · U97-11).
- **M-1 PR 은 draft 로 연다**(U97-10 Q65) — 봇 자동 리뷰 회피가 되는지 확인하고, 안 되면 workflow.md 9-3 "봇이 돌지 않을 때" 경로. 9-1 사전 리뷰는 **머지 위생(트리 동일성 · 루트 무변경 · `.github` 비활성 · 게이트·가드 로그) + 8절(pleiades 행)** 으로 한정한다 — diff 는 서비스에서 이미 리뷰·머지된 코드다.
- 머지 후 검증: `git rev-parse HEAD:apps/<app>` == 서비스 dev 원 SHA 의 `^{tree}`(두 앱).

**명령 골격 (앱마다 · `tools/import/` 스크립트가 감싼다):**

```bash
T=<스크래치>                                                  # pleiades 밖
case "$(realpath "$T")/" in "$(realpath ~/workspace/pleiades)"/*) echo "중단: T 가 pleiades 안"; exit 1;; esac
git clone -q --no-tags --single-branch --branch dev https://github.com/fomalhaut84/myFitness.git "$T/fit"
git -C "$T/fit" remote remove origin
SVC=$(git -C "$T/fit" rev-parse dev)                          # 서비스 원 SHA — 트레일러·가드 입력
# 가드 A (수용 때만): 마지막 수용 서비스 SHA 가 새 dev 의 조상인가 — 서비스 force-push 감지 (조상 없음 exit 128 → 중단)
git -C "$T/fit" merge-base --is-ancestor <last-Service-Dev> "$SVC" || { echo 중단; exit 1; }
( cd "$T/fit" && <venv>/bin/git-filter-repo --force --to-subdirectory-filter apps/fitness \
    --message-callback "$(cat <pleiades>/tools/import/msg_fit.py)" )   # 다섯 형식 → 비링크 · @멘션 무해화
# 게이트: 다섯 형식 0 이어야 push — callback 과 별도 구현 · 대소문자 무시 · Python/perl (BSD grep 에 -P 없음)
git -C "$T/fit" log --format=%B dev | tools/import/gate.py     # 0 이 아니면 exit ≠ 0
# pleiades 에서
git fetch --no-tags "$T/fit" dev:refs/import/fit
# 이전 상태는 추적 파일에서 읽는다 — squash 머지에도 파일 내용은 남는다 (PR #98 Codex P1)
PREV_TIP=$(git show origin/dev:tools/import/STATE.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["fit"]["rewritten_tip"])')
# 가드 C (수용 때만): 이전 수용의 재작성 tip 이 origin/dev 의 조상인가 — 이전 동기화 PR 이 squash 머지됐는지 감지
git merge-base --is-ancestor "$PREV_TIP" origin/dev || { echo "중단: 이전 동기화 PR 이 squash 됨(또는 객체 없음) — 복구 PR 먼저"; exit 1; }
# 가드 B (수용 때만): 이전 재작성 tip 이 새 재작성본의 조상인가 — filter-repo·옵션·git 드리프트도 여기서 잡힌다
git merge-base --is-ancestor "$PREV_TIP" refs/import/fit || { echo 중단; exit 1; }
git merge --no-ff [--allow-unrelated-histories  # M-1 최초만] refs/import/fit \
  -m "chore(apps): import/sync myFitness dev" -m "Service-Repo: myFitness" -m "Service-Dev: $SVC" -m "Filter-Repo: <버전> · callback <해시>"
# 상태 갱신 — 같은 PR 의 별도 커밋(squash 돼도 남는다)
#   tools/import/STATE.json["fit"] = {service_dev: $SVC, rewritten_tip: $(git rev-parse refs/import/fit), filter_repo: <버전>, callback_sha: <해시>, git: <git --version>}
git update-ref -d refs/import/fit
```

**상태 파일 `tools/import/STATE.json` (PR #98 Codex P1).** 가드 B·C 의 입력(이전 재작성 tip)을 **머지 이력이 아니라 추적 파일**에서 읽는다. 동기화 PR 이 squash 되면 재작성 tip 은 `dev` 의 조상이 아니고 `refs/import/*`·PR 브랜치도 지워져 있으며 squash 커밋은 트레일러를 보존하지 않는다 — 머지 이력만으로는 가드 C 가 비교할 SHA 를 얻을 수 없고, 살아남은 이전 머지의 tip 을 쓰면 squash 를 **못 보고 통과**한다. 파일 내용은 squash 에서도 남으므로 이 문제가 없다. 최초 M-1 이 파일을 만들고 매 수용이 같은 PR 안에서 갱신한다.

**가드 C 실패 시 복구 (#75 식):** 이전 동기화 PR 이 squash 됐으면 트리는 맞지만 재작성 이력이 dev 의 조상이 아니다. 복구에 쓸 tip 객체는 이미 로컬·원격 어디에도 없을 수 있으므로 **결정적으로 재구성한다**(PR #98 Codex P1): `STATE.json` 의 `service_dev` 로 스크래치 클론을 그 SHA 에 맞추고(`git checkout -B dev <service_dev>`) **같은 버전·callback**(STATE 기록값과 `VERSIONS` 대조)으로 filter-repo 를 다시 돌린다 → 결과 tip 이 `STATE.json` 의 `rewritten_tip` 과 **같아야 한다**(X2 결정성 실측 · 다르면 중단 — 버전·callback 드리프트). 같으면 pleiades 로 fetch 해 새 브랜치에서 **`git merge -s ours --no-ff <rewritten-tip>`**(diff 0) → PR → "Create a merge commit" → 머지 후 부모 2 확인. 되돌리기 **즉시**. 그 뒤 가드 C 를 다시 돌리고 수용을 이어간다. 서비스 dev 가 그 사이 force-push 돼 `service_dev` 객체를 받을 수 없으면 재구성 불가 → 가드 A 실패와 같은 경로(재병합 · 중간).

**치환 규칙 (callback · U97-5 ② · U97-10 Q62):**

| 원 형식 | 예 | 치환 | 비고 |
|---|---|---|---|
| 서비스 이슈/PR URL | `https://github.com/fomalhaut84/myFinance/pull/494` | `fin#494` | 실측 0 · 규칙은 둔다 |
| 기타 GitHub 이슈/PR URL | `https://github.com/<o>/<r>/issues/N` | `<r>#N` | 소유자 제거 |
| 호스트 없는 URL 형식 | `fomalhaut84/myFinance/pull/494` · `www.github.com/…/issues/51` | `fin#494` 류 | 렌더 links=1 · 실측 0 |
| 저장소 한정 | `fomalhaut84/myFinance#494` · `fomalhaut84/pleiades#51` · 대문자 형식 | `fin#494` · `pleiades#51` | **실측 3** · 대소문자 무시 |
| 한정 없는 `#N` | `#82` · `/#383` | `fin#82`/`fit#82` | fin 1,331 · fit 1,945 · **`/#N` fin 3 · fit 3** |
| `GH-N` | `GH-12` · `gh-12` | `fin#12`/`fit#12` | 실측 0 · 대소문자 무관 |
| `@멘션` | `@user` | `@` + 제로폭 문자 | **대가: `@prisma/client` 류 검색이 깨진다** (U97-10 Q62) |

- 치환 순서가 의미를 가진다(URL → 한정 → 한정 없음). 결과는 **소유자를 포함하지 않는다.**
- **게이트 정규식 다섯 개**(대소문자 무시 · callback 과 별도 구현):
  - (i) `[\w.-]+/[\w.-]+#\d+`
  - (ii) `(https?://)?(www\.)?github\.com/[\w.-]+/[\w.-]+/(issues|pull|discussions)/\d+`
  - (iii) `(?<![\w.-])[\w.-]+/[\w.-]+/(issues|pull)/\d+`
  - (iv) `(?<![\w])gh-\d+`
  - (v) `(?<![A-Za-z0-9_])#\d+\b`
- **callback·트레일러·버전은 M-1 전에 고정한다.** 바뀌면 재작성 SHA 가 전부 바뀌어 가드 B 가 실패하고, 전 이력 재병합(**중간**) + 이력 중복(**편도**)이 된다.

**멈추면:** `apps/*` 는 정지 사본이다. 루트 CI 는 `packages/notify` 만 돌고 `security-audit.yml` 의 `paths` 도 `apps/*` 를 보지 않는다. 남는 비용은 저장소 크기 · Grep 잡음 · **중첩 하네스 지연 로드**(I-10)다. 새로 공개되는 내용은 없다(⑥).

### 4-3. M-2 — 설치·검증 (U97-12 · L2)

| | **L2 앱별 lock (채택)** | L1 workspaces + lock 재생성 (불채택) |
|---|---|---|
| 서비스와 버전 동일성 | **동일** | fin 221 · fit 242 다름(⑪) |
| `overrides` | 앱별로 동작 | 하위 무시(⑫) → 19개 루트 병합 · 수동 반영 |
| 수용 시 추가 작업 | 없음(lock 이 함께 온다) | 매번 override·lock 재반영 · 드리프트 재측정 |
| node_modules | 1,545 MB | 1,160 MB |

- **fin 스키마 DB 선행:** fin `next build` 는 prerender 가 Prisma 를 부르므로 **스키마가 적용된 DB 가 있어야 통과한다**(㉑ · 데이터 불필요). M-2 에서 로컬 5432 에 **`pleiades_fin`** 을 만들고 `DATABASE_URL=…/pleiades_fin` 으로 `npx prisma migrate deploy` 를 먼저 한다(헬퍼의 실효 env 검사 통과 후 · §4-5 L-2). fit build 는 더미 DB 로 통과한다.
- **8절 표에 `apps/finance`·`apps/fitness` 행을 추가**한다(명령은 서비스 CI 와 같다). fin 선행: `pleiades_fin` + `npx prisma migrate deploy` · fit 선행: `npx prisma generate`(더미 `DATABASE_URL` 로 충분). **M-5 이후 두 행 모두 선행: 루트 `npm ci`**(㉒).
- Next build 의 *"multiple lockfiles"* 경고는 받아들인다 — `outputFileTracingRoot` 를 넣으려면 `apps/*/next.config` 를 고쳐야 하고 그것은 수용 충돌 후보다.
- workspaces 는 **전환 설계(Q60)** 와 함께 다시 연다. 루트 `workspaces` 미도입은 003 §2-1 정정(ALT-d)과 충돌 없다.

### 4-4. M-3 — CI

| 항목 | 내용 |
|---|---|
| 파일 | **`.github/workflows/apps-ci.yml`**(신설 · 루트 `ci.yml` 과 이름 분리). `apps/*/.github/` 는 옮기지 않는다 |
| job | 앱별 1 job · 서비스 CI 단계 그대로(㉖) · `working-directory: apps/<app>` · `services: postgres:16`(러너 안에서만 존재 — fin build 의 스키마 DB 를 여기서 충족) |
| 트리거 | **워크플로우 수준 `paths` 필터를 쓰지 않는다** — 필터된 워크플로우를 필수 체크로 올리면 트리거되지 않은 PR 이 "Expected" 로 막힌다. 필요하면 job 안에서 변경 경로를 보고 단계를 skip. **M-5 이후 fit job 은 `packages/notify/**` 변경에도 돌고 루트 `npm ci` 를 먼저 한다** |
| secrets | **0** (I-9) |
| fin 테스트 | 서비스 CI 에 없다 → 추가하되 필수로 올리지 않는다(Q57) |
| 필수 체크 | Q52 |
| `security-audit.yml` | `apps/*` lock 은 포함하지 않는다(Q57 권고) |
| 되돌리기 | **즉시** — 파일 삭제 · 필수 체크였다면 ruleset 에서도 제거 |

### 4-5. M-4 — 로컬 실행 격리

003 §10-1 의 10조건에서 서버 전용 조건(3 · 4 · 7)은 소멸하고 나머지는 로컬로 옮겨 온다. **이 표가 로컬 격리 조건의 정본이다.**

| # | 조건 | 수단 | 되돌리기 |
|---|---|---|---|
| **L-1** | DB | 기존 5432 인스턴스에 **`pleiades_fin`(M-2)·`pleiades_fit`** 만(U97-8). 생성·삭제는 그 두 이름만. 다른 DB 에 **`DROP` · `prisma migrate reset` · `prisma db push --force-reset` · `prisma migrate dev`**(공유 인스턴스에 shadow DB 생성·삭제) 금지. 파괴 명령 전 DB 이름을 문자열로 대조 | **즉시** — `DROP DATABASE` 두 개 |
| **L-2** | `.env` · 실효 env | **새로 쓴다.** 복사 금지 3종: ① 원본 `.env` ② worktree `repos/*/.env` ③ `.env.example` 그대로(`myfinance`·`myfitness` 와 4100/4200 을 가리킨다 — ㉔). 템플릿은 루트(`apps/*` 밖) · 스크립트가 `apps/<app>/.env` 로. **`.env` 만으로는 부족하다 — 셸 export 가 이긴다(㉕).** 기동·migrate 헬퍼가 **실효 env 사전 검사**: `DATABASE_URL` 호스트 ∈ {localhost,127.0.0.1,::1} · 포트 5432 · DB 이름 `pleiades_` 접두 · **`env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN` 으로 실행** · **cwd = `apps/<app>`** · **`apps/*/.env.*` 부재 확인** | **즉시** |
| **L-3** | 포트 | `PORT`·`MCP_PORT` 를 4100/4200/4210/4301 **그리고 3000** 과 다르게. fin `mcp-config.json` 은 4210 하드코딩(`MCP_PORT` 무시 — ⑯) · advisor 는 L-7 로 막으므로 이 경로는 쓰이지 않는다 | **즉시** |
| **L-4** | 텔레그램 | **검증 봇 토큰**(사용자 BotFather 발급 · 앱마다 · 서비스와 다른 봇) + **검증 전용 채팅**만 `TELEGRAM_ALLOWED_CHAT_IDS`(fin 은 `ADMIN_CHAT_IDS` 도). 템플릿에 **검증 봇 id(토큰 `:` 앞 숫자 · 공개값) 허용 목록** · 기동 전 **실효 토큰 id 대조(API 호출 없이)** · **두 앱이 서로 다른 봇인지 확인**(같은 토큰 둘이면 로컬끼리 409). 토큰 준비 전에는 비움 | **즉시** · 보낸 메시지는 불가(검증 채팅이라 무해) |
| **L-5** | Garmin | `GARMIN_*` 비움 · cron tick 에러 로그 수용(⑭) · `.garmin-tokens/` 반입 금지 | **즉시** |
| **L-6** | 외부 쓰기 API | fin `WHOOING_WEBHOOK_URL` 비움(설정 UI 로도 넣지 않는다 — 실제 가계부에 기록된다) · fit `MFDS_API_KEY` 비움 | **즉시** |
| **L-7** | AI (advisor) | **`CLAUDE_BIN` 을 비우는 것으로는 막히지 않는다**(⑯). **fit: `CLAUDE_BIN=/nonexistent/claude-disabled`**(비어 있지 않은 없는 경로) · **fin: env 로 끌 수 없음 → 웹·봇을 `claude` 가 없는 PATH(pleiades 로컬 `bin/` 의 exit 1 shim 선행)로 기동 · 기동 스크립트가 `command -v claude` 가 shim 인지 확인 후 시작.** X8 이 "계정 분리" 로 확인되기 전에는 로컬 advisor 를 돌리지 않는다 | **즉시** |
| **L-8** | 인증 | fin `AUTH_SECRET`·`AUTH_PIN` 로컬 값 | **즉시** |
| **L-9** | 봇 프로세스 | L-4 검증 토큰으로 기동(앱의 봇 엔트리 · pm2 불사용). 서비스 토큰이면 409(⑮) — **L-2 실효 env 검사 + L-4 봇 id 허용 목록이 막는다** · L-7 조건(shim · 없는 경로)으로 기동 | **즉시**(프로세스 정지) |

**첫 목표(U97-4) 판정** = M-3 CI 녹색 + L-1~L-9 로 두 앱의 **웹과 봇**이 로컬 기동 + 검증 봇이 검증 채팅에 응답.

### 4-S. 정기 수용 — 서비스 `dev` → pleiades `apps/*`

**서비스 저장소에는 https 읽기만 한다**(U97-6). workflow.md 의 `dev 수용` 행(서비스 저장소 안 머지 PR)을 대체한다.

```bash
# 0. 뒤처짐 판정 (세션 시작 · pleiades-resume Step 2) — 읽기 전용
git ls-remote https://github.com/fomalhaut84/myFinance.git refs/heads/dev
#    ↔ 마지막 수용 머지 트레일러 'Service-Dev: <sha>' (git log --grep '^Service-Repo: myFinance' -1)
# 1. dev 최신화 → chore/<issue>-sync-apps-<YYYYMMDD> → 앱마다 §4-2 골격
#    (스크래치 위치 검사 → 가드 A → 재작성 → 게이트 → fetch → 가드 C → 가드 B → merge)
# 2. 충돌 해결 → 8절(apps 행) → PR base dev → "Create a merge commit" → 머지 후 부모 2 확인
```

| 수용마다 | 내용 |
|---|---|
| lock · overrides | **추가 작업 없음**(L2). M-5 이후 lock 충돌이면 서비스 lock 을 받고(`--theirs`) 앱에서 `npm install` 로 `file:` 1줄을 다시 얹는다 → lock diff 검토 |
| 소스 충돌 | pleiades 가 `apps/*` 를 고친 파일에서만(M-5 이후 · ㉓). **M-4 까지는 무충돌이어야 한다** — 충돌이 나면 규율 위반 신호다 |
| 하네스 | `apps/finance/.claude/` 는 서비스 판이 그대로 온다(무수정 · U97-9) |
| 게이트·가드 | **매번.** 새 메시지도 다섯 형식 0. 가드 A·B 실패 시 **중단·사용자 보고**(자동 복구 금지). 가드 C 실패 시 `-s ours` 복구 PR 먼저 |
| 도구 버전 | `VERSIONS` 와 다르면 가드 B 가 실패한다. git 은 venv 로 고정할 수 없다 → git 드리프트도 가드 B 가 잡는다. **버전을 올리려면 전 이력 재병합(중간) + 이력 중복(편도)** — 올리지 않는 것이 기본 |
| 리뷰 범위 | 충돌 해결분 + 머지 위생(게이트·가드 로그) + 8절. 서비스 유래 코드의 봇 지적은 **pleiades 이슈로만**(U97-9) |
| 되돌리기 | 머지 전 **즉시** · 머지 후 revert `-m 1` → **중간**(revert 의 revert 필요) · 서비스 force-push(가드 A/B 실패) 시 unrelated 재병합 **중간** · 옛/새 이력 공존 **편도** |
| 주기 | Q54b |

### 4-6. M-5 — notify 통합 (1a-3 · 1a-4 를 `apps/*` 안에서)

| 항목 | 내용 |
|---|---|
| 코드 결정 | 1a-3 계획의 D-1~D-4 · U-3 · U-5 **재사용** — 경로만 `apps/fitness`. src 동일 전제(⑰)는 **M-5 직전 수용 0** 으로 다시 세운다 |
| 소스 | **pleiades 에 보존한 패치 `_workspace/1a-3/patch/0002·0003`**(`fd8b7c5` 까지 3커밋 `git format-patch` · 동결 브랜치를 읽기 전용 클론해 추출 · PR #98 Codex P2 — 동결 브랜치를 사용자가 정리(Q54)해도 잃지 않는다) → `git am --directory=apps/fitness`(또는 `git apply`). `0001`(`package.json`·lock — git dep)은 버린다. 동작 실측(㉒ · 442 테스트) |
| 패키지 참조 | **`file:../../packages/notify`** — Q48 소멸 |
| 선행 | **루트 `npm ci`(`prepare` → `packages/notify/dist`)** — 빠지면 연쇄 실패(㉒). ALT-d **위임 키**(`main`·`types`·`exports`·`files`)만 삭제 후보 · **`prepare`(또는 같은 일을 하는 명시 빌드)는 유지** |
| 검증 | fit 발송 6건은 전부 봇 프로세스에서 나간다(1a-3 계획 S-1) → **8절 4종 + CI + 봇 기동(L-9 · 검증 봇) 후 검증 채팅 수신**. β2 소멸 |
| 등급 | **즉시** — 전환 전 배포 경로 없음(1a-3 계획 U-8 의 "이후 중간" 은 전환으로 이월) |
| 이슈 | #95 소진 → M-5a 이슈로 대체하며 닫는다 · #96 흡수 가능 |
| fin(1a-4) | Q27 선결 그대로. 대상 파일이 fin 에서 자주 바뀐다(㉓ — 90일 fin 커밋 17/59) → **착수 직전 수용 0 + 짧은 브랜치 수명** |

멈추면: fit 만 통합돼도 손해 없다 — 서비스는 원래 코드, pleiades `apps/fitness` 만 갈라진다. `packages/notify/` 는 움직이지 않는다(003 §2-1).

### 4-7. M-6 — Discord (1b)

- `DiscordTransport` 를 `packages/notify/` 에 추가(003 §6). 검증 Discord 서버·웹훅은 새로 만든다(서비스에 Discord 가 없다).
- 1b-2 스키마(003 Q12)를 `apps/*/prisma` 에 넣으면 수용 충돌 + 전환 시 편도 마이그레이션 → Q61.
- 되돌리기 **즉시**. 멈추면 첫 릴리즈 조건(#88)의 Discord 절반이 pleiades 안에서 충족된다.

---

## 5. 격리 불변식 — pleiades 가 서비스에 닿을 수 있는 모든 경로

**경계(U97-6): 쓰기 0 · 운영 영향 0 · 관측 흔적(소유자 traffic 통계)만 허용.** 차단 규칙이 없는 행은 없다. M-0 에서 룰로 옮긴다.

| # | 경로 | 어떻게 닿나 | 차단 규칙 | 기계적 보조 | 위반 시 |
|---|---|---|---|---|---|
| **I-1** | 서비스 저장소 쓰기 | push · 브랜치(동결된 `integration/*` 포함) · PR · 이슈 · 코멘트 · 라벨 · 리뷰 · 릴리즈 · graphql mutation | **전부 금지.** `gh api` 는 메서드·필드 플래그 없음 또는 `-X GET` 만 · 그 외 서브커맨드는 읽기 동사만 · graphql `mutation` 금지 · 출처는 https URL 직접 · 리모트 미등록 | 훅 | 알림·이벤트는 편도 |
| **I-2** | GitHub 교차 참조 | 자동 링크 형식(⑲)이 대상 이슈 타임라인에 `referenced`/`mentioned` 이벤트. 가져온 커밋 메시지가 가장 큰 원천(⑱) | pleiades 텍스트의 서비스 참조는 **비링크 `fin#N`·`fit#N`**(U97-9). 가져온 메시지는 치환 + **grep-0 게이트**. 파일 안 참조는 무해 | 게이트 | **편도** |
| **I-3** | 서버 | ssh · pm2 · nginx · β2 `~/pleiades-int` · 서버 DB | **전부 금지.** 서버 잔여물 정리는 사용자 단독 | 훅(`ssh`) | 사용자만 |
| **I-4** | 서비스 텔레그램 봇 토큰 | 409 · `deleteWebhook()` · 서비스 봇 명의 발송 | 서비스 토큰을 어떤 `.env`·secret·명령줄에도 두지 않는다 · `.env` 복사 금지 3종 · 실효 env 검사 · `env -u TELEGRAM_BOT_TOKEN` · 검증 봇 id 허용 목록 · 두 앱 다른 봇(L-2·L-4) | 헬퍼 | **서비스 중단**(사용자 재기동) |
| **I-5** | 텔레그램 수신자 | 실사용 채팅으로 발송 | `ALLOWED/ADMIN_CHAT_IDS` = 검증 채팅만 | — | 편도 |
| **I-6** | Garmin 계정 | fit 웹 기동만으로 싱크 cron(⑭) | `GARMIN_*` 비움 · 토큰 디렉터리 반입 금지 | — | 서비스 재로그인(사용자) |
| **I-7** | 서비스 DB | 서비스 `DATABASE_URL` · 부팅 쓰기 | 서비스 DB 접속 정보를 pleiades 어디에도 두지 않는다 · CI 는 러너 컨테이너 | — | 편도 |
| **I-8** | 외부 API·쿼터 | Whooing(실 가계부) · MFDS · advisor `claude` 계정 공유(X8) · Codex 봇 쿼터 공유(X8) | 비움 · **advisor 차단 = fit 없는 경로 + fin PATH shim**(L-7) · M-1 PR draft(U97-10). X8 이 "같은 계정" 이면 pleiades 세션 자체가 쿼터를 공유한다 — 그때 원칙 적용 범위를 사용자가 정한다 | shim | 쿼터는 시간 경과 · 가계부 편도 |
| **I-9** | GitHub Actions | `deploy.yml` 루트 이동 · `DEPLOY_*`·`TELEGRAM_*` secret | `apps/*/.github/` 를 루트로 옮기지 않는다 · secrets **0 유지** · 세션 시작 때 로컬 `gh api repos/fomalhaut84/pleiades/actions/secrets --jq .total_count` → 0 | 로컬 점검 | 사용자만 |
| **I-10** | 중첩 서비스 하네스 | 추적되는 `apps/finance/**` 파일을 읽는 순간 fin `CLAUDE.md` + rules 가 지연 로드되고 skill·agent 가 발견된다(⑧). 실체는 cwd 기준 명령이 pleiades 를 겨누는 것(I-19) | **룰 한 줄**(효력 없음 · pleiades 우선) + **I-19 훅**이 방어선 · `claudeMdExcludes` 는 CLAUDE.md·rules 만 배제하는 보조(skill·agent 차단 수단은 미확인 — U8) · `apps/*/.claude` 무수정(U97-9) | 룰 · 훅 · 설정 | 즉시(세션) |
| **I-11** | 원본·worktree 의 `.git` | `repos/*` 에서 git 명령 → 원본 `.git` 변경 | 동결 — `repos/*` 에서 git 명령 금지 | 훅 | 로컬 메타데이터 |
| **I-12** | 포트 | 로컬 원본과 충돌 | L-3(3000 포함) | — | 즉시 |
| **I-13** | traffic 흔적 | https `clone`/`fetch`/`ls-remote` 가 소유자 Insights 에 집계 | **허용**(U97-6) · 빈도는 수용 주기(Q54b) | — | — |
| **I-14** | 로컬 5432 공유 | 사용자 개발 DB 와 같은 인스턴스(U97-8) · 잘못된 파괴 명령 · `.env.example` 복사 · 셸 export 우선 | L-1 파괴 명령 목록(`migrate dev` 포함) · L-2 실효 env 검사 | 헬퍼 | 사용자 개발 DB 손상은 **편도**(서비스 운영 영향 0 — 로컬) |
| **I-15** | 서비스 dev force-push · 동기화 PR squash | 서비스 dev 무보호(⑳) · pleiades 는 squash 허용(㉖) | **가드 A·B**(실패 시 중단·보고) · **가드 C**(squash 감지 → `-s ours` 복구 · U97-11) | 가드 스크립트 | 재병합 중간 · 이력 중복 편도 · squash 복구 즉시 |
| **I-16** | 태그 | fetch 태그 자동 추종 → 서비스 태그가 pleiades 로 → `git push origin --tags` 가 원격에 올린다 | **`--no-tags`**(clone·fetch) · 릴리즈는 **`git push origin v<X.Y.Z>`** | — | 원격 태그 삭제(즉시) · 릴리즈 트리거 시 중간 |
| **I-17** | `@멘션` | 가져온 메시지의 `@user`(X13) | **제로폭 무해화**(U97-10) | callback | 알림은 편도 |
| **I-18** | push protection | 가져온 이력의 플레이스홀더가 M-1 push 를 막을 수 있다(X14) | 막히면 **우회하지 않고 사용자에게 보고** — 서비스 영향 없음 | GitHub | — |
| **I-19** | 서비스 배포 스크립트 실행 | `apps/*/deploy/deploy.sh`·`ecosystem.config.js` 는 cwd 기준 — pleiades 에서 실행하면 `git fetch origin --tags` → `git checkout -f`(pleiades 작업트리 파괴) | **실행 금지**(fin 하네스의 `./deploy/deploy.sh dev` 지시 포함) | 훅 | 작업트리 복구(중간) |
| **I-20** | Dependabot | 켜면 pleiades 에 `apps/*` 의존성 PR 이 열린다(갈라짐) | **켜지 않는다**(현재 꺼짐 ㉗) | — | 즉시 |
| **I-21** | pleiades 안 filter-repo | cwd 재작성 · `--force` 가 검사를 끈다 | `(cd "$T/…" && …)` 로만 · 스크립트가 먼저 `realpath "$T"` 가 pleiades 밖인지 검사 | 스크립트 · 훅 | 원격 무사 → **중간**(재클론) · 미커밋 작업 손실 |

> **정정 (2026-10-01 · #107).** I-10 ① *"skill·agent 가 발견된다(⑧)"* → **skill 은 추적 경로에서 발견된다 · agent 는 미측정**(X10 은 agents 미시험 · U8). ② 지연 로드는 `apps/*` 만의 일이 아니다 — **gitignored `repos/*` 파일을 읽어도 `CLAUDE.md`·rules 가 지연 로드된다**(§3 ⑧ 정정 블록). I-10 의 차단 규칙(효력 없음 · 그 지시를 실행하지 않는다)은 `repos/*` 에서 로드된 서비스 하네스에도 그대로 적용된다. 동결 worktree 를 읽을 이유는 M-1 이후 없다 — 서비스 코드는 `apps/*` 에서 읽는다. `.claude/rules/isolation.md` I-10 행을 같은 날 따라 고쳤다. 되돌리기: 문구 (**즉시**).

---

## 6. 판단이 바뀐 것

| 이전 결론 | 어디 | 무엇이 뒤집었나 |
|---|---|---|
| *"단계 4 진입 조건 = 도메인 #3"* + 병렬 관측 지표 | 002 §4 | U97-4. 관측 지표는 관측 전 소진(git dep 소비자가 생기지 않았다) |
| *"단계 4 를 앞당기지 않는 근거 3개"* | 003 §2-3 | ① 배포 재설계·릴리즈 격리 상실 — 이 문서는 배포를 건드리지 않는다 → **전환(Q60)으로 이월**(사라지지 않는다) ② 3방향 전파 — pleiades 안에서만 · 1a-1 테스트 93건이 L3 를 일부 검증 ③ 캘린더 없음 — 사용자가 순서를 바꿨다 |
| *"worktree 는 계단이 아니다 … 승계되는 것은 `integration/pleiades` 의 커밋 이력뿐"* | 004 §2-4 | 그 이력도 승계되지 않는다 — 가져오는 것은 서비스 `dev`(⑰) · worktree 는 동결 |
| *"중첩 `.claude/` skills·agents 미발견"* | 004 §3-2 | **gitignored 조건의 값이었다.** 추적되는 `apps/*` 에서는 CLAUDE.md·rules 지연 로드 + skill 발견(⑧) |
| *"`next build` DB 요구 없음"* | measured-facts 1a-0/1a-2 · CLAUDE.md 2026-09-11 문단 | **fit 한정.** fin 은 스키마 DB 필요(㉑) |
| *"두 `package.json` 의 git URL → 워크스페이스 `"*"` 1줄"* | 003 §2-1 | `file:` 1줄(㉒) · 그 1줄은 수용 충돌 후보 · `prepare` 는 여전히 하중 |
| Q15 · Q28 · Q47 ALT-d · Q48 · Q45 · Q42 · Q44 β2 | 003 | 소비 경로 변경으로 **소진**. ALT-d 는 **위임 키만** 소진 · `prepare` 유지 |
| 1a-3 등급 U-8 | 1a-3 계획 · #95 | 이 문서 범위 안에서 **즉시 고정** |
| 서비스 dev 를 서비스 저장소 안에서 받는다(#70) | workflow.md | pleiades 안에서 · filter-repo 재작성으로(§4-S). 머지 커밋·squash 금지·리뷰 범위는 승계 |
| 이관 이슈는 고치는 저장소에(#83) | workflow.md 5절 | pleiades 에만(U97-9) |
| `bin/claude-with` 대상 = worktree(#80) | CLAUDE.md · 005 | 소진(U97-9) — 방어선은 룰 + 훅 |
| `git subtree` 로 이력 포함(#97 원문) | #97 | U97-5 filter-repo — subtree 는 서비스 한정 참조를 push 로 서비스 타임라인에 남긴다 |

> **정정 (2026-10-01 · #107).** ① *"중첩 `.claude/` skills·agents 미발견"* 행의 *"gitignored 조건의 값이었다"* 는 **skill 에 한해** 맞다 — gitignored 에서도 CLAUDE.md·rules 는 지연 로드되고, agent 는 어느 조건에서도 미측정이다(§3 ⑧ 정정 블록). ② *"`next build` DB 요구 없음"* 행의 출처 *"measured-facts 1a-0/1a-2"* 는 **1a-2 절(§8 E5) U4 한 곳**이다 — 1a-0 절에는 그 문구가 없다. §9-3 의 같은 표기도 같다. CLAUDE.md 2026-09-11 문단은 같은 날 *"fit 한정"* 으로 정정했다. 되돌리기: 문구 (**즉시**).

---

## 7. 남은 미결 질문

번호는 003 Q48 다음을 잇는다. Q49~Q51 · Q53 · Q55~Q56b · Q58 · Q62~Q63 · Q65~Q67 은 §2 에서 확정됐다(Q50 은 filter-repo 로 소진).

| | 질문 | 무엇을 가르는가 | 권고 | 우선 |
|---|---|---|---|---|
| **Q52** | CI 필수 체크 · DB | 수용 PR 머지 차단 여부 | DB = Actions postgres 컨테이너. **서비스 CI 와 같은 단계만 필수** · 워크플로우 `paths` 필터 없이(필요하면 job 안 skip) · fin 테스트 등 추가분은 비필수 | 중간 — M-3 |
| **Q57** | `apps/*` 에서 서비스 결함을 고치나 (CI·봇·감사가 찾은 것) | 갈라짐 · 수용 충돌 | **고치지 않는다** — 수용으로 온다. pleiades CI 를 막으면 해당 체크를 비필수로 두고 pleiades 이슈에 기록. 예외는 M-5 대상 파일 | 중간 — M-3 |
| **Q54** | 동결 산출물 최종 처리 — 서비스 원격 `integration/*` · `repos/*` worktree · 이관 이슈 7건 · 서버 잔여 | pleiades 가 무엇을 정리하나 | **전부 사용자 단독 결정** — pleiades 는 건드리지 않는다. `git worktree remove` 는 원본 `.git` 에 쓰고 worktree 의 ignored 파일(`.env`·`node_modules`)을 지운다(I-11 과 같은 성격). #95 는 M-5a 이슈로 대체하며 닫는다(pleiades 이슈) · #82 는 동결 표기 | 낮음 |
| **Q54b** | 수용 주기 | 갈라짐 누적 · traffic 흔적 빈도 | 세션 시작 판정(`ls-remote`) + **M-5a·M-5b 착수 직전 필수 0** | 낮음 |
| **Q59** | 002 단계 0(통합 어드바이저 · 004 Q23) | 서비스 경로 불가 · 로컬 빈 DB 로는 가치 검증 불가 | **보류** · Q23 은 판정 불요로 소진 | 낮음 |
| **Q60** | 전환(cutover) — 배포 경로 · DB 이전 · 서비스 저장소 보관 · 002 Q2 | 원칙이 풀리는 유일한 지점 · 첫 릴리즈(#88) | **별도 스펙(007 가칭)** — M-6 이후 | 낮음(지금) · **필수(첫 릴리즈 전)** |
| **Q61** | 1b-2 스키마 변경(003 Q12) | 전환 편도 누적 · 수용 충돌 | **전환 설계 전 스키마 무변경**(003 Q12 권고 D-a 와 정합) | 낮음 — M-6 |

> **확정 (2026-10-01 · #120 · M-3 · 사용자 결정 — 둘 다 권고안).**
> **Q52 → 서비스 CI 와 같은 단계만 필수.** `.github/workflows/apps-ci.yml` 의 `apps-fin`·`apps-fit` job(서비스 CI 단계 그대로 · 러너 postgres:16 · secrets 0 · 워크플로우 `paths` 필터 없음)을 dev·main ruleset 필수 체크에 더한다(머지 후 · 사용자 확인 뒤). 서비스 fin CI 에 없는 vitest 는 별 job `apps-fin-test` 로 **비필수**.
> **Q57 → 고치지 않는다.** `apps/*` 의 서비스 결함은 수용으로 고쳐져 온다. pleiades CI 를 막으면 그 체크를 비필수로 내리고 pleiades 이슈에 기록한다. 예외는 M-5 대상 파일. `security-audit.yml` 은 이미 `apps/*` lock 을 포함하지 않는다(무변경).
> 되돌리기: 워크플로우 파일 삭제 · ruleset 에서 체크 제거 — **즉시**.

---

## 8. 제외 사항

| 제외 | 이유 | 언제 다시 |
|---|---|---|
| 전환(cutover) | 원칙과 정의상 충돌 | Q60 · 첫 릴리즈 전 필수 |
| 캘린더 · 도메인 모듈 계약 | U97-4 순서 밖 | M-6 이후 |
| 인바운드 봇 통합(002 Q3) · 단일 DB(Q7) · 단일 웹 UI | 002 §5 | 전환 이후 |
| 서비스 결함 수정 | Q57 | — |
| 동결 산출물의 삭제 | U97-3 · Q54 — 사용자 단독 | — |
| workspaces 도입 | U97-12 | 전환 설계 |
| gitleaks 급 스캔 도구 설치 | X5 | M-1 전 선택 |
| filter-repo 버전 올림 | 가드 B 가 깨진다 · 전 이력 재병합 | 필요가 생기면 별도 결정 |
| 동기화 PR 머지 방식 강제 수단 | U97-11 — 가드 C 로 충분 | 가드 C 가 실제로 실패할 때 |

---

## 9. 상위 문서 개정 목록 — **M-0(PR B) 체크리스트** (삭제 없음)

표기: **소진**(조건이 사라짐 · 원문 유지 + 블록) · **정정**(틀렸거나 바뀐 서술 · 원문 유지 + 블록) · **보류** · **추가** · **신설**. 전부 되돌리기 **즉시**(문서·설정). 괄호 안 숫자는 [A] N16 의 grep 집계다.

### 9-1. 스펙

- [ ] **002** §4 단계 4 진입 조건 · 병렬 관측 지표 — **정정**(U97-4 · 관측 전 소진 · 상세 006)
- [ ] 002 §4 단계 0 · 상태 줄 *"단계 0 실행"* — **보류**(Q59)
- [ ] 002 §4 단계 1 정정 블록의 서버·재시작 서술 — **소진**(배포 경로 범위 밖)
- [ ] **003** §1 Q15 · §1-1 정정들(Q28 · #88) · §10 Q48 — **소진**(소비자 `apps/*` · `file:`)
- [ ] 003 §2-1 · 1a-0 ALT-d — **정정 · 부분 소진**(`file:` 1줄 · **위임 키만 소진 · `prepare` 유지**)
- [ ] 003 §2-2·§2-4 버전 드리프트·관측 지표 — **소진**
- [ ] 003 §2-3 근거 3개 — **정정**(①은 전환으로 이월)
- [ ] 003 §5-2 1a-3·1a-4 행 · §8-1 배포·`npm ci`·`pm2 restart` — **소진**(M-5 · 즉시 고정)
- [ ] 003 §10-1 10조건 · Q42·Q44·Q45 — **소진**(조건 3·4·7) · **정정**(나머지 → 006 §4-5 L-1~L-9 가 정본)
- [ ] 003 Q46 — **정정**(발급 = M-4 · U97-7)
- [ ] **004** 전체(worktree) · §2-4 · §7 · Q23 · Q24 — **소진 · 정정**(worktree 동결 · Q23 소진 · Q24 는 저장소 경로가 바뀌지 않아 계속 유예)
- [ ] **004 §3-2** — **정정**("중첩 `.claude/` 미발견" 은 gitignored 조건 값 · 추적 경로에서는 CLAUDE.md·rules 지연 로드 + skill 발견)
- [ ] **005** §4-5·§4-6(`--add-dir` 운영) · `bin/claude-with` — **소진**(U97-9)
- [ ] 005 *"저장소에 남은 하네스는 자동 로드되지 않는다"* 류 서술 — **정정**(`apps/*` 에서는 지연 로드)

### 9-2. 룰·하네스·설정

- [ ] **격리 불변식 룰** — **신설**(§5 I-1~I-21 · 첫 줄 "`apps/*` 하네스는 효력 없음")
- [ ] **`.claude/settings.json`** — **추가**(§4-1 훅 · `claudeMdExcludes` 는 CLAUDE.md·rules 보조)
- [ ] `workflow.md` 브랜치 전략 대상 저장소 행 · `dev 수용` 행 · 7절 base 표 · 5절 이관 이슈 · 8절 `repos/*` 행 · 10절 대상 저장소 PR 머지 후 — **소진 · 정정**(I-1 · §4-S · U97-9)
- [ ] `workflow.md` 8절 — **추가**: `apps/finance`(선행 `pleiades_fin` + `prisma migrate deploy` · M-5 후 루트 `npm ci`) · `apps/fitness`(선행 `prisma generate` · M-5 후 루트 `npm ci`)
- [ ] `workflow.md` 릴리즈 전략 절 — **정정**(`git push origin --tags` → `git push origin v<X.Y.Z>` · I-16)
- [ ] `workflow.md` 9-0 — **정정**(`apps/**` 변경 — 에이전트 필수 · 수용 PR 은 동기화 PR 리뷰 범위)
- [ ] `.claude/skills/dual-repo-change` · `.claude/agents/dual-repo-operator` — **소진**(승인 게이트 개념만 `apps/*` 변경 규약으로)
- [ ] `.claude/skills/pleiades-resume` Step 2 — **정정**(`ls-remote` ↔ `Service-Dev` 트레일러 · secrets 0 점검 · worktree 드리프트 감지 소진)
- [ ] `.claude/skills/pleiades-handoff` — **정정**(#82 동결)
- [ ] `.claude/skills/pleiades-codex-loop`(15) · `pleiades-orchestrator`(6) · `reversibility-audit`(3) · `repo-measure`(3) · `orphan-check`(1) — **정정**(`repos/*`·대상 저장소·이관 서술 → `apps/*`·pleiades 이슈)
- [ ] `.claude/agents/repo-surveyor`(7) · `reversibility-auditor`(3) — **정정**(측정 대상 = `apps/*` + 서비스 원격 https 읽기 · 스크래치)
- [ ] `bin/claude-with` — **소진**(파일 유지 + 소진 주석 · 또는 삭제는 M-0 에서 결정)
- [ ] `tools/import/` — **신설**(§4-1 ⑥) · `STATE.json` 스키마(가드 B·C 입력 · PR #98 Codex P1) — 파일 자체는 M-1 이 생성
- [ ] `.gitignore` — **정정**(`repos/` 줄은 동결 동안 유지 · `apps/` 는 추적 → Grep 이 `apps/` 를 검색한다는 안내)

### 9-3. 기록·기타

- [ ] **`docs/research/measured-facts.md`** — **추가**([S2] 결과) · **정정**(1a-0/1a-2 *"`next build` DB 요구 없음"* → fit 한정 · 004 §3-2 인용부 · [S2] X2 *"남은 `#N` 0"* → `/#N` fin 3 · fit 3 잔존)
- [ ] `docs/research/claude-code-mechanisms.md`(4) — **정정**(중첩 로드 실측 ⑧)
- [ ] `CLAUDE.md` 대상 저장소 절 · 작업 규칙 · 핵심 전제 4 · 하네스 절(`--add-dir`·`claude-with`·"자동 로드되지 않는다") — **정정** *(상태 1줄 · 문서 지도 006 행은 PR A 에서 완료)*
- [ ] 아티팩트 `docs/artifacts/integration-artifact.html`(18) — **정정**(발행 절차: read → 병합 → 재발행)
- [ ] 이슈 #95 · #96 · #82 · #66 — **소진 · 흡수 · 동결 · 정정**
- [ ] CI `ci.yml` · `security-audit.yml` — **무변경**(`apps-ci.yml` 은 M-3)

---

## 10. 유효기간

| 조건 | 무엇을 다시 여나 |
|---|---|
| 렌더와 커밋 참조 추출이 다르게 동작하는 것이 드러날 때 | U97-5 ② 치환 형식 — 영향은 pleiades 잡음뿐이나 형식을 다시 본다 |
| 가드 A 또는 B 가 처음 실패할 때 | §4-S 수용 절차 · 서비스 쪽 이력 정책(사용자) |
| 가드 C 가 실패할 때 | U97-11 — 머지 방식 강제 수단 재검토 |
| M-4 완료(첫 목표 달성) | M-5 이후 순서 |
| 수용 충돌이 M-4 이전에 발생 | §4-S 무충돌 가정 |
| M-6 완료 또는 전환 논의 | Q60 → 별도 스펙. 그때까지 원칙은 절대다 |
| 서비스 저장소 중 하나가 PRIVATE 으로 바뀔 때 | 수용 출처(https 무인증)가 깨진다 |
| X8 이 "같은 계정" 으로 확인될 때 | I-8 · 원칙 적용 범위(사용자) |
