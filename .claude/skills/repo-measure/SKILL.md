---
name: repo-measure
description: myFinance·myFitness 두 저장소를 실측하고 docs/research/measured-facts.md 에 측정 명령과 함께 기록하는 절차. LOC·결합도·import 그래프·드리프트·설정 출처·하네스 구성 측정 시, "몇 줄이야", "얼마나 얽혀 있어", "실제로 어떻게 돼 있어", "재측정해줘", "숫자 다시 확인" 요청 시 반드시 사용. 추정으로 답하려는 순간이 이 스킬을 쓸 순간이다.
---

# repo-measure — 실측과 기록
> **`grep` 에는 반드시 `--binary-files=text` (PR #6 Codex 리뷰 P2).** 없으면 `.next/cache`
> 같은 파일이 binary 로 판정돼 **조용히 0건 오탐**이 난다. 실제로 실측·감사 에이전트가
> 독립적으로 같은 오탐을 냈다 (`004-repo-layout.md`). 아래 명령에도 전부 붙어 있다.
> **경로 규율 (PR #6 Codex 리뷰 P1).** 통합 작업의 측정·감사 대상은
> **`~/workspace/pleiades/repos/{myFinance,myFitness}`** (worktree, 브랜치 `integration/pleiades`) 다.
> `~/workspace/myFinance`(`dev`) · `~/workspace/myFitness`(`main`) 은 **서비스 유지용 원본**이라
> **앞선 1a 단계 변경이 들어 있지 않다.** 원본을 재면 **이전 단계가 빠진 트리를 측정해
> 잘못된 범위를 승인**하게 된다. 근거: `docs/specs/004-repo-layout.md`.
> 원본을 재야 하는 경우(서비스 현재 상태 확인 등)는 **그렇게 재는 이유를 산출물에 명시한다.**


pleiades 의 제1규율: **실측값은 추정하지 않는다.** 이 스킬은 그 규율의 실행 절차다.

추정이 로드맵을 뒤집은 사례가 두 번 있었다. 숫자를 지어내는 것보다 "못 쟀다"고 쓰는 것이 항상 낫다.

## 절차

### 1. 먼저 기존 기록을 읽는다

```bash
grep -n --binary-files=text "<주제 키워드>" docs/research/measured-facts.md
```

이미 있으면 **재측정하지 않는다.** 단 아래는 예외다:
- 대상 저장소가 그 사이 움직였다 (커밋이 추가됐다)
- 이전 측정이 다른 명령으로 이루어져 비교가 안 된다
- 감사에서 그 값이 의심받았다

재측정하면 이전 값을 지우지 말고 나란히 기록한다. **변화 자체가 정보다.**

### 2. 양쪽을 같은 명령으로 측정한다

비대칭 측정은 비교를 무효화한다. 기본 패턴:

```bash
for d in myFinance myFitness; do
  echo "===== $d"
  <측정 명령>
done
```

### 3. 결과를 명령과 함께 기록한다

`docs/research/measured-facts.md` 말미에 절을 추가한다. 형식은 파일의 기존 절을 따른다:

```markdown
# 추가 측정 — YYYY-MM-DD (<주제>)

<왜 이 측정이 필요했는지 한 줄. 어느 문서의 어느 주장 때문인지>

## <측정 항목>

```bash
<실제로 실행한 명령 그대로>
```

| | myFinance | myFitness |
|---|---|---|
| ... | ... | ... |

→ **<이 숫자가 뒤집거나 확인하는 가정>**
```

**기록에 적는 명령과 실제 실행한 명령이 같아야 한다.** 다르면 재현이 깨진다.

## 측정 패턴 모음

### 규모
```bash
find ~/workspace/pleiades/repos/$d/src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
find ~/workspace/pleiades/repos/$d/src/<area> -name '*.ts' -exec cat {} + | wc -l
```

### 결합도 — 무엇이 무엇에 묶여 있나
```bash
# 참조 파일 수 (분모와 함께)
grep -rlE --binary-files=text "from ['\"]<pkg>" ~/workspace/pleiades/repos/$d/src --include='*.ts' | wc -l
# 예상 경계 밖 누수
grep -rlE --binary-files=text "<pattern>" ~/workspace/pleiades/repos/$d/src --include='*.ts' | grep -v --binary-files=text '/src/<expected>/'
# 호출 지점이 한 곳인가 흩어져 있나
grep -rn --binary-files=text "<call>" ~/workspace/pleiades/repos/$d/src --include='*.ts' | cut -d: -f1 | sort | uniq -c | sort -rn
```

호출이 한 파일에 모이면 **초크포인트**(교체 가능), 흩어져 있으면 **재작성**이다. 비용이 자릿수로 다르다.

### 드리프트 — 같은 이름 파일이 얼마나 갈라졌나
```bash
diff ~/workspace/pleiades/repos/myFinance/src/<path> ~/workspace/pleiades/repos/myFitness/src/<path> | wc -l
```

### 추출 가능성 — 후보가 정말 무의존인가
```bash
grep -nE --binary-files=text "^import" <file>              # 전부 읽는다. 형제 파일까지 따라간다
grep -rn --binary-files=text "from ['\"]next" ~/workspace/pleiades/repos/$d/src/<dir>/ | wc -l
grep -rn --binary-files=text "from ['\"]@/lib" ~/workspace/pleiades/repos/$d/src/<dir>/ | wc -l
```

### 설정 출처 — 그 파일이 진짜 읽히나
```bash
grep -rn --binary-files=text "<파일명>" ~/workspace/pleiades/repos/$d/src --include='*.ts'
grep -rn --binary-files=text "writeFileSync\|\.runtime/\|process.cwd()" ~/workspace/pleiades/repos/$d/src/<dir>/*.ts
```

런타임 생성본이 있으면 **저장소 파일은 죽은 파일**이다. 이 확인은 `reversibility-audit` 과 겹치며, 겹치는 것이 맞다.

## 기록 규율

| 규율 | 이유 |
|---|---|
| 숫자에 분모를 붙인다 ("43 / 424 파일") | 43 만으로는 크기를 모른다 |
| 못 잰 값은 빈칸 + 이유 | 추정치가 기록에 섞이면 이후 전부를 의심해야 한다 |
| 측정 시점의 브랜치·상태를 적는다 | 두 저장소는 세션 밖에서도 움직인다 |
| 틀린 기록은 정정 블록으로 | 지우면 왜 틀렸는지가 사라진다 |

정정 블록 형식:

```markdown
> **정정 (YYYY-MM-DD 재측정).** <이전 기록의 무엇이 틀렸는지>.
> 실제로는 <실측 결과>. 상세는 <참조>.
```

## 하지 않는 것

- **두 저장소에 쓰지 않는다.** 실서비스 중이다. 읽기만 한다
- `npm install`, 빌드, 테스트 실행 — 전부 하지 않는다. 정적 측정만
- 측정 결과로 결론을 내리지 않는다. 숫자를 넘기는 것까지가 이 스킬의 범위다
