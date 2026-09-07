# 인계 노트 — 2026-09-07, 하네스 통합(#1) 005 발행 · 집행 H-0~H-5 착수

직전 노트: `2026-09-04-layout-and-rules.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**대상 저장소 두 곳에 썼다 — 단, 작업 브랜치 + PR 뿐이다.** `dev`·`main` 직접 커밋·push 0.
원본 체크아웃은 fin `dev` / fit `main` 으로 복귀시켰고 네 체크아웃 모두 clean.
사용자 승인: 2026-09-07 "승인하되 dev 와 main 브랜치엔 쓰지 않는 쪽으로" + fin 4파일 확장 승인.

1. **Q20 답** (사용자) — *공통은 pleiades, 저장소별 특수는 그 저장소에 유지*
2. **실측 5건** → `measured-facts.md` 끝 절 + `_workspace/harness/01_surveyor_harness_{content,refs,workflow_diff}.md`
3. **005 발행** — 초안 4회 개정 · 감사 4회(정정 10→8→7→0) · 정본 `docs/specs/005-harness-integration.md`. 004 §8 정정 append
4. **Q29·Q30·Q32·Q39 확정** (사용자) — B 복사 · 저장소별 래퍼 · fit tracked 화 · W-2 원본 유지
5. **집행 착수 5단계** — 아래 PR 표. H-1(Q41) · H-3(fit) 은 미착수
6. Codex 라운드: #19 1회(P2 3) · #20 4회(P1 4 → 반영) · #22 2회(P1 4 → 반영) · #492 2회(P1 2 → 4파일 확장 승인 후 반영) · #369 대기

## 열린 PR (머지는 사용자가 직접 · 스택 순서 #19 → #20 → #22)

| PR | 저장소 · 브랜치 | 내용 | 이슈 | 되돌리기 | 봇 상태 (세션 말미 `gh pr view` 로 재확인) |
|---|---|---|---|---|---|
| fomalhaut84/pleiades#19 | `chore/1-1` | 005 정본 · 004 §8 · CLAUDE.md · 실측 · 롤백 문서 | #1 `Closes` | 즉시 | P2 3건 반영, 재리뷰 미요청(9-3) |
| fomalhaut84/pleiades#20 | `chore/10-1` (#19 위) | H-0 룰 정정(#10 14줄 · grep 6곳 · R1·R2) + 게이트 if/else | #10 `Closes` | 즉시 | 4회차 재리뷰 대기 |
| fomalhaut84/pleiades#22 | `chore/21-1` (#20 위) | H-1b `orphan-check` 복사(base 12줄 + 판정 로직 정정) · H-5 `bin/claude-with` · README | #21 `Closes` | 즉시 | 3회차 재리뷰 대기 |
| fomalhaut84/myFinance#492 | `chore/pleiades-8-1` from fin `dev` | #8 fin — `workflow.md` + agents·skills 4파일(척도·릴리즈 봇 게이트) | pleiades#8 `Refs` | 즉시 | 2회차 재리뷰 대기 |
| fomalhaut84/myFitness#369 | `chore/368-1` from fit `dev` | H-4 — `.gitignore` 2줄→1줄, 하네스 17파일 + `CLAUDE.md` tracked 화 | myFitness#368 `Closes` | 중간 | 1회차 대기 |

**머지 순서 제약:** pleiades 는 #19 → #20 → #22 (스택). fit `#369` 머지 후에야 H-3(fit) 착수 가능.
**#8 종료:** #492 와 H-3(fit) PR **둘 다** 머지된 뒤 수동 종료 (5절 대칭 변경 예외).

## 결정된 것

