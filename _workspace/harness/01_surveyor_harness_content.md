# 하네스 통합 실측 A — 내용 · 드리프트 · 결합도

측정일 **2026-09-07** · 측정자 `repo-surveyor` · **읽기 전용** (대상 저장소에 쓰기 0건)

## 0. 측정 대상과 그 근거

| 대상 | 경로 | ref / 상태 | 왜 이 경로인가 |
|---|---|---|---|
| pleiades 하네스 | `~/workspace/pleiades/.claude/` + `CLAUDE.md` | `dev` (cwd) | 통합 목적지 |
| myFinance 하네스 | `~/workspace/pleiades/repos/myFinance/.claude/` + `CLAUDE.md` | worktree · `integration/pleiades` · clean | 모드 I(통합 작업). tracked 16파일이라 worktree 에 따라옴 |
| myFitness 하네스 | **원본 `~/workspace/myFitness/.claude/`** | 원본 · `main` · gitignored | **worktree 에 존재하지 않는다** (아래 확인) |
| myFitness `CLAUDE.md` | 원본 `~/workspace/myFitness/CLAUDE.md` | 원본 · gitignored | worktree 사본(8,621 B)과 **바이트 동일** |

```bash
git -C ~/workspace/pleiades/repos/myFinance rev-parse --abbrev-ref HEAD   # → integration/pleiades
git -C ~/workspace/pleiades/repos/myFinance status --porcelain            # → (빈 출력)
git -C ~/workspace/pleiades/repos/myFitness rev-parse --abbrev-ref HEAD   # → integration/pleiades
git -C ~/workspace/pleiades/repos/myFitness status --porcelain            # → (빈 출력)
ls -la ~/workspace/pleiades/repos/myFitness/ | grep -i claude             # → CLAUDE.md 만. .claude/ 없음
git -C ~/workspace/myFitness check-ignore -v .claude CLAUDE.md
#   .gitignore:35:.claude/   .claude
#   .gitignore:36:CLAUDE.md  CLAUDE.md
git -C ~/workspace/myFitness rev-parse --abbrev-ref HEAD                  # → main
```

> **원본을 측정한 이유 (경로 규율의 예외 · 명시 요구사항).** 헤더 규율은 모드 I 에서
> worktree 를 재라고 한다. 그러나 **myFitness `.claude/` 는 worktree 에 존재하지 않는다** —
> `.gitignore:35` 로 ignored 이고 004 배치 시 *"fit `.claude/` 는 의도적 제외 (하네스 통합 대상)"*
> 로 복사하지 않았다 (`measured-facts.md` worktree 집행 표). **fit 하네스를 잴 수 있는 체크아웃은
> 원본 하나뿐이다.** ref 지정이 불가능한 파일시스템 측정이므로 원본 브랜치(`main`)를 확인해 기록했다.
> myFinance 는 규율대로 worktree 를 쟀다.

## 1. 전수 표 — 파일 · LOC · 바이트 · 결합도

**결합도 패턴 (GNU grep, 전부 `--binary-files=text`)**

```bash
occ() { grep -o --binary-files=text -E "$2" "$1" | wc -l; }   # 파일당 "출현 건수"(줄 수 아님)
P_ABS='(~|/Users/sagan)/workspace/my(Finance|Fitness)|/Users/sagan'
P_APP='src/(app|lib|components|bot|mcp|generated)/|prisma/(schema|migrations)|prisma/[a-z]'
P_PORT='\b(4100|4200|4210|4301)\b'
P_PM2='pm2|PM2'
P_REPO='myFinance|myFitness|myfinance|myfitness|fomalhaut84'
P_DOMAIN='세금|주식|매매|배당|증권|환율|자산|가계부|지출|수익률|Garmin|garmin|체중|운동|식단|칼로리|러닝|수면|바디|영양|health|Health'
# LOC/바이트
wc -l <f> ; wc -c <f>
```

**잠정 3등급 규칙 (숫자로만 판정 · fin/fit 에만 적용)**

| 등급 | 규칙 |
|---|---|
| **무파라미터 공통화** | 총 참조 **= 0** |
| **파라미터화 필요** | 총 참조 1~19 **그리고** 도메인 용어 < 3 (`{repo}`·`{port}`·`{pm2-app}` 치환으로 흡수 가능) |
| **저장소 고유** | 도메인 용어 **≥ 3** (치환 대상이 아니라 지식이다) **또는** 총 참조 **≥ 20** |

pleiades 행에는 이 등급이 의미 없다(두 저장소를 이름으로 참조하는 것이 그 파일의 일). **참고용으로만 병기.**

### myFinance (17 파일)

