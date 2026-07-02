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

`pr-review-toolkit:code-reviewer` 에이전트로 **커밋 전 또는 PR 생성 전** 리뷰. PR 오픈 후에는 GitHub Codex bot 이 자동 리뷰하지만, 그 전에 잡을 수 있는 이슈는 잡아 봇 왕복 (수정 커밋 → 봇 재리뷰) 비용을 줄인다.

**codex-cli MCP 는 사용 X** — MCP 서버 연결 자체는 정상이지만 GitHub Codex bot 과 동일한 사용자 codex 쿼터를 소진한다. bot 이 PR 오픈 시 자동 리뷰하므로 CLI 로 이중 소비할 이유 없음. 쿼터 초과 상태에서는 어차피 400 에러로 실패 — 이때 에러 메시지가 "model not supported when using Codex with a ChatGPT account" 형태로 오해 소지 있게 나오지만 실제 원인은 대개 쿼터 소진.

**적용 기준 (필수 vs self-review 만):**

- **에이전트 리뷰 필수** — 다음 중 하나 이상:
  - 신규 파일 3개 이상 or 기존 파일 200 LOC 이상 변경
  - 신규 API 라우트 or DB 스키마/마이그레이션
  - 신규 컴포넌트 (특히 폼/모달/interactive UI)
  - 보안 sensitive 경로 (auth, secret, 외부 프로세스 호출)
  - AI/LLM 호출 로직 신규/변경
- **self-review 로 충분** — 위에 해당 안 하고 다음 중 하나:
  - 문서만 (`docs/*`, `*.md`)
  - 순수 시각 조정 (색상, spacing, 리터럴 문구)
  - 단순 fix / 리팩터 (< 50 LOC 단일 파일)

**에이전트 호출 프롬프트 (템플릿, 300자 이내 결론 요청):**
```
brief: 브랜치 <current> vs <base> diff 리뷰.
- git diff <base>...HEAD 로 변경사항 확인
- 심각도 분류:
  - P0 (info): 스타일/네이밍
  - P1 (major): 로직/엣지케이스/성능
  - P2 (critical): 보안/데이터 손실/크래시
- 각 이슈: file:line + 짧은 설명 + 수정 제안
- 최종 요약: P0/P1/P2 각 건수, 300자 이내
```

**심각도 대응:**
- P0 (info): 선택 반영
- P1 (major): **반드시 수정**
- P2 (critical): **반드시 수정**

**반복 루프:**
```
리뷰 → P1/P2 있음? → Yes → 수정 → 커밋 → (경미하면 self-review 로 확인) → 재리뷰
                    → No  → ✅ 통과
```
2회 이상 반복 시 스코프/설계 재점검 신호. 매 결과 사용자에게 요약 보고. 통과 시 `✅ 코드 리뷰 통과 (P1/P2: 0건)`.

**PR 오픈 후 (GitHub Codex bot):**
- 봇 리뷰가 자동으로 붙는다 — 지적 있으면 즉시 대응 (P2 필수, P1 필수, P0 선택)
- 봇 지적이 매 PR 나온다면 커밋 전 에이전트 프롬프트/self-review 을 다시 sharpen 하라는 신호
- 지적된 이슈 반영 시 관련 회귀 테스트도 함께 추가 (같은 P2 재발 방지)

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