---
name: pleiades-resume
description: pleiades 통합 프로젝트의 새 세션 시작 시 인계 상태를 로드하고 브리핑한다. 트리거 - 새 세션 첫 발화가 명시적 작업 지시가 아닐 때, "이어서 진행", "지금 상황", "어디까지 했지", "뭐부터 하면 돼". 상태 복원과 브리핑까지가 범위이고, 실제 작업은 pleiades-orchestrator 로 넘긴다.
---

# Pleiades Resume — 통합 프로젝트 재개 브리핑

`pleiades` 는 myFinance × myFitness 를 **개인 비서 플랫폼**으로 통합하는 저장소다.
제품 코드는 아직 없고, 산출물은 결정과 근거다. 재개는 "무엇을 짜다 말았나"가 아니라
**"무엇이 결정됐고 무엇이 안 됐나"** 를 복원하는 일이다.

## 사용 X

- 사용자가 명확한 작업을 지시한 경우 → `pleiades-orchestrator`
- 단순 질문 응답

## 절차

### Step 1 — 인계 소스 로드 (병렬)

```
Read: docs/handoff/ 의 가장 최근 파일
Read: docs/specs/002-platform-direction.md   ← 정본 방향
Bash: ls docs/handoff/ && git -C ~/workspace/pleiades/repos/myFinance log --oneline -3 && git -C ~/workspace/pleiades/repos/myFitness log --oneline -3
```

`001-integration-master.md` 는 **분석 근거로만 유효하다.** 권고 경로와 단계 0 범위는 002 가 대체했다.
001 을 읽고 그 전제로 움직이지 않는다.

`docs/research/measured-facts.md` 는 숫자가 실제로 필요할 때만 읽는다. **재측정 전에 반드시 이 파일부터 확인한다.**

### Step 2 — 대상 저장소 상태 확인

두 저장소는 이 세션 밖에서도 움직인다. 인계 노트의 기록과 실제가 다를 수 있다.

**체크아웃이 4개다** — 통합 작업용 worktree 2개 + 서비스 유지용 원본 2개 (`docs/specs/004-repo-layout.md`).

```bash
echo "== 통합 작업 (worktree · integration/pleiades 여야 함)"
for d in myFinance myFitness; do
  echo "-- repos/$d"; git -C ~/workspace/pleiades/repos/$d branch --show-current; git -C ~/workspace/pleiades/repos/$d status -s | head -5
done
echo "== 서비스 유지용 원본 (fin=dev · fit=main · 쓰기 금지)"
for d in myFinance myFitness; do
  echo "-- ~/workspace/$d"; git -C ~/workspace/$d branch --show-current; git -C ~/workspace/$d status -s | head -3
done
```

**worktree 브랜치가 `integration/pleiades` 가 아니거나 dirty 면 인계 노트보다 현재 상태를 신뢰한다.**
원본이 `dev`/`main` 이 아니면 **누군가 서비스 유지 작업 중일 수 있으므로 사용자에게 확인한다.**

> **측정·감사는 worktree 를 본다 (PR #6 Codex 리뷰 P1).** 원본에는 앞선 1a 단계 변경이
> 들어 있지 않다 — 원본을 재면 이전 단계가 빠진 트리를 측정하게 된다.

### Step 3 — 브리핑 (3문단 이내)

```
## pleiades 상태

**단계:** {0~4 중 어디} — {실행 전 / 진행 중 / 완료}
**대상 저장소:** myFinance {branch/clean}, myFitness {branch/clean}
**미결:** Q7({한 줄}), Q2({한 줄}), Q3({한 줄})

**다음 후보 액션:**
1. {가장 자연스러운 다음 스텝 — 범위·소요·되돌리기 비용 병기}
2. {대안}

어떤 방향으로 갈까?
```

### Step 4 — 진행

작업 방향이 정해지면 `pleiades-orchestrator` 로 넘긴다. 이 스킬의 범위는 브리핑까지다.

## 확정된 것 (2026-09-03)

| | 답 |
|---|---|
| Q1 목표 | 개인 비서 플랫폼. 도메인을 계속 늘린다 |
| Q4 테스트 | 붙인다 (범위는 추출 대상 코드로 한정) |
| Q5 도메인 #3 | 일정·캘린더 |
| Q6 알림 채널 | Discord |

남은 미결은 Q7(DB 경계) · Q2(독립 배포) · Q3(봇 인바운드 통합). 전부 단계 3 이후 안건이라
단계 0~2 는 이 답들 없이도 진행할 수 있다.

## 원칙

- **되돌리기 비용을 항상 함께 말한다.** 이 프로젝트 문서의 일관된 형식
- **실측값은 추정하지 않는다.** `measured-facts.md` 에 없으면 측정하고 그 파일에 추가
- **기존 두 저장소 쓰기 전 사용자 확인.** 둘 다 실서비스 중이다
- **착수 직전 비용을 재확인한다.** 001 의 "단계 0 은 JSON 두 줄"이 실측에서 뒤집힌 전례가 있다
  (실제로는 TS 2파일 + 빌드 + `pm2 restart`). 값싸 보이는 계획일수록 `reversibility-audit` 이 필요하다

## 세션 종료 시

`pleiades-handoff` 스킬을 사용한다.
