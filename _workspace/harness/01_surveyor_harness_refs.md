# 01 surveyor — 하네스 참조 그래프 · 의존 · 운영 비용 (실측 B)

측정일 **2026-09-07** · 읽기 전용 (대상 저장소 쓰기 0건)

## 측정 대상 (모드와 ref)

| 대상 | 디렉터리 | ref | 사유 |
|---|---|---|---|
| pleiades 하네스 | `~/workspace/pleiades/.claude/` + `CLAUDE.md` | 워킹트리 (`dev`, clean) | pleiades 자체 |
| myFinance 하네스 | `~/workspace/pleiades/repos/myFinance` | **`integration/pleiades`** (모드 I) | `.claude/` tracked 16파일 |
| myFitness 하네스 | **원본 `~/workspace/myFitness/.claude/`** | **ref 없음 — 파일시스템 전용** | `.claude/` 가 `.gitignore:35` 로 **버전 관리 밖**. `git ls-files .claude` → **0**. worktree `repos/myFitness/.claude` 는 **존재하지 않음**(`ls` → No such file). 따라서 원본 파일시스템 외에 측정할 곳이 없다 |
| myFitness tracked 파일 | `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` (모드 I) | 항목 2 대칭 측정 |
| fin `workflow.md` (#8) | `repos/myFinance` | **`dev`** | #8 은 **원본 저장소의 결함**이고 그 저장소 로드맵에 속한다. `diff dev integration/pleiades` = **0줄**이므로 값은 동일 |

**상태 확인**: `git -C repos/myFinance status -sb` → `## integration/pleiades`, `git -C repos/myFitness status -sb` → `## integration/pleiades`. 양쪽 clean.

**부수 확인 — worktree fin `.claude/` 는 16파일이 아니라 16파일 그대로이되 `settings.local.json` 이 없다**

```bash
ls -la ~/workspace/pleiades/repos/myFinance/.claude/   # agents rules skills — settings.local.json 없음
ls -la ~/workspace/myFinance/.claude/                  # + settings.local.json 17,469 B
```

| | tracked md 16 | `settings.local.json` |
|---|---|---|
| 원본 `~/workspace/myFinance/.claude/` | ✅ | ✅ 17,469 B (gitignore) |
| worktree `repos/myFinance/.claude/` | ✅ | **❌ 없음** |

---

## 1. 참조 그래프

### 측정 명령

```bash
# 인벤토리 (agent / skill / rule 이름)
ls <root>/.claude/agents | sed 's/\.md$//'
ls -d <root>/.claude/skills/*/ | xargs -n1 basename
ls <root>/.claude/rules | sed 's/\.md$//'

# 각 이름을 하네스 md 전체 + CLAUDE.md 에서 검색 (자기 정의 파일은 제외)
#   agent·skill → \b<name>\b     rule → rules/<name>\.md | `<name>\.md`
grep -nE --binary-files=text "<pattern>" <file>
# 전체 스크립트: refgraph.sh (스크래치패드). 결과는 "파일|줄|kind:대상" 정렬·uniq
```

### 1-A. 총량

| | 참조 줄 수 | agent | skill | rule |
|---|---|---|---|---|
| **myFinance** | **100** | 4 | 7 | 5 |
| **myFitness** | **80** | 5 | 9 | 3 |
| **pleiades** | **105** | 4 | 7 | 1 |

### 1-B. 방향별 (출발 → 도착)

| 방향 | fin | fit | pleiades |
|---|---|---|---|
| `CLAUDE.md` → rule | 7 | 4 | 5 |
| `CLAUDE.md` → skill | **0** | **13** | 4 |
| `CLAUDE.md` → agent | **0** | **0** | **0** |
| agent → agent | 32 | 17 | 30 |
| agent → skill | **0** | 7 | 6 |
| agent → rule | 7 | 1 | 7 |
| skill → agent | 40 | 18 | 19 |
| skill → skill | 11 | 16 | 15 |
| skill → rule | 3 | 4 | 8 |
| rule → agent | **0** | **0** | 2 |
| rule → skill | **0** | **0** | 9 |
| **합** | **100** | **80** | **105** |

**비대칭 2건**
- **fin `CLAUDE.md` 는 skill·agent 를 한 번도 이름으로 부르지 않는다 (0/100).** fit 은 13, pleiades 는 4. fin 의 진입점은 오케스트레이터 스킬이 아니라 `.claude/rules/workflow.md`(CLAUDE.md:128) 하나다.
- **pleiades 만 `rules/workflow.md` 가 skill·agent 를 직접 호출한다 (11건).** fin·fit 의 rule 은 하네스를 부르지 않는다.

### 1-C. 실재하지 않는 대상 / 종류 불일치

| 저장소 | 파일:줄 | 참조 | 판정 |
|---|---|---|---|
| fin | `CLAUDE.md:92` | `stock-trading-method 스킬` | **종류 불일치.** 그 이름은 **rule**(`.claude/rules/stock-trading-method.md`)이고 skill 로는 존재하지 않는다 |
| fin | `docs/specs/321-api-response-envelope.md:12` | `.claude/rules/common/patterns.md` | **경로 없음.** `ls .claude/rules/` → `api-routes / components / stock-trading-method / tax-logic / workflow`. `common/` 디렉터리 부재 |
| fit | `docs/specs/m2-8-date-fix.md:22` | `.claude/plans/jiggly-hugging-kahan.md` | **경로 없음.** `.claude/plans/` 없음 |
| fin | `docs/milestone-2.md:233` | `.claude/config.toml` | **경로 없음** |

그 외 **저장소 밖으로 해소되는 참조 = 외부 플러그인 2개** (이관 대상 아님):

| 이름 | 참조 위치 | 실체 |
|---|---|---|
| `frontend-design` (skill) | fin `rules/workflow.md:64,69` · `CLAUDE.md:131` / fit `rules/workflow.md:65,70` · `CLAUDE.md:95` | `frontend-design@claude-plugins-official` — **user scope 설치·활성** (`~/.claude/settings.json` `enabledPlugins`) |
| `pr-review-toolkit:code-reviewer` (agent) | fin `rules/workflow.md:119,135` · `skills/project-verify/SKILL.md:84` · `agents/quality-guardian.md:12` / fit `rules/workflow.md:129,132` · `skills/codex-review-loop/SKILL.md:75` · `skills/branch-workflow/SKILL.md:90,142` · `agents/workflow-conductor.md:19` / **pleiades `rules/workflow.md:250,253`** | `pr-review-toolkit@claude-plugins-official` — **user scope 설치·활성** |

```bash
python3 -c "import json;d=json.load(open('/Users/sagan/.claude/plugins/installed_plugins.json'));print(sorted(d['plugins']))"
# → code-review, code-simplifier, commit-commands, document-skills, feature-dev,
#    frontend-design, github, harness, pr-review-toolkit, typescript-lsp  (전부 user scope)
```

### 1-D. 에이전트 호출 구문 전수

```bash
grep -rnE --binary-files=text --include='*.md' 'subagent_type|Task\(|Skill\(' <root>/.claude <root>/CLAUDE.md
```

| 저장소 | 건수 | 내역 |
|---|---|---|
| fin | 7 | `rules/workflow.md:135` (plugin) · `skills/milestone-workflow/SKILL.md:33,40,46,53,57` (spec-planner / feature-implementer / quality-guardian / release-manager ×2) · `skills/project-verify/SKILL.md:84` (plugin) |
| fit | 4 | `rules/workflow.md:132` (plugin) · `skills/codex-review-loop/SKILL.md:75` (plugin) · `skills/branch-workflow/SKILL.md:90` (plugin) · `skills/myfitness-orchestrator/SKILL.md:77` (codex-liaison) |
| pleiades | 1 | `rules/workflow.md:253` (plugin) |

→ **실제 `subagent_type` 로 저장소 로컬 에이전트를 부르는 곳은 fin 5줄 · fit 1줄 · pleiades 0줄.** 나머지 파급은 전부 **산문 참조**다.

### 1-E. 저장소 간 이름 참조 = **전 방향 0**

```bash
grep -rnE --binary-files=text --include='*.md' "<상대 저장소 이름 전부>" <root>/.claude <root>/CLAUDE.md | wc -l
```

| 방향 | 건수 |
|---|---|
| pleiades → fin 이름 | **0** |
| pleiades → fit 이름 | **0** |
| fin → fit 이름 | **0** |
| fit → fin 이름 | **0** |
| fin → pleiades 이름 | **0** |
| fit → pleiades 이름 | **0** |

→ **파일을 옮겨도 저장소 사이를 건너는 참조가 끊길 일은 없다.** 세 하네스는 완전히 격리돼 있다.
실제 위험은 끊김이 아니라 **한 네임스페이스에 모았을 때의 이름 충돌**이다.

### 1-F. 이름 충돌 (통합 네임스페이스)

| 이름 | 종류 | fin | fit | pleiades | 그 이름을 가리키는 참조 줄 수 |
|---|---|---|---|---|---|
| `release-manager` | agent | ✅ | ✅ | — | fin **18** · fit **7** = **25** |
| `workflow` | rule | ✅ | ✅ | ✅ | fin **8** · fit **5** · ple **20** = **33** |
| `api-routes` | rule | ✅ | ✅ | — | fin 3 · fit 2 = **5** |
| `components` | rule | ✅ | ✅ | — | fin 2 · fit 2 = **4** |
| skill 이름 | — | 7 | 9 | 7 | **충돌 0** (전부 다름) |

**충돌 4건이 총 67줄의 참조를 모호하게 만든다** (fin 31 · fit 16 · ple 20).
skill 은 23개 전부 이름이 달라 충돌이 없다.

---

## 2. fin `.claude/` 16파일 `git rm` 파급

### 측정 명령

```bash
cd ~/workspace/pleiades/repos/myFinance
# (a) .claude 경로를 부르는 곳 — .claude 자신 제외
git grep --text -n '\.claude' integration/pleiades -- ':!.claude/**' | cut -d: -f2-
# (b) 하네스 이름(agent 4 + skill 7)을 부르는 곳
git grep --text -nE 'feature-implementer|quality-guardian|spec-planner|release-manager|codex-response-patterns|milestone-workflow|project-spec-writer|project-verify|release-publisher|session-boundary|session-resume' \
  integration/pleiades -- ':!.claude/**' | cut -d: -f2-
# (c) 빌드·CI 계열
git grep --text -n 'claude' integration/pleiades -- package.json '.github/**' 'scripts/**' '*.yml' '*.yaml' 'ecosystem.config.js' | cut -d: -f2-
# (d) README
git grep --text -n -i 'claude' integration/pleiades -- 'README*' | cut -d: -f2-
# (e) 삭제될 16파일을 직접 가리키는 참조만
git grep --text -n -E '\.claude/(rules|agents|skills)/' integration/pleiades -- ':!.claude/**' | cut -d: -f2-
```

### 결과

| 검색 | 히트 | 그중 **깨지는** 것 |
|---|---|---|
| (a) `.claude` 문자열 전체 | **20** | 15 |
| (b) **하네스 이름 (agent 4 + skill 7)** | **0 / 733 tracked 파일** | **0** |
| (c) `package.json` · `.github/**` · `scripts/**` · `*.yml` · `ecosystem.config.js` | **1** | **0** — 유일 히트는 `.github/workflows/deploy.yml:109` 의 주석 `claude-advisor.ts` (앱 코드, `.claude/` 무관) |
| (d) `README.md` | 4 | **0** — 전부 "Claude AI 어드바이저"·"Claude Code CLI" 산문. `.claude/` 경로 0 |
| (e) 삭제 대상 16파일 직접 참조 | **15** | 15 |

**(e) 15건 전수**

| 파일:줄 | 가리키는 대상 | 성격 |
|---|---|---|
| `CLAUDE.md:62` | `.claude/rules/` | 디렉터리 트리 도식 |
| `CLAUDE.md:118` | `.claude/rules/api-routes.md` | **활성 규범 포인터** |
| `CLAUDE.md:128` | `.claude/rules/workflow.md` | **활성 규범 포인터 — fin 하네스의 유일한 진입점** |
| `CLAUDE.md:140` | `.claude/rules/` | 섹션 헤더 |
| **`src/app/api/alerts/history/export/route.ts:5`** | `.claude/rules/api-routes.md` | **소스 코드 주석. `.claude/` 를 부르는 유일한 실행 파일** |
| `docs/roadmap.md:325` | `.claude/rules/api-routes.md` | 완료된 체크박스 (이력) |
| `docs/specs/237-trading-skill.md:11,19,21` | `.claude/rules/stock-trading-method.md` | 완료 스펙 (이력) |
| `docs/specs/297-api-response-consistency.md:68` | `.claude/rules/api-routes.md` | 완료 스펙 (이력) |
| `docs/specs/321-api-response-envelope.md:12` | `.claude/rules/common/patterns.md` | **이미 존재하지 않음** (1-C) |
| `docs/specs/337-envelope-e.md:5,19` | `.claude/rules/api-routes.md` | 완료 스펙 (이력) |
| `docs/specs/349-envelope-28e.md:12` | `.claude/rules/api-routes.md` | 완료 스펙 (이력) |
| `docs/specs/395-milestone-13-master.md:110` | `.claude/rules/api-routes.md` | 완료 스펙 (이력) |

**요약: `git rm` 로 갱신이 필요한 활성 참조는 5건** — `CLAUDE.md` 4줄 + 소스 주석 1줄.
나머지 10건은 완료된 이력 문서라 사실 기록으로 그대로 두는 것이 정합적이다 (1건은 이미 dangling).
**빌드·CI·패키지 스크립트 파급은 0.**

### 2-B. fit 대칭 측정 (참고 — fit `.claude/` 는 tracked 가 아니라 `git rm` 대상이 아니다)

```bash
cd ~/workspace/pleiades/repos/myFitness
git grep --text -n '\.claude' integration/pleiades | cut -d: -f2-      # → 5
git grep --text -nE '<fit 하네스 이름 14개>' integration/pleiades | wc -l  # → 0
```

| 파일:줄 | 내용 | 판정 |
|---|---|---|
| `.gitignore:35` | `.claude/` | ignore 규칙 자체 |
| `docs/specs/359-...:14` | `.claude/rules/workflow.md` | **활성 규범 포인터** |
| `docs/specs/364-...:129` | `.claude/rules/workflow.md` | **활성 규범 포인터** |
| `docs/specs/m2-8-date-fix.md:22` | `.claude/plans/...` | **이미 존재하지 않음** |
| `src/lib/monitoring/admin-alerts.ts:272` | `ALERT_TYPE.claude_auth_expired` | **오탐** (`.claude` 아님) |

fit tracked 파일의 하네스 **이름** 참조: **0 / 396 tracked 파일**.

---

## 3. auto memory 의존

### 측정 명령

```bash
d=~/.claude/projects/-Users-sagan-workspace-<proj>/memory
grep -rnE --binary-files=text '\.claude/(rules|agents|skills)' $d          # 경로 참조
grep -rnE --binary-files=text '<그 저장소의 agent+skill 이름 전부>' $d      # 이름 참조
```

(rule 이름 `components`·`api-routes` 는 `src/components/`·API 라우트 산문과 구분되지 않아 **이름 검색에서 제외**했다. rule 참조는 경로 검색에 포함된다.)

| | memory 파일 | `.claude/**` 경로 참조 줄 | skill·agent 이름 참조 줄 | 참조를 가진 파일 |
|---|---|---|---|---|
| **myFinance** | 38 + MEMORY.md | **6** | **12** (그중 1건 오탐) | **6 / 39** |
| **myFitness** | 18 | **2** | **1** | **3 / 18** |
| **pleiades** | 4 | **1** | **1** | **2 / 5** |

**myFinance — 이름 참조 12줄 전수**

| 파일:줄 | 대상 |
|---|---|
| `MEMORY.md:4` | `session-resume` (**세션 시작 트리거**) |
| `MEMORY.md:5` | `session-boundary` (**세션 종료 트리거**) |
| `MEMORY.md:7` | `session-resume` |
| `feedback_session_management.md:46,67,68,69` | `session-resume` ×2, `session-boundary`, `milestone-workflow` (`[[wikilink]]` 형식) |
| `feedback_session_management.md:63` | `milestone-workflow` |
| `project_next_milestone_18.md:16` · `project_next_milestone_19.md:17` | `milestone-workflow` |
| `project_briefing_no_tool_detection.md:45` | `codex-response-patterns` (`[[wikilink]]`) |
| `project_ai_session_resume.md:2` | frontmatter `name: project-ai-session-resume` — **오탐** |

**myFinance — 경로 참조 6줄**: `project_next_milestone_17.md:65`(components.md) · `feedback_session_management.md:59`(`.claude/agents/`·`.claude/skills/`) · `project_milestone9_complete.md:37,43`(api-routes.md) · `feedback_always_follow_workflow.md:3`(workflow.md, **frontmatter `description` — 매칭 트리거**) · `project_milestone13_complete.md:23`(workflow.md)

> **fin memory 에 이미 틀린 기록이 있다.** `feedback_session_management.md:59` 는
> *"`.claude/agents/`, `.claude/skills/` … 가 untracked 이면"* 이라고 적었는데
> fin `.claude/` 는 **tracked 16파일**이다 (`git ls-files .claude` → 16).

**myFitness**: `feedback_release_merge_commit.md:20` → `.claude/skills/release-flow/SKILL.md` (**이름+경로 동시**) · `feedback_review_policy.md:41` → `.claude/rules/workflow.md`

**pleiades**: `MEMORY.md:4` → `pleiades-resume` · `reference_source_repos.md:10` → `.claude/rules/workflow.md`

**요약: 하네스 이름·경로를 부르는 memory 는 fin 6파일 · fit 3파일 · ple 2파일 = 11파일.**
그중 **세션 동작을 실제로 좌우하는 것은 각 저장소 `MEMORY.md` 의 트리거 줄** (fin 3줄, ple 1줄, fit 0줄).

---
## 4. `--add-dir` 운영 비용 — 영속 설정 경로는 **있다 (부분)**

### 측정 명령

```bash
python3 -c "import json;d=json.load(open('/Users/sagan/.claude.json'));print(sorted(d['projects']['/Users/sagan/workspace/pleiades'].keys()))"
grep -l --binary-files=text 'additionalDirectories' ~/.claude/settings.json ~/.claude.json ~/workspace/pleiades/.claude
ls -la ~/workspace/pleiades/.claude/
claude --help | grep -i -A2 -B2 'add-dir'
# CLI 바이너리 문자열 조사 (v2.1.263)
B=/Users/sagan/.local/share/claude/versions/2.1.263
grep -o --binary-files=text '.\{200\}permissions\.additionalDirectories.\{200\}' $B
grep -o --binary-files=text 'if(Ie(a.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD)).\{700\}' $B
grep -o --binary-files=text 'function mp(.\{0,400\}' $B
```

### 현재 설정 상태

| 위치 | `additionalDirectories` 류 설정 | 비고 |
|---|---|---|
| `~/.claude/settings.json` | **없음 (0건)** | `model`·`enabledPlugins`·`autoMode` 등만 |
| `~/.claude/settings.local.json` | **파일 자체 없음** | |
| `~/workspace/pleiades/.claude/settings.json` | **파일 자체 없음** | pleiades `.claude/` 는 `agents/`·`rules/`·`skills/` **3개 디렉터리뿐** |
| `~/workspace/pleiades/.claude/settings.local.json` | **파일 자체 없음** | |
| `~/.claude.json` → `projects["…/pleiades"]` | **없음** | 키 28개 전수 확인. 디렉터리 목록 키 자체가 없다 (`allowedTools`·`mcpServers`·`lastSessionId` 등) |
| `~/.claude.json` → `projects[…]` 전체 14키 | 해당 키 **0건** | |

→ **지금은 세션마다 `--add-dir` 를 넘겨야 한다.** (`CLAUDE.md` 가 이미 그렇게 안내한다. `--add-dir` 는 `--resume` 시 복원되지 않는다.)

### 그러나 영속 설정 키는 CLI 에 **존재한다** (v2.1.263 문자열 실측)

```
permissions.additionalDirectories
  → 'Must be an array of directory paths. Example: ["~/projects", "/tmp/workspace"].
     You can also use --add-dir flag or /add-dir command'
  → 로딩 스코프: projectSettings(".claude/settings.json") · localSettings(".claude/settings.local.json")
```

`claude --help`:
```
  --add-dir <directories...>   Additional directories to allow tool access to
  … --add-dir (CLAUDE.md dirs), --mcp-config, --settings, --agents, --plugin-dir.
```

**단, CLAUDE.md·rules 로딩은 별개 조건이 붙는다.** CLI 코드 실측:

```js
if(Ie(a.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD)){
  let Me=mp();                    // = extensionsConfig.additionalDirectoriesForClaudeMd()
  for(let xe of Me){
    ...ak(xe,"CLAUDE.md")         // <dir>/CLAUDE.md
    ...ak(xe,".claude","CLAUDE.md")
    ...ak(xe,".claude","rules")   // <dir>/.claude/rules/**  ← rules 는 로드된다
    ...ak(xe,"CLAUDE.local.md")
  }
}
```

| 사실 | 판정 |
|---|---|
| `permissions.additionalDirectories` 로 **툴 접근 디렉터리**를 영속화할 수 있다 | **확인** (settings 스키마 키 · 에러 tip · project/local 스코프 로딩 코드) |
| additional dir 의 `CLAUDE.md` + `.claude/rules/` 는 **`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` 환경변수가 켜져야만** 로드된다 | **확인** (위 코드) |
| 그 환경변수를 settings 파일로 고정할 수 있는지 | **미측정** — `settings.json` 의 `env` 키를 CLI 문자열에서 확인하지 못했다. 셸 프로필/래퍼로는 가능하나 그건 설정 파일이 아니다 |
| `permissions.additionalDirectories` 로 등록한 디렉터리가 `mp()`(=`additionalDirectoriesForClaudeMd`) 목록에 들어가는지 | **미측정** — 두 목록이 코드상 다른 접근자다. 정적 문자열만으로 판별 불가. **런타임 검증 필요** |
| 그 디렉터리의 `.claude/skills`·`.claude/agents` 가 발견되는지 | **미측정** — `--add-dir` 플래그로는 발견됨이 이미 실측됨(`measured-facts` "중첩 `.claude/` 는 로드되지 않는다" 표). `permissions.additionalDirectories` 경로는 별도 실측이 필요 |

**즉 "없음 — 플래그 매번 필요"는 정확하지 않다. 정확히는:**
**영속 키는 존재하지만 (a) 그 키가 하네스 로딩까지 커버하는지 미측정이고 (b) CLAUDE.md·rules 로딩은 여전히 환경변수를 요구한다.**
현재 `~/workspace/pleiades` 에는 그 키가 **한 곳에도 설정돼 있지 않다 (0건).**

---

## 5. fit CLAUDE.md·`.claude/` 는 **버전 관리 밖**

```bash
grep -n --binary-files=text -E '^\s*(\.claude|CLAUDE\.md|\.runtime)' ~/workspace/myFitness/.gitignore
git -C ~/workspace/myFitness check-ignore -v CLAUDE.md .claude/rules/workflow.md .claude/
git -C ~/workspace/myFitness ls-files .claude | wc -l
grep -n --binary-files=text -i 'claude' ~/workspace/pleiades/repos/myFinance/.gitignore
```

**myFitness `.gitignore`**
```
34: # claude code
35: .claude/
36: CLAUDE.md
37: .runtime/
```

**`check-ignore -v` (exit 0)**
```
.gitignore:36:CLAUDE.md	CLAUDE.md
.gitignore:35:.claude/	.claude/rules/workflow.md
.gitignore:35:.claude/	.claude/
```

**myFinance `.gitignore`**
```
34: # claude code
35: .claude/settings.local.json
```

| | fit | fin |
|---|---|---|
| `.claude/` tracked 파일 | **0** | **16** |
| `CLAUDE.md` | **ignored** | **tracked** |
| ignore 되는 claude 파일 | `.claude/` 전체 + `CLAUDE.md` | `.claude/settings.local.json` **1개** |
| worktree(`repos/*`)에 존재하는가 | **`.claude/` 없음**, `CLAUDE.md` 는 004 집행 시 **수동 복사** | `.claude/` 16파일 자동 · `settings.local.json` **없음** |

→ **"fit 특수 하네스를 저장소에 유지"는 곧 "버전 관리 밖에, 원본 워킹 디렉터리에만 유지"를 뜻한다.**
백업·리뷰·PR·이력 대상이 아니며, worktree 에서는 보이지도 않는다.
fit 하네스를 tracked 로 바꾸려면 `.gitignore:35-36` 2줄 변경 = **fit 소스 변경**(사용자 확인 대상)이다.

---

## 6. #8 · #10 잔여 항목 위치 — **전부 미수정**

### #8 (fin·fit `workflow.md` 동일 결함 2건)

```bash
cd ~/workspace/pleiades/repos/myFinance
diff <(git show dev:.claude/rules/workflow.md) <(git show integration/pleiades:.claude/rules/workflow.md) | wc -l   # → 0
git show dev:.claude/rules/workflow.md | grep -n --binary-files=text -E 'git merge dev|git tag|git push origin main'
git show dev:.claude/rules/workflow.md | grep -n --binary-files=text -E 'P0|P1|P2'
grep -n --binary-files=text -E 'git merge dev|git tag|git push origin main' ~/workspace/myFitness/.claude/rules/workflow.md
grep -n --binary-files=text -E 'P0|P1|P2' ~/workspace/myFitness/.claude/rules/workflow.md
```

| 결함 | 이슈 본문 기재 | **현재 실측** | 상태 |
|---|---|---|---|
| ① 릴리즈가 `main` 직접 push | fin `:34-36` / fit `:35-37` | fin **34,35,36** (`git merge dev` / `git tag v1.0.0` / `git push origin main --tags`) · fit **35,36,37** (동일 3줄) | **미수정 — 이슈 기재와 정확히 일치** |
| ② `P0` 를 최저로 정의 | fin `:169` / fit `:166` | fin **145-147** 정의 · **169** *"P0: 원칙적으로 무시"* · fit **142-144** 정의 · **166** 동일 문구 | **미수정 — 이슈 기재와 정확히 일치** |

**②의 실제 수정 표면은 이슈가 적은 2줄보다 넓다.**

| | `P0`/`P1`/`P2` 를 쓰는 줄 |
|---|---|
| fin `workflow.md` (241줄) | **17줄** — 59, 115, 121, 145-147, 151, 156-158, 160, 167-169, 172-173, 179, 181-182, 185, 213, 240 |
| fit `workflow.md` (264줄) | **26줄** — 60, 110, 142-144, 148, 153-155, 157, 164-166, 169-170, 175, 177-178, 181, 183, 185, 188-190, 194, 197, 204-205, 235, 262 |

부수 결함(이슈 #8 미기재, pleiades 는 이미 고침): 양쪽 **마지막 줄**(fin `:240` / fit `:262`)의 hotfix 절차가
`리뷰(1회, P2만)` — 그 척도에서 `P2`=critical 이므로 **major/로직 결함을 건너뛴다.**

### #10 (pleiades 측정 하네스 P2 2건) — 대상은 fin/fit 이 아니라 **pleiades `.claude/`**

```bash
cd ~/workspace/pleiades
grep -n --binary-files=text '체크아웃' .claude/skills/repo-measure/SKILL.md .claude/agents/repo-surveyor.md
grep -n --binary-files=text '/tmp/'   .claude/skills/repo-measure/SKILL.md .claude/agents/repo-surveyor.md
```

| 항목 | 이슈 본문 기재 | **현재 실측 (전수)** | 상태 |
|---|---|---|---|
| ① 낡은 체크아웃 게이트 | `repo-measure/SKILL.md:22` · `repo-surveyor.md` | `repo-measure/SKILL.md` **22, 92, 94** · `repo-surveyor.md` **24, 70, 72** = **6줄** | **미수정.** 이슈는 2곳만 적었으나 실제 수정 표면은 **6줄** |
| ② 공유 `/tmp` 임시파일 | `repo-surveyor.md:85` · `repo-measure/SKILL.md` | `repo-measure/SKILL.md` **117,118,119** · `repo-surveyor.md` **84,85,86** = **6줄** | **미수정** |

관련 근거 줄: `pleiades-orchestrator/SKILL.md:74` (*"여러 독립 측정이 필요하면 주제별로 나눠 병렬 수행한다"*) ·
`repo-surveyor.md:55` (*"쓰기 대상은 오직 `~/workspace/pleiades/` 안이다"*).

> **이 측정 세션이 ① 에 실제로 걸렸다.** 항목 1·5 는 fit `.claude/`(ref 자체가 없는
> gitignored 파일)를 재야 하는데, 헤더의 체크아웃 게이트를 문자 그대로 따르면 **"미확인"으로 버려야 한다.**
> 위 "측정 대상" 표에 사유를 명시하고 원본 파일시스템으로 측정했다.

---
## 가정을 뒤집는 숫자

| # | 흔들리는 가정 | 뒤집는 숫자 |
|---|---|---|
| **1** | **"공통은 pleiades 로, 저장소별 특수는 그 저장소에 유지"** — fit 에서는 후반부가 성립하지 않는다 | fit `.claude/` **tracked 0파일** · `CLAUDE.md` **ignored** (`.gitignore:35,36`). "저장소에 유지"는 **버전 관리 밖·원본 워킹 디렉터리에만 유지**를 뜻한다. worktree `repos/myFitness/.claude` 는 **존재하지 않는다.** 즉 fit 특수 하네스는 유지해도 **통합 작업 중에는 보이지 않고, PR·리뷰·이력에도 남지 않는다.** tracked 로 바꾸려면 fit `.gitignore` 2줄 = **fit 소스 변경(사용자 확인 대상)** |
| **2** | **"파일을 옮기면 참조가 깨진다"** — 저장소 간 참조는 애초에 없다 | 저장소 간 이름 참조 **6방향 전부 0건**. 대신 통합 네임스페이스에서 **이름 충돌 4건**(`release-manager` agent, `workflow`·`api-routes`·`components` rule)이 **67줄의 참조를 모호하게** 만든다 (fin 31 · fit 16 · ple 20). skill 23개는 이름이 전부 달라 **충돌 0**. → 위험은 "끊김"이 아니라 **"조용한 오참조"** 다 |
| **3** | **004 Q21 "fin `.claude/` 제거 = 소스 변경이라 비싸다"** — 파급은 5줄이다 | fin 16파일을 `git rm` 했을 때 갱신이 필요한 **활성** 참조 **5건**(`CLAUDE.md` 62·118·128·140 + `src/app/api/alerts/history/export/route.ts:5`). **하네스 이름 참조 0 / 733 tracked 파일**, **`package.json`·`.github/**`·`scripts/**` 파급 0**, **README 파급 0**. 나머지 10건은 완료 스펙의 이력 기록 |
| **4** | *(3의 반대편)* **"문서만 바꾸는 변경"** | 그 5건 중 **1건이 `src/` 실행 파일 주석**이다. `.claude/rules/workflow.md` 9-0 표에서 **"대상 저장소 변경 — 경로 무관"은 무조건 에이전트 사전 리뷰 필수**이므로, 이 PR 은 self-review 경로를 탈 수 없다 |
| **5** | **004 §6 Q20 "회피는 `--add-dir` 를 계속 넘기는 것뿐"** | **`permissions.additionalDirectories`** 가 CLI v2.1.263 의 **정식 settings 키**로 존재한다 (project·local 스코프 로딩 코드 + 에러 tip 실측). 현재 **설정된 곳은 0건**. 다만 additional dir 의 `CLAUDE.md`·`.claude/rules/` 로딩은 여전히 **`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` 환경변수**를 요구하고, 그 키가 skills·agents 발견까지 커버하는지는 **미측정**. → "플래그 외 방법 없음"은 **단정할 수 없다.** 런타임 검증 1회로 갈린다 |
| **6** | **"CLAUDE.md 가 하네스 진입점"** — fin 은 아니다 | fin `CLAUDE.md` → skill **0건** · agent **0건** (총 100 참조 중). fin 의 유일한 진입점은 `CLAUDE.md:128` 의 `.claude/rules/workflow.md` 한 줄이다. fit 은 `CLAUDE.md` → skill **13건**. **두 저장소의 트리거 방식이 구조적으로 다르다** — 통합 CLAUDE.md 를 한 형식으로 쓰면 한쪽 관행이 사라진다 |
| **7** | **"하네스 파일만 옮기면 된다"** | 하네스 이름·경로를 부르는 **auto memory 파일 11개**(fin 6 · fit 3 · ple 2). 그중 **세션 동작을 실제로 좌우하는 트리거 줄**은 fin `MEMORY.md:4,5,7`(`session-resume`·`session-boundary`) · ple `MEMORY.md:4`(`pleiades-resume`) = **4줄**. 스킬 이름을 바꾸면 **memory 도 같은 PR 밖에서** 고쳐야 한다 (memory 는 git 대상이 아니다). fin `feedback_session_management.md:59` 는 **이미 사실과 다르다** (fin `.claude/` 를 untracked 로 기술) |
| **8** | **#8 이 "1줄짜리 척도 수정"이라는 인상** | 미수정 확인. 실제 표면은 **fin 17줄 + fit 26줄 = 43줄**이 `P0/P1/P2` 를 쓴다. 게다가 **이슈에 없는 결함이 1건 더** 있다 — fin `:240` / fit `:262` 의 hotfix 절차 `리뷰(1회, P2만)` 는 그 척도에서 **로직·엣지케이스(major) 리뷰를 건너뛰고 실서비스로 나간다** |
| **9** | **#10 이 "2곳 수정"** | ① 낡은 체크아웃 게이트는 **6줄**(`repo-measure/SKILL.md:22,92,94` · `repo-surveyor.md:24,70,72`), ② `/tmp` 공유 임시파일도 **6줄**(`repo-measure:117-119` · `repo-surveyor:84-86`). 둘 다 미수정. **이 측정 세션이 ①에 실제로 걸렸다** (fit `.claude/` 는 ref 가 없어 게이트대로면 "미확인"으로 버려야 했다) |

### 못 잰 것

| 항목 | 사유 |
|---|---|
| `permissions.additionalDirectories` 가 `.claude/skills`·`agents` 발견까지 커버하는지 | 런타임 동작. 정적 문자열로 판별 불가. `mp()` 는 별도 접근자(`additionalDirectoriesForClaudeMd`) |
| `settings.json` 으로 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` 를 고정할 수 있는지 | CLI 문자열에서 settings `env` 키를 확인하지 못함 |
| 통합 후 이름 충돌 시 CLI 가 어느 쪽을 고르는지(우선순위·경고 유무) | 런타임 동작. 실제 통합 전에는 관측 불가 |
| fit 하네스의 과거 이력 | `.claude/` 가 한 번도 커밋된 적이 없어 git 이력 자체가 없다 |

---

## 부록 — 참조 전수 (파일 \| 줄 \| 대상)

재현: 스크래치패드 `refgraph.sh <repo-root> <label>`

### fin (총 100건)
```
.claude/agents/feature-implementer.md|59|agent:quality-guardian
.claude/agents/feature-implementer.md|62|agent:spec-planner
.claude/agents/feature-implementer.md|63|agent:quality-guardian
.claude/agents/feature-implementer.md|64|agent:spec-planner
.claude/agents/feature-implementer.md|70|agent:spec-planner
.claude/agents/feature-implementer.md|73|agent:spec-planner
.claude/agents/feature-implementer.md|74|agent:quality-guardian
.claude/agents/feature-implementer.md|75|agent:release-manager
.claude/agents/feature-implementer.md|78|rule:api-routes
.claude/agents/feature-implementer.md|79|rule:components
.claude/agents/feature-implementer.md|80|rule:tax-logic
.claude/agents/feature-implementer.md|81|rule:stock-trading-method
.claude/agents/quality-guardian.md|14|agent:feature-implementer
.claude/agents/quality-guardian.md|15|agent:release-manager
.claude/agents/quality-guardian.md|25|agent:feature-implementer
.claude/agents/quality-guardian.md|55|agent:feature-implementer
.claude/agents/quality-guardian.md|59|agent:release-manager
.claude/agents/quality-guardian.md|70|agent:feature-implementer
.claude/agents/quality-guardian.md|72|agent:feature-implementer
.claude/agents/quality-guardian.md|73|agent:release-manager
.claude/agents/quality-guardian.md|74|agent:spec-planner
.claude/agents/quality-guardian.md|77|agent:feature-implementer
.claude/agents/quality-guardian.md|82|agent:feature-implementer
.claude/agents/quality-guardian.md|83|agent:release-manager
.claude/agents/quality-guardian.md|86|rule:workflow
.claude/agents/release-manager.md|71|agent:quality-guardian
.claude/agents/release-manager.md|75|agent:spec-planner
.claude/agents/release-manager.md|81|agent:quality-guardian
.claude/agents/release-manager.md|85|agent:feature-implementer
.claude/agents/release-manager.md|86|agent:spec-planner
.claude/agents/release-manager.md|96|agent:feature-implementer
.claude/agents/release-manager.md|97|agent:quality-guardian
.claude/agents/release-manager.md|98|agent:spec-planner
.claude/agents/spec-planner.md|19|rule:workflow
.claude/agents/spec-planner.md|36|agent:feature-implementer
.claude/agents/spec-planner.md|37|agent:feature-implementer
.claude/agents/spec-planner.md|45|agent:feature-implementer
.claude/agents/spec-planner.md|46|agent:release-manager
.claude/agents/spec-planner.md|49|rule:workflow
.claude/skills/codex-response-patterns/SKILL.md|8|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|8|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|8|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|8|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|8|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|13|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|14|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|15|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|16|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|25|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|26|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|27|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|28|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|31|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|33|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|37|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|40|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|43|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|46|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|46|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|50|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|53|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|57|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|76|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|78|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|80|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|82|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|95|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|95|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|96|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|104|agent:spec-planner
.claude/skills/milestone-workflow/SKILL.md|106|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|107|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|108|agent:release-manager
.claude/skills/milestone-workflow/SKILL.md|115|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|115|agent:quality-guardian
.claude/skills/milestone-workflow/SKILL.md|116|agent:feature-implementer
.claude/skills/milestone-workflow/SKILL.md|121|rule:workflow
.claude/skills/project-spec-writer/SKILL.md|8|agent:spec-planner
.claude/skills/project-verify/SKILL.md|8|agent:quality-guardian
.claude/skills/project-verify/SKILL.md|98|rule:workflow
.claude/skills/release-publisher/SKILL.md|8|agent:release-manager
.claude/skills/release-publisher/SKILL.md|58|rule:workflow
.claude/skills/session-boundary/SKILL.md|25|skill:session-resume
.claude/skills/session-boundary/SKILL.md|49|skill:codex-response-patterns
.claude/skills/session-boundary/SKILL.md|84|skill:session-resume
.claude/skills/session-boundary/SKILL.md|110|skill:session-resume
.claude/skills/session-boundary/SKILL.md|131|skill:session-resume
.claude/skills/session-boundary/SKILL.md|132|skill:milestone-workflow
.claude/skills/session-resume/SKILL.md|3|skill:milestone-workflow
.claude/skills/session-resume/SKILL.md|18|skill:milestone-workflow
.claude/skills/session-resume/SKILL.md|19|skill:milestone-workflow
.claude/skills/session-resume/SKILL.md|96|skill:session-boundary
.claude/skills/session-resume/SKILL.md|97|skill:milestone-workflow
CLAUDE.md|118|rule:api-routes
CLAUDE.md|128|rule:workflow
CLAUDE.md|142|rule:api-routes
CLAUDE.md|143|rule:components
CLAUDE.md|144|rule:tax-logic
CLAUDE.md|145|rule:workflow
CLAUDE.md|146|rule:stock-trading-method
```

### fit (총 80건)
```
.claude/agents/codex-liaison.md|30|skill:codex-review-loop
.claude/agents/codex-liaison.md|31|skill:orphan-check
.claude/agents/codex-liaison.md|44|agent:workflow-conductor
.claude/agents/codex-liaison.md|45|agent:release-manager
.claude/agents/db-migrator.md|31|skill:prisma-drift-fix
.claude/agents/db-migrator.md|35|agent:workflow-conductor
.claude/agents/db-migrator.md|44|agent:workflow-conductor
.claude/agents/db-migrator.md|45|agent:release-manager
.claude/agents/ops-analyst.md|31|skill:ops-diagnose
.claude/agents/ops-analyst.md|44|agent:codex-liaison
.claude/agents/ops-analyst.md|44|agent:workflow-conductor
.claude/agents/ops-analyst.md|45|agent:db-migrator
.claude/agents/release-manager.md|31|skill:release-flow
.claude/agents/release-manager.md|44|agent:workflow-conductor
.claude/agents/release-manager.md|45|agent:codex-liaison
.claude/agents/release-manager.md|46|agent:ops-analyst
.claude/agents/workflow-conductor.md|10|rule:workflow
.claude/agents/workflow-conductor.md|17|agent:db-migrator
.claude/agents/workflow-conductor.md|17|agent:ops-analyst
.claude/agents/workflow-conductor.md|33|skill:branch-workflow
.claude/agents/workflow-conductor.md|34|skill:orphan-check
.claude/agents/workflow-conductor.md|47|agent:codex-liaison
.claude/agents/workflow-conductor.md|48|agent:db-migrator
.claude/agents/workflow-conductor.md|49|agent:ops-analyst
.claude/agents/workflow-conductor.md|50|agent:release-manager
.claude/skills/branch-workflow/SKILL.md|8|rule:workflow
.claude/skills/branch-workflow/SKILL.md|156|skill:codex-review-loop
.claude/skills/branch-workflow/SKILL.md|157|skill:release-flow
.claude/skills/branch-workflow/SKILL.md|175|skill:orphan-check
.claude/skills/codex-review-loop/SKILL.md|96|skill:orphan-check
.claude/skills/myfitness-orchestrator/SKILL.md|3|agent:codex-liaison
.claude/skills/myfitness-orchestrator/SKILL.md|3|agent:db-migrator
.claude/skills/myfitness-orchestrator/SKILL.md|3|agent:ops-analyst
.claude/skills/myfitness-orchestrator/SKILL.md|3|agent:release-manager
.claude/skills/myfitness-orchestrator/SKILL.md|3|agent:workflow-conductor
.claude/skills/myfitness-orchestrator/SKILL.md|25|agent:codex-liaison
.claude/skills/myfitness-orchestrator/SKILL.md|32|skill:codex-review-loop
.claude/skills/myfitness-orchestrator/SKILL.md|32|skill:orphan-check
.claude/skills/myfitness-orchestrator/SKILL.md|34|agent:workflow-conductor
.claude/skills/myfitness-orchestrator/SKILL.md|41|skill:branch-workflow
.claude/skills/myfitness-orchestrator/SKILL.md|41|skill:orphan-check
.claude/skills/myfitness-orchestrator/SKILL.md|43|agent:release-manager
.claude/skills/myfitness-orchestrator/SKILL.md|49|skill:release-flow
.claude/skills/myfitness-orchestrator/SKILL.md|51|agent:db-migrator
.claude/skills/myfitness-orchestrator/SKILL.md|57|skill:prisma-drift-fix
.claude/skills/myfitness-orchestrator/SKILL.md|59|agent:ops-analyst
.claude/skills/myfitness-orchestrator/SKILL.md|65|skill:ops-diagnose
.claude/skills/myfitness-orchestrator/SKILL.md|70|agent:codex-liaison
.claude/skills/myfitness-orchestrator/SKILL.md|70|agent:db-migrator
.claude/skills/myfitness-orchestrator/SKILL.md|70|agent:release-manager
.claude/skills/myfitness-orchestrator/SKILL.md|70|agent:workflow-conductor
.claude/skills/myfitness-orchestrator/SKILL.md|77|agent:codex-liaison
.claude/skills/myfitness-orchestrator/SKILL.md|102|agent:release-manager
.claude/skills/myfitness-orchestrator/SKILL.md|115|rule:workflow
.claude/skills/myfitness-orchestrator/SKILL.md|116|rule:api-routes
.claude/skills/myfitness-orchestrator/SKILL.md|117|rule:components
.claude/skills/orphan-check/SKILL.md|96|skill:release-flow
.claude/skills/orphan-check/SKILL.md|97|skill:codex-review-loop
.claude/skills/orphan-check/SKILL.md|98|agent:workflow-conductor
.claude/skills/release-flow/SKILL.md|198|agent:ops-analyst
.claude/skills/session-handoff/SKILL.md|108|skill:session-primer
.claude/skills/session-handoff/SKILL.md|120|skill:session-primer
.claude/skills/session-primer/SKILL.md|101|skill:session-handoff
CLAUDE.md|92|rule:workflow
CLAUDE.md|106|rule:api-routes
CLAUDE.md|107|rule:components
CLAUDE.md|108|rule:workflow
CLAUDE.md|114|skill:myfitness-orchestrator
CLAUDE.md|115|skill:codex-review-loop
CLAUDE.md|116|skill:branch-workflow
CLAUDE.md|117|skill:orphan-check
CLAUDE.md|117|skill:release-flow
CLAUDE.md|118|skill:prisma-drift-fix
CLAUDE.md|119|skill:ops-diagnose
CLAUDE.md|120|skill:session-primer
CLAUDE.md|121|skill:session-handoff
CLAUDE.md|128|skill:session-primer
CLAUDE.md|129|skill:session-handoff
CLAUDE.md|137|skill:session-handoff
CLAUDE.md|137|skill:session-primer
```

### pleiades (총 105건)
```
.claude/agents/decision-writer.md|25|agent:repo-surveyor
.claude/agents/decision-writer.md|72|skill:decision-doc
.claude/agents/decision-writer.md|73|skill:pleiades-handoff
.claude/agents/decision-writer.md|77|agent:repo-surveyor
.claude/agents/decision-writer.md|87|agent:repo-surveyor
.claude/agents/decision-writer.md|89|agent:repo-surveyor
.claude/agents/decision-writer.md|90|agent:reversibility-auditor
.claude/agents/decision-writer.md|108|agent:repo-surveyor
.claude/agents/decision-writer.md|109|agent:reversibility-auditor
.claude/agents/decision-writer.md|110|agent:dual-repo-operator
.claude/agents/dual-repo-operator.md|32|agent:reversibility-auditor
.claude/agents/dual-repo-operator.md|38|rule:workflow
.claude/agents/dual-repo-operator.md|47|rule:workflow
.claude/agents/dual-repo-operator.md|49|rule:workflow
.claude/agents/dual-repo-operator.md|68|rule:workflow
.claude/agents/dual-repo-operator.md|72|rule:workflow
.claude/agents/dual-repo-operator.md|95|agent:decision-writer
.claude/agents/dual-repo-operator.md|99|skill:dual-repo-change
.claude/agents/dual-repo-operator.md|112|agent:decision-writer
.claude/agents/dual-repo-operator.md|114|agent:reversibility-auditor
.claude/agents/dual-repo-operator.md|115|agent:decision-writer
.claude/agents/dual-repo-operator.md|134|agent:reversibility-auditor
.claude/agents/dual-repo-operator.md|135|agent:decision-writer
.claude/agents/dual-repo-operator.md|136|agent:repo-surveyor
.claude/agents/repo-surveyor.md|15|rule:workflow
.claude/agents/repo-surveyor.md|53|agent:dual-repo-operator
.claude/agents/repo-surveyor.md|94|skill:repo-measure
.claude/agents/repo-surveyor.md|107|agent:decision-writer
.claude/agents/repo-surveyor.md|108|agent:decision-writer
.claude/agents/repo-surveyor.md|109|agent:reversibility-auditor
.claude/agents/repo-surveyor.md|126|agent:decision-writer
.claude/agents/repo-surveyor.md|127|agent:reversibility-auditor
.claude/agents/repo-surveyor.md|128|agent:dual-repo-operator
.claude/agents/reversibility-auditor.md|15|rule:workflow
.claude/agents/reversibility-auditor.md|30|skill:dual-repo-change
.claude/agents/reversibility-auditor.md|112|skill:reversibility-audit
.claude/agents/reversibility-auditor.md|119|agent:decision-writer
.claude/agents/reversibility-auditor.md|124|agent:decision-writer
.claude/agents/reversibility-auditor.md|126|agent:decision-writer
.claude/agents/reversibility-auditor.md|127|agent:repo-surveyor
.claude/agents/reversibility-auditor.md|144|agent:decision-writer
.claude/agents/reversibility-auditor.md|145|agent:repo-surveyor
.claude/agents/reversibility-auditor.md|146|agent:dual-repo-operator
.claude/rules/workflow.md|89|agent:repo-surveyor
.claude/rules/workflow.md|97|skill:decision-doc
.claude/rules/workflow.md|105|agent:reversibility-auditor
.claude/rules/workflow.md|131|skill:dual-repo-change
.claude/rules/workflow.md|143|skill:dual-repo-change
.claude/rules/workflow.md|145|skill:dual-repo-change
.claude/rules/workflow.md|157|skill:dual-repo-change
.claude/rules/workflow.md|182|skill:dual-repo-change
.claude/rules/workflow.md|421|skill:dual-repo-change
.claude/rules/workflow.md|427|skill:dual-repo-change
.claude/rules/workflow.md|484|skill:dual-repo-change
.claude/skills/decision-doc/SKILL.md|53|agent:repo-surveyor
.claude/skills/decision-doc/SKILL.md|128|skill:pleiades-handoff
.claude/skills/decision-doc/SKILL.md|133|skill:reversibility-audit
.claude/skills/decision-doc/SKILL.md|134|agent:dual-repo-operator
.claude/skills/dual-repo-change/SKILL.md|12|rule:workflow
.claude/skills/dual-repo-change/SKILL.md|62|skill:reversibility-audit
.claude/skills/dual-repo-change/SKILL.md|84|rule:workflow
.claude/skills/dual-repo-change/SKILL.md|96|rule:workflow
.claude/skills/dual-repo-change/SKILL.md|101|rule:workflow
.claude/skills/dual-repo-change/SKILL.md|118|rule:workflow
.claude/skills/dual-repo-change/SKILL.md|135|skill:decision-doc
.claude/skills/pleiades-handoff/SKILL.md|81|rule:workflow
.claude/skills/pleiades-orchestrator/SKILL.md|3|skill:pleiades-resume
.claude/skills/pleiades-orchestrator/SKILL.md|18|agent:repo-surveyor
.claude/skills/pleiades-orchestrator/SKILL.md|19|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|20|agent:reversibility-auditor
.claude/skills/pleiades-orchestrator/SKILL.md|21|agent:dual-repo-operator
.claude/skills/pleiades-orchestrator/SKILL.md|67|agent:repo-surveyor
.claude/skills/pleiades-orchestrator/SKILL.md|72|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|78|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|87|agent:reversibility-auditor
.claude/skills/pleiades-orchestrator/SKILL.md|99|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|109|agent:dual-repo-operator
.claude/skills/pleiades-orchestrator/SKILL.md|112|agent:reversibility-auditor
.claude/skills/pleiades-orchestrator/SKILL.md|115|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|146|skill:pleiades-resume
.claude/skills/pleiades-orchestrator/SKILL.md|147|skill:pleiades-handoff
.claude/skills/pleiades-orchestrator/SKILL.md|155|agent:repo-surveyor
.claude/skills/pleiades-orchestrator/SKILL.md|156|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|157|agent:reversibility-auditor
.claude/skills/pleiades-orchestrator/SKILL.md|164|agent:reversibility-auditor
.claude/skills/pleiades-orchestrator/SKILL.md|166|agent:decision-writer
.claude/skills/pleiades-orchestrator/SKILL.md|169|skill:pleiades-handoff
.claude/skills/pleiades-resume/SKILL.md|3|skill:pleiades-orchestrator
.claude/skills/pleiades-resume/SKILL.md|14|skill:pleiades-orchestrator
.claude/skills/pleiades-resume/SKILL.md|73|skill:pleiades-orchestrator
.claude/skills/pleiades-resume/SKILL.md|93|skill:reversibility-audit
.claude/skills/pleiades-resume/SKILL.md|97|skill:pleiades-handoff
.claude/skills/repo-measure/SKILL.md|13|rule:workflow
.claude/skills/repo-measure/SKILL.md|135|skill:reversibility-audit
.claude/skills/reversibility-audit/SKILL.md|13|rule:workflow
.claude/skills/reversibility-audit/SKILL.md|28|skill:dual-repo-change
CLAUDE.md|8|rule:workflow
CLAUDE.md|51|rule:workflow
CLAUDE.md|94|skill:reversibility-audit
CLAUDE.md|112|rule:workflow
CLAUDE.md|123|skill:pleiades-orchestrator
CLAUDE.md|124|skill:pleiades-handoff
CLAUDE.md|124|skill:pleiades-resume
CLAUDE.md|130|rule:workflow
CLAUDE.md|143|rule:workflow
```