| 종류 | 파일 | LOC | bytes | 절대경로 | 앱경로 | 포트 | pm2 | 저장소명 | 도메인 | 합계 | /100줄 | 잠정 등급 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| agents | `.claude/agents/feature-implementer.md` | 81 | 4,409 | 0 | 1 | 0 | 0 | 2 | 4 | **7** | 8.6 | 저장소 고유 |
| agents | `.claude/agents/quality-guardian.md` | 87 | 4,268 | 0 | 0 | 0 | 0 | 2 | 0 | **2** | 2.3 | 파라미터화 필요 |
| agents | `.claude/agents/release-manager.md` | 103 | 5,086 | 0 | 0 | 1 | 0 | 2 | 0 | **3** | 2.9 | 파라미터화 필요 |
| agents | `.claude/agents/spec-planner.md` | 51 | 3,363 | 0 | 0 | 0 | 0 | 3 | 1 | **4** | 7.8 | 파라미터화 필요 |
| rules | `.claude/rules/api-routes.md` | 119 | 4,304 | 0 | 2 | 0 | 0 | 0 | 0 | **2** | 1.7 | 파라미터화 필요 |
| rules | `.claude/rules/components.md` | 11 | 571 | 0 | 1 | 0 | 0 | 0 | 2 | **3** | 27.3 | 파라미터화 필요 |
| rules | `.claude/rules/stock-trading-method.md` | 125 | 5,001 | 0 | 0 | 0 | 0 | 0 | 5 | **5** | 4.0 | 저장소 고유 |
| rules | `.claude/rules/tax-logic.md` | 28 | 1,077 | 0 | 1 | 0 | 0 | 0 | 6 | **7** | 25.0 | 저장소 고유 |
| rules | `.claude/rules/workflow.md` | 241 | 9,391 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | 0.0 | 무파라미터 공통화 |
| skills | `.claude/skills/codex-response-patterns/SKILL.md` | 87 | 4,638 | 0 | 2 | 0 | 0 | 3 | 1 | **6** | 6.9 | 파라미터화 필요 |
| skills | `.claude/skills/milestone-workflow/SKILL.md` | 123 | 6,226 | 0 | 0 | 0 | 0 | 3 | 0 | **3** | 2.4 | 파라미터화 필요 |
| skills | `.claude/skills/project-spec-writer/SKILL.md` | 110 | 3,136 | 0 | 0 | 0 | 0 | 3 | 0 | **3** | 2.7 | 파라미터화 필요 |
| skills | `.claude/skills/project-verify/SKILL.md` | 98 | 3,579 | 0 | 3 | 0 | 0 | 2 | 0 | **5** | 5.1 | 파라미터화 필요 |
| skills | `.claude/skills/release-publisher/SKILL.md` | 134 | 4,652 | 0 | 0 | 1 | 1 | 4 | 0 | **6** | 4.5 | 파라미터화 필요 |
| skills | `.claude/skills/session-boundary/SKILL.md` | 133 | 5,229 | 0 | 0 | 0 | 0 | 2 | 0 | **2** | 1.5 | 파라미터화 필요 |
| skills | `.claude/skills/session-resume/SKILL.md` | 98 | 3,892 | 0 | 0 | 0 | 0 | 4 | 0 | **4** | 4.1 | 파라미터화 필요 |
| claude-md | `CLAUDE.md` | 163 | 9,549 | 0 | 7 | 1 | 6 | 9 | 21 | **44** | 27.0 | 저장소 고유 |
| **합계** | **17 파일** | **1792** | **78,371** | 0 | 17 | 3 | 7 | 39 | 40 | **106** | — | — |

등급 분포: 파라미터화 필요 12 · 저장소 고유 4 · 무파라미터 공통화 1

### myFitness (19 파일)

| 종류 | 파일 | LOC | bytes | 절대경로 | 앱경로 | 포트 | pm2 | 저장소명 | 도메인 | 합계 | /100줄 | 잠정 등급 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| agents | `.claude/agents/codex-liaison.md` | 45 | 2,176 | 0 | 0 | 0 | 0 | 1 | 0 | **1** | 2.2 | 파라미터화 필요 |
| agents | `.claude/agents/db-migrator.md` | 45 | 2,122 | 0 | 1 | 0 | 0 | 2 | 0 | **3** | 6.7 | 파라미터화 필요 |
| agents | `.claude/agents/ops-analyst.md` | 45 | 2,097 | 0 | 0 | 0 | 4 | 5 | 0 | **9** | 20.0 | 파라미터화 필요 |
| agents | `.claude/agents/release-manager.md` | 46 | 1,855 | 0 | 0 | 0 | 0 | 1 | 0 | **1** | 2.2 | 파라미터화 필요 |
| agents | `.claude/agents/workflow-conductor.md` | 50 | 2,159 | 0 | 0 | 0 | 1 | 1 | 0 | **2** | 4.0 | 파라미터화 필요 |
| rules | `.claude/rules/api-routes.md` | 8 | 334 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | 0.0 | 무파라미터 공통화 |
| rules | `.claude/rules/components.md` | 9 | 393 | 0 | 0 | 0 | 0 | 0 | 2 | **2** | 22.2 | 파라미터화 필요 |
| rules | `.claude/rules/workflow.md` | 264 | 10,453 | 0 | 0 | 0 | 0 | 0 | 1 | **1** | 0.4 | 파라미터화 필요 |
| settings.local.json | `.claude/settings.local.json` | 111 | 6,749 | 1 | 11 | 1 | 0 | 6 | 1 | **20** | 18.0 | 저장소 고유 |
| skills | `.claude/skills/branch-workflow/SKILL.md` | 175 | 3,945 | 1 | 2 | 0 | 0 | 2 | 0 | **5** | 2.9 | 파라미터화 필요 |
| skills | `.claude/skills/codex-review-loop/SKILL.md` | 113 | 3,780 | 0 | 0 | 0 | 0 | 4 | 0 | **4** | 3.5 | 파라미터화 필요 |
| skills | `.claude/skills/myfitness-orchestrator/SKILL.md` | 119 | 4,572 | 0 | 0 | 0 | 2 | 6 | 0 | **8** | 6.7 | 파라미터화 필요 |
| skills | `.claude/skills/ops-diagnose/SKILL.md` | 155 | 5,393 | 0 | 0 | 3 | 11 | 13 | 10 | **37** | 23.9 | 저장소 고유 |
| skills | `.claude/skills/orphan-check/SKILL.md` | 113 | 3,383 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | 0.0 | 무파라미터 공통화 |
| skills | `.claude/skills/prisma-drift-fix/SKILL.md` | 139 | 4,181 | 0 | 7 | 0 | 0 | 4 | 0 | **11** | 7.9 | 파라미터화 필요 |
| skills | `.claude/skills/release-flow/SKILL.md` | 223 | 5,865 | 0 | 0 | 0 | 3 | 1 | 0 | **4** | 1.8 | 파라미터화 필요 |
| skills | `.claude/skills/session-handoff/SKILL.md` | 122 | 4,435 | 0 | 0 | 0 | 0 | 2 | 1 | **3** | 2.5 | 파라미터화 필요 |
| skills | `.claude/skills/session-primer/SKILL.md` | 103 | 4,029 | 1 | 0 | 0 | 0 | 6 | 2 | **9** | 8.7 | 파라미터화 필요 |
| claude-md | `CLAUDE.md` | 173 | 8,621 | 0 | 6 | 1 | 3 | 3 | 19 | **32** | 18.5 | 저장소 고유 |
| **합계** | **19 파일** | **2058** | **76,542** | 3 | 27 | 5 | 24 | 57 | 36 | **152** | — | — |

등급 분포: 파라미터화 필요 14 · 저장소 고유 3 · 무파라미터 공통화 2

### pleiades (13 파일)

