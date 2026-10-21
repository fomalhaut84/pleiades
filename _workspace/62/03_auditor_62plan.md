# 03 — 착수 직전 재감사: #62 계획 · 롤백 초안

**감사:** 2026-09-14 · `dual-repo-change` §2 · **모드 I · 대칭 변경** · **읽기 전용**(대상 저장소 무변경)
**대상 ref:** `repos/myFinance@integration/pleiades` `ef43c03` · `repos/myFitness@integration/pleiades` `3818208`
**참고(읽기만):** 원본 `~/workspace/myFinance` `dev` `8ed402c` · `~/workspace/myFitness` `main` `5809c48`
**감사 대상 문서:** `_workspace/62/01_plan_62.md` · `_workspace/62/04_operator_rollback.md`

## 판정 표

| # | 주장 | 판정 | 근거 |
|---|---|---|---|
| 1 | 두 worktree = `integration/pleiades` · clean · 원격과 0 차이 | **확인** | `git -C repos/<r> rev-parse --abbrev-ref HEAD` → `integration/pleiades` · `git status -s` → 출력 0행 · `rev-list --count HEAD..origin/integration/pleiades` = **0**, `origin/…..HEAD` = **0** (fetch 후). HEAD: fin `ef43c03` · fit `3818208` (계획 §건드릴 파일 표와 일치) |
| 2 | `gpt-4o` = 정확히 2곳(fin :219 · fit :257) · pleiades 하네스·스킬·에이전트 0 | **확인** | `/usr/bin/grep -rn --binary-files=text gpt-4o ~/workspace/pleiades/.claude ~/workspace/pleiades/CLAUDE.md repos/{fin,fit}/.claude ~/workspace/{myFinance,myFitness}/.claude` → **4행**: worktree fin `:219` · fit `:257` · 원본 fin `:199` · 원본 fit `:257`. pleiades `.claude/**`(스킬 9·에이전트·룰) **0건**. ref 기반 교차확인 `git grep --text -n gpt-4o integration/pleiades -- .claude` 로 같은 행·행번호. 사용자 전역 `~/.claude` 도 0건. 4파일에 **다른 모델명 하드코딩 없음**(`gpt-[0-9]\|o3-\|claude-[0-9]\|sonnet\|opus` 0건) — 이번 1줄이 유일한 재발원 |
| 3 | 원본 fin `dev:199` · fit `main:257` 에 같은 줄 · fin 원본 8-4 정정 블록 구성이 달라 cherry-pick 아닌 문장 단위 적용 | **확인** | 원본 fin은 tracked(`git grep dev -- .claude` 적중), 원본 fit은 ignored(`git grep main` 0건 — `/usr/bin/grep` 으로만 보임). **`diff dev:… ↔ integration:…`(fin) = 전체 22행 차 · 8-4 구간 차이는 #51 정정 블록뿐**: 원본 dev 판은 헤더가 `(2026-09-11 · pleiades#51 · 미러 fomalhaut84/myFinance#494)` 이고 마지막에 *"원 PR 은 myFinance#493 … 서비스 `dev` 에 미러(004 Q43)"* 문장이 더 있다. 새 정정 블록은 **그 블록 바로 뒤**에 붙으므로 컨텍스트 3행이 불일치 → cherry-pick 은 충돌한다. 교체 대상 1줄 자체는 양쪽 바이트 동일. **fit 원본 파일 = fit worktree `integration/pleiades` 판과 완전 동일**(`diff` 0) → 머지 후 `git archive` 동기화는 충돌 없음 |
| 4 | `models_cache.json` slug · `codex --version` 0.142.4 · `client_version` 일치 | **확인** | `codex --version` → `codex-cli 0.142.4`. 캐시 `models[].slug/visibility` = `gpt-5.5/list` · `gpt-5.4/list` · `gpt-5.4-mini/list` · `codex-auto-review/hide` — 계획 실측값과 동일, **`gpt-4o` 없음**. `client_version` = `0.142.4`(CLI 와 일치) · `fetched_at` = `2026-07-02T01:56:15Z`(계획 표기와 일치) · `etag` 존재. `auth.json` 미열람 · 비밀값 미출력 |
| 5 | 롤백 초안이 5-1 필수 항목(상태 판정 표·세 시점·원칙 4)을 전부 담는가 · 체크리스트 §1~§3 정합 · `<머지 SHA>^ = 3818208` | **정정 1** | **담음**: §0 상태 판정 표(PR 3행 = 통합 2 + 모드 S 미러 1 · 배포/β2 칸 · 원본 도달 칸 · 의존성 칸) · §1 머지 전(`gh pr close --delete-branch` → 조건부 `branch -D` → 조건부 원격 삭제 · `npm ci` 미해당 명시) · §2 머지 후(revert 브랜치 → `revert --no-edit` → push → `gh pr create` → 사용자 머지 → base 재체크아웃·pull) · §3-1 fit 원본(사전 사본 `_workspace/62/backup/` — `check-ignore` 로 **gitignored 확인**, `--no-renames --diff-filter=A` 부재 목록 선행, `tar` 는 존재 경로만, 롤백 (a)/(b), `rm -rf` 금지) · §3-2 미러 revert(받은 저장소 `dev`) + 릴리즈 경유 시 모드 H 경로. 원칙 1·2·3 충족. **`<머지 SHA>^ = 3818208` 은 fit `integration/pleiades` HEAD 와 일치**(선행 커밋이 더 들어오지 않는 한 참). **원칙 4 위반 → 정정 C-1**(아래) |
| 6 | 서비스 영향 없음 — 워크플로 트리거에 `integration/*` 없음 · deploy 가 `.claude` 미참조 | **확인 (부수 정정 C-2)** | fin·fit 각 3개 워크플로(`ci`·`deploy`·`security-audit`) 전부 확인 — `ci`: `push`/`pull_request` **`branches: [dev, main]`** · `deploy`: `release.published` + `workflow_dispatch` · `security-audit`: cron + `push [main,dev]` + `paths: package*.json`. **`integration/*` 트리거 0.** `deploy/deploy.sh` 는 태그(`$TARGET`) 체크아웃 후 빌드·pm2 — `.claude`·`rules/workflow` 참조 **0건**(`.github`·`scripts`·`ecosystem.config.js` 포함). 런타임 코드가 `workflow.md` 를 읽는 곳도 0(유일 적중은 fin `src/app/api/alerts/history/export/route.ts:5` 의 **주석**이며 다른 파일 `api-routes.md` 지칭) → **빌드·재시작 불필요는 참** |
| 7 | 등급: worktree 즉시 · fit 원본 중간 · fin 미러 즉시 | **확인 (조건부)** | worktree = revert PR 1개 ×2(문서 1줄 + 인용 3줄, 의존성·빌드·배포 없음) → **즉시**. fit 원본은 `main` 에서 ignored(`git grep main` 0건 = 이력 없음) → 사전 사본 또는 되돌려진 트리 archive 필요 → **중간**(1a-2 판정과 동일). fin 미러는 `dev` tracked → revert PR → **즉시**. **조건:** 미러가 `dev`→`main` 릴리즈까지 가면 즉시가 아니다(모드 H 경로) — 롤백 §3-2 에 명시돼 있고 계획에는 없다 |

