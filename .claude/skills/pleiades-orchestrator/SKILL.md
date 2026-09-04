---
name: pleiades-orchestrator
description: pleiades 통합 작업 전체를 에이전트 팀으로 조율하는 오케스트레이터. 실측 → 방향 문서 → 비용 감사 → 사용자 결정 → 실서비스 집행 파이프라인. "통합 진행하자", "단계 N 실행", "방향 검토해줘", "이거 어떻게 할지 정하자", "다시 실행", "재실행", "업데이트", "보완", "이전 결과 기반으로", "결과 개선", "부분만 다시" 요청 시 사용. 세션 시작 시 상태 복원은 pleiades-resume 이 담당하므로 "어디까지 했지" 류는 여기서 처리하지 않는다. 단순 질문이나 파일 하나 읽기는 직접 응답한다.
---

# pleiades-orchestrator — 통합 작업 조율

pleiades 는 myFinance × myFitness 를 **개인 비서 플랫폼**으로 통합하는 저장소다.
제품 코드는 아직 없고, 산출물은 결정과 그 근거다. 두 대상 저장소는 실서비스 중이다.

## 실행 모드: 에이전트 팀

네 에이전트가 팀으로 협업한다. 감사가 문서를 되돌리고, 문서가 측정을 요구하는 **양방향 피드백**이
품질의 핵심이므로 서브 에이전트(단방향 반환)로는 부족하다.

| 에이전트 | 역할 | 쓰기 권한 |
|---|---|---|
| `repo-surveyor` | 두 저장소 실측 → `measured-facts.md` | pleiades 만 |
| `decision-writer` | 방향 문서·인계·아티팩트 | pleiades 만 |
| `reversibility-auditor` | 비용·가역성 추정 반증 | **없음 (읽기 전용)** |
| `dual-repo-operator` | 실서비스 변경 집행 | **대상 저장소 (승인 후에만)** |

모든 `Agent` 호출에 `model: "opus"` 를 명시한다.

## Phase 0 — 컨텍스트 확인

작업 시작 전 실행 모드를 판별한다.

```bash
echo "== 통합 작업 (worktree · integration/pleiades 여야 함)"
for d in myFinance myFitness; do
  echo -n "  repos/$d: "; git -C repos/$d branch --show-current
  git -C repos/$d status -s | head -3
done
echo "== 서비스 유지용 원본 (fin=dev · fit=main · 쓰기 금지)"
for d in myFinance myFitness; do
  echo -n "  ~/workspace/$d: "; git -C ~/workspace/$d branch --show-current
  git -C ~/workspace/$d status -s | head -3
done
```