| 종류 | 파일 | LOC | bytes | 절대경로 | 앱경로 | 포트 | pm2 | 저장소명 | 도메인 | 합계 | /100줄 | 잠정 등급 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| agents | `.claude/agents/decision-writer.md` | 110 | 6,181 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | 0.0 | 무파라미터 공통화 |
| agents | `.claude/agents/dual-repo-operator.md` | 136 | 7,959 | 3 | 0 | 2 | 3 | 12 | 0 | **20** | 14.7 | 저장소 고유 |
| agents | `.claude/agents/repo-surveyor.md` | 128 | 8,946 | 2 | 1 | 4 | 2 | 13 | 0 | **22** | 17.2 | 저장소 고유 |
| agents | `.claude/agents/reversibility-auditor.md` | 146 | 9,296 | 2 | 0 | 0 | 1 | 7 | 0 | **10** | 6.8 | 파라미터화 필요 |
| rules | `.claude/rules/workflow.md` | 486 | 29,635 | 0 | 0 | 0 | 1 | 22 | 0 | **23** | 4.7 | 저장소 고유 |
| skills | `.claude/skills/decision-doc/SKILL.md` | 134 | 6,090 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | 0.0 | 무파라미터 공통화 |
| skills | `.claude/skills/dual-repo-change/SKILL.md` | 191 | 11,018 | 3 | 0 | 4 | 3 | 18 | 0 | **28** | 14.7 | 저장소 고유 |
| skills | `.claude/skills/pleiades-handoff/SKILL.md` | 98 | 4,245 | 0 | 0 | 0 | 0 | 4 | 0 | **4** | 4.1 | 파라미터화 필요 |
| skills | `.claude/skills/pleiades-orchestrator/SKILL.md` | 169 | 8,941 | 2 | 0 | 0 | 0 | 10 | 0 | **12** | 7.1 | 파라미터화 필요 |
| skills | `.claude/skills/pleiades-resume/SKILL.md` | 97 | 4,455 | 0 | 0 | 0 | 1 | 10 | 0 | **11** | 11.3 | 파라미터화 필요 |
| skills | `.claude/skills/repo-measure/SKILL.md` | 157 | 8,000 | 2 | 0 | 0 | 0 | 12 | 0 | **14** | 8.9 | 파라미터화 필요 |
| skills | `.claude/skills/reversibility-audit/SKILL.md` | 166 | 8,555 | 2 | 0 | 0 | 1 | 7 | 0 | **10** | 6.0 | 파라미터화 필요 |
| claude-md | `CLAUDE.md` | 147 | 12,587 | 4 | 0 | 4 | 3 | 10 | 0 | **21** | 14.3 | 저장소 고유 |
| **합계** | **13 파일** | **2165** | **125,908** | 20 | 1 | 14 | 15 | 125 | 0 | **175** | — | — |

등급 분포: 파라미터화 필요 6 · 저장소 고유 5 · 무파라미터 공통화 2

### 1-4. 검산 (#11 집계 오류 재발 방지)

전수 표를 **세로(종류별 합)와 가로(저장소 합)로 두 번** 더해 일치를 확인했다.

| 저장소 | agents | rules | skills | settings | CLAUDE.md | **종류별 합** | **표의 저장소 합** | 일치 |
|---|---|---|---|---|---|---|---|---|
| myFinance 파일 | 4 | 5 | 7 | **0** | 1 | **17** | 17 | ✅ |
| myFinance LOC | 322 | 524 | 783 | 0 | 163 | **1,792** | 1,792 | ✅ |
| myFinance bytes | 17,126 | 20,344 | 31,352 | 0 | 9,549 | **78,371** | 78,371 | ✅ |
| myFitness 파일 | 5 | 3 | 9 | **1** | 1 | **19** | 19 | ✅ |
| myFitness LOC | 231 | 281 | 1,262 | 111 | 173 | **2,058** | 2,058 | ✅ |
| myFitness bytes | 10,409 | 11,180 | 39,583 | 6,749 | 8,621 | **76,542** | 76,542 | ✅ |
| pleiades 파일 | 4 | 1 | 7 | 0 | 1 | **13** | 13 | ✅ |
| pleiades LOC | 520 | 486 | 1,012 | 0 | 147 | **2,165** | 2,165 | ✅ |
| pleiades bytes | 32,382 | 29,635 | 51,304 | 0 | 12,587 | **125,908** | 125,908 | ✅ |

**과제가 준 "34 + 12" 와의 대조**

| 항목 | 과제 기술 | 실측 | 판정 |
|---|---|---|---|
| fin `.claude/` tracked 파일 | 16 | **16** (`git ls-files .claude \| wc -l` → 16) | ✅ |
| fit `.claude/` 파일 | 18 | **18** (agents 5 + rules 3 + skills 9 + settings 1) | ✅ |
| pleiades `.claude/` 파일 | 12 (agents 4 · rules 1 · skills 7) | **12** | ✅ |
| 합계 | 34 + 12 = 46 | **46** (+ `CLAUDE.md` 3개 = 49) | ✅ |

**`.claude/` 만의 소계 (CLAUDE.md 제외)**

| | 파일 | LOC | bytes |
|---|---:|---:|---:|
| myFinance | 16 | 1,629 | 68,822 |
| myFitness | 18 | 1,885 | 67,921 |
| **fin + fit (이관 대상)** | **34** | **3,514** | **136,743** |
| pleiades (기존) | 12 | 2,018 | 113,321 |
| **통합 후 상한(중복 제거 전)** | **46** | **5,532** | **250,064** |

> `du -sk ~/workspace/myFitness/.claude` → **104 KB**. 실제 내용 합은 **67,921 B (66.3 KB)**.
> 차이는 `du` 의 블록 단위 계상(파일 18 + 디렉터리 13) 때문이다. `measured-facts.md` M1 의
> *"fit `.claude/` 18 files / 104 K"* 는 **파일 수는 맞고 크기는 `du` 값**이다. 모순 아님.

---

## 2. 쌍둥이 드리프트

```bash
diff <fin> <fit> | grep -c '^<'    # fin 전용 줄
diff <fin> <fit> | grep -c '^>'    # fit 전용 줄
# 공통 줄 = fin 총 줄수 − fin 전용 줄수
```

