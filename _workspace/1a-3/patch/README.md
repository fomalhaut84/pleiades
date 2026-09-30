# 1a-3 패치 보존 (PR #98 Codex P2)

myFitness 동결 브랜치 `integration/feature-pleiades-1a-3` 의 3커밋(`30da0fd` · `caf327a` · `fd8b7c5` · base `210e875`)을
2026-09-30 에 **읽기 전용 클론**(`--no-tags` · 리모트 제거)으로 받아 `git format-patch -3` 한 것. 서비스 저장소 쓰기 0.
동결 브랜치를 나중에 정리(006 Q54 · 사용자 단독)해도 M-5a 가 이 패치로 같은 교체를 재현한다(006 §4-6 소스 행).

| 파일 | 커밋 | M-5a 에서 |
|---|---|---|
| `0001-…` | `30da0fd` `package.json`·lock git 의존성(SHA 핀) | **버린다** — 모노레포에선 `file:../../packages/notify` |
| `0002-…` | `caf327a` 테스트 파일 rename | 적용 |
| `0003-…` | `fd8b7c5` `notifier.ts` 신규 · `send.ts` 삭제 · 호출 6 · 테스트 | 적용 |

전체 diff: 10 files changed, 471 insertions(+), 324 deletions(-).