> **체크아웃이 4개다 (PR #6 Codex 리뷰 P1).** 통합 작업 worktree 2개 + 서비스 유지용 원본 2개.
> 원본에는 앞선 1a 단계 변경이 들어 있지 않다 — `docs/specs/004-repo-layout.md`.

| 상황 | 모드 |
|---|---|
| `_workspace/` 없음 | **초기 실행** — Phase 1 부터 |
| `_workspace/` 있음 + 부분 수정 요청 | **부분 재실행** — 해당 에이전트만 재호출 |
| `_workspace/` 있음 + 새 입력 | **새 실행** — `_workspace/` → `_workspace_prev/` 이동 후 Phase 1 |

**대상 저장소 브랜치가 `dev` 가 아니거나 dirty 면 인계 노트보다 현재 상태를 신뢰한다.**
두 저장소는 이 세션 밖에서도 움직인다.

## Phase 1 — 실측

**실행: `repo-surveyor`**

방향 판단에 필요한 숫자를 뽑는다. `measured-facts.md` 를 먼저 읽고 없는 값만 측정한다.

- 산출: `_workspace/01_surveyor_<주제>.md` + `measured-facts.md` 갱신
- **가정을 뒤집는 숫자가 나오면 즉시 `decision-writer` 에게 경고한다**

여러 독립 측정이 필요하면 주제별로 나눠 병렬 수행한다.

## Phase 2 — 방향 문서 초안

**실행: `decision-writer`**

Phase 1 의 숫자로 옵션 사다리와 단계를 구성한다. 모든 옵션에 되돌리기 비용을 병기한다.

- 산출: `_workspace/02_writer_<주제>.md` (**초안이다. 정본 아님**)
- 필요한 숫자가 없으면 Phase 1 로 되돌려 측정을 요청한다. **추정하지 않는다**

## Phase 3 — 비용 감사

**실행: `reversibility-auditor`**

초안의 비용·가역성 주장을 실제 코드로 반증한다. **이 프로젝트에서 가장 중요한 단계다.**

- 산출: `_workspace/03_auditor_<주제>.md` — 주장별 확인/정정/미확인 판정
- **정정이 하나라도 나오면 Phase 2 로 되돌아간다.** 문서는 다시 초안이 된다
- 같은 주장이 2회 이상 정정되면 문서의 추정 방식 자체를 재검토한다

Phase 2 ↔ 3 은 정정이 0 이 될 때까지 순환한다. 3회를 넘으면 사용자에게 보고하고 스코프 축소를 제안한다.

## Phase 4 — 사용자 결정

**실행: `decision-writer`**

감사를 통과한 문서를 `docs/specs/NNN-*.md` 정본으로 발행하고, `CLAUDE.md` 를 동기화한다.
미결 질문이 다음을 막고 있으면 `AskUserQuestion` 으로 묻는다 —
**각 선택지에 "무엇이 달라지는지"를 설명에 넣는다.**

집행이 필요한 결정이면 사용자 승인을 받고 Phase 5 로. 아니면 여기서 종료한다.

## Phase 5 — 집행 (승인 시에만)

**실행: `dual-repo-operator`**

1. 승인 게이트 5항목 제시 → **명시 승인**
2. `reversibility-auditor` 에게 **착수 직전 재감사** 요청. 정정 나오면 중단
3. 한쪽 저장소씩 순차 변경 → 검증 → 커밋
4. 빌드·재시작·세션 초기화 명령을 사용자에게 전달 (**실행은 사용자가 한다**)
5. 롤백 절차 문서화 → `decision-writer` 가 pleiades 문서에 반영

## 데이터 전달

| 방식 | 용도 |
|---|---|
| 파일 (`_workspace/`) | 산출물. `{phase}_{agent}_{주제}.{ext}` |
| 태스크 (`TaskCreate`) | 의존 관계·진행 추적 |
| 메시지 (`SendMessage`) | 감사 정정 통지, 측정 요청 같은 실시간 조율 |

최종 산출물만 `docs/` 로. `_workspace/` 는 지우지 않는다 (사후 검증·감사 추적).

## 에러 핸들링

| 상황 | 대응 |
|---|---|
| 측정 실패 | 1회 재시도. 재실패면 "미측정"으로 문서에 명시하고 진행. 추정으로 채우지 않는다 |
| 감사 정정 반복 (3회+) | 사용자 보고 + 스코프 축소 제안 |
| 대상 저장소 dirty/타 브랜치 | 현재 상태를 신뢰하고 기록. 임의로 정리하지 않는다 |
| 집행 중 계획 밖 변경 필요 | **즉시 중단.** 범위 변경은 승인 사항 |
| 한쪽 저장소만 성공 | 성공분 롤백 여부를 사용자에게 질의 |
| 상충하는 측정값 | 삭제하지 않고 출처·시점 병기 |

## 세션 경계

- **시작**: `pleiades-resume` (인계 상태 복원 → 브리핑)
- **종료**: `pleiades-handoff` (인계 노트 + `CLAUDE.md` 동기화 + 커밋)

## 테스트 시나리오

### 정상 흐름
> "단계 1 알림 어댑터 어떻게 할지 방향 잡아줘"

1. Phase 0 — `_workspace/` 없음 → 초기 실행. 두 저장소 `dev` clean 확인
2. Phase 1 — `repo-surveyor` 가 봇 구조·전송 호출 분포·추출 후보 의존 측정
3. Phase 2 — `decision-writer` 가 어댑터 설계 + 되돌리기 비용 초안
4. Phase 3 — `reversibility-auditor` 가 "Next 무관" 주장을 import 그래프로 검증 → 확인
5. Phase 4 — `docs/specs/003-*.md` 발행. 집행 여부 사용자 질의
6. 사용자 승인 시 Phase 5

### 에러 흐름 — 감사가 문서를 되돌림
> "단계 0 실행해줘"

1. Phase 3 에서 `reversibility-auditor` 가 정정 판정:
   "저장소 JSON 은 죽은 파일, 런타임 생성본이 실제 설정"
2. Phase 2 로 복귀 — `decision-writer` 가 정정 블록 추가, 비용을 "JSON 2줄" → "TS 2파일 + 재배포" 로 수정
3. Phase 3 재감사 → 확인
4. Phase 4 — **범위가 승인 시점과 달라졌으므로 사용자에게 재확인**
5. 사용자가 보류 선택 → Phase 5 진입하지 않고 `pleiades-handoff` 로 종료