| 역할 | fin 파일 | fit 파일 | fin줄 | fit줄 | fin 전용 `<` | fit 전용 `>` | **공통줄** | 공통 비율(공통/fin) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| rules `api-routes` | `api-routes.md` | `api-routes.md` | 119 | 8 | 115 | 4 | **4** | 3.4% |
| rules `components` | `components.md` | `components.md` | 11 | 9 | 5 | 3 | **6** | 54.5% |
| rules `workflow` | `workflow.md` | `workflow.md` | 241 | 264 | 47 | 69 | **194** | 80.5% |
| skill 세션재개 | `session-resume` | `session-primer` | 98 | 103 | 65 | 70 | **33** | 33.7% |
| skill 인계 | `session-boundary` | `session-handoff` | 133 | 122 | 95 | 84 | **38** | 28.6% |
| skill 오케스트레이터 | `milestone-workflow` | `myfitness-orchestrator` | 123 | 119 | 105 | 101 | **18** | 14.6% |
| skill 릴리즈 | `release-publisher` | `release-flow` | 134 | 223 | 89 | 178 | **45** | 33.6% |
| skill Codex | `codex-response-patterns` | `codex-review-loop` | 87 | 113 | 57 | 83 | **30** | 34.5% |
| skill 브랜치 | `milestone-workflow` | `branch-workflow` | 123 | 175 | 100 | 152 | **23** | 18.7% |
| agent `release-manager` | `release-manager.md` | `release-manager.md` | 103 | 46 | 84 | 27 | **19** | 18.4% |
| (참고) `CLAUDE.md` | `CLAUDE.md` | `CLAUDE.md` | 163 | 173 | 90 | 100 | **73** | 44.8% |

**해석 없이 읽히는 것 하나**: `rules/workflow.md` 만 공통 80.5% 이고 **나머지 9쌍은 전부 55% 미만**,
그중 6쌍은 **35% 미만**이다. "역할 쌍둥이"는 이름 대응일 뿐 텍스트 대응이 아니다.
빈 줄이 공통줄에 섞여 있으므로 위 공통줄은 **상한**이다.

### 2-2. `workflow.md` 3자 비교 (fin · fit · pleiades)

exact-line 집합 비교. 빈 줄 제외 + 앞뒤 공백 정규화 + 중복 제거.

```bash
norm() { sed 's/^[[:space:]]*//;s/[[:space:]]*$//' "$1" | grep -v '^$' | sort -u; }
norm <fin>/.claude/rules/workflow.md > fin.w
norm <fit>/.claude/rules/workflow.md > fit.w
norm ~/workspace/pleiades/.claude/rules/workflow.md > ple.w
comm -12 fin.w fit.w | wc -l          # fin ∩ fit
comm -12 fin.w ple.w | wc -l          # fin ∩ pleiades
comm -12 fit.w ple.w | wc -l          # fit ∩ pleiades
cat fin.w fit.w | sort -u > orig.w
comm -13 orig.w ple.w | wc -l         # pleiades 신규
comm -23 orig.w ple.w | wc -l         # pleiades 가 버린 원본 줄
```

| 집합 | 줄 수 |
|---|---:|
| fin 유니크 비공백 줄 | 161 |
| fit 유니크 비공백 줄 | 172 |
| pleiades 유니크 비공백 줄 | **344** |
| fin ∩ fit | **118** (fin 의 73.3% · fit 의 68.6%) |
| fin ∪ fit | 215 |
| fin ∩ pleiades | **33** |
| fit ∩ pleiades | **33** |
| (fin ∪ fit) ∩ pleiades | **34** |
| **pleiades 신규 (양쪽 원본에 없는 줄)** | **310 / 344 = 90.1%** |
| pleiades 가 버린 원본 줄 | **181 / 215 = 84.2%** (fin 전용 42 · fit 전용 53 · 공통 86) |

**절 구조는 살아남았다** (`grep -nE '^#{1,4} '`):

| | fin | fit | pleiades |
|---|---|---|---|
| 최상위 절 | 브랜치 전략 · 릴리즈 전략 · 단계별 규칙 · 긴급 수정 | 동일 | 동일 + **`pleiades 고유 규율 요약`** |
| 단계 수 | 10 | 10 | **10 (번호 재배치)** |
| 신설 단계 | — | — | **`2. 실측`**, **`4. 되돌리기 비용 산정`** |
| 삭제 단계 | — | — | **`4. UI/UX 디자인`** (fin `:61`, fit `:62`) |
| 리뷰 절 | `8. 코드 리뷰` (8-1~8-4) | `8. 코드 리뷰` (8-0~8-6) | **`9. 코드 리뷰 + PR`** (9-0~9-7) |
| PR 생성 위치 | `9. PR 생성` (리뷰 **뒤**) | `9. PR 생성` (리뷰 **뒤**) | **`9-2` (리뷰 절 안)** |
| 8-0/8-5/8-6 (fit 진화분) | **없음** | 있음 | **계승됨 (9-0/9-5/9-6)** |

→ **텍스트는 90% 새로 쓰였지만 골격은 fin·fit 의 것이다.** `measured-facts.md`/`workflow.md` 머리말의
*"더 진화한 쪽(fit 의 8-0·8-5·8-6)을 정본으로 삼고 fin 의 명시적 기준을 합쳤다"* 는 절 구조 수준에서 확인된다.
**exact-line 계승률은 15.8%(34/215)** 다.

---

## 3. 저장소 결합도 — 3등급 잠정 분류

대상은 fin 17 + fit 19 = **36 파일 / 3,850 LOC** (`.claude/` 34 + `CLAUDE.md` 2).

| 등급 | 파일 | 비율 | LOC | LOC 비율 |
|---|---:|---:|---:|---:|
| **무파라미터 공통화** (참조 0건) | **3** | 8.3% | 362 | 9.4% |
| **파라미터화 필요** (1~19건 · 도메인<3) | **26** | 72.2% | 2,652 | 68.9% |
| **저장소 고유** (도메인≥3 또는 ≥20건) | **7** | 19.4% | 836 | 21.7% |
| 합계 | 36 | 100% | 3,850 | 100% |

**무파라미터 공통화 — 3 / 36 파일 · 362 LOC**

