# Claude Code 기능 조사 — 축 A 근거

조사일 2026-09-03 · 대상 버전 **Claude Code 2.1.259**
버전 조건이 붙은 항목은 그 버전 이상에서만 동작한다.

출처:
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/large-codebases
- https://code.claude.com/docs/en/plugins

---

## 1. 세션 연속성 — 이미 되는 것

| 기능 | 방법 | 조건 |
|---|---|---|
| 다른 프로젝트 세션 이어받기 | `claude --resume <session-id>` — **아무 디렉터리에서** 가능 | v2.1.223+ |
| 머신 전체 세션 목록 | 세션 피커에서 `Ctrl+A` | — |
| 저장소 전체 worktree 목록 | 세션 피커에서 `Ctrl+W` | — |
| 세션 이름으로 재개 | `claude --resume <name>` / `/rename` 으로 명명 | — |
| 세션 분기 | `/branch`, `--fork-session` | — |

크로스 프로젝트 ID 조회는 **다른 프로젝트 중 정확히 하나만** 그 ID 를 가질 때 해결된다.
중복 사본이 있으면 임의 선택 대신 not-found 를 낸다.

**복원되지 않는 것**: `--add-dir`, `--mcp-config`, `--settings`, `--plugin-dir`, `--fallback-model`.
재개할 때마다 다시 넘겨야 한다. (`settings.json` 계열은 매 실행 재로드되므로 예외)

## 2. 메모리 공유 — 설정으로 되는 것

auto memory 저장 위치: `~/.claude/projects/<project>/memory/`
`<project>` 는 **git 저장소 기준**으로 파생된다 (worktree·하위 디렉터리는 한 디렉터리 공유).
git 저장소가 아니면 프로젝트 루트 경로를 쓴다.

### 방법 A — `autoMemoryDirectory` (권장)

```json
// 두 프로젝트의 .claude/settings.json 에 같은 값
{ "autoMemoryDirectory": "~/shared-claude-memory" }
```

- 절대 경로 또는 `~/` 로 시작해야 한다
- 모든 settings scope 에서 읽힌다 (user / project / local / policy / `--settings`)
- 프로젝트 `.claude/settings.json` 에 둘 경우 workspace trust 규칙이 적용된다

### 방법 B — `CLAUDE_CODE_PROJECT_DIR_NAME` (무거움)

```bash
CLAUDE_CONFIG_DIR=/path/to/cfg CLAUDE_CODE_PROJECT_DIR_NAME=work claude
```

- 세션 transcript **와** auto memory 를 지정한 이름 아래로 모은다
- **`CLAUDE_CONFIG_DIR` 를 반드시 함께 설정해야 한다** (안 하면 무시됨 — 모든 프로젝트가 섞이는 걸 막기 위해)
- 셸 환경에서만 설정 가능. settings 의 `env` 블록으로는 안 된다
- 값은 1~64자 영숫자/하이픈/언더스코어
- v2.1.234+

→ 설정 디렉터리 전체를 옮기는 셈이라 개인 프로젝트 2개에는 과하다. **방법 A 를 쓴다.**

### 제약 — MEMORY.md 로드 한도

- 세션 시작 시 **첫 200줄 또는 25KB** 까지만 로드. 초과분은 조용히 누락
- 토픽 파일(`user_*.md`, `project_*.md` 등)은 시작 시 로드되지 않고 필요할 때 읽힌다
- 한도 초과 시 쓰기는 성공하지만 다음 로드에서 잘린다
- **서브에이전트는 메인 대화의 auto memory 를 상속하지 않는다** (fork 는 예외)

## 3. 하네스 공유

### 방법 A — 플러그인 (권장)

플러그인 루트 구조 (`.claude-plugin/` 안에는 `plugin.json` **만**):

```
my-harness/
├── .claude-plugin/plugin.json     # name, description, version
├── skills/<name>/SKILL.md
├── agents/*.md
├── hooks/hooks.json
├── settings.json                  # agent, subagentStatusLine 키만 지원
└── .mcp.json
```

- 스킬 이름은 `plugin-name:skill-name` 으로 네임스페이스가 붙어 **로컬 스킬과 충돌하지 않는다**
- 개발/테스트: `claude --plugin-dir ./my-harness` (여러 번 반복 가능), 변경 반영은 `/reload-plugins`
- 배포: 로컬 경로 또는 git repo 마켓플레이스. 사설 저장소 가능
- 간편 경로: `claude plugin init my-tool` → `~/.claude/skills/my-tool/` 에 생성되고
  마켓플레이스 없이 `my-tool@skills-dir` 로 자동 로드
- 주의: 프로젝트/유저 `.claude/agents/` 의 동명 에이전트가 플러그인 에이전트를 **덮어쓴다.**
  마이그레이션 후 원본을 지워야 플러그인 쪽이 적용된다. (스킬은 네임스페이스가 달라 공존)

### 방법 B — rules 심링크 (가벼움)

```bash
ln -s ~/shared-claude-rules .claude/rules/shared
ln -s ~/company-standards/security.md .claude/rules/security.md
```

`.claude/rules/` 는 심링크를 해석해 정상 로드하고, 순환 심링크도 처리한다.

## 4. 여러 디렉터리를 한 세션에

| 추가 방법 | 파일 접근 | CLAUDE.md·rules | skills |
|---|---|---|---|
| `additionalDirectories` 설정 | ✅ | ❌ **절대 안 됨** | ❌ |
| `--add-dir` / `/add-dir` | ✅ | 환경변수 필요 | ✅ |

```bash
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../other-repo
```

환경변수는 `additionalDirectories` 설정에는 효과가 없다.

## 5. 모노레포 가이드 (축 B 참고)

- **CLAUDE.md 계층**: 루트에 저장소 전역 규칙, 패키지별 CLAUDE.md 에 스택 고유 규칙
- 로드 규칙: 작업 디렉터리와 **모든 상위** 디렉터리의 CLAUDE.md 를 시작 시 로드.
  하위 디렉터리 것은 그 디렉터리 파일을 읽을 때 on-demand 로드
- **어디서 시작하느냐가 핵심**: 작업이 한 패키지에 국한되면 **그 패키지 디렉터리에서** 시작.
  루트에서 시작하면 전체 파일 접근 + 하위 CLAUDE.md 가 누적된다
- `.claude/settings.json` 은 **상위에서 상속되지 않는다.** 각 디렉터리 것이 self-contained 여야 한다
- `claudeMdExcludes` — 글롭으로 특정 CLAUDE.md·rules 배제. scope 간 배열이 merge 된다
- `permissions.deny` 의 `Read(...)` 규칙으로 생성물·vendor 읽기 차단
- `worktree.sparsePaths` + `symlinkDirectories` — worktree 를 필요한 디렉터리만 체크아웃, `node_modules` 는 심링크
- 패키지별 `.claude/skills/` 지원. 스킬이 많아지면 description 이 잘리므로 **짧고 키워드 앞쪽 배치**

## 6. 이 프로젝트에 대한 함의

| 하고 싶은 것 | 결론 |
|---|---|
| 프로젝트 넘나드는 세션 재개 | **이미 됨.** 설정 불필요 |
| 두 프로젝트가 메모리 공유 | `autoMemoryDirectory` 동일 경로 — 단 MEMORY.md 압축 선행 |
| 스킬·에이전트 한 벌 | 플러그인 패키징. 에이전트는 원본 삭제 필요 |
| 한 세션에서 두 저장소 편집 | `--add-dir` + `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`. 상시 모드로는 부적합 |
| 세션 저장소까지 한 통 | `CLAUDE_CONFIG_DIR` 필요 — 과함 |