| | 결정 | 근거 |
|---|---|---|
| **Q20** | 공통은 pleiades, 특수는 저장소 | 사용자 2026-09-07 |
| 실측 적용 결과 | 34파일 중 **복사 1**(`orphan-check`) + **역할 이관 1**(Codex 대응 신규 작성) + **유지 33**. fin `git rm` 범위 **0**. fin·fit `workflow.md` **폐기 불가**(단독 작업 35줄) | 005 §2-1 · §4-2 · Q31 |
| **Q29** | `orphan-check` 형태 **B 복사** (+ base 12줄) | 사용자 |
| **Q30** | `--add-dir` **저장소별 래퍼** `bin/claude-with <fin|fit>` | 사용자 |
| **Q32** | fit 하네스 **tracked 화** (`settings.local.json` 은 ignore 유지) | 사용자 · 정정 N |
| **Q39** | `workflow.md` **W-2 원본 유지** + #8 부분 갱신 | 사용자 |
| Q31·Q33·Q37 | 측정으로 해소 (폐기 불가 · 민감 문자열 0 · `--add-dir` 로딩 범위) | measured-facts |
| #8 이슈 매핑 | fin·fit PR 이 **pleiades#8 을 공유** (`Refs`), H-4 만 fit 이슈 신설 | 5절 예외 표 · 정정 M |

### 이 결정들이 바꾼 판단

- **하네스 통합은 "파일 이동"이 아니라 "역할 이관"이다.** 쌍둥이 스킬 10쌍 중 실질 공통은 `rules/workflow.md` 1쌍뿐(공유 비공백 줄 기준). 합치기 = 병합이 아니라 재작성
- **유지 33파일은 pleiades 세션에서 자동 로드되지 않는다** — `permissions.additionalDirectories` 는 툴 권한만. `--add-dir` 가 유일하고, rules·CLAUDE.md 는 환경변수가 있어야 로드된다. 그래서 래퍼가 있다
- **`--add-dir` 로 둘 다 붙이면 agent `release-manager` 는 마지막 디렉터리가 조용히 이기고 rule 은 7벌 공존.** 래퍼는 한 번에 하나만 받는다
- 003 §10-1 의 "1a-1 부터 #1 선결"은 유효하다 — **방향은 확정, 집행은 진행 중**

## 결정되지 않은 것

| 이슈/질문 | 내용 | 언제 |
|---|---|---|
| **Q41** | H-1(Codex 대응 신규 작성)의 이름 — fin·fit 기존 skill·agent 이름과 겹치지 않게 | H-1 착수 전 |
| **H-3(fit)** | #8 fit `workflow.md` 33줄 + (fin 과 같은) 에이전트·스킬 전파 — fit `codex-liaison`·`codex-review-loop`·`release-flow` 등 | **#369 머지 후, 별도 승인 게이트** |
| Q36 | fit·fin `settings.local.json` 저장소 무관 규칙을 pleiades 로 이식하나 | 낮음 |
| Q38 | 004 Q22 재검증 범위를 "ignored 경로 포함 grep 측정 전부"로 | 중간 |
| #17 · #14 | 문서 정합성 감사 에이전트 · 봇 불가 시 대체 경로 | #14 는 룰 문구, #17 은 Codex 쿼터 회복 후 |
| #3 Q10 · Q23 | 1a-1 블로커 · 단계 0 전제 | 변동 없음 |
| myFitness#370 · #371 | 하네스 절대경로 이식성 · `orphan-check` 원본 결함 (pleiades 사본은 고쳤다) | #369 머지 후 |

**단계 0 은 여전히 미착수, 단계 1 을 먼저 하기로 결정된 적도 없다** (2026-09-04 노트 그대로).

## 다음 세션의 첫 액션 후보

1. **열린 PR 5개의 봇 결과 확인 → 9-6 body 확정 → 사용자 머지 → 10절 정리** (이슈 코멘트·close·브랜치 삭제·CLAUDE.md 상태). 되돌리기 즉시. `#8` 은 아직 닫지 않는다
2. **H-3(fit)** — #369 머지 후. 승인 게이트 5항목 다시 제시(모드 S · 이슈 pleiades#8 공유 · fit `dev` 분기 · 9-0 에이전트 필수). fin PR #492 의 4파일 전파 교훈을 **처음부터** 범위에 넣는다(fit 은 `codex-liaison`·`release-flow`·`codex-review-loop`·`branch-workflow` 가 해당). 되돌리기 즉시
3. **H-1** — Q41 이름 결정(예: `codex-response`, 겹침 0 확인) 후 fin 87 + fit 113 줄을 입력으로 신규 작성. pleiades 만. 되돌리기 즉시
4. #14 룰 보완(봇 불가 시) — 문구 1건, 즉시. 이후 #17