| 저장소 | 파일 | 총 참조 | 도메인 |
|---|---|---:|---:|
| myFinance | `.claude/rules/workflow.md` | 0 | 0 |
| myFitness | `.claude/rules/api-routes.md` | 0 | 0 |
| myFitness | `.claude/skills/orphan-check/SKILL.md` | 0 | 0 |

**파라미터화 필요 — 26 / 36 파일 · 2,652 LOC**

| 저장소 | 파일 | 총 참조 | 도메인 |
|---|---|---:|---:|
| myFinance | `.claude/agents/quality-guardian.md` | 2 | 0 |
| myFinance | `.claude/agents/release-manager.md` | 3 | 0 |
| myFinance | `.claude/agents/spec-planner.md` | 4 | 1 |
| myFinance | `.claude/rules/api-routes.md` | 2 | 0 |
| myFinance | `.claude/rules/components.md` | 3 | 2 |
| myFinance | `.claude/skills/codex-response-patterns/SKILL.md` | 6 | 1 |
| myFinance | `.claude/skills/milestone-workflow/SKILL.md` | 3 | 0 |
| myFinance | `.claude/skills/project-spec-writer/SKILL.md` | 3 | 0 |
| myFinance | `.claude/skills/project-verify/SKILL.md` | 5 | 0 |
| myFinance | `.claude/skills/release-publisher/SKILL.md` | 6 | 0 |
| myFinance | `.claude/skills/session-boundary/SKILL.md` | 2 | 0 |
| myFinance | `.claude/skills/session-resume/SKILL.md` | 4 | 0 |
| myFitness | `.claude/agents/codex-liaison.md` | 1 | 0 |
| myFitness | `.claude/agents/db-migrator.md` | 3 | 0 |
| myFitness | `.claude/agents/ops-analyst.md` | 9 | 0 |
| myFitness | `.claude/agents/release-manager.md` | 1 | 0 |
| myFitness | `.claude/agents/workflow-conductor.md` | 2 | 0 |
| myFitness | `.claude/rules/components.md` | 2 | 2 |
| myFitness | `.claude/rules/workflow.md` | 1 | 1 |
| myFitness | `.claude/skills/branch-workflow/SKILL.md` | 5 | 0 |
| myFitness | `.claude/skills/codex-review-loop/SKILL.md` | 4 | 0 |
| myFitness | `.claude/skills/myfitness-orchestrator/SKILL.md` | 8 | 0 |
| myFitness | `.claude/skills/prisma-drift-fix/SKILL.md` | 11 | 0 |
| myFitness | `.claude/skills/release-flow/SKILL.md` | 4 | 0 |
| myFitness | `.claude/skills/session-handoff/SKILL.md` | 3 | 1 |
| myFitness | `.claude/skills/session-primer/SKILL.md` | 9 | 2 |

**저장소 고유 — 7 / 36 파일 · 836 LOC**

| 저장소 | 파일 | 총 참조 | 도메인 | 판정 근거 |
|---|---|---:|---:|---|
| myFinance | `.claude/agents/feature-implementer.md` | 7 | 4 | 도메인 4 (세금×2·매매·수익률) |
| myFinance | `.claude/rules/stock-trading-method.md` | 5 | 5 | 도메인 5 |
| myFinance | `.claude/rules/tax-logic.md` | 7 | 6 | 도메인 6 · 밀도 25.0/100줄 |
| myFinance | `CLAUDE.md` | 44 | 21 | 총 44 · 도메인 21 |
| myFitness | `.claude/settings.local.json` | 20 | 1 | 총 20 (앱경로 11 · 저장소명 6) |
| myFitness | `.claude/skills/ops-diagnose/SKILL.md` | 37 | 10 | 총 37 · pm2 11 · 포트 3 |
| myFitness | `CLAUDE.md` | 32 | 19 | 총 32 · 도메인 19 |

**결합의 성분 (fin+fit 합계 258건)**

| 성분 | fin | fit | 합 | 파라미터화 가능성 |
|---|---:|---:|---:|---|
| 절대경로 | 0 | 3 | 3 | 가능 (`{repo-root}`) |
| 앱경로 (`src/…`·`prisma/…`) | 17 | 27 | 44 | 가능하나 **양쪽 레이아웃 동일**이라 치환 불필요 |
| 포트 | 3 | 5 | 8 | 가능 (`{web-port}`·`{mcp-port}`) |
| pm2 | 7 | 24 | 31 | 가능 (`{pm2-app}` 3개 명명 규칙 동일: `X`/`X-bot`/`X-mcp`) |
| 저장소명 리터럴 | 39 | 57 | 96 | 가능 (`{repo}`) |
| **도메인 용어** | **40** | **36** | **76** | **불가 — 지식이지 파라미터가 아님** |
| 합계 | 106 | 152 | **258** | |

→ 258건 중 **76건(29.5%)만 파라미터로 흡수 불가**이고, 그 76건은 **4개 파일(fin `tax-logic`·
`stock-trading-method`·`feature-implementer`, + 양쪽 `CLAUDE.md`)에 61건(80.3%)이 집중**돼 있다.

**pleiades 자신의 결합도(참고)**: 총 175건 · 저장소명 리터럴 **125건**. 도메인 용어 **0건**.
→ pleiades 하네스는 "두 저장소를 이름으로 다루는" 결합만 있고 **도메인 지식은 0** 이다.

---

## 4. pleiades 와의 중복

