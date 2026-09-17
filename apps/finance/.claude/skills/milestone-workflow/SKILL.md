---
name: milestone-workflow
description: "myFinance 프로젝트의 10단계 마일스톤 워크플로우 오케스트레이터. 기획 → 스펙 → 이슈 → 개발 → 리뷰 → PR → 머지 → 배포까지 전체 조율. 트리거: '다음 서브이슈', '마일스톤 기획', 'Phase XX 시작', '{Phase} 착수', '{issue} 진행', 후속 작업: '이어서 진행', '다음 서브이슈 시작', '릴리즈 준비', '머지완료'. 단순 질문·조회는 트리거 X."
---

# Milestone Workflow — 10단계 오케스트레이터

myFinance 마일스톤 개발 흐름을 조율. spec-planner → feature-implementer → quality-guardian → release-manager 파이프라인.

## 실행 모드: 하이브리드
| Phase | 모드 | 이유 |
|-------|------|------|
| Phase 1 (기획) | 서브 (spec-planner) | 단일 산출물 (스펙+이슈), 팀 통신 불필요 |
| Phase 2 (개발) | 서브 (feature-implementer) | 순차 작업, 브랜치 격리 |
| Phase 3 (검증+리뷰) | 서브 (quality-guardian) | pr-review-toolkit 재사용 |
| Phase 4 (PR·Codex) | 서브 (release-manager) | 지시자 역할 |
| Phase 5 (릴리즈) | 메인 오케스트레이터 | git 명령어 직접 실행 |

## Phase 0: 컨텍스트 확인 (필수)
매 트리거 시 실행:
1. `git branch --show-current` — 현재 브랜치
2. `gh issue list --state open --limit 5 --json number,title,labels` — 미완료 이슈
3. 최근 memory 파일 (`~/.claude/projects/-Users-sagan-workspace-myFinance/memory/project_next_milestone_*.md`) 로 다음 목표 파악
4. 사용자 요청 유형 분류:
   - **새 마일스톤 기획** → Phase 1 (spec-planner)
   - **서브이슈 착수** → Phase 2 (feature-implementer, 이슈 번호·스펙 파일 확인)
   - **Codex 리뷰 URL 전달** → Phase 4 (release-manager 로 즉시)
   - **"머지완료" 알림** → Phase 4 (release-manager 정리) → 다음 서브이슈 제안
   - **릴리즈 준비** → Phase 5

## Phase 1: 기획 (spec-planner)
```
Agent(subagent_type="spec-planner", model="opus", prompt="{사용자 요청 원문}\n\n프로젝트 컨벤션: CLAUDE.md 참고. 마스터 스펙 + 서브이슈 트리 작성 후 gh issue create.")
```
결과: 마스터 스펙 파일 + 이슈 번호 리스트 + 착수 순서

## Phase 2: 개발 (feature-implementer)
사용자 승인 후 첫 서브이슈부터:
```
Agent(subagent_type="feature-implementer", model="opus", prompt="이슈 #{N} ({title}) 구현. 스펙: docs/specs/{N}-*.md. 브랜치 생성 → 코드 작성 (컨벤션 준수) → 테스트 페어링 → 커밋.")
```

## Phase 3: 검증+리뷰 (quality-guardian)
개발 완료 후:
```
Agent(subagent_type="quality-guardian", model="opus", prompt="브랜치 {branch-name} 검증. 4종 세트 (lint/typecheck/test:run/build) + pr-review-toolkit self-review (규칙 8-1 기준) + verify skill (UI/API 변경 시). P1/P2 발견 시 feature-implementer 에게 반영 요청.")
```
P1/P2 발견 시 → Phase 2 로 되돌아가 반영 후 재검증.

