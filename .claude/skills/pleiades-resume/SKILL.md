---
name: pleiades-resume
description: pleiades 통합 프로젝트의 새 세션 시작 시 인계 상태를 로드하고 브리핑한다. 트리거 - 새 세션 첫 발화가 명시적 작업 지시가 아닐 때, "이어서 진행", "지금 상황", "어디까지 했지", "뭐부터 하면 돼".
---

# Pleiades Resume — 통합 프로젝트 재개 브리핑

`pleiades` 는 myFinance × myFitness 통합을 검토·실행하는 저장소다.
아직 코드가 없고 **결정 대기 상태**이므로, 재개는 "무엇을 짜다 말았나"가 아니라
**"무엇을 결정해야 하나"** 를 복원하는 일이다.

## 사용 X

- 사용자가 명확한 작업을 지시한 경우 (그냥 그 작업을 한다)
- 단순 질문 응답

## 절차

### Step 1 — 인계 소스 로드 (병렬)

```
Read: docs/handoff/ 의 가장 최근 파일
Read: docs/specs/001-integration-master.md  (7절 미결 질문 중심)
Bash: ls docs/handoff/ && git -C ~/workspace/myFinance log --oneline -3 && git -C ~/workspace/myFitness log --oneline -3
```

`docs/research/measured-facts.md` 는 **필요할 때만** 읽는다 (숫자가 실제로 필요한 순간).
재측정하기 전에 반드시 이 파일부터 확인한다.

### Step 2 — 대상 저장소 상태 확인

두 저장소는 이 세션 밖에서도 움직인다. 인계 노트의 기록과 실제가 다를 수 있다.

```bash
for d in myFinance myFitness; do
  echo "== $d"; git -C ~/workspace/$d branch --show-current; git -C ~/workspace/$d status -s | head -5
done
```

브랜치가 `dev` 가 아니거나 dirty 면 **인계 노트보다 현재 상태를 신뢰한다.**

### Step 3 — 브리핑 (3문단 이내)

```
## pleiades 상태

**단계:** {단계 0~4 중 어디} — {실행 전 / 진행 중 / 완료}
**대상 저장소:** myFinance {branch/clean}, myFitness {branch/clean}
**미결:** Q1({한 줄}), Q4({한 줄})

**다음 후보 액션:**
1. {가장 자연스러운 다음 스텝}
2. {대안}

어떤 방향으로 갈까?
```

### Step 4 — 진행

단계 0(통합 어드바이저)이 아직이면 그것이 기본 제안이다.
가장 값싸고 완전히 가역적이며, 나머지 전부의 판단 근거가 되기 때문이다.

## 원칙

- **결정이 먼저, 구현이 나중.** Q1/Q4 에 답이 없으면 코드를 쓰지 않는다
- **기존 두 저장소 쓰기 전 사용자 확인.** 둘 다 실서비스 중이다
- **되돌리기 비용을 항상 함께 말한다.** 이 프로젝트 문서의 일관된 형식
- **실측값은 추정하지 않는다.** `docs/research/measured-facts.md` 에 없으면 측정하고 그 파일에 추가

## 세션 종료 시

`docs/handoff/YYYY-MM-DD-<주제>.md` 로 인계 노트를 남긴다.
직전 노트(`2026-09-03-from-myfinance.md`)가 형식 참고용이다.
포함: 무엇을 했나 / 결정된 것 / 결정 안 된 것 / 다음 첫 액션 후보 / 주의사항.
