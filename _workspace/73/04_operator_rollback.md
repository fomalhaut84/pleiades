# 04 — operator 롤백 절차: #73 fit `dev` 미러 — coverage-v8 · 스크립트 2 · 회귀 테스트 3파일

**작성:** 2026-09-28(집행 중 · 머지 후 실값 갱신) · **형식:** `dual-repo-change` 5-1 · 체크리스트 `_workspace/61/rollback-checklist.md`
**모드 S**(원본 `~/workspace/myFitness` · base `dev` · 이슈 `fomalhaut84/myFitness#491` · 원 이슈 pleiades#73) · 되돌리기 등급: **즉시**(revert PR + `npm ci`) · 원본 도달분: 이 PR 이 곧 원본 · worktree 는 다음 동기화가 무충돌 흡수

## 0. 상태 판정 표 (머지 후 갱신)

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **myFitness#492** (`chore/491-1` → `dev` · 커밋 `ea56738` · 오픈 07:07Z) | **머지 `a984b85`**(부모 1 · 2026-09-28) | 없음 — `dev` 는 릴리즈 대기 · 다음 릴리즈에 포함 · 런타임 코드 무변경 · 서버 `npm ci` 가 devDeps 를 설치하면 패키지 12개 추가 | — | **있음** devDep `@vitest/coverage-v8 ^4`(+의존 11) · 기존 고정 버전 변동 0 |

## 1. 머지 전

```bash
cd ~/workspace/myFitness && git checkout dev
gh pr close <n> -R fomalhaut84/myFitness --delete-branch
npm ci                                                      # 브랜치에서 npm install 했으므로 lock 기준 복원
```

## 2. 머지 후 (revert 도 PR · base `dev`)

```bash
cd ~/workspace/myFitness && git checkout dev && git pull --ff-only
git checkout -b fix/491-revert
git revert --no-edit <머지 SHA>                              # fit dev PR 은 merge commit 이면 -m 1 · squash 면 -m 없음 — 머지 후 %P 로 확인해 채운다
git push -u origin fix/491-revert
gh pr create -R fomalhaut84/myFitness --base dev --head fix/491-revert --title "revert: coverage-v8 · 회귀 테스트 3파일 되돌림 (#491)" --body "Refs #491 · Refs fomalhaut84/pleiades#73 · 되돌리기: 즉시"
# → 사용자 머지 후
git checkout dev && git pull --ff-only && npm ci
```

릴리즈에 이미 실렸다면(태그 이후) 서버는 다음 릴리즈에서 `npm ci` 로 12패키지가 빠질 뿐 — 재시작 불필요(런타임 코드 무변경).

## 3. 원본 도달분

이 PR 이 원본이다. **worktree(`integration/pleiades`)는 건드리지 않는다** — 내용이 이미 같으므로 다음 dev 동기화가 무충돌로 흡수하고, 되돌리면 그때 다시 3파일 충돌 상태로 돌아간다(#73 의 상황 C).
