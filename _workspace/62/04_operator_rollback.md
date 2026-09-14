# 04 — operator 롤백 절차: #62 fin·fit `workflow.md` 8-4 `gpt-4o` 예시 정정

**작성:** 2026-09-14(집행 전 초안 → 머지 후 실값 갱신 · myFinance#496 `5467407` · myFitness#375 `3182c1d`) · **형식:** `dual-repo-change` 5-1 · 체크리스트 `_workspace/61/rollback-checklist.md` **첫 적용**(#66)
**집행 2026-09-14 · 커밋까지 · push 전**
**모드 I · 대칭 변경** · 이슈 `fomalhaut84/pleiades#62` · 되돌리기 등급: **즉시**(worktree) · 원본 도달분 fit **중간**(ignored · git 이력 없음) · fin 미러 **즉시**

## 0. 상태 판정 표 (집행 후 갱신)

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **myFinance#496** (`integration/chore-pleiades-62` → `integration/pleiades` · 오픈 2026-09-14 01:53 UTC) | **머지 `5467407`**(squash · 2026-09-14 · 브랜치 head `24d0782`) | 없음 (배포 트리거 밖 · β2 없음) | fin 모드 S 미러 PR myFinance#498 `36ba209` — **완료 2026-09-14** | 없음 |
| **myFitness#375** (`integration/chore-pleiades-62` → `integration/pleiades` · 오픈 2026-09-14 01:53 UTC) | **머지 `3182c1d`**(squash · 2026-09-14 · 브랜치 head `c190c74`) | 없음 | fit 원본 `.claude/rules/workflow.md` `git archive` 동기화 — **완료 2026-09-14**(사전 사본 `_workspace/62/backup/fit-harness-pre-sync.tar` · 부재 목록 0건 · 사전 md5 `1560173f…` · worktree 판과 동일 · index 무변경) | 없음 |
| **myFinance#498** (미러 · 이슈 myFinance#497 · `chore/497-1` → `dev` · 커밋 `b049293`) | **머지 `36ba209`**(squash · 2026-09-14) | 없음 (문서 · fin `ci.yml` Lint·Typecheck·Build 잡만 · 실서비스 무관) | — | 없음 |

## 1. 머지 전 (저장소별 · 소요 수 초) — **2026-09-14 머지됨 · 지금은 해당 없음(§2 로)**

```bash
# fin
cd ~/workspace/pleiades/repos/myFinance && git checkout integration/pleiades
gh pr close 496 -R fomalhaut84/myFinance --delete-branch                          # PR 이 열려 있으면 (로컬·원격 함께)
git show-ref --verify --quiet refs/heads/integration/chore-pleiades-62 && git branch -D integration/chore-pleiades-62
git ls-remote --exit-code --heads origin integration/chore-pleiades-62 && git push origin --delete integration/chore-pleiades-62   # push 후 PR 전
# fit — 동일 (repos/myFitness · gh pr close 375 -R fomalhaut84/myFitness --delete-branch)
```

의존성 변경 없음 → `npm ci` 불필요. bare `git stash` 금지(worktree 스택 공유).

## 2. 머지 후 (저장소별 · revert 도 PR · 소요 수 분 + 사용자 머지 대기)

```bash
cd ~/workspace/pleiades/repos/<repo> && git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/fix-pleiades-62-revert
git revert --no-edit <머지 SHA>                                                    # squash 1커밋 (부모 1개 실측) · fin 5467407 · fit 3182c1d
git push -u origin integration/fix-pleiades-62-revert
gh pr create -R fomalhaut84/<repo> --base integration/pleiades --head integration/fix-pleiades-62-revert \
  --title "revert: workflow.md 8-4 model 예시 정정 되돌림 (pleiades#62)" --body "Refs fomalhaut84/pleiades#62 · 되돌리기: 즉시"
# → 사용자 머지 후
git checkout integration/pleiades && git pull --ff-only
```

빌드·`pm2 restart` **없음**(문서 · 미배포). 대칭 변경이므로 **두 저장소 모두** 위 블록 — 한쪽만 머지된 상태면 그쪽은 §2, 다른 쪽은 §1.

## 3. 원본 도달분

### 3-1. fit 원본 하네스 (`git archive` 동기화의 되돌리기 · 등급 중간)

**동기화 시점에 해 둘 것(5-1 원칙 3 · 체크리스트 §3-1):**

```bash
B=~/workspace/pleiades/_workspace/62/backup; mkdir -p "$B"                          # gitignored · 세션 밖
git -C ~/workspace/myFitness diff --no-renames --name-only --diff-filter=A 3182c1d^ 3182c1d -- .claude/rules/workflow.md \
  | while read -r p; do test -e ~/workspace/myFitness/"$p" || echo "$p"; done > "$B/absent-before-sync.txt"   # 예상: 빈 파일 (수정만 · 추가 0)
for p in .claude/rules/workflow.md; do test -e ~/workspace/myFitness/"$p" && echo "$p"; done \
  | tar -C ~/workspace/myFitness -cf "$B/fit-harness-pre-sync.tar" -T -
```

**롤백:**

```bash
# (a) 사전 사본
xargs -I{} rm -f ~/workspace/myFitness/{} < ~/workspace/pleiades/_workspace/62/backup/absent-before-sync.txt   # 빈 파일이면 no-op
tar -C ~/workspace/myFitness -xf ~/workspace/pleiades/_workspace/62/backup/fit-harness-pre-sync.tar
# (b) 사본이 없으면 — 되돌려진 트리(revert PR 머지 후 integration/pleiades HEAD · 머지 전이면 3182c1d^ = 3818208)
xargs -I{} rm -f ~/workspace/myFitness/{} < ~/workspace/pleiades/_workspace/62/backup/absent-before-sync.txt   # 이번은 추가 0 이라 no-op · 형식 유지 (재감사 O-2)
git -C ~/workspace/myFitness archive <reverted-sha> .claude/rules/workflow.md | tar -x -C ~/workspace/myFitness
```

디렉터리 통째 `rm -rf` 금지(`settings.local.json`). 확인: `diff ~/workspace/myFitness/.claude/rules/workflow.md <(git -C ~/workspace/myFitness show <reverted-sha>:.claude/rules/workflow.md)`.

### 3-2. fin 모드 S 미러 PR 의 되돌리기 (등급 즉시)

```bash
cd ~/workspace/myFinance && git checkout dev && git pull --ff-only
git checkout -b fix/497-revert && git revert --no-edit 36ba209 && git push -u origin fix/497-revert
gh pr create -R fomalhaut84/myFinance --base dev --head fix/497-revert \
  --title "revert: workflow.md 8-4 model 예시 미러 되돌림 (#497)" --body "Refs fomalhaut84/myFinance#497"
# → 사용자 머지 · git checkout dev && git pull --ff-only
```

미러가 `dev`→`main` 릴리즈까지 간 뒤라면 모드 H 경로(`main` 에서 revert → `main`·`dev` 두 PR). 문서 파일이라 배포 산출물 무관.

## 4. 서비스 영향 — **없음**

문서 1파일 ×2(+ 미러 1). PM2 6프로세스·DB·텔레그램 무접촉. `integration/pleiades` 는 배포·CI 트리거 밖(6개 워크플로 전부 `dev`/`main`·`release` 트리거 · 재감사 6). fin 미러 PR 은 fin `ci.yml`(`pull_request: [dev, main]`)의 `Lint, Typecheck & Build` 잡을 돈다 — postgres:16 서비스 + `npm ci` + `prisma generate` + `prisma migrate deploy`(CI 전용 DB `myfinance_ci`) + lint + `tsc --noEmit` + build. 실서비스와 무관하며 서비스 영향 판정은 불변 (재감사 C-2).