## 정정 목록 (2건 · 둘 다 문구 · 블로커 아님)

**C-1 — 계획의 되돌리기 등급이 롤백 문서와 다르다 (5-1 원칙 4).**
5-1 원칙 4 는 *"등급은 원본 도달분까지 포함해 매기고 승인 게이트 롤백 칸과 같아야 한다 — 달라지면 승인 무효"* 다.
- 계획 `01_plan_62.md:22` = `되돌리기: 즉시 (문서 1줄 + 정정 블록 ×2)` — **원본 도달분이 빠졌다**
- 롤백 `04_operator_rollback.md:4` = `즉시(worktree) · fit 원본 중간 · fin 미러 즉시`
- 계획은 `50~55행` 에서 fit 원본 `git archive` 동기화와 fin 미러 PR 을 **이 승인 게이트에 포함**시켰으므로, 등급도 그 범위로 적어야 한다.
- **고칠 문장:** `01_plan_62.md:22` → `되돌리기: worktree **즉시**(문서 1줄 + 정정 블록 ×2) · fit 원본 동기화분 **중간**(ignored · git 이력 없음) · fin 모드 S 미러 **즉시**(`dev` tracked · 릴리즈 경유 후라면 모드 H 경로)`

**C-2 — 롤백 §4 의 "fin 미러는 fin CI(`lint`)만 돈다" 가 틀렸다.**
fin `ci.yml` 의 `pull_request: branches: [dev, main]` 이 미러 PR 에 걸리고, 그 잡은 `Lint, Typecheck & Build` 로
**postgres:16 서비스 기동 + `npm ci` + `prisma generate` + `prisma migrate deploy` + `lint` + `tsc --noEmit` + `build`** 를 돈다(CI DB `myfinance_ci` — 실서비스 DB 아님).
- **고칠 문장:** `04_operator_rollback.md:82` 의 `fin 미러는 fin CI(\`lint\`)만 돈다` → `fin 미러는 fin CI 의 \`Lint, Typecheck & Build\` 잡이 돈다(CI 전용 postgres · 실서비스 무접촉)`
- 서비스 영향 판정 자체는 바뀌지 않는다.

