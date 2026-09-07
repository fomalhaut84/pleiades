# 03 — 하네스 통합 초안 감사 (Phase 3 · 1회차)

감사 2026-09-07 · 대상 `_workspace/harness/02_writer_harness.md` (653줄)
판정: **정정 10건 → 문서는 초안 상태를 유지한다** (`.claude/rules/workflow.md` 4절)

> **읽기 전용 세션.** 대상 저장소(`repos/*`, `~/workspace/myF*`)와 pleiades `.claude/`·`docs/` 에 **쓰기 0건**.
> 이 파일이 유일한 쓰기다. `git rm` 은 실행하지 않았다(초안의 dry-run 만 재현).
> 런타임 측정 4회는 `claude -p --permission-mode plan` (읽기 전용 · haiku).

---

## 0. 요약

| 구분 | 건수 |
|---|---:|
| **정정** | **10** |
| 확인 | 12 |
| 미확인 → 이 감사에서 측정으로 해소 | 2 |

**초안의 방향은 살아남고 산술이 무너졌다.** 처분 표(34+3행)의 LOC·파일 수는 **전수 대조에서 한 건도 틀리지 않았고**,
사용자 결정("공통은 pleiades, 특수는 그 저장소")을 파일에 적용한 결론도 유지된다.
무너진 것은 **그 결론을 뒷받침한다고 인용된 비율·건수**다 — 그중 정정 ①은 초안의 핵심 논거
*"11쌍 중 2쌍은 합칠 수 있다"* 를 **1쌍**으로 줄이고, 정정 ②는 H-1 작업량 추정의 단위를 무효화한다.

**초안이 스스로 꼽은 취약 주장 3개의 판정: 확인 1 · 정정 2.**

---

## 1. 지정 반증 대상 3건

### 주장 1 — §4-8 "이 PR 에는 `src/` 파급이 없다"

