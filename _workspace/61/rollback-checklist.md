# 롤백 체크리스트 — 상황별 명령 (초안 · #66 에서 확정)

**출처:** #61 · PR #65 Codex 7라운드(P1 9 · P2 5 · 전부 반영). 규칙 자체는 `dual-repo-change` 5-1(무엇을 담는가)이고,
이 문서는 **어떻게**(상황별 명령)다. 명령 목록은 상황마다 반례가 나오므로 **정본이 아니라 참고**다 —
다음 대상 저장소 집행의 롤백 문서에 실제로 적용해 보고 #66 에서 확정한다.
**전례:** `_workspace/1a-2/04_operator_rollback.md`(Codex 4라운드 통과본).

## 0. 상태 판정 — 명령보다 먼저

롤백 문서 첫머리에 PR 마다 한 행:

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| 예: myFitness#374 | 머지 `3818208`(squash) | 없음 (`integration/pleiades` 는 배포 트리거 밖) | fit `.claude/` 2파일 `git archive` 동기화 | lock +69 |

- **모드 H 는 `main`·`dev` 두 행** — 따로 머지되므로 한쪽만 머지된 혼합 상태가 생긴다. 머지된 대상은 §2, 열린 대상은 §1 (PR #65 4회차 P1)
- **모드 S 미러 PR 은 별도 행** (fin·fit 어느 쪽이든 — 미러는 두 저장소 모두 허용 · 7회차 P1)
- **β2 병행 인스턴스**(`myfinance-int`·`myfitness-int` · 003 §8-1 · 004 §8-4 Q42)가 떠 있으면 모드 I 도 배포·재시작 칸이 "있음" (7회차 P2)
- **모드 S 변경이 `dev`→`main` 릴리즈까지 갔으면** 되돌리기도 모드 H 경로(`main` 에서 revert → `main`·`dev` 두 PR → 태그·재배포) (7회차 P1)

## 1. 머지 전

```bash
git checkout <base>
gh pr close <n> -R <owner>/<repo> --delete-branch          # PR 이 열려 있으면. 로컬·원격 브랜치를 함께 지운다 (--help 실측)
git show-ref --verify --quiet refs/heads/<branch> && git branch -D <branch>          # gh 가 못 지웠을 때만 (무조건 -D 는 스크립트 중단 · 2회차 P2)
git ls-remote --exit-code --heads origin <branch> && git push origin --delete <branch>   # push 뒤 PR 전 상태 (gh pr create --head 는 push 하지 않는다 · 6회차 P2)
npm ci                                                       # 의존성 변경일 때
```

- 브랜치를 남기고 되돌리려면 `git reset --hard <base-sha>` 후 `npm ci`. **bare `git stash` 금지** — worktree 가 스택을 공유한다

## 2. 머지 후 — revert 도 PR 을 거친다

```bash
git checkout <base> && git pull --ff-only
git checkout -b <revert-branch>                              # git revert 는 즉시 커밋하므로 브랜치가 먼저 (1회차 P1)
git revert --no-edit <sha>                                   # squash 면 그 1커밋. merge commit 이면 git revert -m 1 <merge-sha>
git push -u origin <revert-branch>
gh pr create -R <owner>/<repo> --base <base> --head <revert-branch> \
  --title "revert: … (<issue-repo>#<issue>)" --body "Refs <issue-repo>#<issue> · 되돌리기: <등급>"
# → 사용자 머지 후
git checkout <base> && git pull --ff-only                    # revert 브랜치에 머문 채 pull 하면 base 가 안 움직인다 (1회차 P2)
npm ci                                                       # 의존성 변경일 때
npm run build && pm2 restart <app>                           # 배포됐던 변경일 때 · 정확한 프로세스 이름 · 실행은 사용자 (5회차 P1)
```

- `<sha>` — 대상 저장소·pleiades PR 은 전부 squash(부모 1개 · #19·#20·#22·#374·#492·#369 실측). `revert -m 1` 은 squash 에 *"commit is not a merge"* 로 실패한다
- **머지 전에 쓴 문서는 `<머지 SHA>` 로 비워 두고 머지 후 실값으로 채운다** (PR #64 P2). "현재 상태" 표기도 함께 갱신
- 모드 H — `main`·`dev` **각각** 위 블록 (각 대상의 실제 SHA · 1회차 P1)

## 3. 원본 도달분

### 3-1. fit 원본 하네스 동기화 (`git archive | tar -x`) 의 되돌리기

**동기화 시점에 해 둘 것** (안 해 두면 롤백이 불가능한 경우가 있다):

```bash
B=~/workspace/pleiades/_workspace/<주제>/backup; mkdir -p "$B"   # gitignored (_workspace/**/backup/) · 세션 밖 — 스크래치 사본은 #42 에서 소멸
# 1) 원본에 없는 경로 목록이 먼저 — tar 는 없는 경로에 "Cannot stat" exit 2 로 실패한다 (8회차 P2)
git -C ~/workspace/myFitness diff --no-renames --name-only --diff-filter=A <sha>^ <sha> -- <paths> \
  | while read -r p; do test -e ~/workspace/myFitness/"$p" || echo "$p"; done > "$B/absent-before-sync.txt"
# 2) 사전 사본은 지금 원본에 존재하는 경로만
for p in <paths>; do test -e ~/workspace/myFitness/"$p" && echo "$p"; done \
  | tar -C ~/workspace/myFitness -cf "$B/fit-harness-pre-sync.tar" -T -
```

- `--no-renames` 필수 — rename 은 `R` 로 분류돼 `A` 에서 빠진다 (fit `f2f27ed` 실측: A 1 → 11 · 4회차 P2)
- `absent-before-sync.txt` 는 **"원본에 새로 생긴 파일"** 이다. `A` 필터만으로는 "git 에 추가됨"이라 tracked 화 커밋(#369 유형)을 되돌릴 때 원본에 있던 하네스를 지운다 (6회차 P1)

**롤백:**

```bash
# (a) 사전 사본이 있으면 — 가장 안전
xargs -I{} rm -f ~/workspace/myFitness/{} < ~/workspace/pleiades/_workspace/<주제>/backup/absent-before-sync.txt
tar -C ~/workspace/myFitness -xf ~/workspace/pleiades/_workspace/<주제>/backup/fit-harness-pre-sync.tar
# (b) 사본이 없으면 — 되돌려진 트리를 푼다
xargs -I{} rm -f ~/workspace/myFitness/{} < .../absent-before-sync.txt
git -C ~/workspace/myFitness archive <reverted-sha> <paths-existing-in-reverted-sha> | tar -x -C ~/workspace/myFitness
```

- `<reverted-sha>` = revert PR 머지 후 `integration/pleiades` HEAD(머지 전이면 `<sha>^`). **`<sha>` 를 넣으면 되돌리려던 하네스를 다시 푼다** (1회차 P1)
- `tar -x` 는 아카이브에 없는 파일을 지우지 않는다 → 새 파일 삭제가 앞서야 한다. 없는 경로를 `git archive` 에 이름 지으면 pathspec 오류 (2회차 P1)
- **디렉터리 통째 `rm -rf` 금지** — 원본 `.claude/` 의 `settings.local.json` 은 아카이브에 없어 복구 불가 (3회차 P1)

### 3-2. 모드 S 서비스 미러 PR 의 되돌리기

미러를 받은 저장소(fin·fit 무관)의 **원본** `dev` 에서 §2 를 한 번 더 — `fix/<그 저장소 issue>-revert` → PR `--base dev` → 사용자 머지.
fit 은 3-1 과 **별개로** 필요하다 — archive 는 ignored 원본만 되돌리고 `dev` 의 tracked 변경은 남는다 (7회차 P1).

## 4. 등급

원본 도달분까지 포함해 매긴다 — 1a-2 는 worktree 만 보면 즉시, 원본 동기화분은 중간(원본 fit `.claude/` 는 git 이력이 없다).
승인 게이트(1절) 롤백 칸과 집행 후 문서가 달라지면 승인 무효.

## 5. Codex 가 잡은 반례 목록 (PR #65 · 라운드순)

| 회차 | 등급 | 반례 | 반영 위치 |
|---|---|---|---|
| 1 | P1 | 모드 H 는 PR 둘 → revert 도 둘 | §0 · §2 |
| 1 | P1 | `git archive <sha>` 가 되돌릴 커밋 자체 | §3-1 |
| 1 | P2 | 머지 후 pull 이 revert 브랜치에서 | §2 |
| 2 | P1 | `tar -x` 는 새 파일을 못 지운다 | §3-1 |
| 2 | P2 | `gh pr close --delete-branch` 뒤 무조건 `branch -D` | §1 |
| 3 | P1 | 디렉터리 `rm -rf` 가 `settings.local.json` 삭제 | §3-1 |
| 4 | P1 | 모드 H 한쪽만 머지된 혼합 상태 | §0 |
| 4 | P2 | rename 은 `R` | §3-1 |
| 5 | P1 | 배포된 변경은 build + pm2 restart | §2 |
| 6 | P1 | `A` 필터 ≠ 원본에 새로 생김 (tracked 화) · 사전 사본은 세션 밖 | §3-1 |
| 6 | P2 | push 후 PR 전 원격 브랜치 | §1 |
| 7 | P1 | 릴리즈된 모드 S 는 `dev` revert 로 안 돌아온다 | §0 |
| 7 | P2 | β2 병행 인스턴스 재시작 | §0 |
| 7 | P1 | 미러는 fin 만이 아니다 | §3-2 |
| 8 | P2 | 사전 사본 tar 에 원본 부재 경로를 주면 `Cannot stat` 실패 — 목록 먼저, 존재 경로만 tar | §3-1 |
