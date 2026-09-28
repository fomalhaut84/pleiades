# 04 — operator 롤백 절차: #71 첫 dev 동기화 (fin dev 4 · fit dev 77 → `integration/pleiades`)

**작성:** 2026-09-28(집행 전 초안 · 머지 후 실값 갱신) · **형식:** `dual-repo-change` 5-1 · 체크리스트 `_workspace/61/rollback-checklist.md` **둘째 적용**(#66)
**모드 I · 대칭 변경** · 이슈 `fomalhaut84/pleiades#71`(정책 #70) · 되돌리기 등급: **중간**(머지 커밋 revert 뒤 dev 를 다시 받으려면 revert 의 revert 가 필요) · 원본 도달분 **없음**(방향 dev → integration)

## 0. 상태 판정 표 (집행 후 갱신)

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **myFinance#505** (`integration/chore-pleiades-sync-20260928` → `integration/pleiades` · 오픈 2026-09-28 06:13 UTC · 브랜치 head `1b5dabb`) | `<머지 SHA>` — **"Create a merge commit" 으로 머지해야 한다(squash 금지)** | 없음 (`integration/pleiades` 는 배포되지 않는 브랜치 · β2 없음) | 없음 | dev 의 `package-lock.json` 그대로 (예정) |
| **myFitness#488** (같은 브랜치명 · 오픈 06:14 UTC · 브랜치 head `e413d7c`) | `<머지 SHA>` — 머지 커밋 | 없음 | 없음 | **있음** — next 16.3.5 · vitest · overrides (dev 유래) + `@vitest/coverage-v8` 유지 · `vite-tsconfig-paths` 제거 → 머지 후 worktree `npm install` |

## 1. 머지 전 (저장소별 · 소요 수 초)

```bash
cd ~/workspace/pleiades/repos/<repo> && git merge --abort 2>/dev/null; git checkout integration/pleiades
gh pr close <n> -R fomalhaut84/<repo> --delete-branch                                   # fin 505 · fit 488 — PR 이 열려 있으면
git show-ref --verify --quiet refs/heads/integration/chore-pleiades-sync-20260928 && git branch -D integration/chore-pleiades-sync-20260928
git ls-remote --exit-code --heads origin integration/chore-pleiades-sync-20260928 && git push origin --delete integration/chore-pleiades-sync-20260928
npm ci                                                                                    # fit 만 — 브랜치 위에서 npm install 을 돌렸으므로 lock 기준으로 복원
```

bare `git stash` 금지(worktree 스택 공유). 원본 두 체크아웃은 무접촉이라 할 일 없음.

## 2. 머지 후 (저장소별 · revert 도 PR)

**머지 커밋이 둘이다** — PR 머지 커밋(부모 2: integration/pleiades · sync 브랜치)과 그 안의 `git merge origin/dev` 커밋. revert 는 **PR 머지 커밋을 `-m 1`** 로 한다(첫째 부모 = `integration/pleiades`).

```bash
cd ~/workspace/pleiades/repos/<repo> && git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/fix-pleiades-71-revert
git revert -m 1 --no-edit <머지 SHA>
git push -u origin integration/fix-pleiades-71-revert
gh pr create -R fomalhaut84/<repo> --base integration/pleiades --head integration/fix-pleiades-71-revert \
  --title "revert: dev 동기화 20260928 되돌림 (pleiades#71)" --body "Refs fomalhaut84/pleiades#71 · 되돌리기: 중간 — 이 revert 뒤 dev 를 다시 받으려면 이 커밋을 다시 revert 해야 한다(git 은 revert 된 머지의 부모를 이미 병합된 것으로 본다)"
# → 사용자 머지 후
git checkout integration/pleiades && git pull --ff-only && npm ci                       # fit 은 의존성이 되돌아가므로 npm ci
```

빌드·`pm2 restart` **없음**(미배포). 대칭 변경이므로 두 저장소 모두 — 한쪽만 머지된 상태면 그쪽은 §2, 다른 쪽은 §1.

## 3. 원본 도달분

**없음.** 이 집행은 원본(`~/workspace/myFinance` `dev` · `~/workspace/myFitness` `dev`)을 읽기만 한다(`origin/dev` fetch). fit 원본 `.claude/` 도 건드리지 않는다(#70 항목 5).

## 4. 열린 pleiades 작업 브랜치

집행 시점에 두 저장소의 `integration/*-pleiades-*` 열린 브랜치: **0** (2026-09-28 실측 · 열린 PR 0). 따라서 #70 항목 4(작업 브랜치 follow-up merge)는 이번엔 해당 없음.

## 5. 재감사 정정 반영 (2026-09-28 · 블로커 1 · 권고 3)

- 블로커: fit 검증 전 `npx prisma generate` 명시 실행(`@prisma/client` 6.19.3 동일 → postinstall 미실행). 반영.
- 권고: fin hunk 헤더 양쪽 출처 병합(반영) · lock 영구 분기 비용 기재(§0 의존성 칸 · #73) · "add/add 없음" 문구 정정(계획 문구 · 이 문서 §0 은 처음부터 add/add 로 적음).
