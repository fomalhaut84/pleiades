---
name: session-boundary
description: "myFinance 프로젝트 세션 종료 시 상태 스냅샷 + 인계 노트 작성 + MEMORY.md 갱신. 트리거: '세션 정리', '세션 종료', '여기까지', '다음 세션에 인계', 'PR 머지완료 후 새 세션', '릴리즈 발행 후'. 서브이슈/릴리즈/hotfix 완결 시점에 사용. 마일스톤 미완결 상태로 중단하는 경우도 이 스킬 사용."
---

# Session Boundary — 종료 인계

myFinance 세션을 명확한 경계에서 마무리하고 다음 세션이 놓치지 않게 인계.

## When to use

**필수 시점** (다음 세션이 이어야 할 상태 있음):
- PR 머지 완료 후, 다음 서브이슈 시작 전 (context rotate)
- 마스터 이슈 부분 완료 (일부 서브만 머지, 다른 서브 대기)
- Codex 리뷰 3라운드 이상 반복 후 (context 오염)
- 배포 관찰 대기 (몇 시간~며칠 뒤 검증 예정)
- 사용자가 "여기까지" / "세션 종료" 등 명시적 종료 요청

**선택 시점** (인계 최소):
- 릴리즈 발행 완료 (다음 마일스톤은 `project_next_milestone_XX.md` 로 이미 연결)
- Hotfix 완료 + 배포 확인
- 마일스톤 완전 종료 (memory 아카이브 완료)

**사용 X**:
- 세션 시작 시 (그건 [[session-resume]])
- 진행 중 단순 chore (질문 응답 등)

## 실행 절차

### Step 1 — 상태 스냅샷 (병렬 조회)

```bash
git status -s
git branch --show-current
git log --oneline -5
gh pr list --author @me --state open --limit 5
gh issue list --author @me --state open --limit 5
```

TodoList 가 있으면 (`TaskList`) 미완료 항목 확인.

### Step 2 — 인계 대상 판정

| 상황 | 인계 방식 |
|---|---|
| 마일스톤 완료 (모든 서브 머지 + 릴리즈 배포) | `project_milestoneXX_complete.md` (신규) + `project_next_milestone_(XX+1).md` (신규) + 아카이브된 `project_next_milestone_XX.md` 는 삭제하지 말고 인덱스만 유지 |
| 마일스톤 부분 완료 (일부 서브 남음) | `project_session_active.md` (임시, 다음 세션이 삭제) 에 "진행중 이슈 #N, 브랜치 X, 미완결 항목 Y" |
| 서브이슈 PR 머지 완료 후 rotate | `project_session_active.md` 필요 시만 (다음 서브이슈가 자명하면 생략) |
| Hotfix 완료 + 배포 검증 완료 | 인계 파일 불필요. Codex 학습만 [[codex-response-patterns]] 갱신 |
| 배포 관찰 대기 | `project_pending_<주제>.md` (관찰 종료 시점 명시) |

### Step 3 — 인계 노트 작성

**`project_session_active.md`** (임시 인계):

```markdown
---
name: project-session-active
description: 이전 세션 미완결 상태. 다음 세션이 이어받은 뒤 삭제.
metadata:
  type: project
---

**언제:** {ISO date} 세션 종료

**진행중:**
- 이슈 #N — {제목}
- 브랜치: `{branch-name}`
- PR: #{M} (open, waiting-codex / waiting-review / waiting-merge)

**다음 액션:**
1. {구체적 액션}
2. {구체적 액션}

**주의:**
- {예: dev 브랜치 미커밋 존재, Codex 재리뷰 대기 등}

**참조:**
- docs/specs/N-*.md
- [[project_next_milestone_XX]]
```

**주의 원칙:**
- 이 파일은 다음 세션이 [[session-resume]] 실행 후 반드시 삭제
- 파일 남아있으면 실제 활성 세션 있는 것으로 간주됨
- 여러 개 만들지 말고 하나만 유지

### Step 4 — MEMORY.md 인덱스 갱신

- 새로 만든 인계/완료 파일 항목 추가
- `**Next**` 라인 갱신 (있으면)
- 임시 `project_session_active.md` 는 인덱스에 넣지 말 것 (다음 세션이 삭제할 것이므로)
- 200 라인 넘지 않게 오래된 마일스톤 완료 항목 압축 검토

### Step 5 — 미커밋 하네스 파일 경고

`.claude/agents/`, `.claude/skills/`, `docs/specs/*-master.md` 등이 untracked 인 경우 사용자에게 안내:

> "하네스/스펙 파일이 아직 git 에 커밋되지 않았습니다. 다음 세션에서 사라질 위험은 없지만, 팀·다른 머신과 공유하려면 별도 커밋 필요합니다."

### Step 6 — 사용자에게 최종 요약

3문단 이내:

```
## 이번 세션 정리

**완료:** {한 줄 요약}
**남은 채무:** {있으면 표기, 없으면 "없음"}
**다음 세션 시작 시:** `/session-resume` (auto mode 시 자동 로드)

**세션 이름 제안:** `/rename {slug}`
- 서브이슈 완결: `{issue-N}` (예: `489-notify-utf8`)
- 릴리즈: `release-v0.X.Y`
- 마일스톤 계획: `milestone-N-plan`
- Hotfix: `hotfix-{issue}`
```

## 원칙

- **한 세션 = 한 논리적 완결 단위** (마일스톤이 아니라 서브이슈/릴리즈/hotfix)
- **인계는 명확하게, 최소로** — 다음 세션이 5분 안에 상태 재구축 가능해야 함
- **temporary vs archive 구분**:
  - `project_session_active.md` → 임시 (다음 세션이 삭제)
  - `project_milestoneXX_complete.md` → 영구 (역사 기록)
  - `project_next_milestone_XX.md` → 진행중일 때만 유효, 완료 후에는 참조용 아카이브
- **커밋되지 않은 파일 경고** — 다음 세션이 못 볼 수도 있음

## 연관

- [[session-resume]] — 반대 방향 (시작 시)
- [[milestone-workflow]] — 진행 중일 때
- [[feedback_session_management]] — rotate 원칙
