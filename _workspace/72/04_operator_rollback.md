# 04 — operator 롤백 절차: #72 B — fit `.claude/`·`CLAUDE.md` tracked 화

**작성:** 2026-09-28(집행 중 · 머지 후 실값 갱신) · **형식:** `dual-repo-change` 5-1 · 체크리스트 `_workspace/61/rollback-checklist.md`
**모드 S**(원본 `~/workspace/myFitness` · base `dev` · 이슈 `fomalhaut84/myFitness#493` · 원 이슈 pleiades#72) · 되돌리기 등급: **즉시 — 단 사본 필수**(revert 가 워킹트리의 하네스 파일을 지운다) · 원본 도달분: 이 PR 이 곧 원본

## 0. 상태 판정 표 (머지 후 갱신)

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **myFitness#<n>** (`chore/493-1` → `dev` · 커밋 `<커밋>`) | `<머지 SHA>` | 없음 (문서·하네스 · 빌드 산출물 무관 · 다음 릴리즈에 실리나 영향 없음) | — | 없음 |

## 1. 머지 전

```bash
cd ~/workspace/myFitness && git checkout dev
gh pr close <n> -R fomalhaut84/myFitness --delete-branch      # 파일은 워킹트리에 그대로 남고 .gitignore 가 dev 판으로 돌아가 다시 ignored
```

## 2. 머지 후 (revert 도 PR · **사본 먼저**)

```bash
cd ~/workspace/myFitness && git checkout dev && git pull --ff-only
B=~/workspace/pleiades/_workspace/72/backup; mkdir -p "$B"
git archive <머지 SHA> .claude CLAUDE.md > "$B/fit-harness-tracked.tar"          # 5-1 원칙 3 — revert 는 이 파일들을 워킹트리에서 지운다
git checkout -b fix/493-revert
git revert --no-edit <머지 SHA>                                                    # squash 면 -m 없음 · merge commit 이면 -m 1 — 머지 후 %P 로 확인
git push -u origin fix/493-revert
gh pr create -R fomalhaut84/myFitness --base dev --head fix/493-revert --title "revert: .claude/·CLAUDE.md tracked 화 되돌림 (#493)" --body "Refs #493 · Refs fomalhaut84/pleiades#72 · 되돌리기: 즉시(사본 복원 포함)"
# → 사용자 머지 후
git checkout dev && git pull --ff-only
tar -x -C ~/workspace/myFitness -f "$B/fit-harness-tracked.tar"                  # ignored 물리 파일로 복원 · 확인: git status -s 0 · test -f CLAUDE.md
```

## 3. 원본 도달분

이 PR 이 원본이다. worktree(`integration/pleiades`)는 건드리지 않는다 — 다음 dev 동기화가 add/add 충돌(내용 다른 파일만 · 약 8)을 **dev 판**으로 해결하며 흡수한다. revert 하면 그 동기화 뒤에 `.claude/` 가 dev 에서 삭제된 상태가 integration 으로 들어오므로, 그때 integration 의 tracked 판(#369)을 지킬지 다시 정한다.

## 4. 사고 기록 (2026-09-28 07:33Z · 집행 중)

PR 오픈 뒤 원본을 `chore/493-1` → `dev` 로 체크아웃하자 **git 이 tracked 파일 19개를 워킹트리에서 지웠다**(dev 에서는 그 경로가 ignored + 부재 → checkout 이 "제거"로 처리 · #27 과 같은 유형 · `settings.local.json` 만 남음). `git archive 0f4d141 .claude CLAUDE.md | tar -x` 로 **즉시 복원**(19파일 · 커밋과 동일 · md5 일치 · index 무변경).
**교훈:** 이 PR 이 머지되기 전까지 원본에서 `dev` 로 돌아가면 하네스가 지워진다. (a) 브랜치에 머물거나 (b) 돌아간 직후 위 archive 로 복원한다. 머지 후 `git pull --ff-only` 는 ignored 파일과 같은 내용의 tracked 파일을 가져오므로 충돌하지 않는다(다르면 git 이 거부 — 그때는 ignored 사본을 지우고 pull).

## 5. 결과 (2026-09-28 · 사용자 방침 재확인 → #80)

**PR myFitness#494 는 머지하지 않고 닫았다.** Codex 4라운드(P1 1→2→1→3 · 매번 새 파일 · fit 하네스 첫 봇 리뷰)에서 사용자가 원칙을 재확인: pleiades 발 변경은 서비스 `dev`/`main` 에 닿지 않는다. 처리:
- 사본 2개: `backup/fit-harness-branch-f0ad4f7.tar`(스킬 정정 포함 판) · `backup/fit-harness-original-0f4d141.tar`(PR 전 원본 판) — 122880 B 씩.
- 원본을 `dev` 로 되돌리며 tracked 파일 19개가 워킹트리에서 지워짐(§4 와 같은 유형) → `0f4d141` 판을 `tar -x` 로 ignored 복원 · md5 일치 · `.gitignore` dev 판 · status 0.
- 로컬·원격 `chore/493-1` 삭제. fit 이슈 #493·#495~#498 은 fit 단독 세션 몫으로 남김(스킬 정정 판은 위 사본에 있다).
- #72 는 **A(원본 → worktree 복사 · 모드 I)** 로 재결정. 이 문서의 §1~§3 은 실행되지 않았다.

