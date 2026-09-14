---
name: dual-repo-change
description: myFinance·myFitness 두 실서비스 저장소에 변경을 집행하는 절차. 승인 게이트, 착수 직전 재감사, 한쪽씩 순차 변경, 각 저장소 컨벤션·검증, 빌드·재배포 안내, 롤백 문서화. "단계 실행해줘", "적용해줘", "두 저장소에 반영", "이제 실제로 해줘" 요청 시 반드시 사용. 대상 저장소에 쓰기가 발생하는 모든 작업이 여기 해당한다.
---

# dual-repo-change — 실서비스 변경 집행

pleiades 에서 대상 저장소에 **쓰는** 유일한 절차다. 나머지 작업은 전부 읽기 전용이다.

## 모드 — 아래 체크리스트는 **모드 I** 기준이다

`.claude/rules/workflow.md` **7절 base 표**가 모드를 정한다.

| 모드 | 언제 | 어디서 | base | 이 스킬에서 적용되는 것 |
|---|---|---|---|---|
| **I** 통합 | **pleiades 발 변경 전부** (통합 단계 · 룰 정정 · tracked 화 등) | `repos/*` worktree | `integration/pleiades` (브랜치 `integration/<type>-pleiades-<name>`) | **전부** |
| **S** 단독 | 그 저장소만의 평시 변경 (**pleiades 무관**) **또는 서비스 미러**(모드 I 로 `integration/pleiades` 에 들어간 변경을 서비스 `dev` 에도 복제 — 별도 이슈는 그 저장소에, 본문에 원 PR 링크) | **원본** | 그 저장소 `dev` | 승인 게이트 · 착수 직전 재감사 · 저장소별 검증 · 롤백 문서화 |
| **H** 핫픽스 | 실서비스 버그 | **원본** | 그 저장소 `main` | 위와 같음 + 긴급 수정 절 |

