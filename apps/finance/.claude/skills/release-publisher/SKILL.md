---
name: release-publisher
description: "myFinance 마일스톤 완료 후 dev→main → 태그 → GitHub Release → Deploy workflow 자동화 절차. 릴리즈 발행, v0.X.Y 태그, 배포 모니터링, 배포 후 안내 시 사용."
---

# Release Publisher — 릴리즈 발행 절차

release-manager 가 마스터 이슈의 모든 서브가 완료된 뒤 사용.

## 사전 조건
- dev 에 모든 서브이슈 PR 머지 완료
- roadmap.md 갱신 (`- [x]` 체크)
- memory 갱신 (`project_milestone{N}_complete.md` + `project_next_milestone_{N+1}.md`)

## 절차

### 1. Release PR (dev → main)
```bash
gh pr create --title "Release v{X.Y.Z} — {N}차 마일스톤 ({테마})" --base main --head dev --body "$(cat <<'EOF'
{N}차 마일스톤 릴리즈. {이월 있으면 명시}.

## Phase {N+K} — {영역}
- **{N+K}-A** (#{issue}/#{pr}): {한 줄 요약}
- **{N+K}-B** (#{issue}/#{pr}): {한 줄 요약}

## 주요 사용자 임팩트
- {카테고리 1}: {임팩트}
- {카테고리 2}: {임팩트}

## 배포 절차
GitHub Release publish → Deploy on Release workflow 자동 트리거.

**AI advisor MCP/prompt 변경 여부**:
- 없음 → 텔레그램 /reset 불필요
- 있음 → 텔레그램 /reset **권장** (--resume 세션이 옛 model 유지 방지)

## Test plan
- [x] 각 PR self-review + Codex 대응
- [x] {N} tests / lint / typecheck / build 통과
- [ ] 배포 후 {수동 검증 항목}

Closes #{master}
EOF
)"
```

### 2. 사용자 머지 대기
사용자가 "머지완료" 알림할 때까지 대기. 임의 머지 금지.

### 3. 태그 발행
```bash
git checkout main && git pull
git log --oneline -3    # 최신 커밋 확인
git tag v{X.Y.Z}
git push origin v{X.Y.Z}
```

버전 규칙 (`.claude/rules/workflow.md`):
- **major**: 큰 기능 or Breaking (Phase 완료 등)
- **minor**: 기능 추가 (마일스톤 단위 일반적)
- **patch**: 버그/hotfix

### 4. GitHub Release 발행
```bash
gh release create v{X.Y.Z} --title "v{X.Y.Z} — {N}차 마일스톤 ({테마})" --notes "$(cat <<'EOF'
{N}차 마일스톤 릴리즈. {이월 명시}.

## Phase {N+K} — {영역}
- **{N+K}-A** (#{issue}/#{pr}): {요약}

## 주요 사용자 임팩트
{임팩트 요약}

## 배포 절차
GitHub Release publish → **Deploy on Release** workflow 자동 트리거.

**AI advisor system-prompt 변경 있음 → 텔레그램 /reset 권장.** (변경 없으면 이 줄 생략)
EOF
)"
```

**주의**: release note 안의 백틱은 이스케이프 필요 (`\`code\``) — 이전에 UTF-8 400 에러 있었음. 대안: 백틱 대신 다른 강조 (`**text**`) 사용.

### 5. Deploy workflow 모니터링
```bash
sleep 15
gh run list --workflow=deploy.yml --limit 1 --json status,conclusion,url
```

완료까지 대기 (background 실행 권장):
```bash
until [ "$(gh run list --workflow=deploy.yml --limit 1 --json status --jq '.[0].status')" != "in_progress" ]; do sleep 30; done
gh run list --workflow=deploy.yml --limit 1 --json status,conclusion,url
```

### 6. 배포 결과 확인
- **성공**: 사용자에게 배포 완료 + 후속 안내
- **실패**: `gh run view {run-id} --log-failed | tail -40` 로 원인 파악
  - EADDRINUSE 4200 → 포트 충돌 hotfix
  - Telegram notification UTF-8 → 배포 자체는 성공, 안내만
  - Migration 실패 → prisma migrate deploy 로그 확인

### 7. 배포 후 안내 (사용자 알림)
```
v{X.Y.Z} 배포 완료 ✅

**권장 후속** (해당 시만):
- 텔레그램 /reset (AI system-prompt 변경 시)
- 실서비스 flow 검증:
  - {신규 페이지 URL}
  - {신규 API 호출}
- 서버 확인: pm2 logs myfinance / myfinance-mcp / myfinance-bot

**다음 세션**: {N+1}차 마일스톤 기획 ([[project_next_milestone_{N+1}]])
```

## 이월 처리
Phase 일부가 다음 마일스톤으로 이월되면:
1. 이월된 서브이슈 close + 코멘트 ("{N+1}차 재검토 시 재발행")
2. 릴리즈 노트에 명시 (`## Phase {N+K} — {영역} ({N+1}차 이월)`)
3. `project_milestone{N}_complete.md` 에 이월 사유 기록

## 에러 대응
| 실패 | 조치 |
|------|------|
| dev→main divergence | force-push 금지, 사용자에게 상태 알림 후 재검토 |
| Deploy workflow 실패 | 로그 요약 + hotfix 이슈 발행 검토 |
| Telegram notify 400 | 배포 성공이면 안내만, 워크플로우 escape 개선 별도 이슈 |
| Port 충돌 (EADDRINUSE) | 서버 SSH 로 좀비 프로세스 확인 + 포트 변경 hotfix |

## 프로젝트 참고
- Deploy source: `project_deploy_source` 메모리 (main 태그 기준)
- 배포 워크플로우: `.github/workflows/deploy.yml`
- 배포 스크립트: `deploy/deploy.sh`
