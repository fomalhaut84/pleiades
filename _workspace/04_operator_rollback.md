# 04 — operator 롤백 절차: `integration/pleiades` 브랜치 생성

**집행일:** 2026-09-04
**범위:** 두 저장소에 통합 전용 로컬 브랜치 생성. **소스 파일 변경 0.**
**되돌리기 등급:** 즉시

## 무엇을 했나

| 저장소 | 브랜치 | 베이스 | 베이스 커밋 | 원격 push |
|---|---|---|---|---|
| myFinance | `integration/pleiades` | `dev` | `c549fa6` | **안 함** |
| myFitness | `integration/pleiades` | `dev` | `ac034be` | **안 함** |

`.git/refs/heads/` 에 ref 1개씩 추가 + 체크아웃 이동. 워킹 트리·소스 무변경(`git diff dev HEAD` = 0줄).

**집행 전 각 저장소가 있던 브랜치:** myFinance `dev`, myFitness **`main`**.
롤백 시 이 상태로 되돌린다 (fit 은 `dev` 가 아니라 `main` 이었다).

## 롤백

```bash
git -C ~/workspace/myFinance checkout dev  && git -C ~/workspace/myFinance branch -D integration/pleiades
git -C ~/workspace/myFitness checkout main && git -C ~/workspace/myFitness branch -D integration/pleiades
```

소요: 수 초. **커밋이 쌓인 뒤라면 `-D` 가 그 커밋들을 버린다** — 그때는 롤백 대상이
이 문서가 아니라 해당 단계(1a-2/1a-3/1a-4)의 되돌리기 표(003 §5-2)다.

## 서비스 영향

**없음.** 실서비스는 서버의 `main` 배포본으로 돌아간다. 로컬 ref 는 서버에 도달하지 않는다.
빌드·`pm2 restart`·세션 초기화 **전부 불필요**.

## 확인된 사실 (집행 중 실측)

- 두 저장소 모두 `dev` 와 `main` 의 **소스 코드가 동일**하다.
  myFinance 의 "main 이 25 커밋 앞섬"은 전부 dev→main PR 머지 커밋이고,
  실제 파일 차이는 dev 에만 있는 하네스·스펙 문서 12개(1341줄)뿐.
  myFitness 는 `git diff origin/dev origin/main` 이 **비어 있다**.
  → `dev` 분기가 실서비스와 동일한 베이스임이 확인됐다.
- myFinance 마지막 fetch 가 2026-08-19 로 낡아 있었다. 집행 전 `git fetch --prune` 수행.

## 이후 브랜치 규율 (사용자 확정, 2026-09-04)

```
dev
 └─ integration/pleiades            (장기 베이스 · dev 로 PR 은 1a 전체가 끝난 뒤)
     ├─ integration/pleiades-1a-2   → PR → integration/pleiades
     ├─ integration/pleiades-1a-3   → PR → integration/pleiades
     └─ integration/pleiades-1a-4   → PR → integration/pleiades
```

단계 브랜치를 따로 두는 이유는 003 §5-2 의 **단계별 되돌리기 등급을 보존**하기 위해서다.
한 브랜치에 커밋만 쌓으면 1a-3 만 되돌릴 때 커밋 범위를 수작업으로 골라야 한다.

---

# 정정 — 2026-09-04 오후: worktree 배치로 대체됨

**위 §"롤백" 의 명령은 더 이상 유효하지 않다.** 원본 두 저장소는 이제 `integration/pleiades` 를
잡고 있지 않고(worktree 가 잡고 있다), `git branch -D` 는 실패한다.
경위와 근거는 `docs/specs/004-repo-layout.md`.

## 현재 상태

| 용도 | 경로 | 브랜치 | 비고 |
|---|---|---|---|
| 통합 작업 | `pleiades/repos/myFinance` | `integration/pleiades` | worktree |
| 통합 작업 | `pleiades/repos/myFitness` | `integration/pleiades` | worktree |
| 서비스 유지 | `~/workspace/myFinance` | `dev` | 원본. 소스 무변경 |
| 서비스 유지 | `~/workspace/myFitness` | `main` | 원본. 소스 무변경 |

