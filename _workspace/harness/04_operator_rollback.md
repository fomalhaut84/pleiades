# 하네스 통합 집행 — 롤백 절차 (2026-09-07)

`dual-repo-change` §5-4. 005 §4-13 의 H-0 · H-1b · H-5 · H-3(fin) · H-4 를 집행한 결과와 되돌리는 방법.
**대상 저장소 `dev`·`main` 에는 직접 쓰지 않았다** — 전부 작업 브랜치 + PR 이고 머지는 사용자가 한다.

## 집행 결과

| 단계 | 저장소 · 브랜치 | PR | 이슈 | 되돌리기 |
|---|---|---|---|---|
| 005 발행 · 004 정정 · CLAUDE.md | pleiades `chore/1-1` | fomalhaut84/pleiades#19 | #1 (`Closes`) | 즉시 — `git revert <merge>` |
| **H-0** 룰 정정 | pleiades `chore/10-1` (#19 위 스택) | #20 | #10 (`Closes`) | 즉시 — `git revert <merge>` |
| **H-1b · H-5** orphan-check 복사 · `bin/claude-with` | pleiades `chore/21-1` (#20 위 스택) | #22 | #21 (`Closes`) | 즉시 — `git revert <merge>` (파일 2 + CLAUDE.md·README·005 몇 줄) |
| **H-3(fin)** #8 fin `workflow.md` | myFinance 원본 `chore/pleiades-8-1` from `dev` | fomalhaut84/myFinance#492 | pleiades#8 (`Refs`, 대칭 변경 — fit PR 머지 후 수동 종료) | 즉시 — `git -C ~/workspace/myFinance revert <merge>` + CI 수 분 |
| **H-4** fit tracked 화 | myFitness 원본 `chore/368-1` from `dev` | fomalhaut84/myFitness#369 | myFitness#368 (`Closes`) | **중간** — `git -C ~/workspace/myFitness revert <merge>`. push 된 이력에는 19파일이 남는다 |
| H-3(fit) | — | **미착수** (#369 머지 후 별도 승인) | pleiades#8 | — |
| H-1 Codex 대응 신규 작성 | — | **미착수** (Q41 이름) | — | — |

## 머지 전 롤백 (PR 닫기)

```bash
gh pr close <n> -R <repo> --delete-branch      # 되돌리기 즉시. 원본 체크아웃은 이미 dev/main 으로 복귀돼 있다
```

## 머지 후 롤백

```bash
# pleiades (스택 순서의 역순으로: #22 → #20 → #19)
git -C ~/workspace/pleiades checkout dev && git pull
git -C ~/workspace/pleiades revert -m 1 <merge-sha>   # → PR 로 올린다. dev 직접 push 금지

# myFinance — 단독 작업 경로(모드 S). 서비스 영향 없음(문서). deploy.yml 은 release 이벤트 전용
git -C ~/workspace/myFinance checkout dev && git pull && git checkout -b chore/pleiades-8-revert
git -C ~/workspace/myFinance revert -m 1 <merge-sha> && git push -u origin chore/pleiades-8-revert   # → PR to dev

# myFitness — 같은 경로. revert 하면 .gitignore 가 되돌아가고 19파일이 untracked 로 돌아간다(워킹트리 파일은 유지)
git -C ~/workspace/myFitness checkout dev && git pull && git checkout -b chore/368-revert
git -C ~/workspace/myFitness revert -m 1 <merge-sha> && git push -u origin chore/368-revert
```

## 빌드 · 재시작 · 세션 초기화

**없음.** 다섯 단계 전부 `.claude/**`·`CLAUDE.md`·`.gitignore`·`docs/**`·`bin/` 뿐이다. PM2 프로세스·Nginx·DB 무관.
다음 Claude 세션부터 새 룰이 적용된다. `--resume` 세션은 옛 시스템 프롬프트를 붙잡을 수 있으니 새 세션으로 연다.

## git 밖에서 해야 하는 것 (PR 로 못 고친다 — 005 §4-12)

- auto memory 트리거 줄: fin `MEMORY.md:4,5,7` · ple `MEMORY.md:4` — 스킬 이름은 바뀌지 않았으므로 **이번 집행에서는 갱신 불필요**.
- fin `feedback_session_management.md:59` 는 fin `.claude/` 를 untracked 로 기술 — **사실과 다름**(tracked 16). fin 세션에서 고친다.
