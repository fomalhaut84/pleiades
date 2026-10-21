# H-3(fit) 착수 직전 재감사 — 2026-09-09 (`dual-repo-change` 2절 · 모드 I)

> 감사관(`reversibility-auditor`, 읽기 전용) 결과를 오케스트레이터가 저장했다. 대상 `repos/myFitness` · ref `integration/pleiades` · HEAD `626a201` · clean.

**정정 4건 · 미확인 3건 → 판정: 중단(계획 개정 후 착수).** 사용자 재승인 2026-09-09: **10파일**(3-check 4종화 포함) + **머지 후 원본 동기화**(별도 승인 항목).

## 방법론 정정 0 — `git grep -E` 는 `\b` 를 지원하지 않는다
`git grep --text -lE '\bP[0-3]\b|…'` 는 8파일 중 2파일만 낸다(POSIX ERE 에 `\b` 없음). `git grep` 에는 `-P`, `/usr/bin/grep` 에는 `-E`. 이 감사에서 실제로 한 번 났고 재측정으로 뒤집었다.

## 정정 표
| # | 주장 | 판정 | 실제 |
|---|---|---|---|
| 1 | 파일 8개가 전수 | 정정 | **9개** — `.claude/agents/release-manager.md` 누락. P 표기 0 이라 grep 에 안 걸리지만 "사용자 머지 → 태그" 사이 봇 게이트가 없는 실행 절차서(`:15-17`). `release-flow` Step 5→6 도 게이트 삽입 필요. fit 하네스 전체에 "봇 P0/P1=0 까지 머지 금지" 문장 **0줄**. fin #492 2회차 Codex P1 ② 와 같은 자리 |
| 2 | 8절 검증 4종이 worktree 에서 돈다 | 정정 | **`npx prisma generate` 선행 필수** — `src/generated/prisma` 부재로 typecheck·test·build 실패. verify 스크립트 2개는 DB·env 불요(소스 판정 · CI 주석 일치). `next build` 는 14페이지 중 13 `force-dynamic` + 1 `use client` 라 실서비스 DB 쿼리 0(worktree `.env` 의 `DATABASE_URL` 은 실서비스 `myfitness` — 확인 필요했음). 산출물 전부 ignored(`.gitignore:11,54,16`). **CI 는 안 돈다**(`ci.yml` dev/main 만) |
| 3 | 원본 파일을 지울 경로 없음(#27) | 정정 | 지우지는 않지만 **갱신도 안 된다.** 원본 `main` 은 `.gitignore:35` 가 `.claude/` 전체 ignore → untracked 물리 파일. `bin/claude-with fit` 은 원본을 읽는다(`bin/claude-with:23,46`) → 머지만 하면 실사용 세션은 계속 옛 척도(#8 결함 ①). 원본 동기화 = 원본 쓰기 = 별도 승인. 원본은 git 이력 없음 → 되돌리기 **중간**(사전 사본 필수). 부수: `bin/claude-with:12` 주석 "fit .claude/ 는 worktree 에 없고" 는 #369 이후 stale |
| 4 | 33줄(005) / 26줄(H8) / 34줄(계획) | 정정 | 실측 `workflow.md` **35줄**(`\bP[0-3]\b` 29 + 릴리즈 `:35-37` 3 + `P2만` 1 + `self-review only` 2) · 대상 **54 hit / 9파일**. 005 는 `self-review only` 2줄 누락, H8 은 P 표기 26 → **30**, 계획은 `git tag`(`:36`) 누락. 릴리즈 블록은 `:33-40` 8줄 통째 교체 대상 — hit 수를 작업량으로 쓰지 않는다 |

## 확인
8파일 grep 재현 일치(54 hit) · `.claude`/`CLAUDE.md` 밖 절차성 결함 0(히트는 과거 리뷰 기록·Prisma `P2025`·CI 주석) · PR/이슈 템플릿 부재 · tracked 18 외 원본 전용은 `settings.local.json` 뿐 · 실행 코드 0·CI/배포 0 · `.claude` 읽는 스크립트 0 · worktree 되돌리기 `git revert` 1회(열린 PR 0) · 절 참조(`8-1`/`8-6`/`8절`) 전부 대상 안 · 변형 표현(`merge-ready`·`P0 는 무시`·`P3`) 기존 패턴에 포착.

## 미확인 → 처리
| 항목 | 처리 |
|---|---|
| `3-check`(3종) vs 7단계(4종) — 9파일 15줄 + `myfitness-orchestrator:39` | **사용자 결정: 포함(10파일)** |
| `docs/specs/backlog-code-review-issues.md` 등 옛 척도로 분류된 살아 있는 백로그 | 범위 밖. 후속 이슈 후보(머리말 1줄 주석) |
| `npm run build` cold 실소요 | 집행 시 실측 → measured-facts |

## 계획 개정 (반영됨)
1. 대상 9 → **10파일**(release-manager + myfitness-orchestrator) · release-flow Step 5–6 게이트 삽입
2. 검증 = `npx prisma generate` → lint → typecheck → test → build
3. 원본 동기화 별도 승인(**승인됨** · 머지 후 · 사전 사본 · 변경 파일만 `git archive | tar -x` · diff 확인)
4. 숫자 35 / 54 / 10파일 → 005 §4-13 · measured-facts H8 정정 블록(pleiades 후속 PR)
5. 되돌리기 분리: worktree 즉시 / 원본 중간
