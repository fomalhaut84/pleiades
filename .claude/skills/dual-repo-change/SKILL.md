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
| **I** 통합 | 통합 단계(1a 등) | `repos/*` worktree | `integration/pleiades` | **전부** |
| **S** 단독 | 그 저장소만의 평시 변경 | **원본** | 그 저장소 `dev` | 승인 게이트 · 착수 직전 재감사 · 저장소별 검증 · 롤백 문서화 |
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

### 롤백
```bash
<정확한 명령>
```
소요: <시간>

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

공통:
- **pleiades 통합 작업의 base 는 `dev` 가 아니라 `integration/pleiades` 다.**
  작업은 `~/workspace/pleiades/repos/<repo>` **worktree** 에서 하고,
  `integration/pleiades-<단계>` 를 따서 **`integration/pleiades` 로 PR** 한다.
  `integration/pleiades` → `dev` PR 은 **1a 전체가 끝난 뒤 한 번**이다.
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
| 테스트 | vitest 있음 (`test` 는 watch — **`test:run` 을 쓴다**) | vitest **없음**. 단 `npm run test` = **verify 스크립트 2개**이므로 **반드시 돌린다** (1a-2 가 vitest 도입) |
| 같은 역할 다른 위치 | 아웃바운드 전송: `bot/utils/telegram.ts` | 아웃바운드 전송: `bot/notifications/send.ts` |

> **검증 명령은 `.claude/rules/workflow.md` 8절 표가 정본이다** (PR #6 Codex 리뷰 P1).
> myFitness 의 `npm run test` 는 vitest 가 아니라 **verify 스크립트 2개**다 — 테스트 프레임워크가
> 없다는 것과 **실행할 것이 없다는 것은 다르다.** 1a-2 가 vitest 를 도입하기 전에도 반드시 돌린다.

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
4. 롤백 절차를 `_workspace/NN_operator_rollback.md` 로 남긴다
5. 결과를 pleiades 문서에 반영 (`decision-doc`)

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

### 모드 I — 통합 (저장소 2개 · PR 은 `integration/pleiades` 로)

- [ ] 저장소 A → 검증 → 커밋 → 9-1 → **통과했을 때만** 저장소 B
- [ ] 저장소 B → 검증 → 커밋 → 9-1
- [ ] **9-2 PR 생성** — `--base integration/pleiades`.
      **대칭 변경이면 PR 2개**(`Refs <issue-repo>#<issue>`, **`Closes` 금지**)
- [ ] 대칭 변경은 **PR 2개 모두 머지된 뒤** 이슈를 닫는다

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
- [ ] 롤백 절차 문서화
- [ ] pleiades 문서에 결과 반영

## 에러 대응

| 상황 | 대응 |
|---|---|
| base 가 **그 모드의 기대값**(7절 표)과 다름 / dirty | 사용자에게 보고. 임의로 stash·checkout 하지 않는다 |
| 검증 실패 | 되돌리고 원인 보고. 실패한 채 다음 저장소로 넘어가지 않는다 |
| 한쪽만 성공 | 성공분 롤백 여부를 사용자에게 묻는다 |
| 계획에 없던 파일 수정 필요 | **즉시 중단.** 범위 변경은 승인 사항 |
| 배포 후 이상 | 롤백 절차 실행 안내. 원인 분석은 그 뒤 |
