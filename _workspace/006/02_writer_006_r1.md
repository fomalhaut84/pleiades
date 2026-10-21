# 006 — 모노레포 먼저: 두 서비스를 이력째 pleiades 로 가져오되 서비스에는 닿지 않는다

작성 2026-09-30 · 상태 **초안 1회차 — 감사 전** (`decision-writer` · 이슈 #97)
정본 예정 경로: `docs/specs/006-monorepo-first.md` — **이 파일은 정본이 아니다.** 감사(`reversibility-auditor`) → 사용자 결정 → 정본 순서.
입력: 이슈 #97(사용자 결정 4건 · 원칙 1) · 실측 `_workspace/006/01_surveyor_monorepo.md`(이하 **[S]**) · `docs/research/measured-facts.md` 2026-09-30 모노레포 절 ·
002 §4 · 003 §1-1·§2·§5-2·§10·§10-1 · 004 §2-3·§2-4·§3-2 · 005 §4-5 · `.claude/rules/workflow.md` 브랜치 전략·5·7·8절 · `_workspace/1a-3/`(계획 3회차 · 감사 2회) · 이슈 #82·#88·#95·#96.

> **숫자 규율.** 이 문서의 숫자는 전부 [S] 와 기존 정본의 **인용**이다. 초안 작성 중 직접 확인한 것은 **설정·파일 구조 3건**(pleiades ruleset · 저장소 병합 방식 설정 · 서비스 `ci.yml` 의 `run:` 단계)이고 §3-2 에 명령과 함께 적었다 — 개수·크기·시간은 새로 만들지 않았다.
> 소요 시간은 적지 않는다(005 R2 — 이 저장소에는 실작업 시간 기록이 없다). 없는 값은 **미측정**으로 적는다.

---

## 0. 한 줄 요약

**두 서비스의 `dev` 를 GitHub 에서 읽기만 해서 `apps/{finance,fitness}` 로 이력째 들여오고, 이후에도 읽기만 해서 주기적으로 따라간다. 서비스 저장소·서버·봇·계정·DB 에는 어떤 목적으로도 닿지 않는다.** 첫 목표는 가져온 두 앱이 **pleiades 안에서(CI·로컬)** 서비스와 같은 상태로 도는 것이고, notify(텔레그램) → Discord 는 그 뒤에 pleiades 안에서만 한다. **pleiades 가 서비스를 대체하는 전환(cutover)은 이 문서의 범위 밖**이다(§8).

---

## 1. 무엇이 바뀌었나

### 1-1. 전제가 깨졌다 — 2026-09-30 사용자 결정

> "myFitness, myFinance는 현재 독립적으로 실행하게 두고 플레이아데스에서 테스트가 필요하다면 그건 플레이아데스 내부적으로 테스트를 하는거야. 플레이아데스는 절대 지금 서비스중인 두 서비스를 어떤 목적으로도 영향을 주면 안되."
> — 사용자, 2026-09-30 (이슈 #97)

| # | 이전 전제 | 깨진 방식 | 출처 |
|---|---|---|---|
| **P1** | 단계 4(모노레포)는 **도메인 #3(캘린더)을 붙일 때** 들어간다 (002 §4) | **앞당긴다.** 첫 목표가 "두 앱이 pleiades 에서 도는 것" 이 됐다 | #97 결정 4 |
| **P2** | pleiades 발 변경은 서비스 저장소의 `integration/pleiades` 로 간다 (workflow.md 7절 모드 I · #25) | **서비스 저장소에 쓰지 않는다.** 그 브랜치조차 쓰기다 | #97 원칙 |
| **P3** | 1a 는 **git 의존성**(`git+https://…pleiades.git#<ref>`)으로 서비스 저장소가 패키지를 소비하고, 서버 병행 인스턴스(β2)로 검증한다 (003 Q15 · Q42 · Q44) | 소비자가 **서비스 저장소가 아니라 pleiades 안의 `apps/*`** 가 된다. 서버는 쓰지 않는다 | #97 결정 4 · 원칙 |
| **P4** | 서비스 `dev` 를 따라가는 경로 = 서비스 저장소 안에서 `dev` → `integration/pleiades` 머지 PR (#70) | **서비스 저장소 밖(pleiades)에서** 읽기 전용 fetch 로 받는다 | #97 결정 2 |
| **P5** | 기존 산출물(`integration/pleiades` · `repos/*` · 이관 이슈)이 작업 표면이다 | **동결.** 삭제는 별도 결정 | #97 결정 3 |

### 1-2. 이 문서가 대체하는 것과 대체하지 않는 것

**대체한다:** 002 단계 4 의 진입 조건 · 003 의 배포·소비·검증 경로(git dep · Q48 · β2 · 1a-3/1a-4 의 대상 저장소 절차) · 004 의 worktree 작업 표면 · workflow.md 의 모드 I·`dev 수용` 행 · 이관 이슈 정책(#83).
**대체하지 않는다:** 002 의 목표(개인 비서 플랫폼 · Q1·Q5·Q6) · 003 의 **패키지 설계**(L3 · §4-2 시그니처 · Q10·Q19·Q25·Q26 · 1a-1 산출물) · 003 **1a-3 계획의 코드 결정**(D-1~D-4 · U-3 동작 변경 묶음 · U-5) · 005 의 pleiades 하네스 자체. **001~005 는 하나도 지우지 않는다** — 정정·소진 블록만 붙인다(§9).

---

## 2. 확정된 답 (사용자 · 2026-09-30 · #97)

| | 질문 | 답 |
|---|---|---|
| D-1 | 가져오기 | **이력 포함 (`git subtree`)** → `apps/*` |
| D-2 | 서비스 추종 | **정기 수용** — 서비스 `dev` 를 읽기 전용 fetch → pleiades 안에서 머지. 서비스 저장소에는 쓰지 않는다 |
| D-3 | 기존 작업물 | **동결** — 서비스 저장소 `integration/pleiades` · `repos/*` worktree · 이관 이슈 7건 그대로(삭제는 별도 결정). myFitness#504 닫음 · #95 보류 |
| D-4 | 첫 목표 | **가져온 두 앱이 pleiades 에서 도는 것**(CI lint/typecheck/test/build + 로컬 별도 DB·검증 봇) → 그 다음 notify 통합(텔레그램) → Discord |
| **원칙** | 서비스 영향 | **어떤 목적으로도 0.** 서비스 저장소 쓰기·PR·서버 사용 전부 금지. 테스트는 pleiades 내부(로컬·CI)만 |

> **D-1 은 실측이 흔든다(§3-1 ②·§6 Q49).** "이력 포함" 의 목적이 `log`/`blame` 이라면 `git subtree` 는 그 목적을 경로 단위로 달성하지 못한다([S] §3). 결정을 뒤집자는 것이 아니라 **같은 결정 안의 방법 선택**을 다시 묻는다.

---

## 3. 실측 근거

### 3-1. [S] 에서 이 문서가 쓰는 값 (인용만 · 대장)

| # | 값 | [S] |
|---|---|---|
| ① | 가져오기 후 pack **1.1 → 11.81~12.15 MiB**(이력 포함) · **8.80 MiB**(`--squash`) · 커밋 48 → 820(add) → 822(pull 2) · squash 는 56 | §3 |
| ② | **이력 포함인데 경로 이력은 끊긴다** — `git log -- apps/finance/package.json` **1**(서비스 `-- package.json` **19**) · `--follow` **0** · `blame` **1** 커밋(서비스 **16**). `filter-repo --to-subdirectory-filter` 대안은 **미실험** | §3 |
| ③ | `HEAD:apps/<a>` == 서비스 `dev^{tree}` **YES ×2** · 루트 충돌 **0**(루트 항목 12 → 13) | §3 |
| ④ | `subtree add` 를 **GitHub https URL 직접**으로 — 리모트 등록 불필요 · 자격 증명 불필요(`git remote -v` 0줄) | §3 |
| ⑤ | `subtree pull` = 2-parent 머지 · 서비스 dev SHA 가 조상이 된다 · 충돌은 일반 merge 와 같다(`UU` 재현) | §3 |
| ⑥ | 이력 비밀값(정규식 12종) **0 / 0** · `.env` 커밋 이력 0 / 0 · 세 저장소 모두 **PUBLIC** — 새로 공개되는 이력 없음. 한계: 엔트로피 검사 없음 · 도달 가능 객체만 | §2 |
| ⑦ | `apps/*/.github/` 는 **동작 0** · 루트로 올리면 이름 충돌 **2**(`ci.yml`·`security-audit.yml`) · `deploy.yml` 트리거 `release: published` + `workflow_dispatch` · pleiades Actions secrets **0** | §4 |
| ⑧ | fin `.claude/` **tracked 16 + `CLAUDE.md`** 가 `apps/finance/` 로 들어온다 · fit 은 **0**(`apps/fitness/.gitignore` 가 계속 ignore) | §4 |
| ⑨ | 주버전 충돌 **3**: `next` 15↔16 · `eslint` 8↔9 · `eslint-config-next` 15↔16 · `overrides` fin **3** · fit **16** | §5 |
| ⑩ | 앱별 `npm ci` node_modules 합 **1,545 MB** · workspaces `npm install`(lock 새로 생성) **1,160 MB** · 937 패키지 | §5 |
| ⑪ | **workspaces lock 을 새로 만들면 서비스 lock 과 갈라진다** — fin **221**(직접 의존 21) · fit **242**(직접 의존 22) · 시드 병합은 **미측정** | §5 |
| ⑫ | **npm 은 workspace 하위 `overrides` 를 무시한다** — fit `deepmerge-ts ^8.0.2` override 가 있는데 7.1.5 로 해석 · 보안 override **19**(3+16)를 루트로 합쳐야 하고 `"$esbuild"` 류 `$` 참조는 뜻이 바뀐다 | §5 |
| ⑬ | EBADENGINE 7(`>=20.19.0`) — 로컬 node 20.18.0 만 해당 · 서버 24.12.0 무관 | §5 · measured-facts Q45 절 |
| ⑭ | **fit 웹은 기동만으로 Garmin 싱크 cron 을 등록한다**(`instrumentation.ts` → `startCronJobs()`) + sweeper 2 · fin 웹은 cron 0(`instrumentation.ts` 빈 함수) · `SYNC_CRON` 은 끄는 env 가 아니다 | §6 |
| ⑮ | **서비스 봇 토큰으로 두 번째 long polling 을 하면 Telegram 이 `getUpdates` 409 로 서비스 봇 수신을 끊는다** — 문서화된 동작 · **서비스 영향이라 실측하지 않음** | §6 |
| ⑯ | 외부 계정 env: fin `WHOOING_WEBHOOK_URL` · fit **`GARMIN_EMAIL`·`GARMIN_PASSWORD`** · `MFDS_API_KEY` · AI 는 `claude -p`/`CLAUDE_BIN` | §6 |
| ⑰ | `integration/pleiades` 와 서비스 `dev` 의 `src/`·테스트·`package.json` 차이 **0 / 0** — 차이는 하네스뿐(fin 10 · fit 19 + `.gitignore`). **1a-2 는 이미 서비스 dev 에 있다.** 1a-3 = fit `fd8b7c5`(10 파일 · `src/` 8 재사용 가능 · `package.json`/lock 2 폐기 대상) | §7 |

### 3-2. 이 초안이 직접 확인한 설정 3건 (숫자 아님 · 감사 재확인 요청)

| 항목 | 값 | 명령 |
|---|---|---|
| pleiades `dev` ruleset | **`non_fast_forward` 차단**(force-push 불가) · `deletion` 차단 · PR 필수 · `allowed_merge_methods: [merge, squash, rebase]` · 필수 체크 `verify (20.x)`·`verify (24.x)` | `gh api repos/fomalhaut84/pleiades/rules/branches/dev` |
| pleiades 저장소 병합 설정 | `allow_merge_commit: true` — **수용 PR 을 머지 커밋으로 머지할 수 있다** | `gh api repos/fomalhaut84/pleiades --jq '{allow_merge_commit,…}'` |
| 서비스 CI 의 DB·단계 | 둘 다 `services: postgres`(`postgres:16`) · `DATABASE_URL=postgresql://ci:ci@localhost:5432/<app>_ci` · `npm ci → prisma generate → prisma migrate deploy → lint → tsc --noEmit → (fit 만 npm test) → build`. **fin CI 에는 테스트 단계가 없다** | `/usr/bin/grep -n -E 'services:\|postgres\|DATABASE_URL\|run:' repos/<r>/.github/workflows/ci.yml` (worktree 파일 **읽기만** · `.github` 는 dev↔int 차이 0 — [S] §7) |

### 3-3. 미측정 — 이 문서의 결정을 막는 것

[S] 의 미측정 목록에 **이 초안이 새로 필요로 하는 셋(★)** 을 더한다. ★는 M-1 선결 측정(§4 M-1p)이다.

| # | 항목 | 무엇을 가르나 | 측정 방법 (서비스 무접촉) |
|---|---|---|---|
| **★X1** | **서비스 `dev` 커밋 메시지 안의 GitHub 참조** — 닫기 키워드(`close[sd]?`·`fix(e[sd])?`·`resolve[sd]?` + `#N`) 건수와 그 `N` ∩ **pleiades 열린 이슈 번호**, 그리고 저장소 한정 참조(`fomalhaut84/<repo>#N`) 건수 | **가져오기 PR 을 pleiades `dev` 에 머지하는 순간 pleiades 이슈가 닫히거나 타임라인에 참조 이벤트가 박힐 수 있다**(GitHub 은 기본 브랜치에 들어온 커밋 메시지의 닫기 키워드를 실행하고, `#N` 을 **같은 저장소**의 이슈로 해석한다). 한정 참조가 서비스 저장소를 가리키면 **서비스 저장소 이슈 타임라인에 이벤트가 생긴다** — 원칙 위반 후보. Q49 의 방법 선택이 여기에 걸린다 | 스크래치 bare 클론에서 `git log dev --format=%B \| grep -ciE '\b(close[sd]?\|fix(e[sd])?\|resolve[sd]?) #[0-9]+'` 류 + `gh issue list -R fomalhaut84/pleiades --state open --json number` 교집합. GitHub 쪽 이벤트 생성 여부는 **버려도 되는 별도 테스트 저장소**에서 재현 |
| **★X2** | `git filter-repo --to-subdirectory-filter` + 메시지 재작성의 **결정성** — 같은 입력을 두 번 재작성하면 SHA 가 같은가 · 재작성한 새 `dev` 를 기존 재작성 결과 위에 **일반 `git merge`** 로 받을 수 있는가 · `filter-repo` 설치 여부 | Q49 (c) 가 성립하는지. 결정적이면 매 수용은 "재작성 → merge" 이고 공통 조상이 유지된다. 아니면 (c) 는 수용마다 전체 이력 재충돌 — 탈락 | 스크래치 클론 2벌에 같은 명령 → `git rev-parse` 비교 · 한 커밋 앞 dev 로 재작성·병합 후 최신 dev 재작성·병합 |
| **★X3** | `apps/*` 경로에서 두 앱의 **8절 4종**(lint · typecheck · test · build) 통과 여부 — 앱별 `npm ci`(Q51 L2) 기준 · fit 은 `npx prisma generate` 선행 · 테스트가 DB 를 요구하는가 | M-2 의 완료 판정 그 자체. [S] 는 설치만 했다(`--ignore-scripts`) | 스크래치 모노 클론에서 앱별 `npm ci` → 4종 · DB 가 필요하면 로컬 postgres 빈 DB |
| X4 | 서비스 lock 2개를 시드로 한 단일 workspaces lock (드리프트 0 가능성) | Q51 L3 | [S] 미측정 그대로 |
| X5 | gitleaks 급 스캔 | ⑥ 의 한계 해소 | 도구 설치(사용자 결정) |
| X6 | Telegram 409 · Garmin 동시 세션의 실제 영향 | — | **측정 자체가 서비스 영향 — 영구 미측정.** 문서화된 동작을 근거로 차단 규칙만 둔다(§5) |
| X7 | 서비스 `dev` 에서 **1a-3 이 지우거나 바꾸는 파일**(fit `send.ts`·호출부 4 · fin 1a-4 대상)이 얼마나 자주 바뀌나 | M-5 이후 수용마다 충돌 비용 | 스크래치 bare 클론 `git log --oneline dev -- <paths> \| wc -l` |
| X8 | 서버의 `claude -p` 와 사용자 로컬 Claude Code 가 **같은 계정·쿼터**인가 · Codex 봇 쿼터가 저장소 간 공유인가 | 로컬 advisor 실행 · 대형 PR 봇 리뷰가 서비스 쪽 쿼터를 깎는지(§5 I-8) | 사용자 확인(계정 설정) — 서버 접속 불필요 |
| X9 | 로컬에 postgres 가 있는가 · 원본 `~/workspace/myF*` 에 `.env` 가 있는가(있다면 그 파일은 **복사 금지 대상**) | M-4 준비 | `ls` 수준 (내용은 읽지 않는다) |
| X10 | 중첩 `apps/finance/CLAUDE.md` 가 pleiades 세션에서 **파일을 읽을 때 지연 로드되는가** | fin 의 서비스 워크플로우 지시(서비스 `dev` 로 PR · 릴리즈·배포)가 pleiades 세션에 섞이는지(§5 I-10) | 004 §3-2 는 skills·agents 만 쟀다. 스크래치 세션에서 확인 |

---

## 4. 경로 — 단계 사다리

**각 단계의 완료 상태가 그대로 멈춤 지점이다.** "멈추면 남는 것" 열이 손해 0 을 주장하는 근거이고, 감사는 그 열을 반증해야 한다.
**서비스 접촉 열은 모든 단계에서 "0"이어야 한다** — 0 이 아닌 단계는 설계 결함이다.

### 4-0. 한 장 요약

| 단계 | 내용 | 서비스 접촉 | 되돌리기 (등급 · 행위 · 시점) | 멈추면 남는 것 |
|---|---|---|---|---|
| **M-0** | 006 정본 + 상위 문서 정정·소진 블록(§9) + **격리 불변식 룰**(§5) + (선택) 차단 훅 | 0 | **즉시** — 문서·룰 revert PR. 언제든 | 방향 기록 · 격리 규칙. 코드 무변경 |
| **M-1p** | 선결 측정 ★X1·★X2·★X3 (스크래치만) | 0 (GitHub https 읽기 · 테스트 저장소는 버리는 별도 저장소) | **즉시** — 스크래치 삭제 · 테스트 저장소 삭제 | measured-facts 추가분. Q49·Q51 을 답할 근거 |
| **M-1** | 가져오기 — `apps/finance` · `apps/fitness` (방법은 Q49) | 0 (https 읽기 전용 fetch) | **push 전: 즉시**(로컬 브랜치 삭제) · **PR push 후 머지 전: 트리는 즉시(PR 닫기)이나 객체·참조 이벤트는 편도**(GitHub 이 PR ref 로 객체를 보존 · 타임라인 이벤트 삭제 불가 — ★X1) · **머지 후: 트리는 즉시**(revert PR `-m 1`) · **이력·pack 은 편도**(ruleset 이 force-push 차단 · §3-2) · 재도입은 revert 의 revert 필요 → **중간** | `apps/*` = 서비스 dev 트리의 정지 사본. 설치·CI 없음 → 아무것도 돌지 않는다. 수용 의무도 없다(안 따라가면 낡을 뿐) |
| **M-2** | 설치·검증 — 앱별 lock 유지(Q51 L2 권고) · 두 앱 8절 4종 로컬 통과 · 헬퍼 스크립트(루트 · `apps/*` 밖) | 0 | **즉시** — 스크립트·문서 삭제. `apps/*` 는 무변경(L2) | "pleiades 안에서 서비스와 **같은 lock** 으로 빌드·테스트된다" 는 사실 |
| **M-3** | CI — `apps-ci.yml`(이름 충돌 회피) · 앱별 job · postgres 서비스 컨테이너 · **secrets 0** | 0 | **즉시** — 워크플로우 파일 삭제(필수 체크로 올렸다면 ruleset 에서도 제거) | 수용 PR 마다 두 앱이 깨지지 않았다는 자동 신호 |
| **M-4** | 로컬 실행 격리 — 로컬 별도 DB · 새로 쓴 `.env`(복사 금지) · 포트 분리 · 텔레그램 비움 또는 **검증 봇**(Q53) · Garmin·Whooing·MFDS 비움 · `CLAUDE_BIN` 비움 | 0 (불변식 I-3~I-8 이 그 근거) | **즉시** — `DROP DATABASE` · `.env` 삭제 · **검증 봇이 이미 보낸 메시지는 불가**(검증 채팅이면 무해) | 두 앱이 로컬에서 기동되는 절차. 첫 목표(D-4) **달성** |
| **S** | **정기 수용** (M-1 이후 반복 · §4-S) | 0 (https 읽기) | 수용 PR 머지 전 **즉시** · 머지 후 **중간**(revert `-m 1` → 다음 수용 때 revert 의 revert) | 서비스 dev 를 따라간 `apps/*` |
| **M-5** | notify 통합 — M-5a fit(1a-3 재사용) · M-5b fin(1a-4 · Q27). 참조는 `file:`/workspace(Q48 소멸) | 0 | **즉시** — pleiades revert PR. **전환 전까지 배포되지 않으므로 003 의 "이후 중간" 조건이 오지 않는다.** 대신 **수용 충돌 표면이 커진다**(되돌리기가 아니라 머무는 비용 — X7) | `apps/*` 가 서비스와 **의도적으로 갈라진** 첫 지점. 서비스는 그대로 |
| **M-6** | Discord(1b) — `DiscordTransport` · 검증 Discord 서버 · DB 무변경 우선(Q61) | 0 | **즉시** — env · 어댑터 revert. **1b-2 가 `apps/*/prisma` 에 마이그레이션을 넣으면** 로컬 DB 는 즉시지만 **전환 시점에 서비스 DB 마이그레이션이 편도 요소로 이월**된다 | 첫 릴리즈(#88) 조건의 절반("Discord 통합 알림 어느 정도") |
| ~~전환~~ | pleiades 가 서비스를 대체 | **정의상 서비스 접촉** | — | **이 문서 범위 밖**(§8 · Q60) |

### 4-1. M-0 — 문서·룰 개정

| 항목 | 내용 |
|---|---|
| 산출물 | ① `docs/specs/006-monorepo-first.md` ② 상위 문서 정정·소진 블록(§9 표 전부) ③ **격리 불변식**을 `.claude/rules/` 에 — 신설 파일(`isolation.md` 가칭)로 둘지 `workflow.md` 한 절로 둘지는 형식 문제 ④ `CLAUDE.md` 상태·대상 저장소 절·작업 규칙 ⑤ (선택 · Q56b) `PreToolUse` 훅 — `gh … -R fomalhaut84/myF…` 의 쓰기 동사(`create`·`comment`·`close`·`edit`·`merge`·`review`) · `repos/*` 안 `git push`/`fetch` · `ssh` 를 **거부** |
| 선결 | 이 초안의 감사 · 사용자 결정(§6 중 M-0 에 걸리는 것: Q55·Q56·Q58) |
| 서비스 접촉 | 0 |
| 되돌리기 | **즉시** — revert PR. 훅은 설정 1블록 삭제 |
| 멈추면 | 방향과 규칙만 남는다. **동결 산출물은 그대로 동결**이고 아무것도 가져오지 않았다. 손해 0 |
| 주의 | 훅은 **룰의 대체가 아니다** — 텍스트 매칭이라 우회 경로(다른 셸 · API 직접 호출)가 있다. 룰이 정본, 훅은 실수 방지 |

### 4-2. M-1p — 선결 측정 (스크래치만)

★X1·★X2·★X3(§3-3). `repo-surveyor` 가 [S] 와 같은 스크래치 규율(`git clone --bare https://…` 새로 받기 · `origin` 제거 · push 0 · 원본·worktree 열지 않음)로 잰다.
**★X1 의 GitHub 쪽 재현은 서비스와 무관한 버려도 되는 테스트 저장소**에서 한다 — 그 저장소를 만드는 것은 사용자 계정 쓰기이므로 **사용자 승인 항목**이다(서비스 영향은 0).
되돌리기 **즉시**. 멈추면 measured-facts 가 늘 뿐이다.

### 4-3. M-1 — 가져오기

**Q49 의 답에 따라 명령이 갈린다.** 공통 규율:

- **출처는 항상 GitHub https URL** — 로컬 원본 `~/workspace/myF*` 나 worktree `repos/*` 에서 가져오지 않는다. worktree 는 원본과 `.git` 을 공유하므로 거기서 `fetch` 하면 **사용자의 서비스 개발 체크아웃 메타데이터가 바뀐다**([S] 가 같은 이유로 피했다).
- **리모트를 등록하지 않는다**([S] §3 ④ — URL 직접이면 `git remote -v` 0줄). 등록하면 `git push <remote>` 실수 경로가 생긴다.
- 브랜치 `feat/<issue>-import-apps` → PR base `dev` → **"Create a merge commit"**(squash 금지 — #75 교훈과 같은 이유: squash 면 서비스 커밋이 조상이 되지 않아 다음 수용이 전 이력을 다시 병합하려 한다). 병합 방식은 허용돼 있다(§3-2).
- 머지 후 검증: `git rev-parse HEAD:apps/finance` == 가져온 서비스 dev 의 `^{tree}` (두 앱) — [S] §3 ③ 과 같은 판정.

| Q49 | 명령 골격 | 경로 이력 | ★X1 위험 | 수용 절차 |
|---|---|---|---|---|
| **(a) subtree 이력 포함** (D-1 문자 그대로) | `git subtree add --prefix=apps/finance https://github.com/fomalhaut84/myFinance.git dev` (fit 동일) | **끊긴다**(②) — 옛 경로로만 읽힌다(Q50) | 메시지 그대로 들어온다 → **★X1 이 0 이어야** 안전 | `git subtree pull …` 1줄 |
| **(b) subtree `--squash`** | 위 + `--squash` | **없다**(이력 미포함 — D-1 과 어긋남) | 없음(squash 메시지만) | `git subtree pull --squash …` 1줄 |
| **(c) filter-repo 재작성 + 일반 merge** | 스크래치 클론에서 `git filter-repo --to-subdirectory-filter apps/finance` + 메시지의 `#N` → `fomalhaut84/myFinance#N` 을 **코드 스팬으로** 재작성 → pleiades 에서 `git merge --allow-unrelated-histories` | **이어진다** — `log`·`blame` 이 `apps/finance/…` 로 그대로 동작 | 재작성으로 제거 | 매 수용마다 **서비스 dev 전체 재작성 → merge**. ★X2(결정성)가 성립해야만 가능 |

되돌리기(공통): **push 전 즉시 · PR push 후 객체·이벤트 편도 · 머지 후 트리 즉시 / 이력 편도 · 재도입 중간**(4-0 표). (a)(c) 는 pack 이 ① 만큼, (b) 는 8.80 MiB 까지 커진다 — **세 저장소 모두 이미 PUBLIC 이라 새로 공개되는 내용은 없다**(⑥).

**멈추면:** `apps/*` 는 정지 사본이다. 루트 CI 는 `packages/notify` 만 돌고(`ci.yml` 은 `apps/*` 를 모른다) `security-audit.yml` 의 `paths` 도 `apps/*` 를 보지 않는다 — **아무것도 새로 돌지 않는다.** 남는 비용은 저장소 크기와 Grep 결과 잡음(`apps/` 는 gitignored 가 아니다)뿐이다.

**M-1 PR 의 리뷰:** diff 는 **서비스에서 이미 리뷰·머지된 코드 전체**다. 9-1 사전 리뷰는 workflow.md 동기화 PR 규정과 같게 **머지 위생(트리 동일성 · 루트 무변경 · `.github` 비활성) + 8절(pleiades 행)** 으로 한정한다. 봇 자동 리뷰가 이 규모의 PR 에서 무엇을 하는지·쿼터를 얼마나 쓰는지는 **미측정**(X8) — 감사 대상.

### 4-4. M-2 — 설치·검증

**Q51 권고 = L2(앱별 lock 유지 · workspaces 없음).** 근거는 §5 이후가 아니라 여기서 닫는다:

| | **L2 앱별 lock** (권고) | L1 workspaces + lock 재생성 | L3 workspaces + 서비스 lock 시드 병합 |
|---|---|---|---|
| 서비스와 버전 동일성 | **동일**(서비스 lock 그대로 `npm ci`) | **fin 221 · fit 242 다름**(⑪) — pleiades 에서 통과해도 서비스 버전의 통과가 아니다 | **미측정**(X4) |
| `overrides` | **앱별로 동작**(각 앱이 설치 루트) | **하위 무시**(⑫) → 19개 루트 병합 · `$` 참조 의미 변경 · 서비스가 override 를 바꿀 때마다 수동 반영 | L1 과 같다 |
| 주버전 충돌 ⑨ | 해당 없음(설치가 분리) | fin 이 루트 호이스팅 · fit next 16 중첩 · `react` 한 벌 | L1 과 같다 |
| node_modules | 1,545 MB | 1,160 MB | 미측정 |
| `apps/*` 변경 | **0** | 0(루트만) — 단 `apps/*/package-lock.json` 은 트리에 남되 무시된다 | 0 |
| 수용 시 추가 작업 | **없음**(lock 이 subtree 로 함께 온다) | 매번 앱 `package.json`·override 변화 추출 → 루트 반영 → 루트 lock 재생성 → 드리프트 재측정 | 매번 시드 재병합 |
| notify 참조(M-5) | 앱 `package.json` 에 `"@pleiades/notify": "file:../../packages/notify"` 1줄 + 앱 lock 갱신 → **`apps/*` 변경 = 수용 충돌 후보** | 루트 workspaces 로 해석 · 앱 `package.json` 1줄은 여전히 필요 | L1 과 같다 |
| 되돌리기 | **즉시** — 추가 파일 삭제 | **즉시**(루트 `package.json`·lock revert) · M-5 가 workspace 해석에 기대면 **중간** | 즉시 → 중간 |

- **첫 목표(D-4)는 "서비스와 같은 것이 pleiades 에서 돈다"** 이므로 버전 동일성이 설치 크기(⑩ 의 두 값 차이)보다 앞선다. workspaces 의 이득(lock 1개 · 호이스팅)은 **두 앱이 서비스에서 떨어져 나오는 전환 시점**에 의미가 생긴다 → Q51 은 전환 설계(Q60)와 함께 다시 연다.
- L2 는 루트 `workspaces` 를 계속 넣지 않는다 — 003 §2-1 정정(ALT-d · `workspaces` 미도입)과도 충돌이 없다. 다만 그 결정의 근거(*"소비자 `npm ci` 가 무거워진다"*)는 git dep 소비자가 사라지면서 **소진**된다(§9).
- 헬퍼: 루트 `package.json` 에 `apps:fin:verify` 류 스크립트를 넣거나 `scripts/apps-verify.sh` 를 둔다 — **`apps/*` 밖**. 8절 표에 `apps/finance`·`apps/fitness` 행을 추가(서비스 CI 와 같은 명령 · fit 은 `npx prisma generate` 선행 · `DATABASE_URL` 은 로컬 빈 DB 또는 더미 — ★X3 결과에 따라).
- 로컬 node 20.18.0 < 20.19 는 경고만(⑬) — CI 는 20.x 최신이므로 무관. 로컬 node 올림은 선택.

### 4-5. M-3 — CI

| 항목 | 내용 |
|---|---|
| 파일 | **`.github/workflows/apps-ci.yml`**(신설 · 루트 `ci.yml` 과 이름 분리 — ⑦ 의 충돌 회피). 서비스 `apps/*/.github/` 는 **옮기지 않는다** |
| job | 앱별 1 job(`fin`·`fit`) · **서비스 CI 단계를 그대로**(§3-2: `npm ci → prisma generate → prisma migrate deploy → lint → tsc → (fit test) → build`) · `working-directory: apps/<app>` · `services: postgres:16` 컨테이너(서비스 CI 와 같은 형태 · 러너 안에서만 존재) |
| 트리거 | PR·push `dev` · `paths: apps/<app>/**` 필터(앱별) |
| **secrets** | **0 — 넣지 않는다.** `DEPLOY_*`·`TELEGRAM_*` 이름의 secret 을 pleiades 에 만들지 않는다(I-9) |
| fin 테스트 | 서비스 CI 에 없다(§3-2). **추가하되 필수 체크로 올리지 않는다** — 서비스에서 한 번도 CI 로 돌지 않은 테스트라 실패하면 그것은 서비스 결함이고 pleiades 가 고치지 않는다(Q57) |
| 필수 체크 | Q52. 권고: 서비스 CI 와 **같은 단계만** 필수 · 추가분은 비필수 |
| `security-audit.yml` | `apps/*` lock 을 포함할지 — 포함하면 서비스 의존성 취약점이 **pleiades 이슈**로 열린다. pleiades 는 그것을 `apps/*` 에서 고치지 않는다(수용으로 온다 · Q57). 권고: 포함하지 않는다 |
| 되돌리기 | **즉시** — 파일 삭제 · 필수 체크였다면 ruleset 에서도 제거(`ci.yml` 헤더 주석이 이미 경고하는 절차) |
| 멈추면 | 로컬 절차 없이도 수용 PR 이 두 앱을 깨지 않았다는 신호가 남는다 |

### 4-6. M-4 — 로컬 실행 격리

§5 불변식의 **로컬 실행 부분**을 절차로 만든 것이다. 003 §10-1 의 10조건(서버 병행 인스턴스용)에서 **서버 전용 조건(3 pm2 포트 인자 · 4 pm2 이름·cwd · 7 Nginx)은 소멸**하고, 나머지는 로컬로 옮겨 온다.

| # | 조건 | 수단 | 되돌리기 |
|---|---|---|---|
| L-1 | DB | 로컬 postgres 에 **앱별 빈 DB**(이름 예 `pleiades_fin`·`pleiades_fit`) · `prisma migrate deploy` · **서비스 `DATABASE_URL` 금지**. fit 웹은 기동만으로 이 DB 에 쓴다(003 §10-1 (c)) — 로컬 DB 라 무해 | **즉시** — `DROP DATABASE` |
| L-2 | `.env` | **새로 쓴다.** 원본 `~/workspace/myF*/.env` 를 복사하지 않는다(X9 — 있다면 서비스 토큰이 들어 있을 수 있다). 템플릿은 루트(`apps/*` 밖)에 두고 스크립트가 `apps/<app>/.env` 로 떨군다(앱 `.gitignore` 가 `.env` 를 ignore — [S] §4) | **즉시** |
| L-3 | 포트 | `PORT`·`MCP_PORT` 를 4100/4200/4210/4301 과 다르게 | **즉시** |
| L-4 | 텔레그램 | 기본 **`TELEGRAM_BOT_TOKEN` 비움**(전송 자체 없음 — 003 Q46 근거의 fail-safe). 발송을 봐야 하면 **검증 전용 봇 토큰 + 검증 전용 채팅**(Q53) | **즉시**(env) · 검증 봇이 보낸 메시지는 불가(검증 채팅이라 무해) |
| L-5 | Garmin | **`GARMIN_EMAIL`·`GARMIN_PASSWORD` 비움.** cron 은 등록되고 tick 마다 에러 로그(⑭ · `client.ts:19` throw) — 끌 env 가 없다. 로그 잡음은 수용한다. **`.garmin-tokens/` 를 서버·원본에서 가져오지 않는다** | **즉시** |
| L-6 | 외부 쓰기 API | fin **`WHOOING_WEBHOOK_URL` 비움**(설정 UI 로도 넣지 않는다 — 실제 가계부에 기록된다) · fit **`MFDS_API_KEY` 비움**(쿼터 공유 여부 미측정 — 비우는 쪽이 안전) | **즉시** |
| L-7 | AI | **`CLAUDE_BIN` 비움**(또는 존재하지 않는 경로) — X8 이 "계정 분리" 로 확인되기 전에는 로컬 advisor 를 돌리지 않는다 | **즉시** |
| L-8 | 인증 | fin `AUTH_SECRET`·`AUTH_PIN` 로컬 값 | **즉시** |
| L-9 | 봇 프로세스 | 기본은 **기동하지 않는다**. 기동은 L-4 검증 토큰이 있을 때만 — 서비스 토큰이면 409(⑮) | **즉시** |

- **첫 목표(D-4) 판정** = M-3 CI 녹색 + L-1~L-9 로 두 앱의 웹이 로컬 기동. **봇 기동은 D-4 에 포함하지 않는다**(Q53 이 답하기 전까지).
- 멈추면: 로컬에서 두 앱을 띄우는 절차. 서비스 무접촉.

### 4-S. 정기 수용 — 서비스 `dev` → pleiades `apps/*`

**서비스 저장소에는 읽기(`git ls-remote` · https fetch)만 한다.** workflow.md 의 `dev 수용` 행(서비스 저장소 안 머지 PR)을 대체한다.

```bash
# 0. 뒤처짐 판정 (세션 시작 · pleiades-resume Step 2 대체) — 읽기 전용
git ls-remote https://github.com/fomalhaut84/myFinance.git refs/heads/dev    # 서비스 dev tip
#    ↔ pleiades 에 마지막으로 들어온 서비스 SHA (Q49-a: subtree 머지 메시지 'Merge commit <sha>' / add 트레일러 git-subtree-split · Q49-c: 수용 커밋 트레일러에 기록)
# 1. pleiades 에서
git checkout dev && git pull --ff-only
git checkout -b chore/<issue>-sync-apps-<YYYYMMDD>
git subtree pull --prefix=apps/finance https://github.com/fomalhaut84/myFinance.git dev    # Q49-a (b 면 --squash · c 면 재작성 후 git merge)
git subtree pull --prefix=apps/fitness https://github.com/fomalhaut84/myFitness.git dev
# 2. 충돌 해결 → 8절(apps 행 · 앱별 npm ci) → PR base dev → "Create a merge commit" → 머지 후 부모 2 확인
```

| 수용마다 요구되는 것 | L2(권고) | L1 |
|---|---|---|
| lock | **없음** — 서비스 lock 이 그대로 온다. 단 M-5 이후 `apps/*/package.json`·lock 을 pleiades 가 고쳤다면 **lock 충돌** → 해결 규칙: 서비스 lock 을 받고(`--theirs`) 앱에서 `npm install` 로 `file:` 1줄을 다시 얹는다 → lock diff 검토 | 서비스 lock 은 트리에 오지만 쓰이지 않는다 → 루트 lock 재생성 · **드리프트 재측정**(⑪ 이 매번 새로 생긴다) |
| overrides | **없음**(앱 안에서 동작) | 앱 `overrides` diff 추출 → 루트 병합 → 의미 변화(`$` 참조) 검토. **누락하면 서비스가 막은 취약 버전이 pleiades 에서 해석된다** |
| 소스 충돌 | pleiades 가 `apps/*` 를 고친 파일에서만(M-5 이후 · X7) | 같다 |
| 하네스 | fin `apps/finance/.claude/` 는 서비스 판이 그대로 덮인다(pleiades 는 이 경로를 고치지 않는다 — Q58) | 같다 |

- **리뷰 범위**: 기존 동기화 PR 규정 그대로 — **충돌 해결분 + 머지 위생 + 8절**. 서비스 유래 코드의 봇 지적은 **pleiades 이슈로만 기록**한다(서비스 저장소에 이관 이슈를 만들지 않는다 — Q55).
- **되돌리기**: 머지 전 즉시 · 머지 후 revert `-m 1` → **중간**(다음 수용이 revert 된 서비스 커밋을 다시 가져오지 않으므로 revert 의 revert 가 필요 — workflow.md 동기화 PR 되돌리기와 같은 구조).
- **주기**: Q54b. 권고 — 세션 시작 판정 + **M-5 착수 직전 반드시 0** (갈라지기 전에 최신을 받는다).
- **머무는 비용이 커지는 조건**: `apps/*` 를 고친 양(M-5 · M-6)과 그 파일의 서비스 변경 빈도(X7). M-4 까지는 `apps/*` 무변경이라 **수용은 무충돌**이어야 한다 — 충돌이 나면 그것 자체가 규율 위반 신호다.

### 4-7. M-5 — notify 통합 (1a-3 · 1a-4 를 `apps/*` 안에서)

| 항목 | 1a-3 계획(`_workspace/1a-3/`)에서 | M-5 에서 |
|---|---|---|
| 코드 결정 D-1~D-4 · U-3 동작 변경 묶음 · U-5 label `'bot'` | 사용자 승인됨(2026-09-30) | **재사용** — 대상 파일·호출 6건·로그 문자열 표(계획 §2)는 `apps/fitness` 에서 경로만 바뀐다. src 가 서비스 dev 와 같다는 전제(⑰)는 **M-5 직전 수용 0** 으로 다시 세운다 |
| 소스 | fit worktree 브랜치 `fd8b7c5` | `fd8b7c5` 의 `src/` 8 파일 diff 를 **GitHub 에서 읽기 전용 fetch** → `git apply --directory=apps/fitness`. `package.json`·lock 2 파일은 버린다(⑰) |
| 패키지 참조 | **Q48** = SHA 40자 핀 `git+https://…#<sha>` | **Q48 소멸** — `file:../../packages/notify`(L2) 또는 workspace(L1). 1a-0 ALT-d 위임 키·`prepare` 는 소비자가 없어진다 → 삭제 여부는 별도(§9 · 되돌리기 즉시) |
| 검증 | 8절 4종 + γ + β2-I(서버 · 사용자 실행) | **8절 4종 + CI + 로컬 기동(M-4)**. **β2 소멸**(서버). γ-live 는 Q53 검증 봇이 있을 때만 |
| 등급 | "즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간"(U-8) | **즉시** — 전환 전까지 배포 경로가 없으므로 "이후 중간" 조건이 **이 문서 범위 안에서는 오지 않는다** |
| 이슈 | #95(보류) · #96 | #95 는 **소진**(대상 저장소 절차) — M-5a 이슈를 새로 열고 #95 를 참조해 닫는다(Q54). #96 은 M-5a 범위로 흡수 가능 |
| fin(1a-4) | Q27(`rsu.ts` 흡수) 미결 | 그대로 M-5b 선결 |

- **패키지 `packages/notify/` 는 움직이지 않는다**(003 §2-1 의 약속이 여기서 실현된다).
- **멈추면:** fit 만 통합된 상태로도 손해 없다 — 서비스는 원래 코드로 돌고, pleiades 의 `apps/fitness` 만 갈라져 있다. 비용은 수용 충돌 표면(X7).
- 되돌리기 **즉시**(pleiades revert PR). 단 되돌린 뒤의 수용은 revert 커밋을 기준으로 이어지므로 **그 자체로 충돌은 없다.**

### 4-8. M-6 — Discord (1b)

- `DiscordTransport` 는 `packages/notify/` 에 추가 — 003 §6 설계 그대로. **검증용 Discord 서버·웹훅은 새로 만든다**(서비스에 Discord 가 없으므로 서비스 접촉 0).
- **1b-2 의 DB 처리(003 Q12)** 가 `apps/*/prisma` 에 마이그레이션을 추가하면 ① 수용마다 `prisma/migrations` 충돌 후보 ② **전환 때 서비스 DB 에 적용할 편도 마이그레이션이 쌓인다.** → Q61: **전환 설계 전에는 스키마를 바꾸지 않는다**(003 Q12 권고 D-a 가 스키마 무변경이라 정합).
- 되돌리기 **즉시**(env · 어댑터 revert). 스키마를 바꿨다면 로컬 DB 는 즉시 · 전환 이월분은 **편도 후보**.
- 멈추면: 첫 릴리즈 조건(#88)의 "Discord 통합 알림이 어느 정도 기능" 이 pleiades 안에서 충족된다. **서비스에는 아무 변화가 없다.**

---

## 5. 격리 불변식 — pleiades 가 서비스에 닿을 수 있는 모든 경로

**원칙: 아래 경로 중 어느 것도 pleiades 세션·CI·로컬 실행이 밟지 않는다.** "영향 없음" 의 근거는 각 행의 차단 규칙이고, 차단 규칙이 없는 행은 없다.

| # | 경로 | 어떻게 닿나 | 차단 규칙 | 기계적 보조 | 위반 시 되돌리기 |
|---|---|---|---|---|---|
| **I-1** | **서비스 저장소 쓰기** | push · 브랜치 생성/삭제(동결된 `integration/*` 포함) · PR · 이슈 · 코멘트 · 라벨 · 리뷰 · 릴리즈 | **전부 금지.** `gh` 의 `-R fomalhaut84/myF…` 는 **읽기 동사만**(`view`·`list`·`api` GET). 수용 출처는 https URL 직접 · 리모트 미등록 | 훅(Q56b) | 대부분 되돌릴 수 있으나 **알림·이벤트는 편도** |
| **I-2** | **GitHub 교차 참조** | pleiades 의 이슈·PR·커밋 메시지에 `fomalhaut84/myF…#N` 또는 서비스 PR URL 을 쓰면 **서비스 저장소 이슈/PR 타임라인에 "mentioned" 이벤트가 생긴다.** 가져온 커밋 메시지(★X1)도 같다 | 서비스 참조는 **코드 스팬**(`` `myFitness#492` ``)으로 쓴다 — 자동 링크되지 않는다(Q56). 가져오기 메시지는 ★X1 결과로 판단 | 없음(작성 규율) | **편도**(타임라인 이벤트는 지울 수 없다) |
| **I-3** | **서버** | ssh · pm2 · nginx · 병행 인스턴스(β2 `~/pleiades-int`) · 서버 DB | **전부 금지.** 003 Q42·Q44 의 서버 경로는 소진. 서버에 이미 남은 것이 있다면 그 정리는 **사용자 단독**(pleiades 는 명령을 제시하지도 않는다 — Q54) | 훅(`ssh`) | 서버 쪽은 사용자만 |
| **I-4** | **서비스 텔레그램 봇 토큰** | long polling 이중화 → **409 로 서비스 봇 수신 중단**(⑮) · `deleteWebhook()` · 서비스 봇 명의 발송 | 서비스 토큰을 **어떤 `.env`·CI secret·명령줄에도 두지 않는다.** 원본 `.env` 복사 금지(L-2) | 없음 | **서비스 중단**(봇 재기동 필요 — 서버 = 사용자) |
| **I-5** | **텔레그램 수신자** | 검증 봇이라도 실사용 채팅으로 보내면 사용자 받은편지함에 섞인다 | `TELEGRAM_ALLOWED_CHAT_IDS`·`ADMIN_CHAT_IDS` = **검증 전용 채팅만**(하드코딩 chat id 0 — 003 Q46) | 없음 | **편도**(보낸 메시지) |
| **I-6** | **Garmin 계정** | fit 웹 기동만으로 싱크 cron(⑭) → 같은 계정 로그인 · 레이트리밋 · 세션 무효화 가능(X6 · 미측정) | `GARMIN_*` 비움 · `.garmin-tokens/` 반입 금지 · CI 에도 없음 | 없음 | 서비스 싱크 실패는 서비스 쪽 재로그인(사용자) |
| **I-7** | **DB** | 서비스 `DATABASE_URL` 사용 · fit 웹 부팅 쓰기(sweeper) | 로컬 빈 DB · CI 는 러너 안 postgres 컨테이너. 서비스 DB 접속 정보를 pleiades 어디에도 두지 않는다 | 없음 | **편도**(서비스 데이터 오염) |
| **I-8** | **외부 API·쿼터** | fin Whooing 웹훅(실 가계부 기록) · fit MFDS 키 · `claude -p`(서버 advisor 와 계정 공유 시 쿼터 경합 — X8) · **Codex 봇 쿼터**(저장소 간 공유 시 대형 PR 이 서비스 리뷰 쿼터를 소진 — X8) | Whooing·MFDS 비움 · `CLAUDE_BIN` 비움 · 대형 PR(M-1) 은 봇 리뷰 비용을 감사가 판정 | 없음 | 쿼터는 시간 경과 · 가계부 기록은 **편도** |
| **I-9** | **GitHub Actions** | pleiades 에 `deploy.yml` 이 활성화되거나(루트로 이동) `DEPLOY_*`·`TELEGRAM_*` secret 이 생기면 pleiades 릴리즈가 **서비스 서버 ssh 배포를 트리거**하는 구조가 된다(⑦) | `apps/*/.github/` 를 루트로 옮기지 않는다 · pleiades Actions secrets **0 유지** · `apps-ci.yml` 은 secret 없이 동작 | secrets 0 을 CI 로 점검 가능(`gh api …/actions/secrets`) | 배포가 나가면 서비스 서버 상태 변경(사용자만) |
| **I-10** | **서비스 하네스의 지시** | `apps/finance/.claude/`·`CLAUDE.md`(⑧)는 **서비스 워크플로우**(서비스 `dev` 로 PR · 릴리즈 · 배포)를 지시한다. pleiades 세션에 로드되면 I-1·I-3 을 지시문으로 유도한다 | `bin/claude-with` 가 `apps/*` 를 붙이지 않는다(Q58 — 래퍼 소진) · 중첩 `CLAUDE.md` 지연 로드 여부 X10 확인 · 로드된다면 pleiades 룰이 우선한다는 한 줄을 룰에 | 없음 | 즉시(세션) |
| **I-11** | **원본 체크아웃·worktree 의 `.git`** | `repos/*` 에서 `fetch`·브랜치 조작 → 원본 `~/workspace/myF*/.git` 이 바뀐다(worktree 공유) | 동결 — `repos/*` 에서 git 명령 금지(읽기 `cat` 수준만). 제거 시점은 Q54 | 훅(`repos/` 안 `git`) | 로컬 메타데이터(서비스 무관) |
| **I-12** | **포트** | 로컬에서 사용자가 원본을 띄우고 있으면 충돌 | L-3 | 없음 | 즉시 |

> **이관 이슈 정책(#83)은 I-1 에 걸린다.** 서비스 저장소에 이슈를 만드는 것 자체가 쓰기다. 새 발견은 **pleiades 이슈에만** 기록한다(Q55). 대장 #82 는 동결 — 기존 7건은 그 저장소 주인이 닫는다(pleiades 는 읽기만).

---

## 6. 남은 미결 질문

번호는 003 의 Q48 다음을 잇는다. **권고는 하나씩.** 우선순위는 막는 단계 기준.

| | 질문 | 무엇을 가르는가 | 권고 | 우선 |
|---|---|---|---|---|
| **Q49** | **가져오기 방법** — (a) subtree 이력 포함 / (b) subtree `--squash` / (c) filter-repo 경로·메시지 재작성 + merge | ★X1 위험(pleiades 이슈 자동 닫힘 · 서비스 타임라인 이벤트)을 받아들이나 · 경로 이력(`log`/`blame`)을 살리나 · 수용 절차가 1줄인가 스크립트인가 | **★X1·★X2 측정 후 결정.** ★X1 = 0(닫기 키워드 ∩ 열린 이슈 0 · 서비스 한정 참조 0)이면 **(a)** — D-1 그대로 · 수용 1줄. ★X1 ≠ 0 이고 ★X2 가 결정적이면 **(c)**. 둘 다 아니면 **(b)**(D-1 개정을 사용자에게 다시 묻는다) | **높음 — M-1 착수 전** |
| **Q50** | (a) 를 택할 때 **경로 이력 끊김** 대응 | 세션·사람이 `apps/*` 파일의 이력을 어떻게 읽나 | **수용하고 문서화** — 옛 경로 조회 헬퍼(`git log <split-sha> -- <옛 경로>`) 1개를 `bin/` 에. `git replace`/graft 는 쓰지 않는다(이력 조작이 수용을 깬다) | 중간 — M-1 과 함께 |
| **Q51** | **설치·lock 전략** — L2 앱별 lock / L1 workspaces 재생성 / L3 서비스 lock 시드 병합 | pleiades 에서 도는 것이 **서비스 버전**인가(⑪) · override 19개 수동 병합(⑫)을 매 수용마다 지나 | **L2.** workspaces 는 전환 설계(Q60) 때 다시 연다 | **높음 — M-2 착수 전** |
| **Q52** | **CI** — 앱 job 을 필수 체크로? DB 는? | 수용 PR 이 두 앱을 깨면 머지가 막히는가 | DB = **Actions postgres 서비스 컨테이너**(서비스 CI 그대로). **서비스 CI 와 같은 단계만 필수**, fin 테스트 등 추가분은 비필수 | 중간 — M-3 |
| **Q53** | **검증 봇 토큰**(003 Q46 재사용)을 **지금** 발급하나 · 검증 전용 채팅 | 봇 기동·발송 검증(γ-live · M-5 · M-6)이 가능한가. 없으면 발송은 테스트(mock)로만 | **M-4 에서는 발급하지 않는다**(텔레그램 비움으로 D-4 충족). **M-5a 착수 전에 발급** — 사용자가 BotFather 로 · 검증 전용 채팅과 함께 | 중간 — M-5 전 |
| **Q54** | **동결 산출물의 최종 처리** — 서비스 원격 `integration/*` 브랜치 · `repos/*` worktree · #95 · #82 · 이관 이슈 7건 · 서버의 β2 잔여물(있다면) | 무엇을 pleiades 가 정리하고 무엇을 남기나 | **서비스 저장소·서버 쪽(원격 브랜치 · 이관 이슈 · 서버 잔여)은 pleiades 가 영구히 건드리지 않는다** — 사용자가 서비스 단독 세션에서. **로컬 worktree 는 M-5a 가 `fd8b7c5` 를 GitHub 에서 받아 재사용을 확인한 뒤 제거 제안**(제거는 원본 `.git/worktrees` 메타데이터만 바꾼다 — 로컬). #95 는 M-5a 이슈로 대체하며 닫는다 · #82 는 동결 표기 후 열어 둔다 | 낮음 — M-5a 이후 |
| **Q54b** | 수용 **주기** | 갈라짐 누적 속도 | 세션 시작 판정(읽기) + **M-5 착수 직전 필수 0** | 낮음 |
| **Q55** | **이관 이슈 정책(#83) 대체** — 서비스 유래 결함을 어디에 적나 | I-1(이슈 생성도 쓰기) | **pleiades 이슈에만**(라벨 `fin`/`fit` + `서비스 유래`). 서비스 저장소에는 만들지 않는다. 서비스에 알릴지는 사용자가 단독 세션에서 판단 | **높음 — M-0** |
| **Q56** | pleiades GitHub 텍스트의 **서비스 참조 표기** | I-2 교차 참조 이벤트 | 서비스 이슈·PR 은 **코드 스팬**으로만(자동 링크 없음). 과거 문서·PR 은 소급하지 않는다(이미 생긴 이벤트는 편도) | 중간 — M-0 |
| **Q56b** | **차단 훅**을 둘 것인가 | 룰 위반을 실수 단계에서 막나 | **둔다**(`gh -R myF…` 쓰기 동사 · `repos/` 안 git · `ssh` 거부). 되돌리기 즉시 | 중간 — M-0 |
| **Q57** | `apps/*` 에서 **서비스 결함을 고치나** (CI·봇·감사가 찾은 것) | 갈라짐 · 수용 충돌 | **고치지 않는다**(수용으로 온다). pleiades CI 를 막으면 해당 체크를 비필수로 두고 pleiades 이슈에 기록. 예외는 notify 통합 대상 파일(M-5)뿐 | 중간 — M-3 |
| **Q58** | **하네스** — `bin/claude-with` · `apps/finance/.claude/`(서비스 판) · 동결된 fit 하네스 19 파일(`integration/pleiades` 판) | I-10 · 수용 충돌 | **`bin/claude-with` 소진**(서비스 하네스는 서비스 워크플로우 지시다). `apps/*/.claude/` 는 **고치지 않는다**(서비스 판 그대로 수용). 동결 fit 하네스는 가져오지 않는다 — 필요한 절차가 생기면 pleiades 하네스에 새로 쓴다 | **높음 — M-0** |
| **Q59** | **002 단계 0**(통합 어드바이저 · 004 Q23) | 원칙상 서비스 경로는 불가 · pleiades 로컬은 빈 DB 라 "쓸 만한 답" 을 검증할 수 없다 | **보류 표기** — 전환 설계(Q60)와 함께 다시 연다. Q23 은 서버 경로가 막혀 **판정 불요**로 소진 | 낮음 |
| **Q60** | **전환(cutover)** — pleiades 가 서비스를 대체하는 방식·시점(배포 경로 · DB 이전 · 서비스 저장소 보관) · 002 Q2(독립 배포) | 원칙이 풀리는 **유일한 지점**. 첫 릴리즈(#88)가 여기에 묶인다 | **별도 스펙(007 가칭)** — M-6 이 끝날 때 연다. 그 전에는 원칙이 절대다 | 낮음(지금) · **필수(첫 릴리즈 전)** |
| **Q61** | 1b-2 의 **스키마 변경**(003 Q12) | 전환 때 편도 마이그레이션이 쌓이는가 | **전환 설계 전 스키마 무변경**(003 Q12 권고 D-a 와 정합) | 낮음 — M-6 |

---

## 7. 판단이 바뀐 것

| 이전 결론 | 어디 | 무엇이 뒤집었나 |
|---|---|---|
| *"단계 4 진입 조건 = 도메인 #3(캘린더)"* + 병렬 조건 *"패키지 수정 PR 2개 왕복이 성가실 때"* | 002 §4 | 사용자 결정 D-4. 병렬 조건(관측 지표)은 **관측되기 전에 소진**된다 — git dep 소비자가 한 번도 생기지 않았다(1a-3 미머지) |
| *"단계 4 를 앞당기지 않는 근거 3개"* | 003 §2-3 | ① *"실서비스 배포 파이프라인 동시 재설계 · 릴리즈 격리 상실"* — **이 문서는 배포를 건드리지 않는다.** 서비스는 자기 저장소에서 자기 파이프라인으로 계속 배포된다. 그 비용은 **전환(Q60)으로 이월**된다(사라지지 않는다) ② *"잘못된 추상화가 3방향으로 전파"* — 전파돼도 **pleiades 안**에서만이다(서비스 무영향) · 1a-1 테스트 93건이 L3 를 일부 검증했다 ③ *"캘린더가 없다"* — 여전히 없다. 사용자가 순서를 바꿨다 |
| *"worktree 는 모노레포로 가는 계단이 아니다 … 승계되는 것은 `integration/pleiades` 의 커밋 이력뿐"* | 004 §2-4 | **그 이력도 승계되지 않는다.** 가져오는 것은 **서비스 `dev`** 이고, `integration/pleiades` 와 dev 의 차이는 하네스 문구뿐이다(⑰). worktree 는 계단도 입력도 아니고 **동결**이다 |
| *"두 `package.json` 의 git URL → 워크스페이스 `"*"` 1줄"* | 003 §2-1 | 방향은 맞다. **`"*"` 가 아니라 `file:`(L2 권고) 일 수 있고, 그 1줄은 `apps/*` 변경이라 수용 충돌 후보가 된다** — "1줄" 은 편집량이지 유지 비용이 아니다 |
| Q15 git 의존성 · Q28 · Q47 ALT-d · Q48 · Q45 · Q42 · Q44 β2 | 003 | 소비 경로가 서비스 저장소 → `apps/*` 로 바뀌며 **소진**. 사실 기록(Q45 서버 실측 등)은 유효 |
| 1a-3 등급 "즉시 — 미배포 동안 · 이후 중간"(U-8) | `_workspace/1a-3` · #95 | 배포 경로가 없어져 **이 문서 범위 안에서는 즉시로 고정**. "이후" 는 전환(Q60)으로 이월 |
| 서비스 `dev` 를 **서비스 저장소 안에서** 받는다(#70) | workflow.md `dev 수용` | 서비스 저장소 쓰기 금지 → **pleiades 안에서** 받는다(§4-S). 규칙("머지 커밋 · squash 금지 · 리뷰 범위 = 충돌분")은 그대로 승계 |
| 이관 이슈는 고치는 저장소에(#83) | workflow.md 5절 | I-1 — **pleiades 에만**(Q55) |
| `bin/claude-with` 대상 = worktree(#80) | CLAUDE.md · 005 | I-10 — **소진**(Q58) |

---

## 8. 제외 사항

| 제외 | 이유 | 언제 다시 |
|---|---|---|
| **전환(cutover)** — pleiades 에서 서비스 배포 · 서비스 DB 이전 · 서비스 저장소 보관 | 원칙과 정의상 충돌. 별도 결정 | Q60 · M-6 이후 · 첫 릴리즈(#88) 전 필수 |
| 캘린더(도메인 #3) · 도메인 모듈 계약 | 002 §4 의 "진짜 산출물" 이지만 D-4 의 순서 밖 | M-6 이후 |
| 인바운드 봇 통합(002 Q3) · 단일 DB(Q7) · 단일 웹 UI | 002 §5 그대로 | 전환 이후 |
| 서비스 결함 수정 | Q57 | — |
| 동결 산출물의 삭제 | D-3 · Q54 | 사용자 단독 |
| workspaces 도입 | Q51 L2 | 전환 설계 |
| gitleaks 급 스캔 도구 설치 | 사용자 결정(X5) | M-1 전 선택 |

---

## 9. 상위 문서 개정 목록 (정본 반영 시 — **삭제 없음**)

표기: **소진** = 조건이 사라져 더는 적용되지 않음(원문 유지 + 블록) · **정정** = 틀렸거나 바뀐 서술(원문 유지 + 블록) · **보류** = 판단 유예. 전부 되돌리기 **즉시**(문서).

| 문서 · 위치 | 표기 | 무엇 |
|---|---|---|
| **002** §4 단계 4 진입 조건 · 병렬 관측 지표 | 정정 | 진입 = 2026-09-30 사용자 결정(D-4) · 관측 지표는 관측 전 소진 · 상세 006 |
| 002 §4 단계 0 · 상태 줄 *"단계 0 실행"* | 보류 | Q59 |
| 002 §4 단계 1 *"env 한 줄"* 정정 블록의 서버·재시작 서술 | 소진 | 서비스 배포 경로가 이 문서 범위에 없다 |
| **003** §1 Q15 · §1-1 정정들(Q28 · #88) · §10 Q48 | 소진 | 소비자가 `apps/*` · 참조는 `file:`/workspace |
| 003 §2-1 *"workspace `"*"` 1줄"* · 1a-0 ALT-d 위임 키·`prepare` | 정정 · 소진 | §7 넷째 행 · 위임 키는 소비자 0 → 삭제 여부 별도(즉시) |
| 003 §2-2·§2-4 버전 드리프트 · 관측 지표 | 소진 | git dep 이 생기지 않았다 |
| 003 §2-3 근거 3개 | 정정 | §7 둘째 행 — ①은 **소멸이 아니라 전환으로 이월** |
| 003 §5-2 1a-3·1a-4 행 · §8-1 배포·`npm ci`·`pm2 restart` 서술 | 소진 | M-5 로 대체 · 등급 즉시 고정(§4-7) |
| 003 §10-1 병행 인스턴스 10조건 · Q42·Q44·Q45 | 소진(서버 조건 3·4·7) · 정정(나머지 → M-4 L-1~L-9) | 조건표 정본은 006 §4-6 |
| 003 Q46 | 정정 | 발급 시점 = M-5a 전(Q53) |
| **004** 전체(worktree 배치) · §2-4 · §7 유효기간 · Q23 · Q24 | 소진 · 정정 | worktree 동결(D-3) · 승계 입력 아님(§7) · Q23 소진(Q59) · Q24 는 저장소 경로가 바뀌지 않아 **계속 유예** |
| **005** §4-5·§4-6(`--add-dir` 운영) · `bin/claude-with` | 소진 | Q58 |
| **`workflow.md`** 브랜치 전략 표(대상 저장소 행 · `dev 수용` 행) · 7절 base 표(통합 작업·단독·핫픽스 행) · 5절 이관 이슈 · 8절 `repos/*` 행 · 10절 "대상 저장소 PR 머지 후" | 소진 · 정정 | 대상 저장소 행 → **서비스 저장소는 pleiades 의 작업 대상이 아니다**(I-1) · `dev 수용` → §4-S · 8절에 `apps/finance`·`apps/fitness` 행 추가 · 이관 → Q55 |
| workflow.md 9-0 *"대상 저장소 변경 — 에이전트 필수"* | 정정 | **`apps/**` 변경 — 에이전트 필수**(수용 PR 은 동기화 PR 리뷰 범위) |
| `.claude/skills/dual-repo-change` · `agents/dual-repo-operator` | 소진 | 모드 I·S·H 전부 대상 저장소 쓰기 전제 → 승인 게이트 개념만 `apps/*` 변경 규약으로 승계(형식은 M-0 에서) |
| `.claude/skills/pleiades-resume` Step 2 | 정정 | behind 측정 = `git ls-remote` 비교(§4-S 0) · worktree 드리프트 감지 소진 · `label:pleiades` 카운트는 읽기라 유지 가능 |
| `.claude/skills/pleiades-handoff` 대장 갱신 | 정정 | #82 동결 |
| **이슈** #95 · #96 · #82 · #66 | 소진 · 흡수 · 동결 · 정정 | #95 → M-5a 이슈로 대체 · #96 → M-5a · #82 동결 표기 · #66 롤백 체크리스트는 대상 저장소 상황이 사라져 범위 축소 |
| `CLAUDE.md` 상태·대상 저장소 절·작업 규칙·핵심 전제 4 | 정정 | 원칙 1줄 · `repos/*` 동결 · 전제 4 진입 조건 |
| `docs/research/measured-facts.md` | 추가 | M-1p 측정(★X1~★X3) |
| **CI** `ci.yml` · `security-audit.yml` | 무변경 | `apps-ci.yml` 은 신설(M-3) |

---

## 10. 유효기간

| 조건 | 무엇을 다시 여나 |
|---|---|
| ★X1·★X2 측정 결과 | Q49 · D-1 의 방법 |
| M-4 완료(첫 목표 달성) | 이 문서의 M-5 이후 순서가 여전히 맞는지 |
| 수용 충돌이 **M-4 이전에** 발생 | §4-S 의 "무충돌이어야 한다" 가정 — 규율 위반 또는 가정 오류 |
| M-6 완료 또는 사용자가 전환을 꺼낼 때 | Q60 → 별도 스펙. **그 시점까지 원칙은 절대다** |
| 서비스 저장소 중 하나가 PRIVATE 으로 바뀔 때 | 수용 출처(https 무인증 fetch)가 깨진다 · 이미 가져온 PUBLIC 이력과의 관계 |