## Phase 4: PR·Codex 대응 (release-manager)
검증 통과 후:
```
Agent(subagent_type="release-manager", model="opus", prompt="브랜치 {branch-name} PR 생성 (base: dev). Codex 리뷰 URL 도착 시 학습 패턴 기반 즉시 대응.")
```
사용자가 "머지완료" 알림 시:
```
Agent(subagent_type="release-manager", model="opus", prompt="PR #{N} 머지 완료. 이슈 종료 + 브랜치 정리 + 다음 서브이슈 확인. 마일스톤 종료 시 memory 갱신.")
```

## Phase 5: 릴리즈 (직접 실행)
마스터 이슈의 모든 서브가 완료되면:
1. dev → main Release PR 생성 (마일스톤 요약 본문)
2. 사용자 머지 대기
3. `git checkout main && git pull`
4. `git tag v{X.Y.Z} && git push origin v{X.Y.Z}`
5. `gh release create v{X.Y.Z} --title "..." --notes "..."`
6. Deploy workflow 모니터링 (`gh run list --workflow=deploy.yml --limit 1`)
7. 배포 후 조치 안내 (텔레그램 `/reset`, 실서비스 flow 검증)

## 데이터 흐름
```
사용자 요청
  ↓
[Phase 0: 컨텍스트 확인]
  ↓ (유형 분류)
[Phase 1: spec-planner] → docs/specs/*.md + 이슈들
  ↓ (사용자 승인)
[Phase 2: feature-implementer] → 브랜치 + 커밋
  ↓
[Phase 3: quality-guardian] → 검증 결과 + P1/P2 목록
  ↓ (P1/P2 = 0 시)
[Phase 4: release-manager] → PR URL
  ↓ (Codex 리뷰 도착 시 반복)
[Phase 4 (재)] → 반영 커밋
  ↓ (사용자 머지 후)
[Phase 4: 정리] → 이슈 종료 + 브랜치 정리
  ↓ (모든 서브 완료 시)
[Phase 5: 릴리즈] → v{X.Y.Z} 배포
```

## 에러 핸들링
| 상황 | 대응 |
|------|------|
| 컨텍스트 애매 (Phase 0) | 사용자에게 명확한 요청 재문의 (AskUserQuestion) |
| feature-implementer 컨벤션 위반 | quality-guardian 이 발견 → 즉시 반영 요청 |
| Codex 반복 라운드 > 5 | release-manager 가 근본 원칙 재검토 신호 (스코프 축소 or 원칙 확립) |
| 배포 실패 | 로그 요약 + 사용자 확인 (예: 포트 충돌 → 별도 fix 이슈) |
| Codex quota 소진 | 재리뷰 요청 중단, 자체 리뷰만으로 진행 (경험상 익일 새 quota) |

## 테스트 시나리오
### 정상 흐름 (신규 마일스톤)
1. 사용자: "17차 마일스톤 기획해줘"
2. Phase 0: memory 확인 → `project_next_milestone_17.md` 로 후보 파악
3. Phase 1: spec-planner → 마스터 스펙 + 5개 서브이슈 발행
4. 사용자 승인
5. Phase 2: feature-implementer → 첫 서브이슈 브랜치·커밋
6. Phase 3: quality-guardian → 검증 통과 (P1/P2 = 0)
7. Phase 4: release-manager → PR 생성
8. Codex 리뷰 → Phase 4 재실행 (반영)
9. 사용자 "머지완료" → Phase 4 정리 + 다음 서브이슈 제안
10. 모든 서브 완료 → Phase 5 릴리즈

### 에러 흐름 (검증 실패)
1. Phase 3 에서 test failure 발견
2. quality-guardian → feature-implementer 에게 수정 요청 (구체 파일)
3. feature-implementer 재실행 (기존 브랜치에서)
4. Phase 3 재실행 → 통과
5. Phase 4 정상 진행

## 프로젝트 컨벤션 참고
- 워크플로우 규칙: `.claude/rules/workflow.md`
- CLAUDE.md
- 이전 마일스톤 완료 memory (`project_milestone{N}_complete.md`)