## 주의사항

- **두 저장소는 실서비스 중.** 쓰기 전 사용자 확인. 이번 세션 승인은 "브랜치 + PR 만, dev/main 직접 금지" 였다
- **세션 시작 시 관측:** 네 체크아웃 clean · 기대 브랜치. 세션 말미도 같다. **다음 세션은 이 노트보다 현재 상태를 신뢰하라**
- **pleiades 브랜치가 스택돼 있다** (`chore/1-1` → `chore/10-1` → `chore/21-1` → `chore/23-1`). 앞 PR 이 머지되면 뒤 PR 은 자동으로 diff 가 줄지만, `dev` 를 당긴 뒤 리베이스가 필요할 수 있다
- **이 환경의 `grep` 은 ugrep 래퍼로 `.gitignore` 를 따른다.** fit `.claude/` 같은 ignored 디렉터리는 `--binary-files=text` 로도 못 막고 통째로 0건이 된다 → `--no-ignore-files` / `/usr/bin/grep` / 경로 직접 지정. measured-facts M3 가 그래서 틀렸었다(정정됨). **룰 반영은 #20**
- **`--add-dir` 는 variadic** — 프롬프트를 플래그 뒤에 두면 디렉터리로 먹힌다. 래퍼가 순서를 잡아준다
- **fit 하네스는 #369 머지 전까지 git 이력이 없다.** 지우면 복원 불가. 원본 `~/workspace/myFitness/.claude/` 만 있다
- **fin `git rm` 은 하지 않는다** — 005 가 범위 0 으로 판정. 2026-09-04 노트의 "fin `git rm` 은 중간" 은 폐기된 전제
- **감사 4회 순환은 스킬 기준(3회)을 한 번 넘겼다.** 3회차의 저지 5건이 새 측정 없이 닫히는 국소 정정이라 스코프 축소 없이 진행했다 — 005 머리에 기록
- **집계 교훈 (R1, #20):** 처분 표의 LOC·파일 수는 4회 내내 맞았고, 틀린 것은 그 위의 요약·비율·판정 축이었다. "합계 대신 열거를 센다"가 룰이 됐다
- `MEMORY.md` 17줄 (한도 200). 여유 있음
- myFinance 기본 브랜치에 Dependabot 경고 44건(critical 3)이 떠 있다 — push 때마다 출력된다. pleiades 범위 밖, 사용자에게 알렸다

## 정정된 기록 — 옛 문서를 그 전제로 읽지 말 것

- 004 Q20 *"하네스 통합 = fin 16 + fit 18 을 pleiades 로 이관"* → **아니다.** 이관은 1 + 역할 1. 나머지는 저장소에 남고 `--add-dir` 로 본다 (004 §8)
- 004 Q21 *"fin `git rm` 은 단계 2 본체"* → **소멸** (범위 0)
- 004 Q22 *"grep 0건은 binary 스킵 때문"* → 원인은 **gitignore(ugrep 래퍼)**. 재검증 범위는 005 Q38
- measured-facts 하네스 구성 절의 *"myFitness 절대경로 0건"* → **3건(전부 하네스)**, 앱 소스는 0 유지
- measured-facts H4·H5 요약 *"5건 · 11파일"* → **6건 · 13파일** (정정 블록)
- 005 1회차의 *"폐기 2파일 · 이관 3파일"* → **폐기 0 · 복사 1** (005 §0 이력)

## 재현이 필요한 절차

- **아티팩트 재발행** — 005·집행 상태가 반영되지 않았다. `docs/artifacts/integration-artifact.html` 를 고친 뒤
  `Artifact(file_path=..., url="https://claude.ai/code/artifact/88cd616a-efe0-4d84-b298-e6961675ae0d")`. 발행 전 `action:"read"`
- **PR 5개 9-6 body 확정** — 봇 결과가 이 노트 작성 시점에 일부 대기 중이었다
