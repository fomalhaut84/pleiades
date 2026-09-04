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
