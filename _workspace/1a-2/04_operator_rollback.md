# 04 — operator 롤백 절차: 1a-2 myFitness vitest 도입

**집행일:** 2026-09-11
**이슈:** `fomalhaut84/pleiades#58` · **모드 I**(통합) · 계획 정본 `_workspace/1a-2/01_plan_1a2.md`(2회차) · 감사 `03_auditor_1a2plan.md`
**범위:** `repos/myFitness` worktree **1개 저장소 · 8파일**. 원본 `~/workspace/myFitness` 무접촉 · `repos/myFinance` 무접촉(#51 은 별도 PR)
**되돌리기 등급:** **즉시** (003 §5-2 1a-2 행 유지 — 파일 수만 4 → 8)

## 무엇을 했나

| 항목 | 값 |
|---|---|
| 경로 | `/Users/sagan/workspace/pleiades/repos/myFitness` (git worktree) |
| base | `integration/pleiades` = `8b7a224` (집행 시작 시 clean) |
| 브랜치 | `integration/feature-pleiades-1a-2` |
| 커밋 | **`7b43d6e`** — `feat(test): vitest 도입 + bot/notifications·bot/utils 회귀 baseline 43건 (pleiades#58)` |
| push | **안 함** (집행 시점 기준). PR 은 오케스트레이터가 9-1 사전 리뷰 후 진행 |

**변경 8파일** (`git log -1 --stat` · 1524 insertions / 16 deletions):

| 파일 | 변경 |
|---|---|
| `package.json` | `overrides.postcss` `"$postcss"` → `"^8.5.10"`(Q16) · devDeps 3줄 추가(`@vitest/coverage-v8`·`vite-tsconfig-paths`·`vitest`) · `scripts.test` 수정 + `test:run`·`test:coverage` 추가 |
| `package-lock.json` | +69 엔트리 (716 → **785** · 제거 0) |
| `vitest.config.mts` | 신규 15줄 |
| `src/bot/notifications/__tests__/send.test.ts` | 신규 10건 |
| `src/bot/utils/__tests__/error.test.ts` | 신규 25건 |
| `src/bot/utils/__tests__/telegram.test.ts` | 신규 8건 |
| `.claude/rules/workflow.md` | 정정 2곳 (8-0 블록 추가 · 8-5 작성 원칙 줄 교체 + 블록) |
| `.claude/skills/branch-workflow/SKILL.md` | 정정 1곳 (Step 6 블록 추가) |

## 롤백

### 머지 전 (현재 상태 — 소요 수 초 + `npm ci` 약 10~20초)

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
gh pr close 374 -R fomalhaut84/myFitness --delete-branch   # 열린 PR 닫기 + 원격 브랜치 삭제 (PR #60 Codex P1)
git checkout integration/pleiades
git branch -D integration/feature-pleiades-1a-2            # 로컬 브랜치 (원격은 위에서 삭제됨)
npm ci                    # node_modules 를 8b7a224 의 lock 대로 복원 (vitest·vite·@vitest 제거)
```

브랜치를 지우지 않고 되돌리려면 `git reset --hard 8b7a224` 후 `npm ci`.
**bare `git stash` 는 쓰지 않는다** — worktree 가 스택을 공유한다.

### 머지 후 (소요 수 분 + 사용자 머지 대기)

`integration/pleiades` 에 직접 커밋·push 하지 않는다 — revert 도 **브랜치 → PR → 사용자 머지** 를 거친다(`workflow.md` 7절 · "머지는 사용자가 직접" · PR #60 Codex P1).

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/fix-pleiades-1a-2-revert
git revert --no-edit <squash-merge-sha>      # 8파일 1커밋
git push -u origin integration/fix-pleiades-1a-2-revert
gh pr create -R fomalhaut84/myFitness --base integration/pleiades --head integration/fix-pleiades-1a-2-revert \
  --title "revert: 1a-2 vitest 도입 되돌림 (pleiades#58)" --body "Refs fomalhaut84/pleiades#58 · 되돌리기: 즉시"
# → 사용자 머지 후
git checkout integration/pleiades && git pull --ff-only
npm ci
```

`npm ci` 로 `node_modules/{vitest,vite,@vitest}` 와 `.bin/vitest` 가 전부 제거되는 것은
감사(주장 5)에서 실측됐다. `node_modules` 는 산출물이라 되돌리기 단위가 아니다.

### 원본 동기화분 (**머지 후 별도 단계** — 이번 집행 범위 밖)

승인 게이트 **G-2 (a)** 로 승인된 fit 원본 하네스 2파일 동기화는 **PR 머지 후에 따로** 실행한다.
이번 커밋에는 포함되지 않았고 원본 `~/workspace/myFitness` 는 이번 집행에서 **읽지도 쓰지도 않았다**.

```bash
# 머지 후 실행 (예정)
git -C ~/workspace/myFitness archive integration/pleiades \
    .claude/rules/workflow.md .claude/skills/branch-workflow/SKILL.md \
  | tar -x -C ~/workspace/myFitness
```

되돌리기 **중간** — 원본 `.claude/` 는 `main` 에서 gitignored 라 git 이력이 없다(#42 선례).
되돌릴 때는 **되돌린 커밋 기준으로 같은 명령을 재실행**한다. 사전 사본을 스크래치패드에 남긴다.

## 서비스 영향 — **없음**

- `integration/pleiades` 는 **배포되지 않는다** — fit `deploy.yml` 트리거는 `release.published` + `workflow_dispatch` 뿐.
- fit CI(`ci.yml`)·`security-audit.yml` 은 `dev`/`main` 에만 돈다 — 이 브랜치는 무관.
- `npm install`·`npm run build` 는 **로컬 worktree 디스크만** 바꿨다. 서버·PM2 6프로세스·DB·텔레그램 무접촉.
- **빌드·`pm2 restart`·세션 초기화 전부 불필요.**
- postcss 리터럴화는 해석 결과가 동일(8.5.25)이라 미래에 `dev` 로 미러되더라도 빌드 산출물이 바뀌지 않는다.

## 집행 중 실측 (measured-facts 반영 대상)

| 항목 | 값 |
|---|---|
| lock 엔트리 | 716 → **785** (+69 · 제거 0) — 계획 예측과 일치 |
| `npm install` | `added 44 packages, changed 1, audited 683` · **`package.json` md5 무변경**(키 순서·`overrides` 재정렬 0) |
| 해석 버전 | vitest **4.1.11** · @vitest/coverage-v8 4.1.11 · vite **6.4.3** · vite-tsconfig-paths 6.1.1 · postcss **8.5.25** · esbuild **0.28.1**(무변경) · `vite/node_modules/esbuild` 중첩 **없음** |
| 신규 EBADENGINE | **0** — 경고 3종(`@csstools/css-tokenizer`·`eslint-visitor-keys`·`entities`)은 전부 도입 전 lock 에 있던 패키지. 신규 경고는 `npm warn deprecated tsconfck@3.1.6: unmaintained` 1건(vite-tsconfig-paths 의존 · 엔진 경고 아님) |
| `npm audit` | 도입 후 4건(critical 1 · high 2 · moderate 1) — 도입 전과 같은 집합 |
| **U2 해소** | `npm run lint`(= `eslint src/ --max-warnings 0`) **exit 0 · warning 0** — 테스트 3파일이 zero-warning 게이트를 실트리에서 통과 |
| **U4 해소** | `npm run build` **exit 0 · 8초**. 빌드 로그에 **prisma 쿼리·DB 연결 흔적 0** — `next build` 는 DB 를 요구하지 않았다(동적 라우트 34 는 on-demand 렌더라 빌드 타임에 실행되지 않고, 정적 생성 18페이지는 DB 없이 통과). 단 로컬 postgres 가 LISTEN 중이었으므로 *"조용히 연결에 성공했을 가능성"* 을 로그만으로 완전히 배제하지는 못한다 — 관측된 범위에서 DB 접근 증거 없음 |
| 빌드 경고 | Turbopack 4건 — 전부 기존 코드(`src/lib/ai/claude-advisor.ts` 등 dynamic filesystem access). 이번 변경과 무관 |
| 테스트 | `npm run test:run` **43 passed (3 files)** · 143ms. RED 게이트 1회 확인(단언 1개 반전 → 1 failed/42 passed · exit 1 → 원복) |
| 빌드 산출물 | `.next`·`dist`·`*.tsbuildinfo`·`next-env.d.ts` 전부 gitignored — `git status -s` 에 안 나옴 |

## 후속 (이번 범위 밖)

- fit `ci.yml:64-68` 주석·스텝 이름 `Test — 회귀 검증 스크립트` — vitest 도입 후 부분 stale (서비스 CI 파일이라 제외)
- fit `docs/specs/` 6파일 8행 "테스트 프레임워크 없음" 서술 — 그 시점 기록이라 고치지 않음
- pleiades 쪽 정정(E10) — `measured-facts` 1a-2 절 · 003 §9 U2·U3·U4 · §5-2 1a-2 행 · pleiades 하네스 5곳 + `dual-repo-change:86-89` stale
- #51 (fin 8-4 문장) — 별도 이슈·별도 PR

---

## #51 (fin)

**1a-2 와 별개 이슈·별개 저장소지만, 같은 승인 게이트(2026-09-11 · G-2)에서 함께 승인돼 같은 날 집행했으므로 여기에 붙인다.**

| 항목 | 값 |
|---|---|
| 이슈 | `fomalhaut84/pleiades#51` |
| 모드 | **I** (통합) — 작업 경로 `repos/myFinance` worktree · base `integration/pleiades` (`6542152`) |
| 브랜치 | `integration/chore-pleiades-51` |
| 커밋 | **`c064298`** — `docs(rules): workflow.md 8-4 codex-cli 오류 안내 문장을 fit 정본과 일치 …` |
| 변경 | **1파일 · +5 / -1** — `.claude/rules/workflow.md` 8-4 절 마지막 문장 교체 + 정정 블록 3줄 |
| 검증 | 8절 4종 **해당 없음** (문서만 바꾸는 변경 — pleiades `workflow.md` 8절 2026-09-08 정정 블록). `git diff` 육안 확인 · 인용 블록 형식이 같은 파일 `:51` 기존 정정 블록과 일치 |
| 상태 | **커밋까지.** push·PR 없음 |

### 롤백

**머지 전 (현재 상태 — 소요 수 초)**

```bash
gh pr close 493 -R fomalhaut84/myFinance --delete-branch   # 열린 PR 닫기 + 원격 브랜치 삭제
git -C ~/workspace/pleiades/repos/myFinance checkout integration/pleiades
git -C ~/workspace/pleiades/repos/myFinance branch -D integration/chore-pleiades-51
```

**머지 후 (소요 수 분 + 사용자 머지 대기)**

`integration/pleiades` 에 직접 커밋·push 하지 않는다 — revert 도 **브랜치 → PR → 사용자 머지** 를 거친다(PR #60 Codex P1 ×2).

```bash
cd /Users/sagan/workspace/pleiades/repos/myFinance
git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/fix-pleiades-51-revert
git revert --no-edit <squash-merge-sha>      # 1파일 1커밋
git push -u origin integration/fix-pleiades-51-revert
gh pr create -R fomalhaut84/myFinance --base integration/pleiades --head integration/fix-pleiades-51-revert \
  --title "revert: workflow.md 8-4 문장 정정 되돌림 (pleiades#51)" --body "Refs fomalhaut84/pleiades#51 · 되돌리기: 즉시"
# → 사용자 머지 후
git checkout integration/pleiades && git pull --ff-only
```

### 원본 도달 — **없다 (머지 후에도)**

- `integration/pleiades` 는 `dev` 로 머지되지 않는다(#25). 이 정정은 **fin 서비스 `dev`/`main` 에 도달하지 않는다.**
- fin `.claude/` 는 **tracked** 라 fit 과 달리 `git archive | tar -x` 복원 절차가 필요 없다 — 원본 `~/workspace/myFinance` 체크아웃(`dev`)에는 그냥 옛 문장이 남는다.
- 원본에도 반영하려면 **모드 S 미러 PR** 로 별도 진행한다 — 원본 `~/workspace/myFinance` · base 그 저장소 `dev` · 이슈는 `fomalhaut84/myFinance` 에. (`workflow.md` 7절 표 · 004 Q43)
- 원본에도 반영하려면 **모드 S 미러 PR** 로 진행한다 — 원본 `~/workspace/myFinance` · base 그 저장소 `dev` · 이슈는 `fomalhaut84/myFinance` 에 (`workflow.md` 7절 표 · 004 Q43). **이 미러는 이미 승인된 머지 후 작업이다**(사용자 G-2 · 2026-09-11 · 계획 §2·§7 — 세션이 읽는 하네스는 원본이라 미러 없이는 #51 의 목적이 달성되지 않는다 · 재감사 블로커 5). #493 머지 후 별도 승인 없이 착수한다 · 되돌리기 즉시(fin 저장소 PR revert). (PR #60 Codex 3회차 P1 — 이전 문장은 *"이번 승인 범위 밖"* 이라 적어 G-2 와 모순됐다.)

### 서비스 영향 — **없음**

- 문서 1파일. 빌드·`pm2 restart`·세션 초기화 **전부 불필요**.
- fin `integration/pleiades` 는 배포 트리거가 아니다. PM2 6프로세스·DB·텔레그램 무접촉.
