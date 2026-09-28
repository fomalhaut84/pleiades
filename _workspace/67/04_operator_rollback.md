# 04 — operator 롤백 절차: #67 fin·fit `workflow.md` 8-4 캐시 경로 `~` → `$HOME`

**작성:** 2026-09-28(집행 중 · 머지 후 실값 갱신) · **형식:** `dual-repo-change` 5-1 · 체크리스트 `_workspace/61/rollback-checklist.md`
**모드 I 대칭(PR 2) + 모드 S 미러(PR 1) + fit 원본 1파일 동기화** · 이슈 `fomalhaut84/pleiades#67` · 미러 이슈 `fomalhaut84/myFinance#507` · 되돌리기 등급: **즉시**(PR 3 revert) · 원본 도달분 fit **중간**(ignored · 사전 사본으로 복원)

## 0. 상태 판정 표 (머지 후 갱신)

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **myFinance#508** (`integration/chore-pleiades-67` → `integration/pleiades` · 커밋 `7cbe797`) | **머지 `c94cbb8`**(merge commit · 부모 2 · 06:48Z) | 없음 (문서) | fin 모드 S 미러 myFinance#509 | 없음 |
| **myFitness#490** (같은 브랜치명 · 커밋 `40c04ee`) | **머지 `ef00e88`**(merge commit · 부모 2 · 06:48Z) | 없음 | fit 원본 `.claude/rules/workflow.md` `git archive` 1파일 동기화 — 사전 사본 `_workspace/67/backup/fit-harness-pre-sync.tar`(23040 B · md5 `00c084ee…` · 부재 목록 0) — **완료 06:50Z** · 후 md5 `8200399f…` · worktree 판과 동일 · status 0 | 없음 |
| **myFinance#509** (미러 · 이슈 myFinance#507 · `chore/507-1` → `dev` · 커밋 `ba3ceb7`) | **머지 `5540417`**(merge commit · 부모 2 · 06:48Z) | 없음 (문서 · ci Lint/Typecheck/Build 잡만) | — | 없음 |

## 1. 머지 전 (저장소별 · 수 초)

```bash
cd ~/workspace/pleiades/repos/<repo> && git checkout integration/pleiades
gh pr close <n> -R fomalhaut84/<repo> --delete-branch
# 미러: cd ~/workspace/myFinance && git checkout dev && gh pr close <m> -R fomalhaut84/myFinance --delete-branch
```

## 2. 머지 후 (저장소별 · revert 도 PR)

```bash
cd ~/workspace/pleiades/repos/<repo> && git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/fix-pleiades-67-revert && git revert -m 1 --no-edit <머지 SHA>     # 세 PR 모두 merge commit(부모 2 · 실값) → -m 1 · fin c94cbb8 · fit ef00e88 · 미러 5540417
git push -u origin integration/fix-pleiades-67-revert
gh pr create -R fomalhaut84/<repo> --base integration/pleiades --head integration/fix-pleiades-67-revert --title "revert: 8-4 캐시 경로 정정 되돌림 (pleiades#67)" --body "Refs fomalhaut84/pleiades#67 · 되돌리기: 즉시"
# 미러(fin 원본 dev): 같은 형태 · 브랜치 fix/507-revert · base dev · Refs fomalhaut84/myFinance#507
```

## 3. 원본 도달분 — fit 원본 `.claude/rules/workflow.md`

```bash
# (a) 사전 사본 복원
tar -C ~/workspace/myFitness -xf ~/workspace/pleiades/_workspace/67/backup/fit-harness-pre-sync.tar .claude/rules/workflow.md
md5 -q ~/workspace/myFitness/.claude/rules/workflow.md   # = 00c084ee3d52cd6a428001159bbed610
# (b) 또는 revert 머지 후 되돌려진 트리에서 그 1파일만
git -C ~/workspace/myFitness archive integration/pleiades .claude/rules/workflow.md | tar -x -C ~/workspace/myFitness
```
**통째 복원 금지**(#72 · 원본 `.claude/` 는 독자 진화). fin 원본은 미러 PR revert 로 되돌린다(§2).