## 관찰 (정정 아님 · 집행 시 확인 권고)

- **O-1 · 미러 정정 블록 헤더.** 계획은 fit 에 `위와 동일 문안` 을, fin 미러에 `문장 단위 적용` 을 적었다. #51 선례(원본 `dev`)는 미러 블록 헤더에 `· 미러 fomalhaut84/myFinance#<m>` 을 넣고 말미에 *"원 PR 은 myFinance#<n>(`integration/pleiades`) — 그 브랜치는 `dev` 로 머지되지 않으므로 …"* 를 덧붙였다. 미러 PR 작성 시 같은 형태를 따르면 출처가 보존된다.
- **O-2 · 롤백 §3-1 (b) 의 `rm -f` 생략.** 체크리스트 §3-1 (b) 는 archive 앞에 `xargs rm -f < absent-before-sync.txt` 를 둔다. 초안 (b) 에는 없다. 이번 변경은 **기존 파일 수정만**(추가 0)이라 그 목록이 빈 파일이고 `tar -x` 로 완전 복원되므로 **증명 가능한 no-op** — 이대로 두어도 안전하다. 다른 주제에 재사용할 때는 복원한다.
- **O-3 · `3818208` 의 유효 조건.** fit `integration/pleiades` 에 #62 이전에 다른 커밋이 머지되면 `<머지 SHA>^ ≠ 3818208` 이 된다. 현재 열린 대상 저장소 PR 은 없으므로 착수 시점에는 참이다. 머지 후 실값으로 갱신하는 절차가 이미 문서에 있다.

## 결론

worktree 둘 다 `integration/pleiades` · clean · 원격 0 차이. `gpt-4o` 는 계획대로 worktree 2곳(fin :219 · fit :257) + 원본 2곳뿐이고 pleiades 하네스·스킬·에이전트에는 없다. 캐시 slug·`codex-cli 0.142.4`·`client_version` 전부 일치. fin 원본 8-4 는 #51 정정 블록이 달라 cherry-pick 불가 — 문장 단위 적용이 맞다. `integration/*` 를 트리거하는 워크플로 0, deploy 는 `.claude` 미참조, 런타임이 `workflow.md` 를 읽지 않는다 → 빌드·재시작 불필요는 참. 롤백 초안은 5-1 세 시점·상태 판정 표를 갖췄고 `3818208` 도 일치. 정정 2건은 모두 문구(계획 등급 범위 · fin CI 서술)이며 집행 범위·비용을 바꾸지 않는다.

**정정 2건 · 블로커 0건**
