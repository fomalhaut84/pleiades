---
name: orphan-check
description: Squash merge 후 로컬 브랜치에 push 된 커밋이 <base> 에 반영 안 된 상태 (orphan) 를 감지. <base> pull 후 로컬 브랜치와 원격 <base> 비교. "머지완료" 알림 받은 후 자동 체크, "이 커밋이 <base> 에 있어?", "orphan 있어?" 요청 시 사용.
---

> **pleiades 판 (005 §4-4 · Q29 형태 B 복사).** 원본은 myFitness `.claude/skills/orphan-check/SKILL.md`(113줄, gitignored)이고
> 이 파일은 그 **사본**이다 — 두 벌이 갈라지는 것을 알고 택했다. 원본과의 차이는 (1) **`dev` 리터럴 12줄을 `<base>` 로**
> 바꾼 것과 (2) **Step 2~4 의 orphan 판정·복구 로직 정정**(pleiades PR #22 Codex P1 2건 — 타임스탬프 판정 → 머지된
> PR head 기준, 복구 diff 를 orphan 커밋 범위로 한정)이다. **fit 원본에는 같은 결함이 남아 있다** (fit 이슈로 추적). `<base>` 는 `.claude/rules/workflow.md` **7절 표**가 정한다: pleiades 작업 → `dev` ·
> 통합 작업(`repos/*`) → `integration/pleiades` · 단독 작업 → 그 저장소 `dev` · 핫픽스 → 그 저장소 `main`.
> "자동 검사" 절의 `release-flow`·`codex-review-loop`·`workflow-conductor` 는 **fit 의 스킬·에이전트**다 — pleiades 에서는
> `workflow.md` **10절(머지 완료 후)** 과 `pleiades-handoff` 가 그 자리다. 참조 텍스트는 원본 대조를 위해 그대로 둔다.

# Orphan Check

Squash merge 특성상 로컬 브랜치의 여러 커밋 중 첫 커밋만 <base> 로 압축된다. 이후 push 된 커밋은 <base> 에 반영 안 됨 → 이 세션에서 3회 발생 (fix/223-2, fix/223-3, fix/223-5).

## Trigger

- 사용자 "머지완료" 알림 직후 자동 체크
- "이 브랜치 커밋이 <base> 에 다 있어?"
- 새 fix 커밋 push 하기 전 확인

## Step 1: 상태 확인

```bash
# 최신 <base>
git fetch origin

# 현재 브랜치 vs origin/<base>
CURRENT=$(git branch --show-current)
echo "Current: $CURRENT"

# 로컬 브랜치 마지막 3 커밋
git log $CURRENT --oneline -3

# 원격 <base> 최신 3 커밋
git log origin/<base> --oneline -3
```

## Step 2: PR 머지 상태

```bash
# 브랜치와 연결된 PR — 머지된 PR 의 head 커밋(머지 시점의 브랜치 끝)을 함께 가져온다
gh pr list --head $CURRENT --state merged --limit 1 --json number,mergedAt,headRefOid
MERGED_HEAD=$(gh pr list --head $CURRENT --state merged --limit 1 --json headRefOid -q '.[0].headRefOid')
# 조회 실패(인증·네트워크·API)나 빈 값이면 ..$CURRENT 가 빈 범위가 되어 "다 반영됨"으로 오판한다 → 판정 불가로 중단 (pleiades PR #24 Codex P1)
[[ "$MERGED_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "미확인 — 머지된 PR 의 head 를 얻지 못했다. orphan 판정 불가, 브랜치를 지우지 않는다"; return 1 2>/dev/null || exit 1; }

# 대상 PR 이 이미 머지됐고 로컬 브랜치에 $MERGED_HEAD 이후 커밋이 있으면 → orphan
git log --oneline "$MERGED_HEAD..$CURRENT"
```

## Step 3: Orphan 감지 로직

**시나리오**:

| 조건 | 결과 |
|---|---|
| PR state=OPEN + 로컬 커밋 있음 | 정상 진행 중 |
| PR state=MERGED + `git log $MERGED_HEAD..$CURRENT` 가 비어 있음 | 정상 (다 반영됨) |
| **PR state=MERGED + `git log $MERGED_HEAD..$CURRENT` 에 커밋 있음** | **⚠ ORPHAN** — 그 커밋들이 orphan |

> **타임스탬프(`mergedAt`)로 판정하지 않는다 (pleiades PR #22 Codex P1).** 머지 전에 만들고 머지 후에 push 한
> 커밋은 `mergedAt` 보다 오래돼 "정상"으로 오판되고, 그 뒤 브랜치를 지우면 커밋을 잃는다. 이 스킬이 도는
> 시점이 정확히 그 경합 구간이다. 판정은 **머지된 PR 의 head 커밋 집합**으로 한다.

## Step 4: Orphan 회수

orphan 감지 시:

```bash
# 새 브랜치로 옮기기 전에 원 브랜치 이름을 보존한다 — 아래 diff·cherry-pick 이 이 값을 쓴다 (pleiades PR #22 Codex P1)
OLD_BRANCH=$CURRENT

# <base> 최신 pull
git checkout <base> && git pull

# 새 브랜치 (원 이슈 번호 유지, N+1)
git checkout -b <type>/<issue>-<N+1>

# orphan 커밋을 새 브랜치에 재적용
# 방법 A: git cherry-pick (한 개씩 — $MERGED_HEAD..$OLD_BRANCH 의 각 커밋)
git cherry-pick <orphan-hash>

# 방법 B: 파일 직접 편집 (여러 커밋 통합)
# — orphan 커밋만의 diff. origin/<base>..$OLD_BRANCH 로 비교하면 머지 후 base 에 들어온
#   무관한 변경의 역전이 섞여 복구 PR 이 최신 base 작업을 되돌릴 수 있다 (pleiades PR #22 Codex P1)
git diff $MERGED_HEAD..$OLD_BRANCH -- <file>
# — 최종 목표 상태로 파일 재작성 후 하나의 커밋
```

**권장**: 통합 재작성 (여러 커밋 → 하나) — 리뷰 반복 사이클로 orphan 이 여러 개면 최종 상태만 반영. 중간 커밋 (되돌린 fix 등) 은 노이즈.

## Step 5: 새 PR

```bash
git push -u origin <type>/<issue>-<N+1>
gh pr create --base <base> --head <type>/<issue>-<N+1> \
  --title "[<type>] <원 이슈 후속> (#<issue>)" \
  --body "PR #<원 PR> 머지 후 orphan 됐던 후속 fix 통합 반영.

## 원 리뷰
- <리뷰 URL>

## 수정
- ...

Closes #<issue> (재오픈 없이 후속 fix)"
```

## 자동 검사

이 스킬이 트리거되는 시점:

- release-flow 이 "머지완료" 처리 후 브랜치 삭제 전
- codex-review-loop 이 재리뷰 결과 반영 커밋 push 전
- workflow-conductor 이 새 브랜치 만들기 전

## 예시 세션 (이번 세션에서 발생)

```
User: 머지완료
Me:   [orphan-check] gh pr view 226 → MERGED at 02:36:56Z
      git log fix/223-2 → 마지막 커밋 02:40:xx (orphan!)
      → <base> pull → fix/223-3 브랜치 → 목표 상태 통합 재작성 → PR #227
```

## 회피 팁

- 리뷰 반영 커밋 push 전 반드시 PR 상태 확인 (`gh pr view <N> --json state`)
- 사용자 "머지완료" 알림 = 즉시 orphan-check 실행
- 여러 fix 커밋 예상되면 처음부터 통합 재작성 계획
