# 인계 노트 — 2026-09-28, 서비스 dev → integration/pleiades 동기화 정책(#70) + 첫 적용(#71·#75) + #67

직전 노트: `2026-09-14-61-62-done.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**대상 저장소 쓰기 7 PR(worktree 5 + 원본 미러 1 + 원본 fit 하네스 1파일 동기화 1) · 전부 사용자 승인(게이트 A·B · 2026-09-28) 안에서. 서버·DB·텔레그램 무접촉 · 빌드·`pm2 restart` 없음.**

1. `pleiades-resume` → 관측: 원본 fit 이 `main` 이 아니라 **`dev`**(단독 세션 · 릴리즈 대기 · clean) · **원본 fit `.claude/` 가 worktree 판과 갈라짐**(스킬 6 차이 · `security-audit-fix` 원본에만) · fin `dev` 4커밋 · fit `dev` **77커밋** 이 `integration/pleiades` 를 앞섬 · **fit `dev` 가 2026-09-18 vitest 를 독자 도입**(#399 · 1a-2 와 중복).
2. **사용자 결정: 서비스 `dev`·`main` 변경을 pleiades 브랜치·작업 브랜치로 반영하는 정책** → #70(정책) · #71(첫 집행). 실측: `main` = `dev` + 릴리즈 머지 커밋(fin 26 · fit 4 · 내용 diff 0) → **`dev` 만 받는다**.
3. #71 집행 — 재감사(블로커 1: fit `npx prisma generate` 명시 실행 · `@prisma/client` 6.19.3 동일이라 postinstall 미실행) → fin `integration/chore-pleiades-sync-20260928`(충돌 1 · `workflow.md` 헤더 양쪽 출처 병합 · 검증 4종 ✔) → fit(충돌 3 · dev 판 + 1a-2 coverage 유지 · `vite-tsconfig-paths` 제거 · lock 재생성 +162 · vitest 63파일 433건 ✔) → 9-1 각 0/0 → **myFinance#505 merge commit `af00fe3` ✔ · myFitness#488 은 squash `961b130`** → #75 `-s ours` 머지 PR myFitness#489 `5cf4660`(트리 무변경 · 조상 복구 · behind 0).
4. #70 정책 PR #74 `35c7859` — Codex **4라운드(P1 3 · P2 5 · 전부 반영)**: 한 저장소만 뒤처지면 PR 1 · `merge-tree --no-messages` · 통째 복원 명령 제거 · 동기화 PR 은 자기 선결 면제 · `origin/` ref 기준 · 분기 전 ff · `tar -k` 종료 코드(bsdtar 0 / GNU 2 → 경로 열거).
5. #67 — fin·fit worktree PR 2(myFinance#508 `c94cbb8` · myFitness#490 `ef00e88`) + fin 원본 미러 myFinance#509 `5540417`(이슈 myFinance#507) + fit 원본 `workflow.md` 1파일 archive(사전 사본 `_workspace/67/backup/` md5 `00c084ee…` → 후 `8200399f…`). 사전 리뷰 0/0/info 1 · 봇 4 PR 전부 👍.
6. 봇 P2 이관 첫 사례: #505 의 `src/mcp/utils.ts:131`(dev 유래) → **myFinance#506**.

## PR 현황 (전부 머지)

| PR | 내용 | 머지 | 되돌리기 |
|---|---|---|---|
| ~~myFinance#505~~ | dev 4 → integration | **merge commit** `af00fe3` | 중간(`revert -m 1`) |
| ~~myFitness#488~~ | dev 77 → integration | **squash** `961b130` (반례) | 즉시(`revert 961b130`) — 단 #489 를 먼저 `-m 1` |
| ~~myFitness#489~~ | #75 `-s ours` 조상 복구 | merge commit `5cf4660` | 즉시(`revert -m 1` · 트리 무변경) |
| ~~pleiades#74~~ | #70 정책 | `35c7859` | 즉시 |
| ~~myFinance#508~~ · ~~myFitness#490~~ · ~~myFinance#509~~ | #67 한 줄 ×3 | merge commit `c94cbb8` · `ef00e88` · `5540417` | 즉시(`revert -m 1`) |

## 결정된 것 (사용자 2026-09-28)

| | 결정 | 귀결 |
|---|---|---|
| **#70 동기화 방향** | 서비스 `dev` → `integration/pleiades` 정기 동기화. `main` 은 받지 않음 | `workflow.md` 브랜치 전략 표 `dev 수용` 행이 정본. resume Step 2 가 behind 를 잰다 |
| **머지 방법** | 동기화 PR 은 "Create a merge commit" | squash 면 조상 관계 소실 — #488 이 실증, #489 로 복구 |
| **리뷰 범위** | 충돌 해결분 + 머지 위생. dev 유래 봇 지적은 그 저장소 이슈 | myFinance#506 첫 사례 |
| **게이트 A·B** | #75 `-s ours` · #67 3벌+원본 1파일 | 완료 |

## 결정되지 않은 것

| 이슈 | 내용 | 언제 |
|---|---|---|
| **#72** | fit 원본 `.claude/` 드리프트 — 원본→worktree 복사 vs fit `dev` tracked 화 | 다음 fit 하네스 작업 전 |
| **#73** | fit lock 영구 분기 — coverage-v8 를 dev 에 미러(권고 A) | 1a-3 전 권장 |
| **#66** | 롤백 체크리스트 확정 — 이번 둘째·셋째 적용(`_workspace/71`·`67`)에서 새로 나온 상황: squash/merge 혼재 · `-s ours` revert · 미러가 dev 를 앞서게 함 | 다음 집행 후 |
| **미러의 부작용** | 미러 PR 머지 = `dev` 가 다시 앞선다(fin behind 2 · 내용 동일). 다음 동기화가 무충돌로 흡수 — 규칙에 1줄 기록 | 기록 완료(이 PR) |
| Q45 · 첫 태그 · #48 · #17 · #11 · Q23 · Q12~Q14 · Q7·Q2·Q3 | 이전 노트 그대로. **Q45 에 서버 node ≥ 20.19 확인 추가**(fit dev 유래 `@csstools/*` 요구 · 로컬 20.18 EBADENGINE) | 1a-3 전 |

**단계 0 은 여전히 미착수, 단계 1 을 먼저 하기로 결정된 적도 없다.**

## 다음 세션의 첫 액션 후보

1. **1a-3 준비** — 이제 worktree 가 `dev` 와 같은 트리(fin behind 2 는 미러분). Q45 서버 측정(접속 승인 · https·node·git) + 첫 태그 릴리즈 PR + #48 I1. 되돌리기: 태그 삭제 즉시 · 코드 중간.
2. **#73** — fit `dev` 에 coverage-v8 미러(모드 S · fit 이슈 · PR 1). 즉시. 1a-3 전에 하면 다음 동기화 충돌 0.
3. **#72** 결정.

## 주의사항

- **두 저장소는 실서비스 중.** 쓰기 전 사용자 확인. 이번 세션 쓰기: 위 7 PR + fit 원본 1파일.
- **세션 종료 시 관측 상태:** worktree fin `c94cbb8`(behind dev **2** · 미러 #509 분 · 내용 동일) · fit `ef00e88`(behind 0) · 원본 fin `dev 5540417` · 원본 fit **`dev` `94e4e15`**(단독 세션 릴리즈 대기 · CLAUDE.md 표의 "fit=main" 은 평시 값이고 단독 작업 중엔 `dev` 일 수 있다) · 넷 다 clean.
- **동기화 PR 머지 방법 = merge commit.** 머지 후 `git log -1 --format=%P` 로 부모 2 확인 · 아니면 #75 절차(`-s ours`).
- **fit 검증 순서:** `npm install` → **`npx prisma generate`** → typecheck. dev 가 마이그레이션을 더할 때마다 필요.
- **fit 원본 `.claude/` 통째 복원 금지** — 부재 파일만(resume Step 2 명령 · 경로 열거 · `tar -k` 는 GNU 에서 종료 2).
- **`merge-tree` 충돌 수는 `--no-messages`** · behind 측정은 `origin/integration/pleiades..origin/dev`.
- **Codex 관측:** 8 PR 전부 오픈 3분 뒤 자동 · 재리뷰 3~4분 · 규칙 정의 PR(#74)은 4라운드 — "명령 목록 규칙 반례" 패턴 재현(P1 3 · P2 5).
- **`MEMORY.md` 20줄**(한도 200).

## 정정된 기록 — 옛 문서를 그 전제로 읽지 말 것

- *"`integration/pleiades` 는 `dev` 와 무관하게 pleiades 내부 메인"* → 반대 방향(dev → integration)은 **정기 동기화**(#70). 004·`workflow.md`·CLAUDE.md 정정 완료.
- *"fit 원본 `.claude/` 는 worktree 판의 사본 · 낡으면 통째 복원"*(005 §4-7 · #27) → **깨짐**(#72). 파일 단위만.
- *"측정·감사는 worktree 를 본다"* → worktree 가 dev 를 따라갈 때만 옳다(resume Step 2 선결).
- `_workspace/67/04_operator_rollback.md` 초안의 *"squash 1커밋 · `-m` 없음"* → 실제 세 PR 모두 **merge commit** → `revert -m 1`(문서 정정 완료).

## 재현이 필요한 절차

- **dev 동기화** — `workflow.md` `dev 수용` 행 · 첫 실행 기록 `measured-facts.md` 2026-09-28 절 · 롤백 `_workspace/71/04_operator_rollback.md`.
- **squash 된 동기화의 조상 복구** — `git merge -s ours --no-ff origin/dev` → PR(diff 0) → merge commit(#75 · myFitness#489).
- **fit 원본 1파일 동기화(사전 사본 포함)** — `_workspace/67/04_operator_rollback.md` §3.
