# 개발 워크플로우

모든 기능 개발은 이 워크플로우를 따른다. 단계를 건너뛰지 않는다.

## 브랜치 전략

- `main`: 실서비스 코드. 직접 커밋 금지.
- `dev`: 개발 코드. hotfix를 제외한 모든 브랜치는 dev에서 생성.
- `feat/<issue-number>-<n>`: 기능 개발. dev에서 생성 → dev로 PR.
- `fix/<issue-number>-<n>`: 버그 수정 (서비스 단계 이전). dev에서 생성 → dev로 PR.
- `hotfix/<issue-number>-<n>`: 실서비스 버그. main에서 생성 → main, dev 양쪽 머지.

```
main ─────────────────●────────────●──── (릴리즈 태그)
                      ↑            ↑
dev ──┬──┬──┬────────merge────────merge──
      │  │  │
      │  │  └─ fix/15-avg-calc
      │  └─── feat/12-live-prices
      └───── feat/8-seed-data

hotfix: main → hotfix/20-crash → main + dev 양쪽 머지
```

## 릴리즈 전략

- dev → main 머지 후 태그 생성.
- 태그 형식: `v{major}.{minor}.{patch}` (예: `v1.0.0`, `v1.2.1`)
- GitHub에서 릴리즈 생성 + 릴리즈 노트 작성 후 배포.

```bash
# 릴리즈 절차
git checkout main && git pull
git merge dev
git tag v1.0.0
git push origin main --tags

gh release create v1.0.0 --title "v1.0.0" --notes "릴리즈 노트 내용"
```

버전 기준:
- major: 큰 기능 추가 또는 Breaking change (Phase 완료 등)
- minor: 기능 추가 (이슈 단위)
- patch: 버그 수정, hotfix

## 단계별 규칙

### 1. 기획
사용자 요청 → 목적·범위·의존성 정리 → 사용자 승인 후 다음 단계.

### 2. 기획 문서화
`docs/specs/<issue-number>-<feature>.md` 에 작성.
포함: 목적, 요구사항(체크박스), 기술 설계, 테스트 계획, 제외 사항.

### 3. GitHub 이슈 생성
```bash
gh issue create --title "[Phase N] 기능명" --body "$(cat docs/specs/...)" --label "phase-N,feature"
```
라벨: `phase-1`~`phase-6`, `feature`/`bug`/`chore`, `P0`/`P1`/`P2`

### 4. UI/UX 디자인

스펙 문서를 기반으로, 구현 전에 **디자인을 먼저** 확정한다.
`frontend-design` 스킬을 활용하여 프로토타입을 생성한다.

**절차:**

1. 스펙 문서의 UI 요구사항을 정리 (페이지, 컴포넌트, 인터랙션 목록)
2. `frontend-design` 스킬로 디자인 시안 생성:
   - Design Thinking: 목적, 톤, 차별화 포인트 결정
   - React/HTML 프로토타입으로 실제 작동하는 시안 제작
   - 반응형(모바일/데스크톱), 다크 테마 반영
3. 사용자에게 시안 공유 → 피드백 → 수정 반복
4. 최종 승인된 디자인을 `docs/designs/<issue-number>-<feature>/` 에 저장

**산출물:**
```
docs/designs/<issue-number>-<feature>/
├── prototype.jsx          # 승인된 React 프로토타입 (참조용)
├── design-notes.md        # 디자인 결정사항 (컬러, 폰트, 레이아웃 근거)
└── screenshots/           # 주요 화면 스크린샷 (선택)
```

**디자인 범위 판단:**
- UI가 있는 기능 (페이지, 대시보드, 차트, 폼) → **필수** 디자인 단계
- 백엔드 전용 (API, cron, DB 마이그레이션) → 디자인 단계 **건너뛰기**
- 텔레그램 커맨드 → 출력 포맷 예시만 정리 (프로토타입 불필요)