| 역할 | pleiades | myFinance | myFitness | pleiades 것으로 대체 가능? |
|---|---|---|---|---|
| 세션 재개 | `pleiades-resume` (97줄) | `session-resume` (98줄) | `session-primer` (103줄) | **불가** (아래) |
| 세션 인계 | `pleiades-handoff` (98줄) | `session-boundary` (133줄) | `session-handoff` (122줄) | **불가** (아래) |
| 오케스트레이터 | `pleiades-orchestrator` (169줄) | `milestone-workflow` (123줄) | `myfitness-orchestrator` (119줄) | **불가 — 라우팅 대상 에이전트가 다르다** |
| 워크플로우 룰 | `.claude/rules/workflow.md` (486줄) | `workflow.md` (241줄) | `workflow.md` (264줄) | **가능 (조건부)** — 절 구조 계승 확인. 단 exact-line 15.8%, 삭제 단계 1개(UI/UX) |
| 스펙 작성 | `decision-doc` (134줄) | `project-spec-writer` (110줄) | — | **불가 — 산출물 종류가 다르다** |
| 검증 | (`workflow.md` 8절 표) | `project-verify` (98줄) | — | **부분** — 8절 표가 fin/fit 검증 명령을 이미 담고 있음. Prisma·MCP 특수 검증은 미포함 |
| Codex 대응 | (`workflow.md` 9-3~9-6) | `codex-response-patterns` (87줄) | `codex-review-loop` (113줄) | **부분** — 절차는 흡수됨, **응답 패턴 템플릿은 미포함** |
| 릴리즈 | (`workflow.md` 릴리즈 전략 절) | `release-publisher` (134줄) + `release-manager` (103줄) | `release-flow` (223줄) + `release-manager` (46줄) | **부분** — pleiades 절은 `dev→main→tag` 골격만. 배포 확인·롤백 절차 미포함 |
| 브랜치 | (`workflow.md` 브랜치 전략 절) | (`milestone-workflow` 내부) | `branch-workflow` (175줄) | **부분** |
| 실측 | `repo-measure` (157줄) | — | — | 대응 없음 (pleiades 고유) |
| 가역성 감사 | `reversibility-audit` (166줄) | — | — | 대응 없음 |
| 양쪽 저장소 변경 | `dual-repo-change` (191줄) | — | — | 대응 없음 |
| 운영 진단 | — | — | `ops-diagnose` (155줄) | 대응 없음 (fit 고유) |
| Prisma 드리프트 | — | — | `prisma-drift-fix` (139줄) | 대응 없음 |
| orphan 커밋 | — | — | `orphan-check` (113줄) | 대응 없음 |

### 4-2. "대체 불가" 판정의 내용 근거 (기능 대조)

**세션 재개** — `pleiades-resume` 가 **하지 않는** 것:

| fin `session-resume` / fit `session-primer` 가 하는 일 | pleiades-resume | 근거 |
|---|---|---|
| `project_session_active.md` 로드 → 상태 분류 5행 표 → **소비 후 삭제** | **없음** | fin Step 1·2·5 |
| `gh pr list` / `gh issue list --author @me` | **없음** | fin Step 1, fit Step 2 |
| 미커밋 하네스 파일(`git status .claude/`) 안내 | **없음** | fin Step 3 |
| 태그·릴리즈 상태 (`git tag -l 'v*'`, `main..dev`) | **없음** | fit Step 1 |
| 백로그 문서 (`docs/specs/M*-followup.md`) 우선순위 A~D | **없음** | fit Step 3 |
| 대상 저장소 **4개 체크아웃** 브랜치·dirty 확인 | **pleiades 만** | pleiades Step 2 |
| 확정 답(Q1·Q4·Q5·Q6) 표 · 되돌리기 비용 원칙 | **pleiades 만** | pleiades "확정된 것" |

→ **교집합이 "인계 노트 읽고 3문단 브리핑" 한 가지뿐**이다. 겹치는 것은 이름과 트리거 문구다.

**세션 인계** — 절 대조 (`grep -E '^#{2,4} '`)

| pleiades-handoff (5절) | fin session-boundary (6 Step) | fit session-handoff (6 Step) |
|---|---|---|
| 1 세션 중 변경분 확인 | Step 1 상태 스냅샷 | Step 1 진행 결과 요약 |
| 2 인계 노트 작성 | Step 3 인계 노트 작성 | — |
| 3 주의사항 | — | — |
| 4 동기화 | Step 4 **MEMORY.md 인덱스 갱신** | Step 3 Memory 갱신 |
| 5 커밋 | — | — |
| — | Step 2 **인계 대상 판정** | Step 2 **백로그 문서 갱신**(완료 이동·신규 추가·현재 상태) |
| — | Step 5 **미커밋 하네스 경고** | Step 4 **열린 PR 상태 문서화** |
| — | Step 6 최종 요약 | Step 5 **브랜치·로컬 상태 확인** / Step 6 인계 요약 |

→ pleiades 5절 중 대응이 있는 것은 **3절(1·2·4)**. fin 6 Step 중 3개, fit 6 Step 중 4개가 **대응 없음.**

**스펙 작성** — `decision-doc` 은 *무엇이 바뀌었나 / 확정된 답 / 실측 근거 / 경로(옵션 사다리) /
판단이 바뀐 것 / 미결 질문 / 유효기간* 7절짜리 **결정 문서**를,
fin `project-spec-writer` 는 *배경 / 목표 / Sub-Phase 분할 / 착수 순서 / 제외 / 산출물* +
**서브이슈 본문 템플릿** + `gh issue` 발행을 낸다. **공통 절은 "제외 사항" 1개.**

### 4-3. 중복 없이 남는 것 (통합 시 순증)

| 구분 | 파일 수 | LOC |
|---|---:|---:|
| pleiades 에 **대응 역할이 아예 없는** fin/fit 파일 | **19** | **1,371** |
| pleiades 와 **역할이 겹치는** fin/fit 파일 | **15** | **2,143** |
| 합 (`.claude/` 만) | **34** | **3,514** |

**대응 역할 없음 19파일** (검산: 1,371 + 2,143 = 3,514 ✅)

fin(8): `agents/feature-implementer`(81) · `agents/quality-guardian`(87) · `agents/release-manager`(103) ·
`agents/spec-planner`(51) · `rules/api-routes`(119) · `rules/components`(11) · `rules/stock-trading-method`(125) ·
`rules/tax-logic`(28) — 소계 605

fit(11): `agents/codex-liaison`(45) · `agents/db-migrator`(45) · `agents/ops-analyst`(45) ·
`agents/release-manager`(46) · `agents/workflow-conductor`(50) · `rules/api-routes`(8) · `rules/components`(9) ·
`settings.local.json`(111) · `skills/ops-diagnose`(155) · `skills/orphan-check`(113) ·
`skills/prisma-drift-fix`(139) — 소계 766  (605 + 766 = 1,371 ✅)

