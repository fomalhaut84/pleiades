# pleiades

`myFinance` 와 `myFitness` 두 프로젝트를 어디까지 통합할지 검토하고, 결정된 범위를 실행하는 저장소.

**현재: 기획 완료 · 실행 미착수 · 결정 대기.** 제품 코드는 아직 없다.

## 빠른 시작

```bash
cd ~/workspace/pleiades && claude
```

새 세션은 `pleiades-resume` 스킬로 인계 상태를 복원한다.

두 대상 저장소를 함께 봐야 할 때:

```bash
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \
  claude --add-dir ~/workspace/myFinance --add-dir ~/workspace/myFitness
```

## 문서

```
docs/
├── handoff/    세션 인계 노트 (새 세션은 여기부터)
├── specs/      기획 스펙 — 001 이 마스터
└── research/   실측 데이터와 조사 결과 (재측정 전 확인)
```

시작점: [`docs/handoff/2026-09-03-from-myfinance.md`](docs/handoff/2026-09-03-from-myfinance.md)

## 결정 대기 중

| | 질문 | 가르는 것 |
|---|---|---|
| Q1 | "키운다"의 목표가 제품인가 개발 효율인가 | 어디까지 갈지 |
| Q4 | myFitness 에 테스트를 붙일 의향이 있나 | 공유 패키지(B1) 가능 여부 |
| Q2 | 두 서비스의 독립 배포를 포기할 수 있나 | 모노레포(B2) 진입 |
| Q3 | 텔레그램 봇을 하나로 합치고 싶은가 | 단일 앱(B3) 진입 |

## 이름

플레이아데스 — 흩어진 별들이 하나의 성단으로 묶여 보이는 것.
