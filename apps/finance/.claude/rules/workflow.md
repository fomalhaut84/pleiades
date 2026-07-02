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

### 8. 코드 리뷰

두 단계 리뷰. 목적: P1/P2 이슈를 걸러내되 재리뷰 사이클과 토큰 소비를 최소화.

#### 8-1. 로컬 사전 리뷰 (PR 오픈 전)

**pr-review-toolkit code-reviewer 에이전트 1회.** 아래 예외를 제외하면 자체 검증 없이 PR 을 여는 것은 금지.

**self-review 로 충분** (에이전트 skip 허용) — 다음 중 하나이면서 P2 리스크가 없어야:
- 문서만 (`docs/*`, `*.md`)
- 순수 시각 조정 (색상, spacing, 리터럴 문구)
- 단순 fix / 리팩터 (< 50 LOC 단일 파일)

**에이전트 필수** — 다음 중 하나라도 해당:
- 신규 파일 3개 이상 or 기존 파일 200 LOC 이상 변경
- 신규 API 라우트 or DB 스키마/마이그레이션
- 신규 컴포넌트 (특히 폼/모달/interactive UI)
- 보안 sensitive 경로 (auth, secret, 외부 프로세스 호출)
- AI/LLM 호출 로직 신규/변경

**프롬프트 템플릿:**
```
Task(subagent_type="pr-review-toolkit:code-reviewer", prompt="""
Review branch <current> vs <base> in <repo path>.

## Context
<1~3문장으로 이번 변경이 하는 일>

## Focus files
<주요 파일 목록>

## Severity
- P0 (info): 스타일·네이밍
- P1 (major): 로직·엣지케이스·성능
- P2 (critical): 보안·데이터손실·크래시

## Output
각 이슈: severity + file:line + 설명 + fix.
최종 counts: P0/P1/P2. 300자 이내 결론.
""")
```

**심각도 대응 (사전 리뷰):**
- **P2**: 반드시 수정
- **P1**: 반드시 수정
- **P0**: 저비용/명확한 것만 반영. 큰 리팩터를 요구하는 P0 는 후속 이슈로 분리

P1/P2 반영 후 검증 3종 (`lint / typecheck / build`) 재통과 → PR 오픈. 반영 시 **재발 방지 회귀 테스트도 함께 추가** (같은 P2 반복 발생 억제).

#### 8-2. GitHub Codex bot 리뷰 (PR 오픈 후)

GitHub 이 PR 오픈 시 자동으로 Codex bot 리뷰 트리거. **매 커밋마다 재실행되지 않음** — 사용자가 `@codex review` 코멘트를 남길 때만 재리뷰.

**심각도 대응 (Codex bot):**
- **P2**: 반드시 수정
- **P1**: 반드시 수정
- **P0**: 원칙적으로 무시 (후속 이슈로만 트래킹). 사전 리뷰에서 P0 를 이미 정리했고, Codex 재리뷰는 사용자 codex 쿼터를 새로 소비함

**재리뷰 절제 (토큰 소비 억제):**
- P1/P2 를 실제로 반영한 커밋에 한해 `@codex review` 요청
- P0 만 반영했거나 문서/스펙만 바꾼 경우엔 재리뷰 요청 금지
- 반영 시 회귀 테스트 함께 추가 (같은 지적 반복 방지)

#### 8-3. 반복 루프

```
사전 리뷰 → P1/P2 = 0 → PR 오픈
  ↓
Codex bot 리뷰 → P1/P2 있음? → Yes → 수정 → 커밋 → @codex review
                              → No  → ✅ 통과 (P0 는 후속 이슈)
```

2회 이상 반복 시 스코프/설계 재점검 신호. 최종 통과 시 `✅ 코드 리뷰 통과 (P1/P2: 0건)`. 매 리뷰 결과는 사용자에게 요약 보고.

#### 8-4. codex-cli MCP (선택 대안)

사전 리뷰의 대안으로 `mcp__codex-cli__codex` MCP 도구 사용 가능 (`codex exec` bash 호출 아님). MCP 연결은 정상이지만 GitHub Codex bot 과 동일한 사용자 codex 쿼터를 공유하므로, **원칙적으로 사용하지 않는다** — bot 이 PR 오픈 시 이미 리뷰하므로 CLI 로 이중 소비할 이유 없음.

만약 쓴다면:
```
mcp__codex-cli__codex 호출:
- prompt: <8-1 프롬프트 그대로>
- reasoningEffort: "high"
- fullAuto: true
- workingDirectory: <repo path>
- resetSession: true
- model 파라미터는 생략 (기본 model 미지원 오류 시 지정 필요 — 예: "gpt-4o")
```

품질은 유사하지만 model/quota 이슈 잦음. 실패 시 pr-review-toolkit 으로 폴백. 에러 메시지가 "model not supported when using Codex with a ChatGPT account" 형태로 나오면 대개 쿼터 초과이므로 사용자에게 확인.

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