**역할 겹침 15파일**: fin 8 (`session-resume` 98 · `session-boundary` 133 · `milestone-workflow` 123 ·
`project-spec-writer` 110 · `project-verify` 98 · `release-publisher` 134 · `codex-response-patterns` 87 ·
`rules/workflow` 241 = 1,024) + fit 7 (`session-primer` 103 · `session-handoff` 122 ·
`myfitness-orchestrator` 119 · `release-flow` 223 · `codex-review-loop` 113 · `branch-workflow` 175 ·
`rules/workflow` 264 = 1,119)  (1,024 + 1,119 = 2,143 ✅)

→ 역할이 겹치는 15파일조차 **exact-line 계승률은 workflow.md 기준 15.8%**. "중복이니 버린다"는
**34파일 중 최대 15파일에만 검토 대상**이고, 그중 실제로 대체 가능한 것은 **`rules/workflow.md` 2개뿐**이다.

---

## 5. `settings.local.json` 2열 비교

```bash
python3 -c "
import json,re,collections
d=json.load(open(F)); a=d['permissions']['allow']
print(len(a)); print(collections.Counter(r.split('(')[0] for r in a))
n=lambda p: sum(1 for r in a if re.search(p,r))
print(n(r'/Users/sagan'), n(r'myFinance|myFitness|myfinance|myfitness|fomalhaut84'),
      n(r'\bsrc/|\bprisma/'), n(r'\b(4100|4200|4210|4301|4302)\b'))"
```

| | myFinance | myFitness |
|---|---|---|
| 위치 | **원본만** `~/workspace/myFinance/.claude/settings.local.json` (gitignored — worktree 의 tracked 16파일에 **없다**) | `~/workspace/myFitness/.claude/settings.local.json` (fit `.claude/` 18파일 **안에 포함**) |
| 크기 | **17,469 B / 156줄** | **6,749 B / 111줄** |
| 최상위 키 | `permissions` 만 | `permissions` 만 |
| `permissions.allow` 규칙 수 | **150** | **105** |
| 도구별 | Bash 135 · WebFetch 9 · codex-cli MCP 4 · WebSearch 1 · Read 1 | Bash 96 · WebFetch 4 · codex-cli MCP 3 · WebSearch 1 · Read 1 |
| 절대경로(`/Users/sagan`) 포함 규칙 | **6** (4.0%) | **1** (1.0%) |
| 저장소명 리터럴 포함 규칙 | 9 (6.0%) | 4 (3.8%) |
| 앱경로(`src/`·`prisma/`) 포함 규칙 | 4 (2.7%) | **10** (9.5%) |
| 포트 포함 규칙 | 1 | 3 (`4301`·`4302`) |
| **저장소에 묶인 규칙 (위 4종 합집합)** | **14 / 150 = 9.3%** | **15 / 105 = 14.3%** |
| **저장소 무관 = 그대로 이식 가능** | **136 / 150 = 90.7%** | **90 / 105 = 85.7%** |

fit 의 절대경로 규칙 1건:
`Bash(ls /Users/sagan/workspace/myFitness/src/generated/prisma/index*)`

> **`measured-facts.md` M3 대조.** *"`.claude/settings.local.json:22,43,44,102,103,112` — 허용 규칙
> 6/150 (4.0%)"* 및 *"(myFitness) 소스·설정 전체 0건"* 를 확인·정정한다.
> **fin 6/150 은 재현됨.** **fit 은 0건이 아니라 1건**이다 (아래 §7).

---

## 6. 이 측정이 하지 않은 것

| 항목 | 사유 |
|---|---|
| fin `settings.local.json` 을 34파일 집계에 포함 | gitignored — worktree tracked 16파일에 없다. §5 에서 **별도**로 잰다. 34 = fin 16(tracked) + fit 18 |
| 하네스 파일이 **실제로 로드되는지**(스킬 발동) | 정적 측정 범위 밖. 004 §3-2 가 *"중첩 `.claude/` 는 로드되지 않는다"* 로 이미 실측 |
| auto memory(`~/.claude/projects/*/memory/`) 재측정 | `measured-facts.md` "auto memory 현황" 절에 있음 (fin 126줄·37토픽 / fit 16줄·16토픽). **재측정 안 함** |
| 하네스 파일 간 **상호 참조**(`[[wikilink]]`) 그래프 | 이번 과제 범위 밖 (측정 B 후보) |
| fin `.claude/` 를 원본에서 잰 값과의 대조 | worktree 는 tracked 파일이 ref 그대로다. 별도 측정 불필요 |

---

## 7. 가정을 뒤집는 숫자

**① 이 환경의 `grep` 은 ugrep 래퍼이고 `.gitignore` 를 따른다 — `--binary-files=text` 로는 못 막는다. (최우선)**

`measured-facts.md` M3 은 *"(myFitness) 소스·설정 전체 **0건**"* 이라 적었다. 이번에 fit 하네스에서
절대경로 **3건**이 나와 원인을 추적했다.

```bash
type grep
# grep is a shell function ...
#   exec -a ugrep "$CLAUDE_CODE_EXECPATH" -G --ignore-files --hidden -I --exclude-dir=.git ... "$@"
grep --version   # → ugrep 7.8.4 (GNU grep 아님)
```

**`--ignore-files` 는 `.gitignore` 를 존중한다.** myFitness `.gitignore:35` 가 `.claude/` 를
**디렉터리째** 무시하므로, 저장소 루트에서 재귀 grep 하면 **하네스 18파일이 통째로 검색 대상에서 빠진다.**

| 명령 | 결과 |
|---|---|
| `grep -rn --binary-files=text -- "/workspace/myFitness" ~/workspace/myFitness` | **0** |
| `grep -rn --binary-files=text --no-ignore-files -- … (동)` | **1,617** |
| `/usr/bin/grep -rn --binary-files=text -- … (동)` | **1,617** |
| `grep -rn --binary-files=text -- "…" ~/workspace/myFitness/.claude` (경로 직접 지정) | **3** |

```bash
# 대조 실험 — 무엇이 걸러지고 무엇이 남는가
grep -rln --binary-files=text -- "PM2" ~/workspace/myFitness | grep -c claude          # → 0
/usr/bin/grep -rln --binary-files=text -- "PM2" ~/workspace/myFitness | grep -c claude # → 4
```

