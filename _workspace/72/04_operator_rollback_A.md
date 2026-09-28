# 04-A — operator 롤백 절차: #72 A — fit 원본 하네스 → worktree 복사

**작성:** 2026-09-28(집행 중 · 머지 후 실값 갱신) · **형식:** `dual-repo-change` 5-1 · **모드 I**(worktree `repos/myFitness` · base `integration/pleiades` · 이슈 pleiades#72) · 되돌리기 등급: **즉시** · 원본 도달분: **없음**(#80 · 원본은 읽기만)

## 0. 상태 판정 표

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **myFitness#499** (`integration/chore-pleiades-72` → `integration/pleiades` · 커밋 `<커밋>`) | **머지 `02707a3`**(부모 1 · 2026-09-28) | 없음 (하네스 문서 · 미배포 브랜치) | **없음** | 없음 |

## 1. 머지 전
```bash
cd ~/workspace/pleiades/repos/myFitness && git checkout integration/pleiades
gh pr close <n> -R fomalhaut84/myFitness --delete-branch
```
## 2. 머지 후 (revert 도 PR)
```bash
cd ~/workspace/pleiades/repos/myFitness && git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/fix-pleiades-72-revert && git revert -m 1 --no-edit <머지 SHA>     # merge commit 이면 -m 1 · squash 면 -m 없음 — %P 로 확인
git push -u origin integration/fix-pleiades-72-revert
gh pr create -R fomalhaut84/myFitness --base integration/pleiades --head integration/fix-pleiades-72-revert --title "revert: fit 하네스 복사 되돌림 (pleiades#72)" --body "Refs fomalhaut84/pleiades#72 · 되돌리기: 즉시"
```
되돌리면 worktree 판이 #369+#62+#67 판으로 돌아가고 `bin/claude-with fit` 이 그 옛 판을 읽는다 — 원본과의 드리프트가 다시 생길 뿐 서비스 무관.
## 3. 원본 도달분
없음. 원본 `~/workspace/myFitness` 는 이 집행에서 읽기만 했다(`cp` 원본 → worktree · `git -C 원본 status` 0 · 브랜치 `dev` 유지).
