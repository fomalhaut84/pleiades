# 01 surveyor — Q41: H-1 산출물 이름 제약 (실측)

- **측정일** 2026-09-09 · 이슈 #37 Phase 1 실측 A
- **모드** I(통합) — 대상은 worktree `repos/*` (`integration/pleiades`). 단 **fit 원본도 함께 쟀다** — 사유는 §0-2.
- **읽기 전용.** 대상 저장소에 쓰기 0.

## 측정 시점 저장소 상태 (HEAD 4개)

| 체크아웃 | 경로 | 브랜치 | HEAD | dirty |
|---|---|---|---|---|
| pleiades | `~/workspace/pleiades` | `chore/37-1` | `362e6e8` | 0 |
| fin (worktree) | `~/workspace/pleiades/repos/myFinance` | `integration/pleiades` | `6542152` | 0 |
| fit (worktree) | `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` | `626a201` | 0 |
| fit (원본, 참조) | `~/workspace/myFitness` | `main` | `5809c48` | 0 |

> **fit 원본을 함께 잰 사유.** 과제 지시이자, `measured-facts.md` H1 이 *"fit 은 원본만 잴 수 있다"*
> (`.gitignore:35` 가 `.claude/` 를 디렉터리째 무시)로 기록돼 있어 **그 전제가 아직 유효한지** 확인해야 했다.
> → **원본은 여전히 디렉터리 ignore**(`main:.gitignore:35 .claude/` · `:36 CLAUDE.md`), **worktree 는 아니다**
> (`integration/pleiades:.gitignore:35 .claude/settings.local.json` — H-4 / myFitness#369 이 파일 단위로 좁혔다).
> 두 트리의 `.claude/` 는 **`settings.local.json` 1파일을 빼면 바이트 동일**(`diff -rq` 로 확인), 이름 목록은 완전히 같다.

---

## ⚠ 뒤집힌 가정

### F1. **skill 층 이름 충돌은 이미 1건 있다 — `orphan-check`.** 005 §4-5 표의 "H-1 이후 … 0" 은 H-1b 집행 전 값이다

005 §4-5 표 마지막 행은 skill 층을 **"H-1 산출물이 pleiades 에만 있으면 0"** 으로 적고,
정정 G 는 *"H-1 산출물을 `codex-*` 로 지으면 skill 층에 **첫** 충돌이 생긴다"* 고 썼다.

**실측: 그 첫 충돌은 이미 일어났다.** H-1b(PR #22, `4ed13aa`)가 형태 B(복사)로
`pleiades/.claude/skills/orphan-check/SKILL.md` 를 만들었고 **fit 원본은 그대로 남아 있다**(형태 B 의 정의).
디렉터리명·frontmatter `name` 둘 다 `orphan-check` 로 **완전히 동일**하다.

```bash
# 3 체크아웃의 skill·agent 이름을 모아 두 곳 이상 등장하는 이름
for p in repos/myFinance repos/myFitness .; do
  find "$p/.claude/skills" -name SKILL.md | sed 's|.*/skills/||;s|/SKILL.md||'
  find "$p/.claude/agents" -name '*.md'   | sed 's|.*/agents/||;s|\.md$||'
done | sort | uniq -d
# → orphan-check
#   release-manager
```

→ **현 상태의 이름 충돌은 5건이다** (005 가 센 4건 + `orphan-check`):
rule `workflow`·`api-routes`·`components` · agent `release-manager` · **skill `orphan-check`**.
`--add-dir` 로 fit 을 붙이면 skill 층에서 pleiades 판과 fit 원본이 같은 이름으로 만난다.
**skill 충돌 동작은 여전히 미측정**(N18 은 rule·agent 만 쟀다)이므로,
Q41 의 *"겹치는 이름을 쓰면 런타임 측정 1회가 선결"* 이라는 조건은 **H-1 이 어떤 이름을 고르든 이미 성립해 있다.**
단 H-1 이 겹치지 않는 이름을 고르면 **H-1 이 그 부채를 늘리지는 않는다** — 권고(겹치지 않는 이름)는 유지된다.

### F2. H-1 입력 LOC 는 **200 이 아니라 204** (fin 87 → **91**)

005 §4-13 H-1 행의 *"입력 200 LOC / 2파일"* 은 fin 87 + fit 113 이다.
fin `codex-response-patterns/SKILL.md` 는 **`dev` 에서 87줄이 맞지만 `integration/pleiades` 에서는 91줄**이다 —
H-3(fin) / myFinance#492(`6542152`, 2026-09-07 13:37)가 척도 정정을 이 파일에 전파하며 4줄이 늘었다.
**모드 I 의 피연산자는 worktree 이므로 정본 값은 91 + 113 = 204 LOC** 다.

```bash
git -C repos/myFinance show dev:.claude/skills/codex-response-patterns/SKILL.md | wc -l   # 87
wc -l repos/myFinance/.claude/skills/codex-response-patterns/SKILL.md                     # 91
wc -l repos/myFitness/.claude/skills/codex-review-loop/SKILL.md                           # 113
```

### F3. `codex-liaison-patterns` 는 **정확 일치(exact) 충돌이 아니다** — 005 의 "불가" 는 접두 중복 근거다

정정 G 는 `codex-liaison-patterns` 를 *"fit agent `codex-liaison` 과 겹치므로 불가"* 로 들었다.
**실측: 35개 이름 어디에도 `codex-liaison-patterns` 와 정확 일치하는 것은 없다.**
겹치는 것은 **접두 부분 문자열**(`codex-liaison` ⊂ `codex-liaison-patterns`)이고, 게다가 **층이 다르다**(skill vs agent).
005 의 제약 문구 *"이름 어느 것과도 겹치면 안 된다"* 를 **정확 일치**로 읽으면 이 후보는 **허용**되고,
**접두·혼동 가능성**으로 읽으면 불가다. **어느 판정 규칙이 정본인지는 005 에 없다** — 결정 문서가 정해야 한다.
아래 §4 표는 두 기준을 **각각 따로** 적었다. (권고는 여전히 회피 — 접두가 같으면 사람이 헷갈린다.)

---

## 1. 이름 전수 열거

```bash
# 파일 열거
find <root>/.claude -type f | sed "s|^<root>/.claude/||" | sort
# frontmatter name 추출
awk 'NR==1&&/^---/{fm=1;next} fm&&/^---/{exit} fm&&/^name:/{sub(/^name:[ ]*/,"");print;exit}' <file>
```

**모든 파일에서 frontmatter `name` = 디렉터리명(skill) / 파일명(agent) 이었다 — 불일치 0건.**
rules 5+3+1 = 9파일은 **frontmatter 자체가 없다**(`name` 없음). 따라서 아래 표의 이름은 두 기준에서 동일하다.

### 1-1. skills

| # | fin (7) | fit (9) | pleiades (8) |
|---:|---|---|---|
| 1 | `codex-response-patterns` | `branch-workflow` | `decision-doc` |
| 2 | `milestone-workflow` | `codex-review-loop` | `dual-repo-change` |
| 3 | `project-spec-writer` | `myfitness-orchestrator` | **`orphan-check`** ← fit 과 동명 (F1) |
| 4 | `project-verify` | `ops-diagnose` | `pleiades-handoff` |
| 5 | `release-publisher` | **`orphan-check`** | `pleiades-orchestrator` |
| 6 | `session-boundary` | `prisma-drift-fix` | `pleiades-resume` |
| 7 | `session-resume` | `release-flow` | `repo-measure` |
| 8 | — | `session-handoff` | `reversibility-audit` |
| 9 | — | `session-primer` | — |

### 1-2. agents

| # | fin (4) | fit (5) | pleiades (4) |
|---:|---|---|---|
| 1 | `feature-implementer` | `codex-liaison` | `decision-writer` |
| 2 | `quality-guardian` | `db-migrator` | `dual-repo-operator` |
| 3 | **`release-manager`** | `ops-analyst` | `repo-surveyor` |
| 4 | `spec-planner` | **`release-manager`** | `reversibility-auditor` |
| 5 | — | `workflow-conductor` | — |

### 1-3. rules (frontmatter 없음 · 파일명이 곧 이름)

| fin (5) | fit (3) | pleiades (1) |
|---|---|---|
| `api-routes` · `components` · `stock-trading-method` · `tax-logic` · `workflow` | `api-routes` · `components` · `workflow` | `workflow` |

### 1-4. 이름 우주 (충돌 판정의 분모)

- skill·agent 엔트리 **37개** (fin 11 · fit 14 · pleiades 12) → **유니크 35개**
- 중복 2: `orphan-check`(ple↔fit) · `release-manager`(fin↔fit)
- rule 엔트리 **9개** (fin 5 · fit 3 · pleiades 1) → 유니크 **5개** (`api-routes`·`components`·`stock-trading-method`·`tax-logic`·`workflow`). 중복 3: `api-routes`·`components`·`workflow`
- **rule 5개 이름은 skill·agent 35개와 정확 일치가 없다** → 3층 합산 엔트리 46 · **유니크 40**

## 2. 005 합계 대조 (R1 — 합계와 열거가 다르면 열거를 신뢰)

| 항목 | 005 / measured-facts 기재 | 열거 실측 | 판정 |
|---|---:|---:|---|
| fin skill | 7 | **7** | 일치 |
| fin agent | 4 | **4** | 일치 |
| fit skill | 9 | **9** | 일치 |
| fit agent | 5 | **5** | 일치 |
| fin rule | 5 | **5** | 일치 |
| fit rule | 3 | **3** | 일치 |
| pleiades skill | **7** (H1 표, 2026-09-07) | **8** | **불일치 — H-1b(PR #22)로 `orphan-check` 1개 증가.** 열거를 신뢰 |
| pleiades agent | 4 | **4** | 일치 |
| pleiades `.claude/` 파일 계 | **12** (H1 표) | **13** | 위와 같은 사유 |
| fit `.claude/` 파일 계 | **18** (H1 표, 원본) | 원본 **18** / **worktree 17** | 둘 다 참. worktree 는 `settings.local.json` 이 여전히 ignored (H-4 가 tracked 화한 것은 17파일) |
| fin `.claude/` 파일 계 (tracked) | 16 | **16** | 일치 |

→ **005 의 "fin skill 7 · fit skill 9 · fit agent 5 · fin agent 4" 는 그대로 유효하다.**
틀어진 것은 **pleiades 자신의 수**뿐이고, 원인은 H-1b 집행이다(측정 오류 아님).

## 3. H-1 입력 2파일

### 3-1. fin `skills/codex-response-patterns/SKILL.md` (**91줄** · worktree · F2)

```yaml
name: codex-response-patterns
description: "myFinance 프로젝트에서 반복 발견되는 Codex bot 리뷰 P0/P1 패턴(봇 척도, P0 가 최고)과 즉시 대응 방법. canonical key = evaluator semantics, defense in depth, KST 정규화, JSON.stringify 대체 등. Codex 리뷰 URL 도착 시, 리뷰 대응 판단, 회귀 방지 테스트 추가 시 사용."
```

절 제목: `# Codex Response Patterns — 반복 P0/P1 대응 학습` / `## 학습 원칙` / `## 반복 P0/P1 카탈로그`
(`### 1.` ~ `### 10.` = Canonical key 정규화 누락 · Defense in depth 누락 · KST 경계 처리 · Unique constraint 부재 ·
AI 세션 이어가기 + model 변경 · Cron 부팅 후 dead window · 대용량 파일 전체 로드 · Stale UI state ·
lastTriggeredAt 오리셋 · Alpha Vantage / 외부 API 라이선스) / `## 대응 워크플로우` / `## 회귀 방지 테스트 원칙` / `## 프로젝트 참고`

**내용 요약(3줄).** 봇이 **반복 지적하는 결함 10종의 카탈로그**다 — 각 항목이 증상·원인·수정 패턴을 담는다.
절반 이상이 **myFinance 도메인·인프라에 묶여 있다**(KST 경계, cron dead window, Alpha Vantage 라이선스, AI 세션 model 변경).
절차는 `## 대응 워크플로우` 한 절뿐이고, 나머지는 **지식 베이스**다.

### 3-2. fit `skills/codex-review-loop/SKILL.md` (**113줄** · worktree = 원본 동일)

```yaml
name: codex-review-loop
description: Codex bot 또는 pr-review-toolkit 리뷰 URL 을 받으면 자동으로 gh api 로 fetch → path/line/body 요약 → fix 방향 판단 → 반영 커밋 → push → 재리뷰 요청까지 실행하는 절차. `github.com/.../pull/<N>#pullrequestreview-<id>` 형식 URL, `@codex review` 결과, "리뷰 확인해줘" 요청 시 사용.
```

절 제목: `# Codex Review Loop` / `## Trigger` / `## Step 1: 리뷰 fetch` / `## Step 2: Severity 판단` /
`## Step 3: Fix 방향 결정` / `## Step 4: 반영 커밋` / `## Fix` / `## 회귀 검증 (해당 시)` /
`## Step 5: 재리뷰 요청` / `## Step 6: 릴리즈 PR 리뷰 특수 처리` / `## Step 7: Orphan 커밋 감지` /
`## 무한 사이클 방지` / `## 예시 세션 흐름`

**내용 요약(3줄).** 리뷰 URL 을 입력으로 받는 **7-Step 실행 절차**다 — fetch → severity → fix → commit → 재리뷰.
`## Step 7` 이 `orphan-check` 를 호출하고 `## Step 6` 이 릴리즈 PR 을 특수 처리한다(pleiades 9-3·9-4 와 대응).
지식 카탈로그가 아니라 **루프 제어**이므로 fin 판과 **겹치는 것은 severity 판단 1절뿐**이다 (H2: 공통줄 30/87 = 34.5%).

> **두 파일은 성격이 다르다.** fin = **패턴 카탈로그**(무엇이 반복 지적되나), fit = **실행 루프**(어떻게 처리하나).
> H-1 산출물이 둘을 합치면 문서의 성격이 둘이 된다 — 이름 선택도 그 성격을 반영해야 한다.

## 4. 후보 이름 판정

**판정 기준 2종** (F3 — 어느 쪽이 정본인지는 미정):
- **E = 정확 일치**: 35개 이름 중 완전히 같은 것이 있는가
- **S = 부분 일치**: 어느 한쪽이 다른 쪽의 부분 문자열인가 (접두 혼동 위험)

```bash
for c in codex-liaison-patterns pleiades-codex-loop bot-review-response review-bot-playbook; do
  /usr/bin/grep -c --binary-files=text -x -- "$c" universe.txt          # E
  while read n; do case "$c" in *"$n"*) echo "$n";; esac
                   case "$n" in *"$c"*) echo "$n";; esac; done < universe.txt | sort -u   # S
done
```

| 후보 | E(정확) | S(부분) | fin·fit 35 이름 | pleiades 12 이름 | 접두 규약 | 판정 |
|---|---|---|---|---|---|---|
| `codex-liaison-patterns` | **0** | **1 — fit agent `codex-liaison`** | 정확 충돌 0 | 0 | fin·fit 계열 접두 | **회피 권고.** 005 의 "불가"는 S 기준. E 기준으론 허용이지만 **접두가 fit agent 와 같아 사람·로그 양쪽에서 혼동**한다 |
| `pleiades-codex-loop` | 0 | 0 | 0 | 0 | **`pleiades-*` 3개(handoff·orchestrator·resume)와 일치** | **가능 — 최우선.** 소유 저장소가 이름에 박혀 `--add-dir` 로 3벌이 섞여도 출처가 보인다 |
| `bot-review-response` | 0 | 0 | 0 | 0 | pleiades 의 `<명사>-<명사>` 계열(`repo-measure`·`decision-doc`) | 가능. `codex` 를 안 써서 봇 교체 시에도 유효하나 **fin 판의 "패턴 카탈로그" 성격이 이름에 안 드러난다** |
| `review-bot-playbook` | 0 | 0 | 0 | 0 | 상동 | 가능. 카탈로그+루프 합본 성격에 가장 맞으나 pleiades 어휘(`playbook`) 선례 없음 |

**접두 규약 관찰 (실측).** pleiades skill 8개 중 `pleiades-*` 접두는 **3개**(`pleiades-handoff`·`pleiades-orchestrator`·`pleiades-resume`)로
**세션 생애주기 스킬에만** 붙는다. 나머지 5개(`decision-doc`·`dual-repo-change`·`orphan-check`·`repo-measure`·`reversibility-audit`)는
**`<명사>-<명사/동사>` 무접두**다. agent 4개는 전부 무접두 `<명사>-<행위자>` (`decision-writer`·`dual-repo-operator`·`repo-surveyor`·`reversibility-auditor`).
→ *"pleiades 기존 스킬은 `pleiades-*`"* 는 **8개 중 3개(37.5%)에만 해당**한다. 접두는 규약이 아니라 **세션 스킬 표지**다.
다만 **H-1 산출물은 fin·fit 에 동명 역할이 실재하는 유일한 신규 스킬**이므로, 접두를 붙이면 F1 이 드러낸 충돌 부채를 반복하지 않는다.

## 5. 미측정 (의도적)

| 항목 | 상태 | 사유 |
|---|---|---|
| Claude Code 가 **skill 이름 충돌 시 무엇을 기준으로 삼는지**(디렉터리명 vs frontmatter `name`) | **미측정** | Q41 권고는 *"겹치지 않는 이름을 고르면 측정 불필요"*. **본 측정에서 둘이 100% 일치하므로 이 저장소들에서는 두 기준의 결과가 같다** — 구분이 필요한 사례가 없다 |
| skill 이름 충돌 시 **런타임 동작**(rule 처럼 공존인가, agent 처럼 조용한 드롭인가) | **미측정** | N18 은 rule·agent 만 쟀다. **F1 때문에 이 측정은 H-1 과 무관하게 이미 필요조건이 됐다**(`orphan-check` 가 이미 겹쳐 있다) — 별건으로 등재 권고 |
| 위 충돌이 **실제로 발현하는가**(`bin/claude-with fit` 세션에서 `orphan-check` 가 어느 판으로 로드되는가) | **미측정** | 런타임 세션 1회가 필요. 본 과제 범위 밖 |