**비대칭 주의**: myFinance 는 `.gitignore:35` 가 `.claude/settings.local.json` 을 **파일 단위**로
무시하는데, 이 경우는 래퍼 grep 이 **여전히 찾는다**(M3 의 6건이 그래서 재현된다).
**디렉터리 패턴일 때만 통째로 사라진다.** 그래서 fin 은 맞고 fit 만 0건이 됐다.

**M3 정정값** (`/usr/bin/grep`, `node_modules`·`.next`·`dist`·`.git` 제외):

| myFitness 절대경로 매칭 파일 | 건수 |
|---|---:|
| `.claude/settings.local.json` · `.claude/skills/branch-workflow/SKILL.md` · `.claude/skills/session-primer/SKILL.md` | **3** |
| `src/generated/prisma/internal/class.ts` (생성물, `npx prisma generate` 로 재생성) | 1 |
| **손으로 쓴 앱 소스·설정** | **0 — M3 의 결론 방향은 유지** |

→ **CLAUDE.md / `workflow.md` 2절의 규율이 불충분하다.** *"`grep` 에는 반드시 `--binary-files=text`"*
는 **binary 오탐만** 막고 **gitignore 오탐은 못 막는다.** fit 하네스처럼 **ignored 디렉터리를 재는
모든 측정**이 조용히 0 을 낸다. 필요한 것은 셋 중 하나다:
**(a) `--no-ignore-files` 추가 · (b) `/usr/bin/grep` 직접 호출 · (c) 검색 경로를 그 디렉터리로 직접 지정.**
이 문서의 §1·§3 측정은 (c) 로 수행했다 — **파일 경로를 하나씩 직접 넘겼고**,
표본 3파일을 `/usr/bin/grep` 으로 재계산해 래퍼와 **건수가 일치함**을 확인했다
(`ops-diagnose` 13=13 · fit `CLAUDE.md` 3=3 · fin `CLAUDE.md` 9=9).
→ 004 **Q22**("기존 grep 기반 0건 결론을 재검증하나")에 **원인이 규명된 실례**를 제공한다.
Q22 가 의심한 원인(binary 스킵)과 **다른 원인**이므로, 재검증 범위는 *"ignored 경로를 포함하는
모든 grep 측정"* 으로 넓어진다.

**② "역할 쌍둥이" 는 텍스트 쌍둥이가 아니다 — 10쌍 중 9쌍이 공통줄 < 55%.**

`measured-facts.md` "하네스 구성" 절의 역할 대조표는 *"역할은 쌍둥이인데 이름이 다르고"* 라 적었다.
숫자는 그보다 강하다: `rules/workflow.md`(80.5%)를 빼면 **최대 공통줄 비율이 54.5%
(`rules/components.md`, 원본이 11줄·9줄짜리)**, 실질 스킬 6쌍은 **14.6~34.5%** 다.
`rules/api-routes.md` 는 **3.4%(119줄 대 8줄)** 로 사실상 다른 문서다.
→ **"쌍둥이니 하나로 합친다"는 병합이 아니라 재작성**이다. Q20 범위 산정에 그대로 들어간다.

**③ 004 Q21 의 "fin 16파일" 은 하네스 전부가 아니다 — 권한 파일 17,469 B 가 빠져 있다.**

Q21 은 fin `.claude/` **16파일(tracked)** 만 다룬다. 그러나 fin 하네스에는
**gitignored `settings.local.json` (156줄 / 17,469 B / allow 150)** 이 하나 더 있고
**worktree 에 따라오지 않았다.** fit 은 `.claude/` 전체가 ignored 라 이 파일이 18 안에 들어 있다.
→ **이관 단위가 비대칭이다.** fin 은 `git rm` 커밋(16) + **수동 복사(1)**, fit 은 수동 복사(18).
Q21 의 *"fit 18 + fin 16 을 함께 이관"* 은 fin 쪽 1파일을 셈에서 빠뜨린다. **실제는 fin 17 + fit 18 = 35.**

**④ "공통은 pleiades 로" 의 실제 몫 — 무조건 공통화는 3 / 36 파일(8.3%)뿐이다.**

사용자가 정한 분할 원칙을 숫자로 옮기면: 저장소 참조가 **0건인 파일은 3개**
(fin `rules/workflow.md`, fit `rules/api-routes.md`, fit `skills/orphan-check`)뿐이고,
**72.2%(26파일 / 2,652 LOC)가 파라미터화를 요구**한다. 즉 "공통은 그대로 옮기면 된다"는
**36파일 중 3파일에만 해당**한다. 다만 결합의 성분을 보면 **258건 중 182건(70.5%)은
`{repo}`·`{port}`·`{pm2-app}` 치환으로 흡수 가능**하고, 흡수 불가한 도메인 용어 76건은
**4개 파일에 61건(80.3%)이 몰려 있다.** → **"공통 3 + 고유 7 + 나머지 26 을 어떻게 할지"가 Q20 의 본체다.**

**⑤ pleiades `workflow.md` 는 "계승"이라기엔 새 문서다 — exact-line 계승률 15.8%.**

`.claude/rules/workflow.md` 머리말은 *"두 원본을 계승한다"* 로 시작한다. 절 구조는 그렇다(§2-2 표).
그러나 줄 단위로는 **pleiades 344줄 중 310줄(90.1%)이 양쪽 원본에 없는 새 줄**이고,
원본 215줄 중 **181줄(84.2%)이 pleiades 에 없다.** 유지된 것은 34줄이다.
→ **fin·fit 의 `workflow.md` 를 "이미 계승했으니 버려도 된다"고 볼 근거는 이 숫자에 없다.**
버려진 181줄 중 무엇이 의도적 삭제(예: UI/UX 디자인 단계)이고 무엇이 누락인지는 **미측정** —
줄 단위 대응이 필요해 이번 범위에서 판정하지 않았다. 측정 B 항목으로 남긴다.

**⑥ fit 하네스는 `du` 104 KB 가 아니라 내용 66.3 KB 다.** (§1-4) 이관 대상 실체는
fin+fit `.claude/` **34파일 / 3,514줄 / 136,743 B**. pleiades 기존 12파일(2,018줄 / 113,321 B)과
합치면 **46파일 / 5,532줄 / 250,064 B** 가 중복 제거 전 상한이다.