**기존 디자인 시스템 준수:**
- `docs/examples/dashboard-prototype.jsx` 의 컬러·레이아웃·톤 참조
- Tailwind CSS + Recharts 기반
- 다크 테마 기본, 모바일 반응형

### 5. 구현 계획
변경 파일 목록, 구현 순서, 패키지 추가, DB 마이그레이션 여부 정리.
**승인된 디자인 파일을 구현 레퍼런스로 참조.**
사용자 승인 후 코딩 시작.

### 6. 개발
```bash
git checkout dev && git pull
git checkout -b feat/<issue-number>-<n>
```
커밋: `<type>(<scope>): <desc> (#<issue>)` — 하나의 논리적 변경 = 하나의 커밋.
UI 구현 시 `docs/designs/` 의 승인된 프로토타입을 기준으로 개발.

### 7. 테스트
```bash
npm run lint && npm run typecheck && npm run test && npm run build
```
전부 통과해야 다음 단계. 실패 시 수정 후 재실행. 건너뛰기 금지.

### 8. 코드 리뷰 (codex-cli)

codex-cli MCP의 프롬프트를 통해 코드 리뷰를 수행한다.

**리뷰 요청:**

`codex` MCP 도구를 사용한다 (`review` 도구가 아님 — `review`는 reasoningEffort를 지원하지 않아 피상적 결과만 반환).

```
codex MCP 도구 호출:
- prompt: "dev 브랜치 대비 현재 브랜치의 변경사항을 코드 리뷰해줘.
  먼저 `git diff dev...HEAD`로 전체 변경사항을 확인한 뒤 심각도별 분류:
  - P0 (info): 스타일·네이밍 개선 제안
  - P1 (major): 로직 오류, 엣지케이스 누락, 성능 문제
  - P2 (critical): 보안 취약점, 데이터 손실 가능성, 크래시
  각 이슈마다 파일명, 라인, 설명, 수정 제안 포함. 최종 요약: P0/P1/P2 각 건수."
- reasoningEffort: "high"
- fullAuto: true
```

**심각도별 대응:**
- P0 (info): 선택 반영.
- P1 (major): **반드시 수정.**
- P2 (critical): **반드시 수정.**

**반복 루프:**
```
리뷰 → P1/P2 있음? → Yes → 수정 → 커밋 → 재리뷰
                    → No  → ✅ 통과
```
P1/P2가 0건이 될 때까지 반복. 매 리뷰 결과를 사용자에게 요약 보고.
최종 통과 시: "✅ 코드 리뷰 통과 (P1/P2: 0건)" 출력.

### 9. PR 생성
```bash
gh pr create --title "[Phase N] 기능명 (#<issue>)" --base dev --head feat/...
```

PR 본문에 포함:
- 변경 사항 요약
- `Closes #<issue-number>`
- 체크리스트: 린트/타입체크/테스트/빌드/리뷰 통과
- 코드 리뷰 결과: 리뷰 횟수, P0/P1/P2 건수
- 디자인 반영 여부: `docs/designs/` 참조 링크 (UI 기능인 경우)

PR 링크를 사용자에게 알린다. **머지는 사용자가 직접.**

### 10. 머지 완료 후

사용자가 "머지 완료"를 알려주면:

```bash
# 1. 이슈에 완료 코멘트
gh issue comment <issue> --body "완료: PR #<pr>, 머지일 $(date +%Y-%m-%d)"

# 2. 이슈 종료
gh issue close <issue>

# 3. 브랜치 정리
git checkout dev && git pull && git branch -d feat/<issue>-...
```

4. `docs/roadmap.md` 해당 항목 체크 `- [x]`
5. 다음 작업이 있으면 사용자에게 제안.

## 긴급 수정 (Hotfix)

실서비스 버그 시 main에서 분기:
1. `git checkout main && git checkout -b hotfix/<issue>-<n>`
2. 수정 → 테스트 → 리뷰(1회, P2만)
3. PR 2개 생성: main 대상 + dev 대상 (양쪽 머지 원칙)
4. 사용자가 양쪽 머지 → 이슈 종료