**저장소는 여전히 각각 하나다.** worktree 는 같은 object store 를 공유하는 두 번째 작업
디렉터리이므로 **분기가 불가능**하고, git 이 같은 브랜치의 이중 체크아웃을 막는다.

## 집행한 것

```bash
# pleiades
printf 'repos/\n' >> .gitignore

# myFinance — 원본을 서비스 브랜치로 되돌리고 worktree 생성
git -C ~/workspace/myFinance checkout dev
git -C ~/workspace/myFinance worktree add ~/workspace/pleiades/repos/myFinance integration/pleiades

# myFitness — 동일
git -C ~/workspace/myFitness checkout main
git -C ~/workspace/myFitness worktree add ~/workspace/pleiades/repos/myFitness integration/pleiades

# worktree 에 안 따라오는 gitignored 필수 파일 (원본에서 복사)
cp -p  ~/workspace/myFinance/.env            repos/myFinance/.env
cp -p  ~/workspace/myFitness/.env            repos/myFitness/.env
cp -Rp ~/workspace/myFitness/.garmin-tokens  repos/myFitness/.garmin-tokens
cp -p  ~/workspace/myFitness/CLAUDE.md       repos/myFitness/CLAUDE.md
# fit .claude/ 는 의도적 제외 — 하네스 통합(002 단계 2) 대상

# node_modules — npm ci 대신 APFS clonefile COW 복사 (경로 무관이 감사에서 실증됨)
cp -Rc ~/workspace/myFinance/node_modules repos/myFinance/node_modules
cp -Rc ~/workspace/myFitness/node_modules repos/myFitness/node_modules
```

**검증 통과:** 양쪽 worktree clean(0 변경), `.env` 존재, `@prisma/client` 로드 확인,
pleiades `git status` 에 `repos/` 미노출. 두 원본 저장소 **소스 무변경**, 서비스 영향 없음.
**실제 디스크 소비 90 MB** (node_modules 1.6 GB 는 COW 공유).

> `du -sh repos/` 는 **1.7 GB** 로 나온다 — COW 공유 블록을 사본마다 중복 계상하기 때문이다.
> 실소비 90 MB 와 충돌하지 않는다.

## 롤백 (현행)

```bash
# --force 가 필요하다. 복사한 .env·node_modules 가 untracked 라 그냥은 거부된다 (실측 확인).
git -C ~/workspace/myFinance worktree remove --force ~/workspace/pleiades/repos/myFinance
git -C ~/workspace/myFitness worktree remove --force ~/workspace/pleiades/repos/myFitness

# pleiades .gitignore 의 repos/ 한 줄 제거 (선택)
```

**되돌리기 등급: 즉시.** 원본이 시종 무변경이므로 **편도 항목이 없다.**
`--force` 가 지우는 것은 worktree 안의 `.env`·`node_modules`·`.garmin-tokens`·`CLAUDE.md`
사본뿐이고, **전부 원본에 그대로 있다.**

`integration/pleiades` 브랜치 자체를 없애려면 worktree 를 먼저 제거한 뒤
`git branch -D integration/pleiades` 를 각 저장소에서 실행한다.
**단 그 시점에 브랜치에 커밋이 쌓여 있다면 그 커밋들이 사라진다** — 그때의 롤백 대상은
이 문서가 아니라 해당 단계(1a-2/1a-3/1a-4)의 되돌리기 표(003 §5-2)다.

## 알려진 부수 효과

- `repos/` 가 pleiades `.gitignore` 에 있어 **Grep 은 루트 검색에서 두 저장소를 건너뛴다.**
  `path` 를 `repos/` 이하로 지정하면 정상 동작한다 (Glob·Read 는 영향 없음).
- **하위 디렉터리의 `.claude/skills`·`agents` 는 로드되지 않는다.** `--add-dir` 로 붙였을 때만
  보인다(실측). 따라서 하네스 통합(002 단계 2)이 이 배치의 **선결 조건**이다 → 004 Q20.
- myFinance `.claude/` 16파일은 **tracked** 라 worktree 에 자동으로 따라왔다. 제거하려면
  `git rm` 커밋 = myFinance 소스 변경이므로 **단계 2 의 본체로 미룬다.**
- worktree 첫 빌드는 콜드다 (`.next` 없음). 예상된 비용.
