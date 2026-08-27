---
name: project-spec-writer
description: "myFinance 스펙 문서 작성 컨벤션 (마스터/서브 구조, 완료 조건 체크리스트, Closes 링킹, 의존성 명시, 노력 예상 XS/S/M/L). 마스터 스펙, 서브이슈 스펙, docs/specs/{N}-*.md 작성 시 사용."
---

# Project Spec Writer — myFinance 스펙 컨벤션

myFinance 의 `docs/specs/` 문서 규격. spec-planner 가 사용.

## 마스터 스펙 템플릿

파일명: `docs/specs/{issue-number}-milestone-{N}-master.md`

```markdown
# {N}차 마일스톤 — {테마} (마스터)

- **작성일**: YYYY-MM-DD
- **타입**: 마일스톤 (마스터 스펙, sub-phase 분할)
- **참조**: 이전 마스터 #{prev}, `memory/project_next_milestone_{N}.md`
- (선택) **대체**: 이전 이슈 #{X} 재구성 시

## 1. 배경
- 이전 마일스톤 완료로 확보된 인프라
- 사용자 명시 pain (알림 노이즈, 성능 이슈 등)
- 시장·기술 변화

## 2. 목표
{N}차 종료 시:
- ✅ 구체 지표 1
- ✅ 구체 지표 2

## 3. Sub-Phase 분할

### Phase {N+K}: {영역명}

#### {N+K}-A: {서브 제목} (~노력 예상)

**목적**: 한 줄

- [ ] 구체 작업 1
- [ ] 구체 작업 2

**의존성**: 없음 / #{선행 이슈}
**노력**: XS (반나절) / S (1일) / M (2~3일) / L (1주)

## 4. 착수 순서
```
{N+K}-A → {N+K}-B → {N+K+1}-A → ...
```

## 5. 제외 사항
- 스코프 밖 항목 명시

## 6. 산출물 (선택)
- 신규 파일 · 마이그레이션 · 페이지 리스트
```

## 서브이슈 본문 템플릿

```markdown
> {N}차 마스터: #{master}. §3 Phase {N+K}-{X} 참조.

## 목표
{한 문단}

## 변경
- [ ] {구체 파일 + 함수}
- [ ] {마이그레이션 (있으면)}
- [ ] {UI 변경 (있으면)}
- [ ] {테스트 추가}

## 의존성
{선행 이슈} 또는 "없음"

## 완료 조건
- [ ] lint / typecheck / test / build 통과
- [ ] 코드 리뷰 P1/P2 = 0
- [ ] {수동 검증 항목}

Closes #{issue}
```

## 필수 요소
- **`Closes #N`** — 자동 이슈 종료
- **완료 조건 체크리스트** — 항상 4종 검증 + P1/P2 = 0
- **의존성** — 선행 있으면 명시, 없으면 "없음"
- **`- [ ]`** 마크다운 체크박스 — 진행 상황 시각화

## 원칙
- **1 서브이슈 = 1 논리적 변경** — 스코프 커지면 더 쪼갬
- **재사용 명시** — 15차 `kst-date.ts`, 16차 `AdvisorIntent` / `conditionsEqual` 언급
- **제외 사항 명시** — 스코프 크리프 방지 + 후속 이슈 아이디어 seeding
- **패턴 참조** — 유사 이슈 재검토를 위해 (예: "34-A 어닝 캐시 패턴 재사용")

## GitHub 이슈 발행
```bash
gh issue create --title "[Phase {N+K}-{X}] {제목}" --label "feature,P1" --body "$(cat <<'EOF'
{서브이슈 본문}
EOF
)"
```

라벨:
- `phase-{N}` (있으면)
- `feature` / `bug` / `chore`
- 우선순위: `P0` (info), `P1` (major), `P2` (critical)

## 참고 파일
- 마스터 예시: `docs/specs/402-milestone-14-master.md`, `docs/specs/414-milestone-15-master.md`, `docs/specs/432-milestone-16-master.md`
- 서브 예시: `docs/specs/415-*.md`, `docs/specs/419-*.md`, `docs/specs/434-*.md`
