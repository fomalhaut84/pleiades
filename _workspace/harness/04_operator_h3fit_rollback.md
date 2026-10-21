# H-3(fit) 롤백 절차 — pleiades#8 하네스 전파

- **작성일**: 2026-09-09
- **모드**: I (통합) — `repos/myFitness` worktree · base `integration/pleiades`
- **브랜치**: `integration/chore-pleiades-8-fit`
- **커밋**: `68b34af` (단일 커밋)
- **분기점 (base)**: `626a201`
- **범위**: 하네스 문서 10파일 · **실행 코드 0** · 원본 `~/workspace/myFitness` 무변경
- **대칭 상대**: myFinance#492 (커밋 `6542152`, 머지 완료)

## 서비스 영향

**없다.** 변경된 것은 `.claude/**` 9파일 + `CLAUDE.md` 뿐이고 전부 에이전트가 읽는 절차 문서다.
`src/**`·`prisma/**`·`package.json`·`.github/**` 는 손대지 않았다. 빌드 산출물이 바뀌지 않으므로
`npm run build` 재실행도 `pm2 restart` 도 필요 없다. **서비스 중단 가능성 0.**

되돌리기 등급: **즉시** (세 단계 전부 명령 1~2줄, 각 1분 미만).

## 1단계 — 머지 전 (현재 상태)

PR 이 아직 없거나 열려만 있는 동안. worktree 에서:

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
git checkout integration/pleiades
git branch -D integration/chore-pleiades-8-fit
# 원격에 push 했다면
git push origin --delete integration/chore-pleiades-8-fit
```

소요: 10초 미만. 잃는 것: 이 커밋 하나. 원본·서비스에 아무 흔적이 없다.

## 2단계 — `integration/pleiades` 머지 후

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
git checkout integration/pleiades && git pull --ff-only
git log --oneline -5                                          # 머지 커밋 SHA 확인 (#372 는 squash → 2195854, 일반 커밋)
git checkout -b integration/chore-pleiades-8-fit-revert       # ★ revert 전에 되돌리기 브랜치로 옮긴다 — 안 하면 base 에 직접 커밋된다 (PR #44 Codex P2)
git revert 2195854                                            # merge commit 이었다면 git revert -m 1 <merge-sha>
git push -u origin integration/chore-pleiades-8-fit-revert
gh pr create -R fomalhaut84/myFitness --base integration/pleiades --head integration/chore-pleiades-8-fit-revert --title "revert: H-3(fit) (pleiades#8)" --body "Reverts #372. Refs fomalhaut84/pleiades#8"
```

revert 는 `integration/pleiades` 직접 커밋이 아니라 **되돌리기 브랜치 + PR** 로 낸다 — 머지는 사용자가 직접. `git revert` 는 즉시 커밋하므로 **브랜치 생성이 반드시 앞선다.**

소요: 1분. `integration/pleiades` 는 `dev` 로 머지되지 않으므로(#25) 이 시점까지도 **서비스는 영향 없다.**

## 3단계 — 원본 동기화 후 (별도 단계 · 이 집행의 범위 밖)

`~/workspace/myFitness` 로 서비스 미러(모드 S)를 넣은 **뒤에** 되돌려야 하는 경우.
fit `.claude/` 는 원본에서 **gitignored** 라 git 으로 복원되지 않는다 — 동기화 **전에 사본을 떠 둔다.**

```bash
# 동기화 직전 (필수 선행)
tar czf ~/fit-harness-$(date +%Y%m%d).tgz -C ~/workspace/myFitness .claude CLAUDE.md

# 되돌리기
tar xzf ~/fit-harness-<YYYYMMDD>.tgz -C ~/workspace/myFitness
```

사본을 뜨지 못한 채 되돌려야 하면 worktree 의 분기점에서 **H-3 이 바꾼 10파일만** 꺼낸다 — `.claude` 디렉터리 전체를 꺼내면
H-3 이후의 다른 하네스 변경까지 옛 판으로 덮는다 (PR #44 Codex P2). 경로는 **인자로 나열**한다(zsh 미인용 변수는 단일 pathspec):

```bash
git -C ~/workspace/myFitness archive 626a201 \
  .claude/rules/workflow.md .claude/agents/release-manager.md .claude/agents/workflow-conductor.md \
  .claude/agents/codex-liaison.md .claude/skills/branch-workflow/SKILL.md .claude/skills/codex-review-loop/SKILL.md \
  .claude/skills/release-flow/SKILL.md .claude/skills/session-handoff/SKILL.md .claude/skills/myfitness-orchestrator/SKILL.md \
  CLAUDE.md \
  | tar -x -C ~/workspace/myFitness
```

소요: 30초. 원본 체크아웃이 `dev`/`main` 으로 돌아가면 ignored 파일이 워킹트리에서 지워지므로
(`workflow.md` 10절 · 실측: fit `.claude/` 17파일 + `CLAUDE.md` 소실) **되돌린 직후 위 명령을 다시 돌린다.**

## 검증 기록 (커밋 시점)

`npx prisma generate` 선행 후 4종 전부 exit 0 — lint / typecheck / test(verify 스크립트 2개) / build.
cold build (`.next` 삭제 후) **9.5 s** wall (35.7 s user · 431 % cpu).
되돌린 뒤에도 같은 4종을 돌려 exit 0 을 확인한다.

---

## 집행 기록 (2026-09-09 16:15 KST)

- PR myFitness#372 머지 `2195854` · worktree `integration/pleiades` pull 완료 · 브랜치 삭제 · orphan 0
- 원본 동기화 실행 — 사전 사본 `scratchpad/fit-original-claude-backup-20260909-161547.tar`(세션 한정 · 32 entries). 세션이 끝나면 사본은 사라지므로 **되돌리기는 3단계의 `git archive 626a201 …` 폴백**을 쓴다
- 첫 시도는 zsh 미인용 변수(단일 pathspec)로 실패 → 경로 명시로 재실행 · `diff -rq` = `settings.local.json` 만 차이
