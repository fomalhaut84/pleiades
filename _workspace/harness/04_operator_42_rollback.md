# pleiades#42 롤백 절차 — fit `workflow.md` 8-4 문구·절 순서 정정

> **현재 단계 = 3단계 (2026-09-10 · 머지 + 원본 동기화 완료 · PR #53 Codex P2 반영).** myFitness#373 이 `8b7a224` 로 머지됐고 원본 `~/workspace/myFitness/.claude/rules/workflow.md` 가 동기화됐다. **되돌리려면 1단계(브랜치 삭제)는 무의미하고 2단계 revert + 3단계 원본 복원을 함께 한다.** 아래 1·2단계의 "현재 상태" 표기는 작성 시점(머지 전) 기록으로 남긴다.

- **작성일**: 2026-09-10
- **모드**: I (통합) — `repos/myFitness` worktree · base `integration/pleiades`
- **브랜치**: `integration/chore-pleiades-42`
- **커밋**: `af839dd` + 사전 리뷰·봇 반영 `6d53be5` · `97cc725` → 머지 커밋 **`8b7a224`** (myFitness#373 · squash)
- **분기점 (base)**: `2195854` (= H-3(fit) myFitness#372 머지 지점 · `origin/integration/pleiades`)
- **범위**: `.claude/rules/workflow.md` **1파일** · 21 insertions / 16 deletions · **실행 코드 0**
- **원본 `~/workspace/myFitness`**: ~~무변경~~ **동기화 완료 (2026-09-10 · 사용자 승인 · `git archive integration/pleiades .claude/rules/workflow.md | tar -x`)** — 되돌리기는 3단계
- **대칭 상대**: 없다. fin `.claude/rules/workflow.md` 8-4 가 **이미 정본 판단을 담고 있어** 이번 변경은 fit 단독이다
  (비대칭이 아니라 fit 이 fin 을 따라잡은 것)

## 변경 내용 (되돌릴 대상)

1. **문구** — 8-4 첫 문단에 "GitHub Codex bot 과 동일한 사용자 codex 쿼터를 공유하므로 **원칙적으로 사용하지 않는다**"
   를 명시, 파라미터 블록 앞에 "만약 쓴다면:", 마지막 문장에 쿼터 초과 오판 단서 추가.
   정본은 pleiades `.claude/rules/workflow.md` 9-7 · fin 8-4.
2. **절 순서** — 8-4 를 8-6 뒤에서 8-3 뒤로 이동 (번호는 그대로). 내용 손실 0.
3. 절 끝에 정정 블록 3줄 추가.

파라미터 블록은 손대지 않았다. 정렬 다중집합 비교로 **바뀐 줄은 위 1의 두 문장뿐**임을 확인했다.

## 서비스 영향

**없다.** 변경된 것은 에이전트가 읽는 절차 문서 1파일이다. `src/**`·`prisma/**`·`package.json`·`.github/**`
무접촉. 서버·DB·텔레그램 무접촉. 빌드 산출물이 바뀌지 않으므로 `npm run build` 도 `pm2 restart` 도 필요 없다.
**서비스 중단 가능성 0.** 원본 `~/workspace/myFitness` 는 아직 이 변경을 보지 못하므로 현재 실행 중인
에이전트 절차도 그대로다.

되돌리기 등급: **즉시** (각 단계 명령 1~2줄, 1분 미만).

## 1단계 — 머지 전 (작성 시점 상태 · **지금은 해당 없음** — 머지됨)

PR 이 아직 없다(9-1 사전 리뷰 후 오케스트레이터가 연다). worktree 에서:

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
git checkout integration/pleiades
git branch -D integration/chore-pleiades-42
git push origin --delete integration/chore-pleiades-42   # 원격에 push 완료 상태이므로 필요
```

소요: 10초 미만. 잃는 것: 커밋 `af839dd` 하나. 원본·서비스에 아무 흔적이 없다.

## 2단계 — `integration/pleiades` 머지 후

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
git checkout integration/pleiades && git pull --ff-only
git log --oneline -5                                       # 머지 커밋 SHA 확인 (squash 면 일반 커밋)
git checkout -b integration/chore-pleiades-42-revert        # ★ revert 전에 되돌리기 브랜치로 옮긴다 — 안 하면 base 에 직접 커밋된다
git revert <머지 SHA>                                       # merge commit 이었다면 git revert -m 1 <merge-sha>
git push -u origin integration/chore-pleiades-42-revert
gh pr create -R fomalhaut84/myFitness --base integration/pleiades \
  --head integration/chore-pleiades-42-revert \
  --title "revert: workflow.md 8-4 정정 (pleiades#42)" \
  --body "Reverts <PR 번호>. Refs fomalhaut84/pleiades#42"
```

revert 는 `integration/pleiades` 직접 커밋이 아니라 **되돌리기 브랜치 + PR** 로 낸다 — 머지는 사용자가 직접.
`git revert` 는 즉시 커밋하므로 **브랜치 생성이 반드시 앞선다.**

소요: 1분. `integration/pleiades` 는 `dev` 로 머지되지 않으므로(#25) 이 시점까지도 **서비스는 영향 없다.**

## 3단계 — 원본 동기화 후 (**현재 상태** · 2026-09-10 동기화 완료)

~~이번 집행은 원본을 건드리지 않았다~~ → **동기화됐다 (2026-09-10 · 승인 후 `git archive integration/pleiades .claude/rules/workflow.md | tar -x -C ~/workspace/myFitness` · `diff -rq` 로 worktree 와 동일 확인 · index 무변경).** 되돌리기는 아래 명령으로 **직전 판(`2195854` 의 파일)을 원본에 다시 풀면 된다** — `git archive 2195854 .claude/rules/workflow.md | tar -x -C ~/workspace/myFitness`. 사전 사본은 세션 스크래치패드라 소멸했다(원본 복원 경로는 `git archive` 가 유일).

동기화를 한 뒤에 되돌려야 하는 경우: fit `.claude/` 는 원본에서 **gitignored** 라 git 으로 복원되지 않는다.
**동기화 직전에 사본을 떠 둔다.**

```bash
# 동기화 직전 (필수 선행)
tar czf ~/fit-harness-$(date +%Y%m%d).tgz -C ~/workspace/myFitness .claude CLAUDE.md

# 되돌리기 (사본이 있을 때)
tar xzf ~/fit-harness-<YYYYMMDD>.tgz -C ~/workspace/myFitness
```

사본이 없으면 worktree 의 **분기점에서 이 파일 하나만** 꺼낸다 — `.claude` 전체를 꺼내면 그 뒤의 다른
하네스 변경까지 옛 판으로 덮는다. 경로는 **인자로 나열**한다(zsh 미인용 변수는 단일 pathspec):

```bash
git -C ~/workspace/myFitness archive 2195854 \
  .claude/rules/workflow.md \
  | tar -x -C ~/workspace/myFitness
```

소요: 30초. 원본 체크아웃이 `dev`/`main` 으로 돌아가면 ignored 파일이 워킹트리에서 지워지므로
(`workflow.md` 10절 · 실측: fit `.claude/` 17파일 + `CLAUDE.md` 소실) **되돌린 직후 위 명령을 다시 돌린다.**

## 검증 기록 (커밋 시점)

- 8절 4종(lint / typecheck / test / build): **해당 없음** — 문서 1파일 변경, 실행 코드·설정 무변경.
- 절 순서 확인 (`grep -n "^#### 8-" .claude/rules/workflow.md`):

```
148:#### 8-0. 적용 조건 (필수 vs self-review)
173:#### 8-1. 로컬 사전 리뷰 (에이전트, 조건부 필수)
205:#### 8-2. Codex bot 자동 리뷰 (PR 오픈 후)
219:#### 8-3. 반복 루프
242:#### 8-4. codex-cli MCP (선택 대안)
263:#### 8-5. 회귀 방지 테스트 (수정 필수 등급 반영 시)
279:#### 8-6. PR body 에 리뷰 결과 명시
```

- 내용 손실 0 확인: 변경 전/후 파일의 정렬 다중집합 비교 → 차이는 추가 5줄(정정 블록 3 · "만약 쓴다면:" 1 · 공백 1)과
  치환 2줄(8-4 첫 문단 · 마지막 문장)뿐.
- `git diff --stat`: `1 file changed, 21 insertions(+), 16 deletions(-)` · `git status` clean.

## 집행 기록 (2026-09-10)

- 착수 직전 재감사: worktree clean · `integration/pleiades` = `origin/integration/pleiades` = `2195854`
- 브랜치 `integration/chore-pleiades-42` 생성 → 커밋 `af839dd` → `git push -u origin` 완료
- ~~PR 미개설~~ → 9-1 사전 리뷰(major 1 반영 `6d53be5`) → **myFitness#373** → 봇 P2 1 반영(`97cc725`) → **머지 `8b7a224`** → worktree pull · orphan 0 → **원본 동기화 완료** → #42 종료