**판정: 확인** (단 §5 #3 의 출처 인용에 별건 정정 → 정정 ⑨)

```bash
git -C ~/workspace/pleiades/repos/myFinance grep --text -n "\.claude" integration/pleiades -- 'src/**' | cut -d: -f2-
#   src/app/api/alerts/history/export/route.ts:5: * 응답은 CSV 파일 (`csvResponse` — envelope 예외, `.claude/rules/api-routes.md` 참고).
sed -n '1,12p' ~/workspace/pleiades/repos/myFinance/src/app/api/alerts/history/export/route.ts
```

- `src/` 전체에서 `.claude` 참조는 **1건뿐**이고 그 1건이 `route.ts:5` 다.
- 그 줄은 파일 첫 줄에서 열린 **JSDoc 블록(`/** … */`, 1~7줄) 안**이다 — `import` 는 9줄부터. **런타임 코드가 아니다.**
- 부르는 대상은 `.claude/rules/api-routes.md` 이고 초안 §4-2 **5행의 처분은 "유지"** 다 → `git rm` 범위 밖.
- `git rm` 범위(`rules/workflow.md` + `skills/codex-response-patterns/`) dry-run 재현 → 2파일. `src/` 무관.

세 조건이 모두 성립하므로 주장은 참이다.

### 주장 2 — 병합 배율 1.60 (H-1 = 433 LOC)

**판정: 정정** → **정정 ②**. 파생 추적 결과는 아래.

**소요로 파생되지 않았다 (확인).** 초안 `02_writer_harness.md:494-497` 이
*"시간 환산은 적지 않는다 — 이 저장소에 실작업 시간 기록이 없다"* 로 **명시적으로 차단**했고,
`433` 은 문서 전체에서 §4-13 H-1 행과 산출식 두 곳에만 나온다. **되돌리기 표의 등급·행위,
부록 A(CLAUDE.md 동기화안) 어디에도 파생되지 않았다.** 표본 1 외삽이 소요 추정으로 번지는 것은
초안이 스스로 막았다 — 이 부분은 잘 되어 있다.

무너지는 것은 **433 이라는 숫자 자체**다. 상세는 정정 ②.

### 주장 3 — §4-5 "처분으로 이름 충돌 4건 전부 소멸"

**판정: 정정** → **정정 ⑧**. 좁은 의미(“pleiades `.claude/` 에 동명 파일이 새로 생기지 않는다”)로는 참이지만,
초안이 **"미측정"으로 남긴 우선순위를 이 감사에서 런타임으로 측정**했고, 그 결과가 §4-5 표를 무효화한다.

**측정 (런타임 4회, plan 모드 · haiku · 전부 읽기 전용):**

```bash
cd ~/workspace/pleiades && CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \
  claude -p '<질문>' --model claude-haiku-4-5-20251001 --permission-mode plan \
  --add-dir /Users/sagan/workspace/myFitness --add-dir /Users/sagan/workspace/myFinance < /dev/null
```

| 측정 | 결과 |
|---|---|
| rule `workflow.md` 동시 부착 | **3벌 전부 로드** — `pleiades/.claude/rules`, `myFitness/.claude/rules`, `myFinance/.claude/rules`. 드롭 없음 |
| rule `api-routes` / `components` | 각 **2벌 공존** |
| agent `release-manager` | **1개만 남는다 — 나머지는 조용히 사라진다** |

**agent 는 마지막 `--add-dir` 이 이긴다** (순서를 반대로 한 2회로 확정 · description 문자열이 frontmatter 와 verbatim 일치):

| `--add-dir` 순서 | 남은 `release-manager` description |
|---|---|
| `… myFitness … myFinance` | `"myFinance PR 생성 + Codex bot 리뷰 대응 …"` = **fin** `agents/release-manager.md:3` |
| `… myFinance … myFitness` | `"dev → main 릴리즈 PR 생성, 머지 알림 대기, …"` = **fit** `agents/release-manager.md:3` |

→ **충돌의 성격이 두 종류이고 초안은 한 종류로 뭉뚱그렸다.** rule 은 *드롭 없이 모순 규범이 동시 로드*되고(더 위험),
agent 만 *조용한 드롭*이다. §4-5 마지막 표의 `둘 다 붙이고 방치 | 4건 | … | 우선순위 미측정` 은 세 항목이 다 틀렸다.

---

## 2. 정정 10건

각 항목은 **모순되는 양쪽의 `파일:줄`** 과 정정값·근거 명령을 병기한다.

### 정정 ① [최중대] 드리프트 "공통줄 %" 는 사실상 **빈 줄 카운트**다 — "합칠 수 있는 2쌍" → **1쌍**

| 어디 | 무엇이라 적혀 있나 |
|---|---|
| `02_writer_harness.md:20` | *"10쌍 중 `rules/workflow.md`(공통 80.5%) 하나를 빼면 **전부 55% 미만**, 스킬 6쌍은 **14.6~34.5%**"* |
| `02_writer_harness.md:195` | Codex 쌍 **34.5%** → 처분 **이관(재작성 병합)** · §4-3 "합치기가 성립하는 쌍" 2개 중 하나 |
| `02_writer_harness.md:206` | *"'쌍둥이니 하나로 합친다'가 성립하는 쌍은 **11쌍 중 2쌍**"* |
| **출처의 경고** `01_surveyor_harness_content.md:196-197` | *"**빈 줄이 공통줄에 섞여 있으므로 위 공통줄은 상한이다.**"* ← **초안이 이 문장을 버렸다** |

서베이어의 지표는 `공통줄 = fin 총 줄수 − diff 의 fin 전용 줄수`(`01_surveyor_harness_content.md:175-178`)로,
**빈 줄과 위치 일치를 공통으로 센다.** 같은 쌍을 *비공백·정규화·중복제거* 집합으로 다시 재면:

```bash
comm -12 <(git -C repos/myFinance show integration/pleiades:<fin> | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u) \
         <(sed 's/^[[:space:]]*//;s/[[:space:]]*$//' ~/workspace/myFitness/<fit> | grep -v '^$' | sort -u) | wc -l
```

| 쌍 | 초안 인용 % | diff 공통줄 | fin 빈 줄 | **실제 공유 비공백 유니크 줄** |
|---|---:|---:|---:|---:|
| rules `workflow` | 80.5% | 194 | 59 | **118** (fin 유니크 161 의 73.2%) |
| skill Codex | **34.5%** | 30 | 28 | **1** ← `---` (frontmatter 구분자) |
| skill 세션재개 | 33.7% | 33 | 29 | **3** |
| skill 릴리즈 | 33.6% | 45 | 29 | **6** |
| skill 인계 | 28.6% | 38 | 35 | **3** |
| skill 브랜치 | 18.7% | 23 | 14 | **2** |
| agent `release-manager` | 18.4% | 19 | 15 | **4** |
| skill 오케스트레이터 | 14.6% | 18 | 14 | **2** |
| rules `components` | 54.5% | 6 | 2 | **4** (유니크 9 중) |
| rules `api-routes` | 3.4% | 4 | 31 | **2** |

**`rules/workflow` 만 실질 중복이 있다 (118줄). 나머지 9쌍은 전부 ≤ 6줄이다.**
특히 **Codex 쌍이 공유하는 비공백 줄은 정확히 1줄(`---`)** — 내용상 공통이 **0** 이다.

**정정값:**
- `:20` "스킬 6쌍은 14.6~34.5%" → **실제 1.7~6.8%** (한 자릿수 배 과대)
- `:206` "11쌍 중 2쌍" → **1쌍** (`rules/workflow` 뿐)
- `:195` Codex 쌍 처분 근거 "공통 34.5%" → **성립하지 않는다.** 이것은 *병합*이 아니라
  §4-3 이 나머지 9쌍에 적용한 **"이름만 대응하는 재작성"과 동일 범주**다

**영향:** 초안의 결론(*"합치기는 병합이 아니라 재작성이다"*)은 **뒤집히지 않고 오히려 강화된다.**
그러나 §4-3 표 전체가 **잘못된 축으로 정렬돼 있고**, 정정 ②의 전제이기도 하다.

### 정정 ② 병합 배율 1.60 은 **단위 불일치** — 유니크 줄 비율을 raw LOC 에 곱했다

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:473` | `= (87 + 113) × 1.60   [입력 200 LOC × 병합 배율]` |
| `02_writer_harness.md:477-478` | *"근거: pleiades workflow.md 선례 — 원본 입력 **215 유니크 줄** → 산출 **344 유니크 줄** = 1.60"* |
| `01_surveyor_harness_content.md:216-222` | 215·344 의 정의 = **"빈 줄 제외 + 앞뒤 공백 정규화 + 중복 제거"** 집합 |

`87`·`113` 은 §4-2 표의 **raw LOC 열**(`wc -l`)이다. 배율은 **유니크 비공백 줄 공간**에서 유도됐다.
**두 공간이 다르므로 곱할 수 없다.**

```bash
wc -l ~/workspace/pleiades/.claude/rules/workflow.md        # 486  (raw)
git -C repos/myFinance show integration/pleiades:.claude/rules/workflow.md | wc -l   # 241
wc -l ~/workspace/myFitness/.claude/rules/workflow.md       # 264
```

**같은 선례를 raw LOC 로 재면 486 / (241+264) = 0.96** — 1.60 이 아니다.
0.96 을 쓰면 H-1 은 `200 × 0.96 + 113 =` **≈ 305 LOC**, 초안의 433 은 **약 42% 과대**다.

**그러나 배율을 갈아끼우는 것으로는 부족하다.** 정정 ①이 보인 대로 Codex 쌍은
**공유 내용줄이 0** 이므로 *"두 벌을 합쳐 중복을 걷어낸다"* 는 선례(공유 118줄)와 **성질이 다르다.**
표본 1 외삽 위에 단위 오류가 겹쳤고, 그 표본조차 대상과 같은 종류가 아니다.

**정정값:** `433 LOC` → **산출 불가.** `H-1 작업 표면 = 입력 313 LOC (3파일) · 산출 미확정`으로 적고,
초안 `:494-497` 이 시간에 대해 한 것과 **같은 처리**(측정 없음을 명시)를 LOC 에도 적용한다.

### 정정 ③ §4-4 형태 C 의 **"참조 재작성 0줄"** 이 틀렸다 — 절 번호가 함께 깨진다

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:221-225` | *"폐기 대상 `rules/workflow.md` 를 가리키는 참조가 유지 파일 안에 **13줄** … (fin 8줄 … / fit **5줄**) … C 는 경로가 그대로라 **0줄**이다"* |

```bash
git -C repos/myFinance grep --text -n "workflow\.md" integration/pleiades -- '.claude' 'CLAUDE.md' \
  | cut -d: -f2- | grep -v '^\.claude/rules/workflow\.md'          # → fin 8줄
cd ~/workspace/myFitness && grep -rn --binary-files=text "workflow\.md" .claude CLAUDE.md \
  | grep -v '^\.claude/rules/workflow\.md'                          # → fit 11줄
```

**(a) fit 은 5줄이 아니라 11줄이다.** 초안은 전체 경로(`.claude/rules/workflow.md`)만 셌고
**맨이름 참조 6줄을 놓쳤다**: `codex-liaison.md:23` · `workflow-conductor.md:3,20` ·
`branch-workflow.md:3,83` · `myfitness-orchestrator.md:103`. → 합계 **13줄 → 19줄**.

**(b) 더 중요한 것 — C 에서도 최소 6줄은 반드시 고쳐야 한다.** 놓친 줄들이 **fin·fit 의 절 번호**를 인용하는데
pleiades 는 그 번호를 재배치했다 (`01_surveyor_harness_content.md:237-238`: fin·fit `8. 코드 리뷰` → pleiades `9. 코드 리뷰 + PR`):

| 줄 | 인용 | pleiades 에서 그 번호는 |
|---|---|---|
| fin `quality-guardian.md:86` | `` `.claude/rules/workflow.md` §8 `` | §8 = **검증** (리뷰는 §9) |
| fin `project-verify/SKILL.md:98` | `` `.claude/rules/workflow.md` §7~8 `` | 한 절씩 밀렸다 |
| fin `spec-planner.md:19` | 10단계 열거에 **`UI 디자인`** 포함 | pleiades 가 **삭제**하고 `되돌리기 비용 산정`으로 교체 |
| fit `codex-liaison.md:23` | `workflow.md 8절` | 동 |
| fit `workflow-conductor.md:20` | `workflow.md 8-6` | pleiades 는 **9-6** |
| fit `branch-workflow/SKILL.md:83` | `workflow.md 8-1` | pleiades 는 **9-1** |

**정정값:** `C = 0줄` → **C = 최소 6줄** (절 번호·단계 목록 재작성). `A = 13줄` → **A = 19줄**.
C 를 A 보다 권고하는 근거는 약해지되 **뒤집히지는 않는다**(19 vs 6). 다만 **"0줄"은 삭제해야 한다** —
스텁이 경로를 살려도 **가리키는 문서의 절 번호가 달라** 조용한 오참조가 남는다.

### 정정 ④ auto memory **11파일(fin 6 · fit 3 · ple 2)** → **13파일(fin 9 · fit 2 · ple 2)**

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:73` · `:432` | *"하네스 이름·경로를 부르는 memory 는 **11파일**(fin 6 · fit 3 · ple 2)"* |
| `01_surveyor_harness_refs.md` §3 요약줄 | *"fin 6파일 · fit 3파일 · ple 2파일 = 11파일"* |
| `01_surveyor_harness_refs.md` §3 **본문 열거** | fin 쪽에 **9개 파일**을 실제로 나열한다 (오탐 1 별도) |

```bash
cd ~/.claude/projects
grep -rlE --binary-files=text '\.claude/(rules|agents|skills)' -- ./-Users-sagan-workspace-myFinance/memory
grep -rlE --binary-files=text '<fin agent+skill 이름 전부>'   -- ./-Users-sagan-workspace-myFinance/memory
#  합집합 → 10파일. project_ai_session_resume.md 는 서베이어가 표시한 오탐 → 실질 9
```

**fin 9파일**: `MEMORY.md` · `feedback_session_management.md` · `feedback_always_follow_workflow.md` ·
`project_briefing_no_tool_detection.md` · `project_milestone9_complete.md` · `project_milestone13_complete.md` ·
`project_next_milestone_17.md` · `project_next_milestone_18.md` · `project_next_milestone_19.md` (각 참조줄 실물 확인)
**fit 2파일** (`feedback_release_merge_commit.md` · `feedback_review_policy.md`) — 서베이어 표는 3, **자기 열거는 2**
**ple 2파일** ✓

**서베이어 요약이 자기 열거와 모순**하고 초안이 요약 쪽을 인용했다. 정정 ⑤⑥⑦과 같은 **#11 유형**이다.
다만 **§4-12 의 조치 결론(사용자 세션 작업 4줄)은 유지된다** — 추가된 3파일은 전부 유지 대상(`components.md` ·
`api-routes.md` · `milestone-workflow`)을 가리키거나 이력성 기록이다. 틀린 것은 모수뿐이다.

### 정정 ⑤ H-1 참조 재작성 **13줄 → 14줄** (`CLAUDE.md:117` 누락)

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:484-485` | *"orphan-check inbound **5** (`codex-liaison:31` · `workflow-conductor:34` · `branch-workflow:175` · `myfitness-orchestrator:32,41`)"* |
| `02_writer_harness.md:89-91` (§3-3) | 같은 목록으로 *"9줄로 fit 클러스터에 묶여 있다"* |

```bash
cd ~/workspace/myFitness && grep -rn --binary-files=text "orphan-check" .claude CLAUDE.md
#   … CLAUDE.md:117:- "머지완료" / "릴리즈해줘" → `release-flow` (+ `orphan-check`)   ← 초안 목록에 없다
```

`CLAUDE.md:117` 은 **유지 대상 파일 안의 inbound 참조**라 이관 시 반드시 고쳐야 한다
(초안이 `codex-review-loop` 쪽에서는 `CLAUDE.md:115` 를 제대로 셌으므로 **비대칭 누락**이다).

**정정값:** §4-13 `H-1 참조 재작성 = 13줄` → **14줄** (fit 11 → 12) · §3-3 `orphan-check 9줄` → **10줄**.

### 정정 ⑥ fin `git rm` **활성 파급 5건 → 6건**, 그리고 초안 내부 모순

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:71` (§3-1 핵심 수치) | *"fin `git rm` 활성 파급 **5건** (`CLAUDE.md` **4줄** + `route.ts:5`)"* |
| `02_writer_harness.md:168` (§4-2 36행) | *"갱신 대상은 `:128`(workflow 포인터) · **`:145`**(rules 목록)"* |
| `01_surveyor_harness_refs.md` 가정 3 | *"`CLAUDE.md` **62·118·128·140** + `route.ts:5`"* — **`:145` 가 없다** |

```bash
git -C repos/myFinance show integration/pleiades:CLAUDE.md \
  | grep -n --binary-files=text -- "\.claude\|workflow\.md"
#   62, 118, 128, 140, 145   ← 5줄
```

`:145` = `` - `workflow.md` — 10단계 워크플로우 전문, 브랜치/릴리즈/코드리뷰 절차 `` 는 명백한 활성 참조다.
**실제 = CLAUDE.md 5줄 + route.ts:5 = 6건.**

초안은 `:145` 를 §4-2·§4-8·§4-13 에서 올바르게 쓰면서 **§3-1 표에는 서베이어의 틀린 "4줄/5건"을 그대로 실어**
같은 문서 안에서 두 값이 충돌한다.

### 정정 ⑦ H-0 범위 과소 — grep 문구 **4곳 → 6곳**, 체크아웃 게이트 **6줄 → 8줄**

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:409-416` | *"정정 대상 **4곳**(전부 pleiades)"* — `CLAUDE.md:106` · `rules/workflow.md:91` · `agents/repo-surveyor.md:25` · `skills/repo-measure/SKILL.md:23` |
| `02_writer_harness.md:389` | 체크아웃 게이트 = `repo-measure:22,92,94` · `repo-surveyor:24,70,72` = **6줄** |
| `01_surveyor_harness_refs.md` §6 측정 명령 | `grep … .claude/skills/repo-measure/SKILL.md .claude/agents/repo-surveyor.md` ← **2파일로 범위를 한정해서 쟀다** |

```bash
cd ~/workspace/pleiades
grep -rn --binary-files=text -- "binary-files=text" CLAUDE.md .claude/
grep -rn --binary-files=text -- "체크아웃" .claude/
```

**동일 보일러플레이트가 2파일 더 있다:**

| 누락된 곳 | 내용 |
|---|---|
| `.claude/agents/reversibility-auditor.md:20` | `> **grep 에는 반드시 --binary-files=text …**` (문자 동일) |
| `.claude/skills/reversibility-audit/SKILL.md:18` | 동일 |
| `.claude/agents/reversibility-auditor.md:47` | *"…감사 전에 그 ref 를 체크아웃했는지 확인하고, 확인하지 못했으면 '미확인'으로 보고한다"* |
| `.claude/skills/reversibility-audit/SKILL.md:45` | 동일 |

**정정값:** §4-13 `H-0 = 12줄 + 4곳` → **14줄 + 6곳**. 부록 A-4 도 `CLAUDE.md:106` 만 교체안을 냈다.
4곳만 고치면 **측정 하네스는 새 규율을, 감사 하네스는 옛 규율을 갖게 된다** — 초안이 §4-10 ①에서
*"이 저장소가 이미 대가를 치렀다"* 고 지적한 바로 그 결함이 감사 쪽에 남는다.
(`/tmp` 6줄은 **전수 정확** — 하네스 전체에 `/tmp` 는 그 6줄뿐이다. 확인.)

### 정정 ⑧ §4-5 이름 충돌 — "우선순위 미측정" 해소 · 충돌의 **종류가 둘**

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:243` | *"**→ 파일 이관 자체로는 충돌 4건이 전부 소멸한다.**"* |
| `02_writer_harness.md:248` | *"어느 쪽이 이기는지는 [참조] '못 잰 것' 에 **미측정**으로 남아 있다"* |
| `02_writer_harness.md:255` | `둘 다 붙이고 방치 \| **4건** \| 즉시 \| 플래그 제거 \| 조용한 오참조 — **우선순위 미측정**` |

런타임 측정(§1 주장 3)으로 **셋 다 정정된다:**

1. **미측정 → 측정됨.** rule 은 **전부 공존**(workflow 3벌·api-routes 2벌·components 2벌 동시 로드),
   agent 는 **마지막 `--add-dir` 이 이기고 나머지는 조용히 사라진다**(순서 반전 2회로 확정).
2. **"4건"이 한 종류가 아니다.** 실제로 무언가 *사라지는* 것은 **agent 1건**뿐이다.
   rule 3건은 사라지지 않고 **모순되는 규범이 동시에 로드된다** — 초안이 §4-6 에서 별도로 걱정한
   *"통합 작업 중 규범이 둘이 된다"* 와 **같은 사건**인데 §4-5 는 이를 "충돌"로만 적었다.
3. **`:243` 의 "전부 소멸"은 유지하되 범위를 한정해야 한다.** 소멸하는 것은 *pleiades `.claude/` 네임스페이스*
   이고, 그 상태는 초안 §4-6 이 **유지 29파일이 보이지 않는 상태**라고 규정한 바로 그 구성이다.
   29파일을 보이게 하는 순간(= `--add-dir`) 4건이 되살아난다. **소멸은 처분의 성과가 아니라
   부착하지 않았다는 사실의 재기술이다.**

**정정값:** `:255` 행 → `agent 1건 = 조용한 드롭(마지막 --add-dir 우선) · rule 3건 = 드롭 없이 모순 규범 동시 로드`.
`:248` 의 "미측정" 삭제. §3-1 표 `:74` 및 [참조] "못 잰 것" 에서 해당 항목 제거.

### 정정 ⑨ §5 #3 — 출처를 잘못 인용해 "판단이 바뀐 것"을 부풀렸다

| 어디 | 무엇 |
|---|---|
| `02_writer_harness.md:507` | 이전 서술: *"`git rm` 활성 파급 5건 · 그중 1건이 `src/` **실행 파일**"* → 지금: *"…에이전트 리뷰 필수는 유지되나 **근거가 9-0 표의 '대상 저장소 변경'으로 바뀐다**"* |
| `01_surveyor_harness_refs.md` 가정 4 (원문) | *"그 5건 중 1건이 `src/` 실행 파일 **주석**이다. `.claude/rules/workflow.md` **9-0 표에서 '대상 저장소 변경 — 경로 무관'은 무조건 에이전트 사전 리뷰 필수**이므로…"* |

**서베이어는 이미 (a) '주석'이라고 적었고 (b) 리뷰 필수의 근거로 이미 9-0 '경로 무관'을 들었다.**
초안은 인용에서 "주석"을 빼고, 이미 9-0 이었던 근거를 *"근거가 바뀐다"* 로 기술했다. **바뀐 것이 없다.**

**정정값:** §5 3행과 §4-8 의 *"[참조] … 결론은 유지되고 근거만 바뀐다"* → **"결론도 근거도 그대로이고,
초안이 추가한 것은 `git rm` **범위를 2파일로 좁히면** 그 1건이 범위 밖이라는 사실뿐"**.
(주장 1 자체는 **확인**이다. 틀린 것은 공적의 크기다.)

### 정정 ⑩ 표 헤더·비율 라벨 2건 (경미)

| 어디 | 무엇 | 정정값 |
|---|---|---|
| `02_writer_harness.md:141` | 헤더가 `#### myFitness (19행)` — 실제 표 행은 **18** (표 블록에서 `^\| [0-9]` 행을 센 값) | **18행**. (총 37행 = 17+18+2 는 맞다) |
| `02_writer_harness.md:183` | *"**3파일(8.9%)** … **29파일(76.7%)** 이 저장소에 남는다"* — 8.9%·76.7% 는 **LOC 비율**인데 파일 수에 붙였다 | 파일 기준은 **8.8% / 85.3%**. §2-1(`:42-43`)은 LOC 를 병기해 옳다 |

---

## 3. 확인 12건

| # | 주장 | 근거 |
|---|---|---|
| 1 | **처분 표 34+3행의 LOC 전수** | `git ls-tree` + `wc -l` 로 36파일 개별 대조 — **한 건도 틀리지 않았다** |
| 2 | 파일·LOC 합계 | 이관 3/313 · 폐기 2/505 · 유지 29/2,696 · 합 34/**3,514** ✓ · fin 1,629 ✓ · fit 1,885 ✓ · 파일 검산 16/18 ✓ |
| 3 | LOC 비율 8.9% · 14.4% · 76.7% | 313·505·2,696 ÷ 3,514 재계산 일치 |
| 4 | **§3-2 정정 ① (#8 = 52줄)** | 재검산 완전 재현: fin **22** · fit **30**. 부록 B-4 의 줄 번호 열거 **52개 전부 일치** |
| 5 | #8 릴리즈 결함 줄 | fin **34,35,36** · fit **35,36,37** = `git merge dev` / `git tag` / `git push origin main --tags` ✓ → 58줄 ✓ (fin 25 · fit 33) |
| 6 | **fit 하네스 = 편도** | `git -C ~/workspace/myFitness log --all -- .claude CLAUDE.md` → **출력 0** · `ls-files` → **0** · `.gitignore:35,36` = `.claude/` · `CLAUDE.md` ✓ |
| 7 | fit `.claude/` 는 worktree 에 없다 | `ls repos/myFitness` → `.claude` 없음 (§4-6 의 *"`--add-dir` 대상은 항상 원본"* 성립) |
| 8 | 결합/도메인 열 전수 | §4-2 의 36행 값이 `01_surveyor_harness_content.md` §3 3등급 표와 전부 일치 |
| 9 | 파생 비율 | 70.5%(182/258) · 80.3%(61/76) · 8.3%(3/36) · 90.7%(136/150) · 85.7%(90/105) · 67줄(31+16+20) 전부 재현 |
| 10 | **Q29~Q38 번호 충돌 없음** | 001 Q1-4 · 002 Q1-7 · 003 **≤Q28** · 004 Q20-24 → 기존 최대 **Q28** ✓ |
| 11 | 렌더링 (T7) | 표 행 열 수 불일치 **0건** (`awk -F'\|'` 블록별 검사). 행 안 줄바꿈 없음 |
| 12 | 부록 B 명령 재현 | B-1 dry-run 2파일 ✓ · B-2 프로세스 치환 ✓ · B-3 grep 래퍼 0/3/3/3 ✓ · B-4 ✓ · B-5 3저장소 PUBLIC ✓ |

**#10 `/tmp` 6줄**(`repo-measure:117-119` · `repo-surveyor:84-86`)은 하네스 전체 전수 검색에서 **그 6줄이 전부**였다 — 열거 정확. **확인.**

---

## 4. 미확인 → 이 감사에서 해소된 것 2건

| 항목 | 초안 상태 | 측정 결과 |
|---|---|---|
| **Q37 전반부** — `--add-dir` 만으로 rules 가 로드되나 (환경변수 없이) | `:287-288` *"미측정"* | **로드되지 않는다.** 환경변수 없이 `--add-dir ~/workspace/myFitness` → `workflow_md_dirs` = **pleiades 하나뿐**. 환경변수를 켜면 2개. → **§4-6 ③④ 래퍼가 환경변수를 항상 켜야 한다는 초안의 처방은 옳다**(근거가 이제 측정이다) |
| **이름 충돌 우선순위** | `:248` *"미측정"* | 정정 ⑧ 참조 |

**여전히 미확인 (측정 못 함):**
- **§4-1 축 3 의 대칭 가정** — *대상 저장소 cwd 세션이 pleiades 하네스를 보는가*(`:111`). 대상 저장소를
  cwd 로 세션을 여는 것은 이 감사의 읽기 전용 범위를 벗어나지 않으나(plan 모드), **그 저장소의 하네스가
  세션 훅을 갖고 있어** 부작용 여부를 사전 판정할 수 없었다. Q37 후반부로 남긴다.
- **Q33 fit 민감 문자열 스캔** — 초안 B-6 과 동일 사유. 미측정 유지.

---

## 5. 그 밖에 보고할 사항 (정정 아님 · 판단 필요)

**(1) H-2 의 모드 표기가 7절 표로 집행 불가능하다.**
`02_writer_harness.md:457` 은 H-2 를 *"fin `git rm` 2파일 + 스텁 **2** + `CLAUDE.md` **4줄** (**모드 I** · 승인 게이트)"*
로 적고, 같은 행이 갱신 대상에 **`fit CLAUDE.md:92,108`** 과 fit 스텁을 포함한다.
그런데 `.claude/rules/workflow.md` 7절 표의 **모드 I = `repos/*` worktree · base `integration/pleiades`** 이고,
**fit `.claude/` 는 worktree 에 없으며 fit `CLAUDE.md` 는 gitignored** (확인 6·7).
→ H-2 의 fit 절반은 **모드 I 로 집행할 수 없고, PR 도 revert 도 존재하지 않는다.**
되돌리는 행위 열(*"머지 전: 브랜치 폐기. 머지 후: revert 커밋"*)도 fin 절반에만 적용된다.
초안은 **§4-9(#8)에서는 이 비대칭을 정확히 짚었으면서**(`:361-363` *"fit 은 PR 로 고칠 수 없다"*)
**§4-13 H-2 에서는 같은 비대칭을 반영하지 않았다.** H-2 를 fin/fit 두 행으로 분리하고
fit 행의 되돌리기를 **Q32 미결 시 편도**로 적을 것을 권한다(H-3 이 이미 그렇게 하고 있다).

**(2) `repos/myFitness/CLAUDE.md` 에 stale 사본이 있다.**
worktree 에 `CLAUDE.md`(8,621 B · 2026-09-03) 가 존재하는데 fit `.gitignore:36` 이 무시하는 파일이라
**tracked 가 아니다** — worktree 생성(09-04) 이전 날짜의 잔여 파일이다.
초안 §4-6 의 *"`--add-dir` 대상은 항상 원본"* 결론은 유지되나, **worktree 를 cwd 로 열면 이 stale 사본이 로드된다.**
Q30 부착 정책이 다룰 항목으로 추가를 권한다.

**(3) "쌍" 개수가 절마다 다르다.** `:20`·`:67` 은 **10쌍**, `:206` 은 **11쌍**.
차이는 §4-3 표의 `orphan 커밋 (짝 없음)` 행이다 — 짝이 없으므로 쌍이 아니다. `11쌍` → `10쌍 + 짝 없음 1`.

**(4) "3" 이 두 뜻으로 쓰인다.** `:66` 의 *"무조건 공통화(참조 0건) **3** / 36 파일 · 362 LOC"* 와
§2-1 의 *"pleiades 로 올라오는 것은 **3**파일 · 313 LOC"* 는 **다른 집합**이다
(전자 = fin `workflow.md` · fit `api-routes.md` · fit `orphan-check`, 교집합은 `orphan-check` 하나).
읽는 사람이 같은 3으로 오해하기 쉽다 — 한쪽에 각주를 권한다.

**(5) 되돌리기 3요소 중 "소요"가 전 표에서 비어 있다.** `.claude/rules/workflow.md` 4절은
*"등급 + 되돌리는 행위 + **소요**를 병기한다. 예외 없다"* 를 요구한다. 초안은 등급·행위는 전부 채웠고
(H-0~H-5 · ③선택지 4개 · ⑤(a)(b)(c) · §4-4 A/B/C · §4-5 3안 · §4-7 i~iv — **전수 확인**),
소요는 `:494-497` 에서 **사유를 명시하고 일괄 생략**했다. 규율 위반이지만 **근거 있는 이탈**이고,
등급 척도(즉시/중간/높음/편도) 자체가 시간 축이므로 **정정으로 세지 않는다.** 다만 4절 문구와의
충돌은 남으므로 — 4절에 *"실작업 시간 기록이 없는 단계는 등급으로 갈음하고 그 사실을 적는다"* 를
추가하는 것을 권한다(H-0 범위에 넣을 수 있다).

---

## 6. 결론

### (a) 정정 건수 합계 — **10건**

| # | 정정 | 무게 |
|---|---|---|
| ① | 드리프트 % = 빈 줄 카운트 → 합칠 수 있는 쌍 2 → **1** | **최중대** |
| ② | 병합 배율 1.60 단위 불일치 → H-1 433 LOC 산출 불가 | **중대** |
| ③ | 형태 C "참조 0줄" → 최소 6줄 · fit 참조 5 → 11 (절 번호 깨짐) | **중대** |
| ④ | auto memory 11파일 → 13파일 (fin 6→9 · fit 3→2) | 중간 |
| ⑤ | H-1 참조 13줄 → 14줄 (`CLAUDE.md:117`) | 중간 |
| ⑥ | fin `git rm` 활성 파급 5건 → 6건 (`CLAUDE.md:145`) · 문서 내부 모순 | 중간 |
| ⑦ | H-0 범위 12줄+4곳 → 14줄+6곳 (감사 하네스 2파일 누락) | 중간 |
| ⑧ | 이름 충돌 "미측정" 해소 · 충돌 종류가 둘 | 중간 |
| ⑨ | §5 #3 출처 오인용 ("주석" 누락 · 근거가 바뀌지 않았다) | 경미 |
| ⑩ | 표 헤더 19행→18행 · LOC 비율을 파일 수에 라벨 | 경미 |

**→ 문서는 초안이다.** `.claude/rules/workflow.md` 4절 *"정정이 하나라도 나오면 문서는 다시 초안"*.
같은 4절의 *"3회를 넘으면 스코프를 줄인다"* 는 **회차** 기준이므로 아직 해당하지 않는다(1회차).

**다만 ①②는 부분 수정으로 덮이지 않는다.** §4-3 표 전체와 §4-13 산출식이 같은 무효 축 위에 있으므로
**해당 두 절은 개정본 발행을 권한다** (§4-2 처분 표는 무결하므로 문서 전체 재작성은 불필요).

**#11 유형(집계 오류)이 이번 라운드에서 4건 더 나왔다** (④⑤⑥⑦). 초안이 스스로 1건(#8 43→52)을
잡아낸 것과 합치면 **같은 유형이 3라운드 연속**이다. `.claude/rules/workflow.md` 2절에
**"열거와 합계가 함께 있으면 합계를 신뢰하지 말고 열거를 센다"** 를 명문화할 것을 오케스트레이터에게 건의한다
— 서베이어 요약줄이 자기 열거와 어긋난 사례가 이번에만 3건(④의 fin·fit, ⑥)이다.

### (b) 다음 라운드에서 나올 가능성이 가장 높은 3건

| 순위 | 예상 정정 | 왜 |
|---|---|---|
| **1** | **§4-3 "기준(base)" 열 전체** — 정정 ①로 축이 무효화됐으므로, `Codex 대응`의 기준을 *"fit 113줄"* 로 둔 근거(*"더 길고 루프 절차가 대응된다"*)와 `양쪽 유지` 7쌍의 판정 근거를 **공통줄이 아닌 다른 축으로 다시 세워야 한다.** 재작성 과정에서 처분이 바뀌는 행이 나올 가능성이 높다 — 특히 **공유 1줄짜리 Codex 쌍을 굳이 "이관(병합)" 으로 묶을 이유가 남는지** | ①이 판정의 유일한 정량 근거였다 |
| **2** | **Q31 선행 측정(버린 181줄 분류)이 §4-2 의 9·25행을 뒤집는다** — 초안 `:524` 이 이미 *"pleiades 7절이 단독 작업에 대해 '그 저장소 자신의 workflow.md 를 따르라'고 **명시적으로 위임**한다 — 폐기하면 위임 대상이 사라진다"* 고 적었다. 정정 ③이 **그 위임 대상의 절 번호마저 어긋난다**는 것을 보였으므로, 폐기(505 LOC · 전체의 14.4%)가 **유지 + 부분 갱신**으로 바뀔 개연성이 커졌다. 그러면 H-2 가 거의 사라진다 | 초안 §7 이 스스로 유효기간 조건으로 등재한 항목 + ③의 새 증거 |
| **3** | **fit 참조·`CLAUDE.md` 계열의 추가 누락** — 정정 ③⑤가 **둘 다 fit 쪽에서, 둘 다 `CLAUDE.md` 또는 맨이름 참조에서** 나왔다. 초안의 fit 측 열거는 `.claude/rules/...` 전체 경로 패턴에 의존하는 자리가 더 있고(§4-12 · §4-4 · 부록 A-1 의 fit 파일 수 16), **fit 은 `git grep` 이 원리상 0건이라 교차 검증 수단이 하나뿐**이다 | 같은 원인(맨이름 참조 · gitignored 트리)이 이미 2회 발현 |

---

## 7. `decision-writer` 에게 — 고쳐야 할 문장

| 초안 위치 | 이렇게 고친다 |
|---|---|
| `:20` | *"스킬 6쌍은 14.6~34.5%"* → *"스킬 6쌍은 **공유 비공백 유니크 줄 1.7~6.8%**(서베이어의 `공통줄` 지표는 빈 줄을 포함하는 상한이다 — `01_surveyor_harness_content.md:196`)"* |
| `:195` | Codex 쌍 근거 *"공통 34.5%"* 삭제 → *"공유 내용줄 **1줄**(`---`). 병합이 아니라 **두 문서를 입력으로 한 신규 작성**"* |
| `:206` | *"11쌍 중 2쌍"* → *"**10쌍 중 1쌍**(`rules/workflow` 뿐) + 짝 없음 1" |
| `:471-478` | 산출식에서 `× 1.60` 삭제 → *"입력 313 LOC / 3파일. **산출 LOC 는 측정 근거가 없어 적지 않는다**(시간과 동일 처리)"* |
| `:221-225` | *"fit 5줄"* → *"fit **11줄**"* · *"C 는 … **0줄**"* → *"C 도 **최소 6줄**(절 번호 `8절`·`8-1`·`8-6`·`§8`·`§7~8`·10단계 목록이 pleiades 재배치와 어긋난다)"* |
| `:71` | *"활성 파급 5건 (`CLAUDE.md` 4줄 + …)"* → *"**6건** (`CLAUDE.md` **5줄** 62·118·128·140·**145** + `route.ts:5`)"* |
| `:73` · `:432` | *"11파일(fin 6 · fit 3 · ple 2)"* → *"**13파일**(fin **9** · fit **2** · ple 2)"* |
| `:389` · `:409-416` · `:455` | `12줄 + 4곳` → **`14줄 + 6곳`**. 누락 4줄 추가: `agents/reversibility-auditor.md:20,47` · `skills/reversibility-audit/SKILL.md:18,45` |
| `:484-485` · `:89-91` · `:480` | orphan-check inbound `5` → **6** (`CLAUDE.md:117`) · `9줄` → **10줄** · `13줄` → **14줄** |
| `:243` · `:248` · `:255` | "미측정" 삭제. `:255` 행 → *"agent **1건** = 조용한 드롭(**마지막 `--add-dir` 우선**) · rule **3건** = 드롭 없이 **모순 규범 동시 로드**"*. `:243` 은 *"pleiades `.claude/` 네임스페이스 한정"* 을 명시 |
| `:507` · `:328-336` | *"근거가 바뀐다"* → *"결론도 근거도 그대로다(서베이어가 이미 9-0 '경로 무관'을 들었고 '주석'이라 적었다). 새로 밝힌 것은 **범위를 2파일로 좁히면 그 1건이 범위 밖**이라는 사실"* |
| `:141` | `(19행)` → `(18행)` |
| `:183` | *"3파일(8.9%) … 29파일(76.7%)"* → *"3파일(파일 8.8% · **LOC 8.9%**) … 29파일(파일 **85.3%** · LOC 76.7%)"* |
| `:457` | H-2 를 **fin 행 / fit 행으로 분리**. fit 행: 모드 I 불가(worktree 에 `.claude/` 없음 · `CLAUDE.md` gitignored) · 되돌리기 **Q32 미결 시 편도** |
| §3-1 표 `:74` | `--add-dir` 대조 행에 **환경변수 없으면 rules 도 로드되지 않는다**(이 감사 런타임 1회) 추가 |

**`repo-surveyor` 에게 요청 (재측정 아님 · 합계 정정):**
① `01_surveyor_harness_content.md` §2 드리프트 표에 **공유 비공백 유니크 줄 열 추가** (빈 줄 상한 경고를 표 안으로)
② `01_surveyor_harness_refs.md` §3 요약줄 `fin 6 · fit 3` → **`fin 9 · fit 2`** (자기 열거와 일치시킨다)
③ 동 §6 표 합계 `17줄`·`26줄` → **`22줄`·`30줄`** (초안 §3-2 가 이미 요청한 건)
④ 동 가정 3 의 `CLAUDE.md 62·118·128·140` → **`62·118·128·140·145`**, `5건` → **`6건`**