> **모드 S·H 는 `repos/` 도 `integration/pleiades` 도 쓰지 않는다 (PR #6 Codex 리뷰 P1).**
> 아래 체크리스트와 에러 표는 **모드 I 를 전제로** 쓰여 있다 — 모드 S·H 에서는
> **브랜치·base·PR 항목을 7절 표로 대체**하고 나머지(승인·재감사·검증·롤백)만 적용한다.
> 그러지 않으면 "대상 저장소 쓰기는 전부 이 스킬" 과 "단독 작업은 `dev` 경유" 가 충돌한다.

두 저장소는 실서비스 중이다 — 같은 Ubuntu 서버, PM2 6개 프로세스
(`myfinance`:4100 / `myfinance-bot` / `myfinance-mcp`:4210 / `myfitness`:4200 / `myfitness-bot` / `myfitness-mcp`:4301).
잘못된 변경은 사용자의 실제 재무·건강 알림을 멈춘다.

## 1. 승인 게이트 — 건너뛰지 않는다

착수 전 아래 다섯을 제시하고 **명시적 승인**을 받는다.

```markdown
## 집행 계획 — <단계명>

### 건드릴 파일
| 저장소 | 파일 | 변경 |
|---|---|---|

### 반영에 필요한 것
- 빌드: <필요 / 불필요>
- 재시작: <어떤 PM2 프로세스>
- 세션 초기화: <필요 시 — 예: 텔레그램 /reset>

### 롤백 — 머지 전 · 머지 후 · 원본 도달분 (5-1 필수 항목 셋 전부)
```bash
<정확한 명령 — 머지 후는 revert 브랜치 → push → gh pr create 까지>
```
소요: <시간> · 등급: <즉시 / 중간 / 높음 / 편도 — 원본 도달분까지 포함해 매긴다>

### 서비스 중단 가능성
<있음 / 없음. 있으면 어느 구간>
```

포괄 승인("진행해줘")을 이미 받았더라도 **실제 범위가 승인 시점 설명과 달라지면 다시 확인한다.**
사용자가 모르는 채로 실서비스가 바뀌는 상황을 만들지 않는다. 이건 이 프로젝트에서 실제로 한 번 걸린 지점이다 —
"JSON 두 줄"로 승인받은 작업이 실측 결과 TS 2파일 + 재배포였다.

## 2. 착수 직전 재감사

문서 작성 시점과 착수 시점 사이에 코드가 움직였을 수 있다.
`reversibility-audit` 을 **다시** 돌린다. 정정이 나오면 **멈추고** 사용자에게 보고한다.

> **재감사는 분기 전에 돈다 — 그러니 ref 를 명시해서 넘긴다 (PR #6 Codex 리뷰 P1).**
> 이 단계는 3절(브랜치 생성)보다 **먼저**이고, 원본은 평소 fin=`dev` · fit=`main` 에 놓여 있다.
> ref 를 안 주면 **모드 H(myFinance)는 `main` 대신 `dev` 를**, **모드 S(myFitness)는 `dev` 대신
> `main` 을** 감사한다 — **바뀔 코드가 아닌 코드를 승인한다.**
> 감사에 `<dir>`·`<ref>` 를 **그 모드의 값으로 명시해서** 넘긴다 (7절 표).

## 3. 한쪽씩 순차로

두 저장소를 동시에 반쯤 고쳐 두 서비스가 함께 깨지는 상태를 만들지 않는다.

```
저장소 A: 브랜치 → 변경 → 검증 통과 → 커밋
  ↓  (통과했을 때만)
저장소 B: 브랜치 → 변경 → 검증 통과 → 커밋
```

한쪽만 성공하고 다른 쪽이 막히면 **성공한 쪽을 롤백할지 사용자에게 묻는다.** 비대칭 상태를 방치하지 않는다.

## 4. 각 저장소 컨벤션

**정본은 `.claude/rules/workflow.md`(pleiades)다.** 대상 저장소의 `CLAUDE.md`·`.claude/rules/` 는
**읽기 전용 참고**로만 본다.

> **myFitness worktree 에는 `.claude/` 가 없다 (PR #6 교차 감사 M8).** fit 의 하네스는 gitignored 라
> worktree 에 따라오지 않는다(004 §3′, 의도적 제외). 필요하면 **원본 `~/workspace/myFitness/.claude/`** 를
> 읽는다 — 쓰지는 않는다. myFinance 는 tracked 라 worktree 에 있다.
>
> **정정 (2026-09-11 · #59 · 1a-2 재감사 정정 6 부수).** 위 문단은 **myFitness#369(2026-09-07 · H-4 tracked 화) 이후 거짓**이다 —
> fit `.claude/`·`CLAUDE.md` 는 `integration/pleiades` 에 tracked 라 **worktree 에 있고 거기서 고친다**(#42 · 1a-2 가 그렇게 했다).
> 여전히 참인 것은 **세션이 로드하는 하네스는 원본**이라는 점뿐이다(`bin/claude-with` · `--add-dir`) — 그래서 worktree 를 고친 뒤
> **원본 동기화**(`git archive integration/pleiades <paths> | tar -x -C ~/workspace/myFitness`)가 따로 필요하다(10절 · #27). `bin/claude-with:12` 의 같은 결함은 2026-09-09 에 고쳤다. 되돌리기: 즉시.

공통:
- **pleiades 통합 작업의 base 는 `dev` 가 아니라 `integration/pleiades` 다.**
  작업은 `~/workspace/pleiades/repos/<repo>` **worktree** 에서 하고,
  `integration/<type>-pleiades-<name>` 을 따서 **`integration/pleiades` 로 PR** 한다 (이슈 #25 · 7절 표).
  `integration/pleiades` 는 **`dev` 로 머지되지 않는다** — pleiades 내부 메인이다 (이슈 #25). 서비스에도 필요한 변경은 단독 작업 경로(모드 S)로 별도 PR.
  근거는 `docs/specs/004-repo-layout.md` · `.claude/rules/workflow.md` 7절 base 표.
  **미완성 단계를 `dev` 로 보내면 서비스 브랜치가 오염되고 003 §5-2 의 단계별
  되돌리기 등급이 무너진다** (PR #6 Codex 리뷰 P1).
- 원본 `~/workspace/myFinance`(`dev`) · `~/workspace/myFitness`(`main`) 에는
  **통합 작업을 쓰지 않는다** — **단독 작업**(그 저장소의 `dev` 경유)과 **서비스 핫픽스**(`main` 경유) 전용이다.
  **둘은 다른 경로다** — `.claude/rules/workflow.md` 7절 base 표. 승인 게이트는 양쪽 다 그대로.
- `main` 직접 변경 금지
- **PR 머지는 사용자가 직접 한다.** 로컬 merge / 직접 push 금지
- 커밋 `<type>(<scope>): <desc> (#<issue>)`
- DB 접근은 `@/lib/prisma` singleton, raw query 금지
- API 응답 envelope `{ success, data?, error?, meta? }`
- catch 에서 `error.message` 원문 노출 금지 — 한국어 정적 메시지
- 신규 로직에 테스트 페어링 (같은 커밋)

저장소별:

| | myFinance | myFitness |
|---|---|---|
| 검증 | `npm run lint` / **`npx tsc --noEmit`** / **`npm run test:run`** / `npm run build` | `npm run lint` / `npm run typecheck` / **`npm run test`** / `npm run build` |
| 테스트 | vitest 있음 (`test` 는 watch — **`test:run` 을 쓴다**) | **vitest 있음 (1a-2 · #58 · myFitness#374 머지 후)** — `npm run test` = **`vitest run` + verify 스크립트 2개**(1회 실행형 · CI 가 부르므로 watch 가 아니다) · `test:run` 은 fin 대칭 alias · 테스트는 `src/**/__tests__/**/*.test.ts` |
| 같은 역할 다른 위치 | 아웃바운드 전송: `bot/utils/telegram.ts` | 아웃바운드 전송: `bot/notifications/send.ts` |

> **검증 명령은 `.claude/rules/workflow.md` 8절 표가 정본이다** (PR #6 Codex 리뷰 P1).
> myFitness 의 `npm run test` 는 vitest 가 아니라 **verify 스크립트 2개**다 — 테스트 프레임워크가
> 없다는 것과 **실행할 것이 없다는 것은 다르다.** 1a-2 가 vitest 를 도입하기 전에도 반드시 돌린다.
>
> **소진 (2026-09-11 · #59).** 위 블록의 전제는 1a-2(#58)로 끝났다 — fit `npm run test` 는 이제 vitest 회귀 baseline + verify 2종이다(myFitness#374). 명령 이름은 그대로라 8절 표 fit 행은 무변경. **선결: myFitness#374 머지** — 그 전까지 fit `integration/pleiades` 의 `npm run test` 는 verify 2종뿐이다(PR #60 Codex P1).

**같은 역할 코드가 다른 파일에 있다는 것을 전제로 찾는다.** 경로가 대칭일 거라 가정하지 않는다.
정본을 고를 때는 더 성숙한 구현을 택하고, 어느 쪽을 왜 골랐는지 커밋 메시지에 남긴다.

## 5. 집행 후

1. 각 저장소 검증 명령 실행 (위 표)
2. **빌드·재배포는 사용자가 한다.** 명령을 정확히 제시한다:
   ```bash
   npm run build
   pm2 restart <app>        # 어떤 프로세스인지 명시
   ```
3. 세션·캐시 초기화 안내 (예: 텔레그램 `/reset` — `--resume` 세션이 옛 도구 목록을 붙잡는다)
4. 롤백 절차를 `_workspace/<주제>/04_operator_rollback.md` 로 남긴다 — **필수 항목은 5-1**
5. 결과를 pleiades 문서에 반영 (`decision-doc`)

### 5-1. 롤백 문서 필수 항목 (#61 · PR #60 Codex 4라운드)

롤백 문서는 아래 **세 시점을 전부** 담는다. 하나라도 빠지면 미완성이다 — 형식 전례는
`_workspace/1a-2/04_operator_rollback.md`(Codex 4라운드 통과본). 모드 S 도 같은 셋이고 base·브랜치 이름만 7절 표를 따른다.
**모드 H 는 PR 이 `main`·`dev` 둘이므로 머지 후 절차도 둘이다** — 대상마다 revert 브랜치·PR 을 따로 내고 **각 대상의 실제 squash SHA** 를 쓴다(같은 수정이라도 두 SHA 는 다르다).
`main` 만 되돌리면 `dev` 에 남은 수정이 다음 릴리즈에서 다시 올라간다 (PR #65 Codex P1).

| 시점 | 필수 명령 (순서대로) | 빠지면 |
|---|---|---|
| **머지 전** | `git checkout <base>` → `gh pr close <n> -R <owner>/<repo> --delete-branch`(PR 이 열려 있으면 — **로컬·원격 브랜치를 함께 지운다**) → 남아 있을 때만 `git show-ref --verify --quiet refs/heads/<branch> && git branch -D <branch>`(PR 을 안 열었거나 `gh` 가 로컬을 못 찾은 경우 · 무조건 `-D` 하면 이미 지워져 스크립트가 중단된다 · PR #65 Codex P2) → 의존성 변경이면 `npm ci` | 열린 PR·원격 브랜치가 남는다 (PR #60 Codex P1 ②) |
| **머지 후** | `git checkout <base> && git pull --ff-only` → **`git checkout -b <revert-branch>`** → `git revert --no-edit <sha>` → `git push -u origin <revert-branch>` → `gh pr create -R <owner>/<repo> --base <base> --head <revert-branch>`(본문 `Refs <issue-repo>#<issue>` · 되돌리기 등급) → **사용자 머지** → **`git checkout <base> && git pull --ff-only`**(revert 브랜치에 머문 채 pull 하면 base 가 갱신되지 않는다 · PR #65 Codex P2) → 의존성 변경이면 `npm ci` | `<base>` 에 직접 revert 커밋·push 하게 된다 — **"머지는 사용자가 직접"은 revert 에도 적용된다** (PR #60 Codex P1 ①·③) |
| **원본 도달분** | **fit 원본 하네스 동기화**가 있었으면 → **되돌려진 트리** 기준으로 `git -C ~/workspace/myFitness archive <reverted-sha> <paths> \| tar -x -C ~/workspace/myFitness` 재실행. `<reverted-sha>` = **revert PR 머지 후의 `integration/pleiades` HEAD**(머지 전이면 원 커밋의 부모 `<sha>^`) — 위 행의 `<sha>`(되돌릴 커밋)를 넣으면 **되돌리려던 하네스를 원본에 다시 푼다**(PR #65 Codex P1). **풀기 전에 되돌리는 커밋이 *추가한* 파일만 원본에서 지운다** — `git -C ~/workspace/myFitness diff --name-only --diff-filter=A <sha>^ <sha> -- <paths> \| xargs -I{} rm -f ~/workspace/myFitness/{}`. `tar -x` 는 아카이브에 없는 파일을 지우지 않으므로 **동기화가 새로 만든 파일이 원본에 남고**, 그 파일을 `git archive` 에 이름 지으면 `<reverted-sha>` 에 없어 pathspec 오류가 난다. **디렉터리를 통째로 `rm -rf` 하지 않는다** — 원본 `.claude/` 에는 `settings.local.json` 같은 **아카이브에 없는 로컬 전용 파일**이 있어 복구할 수 없다(PR #65 Codex 3회차 P1). archive 에는 `<reverted-sha>` 에 **존재하는 경로만** 넣는다. 사전 사본(스크래치 tar)이 살아 있으면 그것을 풀어도 된다(PR #65 Codex P1). **fin 모드 S 미러 PR** 이 있었으면 → 원본 `~/workspace/myFinance` `dev` 에서 **위 머지 후 절차를 한 번 더**(`fix/<fin-issue>-revert` → PR `--base dev` → 사용자 머지) | `integration/pleiades` 만 되돌리고 **세션이 읽는 하네스는 그대로** 남는다 (PR #60 Codex P2 ④ · G-2) |

- **`git revert` 는 즉시 커밋한다** — 브랜치 생성이 반드시 앞선다. 브랜치 없이 revert 하면 `<base>` 로컬이 원격과 갈라진다.
- `<sha>` 는 머지 방식으로 갈린다 — 대상 저장소 PR 은 squash(부모 1개 · myFitness#374 `3818208` 실측)라 그 1커밋, merge commit 이면 `git revert -m 1 <merge-sha>`.
  **머지 전에 쓴 문서는 SHA 자리를 `<머지 SHA>` 로 비워 두고 머지 후 실값으로 채운다** (PR #64 Codex P2). "현재 상태" 표기도 머지 후 갱신한다.
- 되돌리기 **등급은 원본 도달분까지 포함**해 매긴다 — 1a-2 는 worktree 만 보면 즉시, 원본 동기화분은 중간(원본 fit `.claude/` 는 git 이력이 없어 `git archive` 재실행이 유일한 복원 경로).
- 이 항목들은 **승인 게이트(1절) 의 롤백 칸에도 그대로** 들어간다 — 승인 시점 롤백과 집행 후 롤백 문서가 달라지면 승인이 무효다.

> **왜 규칙이 필요한가.** 이전 §5-4 는 *"롤백 절차를 남긴다"* 만 있고 **형식을 정하지 않았다.** 그 결과 1a-2 롤백 문서가
> Codex 4라운드 연속 같은 성격의 결함(로컬 revert 만 · 열린 PR 방치 · push·PR 누락 · 미러 revert 부재)으로 P1 3건·P2 1건을 받았고,
> 앞선 `_workspace/harness/04_operator_rollback.md`(2026-09-07)도 머지 후 절에서 **pleiades 는 `dev` 에서 브랜치 없이 revert 하고, 세 저장소 모두 `gh pr create` 가 없다**(2026-09-14 정정 블록 append · 실행하지 말 것). 나머지는 통과(`harness/04_operator_42_rollback` · `h3fit` · `1a-2`) 또는 해당 없음(`_workspace/04_operator_rollback` 은 배치라 PR 이 없고 · `1a-0` 은 pleiades 만). 되돌리기: 즉시.

> **커밋으로 끝나지 않는다 (PR #6 교차 감사 M5).** 이전 체크리스트는 승인 → 검증 → 커밋
> → 빌드 안내 → 롤백 문서화로 끝나 **9-1 사전 리뷰와 9-2 PR 생성이 빠져 있었다.**
> `repos/**` 는 9-0 표에서 **에이전트 리뷰 필수**(실서비스 영향)다.

## 체크리스트

- [ ] 승인 게이트 5항목 제시 + 명시 승인 수령
- [ ] 착수 직전 재감사 통과 (정정 0)
### 모드 공통

- [ ] **모드를 먼저 확정한다** (7절 표: I 통합 / S 단독 / H 핫픽스). 이후 항목은 모드에 따라 갈린다
- [ ] 작업 경로·base 가 **그 모드의 기대값**이고 clean 임을 확인
- [ ] 변경 → **저장소별 검증 4종 전부**(위 표) 통과 → 커밋
- [ ] **9-1 사전 리뷰 (에이전트 필수 — 대상 저장소는 경로 무관 실서비스 영향)** → `critical`/`major` = 0
- [ ] **9-3 봇 리뷰 → 9-4 루프**(봇 수정 시 **8절 검증 재실행 + 9-5 회귀 테스트**) **→ 9-6 PR body 확정.** 봇 `P0`/`P1` = 0
- [ ] **머지는 사용자가 직접**

### 모드 I — 통합 (저장소 1개 또는 2개 · PR 은 `integration/pleiades` 로)

> **저장소 수는 변경의 성격이 정한다 (PR #26 Codex P1).** pleiades 발 변경이 전부 모드 I 가 되면서 **한 저장소만 바꾸는 모드 I**
> (예: H-4 fit tracked 화)가 정상 경로가 됐다. 아래 "저장소 B" 항목은 **대칭 변경일 때만** 적용한다 — 무관한 변경을 지어내 두 번째 PR 을 만들지 않는다.

- [ ] 저장소 A → 검증 → 커밋 → 9-1 (단독이면 여기서 PR 로)
- [ ] **(대칭 변경만)** A 가 통과했을 때만 저장소 B → 검증 → 커밋 → 9-1
- [ ] **9-2 PR 생성** — `--base integration/pleiades`.
      **대칭 변경이면 PR 2개**(`Refs <issue-repo>#<issue>`, **`Closes` 금지**)
- [ ] 대칭 변경은 **PR 2개 모두 머지된 뒤** 이슈를 닫는다
- [ ] **이슈는 수동으로 닫는다** — base 가 `integration/pleiades` 라 `Closes` 가 자동 실행되지 않는다 (#27)
- [ ] 머지 후 `repos/<repo>` worktree 를 `git pull --ff-only`. 원본 체크아웃을 `dev`/`main` 으로 되돌렸다면 **tracked 화된 파일이 지워지지 않았는지 확인**하고 `git archive … | tar -x` 로 복원 (#27)

### 모드 S — 단독 (저장소 **1개** · PR 은 그 저장소 `dev` 로)

- [ ] **두 번째 저장소를 요구하지 않는다.** 한쪽만 바꾸는 것이 이 모드의 정의다
- [ ] **9-2 PR 생성** — `--base dev`(그 저장소), `Closes <issue-repo>#<issue>`
      (`<issue-repo>` = **그 대상 저장소**)

### 모드 H — 핫픽스 (저장소 **1개** · PR **2개**: `main` + `dev`)

- [ ] `hotfix/<issue>-<n>` 을 그 저장소의 **`main`** 에서 분기
- [ ] **9-2 PR 2개 생성** — `--base main` 과 `--base dev`.
      **양쪽 모두 `Refs <issue-repo>#<issue>`, `Closes` 금지**
- [ ] **양쪽 머지 후** 이슈를 수동으로 닫는다 (긴급 수정 절 5번)

> **체크리스트가 모드를 무시하면 표가 무의미하다 (PR #6 Codex 리뷰 P1).**
> 이전 체크리스트는 **무조건 저장소 2개**를 요구하고 **PR base 를 `integration/pleiades` 로
> 고정**했다. 모드 S 는 정당한 단독 변경이 막히거나 `dev` 대신 통합 브랜치로 가고,
> 모드 H 는 `main`+`dev` 두 PR 이 필요한데 통합 PR 하나로 끝났다.
- [ ] 빌드·재시작·세션 초기화 명령 사용자에게 전달
- [ ] 롤백 절차 문서화 — **5-1 세 시점(머지 전 · 머지 후 revert 브랜치→PR · 원본 도달분) 전부**. 머지 후 SHA 실값 채움
- [ ] pleiades 문서에 결과 반영

## 에러 대응

| 상황 | 대응 |
|---|---|
| base 가 **그 모드의 기대값**(7절 표)과 다름 / dirty | 사용자에게 보고. 임의로 stash·checkout 하지 않는다 |
| 검증 실패 | 되돌리고 원인 보고. 실패한 채 다음 저장소로 넘어가지 않는다 |
| 한쪽만 성공 | 성공분 롤백 여부를 사용자에게 묻는다 |
| 계획에 없던 파일 수정 필요 | **즉시 중단.** 범위 변경은 승인 사항 |
| 배포 후 이상 | 롤백 절차 실행 안내. 원인 분석은 그 뒤 |
