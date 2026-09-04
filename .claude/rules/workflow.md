# 개발 워크플로우

모든 작업은 이 워크플로우를 따른다. 단계를 건너뛰지 않는다.

> **출처.** myFinance·myFitness 의 `.claude/rules/workflow.md` 를 계승한다.
> 두 원본은 8절(코드 리뷰)에서 갈라져 있었다 — fin 241줄 / fit 264줄.
> **더 진화한 쪽(fit 의 8-0·8-5·8-6)을 정본으로 삼고 fin 의 명시적 기준을 합쳤다** (#5).
> 세 저장소가 다시 갈라지면 이 파일이 정본이다.

## 브랜치 전략

- `main`: 정본. 직접 커밋 금지.
- `dev`: 개발. hotfix 를 제외한 모든 브랜치는 dev 에서 생성. **저장소 기본 브랜치**
- `feat/<issue>-<n>`: 기능 개발. dev 에서 생성 → dev 로 PR.
- `fix/<issue>-<n>`: 버그 수정. dev 에서 생성 → dev 로 PR.
- `chore/<issue>-<n>`: 문서·설정·룰. dev 에서 생성 → dev 로 PR.
- `hotfix/<issue>-<n>`: 정본 긴급 수정. main 에서 생성 → main, dev 양쪽 머지.

```
main ─────────────────●────────────●──── (릴리즈 태그)
                      ↑            ↑
dev ──┬──┬──┬────────merge────────merge──
      │  │  │
      │  │  └─ chore/5-1 워크플로우 룰
      │  └─── feat/12-notify-port
      └───── feat/8-package-scaffold
```

**대상 저장소(myFinance·myFitness)는 브랜치 체계가 다르다.** 그쪽은 `integration/pleiades`
worktree 에서 작업하고 `integration/pleiades-<단계>` 를 따서 PR 로 합친다 — `docs/specs/004-repo-layout.md`.

## 릴리즈 전략

- dev → main 머지 후 태그 생성.
- 태그 형식: `v{major}.{minor}.{patch}`
- **`@pleiades/notify` 는 git 의존성으로 배포된다** — 두 대상 저장소가 이 태그를 참조한다.
  즉 **태그를 올리면 두 저장소의 의존성 갱신 PR 이 따라온다** (003 §2-2 버전 드리프트).

**릴리즈도 PR 을 거친다.** `main` 직접 커밋 금지와 "머지는 사용자가 직접"은 릴리즈에도 적용된다.

```bash
# 1. dev → main PR 생성 (Claude)
gh pr create --base main --head dev --title "Release v1.0.0" --body "..."

# 2. 사용자가 머지

# 3. 머지 확인 후 태그 (Claude)
git checkout main && git pull
git tag v1.0.0
git push origin --tags
gh release create v1.0.0 --title "v1.0.0" --notes "릴리즈 노트"
```

> **정정 (PR #6 Codex 리뷰 P1).** 계승한 원본 두 저장소의 절차는
> `git merge dev` → `git push origin main --tags` 로 **로컬에서 main 을 직접 갱신·push** 했다.
> 이는 같은 문서의 "`main` 직접 커밋 금지"·"머지는 사용자가 직접"과 모순이고,
> 보호된 `main` 에서는 절차 자체가 실패한다. **같은 결함이 myFinance·myFitness 양쪽에 있다.**

버전 기준:
- major: Breaking change (패키지 인터페이스 변경 = 두 저장소 동시 수정 필요)
- minor: 기능 추가
- patch: 버그 수정, hotfix

## 단계별 규칙

### 1. 기획
사용자 요청 → 목적·범위·의존성 정리 → **사용자 승인 후** 다음 단계.

### 2. 실측 (pleiades 고유)

**추정으로 답하려는 순간이 이 단계다.**

- `docs/research/measured-facts.md` 를 **먼저 읽는다.** 있는 값은 재측정하지 않는다
- 없으면 `repo-surveyor` 로 측정하고 **측정 명령과 함께** 그 파일에 추가한다
- **`grep` 에는 반드시 `--binary-files=text`** — 없으면 `.next/cache` 같은 파일이 binary 로
  판정돼 조용히 0건 오탐이 난다. 실제로 두 에이전트가 독립적으로 같은 오탐을 냈다 (004)

### 3. 기획 문서화
`docs/specs/<NNN>-<주제>.md` 에 작성. 포함: 목적, 옵션 사다리, **되돌리기 비용**, 미결 질문 표, 제외 사항.
`decision-doc` 스킬을 쓴다.

### 4. 되돌리기 비용 산정 (pleiades 고유 — 대상 저장소의 UI/UX 디자인 단계를 대체)

pleiades 에는 UI 가 없다. 그 자리에 **가역성 게이트**가 온다.

- 모든 옵션·단계에 **되돌리기 등급 + 되돌리는 행위 + 소요**를 병기한다. 예외 없다
- 등급: **즉시** / **중간** / **높음** / **편도**
- **초안이 나오면 `reversibility-auditor` 로 반증한다.** 값싸 보이는 계획일수록 필요하다
- 정정이 하나라도 나오면 문서는 다시 초안이다. 3회를 넘으면 스코프를 줄인다

전례: "단계 0 은 JSON 두 줄"이 실측에서 **TS 2파일 + 빌드 + `pm2 restart`** 로 뒤집혔다.
"`mv` 한 번이면 끝"이 **`.next/cache` 1.35 GB 절대경로 키잉**으로 정정됐다.

### 5. GitHub 이슈 생성

```bash
gh issue create --title "<제목>" --body "$(cat docs/specs/...)" --label "<라벨>"
```

라벨: `1a` · `선결` · `측정` · `결정`
**이슈 없이 작업 브랜치를 만들지 않는다.** 이슈와 PR 은 1:1 로 매칭된다.

### 6. 구현 계획
변경 파일 목록, 구현 순서, 패키지 추가 여부 정리. **사용자 승인 후** 코딩 시작.

### 7. 개발

```bash
git checkout dev && git pull
git checkout -b feat/<issue>-<n>
```

커밋: `<type>(<scope>): <desc> (#<issue>)` — 하나의 논리적 변경 = 하나의 커밋.

**대상 저장소에 쓰는 작업이면 `dual-repo-change` 스킬을 쓴다.** 승인 게이트 5항목을
제시하고 명시 승인을 받는다. 포괄 승인을 이미 받았더라도 **실제 범위가 승인 시점 설명과
달라지면 다시 확인한다.** 두 저장소는 실서비스 중이다.

### 8. 검증

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

전부 통과해야 다음 단계. 실패 시 수정 후 재실행. **건너뛰기 금지.**

> **현재 pleiades 에는 npm 프로젝트가 없다.** 이 절은 1a-0(`package.json` 신설) 이후 적용된다.
> 그때까지 문서 변경은 9절의 self-review 경로를 따른다.

### 9. 코드 리뷰

두 단계 리뷰. 목적: **수정 필수 등급**을 걸러내되 재리뷰 사이클과 토큰 소비를 최소화.

> **심각도 척도가 둘이고 방향이 반대다.** 로컬 사전 리뷰(9-1)는 **단어**(critical / major / info),
> GitHub Codex bot(9-2)은 **`P0` 가 최고**인 네이티브 척도를 쓴다. 섞어 쓰지 않는다.

#### 9-0. 적용 조건 (필수 vs self-review)

| 변경 성격 | 사전 리뷰 (9-1) | 근거 |
|---|---|---|
| 패키지 코드 (`packages/**` 로직) | **에이전트 필수** | 로직 버그·엣지케이스 |
| 대상 저장소 변경 (`repos/**`) | **에이전트 필수** | **실서비스 영향** |
| 공개 인터페이스 (포트·시그니처) | **에이전트 필수** | 두 저장소 동시 파급 |
| 신규 파일 3개 이상 or 기존 파일 200 LOC 이상 | **에이전트 필수** | 규모 |
| 보안 sensitive (auth·secret·외부 프로세스) | **에이전트 필수** | 경계 계층 |
| Config / infra 소규모 (`.github/**` 등) | **self-review** | 파급 국소 |
| 문서·스펙만 (`docs/**`, `_workspace/**`, `*.md`) | **self-review** | 실행 코드 아님 |
| 하네스 (`.claude/**`) | **self-review** | 실행 코드 아님 |

self-review 시에도 검증(8절) 필수이고, PR body 에 `self-review only (변경 성격: <카테고리>)` 를 명시한다.

#### 9-1. 로컬 사전 리뷰 (PR 오픈 전)

`pr-review-toolkit:code-reviewer` 에이전트 1회. 9-0 에서 필수인 경우 **자체 검증 없이 PR 오픈 금지.**

```
Task(subagent_type="pr-review-toolkit:code-reviewer", prompt="""
Review branch <current> vs dev in <repo path>.

## Context
<1~3문장으로 이번 변경이 하는 일>

## Focus files
<주요 파일 목록>

## Severity
- critical: 보안·데이터손실·크래시
- major: 로직·엣지케이스·성능
- info: 스타일·네이밍

## Output
각 이슈: severity + file:line + 설명 + fix.
최종 counts: critical/major/info. 300자 이내 결론.
""")
```

> **척도에 P0/P1/P2 를 쓰지 않는다 (PR #6 Codex 리뷰 P1).**
> 계승한 원본은 로컬 프롬프트에서 `P0=info … P2=critical` 로 **관례와 반대**로 정의했는데,
> GitHub Codex bot 은 **P0 를 최고 심각도**로 쓴다. 같은 기호가 두 척도에서 정반대를 뜻해
> 9-2 의 "P0 는 무시"가 **봇의 최고 심각도를 버리는 지시**가 됐다.
> 로컬 리뷰는 **단어**(critical/major/info)를, 봇 리뷰는 **봇의 네이티브 P 척도**를 쓴다.
> **같은 결함이 myFinance·myFitness 양쪽에 있다.**

**심각도 대응 (사전 리뷰):**
- **critical**: 반드시 수정
- **major**: 반드시 수정
- **info**: 저비용/명확한 것만 반영. 큰 리팩터를 요구하면 후속 이슈로 분리

critical/major 반영 후 검증 재통과 → PR 오픈.

#### 9-2. GitHub Codex bot 리뷰 (PR 오픈 후)

PR 오픈 시 자동 트리거. **매 커밋마다 재실행되지 않는다** — `@codex review` 코멘트 시에만 재리뷰.

**봇은 `P0` 를 최고 심각도로 쓴다** — 9-1 의 단어 척도와 방향이 반대다. 봇 지적은 **봇의 표기 그대로** 다룬다:

- **P0 (최고)·P1**: 반드시 수정
- **P2 이하**: 후속 이슈로 트래킹. 저비용·명확한 것만 즉시 반영

**재리뷰 절제:** P0/P1 을 실제로 반영한 커밋에 한해 `@codex review`. P2 이하만 반영했거나
문서만 바꾼 경우 재리뷰 요청 금지 — 재리뷰는 쿼터를 새로 소비한다.

#### 9-3. 반복 루프

```
사전 리뷰 (필수인 경우) → critical/major = 0 → PR 오픈
  ↓
Codex bot 리뷰 → P0/P1 있음? → Yes → 수정 → 커밋 → @codex review
                             → No  → ✅ 통과 (P2 이하는 후속 이슈)
```

2회 이상 반복 시 스코프·설계 재점검 신호.
최종 통과 시 `✅ 코드 리뷰 통과 (사전 critical/major: 0건 · 봇 P0/P1: 0건)`.
**매 리뷰 결과는 사용자에게 요약 보고.**

#### 9-4. 회귀 방지 테스트 (수정 필수 등급 반영 시)

**수정 필수 등급을 고칠 때는 그 이슈를 노출하는 회귀 테스트를 함께 추가한다.**

- 로직·엣지케이스 (사전 `major` / 봇 `P1`) → 테스트 필수. 해당 경계 값·조건 커버
- 보안·데이터손실·크래시 (사전 `critical` / 봇 `P0`) → 테스트 필수. 재현 시나리오 명시
- 그 외 (사전 `info` / 봇 `P2` 이하) → 불필요

작성 원칙: 실제 버그 시나리오를 최소 재현하는 테스트 1건. 코멘트에 리뷰 링크나
이슈 번호를 참조한다 (예: `// 회귀: PR #12 Codex P0 (splitMessage off-by-one)`).
테스트 프레임워크 부재 시 재현 스크립트 + 스펙 갱신으로 대체.

**예외:** 문구·문서 수정 등 테스트로 잡기 어려운 것은 스펙 문구 갱신으로 대체.

#### 9-5. codex-cli MCP (선택 대안)

사전 리뷰의 대안으로 `mcp__codex-cli__codex` 사용 가능. 다만 GitHub Codex bot 과
**동일한 쿼터를 공유**하므로 원칙적으로 쓰지 않는다 — bot 이 PR 오픈 시 이미 리뷰한다.

### 10. PR 생성

```bash
gh pr create --title "<제목> (#<issue>)" --base dev --head <branch>
```

PR 본문 필수 항목:
- 변경 사항 요약
- `Closes #<issue>`
- **되돌리기 비용** — 등급 + 되돌리는 행위 (pleiades 고유)
- 체크리스트: 린트/타입체크/테스트/빌드/리뷰 통과 (해당 시)
- **`## 코드 리뷰 결과` 섹션** — 리뷰 방식(`에이전트 N회 + Codex M회` 또는
  `self-review only (변경 성격: <카테고리>)`), 각 라운드 요약,
  최종 `✅ 사전 critical/major/info = 0/0/0 · 봇 P0/P1 = 0/0`,
  회귀 테스트 목록 또는 "해당 없음 (<사유>)"

PR 링크를 사용자에게 알린다. **머지는 사용자가 직접 한다.**

### 11. 머지 완료 후

사용자가 "머지 완료"를 알려주면:

```bash
gh issue comment <issue> --body "완료: PR #<pr>, 머지일 $(date +%Y-%m-%d)"
gh issue close <issue>
git checkout dev && git pull && git branch -d <branch>
```

그리고 `CLAUDE.md` 의 상태 절을 갱신하고, 다음 작업이 있으면 사용자에게 제안한다.

## 긴급 수정 (Hotfix)

1. `git checkout main && git checkout -b hotfix/<issue>-<n>`
2. 수정 → 검증 → 리뷰(1회, critical 만)
3. PR 2개 생성: main 대상 + dev 대상 (**양쪽 머지 원칙**)
4. 사용자가 양쪽 머지 → 이슈 종료

## pleiades 고유 규율 요약

여기서 벗어나면 재검토한다.

1. **되돌리기 비용을 항상 함께 적는다.** 모든 옵션·단계·PR
2. **실측값은 추정하지 않는다.** `measured-facts.md` 에 없으면 측정하고 그 파일에 추가
3. **대상 저장소에 쓰기 전 반드시 사용자 확인.** 둘 다 실서비스 중이다
4. **작업은 `repos/` 아래 worktree 에서.** 원본 `~/workspace/myF*` 는 서비스 유지용, 쓰기 금지
5. **문서는 한국어. 코드·변수명·경로는 영어**
