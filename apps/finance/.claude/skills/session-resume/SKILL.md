---
name: session-resume
description: "myFinance 새 세션 시작 시 이전 세션 인계 상태를 로드하고 브리핑. 트리거: 새 세션 첫 발화 후 사용자가 명시적 진행 지시 없을 때, '이어서 진행', '지금 상황', '세션 재개', '어디까지 했지', '뭐부터 하면 돼'. 단, 사용자가 명확한 새 작업 요청 시 트리거 X (그건 milestone-workflow 로)."
---

# Session Resume — 시작 브리핑

이전 세션이 어디서 멈췄는지 5분 안에 재구축해서 사용자에게 브리핑.

## When to use

**트리거**:
- 새 세션 첫 발화가 "어디까지 했지" / "지금 상황" / "이어서 진행" / "재개" 류
- Auto mode 상태에서 사용자 첫 메시지가 명확한 작업 지시가 아닌 경우
- 사용자가 명시적으로 `/session-resume` 호출

**사용 X**:
- 사용자가 새 마일스톤/기능 요청 (그건 [[milestone-workflow]])
- 사용자가 특정 이슈 번호 명시 (그건 [[milestone-workflow]] Phase 2)
- 단순 질문 응답

## 실행 절차

### Step 1 — 인계 소스 로드 (병렬)

```
Read: ~/.claude/projects/-Users-sagan-workspace-myFinance/memory/project_session_active.md
Read: ~/.claude/projects/-Users-sagan-workspace-myFinance/memory/MEMORY.md
Bash: git status -s && git branch --show-current && git log --oneline -5
Bash: gh pr list --author @me --state open --limit 5
Bash: gh issue list --author @me --state open --limit 5
```

`project_session_active.md` 존재 여부가 판정 축.

### Step 2 — 상태 분류

| 발견 | 해석 |
|---|---|
| `project_session_active.md` 존재 | 이전 세션 중단됨. 그 파일 지시 우선 |
| `project_session_active.md` 없음 + 열린 사용자 PR 있음 | PR 대기중 (사용자 머지 대기 or Codex 재리뷰 대기) |
| `project_session_active.md` 없음 + 열린 이슈 있음 (author @me) | 다음 서브이슈 후보 |
| 위 모두 없음 + MEMORY.md 에 `project_next_milestone_XX.md` 링크 | 마일스톤 대기 상태 |
| 완전 idle | 사용자에게 후보 제안 (roadmap 검토) |

### Step 3 — 커밋되지 않은 하네스 확인

```bash
git status .claude/ docs/specs/ 2>/dev/null
```

`.claude/agents/`, `.claude/skills/`, master spec 파일 untracked 이면 사용자에게 조용히 언급 (경고성 아님).

### Step 4 — 브리핑 (3문단 이내)

**포맷**:

```
## 세션 상태

**직전 세션:** {요약 1문장}
**현재 브랜치:** `{branch}` ({clean|N files changed})
**열린 항목:** PR #{X} ({title}), 이슈 #{Y} ({title})

**다음 후보 액션:**
1. {가장 자연스러운 다음 스텝}
2. {대안}
3. {신규 작업 시작 or 마일스톤 기획}

어떤 방향으로 갈까?
```

**Auto mode 시**:
- 다음 액션이 자명하면 (예: 특정 이슈 진행 후 PR 대기 → codex 리뷰 확인 후 응답) 바로 진행
- 여러 선택지 있으면 브리핑 후 사용자 대기

### Step 5 — active 파일 정리

`project_session_active.md` 로 재구축을 완료하고 사용자와 재개하기 시작하면 그 파일 삭제:

```bash
rm ~/.claude/projects/-Users-sagan-workspace-myFinance/memory/project_session_active.md
```

(파일이 남아있으면 다음 세션이 또 재구축을 시도함. 반드시 소비 후 삭제.)

## 원칙

- **재구축은 빠르게** — memory + git + gh 3개 소스로 충분
- **결정은 사용자에게** — 여러 후보 중 auto 선택 X, 브리핑 후 대기
- **active 파일은 반드시 소비 후 삭제** — 그렇지 않으면 stale 인계 반복
- **커밋되지 않은 파일은 조용히 안내** — 다음 세션에서 사라질 위험 낮으면 경고 X

## 연관

- [[session-boundary]] — 반대 방향 (종료 시)
- [[milestone-workflow]] — 상태 재구축 후 다음 액션이 마일스톤 워크플로우일 때
- [[feedback_session_management]] — 세션 rotate 원칙 및 네이밍
