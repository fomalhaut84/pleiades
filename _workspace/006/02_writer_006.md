# 006 — 모노레포 먼저: 두 서비스를 이력째 pleiades 로 가져오되 서비스에는 닿지 않는다

작성 2026-09-30 · 상태 ~~**초안 1회차 — 감사 전**~~ ~~**초안 2회차 — 감사 1회(정정 19 · 블로커 2) + 실측 2회차 + 사용자 결정 4건 반영 · 재감사 대기**~~ **초안 3회차 — 감사 r2 `_workspace/006/03_auditor_006_r2.md`(이하 [A2] · 정정 11 · 블로커 1) §7 목록 10항목을 감사 문구대로 직접 반영 · 재감사 없이 정본(#37 전례)** (`decision-writer` · 이슈 #97)
정본 예정 경로: `docs/specs/006-monorepo-first.md` — **이 파일은 정본이 아니다.** 재감사(`reversibility-auditor`) → 사용자 결정 → 정본 순서.
입력: 이슈 #97(사용자 결정 · 원칙) · 실측 `_workspace/006/01_surveyor_monorepo.md`(이하 **[S]**) · **`_workspace/006/01_surveyor_monorepo_r2.md`(이하 [S2] · 2회차)** · **감사 `_workspace/006/03_auditor_006.md`(이하 [A] · 2회차)** · `docs/research/measured-facts.md` 2026-09-30 모노레포 절 ·
002 §4 · 003 §1-1·§2·§5-2·§10·§10-1 · 004 §2-3·§2-4·§3-2 · 005 §4-5 · `.claude/rules/workflow.md` 브랜치 전략·5·7·8절 · `_workspace/1a-3/`(계획 3회차 · 감사 2회) · 이슈 #82·#88·#95·#96.

> **숫자 규율.** 이 문서의 숫자는 전부 [S]·[S2]·[A] 와 기존 정본의 **인용**이다. 초안 작성자가 직접 확인한 것은 **설정·파일 구조 3건**(§3-2 · 감사 C1~C3 로 확인됨)뿐이다. 소요 시간은 적지 않는다(005 R2). 없는 값은 **미측정**으로 적는다.
> **1회차 서술은 지우지 않았다.** 바뀐 자리는 ~~취소선~~ 또는 `> **정정 (2회차 · [A] <번호> / U97-<n>).**` 블록이다.

---

## 0-0. 변경 이력 — 2회차에서 무엇이 바뀌었나

### 0-0-0. 3회차 — 감사 r2 §7 직접 반영 (재감사 없음 · #37 전례)

| [A2] §7 # | 항목 | 반영 위치 |
|---|---|---|
| 1 | **B1 (블로커)** — "`CLAUDE_BIN` 비움 → 로컬 advisor 안 돈다" 는 두 앱 모두 불성립(fit PATH `claude` 폴백 · fin `'claude'` 하드코딩). L-7 · I-8 을 fit 없는 경로 + fin PATH shim 으로 · fin `mcp-config.json` 4210 하드코딩 병기 | §3-1 ⑯ · §4-0 M-4 · §4-6 L-3·L-7 · §5 I-8 |
| 2 | R1 — 게이트 정규식 5종(대소문자 무시 · callback 과 별도 구현 · Python/perl) · `/#N` fin 3 · fit 3 잔존 → [S2] "남은 `#N` 0" 은 틀림 · 호스트 없는 URL 형식(다섯째 형식) | §3-1 ⑱ · §4-3 치환 표·게이트 · §9 measured-facts |
| 3 | R2 — X11 **확인**(렌더 links=0) · 위험 범위 정정: 틀리면 pleiades 잡음(편도) · 서비스 영향 없음 | §3-3 X11 · §4-0 M-1 · §4-3 · §10 |
| 4 | R3 — **가드 C**(동기화 PR squash 머지 감지) + 복구(`-s ours` PR) · 가드 A·B 동작 확인 | §4-3 · §4-S · §5 I-15 · Q67 신설 |
| 5 | R4 — filter-repo 는 `(cd "$T/…" && …)` 로만 · 스크립트가 `realpath "$T"` 가 pleiades 밖인지 먼저 검사 | §4-3 명령 골격 · §5 I-21 |
| 6 | R5 — Q66 핀 = `git-filter-repo==2.47.0`(pip) · `a40bce548d2c` 는 `--version` 출력 · git 은 venv 고정 불가 → 드리프트는 가드 B 가 잡는다 | §3-1 ⑤ · §4-1 · §4-S · Q66 |
| 7 | R6·R7 — 실효 env 사전 검사 · `env -u` · `apps/*/.env.*` 부재 · `prisma migrate dev` 파괴 목록 · 검증 봇 id 허용 목록·두 앱 다른 봇 | §4-6 L-1·L-2·L-4·L-9 · §5 I-4·I-14 |
| 8 | R8 — `claudeMdExcludes` 는 CLAUDE.md·rules 만 · skill·agent 차단 수단 미확인 · 실제 방어선은 룰 한 줄 + I-19 훅 | §5 I-10 · Q58 |
| 9 | R9 — 훅: `gh api graphql` 은 `mutation` 포함 시 거부 · `--method`·`-XPOST` 붙여 쓰기 형태 매칭 | §4-1 · §5 I-1 |
| 10 | R10 — §9 누락 ① `.claude/settings.json` 행 ② measured-facts X2 정정 · ③ 사용자 메모리 `feedback_service_isolation.md` 충돌 통지 → **해소**(오케스트레이터가 2026-09-30 세션에서 새 원칙으로 갱신 · §9 에 넣지 않는다) | §9 |
| — | [A2] §6 F3 → 미결 **Q67**(동기화 PR 만의 별도 규칙) | §6 |

### 0-0-1. 결론이 바뀐 것

| # | 1회차 | 2회차 | 근거 |
|---|---|---|---|
| **1** | Q49 권고 "★X1 = 0 이면 (a) subtree 이력 포함" | **(a) 탈락.** 서비스 dev 메시지에 저장소 한정 참조 3(`Closes fomalhaut84/myFinance#494` · `fomalhaut84/myFitness#108` · `Refs fomalhaut84/pleiades#51`)이 있고, 커밋 참조의 `referenced` 이벤트는 **push 시점**에 생긴다 → push 하는 순간 myFinance#494·myFitness#108 타임라인에 이벤트(편도 · 원칙 위반). **사용자 결정 U97-5 = filter-repo 재작성** | [A] B1 · [S2] X1 |
| **2** | (c) "`#N` → `fomalhaut84/myFinance#N` 을 코드 스팬으로" · Q56 "코드 스팬" | **역효과였다** — 커밋 메시지의 코드 스팬이 참조 추출을 막는다는 근거가 없고, 그 문안대로면 한정 없는 `#N` 3,276건(fin 1,331 · fit 1,945)이 **서비스 한정 참조**로 바뀐다. → **모든 자동 링크 형식을 소유자 없는 비링크 형식(`fin#N`·`fit#N`)으로 + push 전 grep-0 게이트** | [A] B2 · U97-5 |
| **3** | "서비스 접촉 0 (https 읽기)" | **"서비스 쓰기 0 · 운영 영향 0 · 관측 흔적(소유자 traffic 통계) 허용"** — 사용자가 경계로 확정 | [A] N4 · **U97-6** |
| **4** | "봇 기동은 D-4 에 포함하지 않는다" · Q53 "M-4 에서 발급 안 함" | **사용자 결정을 좁힌 것이었다.** M-4 에 **검증 봇 기동 포함** · 토큰은 사용자가 BotFather 로 발급(두 앱 · 검증 채팅). **Q53 소진** | [A] N7 · **U97-7** |
| **5** | L-1 "로컬 postgres 에 앱별 빈 DB" (위치 미정) · M-2 "`DATABASE_URL` 로컬 빈 DB 또는 더미" | **fin build 는 스키마 DB 를 요구한다**(더미 rc 1 · 모노레포 무관 · 스키마 적용 후 rc 0). DB = **기존 5432 인스턴스에 새 DB `pleiades_fin`·`pleiades_fit`**(사용자 결정 · 감사 권고 `initdb` 불채택). `pleiades_fin` 준비를 **M-2 로 올린다** | [A] N6·N10 · [S2] X3·X9 · **U97-8** |
| **6** | I-10 "`claude-with` 가 `apps/*` 를 붙이지 않는다" 로 차단 | **래퍼 차단은 무효** — 추적되는 `apps/*` 파일을 읽으면 중첩 `CLAUDE.md`·rules 가 **지연 로드**되고 skill 도 발견된다. 위험의 실체는 "서비스 쓰기 유도" 가 아니라 **cwd 기준 명령**(`apps/*/deploy/deploy.sh` 를 pleiades 에서 실행하면 pleiades 작업트리를 `checkout -f`) | [A] N5 · [S2] X10 |
| **7** | (b) `--squash` "★X1 위험 없음" | `pull --squash` 는 범위 서비스 커밋 **제목을 전부** 메시지에 넣는다 → (b) 도 메시지 게이트 필요 | [A] N1 |
| **8** | (c) 전제 "서비스 dev 이력은 재작성되지 않는다" (암묵) | **서비스 dev 는 force-push 무보호**(ruleset `[]` · `protected:false` · 두 저장소). pleiades 는 막을 수 없고 **감지만** 한다 → 조상 가드 | [A] N2 |
| **9** | ALT-d 위임 키·`prepare` "소비자 0 → 삭제 별도" | **`prepare`(또는 명시 빌드)는 M-5 의 하중 요소** — 루트 `npm ci` 를 빼면 `packages/notify/dist` 가 없어 fit typecheck rc 2 · test·build rc 1. 삭제 후보는 **위임 키뿐** | [A] N8 · [S2] X3 |

### 0-0-2. 감사 정정 19건 반영 위치

| [A] # | 반영 | 어디 |
|---|---|---|
| B1 · B2 | Q49 (a) 탈락 · (c) 치환 규칙 교체 · grep-0 게이트 · Q56 비링크 | §4-3 · §4-S · §5 I-2 · §6 |
| N1 | (b) 메시지 게이트 | §4-3 표 |
| N2 | 조상 가드 2종 · force-push 시 등급 | §4-3 · §4-S · §5 I-15 |
| N3 | 편도 근거 교체(ruleset → PR ref 객체 보존 + `referenced` 이벤트) | §4-0 · §4-3 |
| N4 | 원칙 경계 문구 | §0 · §4 · §5 I-13 |
| N5 | I-10 재작성 · deploy 경로 | §5 I-10 · I-19 · Q58 |
| N6 | fin 스키마 DB 를 M-2 로 · 8절 fin 선행 · measured-facts 정정 표시 | §4-4 · §9 |
| N7 | M-4 봇 기동 포함 | §4-6 · Q53 소진 |
| N8 | `prepare` 하중 · L2 루트 `npm ci` 선행 | §4-4 · §4-7 · §9 |
| N9 | CI paths 필터와 필수 체크 충돌 · M-5 후 트리거 | §4-5 · Q52 |
| N10 | 5432 · `.env.example` 복사 경로 · worktree `.env` · 3000 | §4-6 · §5 I-14 |
| N11 | worktree 제거 = 사용자 단독 · 사실 명시 | Q54 |
| N12 | M-5 검증 = 봇 기동 | §4-7 |
| N13 | 훅은 메서드·필드 플래그 검사 · secrets 점검은 로컬 `gh` | §4-1 · §5 I-1·I-9 |
| N14 | `--no-tags` · 릴리즈 태그 push 명시 | §4-S · §5 I-16 · §9 |
| N15 | 테스트 저장소 불필요 — 승인 항목 제거 | §4-2 |
| N16 | §9 누락 16 | §9 |
| N17 | D-1~D-4 → **U97-n** | §2 전체 |
| C12 | (c) 모노 pack **11.45 MiB** 분리 | §3-1 ① |

---

## 0. 한 줄 요약

~~**두 서비스의 `dev` 를 GitHub 에서 읽기만 해서 `apps/{finance,fitness}` 로 이력째 들여오고, 이후에도 읽기만 해서 주기적으로 따라간다. 서비스 저장소·서버·봇·계정·DB 에는 어떤 목적으로도 닿지 않는다.**~~
**두 서비스의 `dev` 를 GitHub 에서 읽기만 해서, pleiades 밖 스크래치에서 `git filter-repo` 로 경로(`apps/<app>/`)와 메시지(자동 링크 → 비링크)를 재작성한 뒤 `apps/{finance,fitness}` 로 이력째 들여오고, 이후에도 같은 방식으로 주기적으로 따라간다. 서비스 저장소 쓰기 0 · 운영 영향 0 — 허용되는 흔적은 소유자 traffic 통계뿐이다(U97-6).** 첫 목표는 가져온 두 앱이 **pleiades 안에서(CI·로컬 · 검증 봇 포함)** 서비스와 같은 상태로 도는 것이고, notify(텔레그램) → Discord 는 그 뒤에 pleiades 안에서만 한다. **pleiades 가 서비스를 대체하는 전환(cutover)은 이 문서의 범위 밖**이다(§8).

---

## 1. 무엇이 바뀌었나

### 1-1. 전제가 깨졌다 — 2026-09-30 사용자 결정

> "myFitness, myFinance는 현재 독립적으로 실행하게 두고 플레이아데스에서 테스트가 필요하다면 그건 플레이아데스 내부적으로 테스트를 하는거야. 플레이아데스는 절대 지금 서비스중인 두 서비스를 어떤 목적으로도 영향을 주면 안되."
> — 사용자, 2026-09-30 (이슈 #97)

| # | 이전 전제 | 깨진 방식 | 출처 |
|---|---|---|---|
| **P1** | 단계 4(모노레포)는 **도메인 #3(캘린더)을 붙일 때** 들어간다 (002 §4) | **앞당긴다.** 첫 목표가 "두 앱이 pleiades 에서 도는 것" 이 됐다 | ~~#97 결정 4~~ **U97-4** |
| **P2** | pleiades 발 변경은 서비스 저장소의 `integration/pleiades` 로 간다 (workflow.md 7절 모드 I · #25) | **서비스 저장소에 쓰지 않는다.** 그 브랜치조차 쓰기다 | #97 원칙 |
| **P3** | 1a 는 **git 의존성**(`git+https://…pleiades.git#<ref>`)으로 서비스 저장소가 패키지를 소비하고, 서버 병행 인스턴스(β2)로 검증한다 (003 Q15 · Q42 · Q44) | 소비자가 **서비스 저장소가 아니라 pleiades 안의 `apps/*`** 가 된다. 서버는 쓰지 않는다 | **U97-4** · 원칙 |
| **P4** | 서비스 `dev` 를 따라가는 경로 = 서비스 저장소 안에서 `dev` → `integration/pleiades` 머지 PR (#70) | **서비스 저장소 밖(pleiades)에서** 읽기 전용 fetch 로 받는다 | **U97-2** |
| **P5** | 기존 산출물(`integration/pleiades` · `repos/*` · 이관 이슈)이 작업 표면이다 | **동결.** 삭제는 별도 결정 | **U97-3** |

### 1-2. 이 문서가 대체하는 것과 대체하지 않는 것

**대체한다:** 002 단계 4 의 진입 조건 · 003 의 배포·소비·검증 경로(git dep · Q48 · β2 · 1a-3/1a-4 의 대상 저장소 절차) · 004 의 worktree 작업 표면 · workflow.md 의 모드 I·`dev 수용` 행 · 이관 이슈 정책(#83).
**대체하지 않는다:** 002 의 목표(개인 비서 플랫폼 · Q1·Q5·Q6) · 003 의 **패키지 설계**(L3 · §4-2 시그니처 · Q10·Q19·Q25·Q26 · 1a-1 산출물) · 003 **1a-3 계획의 코드 결정**(1a-3 계획의 D-1~D-4 · U-3 동작 변경 묶음 · U-5) · 005 의 pleiades 하네스 자체. **001~005 는 하나도 지우지 않는다** — 정정·소진 블록만 붙인다(§9).

> **정정 (2회차 · [A] N17).** 1회차는 이 문서의 결정을 **D-1~D-4** 로 적었는데, 같은 기호가 1a-3 계획(D-1~D-4 구현 결정)과 003 §4-2(1a-1 D-1~D-4)에 이미 있다. **이 문서의 결정은 `U97-<n>` 으로 부른다.** 1a-3 계획의 D-1~D-4 는 그 이름 그대로다.

---

## 2. 확정된 답

| | 질문 | 답 | 근거 |
|---|---|---|---|
| ~~D-1~~ **U97-1** | 가져오기 | **이력 포함** ~~**(`git subtree`)**~~ → `apps/*` — **방법은 U97-5 가 개정** | 사용자 2026-09-30 · #97 |
| ~~D-2~~ **U97-2** | 서비스 추종 | **정기 수용** — 서비스 `dev` 를 읽기 전용 fetch → pleiades 안에서 머지. 서비스 저장소에는 쓰지 않는다 | 〃 |
| ~~D-3~~ **U97-3** | 기존 작업물 | **동결** — 서비스 저장소 `integration/pleiades` · `repos/*` worktree · 이관 이슈 7건 그대로(삭제는 별도 결정). myFitness#504 닫음 · #95 보류 | 〃 |
| ~~D-4~~ **U97-4** | 첫 목표 | **가져온 두 앱이 pleiades 에서 도는 것**(CI lint/typecheck/test/build + 로컬 별도 DB·**검증 봇**) → 그 다음 notify 통합(텔레그램) → Discord | 〃 |
| **원칙** | 서비스 영향 | **어떤 목적으로도 0.** 서비스 저장소 쓰기·PR·서버 사용 전부 금지. 테스트는 pleiades 내부(로컬·CI)만 | 〃 |
| **U97-5** *(2회차)* | **가져오기 방법** | **`git filter-repo` 재작성**(U97-1 의 "`git subtree`" 를 사용자가 변경). 조건: ① 경로 `apps/<app>/` ② **모든 자동 링크 형식**(`#N` · `owner/repo#N` · 이슈/PR URL · `GH-N`)을 **비링크 형식**으로(`fin#N`·`fit#N` 류 · **소유자 포함 형식 금지**) ③ **push 전 grep-0 게이트**(재작성본 `git log --format=%B` 에 네 형식 0) — **3회차 · [A2] R1: 게이트는 다섯 형식**(호스트 없는 URL 형식 추가 · 대소문자 무시 · §4-3) ④ **조상 가드**(서비스 dev 무보호 대비) ⑤ filter-repo·git 버전·옵션 **고정 기록** ⑥ **서비스 원 SHA 트레일러** ⑦ `--no-tags` ⑧ `@멘션` 무해화는 **선택지로 남긴다**(Q62) | 사용자 2026-09-30 · [A] B1·B2·N2·N14 |
| **U97-6** *(2회차)* | **원칙 경계 — 읽기** | **서비스 저장소 https 읽기 허용** — 소유자 traffic 통계에 흔적이 남는 것은 영향으로 보지 않는다. 경계: **"쓰기 0 · 운영 영향 0 · 관측 흔적 허용"** | 사용자 2026-09-30 · [A] N4·F1 |
| **U97-7** *(2회차)* | **M-4 의 검증 봇** | **M-4 에 검증 봇 기동을 포함한다.** 사용자가 BotFather 로 토큰 발급(두 앱 · 검증 채팅). **Q53 소진** | 사용자 2026-09-30 · [A] N7·F5 |
| **U97-8** *(2회차)* | **로컬 DB 위치** | **기존 5432 인스턴스에 새 DB 두 개**(감사 권고 `initdb` 불채택). 조건: 이름은 서비스 기본값(`myfinance`·`myfitness` — `.env.example`)과 겹치지 않게 — **`pleiades_fin`·`pleiades_fit`** · **기존 DB 무접촉**(생성·삭제는 그 두 이름만) · `.env.example`·원본/worktree `.env` **복사 금지** · 되돌리기 = `DROP DATABASE` 두 개(**즉시**) | 사용자 2026-09-30 · [A] N10·F6 |

> ~~**D-1 은 실측이 흔든다(§3-1 ②·§6 Q49).** "이력 포함" 의 목적이 `log`/`blame` 이라면 `git subtree` 는 그 목적을 경로 단위로 달성하지 못한다([S] §3). 결정을 뒤집자는 것이 아니라 **같은 결정 안의 방법 선택**을 다시 묻는다.~~
> **정정 (2회차 · U97-5).** 다시 물었고 답을 받았다 — **filter-repo 재작성.** 경로 이력(`log` 19/32 · `blame` 16/28)이 서비스와 같게 살아난다([S2] X2). 대가: **서비스 SHA 가 pleiades 이력에 남지 않는다** → 수용 머지 커밋의 트레일러(U97-5 ⑥)가 대응표다.

---

## 3. 실측 근거

### 3-1. [S]·[S2] 에서 이 문서가 쓰는 값 (인용만 · 대장)

| # | 값 | 출처 |
|---|---|---|
| ① | 가져오기 후 pack **1.1 → 11.81~12.15 MiB**(subtree 이력 포함) · **8.80 MiB**(`--squash`) · 커밋 48 → 820(add) → 822(pull 2) · squash 는 56. **(c) filter-repo 재작성 두 앱 모노 pack(gc) 11.45 MiB · 821 커밋**(2회차 · [A] C12 — 1회차 값과 **다른 측정**) | [S] §3 · [S2] X2 |
| ② | ~~**이력 포함인데 경로 이력은 끊긴다**~~ **subtree 는 경로 이력이 끊긴다** — `git log -- apps/finance/package.json` **1**(서비스 **19**) · `--follow` **0** · `blame` **1** 커밋(서비스 **16**). **filter-repo 재작성은 이어진다 — `log` fin 19 · fit 32 · `blame` fin 16 · fit 28 = 서비스와 동일** | [S] §3 · [S2] X2 |
| ③ | `HEAD:apps/<a>` == 서비스 `dev^{tree}` **YES ×2**(subtree · filter-repo 둘 다) · 루트 충돌 **0**(재작성본 루트는 `apps` 만) | [S] §3 · [S2] X2 |
| ④ | GitHub https URL 로 리모트 등록·자격 증명 없이 읽힌다 | [S] §3 |
| ⑤ | ~~`subtree pull` = 2-parent 머지 · 서비스 dev SHA 가 조상이 된다~~ (subtree 탈락). **filter-repo 는 결정적**(두 번 실행 tip 동일 · fit `2110825` · fin `71f7c4e`) · **증분 성립**(dev~5 재작성 tip 이 최신 재작성본의 조상 → 일반 merge 로 +5 · 충돌 0) · 조건: **같은 filter-repo 버전·옵션·callback + 서비스 dev 이력 무재작성** · 실행 < 1 s · filter-repo 는 메시지 안 커밋 해시 약어도 새 SHA 로 바꾼다(결정적) · 측정 버전 `a40bce548d2c`(스크래치 venv) · **시스템에는 미설치** · **정정 (3회차 · [A2] R5):** 스크래치 venv `pip show git-filter-repo` = **`2.47.0`** · `a40bce548d2c` 는 `--version` 출력(pip 핀 불가). git = Apple Git 2.50.1(venv 고정 불가 · CLT 업데이트로 변동) | [S2] X2 · [A2] R5 |
| ⑥ | 이력 비밀값(정규식 12종) **0 / 0** · `.env` 커밋 이력 0 / 0 · 세 저장소 모두 **PUBLIC** — 새로 공개되는 이력 없음. 한계: 엔트로피 검사 없음 · 도달 가능 객체만 | [S] §2 |
| ⑦ | `apps/*/.github/` 는 **동작 0** · 루트로 올리면 이름 충돌 **2** · `deploy.yml` 트리거 `release: published` + `workflow_dispatch` · pleiades Actions secrets **0** | [S] §4 |
| ⑧ | fin `.claude/` **tracked 16 + `CLAUDE.md`** 가 `apps/finance/` 로 들어온다 · fit 은 **0**. **2회차: 추적되는 `apps/*` 파일을 읽으면 중첩 `CLAUDE.md`·`.claude/rules` 가 지연 로드되고 중첩 skill 도 발견된다**(시작 시에는 로드되지 않음 · 1회 실험 · 모델 자기 보고 · Claude Code 2.1.285). fin 추적 하네스: skill 7(`release-publisher` 포함) · agent 4(`release-manager` 포함) · rule 5 · `CLAUDE.md`(`./deploy/deploy.sh dev` 지시) | [S] §4 · [S2] X10 · [A] N5 |
| ⑨ | 주버전 충돌 **3**: `next` 15↔16 · `eslint` 8↔9 · `eslint-config-next` 15↔16 · `overrides` fin **3** · fit **16** | [S] §5 |
| ⑩ | 앱별 `npm ci` node_modules 합 **1,545 MB** · workspaces `npm install`(lock 새로 생성) **1,160 MB** · 937 패키지 | [S] §5 |
| ⑪ | workspaces lock 을 새로 만들면 서비스 lock 과 갈라진다 — fin **221**(직접 의존 21) · fit **242**(직접 의존 22) · 시드 병합은 **미측정** | [S] §5 |
| ⑫ | **npm 은 workspace 하위 `overrides` 를 무시한다** — 보안 override **19**(3+16) 루트 병합 필요 · `$` 참조는 뜻이 바뀐다 | [S] §5 |
| ⑬ | EBADENGINE 7(`>=20.19.0`) — 로컬 node 20.18.0 만 해당 | [S] §5 |
| ⑭ | **fit 웹은 기동만으로 Garmin 싱크 cron 을 등록한다** + sweeper 2 · fin 웹은 cron 0 · `SYNC_CRON` 은 끄는 env 가 아니다 | [S] §6 |
| ⑮ | **서비스 봇 토큰으로 두 번째 long polling 을 하면 `getUpdates` 409 로 서비스 봇 수신이 끊긴다** — 문서화된 동작 · 실측하지 않음 | [S] §6 |
| ⑯ | 외부 계정 env: fin `WHOOING_WEBHOOK_URL` · fit **`GARMIN_EMAIL`·`GARMIN_PASSWORD`** · `MFDS_API_KEY` · AI `claude -p`/`CLAUDE_BIN` · **3회차 · [A2] B1:** fit `src/lib/ai/claude-advisor.ts:28` `const CLAUDE_BIN = process.env.CLAUDE_BIN \|\| "claude"` → 빈 값이면 PATH `claude` 폴백. fin 은 `:758`·`:814` 에서 `'claude'` 하드코딩 + `spawn('sh', ['-c', cmd])` — `CLAUDE_BIN` 미사용. 호출부: fin 봇 `briefing`·`active-review`·`monthly-report`·`ta-signal-alert`·`/ai`·`expense`. fin `src/lib/ai/mcp-config.json` 은 `http://127.0.0.1:4210/mcp` 하드코딩(`MCP_PORT` 무시) | [S] §6 · [A2] B1 |
| ⑰ | `integration/pleiades` ↔ 서비스 `dev` 의 `src/`·테스트·`package.json` 차이 **0 / 0** · 1a-2 는 이미 서비스 dev 에 있다 · 1a-3 = fit `fd8b7c5`(`src/` 8 재사용 · `package.json`/lock 2 폐기) | [S] §7 |
| **⑱** *(2회차)* | **서비스 dev 커밋 메시지의 참조** — 닫기 키워드 fin 42(한정 없음 41) · fit 34 · **∩ pleiades 열린 이슈 0**(fit 키워드 번호 10개는 pleiades 에 있는 번호지만 전부 closed) · **저장소 한정 참조 3**(fin 2 커밋: `Closes fomalhaut84/myFinance#494` · `Refs fomalhaut84/pleiades#51` · `fomalhaut84/myFitness#108`) · 모든 `#N` fin **1,331** · fit **1,945** · URL 참조 0 · `GH-N` 0 · 키워드 없는 `#N` 중 pleiades 열린 번호와 같은 것: #82 는 fin 에서 18회 등. **3회차 · [A2] R1:** 서비스 메시지에 호스트 없는 형식 0 · `gh-N`(대소문자 무관) 0 · **`/#N` fin 3 · fit 3** — [S2] callback `(?<![\w/])#` 이 건너뛰어 `fr_a` 에 `/#383`·`/#407` 잔존 → **[S2] "남은 `#N` 0" 은 틀림**. 렌더 API `links=`: `fomalhaut84/myFinance/pull/494`(호스트 없음) **1**(myFinance 대상 · 다섯째 형식) · `gh-51`/`Gh-51` 1 · `FOMALHAUT84/PLEIADES#51` 1 · `www.github.com/…/issues/51`(`#issuecomment-1` 포함) 1 · `fin/#51`·`x:#51`·`.#51`·`fin-#51`·`fin #51` 1 | [S2] X1 · [A] B1·B2 · [A2] R1 |
| **⑲** *(2회차)* | GitHub 문서: 커밋 메시지 닫기 키워드는 **기본 브랜치에 머지되면** 이슈를 닫는다 · 다른 저장소는 `OWNER/REPO#N` 형식 · **`referenced` 이벤트는 커밋이 push 된 저장소를 기준으로 생긴다**(issue-event-types — push 시점 · PR 브랜치 push 포함) · 파일 안의 참조는 자동 링크를 만들지 않는다 | [S2] X1 · [A] B1·B2 |
| **⑳** *(2회차)* | **서비스 `dev` 는 무보호** — `rules/branches/dev` → `[]` · `branches/dev` → `protected:false`(두 저장소) | [A] N2 |
| **㉑** *(2회차)* | **8절 4종(앱별 lock · 스크래치 모노):** fin lint·tsc·test(**50 파일 866**) 통과 · **build 는 더미 DB 로 rc 1**(prerender 가 Prisma 호출 · 추출본도 같음 → 모노레포 무관) · **스키마 적용 DB(migrate 27)면 rc 0** · fit **4/4**(더미 DB · test 63 파일 433 + verify 5). 두 앱 Next build 에 *"multiple lockfiles"* 추론 경고(실패 아님) | [S2] X3 |
| **㉒** *(2회차)* | **`file:../../packages/notify` + 1a-3 src(fit)** — lock 에 `link:true` · `npm ci` 심링크 유지 · typecheck·lint·test(**442**)·build **전부 rc 0** · esbuild bot 번들에 **인라인**. **선행: `packages/notify/dist` 가 있어야 한다** — 루트 `npm ci`(`prepare`)를 빼면 rc 127 → fit typecheck rc 2 · test·build rc 1 | [S2] X3 · [A] N8 |
| **㉓** *(2회차)* | 최근 90일: fit 1a-3 대상 6 파일 → **4 커밋**(전체 158) · fin 1a-4 대상 19 파일 → **17 커밋**(전체 59) | [S2] X7 |
| **㉔** *(2회차)* | 로컬 postgres 15.14 가 **127.0.0.1:5432 · [::1]:5432 리슨** · `.env` 가 원본 fin·fit · worktree fin·fit **4곳 모두 존재**(내용 미열람) · `.env.example`: fin `…@localhost:5432/myfinance` · `PORT=4100` · fit `…:5432/myfitness` · `PORT=4200` · `next dev` 기본 3000 | [S2] X9 · [A] N10 |
| **㉕** *(2회차)* | pleiades `vulnerability-alerts` 404 · `automated-security-fixes enabled:false`(Dependabot 꺼짐) · 서비스 태그 fin 27 · fit 85 · `traffic/clones` 는 소유자 Insights 집계 | [A] §5-10 · N14 · N4 |

### 3-2. 이 초안이 직접 확인한 설정 3건 (숫자 아님) — **감사 C1~C3 로 확인됨**

| 항목 | 값 | 명령 |
|---|---|---|
| pleiades `dev` ruleset | **`non_fast_forward` 차단**(force-push 불가) · `deletion` 차단 · PR 필수 · `allowed_merge_methods: [merge, squash, rebase]` · 필수 체크 `verify (20.x)`·`verify (24.x)` | `gh api repos/fomalhaut84/pleiades/rules/branches/dev` |
| pleiades 저장소 병합 설정 | `allow_merge_commit: true` | `gh api repos/fomalhaut84/pleiades --jq '{allow_merge_commit,…}'` |
| 서비스 CI 의 DB·단계 | 둘 다 `services: postgres`(`postgres:16`) · `npm ci → prisma generate → prisma migrate deploy → lint → tsc --noEmit → (fit 만 npm test) → build`. **fin CI 에는 테스트 단계가 없다** | worktree `ci.yml` 읽기 |

> **정정 (2회차 · [A] N3).** 1회차는 ruleset 의 force-push 차단을 "이력 편도" 의 근거로 들었다. 소유자는 ruleset 을 끌 수 있으므로 **그것은 편도의 근거가 아니다**(결론은 유지). 편도 요소는 ① **PR ref(`refs/pull/N/head`)가 push 된 객체를 보존**하는 것 ② **`referenced` 이벤트는 지울 수 없다**는 것이다.

### 3-3. 미측정 — 이 문서의 결정을 막는 것

~~★는 M-1 선결 측정(§4 M-1p)이다.~~ **정정 (2회차).** ★X1·★X2·★X3·X7·X9·X10 은 [S2] 로 **닫혔다**(결과는 §3-1 ⑱~㉔). 남은 것:

| # | 항목 | 무엇을 가르나 | 상태 |
|---|---|---|---|
| ~~★X1~~ | ~~서비스 메시지 안 GitHub 참조~~ | ~~Q49~~ | **닫힘** — ⑱⑲ |
| ~~★X2~~ | ~~filter-repo 결정성~~ | ~~Q49 (c)~~ | **닫힘** — ⑤ |
| ~~★X3~~ | ~~8절 4종~~ | ~~M-2~~ | **닫힘** — ㉑㉒ |
| X4 | 서비스 lock 2개를 시드로 한 단일 workspaces lock | Q51 L3 | 미측정 |
| X5 | gitleaks 급 스캔 | ⑥ 한계 | 도구 미설치(사용자 결정) |
| X6 | Telegram 409 · Garmin 동시 세션의 실제 영향 | — | **영구 미측정**(측정 자체가 서비스 영향) |
| ~~X7~~ | ~~대상 파일 변경 빈도~~ | ~~M-5~~ | **닫힘** — ㉓ |
| X8 | 서버 `claude -p` 와 로컬 Claude 가 같은 계정·쿼터인가 · Codex 봇 쿼터 저장소 간 공유 · M-1 대형 PR(약 1,400 파일)의 자동 리뷰 비용 · draft 로 미룰 수 있나 | §5 I-8 · Q65 | 미확인([A] U4·U5) |
| ~~X9~~ | ~~로컬 postgres · `.env`~~ | ~~M-4~~ | **닫힘** — ㉔ |
| ~~X10~~ | ~~중첩 `CLAUDE.md` 지연 로드~~ | ~~I-10~~ | **닫힘** — ⑧ (1회 실험 · 재현성·`claudeMdExcludes` 효과는 [A] U8 미확인) |
| **X11** *(2회차)* | **비링크 치환 결과가 정말 링크되지 않는가** — `fin#12`·`fit#12` 가 GitHub 에서 자동 링크·참조 추출 대상이 아닌가 | U97-5 ② 의 전제 | ~~**미확인.** 무부작용 확인 경로: `gh api markdown -f text='fin#12 Closes fin#12' -f mode=gfm -f context=fomalhaut84/pleiades` 렌더 결과에 링크가 없는지(렌더 API 는 저장소에 아무것도 남기지 않는다). **한계: 렌더링과 커밋 참조 추출이 같은 파서라는 보장은 없다**~~ **확인 (3회차 · [A2] R2).** 렌더: `Closes fin#494` · `fit#108` · `myFinance#494` · `pleiades#51` · `fin#٥١` 모두 links=0. 렌더 파서 ≠ 커밋 추출 파서일 수 있으나 **소유자 없는 형식은 같은 저장소(pleiades) `#N` 로만 해석 가능** → 서비스 경로 원리상 없음. **X11 이 틀리면 pleiades 이슈 `referenced` 잡음(편도) — 서비스 영향 없음.** 코드 스팬 한정 참조는 렌더 0 이나 커밋 추출 미확인 → Q56 비링크 권고 유지 |
| **X12** *(2회차)* | 같은 SHA 재 push 시 이벤트 중복 제거 · 한 번에 push 되는 수백 커밋의 처리 상한 | 편도 규모 | 미확인([A] U2·U3) — 게이트로 참조가 0 이면 무관 |
| **X13** *(2회차)* | 커밋 메시지 `@멘션` 이 알림을 보내는가 | Q62 | 미확인([A] U6) |
| **X14** *(2회차)* | pleiades push protection 이 M-1 push 를 막는가(fin 문서의 `PRIVATE KEY` 헤더 플레이스홀더) | M-1 push 가 거부될 수 있나 | 미확인([A] U7 · 가능성 낮음) |
| **X15** *(2회차)* | filter-repo `commit-callback` 으로 **커밋마다** 서비스 원 SHA 트레일러를 붙였을 때의 결정성 | Q63 | 미실험 |

---

## 4. 경로 — 단계 사다리

**각 단계의 완료 상태가 그대로 멈춤 지점이다.** "멈추면 남는 것" 열이 손해 0 을 주장하는 근거이고, 감사는 그 열을 반증해야 한다.
~~**서비스 접촉 열은 모든 단계에서 "0"이어야 한다**~~ **정정 (2회차 · U97-6).** **서비스 영향 열은 모든 단계에서 "쓰기 0 · 운영 영향 0" 이어야 한다.** https 읽기가 남기는 소유자 traffic 통계는 허용된 흔적이다 — 그 이상이면 설계 결함이다.

### 4-0. 한 장 요약

| 단계 | 내용 | 서비스 영향 | 되돌리기 (등급 · 행위 · 시점) | 멈추면 남는 것 |
|---|---|---|---|---|
| **M-0** | 006 정본 + 상위 문서 정정·소진 블록(§9) + **격리 불변식 룰**(§5) + (선택) 차단 훅 + **가져오기 도구 고정**(`tools/import/` — callback · 게이트 · 가드 스크립트 · 버전 기록) | 0 | **즉시** — 문서·룰·스크립트 revert PR | 방향·규칙·도구. 코드 무변경 |
| ~~**M-1p**~~ | ~~선결 측정 ★X1·★X2·★X3~~ | — | — | **소진(2회차)** — [S2] 로 끝났다 |
| **M-1** | 가져오기 — **filter-repo 재작성**(U97-5) → `apps/finance` · `apps/fitness` | 쓰기 0 · 운영 0 · traffic 흔적 | **push 전: 즉시**(로컬 ref 삭제) · **PR push 후 머지 전: 트리 즉시(PR 닫기) · 객체 편도(PR ref 보존)** · `referenced` 이벤트는 **grep-0 게이트 통과 시 0 이 기대값**(~~X11 미확인분이 잔여~~ **3회차 · [A2] R2: X11 이 틀리면 pleiades 이슈 `referenced` 잡음(편도) — 서비스 영향 없음**) · **머지 후: 트리 즉시**(revert PR `-m 1`) · **이력·pack 편도** · 재도입은 revert 의 revert → **중간** | `apps/*` = 서비스 dev 트리의 정지 사본(경로 이력 포함). 설치·CI 없음 → 아무것도 돌지 않는다 |
| **M-2** | 설치·검증 — 앱별 lock(Q51 L2 권고) · **`pleiades_fin` DB 생성 + `prisma migrate deploy`**(fin build 선행 · U97-8) · 두 앱 8절 4종 로컬 통과 · 헬퍼(루트 · `apps/*` 밖) | 0 | **즉시** — 스크립트 삭제 · `DROP DATABASE pleiades_fin`. `apps/*` 무변경 | 서비스와 **같은 lock** 으로 빌드·테스트된다는 사실 |
| **M-3** | CI — `apps-ci.yml` · 앱별 job · postgres 서비스 컨테이너 · **secrets 0** | 0 | **즉시** — 파일 삭제(필수 체크였다면 ruleset 에서도) | 수용 PR 마다 자동 신호 |
| **M-4** | 로컬 실행 격리 — `pleiades_fit` 추가 · 새로 쓴 `.env`(복사 금지) · 포트 분리 · **검증 봇 기동**(U97-7) · Garmin·Whooing·MFDS ~~·`CLAUDE_BIN`~~ 비움 · **advisor 차단 = fit `CLAUDE_BIN=/nonexistent/claude-disabled` + fin PATH shim**(3회차 · [A2] B1) · **실효 env 사전 검사**([A2] R6) | 0 (불변식 근거) | **즉시** — `DROP DATABASE` 두 개 · `.env` 삭제 · 봇 정지 · **검증 봇이 이미 보낸 메시지는 불가**(검증 채팅이라 무해) | 두 앱의 웹·봇이 로컬에서 기동. 첫 목표(U97-4) **달성** |
| **S** | **정기 수용** (M-1 이후 반복 · §4-S) | 쓰기 0 · traffic 흔적 | 머지 전 **즉시** · 머지 후 **중간**(revert `-m 1` → revert 의 revert) · **조상 가드 실패(서비스 force-push) 시 재병합은 중간 · 이력·pack 중복은 편도**([A] N2) · **가드 C 실패(이전 동기화 PR 이 squash 됨) 시 복구 = `-s ours` PR · 즉시**(3회차 · [A2] R3) | 서비스 dev 를 따라간 `apps/*` |
| **M-5** | notify 통합 — M-5a fit(1a-3 재사용) · M-5b fin(1a-4 · Q27). 참조 `file:../../packages/notify`(Q48 소멸) · **루트 `npm ci` 선행** | 0 | **즉시** — pleiades revert PR. 전환 전 미배포. **수용 충돌 표면이 커진다**(㉓ · 머무는 비용) | `apps/*` 가 서비스와 **의도적으로 갈라진** 첫 지점 |
| **M-6** | Discord(1b) — 검증 Discord 서버 · 스키마 무변경 우선(Q61) | 0 | **즉시** — env · 어댑터 revert. 스키마를 바꾸면 전환 시점에 편도 요소 이월 | 첫 릴리즈(#88) 조건의 절반 |
| ~~전환~~ | pleiades 가 서비스를 대체 | **정의상 서비스 영향** | — | **범위 밖**(§8 · Q60) |

<details><summary>1회차 요약표의 바뀐 칸 (기록)</summary>

- ~~M-1p "선결 측정 ★X1·★X2·★X3 (스크래치만) · 서비스 접촉 0 (GitHub https 읽기 · 테스트 저장소는 버리는 별도 저장소) · 즉시"~~
- ~~M-1 "가져오기 (방법은 Q49) · 서비스 접촉 0 (https 읽기 전용 fetch) · … 이력·pack 은 편도(ruleset 이 force-push 차단 · §3-2)"~~ — 근거 교체([A] N3)
- ~~M-2 "`apps/*` 는 무변경(L2)" 만 적고 DB 준비 없음~~ — [A] N6
- ~~M-4 "텔레그램 비움 또는 검증 봇(Q53)"~~ — U97-7
</details>

### 4-1. M-0 — 문서·룰·도구

| 항목 | 내용 |
|---|---|
| 산출물 | ① `docs/specs/006-monorepo-first.md` ② 상위 문서 정정·소진 블록(§9 표 전부) ③ **격리 불변식**을 `.claude/rules/` 에(신설 파일 또는 `workflow.md` 한 절 — 형식 문제) ④ `CLAUDE.md` 상태·대상 저장소 절·작업 규칙·하네스 절 ⑤ (Q56b) `PreToolUse` 훅 ⑥ **`tools/import/`**(2회차) — filter-repo callback 파일(앱별) · grep-0 게이트 스크립트 · 조상 가드 스크립트 · `VERSIONS`(git · filter-repo 버전 · 설치 방식 · callback 해시) · **3회차 · [A2] R5:** 설치 핀은 **`git-filter-repo==2.47.0`** · `VERSIONS` 에는 `git-filter-repo --version`(`a40bce548d2c`)·`git --version` 출력을 기록 · git 은 venv 로 고정할 수 없으므로 **git 드리프트는 가드 B 가 잡는다** · ⑦ **(3회차 · [A2] B1)** pleiades 로컬 `bin/` 의 **`claude` shim(exit 1)** + 기동 헬퍼(§4-6 L-7) · ⑧ **(3회차 · [A2] R6·R7)** 실효 env 사전 검사 헬퍼(§4-6 L-2·L-4) |
| 훅 범위 | ~~`gh … -R fomalhaut84/myF…` 의 쓰기 동사 · `repos/*` 안 `git push`/`fetch` · `ssh` 거부~~ **정정 (2회차 · [A] N13):** `gh api` 는 `-f`/`-F`/`--input` 이 있으면 **기본 POST** 이고 `-X` 로 임의 메서드를 쓴다 → 훅은 동사뿐 아니라 **메서드·필드 플래그**를 본다: 서비스 저장소 대상 `gh api` 는 `-X GET`(또는 메서드·필드 플래그 없음)만 통과 · `gh issue|pr|release|label … -R fomalhaut84/myF…` 는 `view`·`list`·`diff`·`checks` 만 통과 · `repos/*` 안 `git` 거부 · `ssh` 거부 · **`apps/*/deploy/**`·`ecosystem.config.js` 실행 거부**(I-19) · **3회차 · [A2] R9:** `gh api graphql -f query='mutation …'` 은 경로 없이 node id 로 서비스에 쓸 수 있음 → **graphql 은 `mutation` 포함 시 거부** · **`--method`·`-XPOST` 붙여 쓰기 형태 매칭** · **(3회차 · [A2] R4)** `git-filter-repo` 는 cwd 가 pleiades 안이면 거부 |
| 선결 | ~~이 초안의 재감사~~ **(3회차) 재감사 없음(#37 전례)** · 사용자 결정(§6 중 M-0 에 걸리는 것: Q55·Q56·Q56b·Q58·Q62·Q63·Q66) |
| 서비스 영향 | 0 |
| 되돌리기 | **즉시** — revert PR. 훅은 설정 1블록 삭제 |
| 멈추면 | 방향·규칙·도구만 남는다. 손해 0 |
| 주의 | 훅은 **룰의 대체가 아니다** — 텍스트 매칭이라 우회 경로가 있다. 룰이 정본, 훅은 실수 방지 |

### 4-2. ~~M-1p — 선결 측정 (스크래치만)~~ — 소진 (2회차)

~~★X1·★X2·★X3(§3-3). … **★X1 의 GitHub 쪽 재현은 서비스와 무관한 버려도 되는 테스트 저장소**에서 한다 — 그 저장소를 만드는 것은 사용자 계정 쓰기이므로 **사용자 승인 항목**이다(서비스 영향은 0).~~

> **정정 (2회차 · [A] N15 · [S2]).** 측정은 [S2] 로 끝났다. **테스트 저장소는 필요 없다** — `referenced` 이벤트는 문서로 확정됐고([A] B1), 잔여 위험은 치환 규칙(U97-5 ②)과 게이트로 우회한다. 승인 항목에서 뺀다. 남은 확인(X11)은 렌더 API 로 부작용 없이 한다.

### 4-3. M-1 — 가져오기

~~**Q49 의 답에 따라 명령이 갈린다.**~~ **정정 (2회차 · U97-5).** 방법은 **(c) filter-repo 재작성**으로 확정됐다. 1회차 비교표는 아래 기록으로 남긴다.

**공통 규율(1회차 유지 + 2회차 추가):**

- **출처는 항상 GitHub https URL** — 로컬 원본 `~/workspace/myF*` 나 worktree `repos/*` 에서 가져오지 않는다(worktree 는 원본과 `.git` 을 공유한다).
- **재작성은 pleiades 밖 스크래치 클론에서만** 한다(filter-repo 는 대상 저장소를 제자리에서 바꾼다 — pleiades 에서 돌리면 pleiades 이력이 재작성된다).
- **`--no-tags`** — 스크래치 클론(`git clone --no-tags --single-branch`)과 pleiades 로의 fetch(`git fetch --no-tags`) 둘 다. fetch 는 가져온 이력을 가리키는 태그를 **자동으로 따라온다** — 서비스 태그(fin 27 · fit 85)가 pleiades 에 섞이면 릴리즈 절의 `git push origin --tags` 가 그것을 pleiades 원격에 올린다([A] N14 · §5 I-16).
- **리모트를 등록하지 않는다**(1회차 유지).
- PR 은 **"Create a merge commit"**(squash 금지 — squash 하면 재작성 이력이 조상이 되지 않아 다음 수용이 전 이력을 다시 병합하려 한다 · #75 교훈).
- 머지 후 검증: `git rev-parse HEAD:apps/<app>` == 서비스 dev 원 SHA 의 `^{tree}`(두 앱).

**명령 골격 (앱마다 · `tools/import/` 스크립트가 감싼다) — 3회차 개정([A2] R1·R3·R4):**

```bash
T=<스크래치>                                                  # pleiades 밖
# R4: 먼저 스크래치가 pleiades 밖인지 검사 — filter-repo 는 현재 디렉터리를 재작성하고 --force 는 fresh-clone 검사도 끈다
case "$(realpath "$T")/" in "$(realpath ~/workspace/pleiades)"/*) echo "중단: T 가 pleiades 안"; exit 1;; esac
git clone -q --no-tags --single-branch --branch dev https://github.com/fomalhaut84/myFitness.git "$T/fit"
git -C "$T/fit" remote remove origin
SVC=$(git -C "$T/fit" rev-parse dev)                          # 서비스 원 SHA — 트레일러·가드 입력
# 가드 A (수용 때만): 마지막 수용 서비스 SHA 가 새 dev 의 조상인가 — 서비스 force-push 감지 (조상 없음 exit 128 → || 중단 · [A2] R3 동작 확인)
git -C "$T/fit" merge-base --is-ancestor <last-Service-Dev> "$SVC" || { echo 중단; exit 1; }
# R4: 반드시 스크래치 안에서 (cd) — cd/-C 없이 돌리면 현재 디렉터리(= pleiades 일 수 있다)를 재작성한다
( cd "$T/fit" && <고정 버전 git-filter-repo> --force --to-subdirectory-filter apps/fitness \
    --message-callback "$(cat <pleiades>/tools/import/msg_fit.py)" )   # 다섯 형식 → 비링크 (아래)
# 게이트: 다섯 형식 0 이어야 push 가능 — callback 과 별도 구현 · 대소문자 무시 · Python/perl (BSD grep 에 -P 없음 · grep -c 는 0건일 때 exit 1)
git -C "$T/fit" log --format=%B dev | tools/import/gate.py     # → 0 (0 이 아니면 exit ≠ 0)
# pleiades 에서
git fetch --no-tags "$T/fit" dev:refs/import/fit
# 가드 C (수용 때만 · [A2] R3): 이전 수용의 재작성 tip 이 origin/dev 의 조상인가 — 이전 동기화 PR 이 squash 머지됐는지 감지
git merge-base --is-ancestor <prev-rewritten-tip> origin/dev || { echo "중단: 이전 동기화 PR 이 squash 됨 — 복구 PR 먼저"; exit 1; }
# 가드 B (수용 때만): 이전 수용의 재작성 tip(마지막 수용 머지의 둘째 부모)이 새 재작성본의 조상인가 — 버전·옵션·git 드리프트도 여기서 잡힌다
git merge-base --is-ancestor <prev-rewritten-tip> refs/import/fit || { echo 중단; exit 1; }
git merge --no-ff [--allow-unrelated-histories  # M-1 최초만] refs/import/fit \
  -m "chore(apps): import/sync myFitness dev" -m "Service-Repo: myFitness" -m "Service-Dev: $SVC" -m "Filter-Repo: <버전> · callback <해시>"
git update-ref -d refs/import/fit
```

**가드 C 실패 시 복구 ([A2] R3 · #75 식):** 이전 동기화 PR 이 squash 됐으면 트리는 맞지만 재작성 이력이 dev 의 조상이 아니다 — 그대로 두면 가드 B 의 `git log --grep '^Service-Repo'` 가 이전 커밋을 잡거나 `^2` 가 실패한다. 복구 = 새 브랜치에서 **`git merge -s ours --no-ff <rewritten-tip>`**(diff 0) → PR → "Create a merge commit" → 머지 후 부모 2 확인. 되돌리기 **즉시**. 복구 머지 뒤에 가드 C 를 다시 돌리고 수용을 이어간다.

<details><summary>2회차 명령 골격 (기록 · 3회차에서 바뀐 점: 스크래치 위치 검사 · `(cd …)` · 게이트 스크립트 · 가드 C)</summary>

```bash
<고정 버전 git-filter-repo> --force --to-subdirectory-filter apps/fitness \
  --message-callback "$(cat tools/import/msg_fit.py)"          # ← cd/-C 없음 — 현재 디렉터리를 재작성한다([A2] R4)
git -C "$T/fit" log --format=%B dev | grep -cP '<네 형식>'      # ← BSD grep 에 -P 없음 · 네 형식은 불완전([A2] R1)
# (가드 C 없음 — [A2] R3)
```
</details>

**치환 규칙 (U97-5 ② · callback 이 하는 일):**

| 원 형식 | 예 | 치환 | 비고 |
|---|---|---|---|
| 서비스 이슈/PR URL | `https://github.com/fomalhaut84/myFinance/pull/494` | `fin#494` | 실측 0건이나 규칙은 둔다 |
| 기타 GitHub 이슈/PR URL | `https://github.com/<o>/<r>/issues/N` | `<r>#N` | 소유자 제거 |
| **호스트 없는 URL 형식** *(3회차 · [A2] R1)* | `fomalhaut84/myFinance/pull/494` · `www.github.com/…/issues/51` | `fin#494` 류 | 렌더 links=1(**다섯째 형식**) · 서비스 메시지 실측 0 |
| 저장소 한정 | `fomalhaut84/myFinance#494` · `fomalhaut84/pleiades#51` · 대문자(`FOMALHAUT84/PLEIADES#51`) | `fin#494` · `pleiades#51` | **실측 3건 — 1회차 callback 이 건너뛴 형식**([S2] X2 · [A] B2) · 대소문자 무시([A2] R1) |
| 한정 없는 `#N` | `#82` · **`/#383`**(3회차) | 서비스 저장소 접두 `fin#82`/`fit#82` | fin 1,331 · fit 1,945 · **`/#N` fin 3 · fit 3 — [S2] callback `(?<![\w/])#` 이 건너뛰었다**([A2] R1) → 앞 문자 조건은 `(?<![A-Za-z0-9_])` |
| `GH-N` | `GH-12` · `gh-12` · `Gh-12` | `fin#12`/`fit#12` | 실측 0건 · 대소문자 무관(렌더 links=1) |
| (선택 · Q62) `@멘션` | `@user` | 무해화 형식 | U97-5 ⑧ |

- 치환 순서가 의미를 가진다(URL → 한정 → 한정 없음). 결과는 **소유자를 포함하지 않는다** — `owner/repo#N` 은 자동 링크 형식이다.
- ~~**게이트 정규식(네 형식)** 은 callback 과 **독립으로** 쓴다~~ **정정 (3회차 · [A2] R1) — 게이트는 다섯 형식 · 대소문자 무시 · callback 과 별도 구현 · Python/perl**(BSD grep 에 `-P` 없음 · `grep -c` 0건 exit 1):
  - (i) `[\w.-]+/[\w.-]+#\d+`
  - (ii) `(https?://)?(www\.)?github\.com/[\w.-]+/[\w.-]+/(issues|pull|discussions)/\d+`
  - (iii) `(?<![\w.-])[\w.-]+/[\w.-]+/(issues|pull)/\d+`
  - (iv) `(?<![\w])gh-\d+`
  - (v) `(?<![A-Za-z0-9_])#\d+\b`
  (같은 정규식을 재사용하면 callback 이 놓친 형식을 게이트도 놓친다 — [S2] X2 의 `/#N` 이 바로 그 사례.)
- ~~**X11(비링크 형식이 정말 링크되지 않는가)** 은 M-1 push 전에 렌더 API 로 확인한다(§3-3).~~ **X11 확인됨 (3회차 · [A2] R2)** — §3-3.

**되돌리기(M-1):** push 전 **즉시** · PR push 후 **객체는 편도**(PR ref) · **머지 후 트리 즉시 / 이력·pack 편도 / 재도입 중간** · `referenced` 이벤트는 게이트 통과 시 기대값 0, ~~**X11 이 틀리면 편도**~~ **X11 이 틀리면 pleiades 이슈 `referenced` 잡음(편도) — 서비스 영향 없음**([A2] R2). **스크래치 위치 검사를 빠뜨리고 pleiades 에서 filter-repo 를 돌리면 로컬 이력 재작성·reflog 만료(원격 무사 → 중간 · 미커밋 작업 손실)**([A2] R4). 크기는 ① 11.45 MiB. **세 저장소 모두 이미 PUBLIC 이라 새로 공개되는 내용은 없다**(⑥).

**멈추면:** `apps/*` 는 정지 사본이다. 루트 CI 는 `packages/notify` 만 돌고 `security-audit.yml` 의 `paths` 도 `apps/*` 를 보지 않는다 — 아무것도 새로 돌지 않는다. 남는 비용은 저장소 크기 · Grep 잡음 · **중첩 하네스 지연 로드**(I-10)다.

**M-1 PR 의 리뷰:** diff 는 서비스에서 이미 리뷰·머지된 코드 전체다. 9-1 사전 리뷰는 **머지 위생(트리 동일성 · 루트 무변경 · `.github` 비활성 · 게이트·가드 로그 첨부) + 8절(pleiades 행)** 으로 한정한다. 대형 PR 의 봇 자동 리뷰 비용·draft 우회는 **미확인**(X8 · Q65).

<details><summary>1회차 Q49 비교표 (기록 · 2회차 판정 병기)</summary>

| Q49 | 1회차 서술 | 2회차 판정 |
|---|---|---|
| (a) subtree 이력 포함 | ~~"메시지 그대로 들어온다 → ★X1 이 0 이어야 안전" · 수용 1줄~~ | **탈락** — 한정 참조 3 이 push 시 myFinance#494·myFitness#108 에 `referenced` 이벤트([A] B1) · 경로 이력 끊김(②) |
| (b) subtree `--squash` | ~~"★X1 위험 없음(squash 메시지만)"~~ | **틀렸다** — `pull --squash` 가 서비스 커밋 제목을 전부 넣는다(제목 `#N` fin 257/395 · fit 338/375 · 제목 닫기 키워드 fit 2 — [A] N1). 경로 이력도 없다 |
| (c) filter-repo | ~~"메시지의 `#N` → `fomalhaut84/myFinance#N` 을 **코드 스팬으로** 재작성"~~ | **채택(U97-5) · 치환 규칙 교체** — 소유자 포함 형식은 그 자체가 자동 링크 형식이라 3,276건을 서비스 참조로 만든다([A] B2) |
</details>

### 4-4. M-2 — 설치·검증

**Q51 권고 = L2(앱별 lock 유지 · workspaces 없음).**

| | **L2 앱별 lock** (권고) | L1 workspaces + lock 재생성 | L3 workspaces + 서비스 lock 시드 병합 |
|---|---|---|---|
| 서비스와 버전 동일성 | **동일** | **fin 221 · fit 242 다름**(⑪) | **미측정**(X4) |
| `overrides` | **앱별로 동작** | **하위 무시**(⑫) → 19개 루트 병합 · 수동 반영 | L1 과 같다 |
| 주버전 충돌 ⑨ | 해당 없음 | fin 이 루트 호이스팅 · fit next 16 중첩 | L1 과 같다 |
| node_modules | 1,545 MB | 1,160 MB | 미측정 |
| `apps/*` 변경 | **0** | 0(루트만) | 0 |
| 수용 시 추가 작업 | **없음** | 매번 override·lock 재반영 · 드리프트 재측정 | 매번 시드 재병합 |
| notify 참조(M-5) | `"@pleiades/notify": "file:../../packages/notify"` 1줄 + 앱 lock — **동작 실측**(㉒) · `apps/*` 변경 = 수용 충돌 후보 | 루트 workspaces 해석 · 앱 1줄 필요 | L1 과 같다 |
| 되돌리기 | **즉시** | **즉시** → M-5 가 기대면 **중간** | 즉시 → 중간 |

- 첫 목표(U97-4)는 "서비스와 같은 것이 pleiades 에서 돈다" 이므로 버전 동일성이 설치 크기(⑩ 의 두 값 차이)보다 앞선다. workspaces 는 **전환 설계(Q60)** 와 함께 다시 연다.
- L2 는 루트 `workspaces` 를 계속 넣지 않는다 — 003 §2-1 정정(ALT-d)과 충돌 없음. 그 결정의 근거(*"소비자 `npm ci` 가 무거워진다"*)는 git dep 소비자가 사라지며 **소진**된다(§9).
- **fin 스키마 DB 선행 (2회차 · [A] N6 · U97-8).** fin `next build` 는 prerender 가 Prisma 를 부르므로 **스키마가 적용된 DB 가 있어야 통과한다**(㉑ — 데이터는 필요 없다). M-2 에서 **로컬 5432 에 `pleiades_fin` 을 만들고 `DATABASE_URL=…/pleiades_fin` 으로 `npx prisma migrate deploy`** 를 먼저 한다. fit build 는 더미 DB 로 통과한다 — `pleiades_fit` 은 M-4 에서 만든다. ~~1회차 "`DATABASE_URL` 은 로컬 빈 DB 또는 더미 — ★X3 결과에 따라"~~
- **8절 표에 `apps/finance`·`apps/fitness` 행을 추가**한다. 명령은 서비스 CI 와 같다. **fin 선행: `DATABASE_URL` = `pleiades_fin` + `npx prisma migrate deploy`** · fit 선행: `npx prisma generate`(더미 `DATABASE_URL` 로 충분). **M-5 이후 두 행 모두 선행: 루트 `npm ci`**(`packages/notify/dist` 생성 — ㉒ · [A] N8).
- Next build 의 *"multiple lockfiles"* 추론 경고(㉑)는 **받아들인다** — `outputFileTracingRoot` 를 넣으려면 `apps/*/next.config` 를 고쳐야 하고 그것은 수용 충돌 후보다.
- **measured-facts 정정 필요 표시 (2회차 · [A] N6).** 1a-0/1a-2 기록의 *"`next build` DB 요구 없음"* 은 **fit 한정** 값이다. fin 은 스키마 DB 를 요구한다(㉑). 정본 반영 때 정정 블록(§9).
- 로컬 node 20.18.0 < 20.19 는 경고만(⑬).

### 4-5. M-3 — CI

| 항목 | 내용 |
|---|---|
| 파일 | **`.github/workflows/apps-ci.yml`**(신설 · 루트 `ci.yml` 과 이름 분리). 서비스 `apps/*/.github/` 는 **옮기지 않는다** |
| job | 앱별 1 job · **서비스 CI 단계 그대로**(§3-2) · `working-directory: apps/<app>` · `services: postgres:16`(러너 안에서만 존재 — fin build 의 스키마 DB 요구를 여기서 충족) |
| 트리거 | ~~PR·push `dev` · `paths: apps/<app>/**` 필터(앱별)~~ **정정 (2회차 · [A] N9):** **워크플로우 수준 `paths` 필터를 쓰지 않는다.** 필터된 워크플로우를 필수 체크로 올리면 **트리거되지 않은 PR 이 "Expected" 로 막힌다.** 필요하면 job 안에서 변경 경로를 보고 **단계를 skip**(job 자체는 성공으로 끝난다). **M-5 이후 fit job 은 `packages/notify/**` 변경에도 돌고, 루트 `npm ci` 를 먼저 한다** |
| **secrets** | **0 — 넣지 않는다**(I-9) |
| fin 테스트 | 서비스 CI 에 없다. 추가하되 **필수로 올리지 않는다**(Q57) |
| 필수 체크 | Q52 |
| `security-audit.yml` | `apps/*` lock 은 포함하지 않는다(권고 · Q57) |
| 되돌리기 | **즉시** — 파일 삭제 · 필수 체크였다면 ruleset 에서도 제거 |
| 멈추면 | 수용 PR 이 두 앱을 깨지 않았다는 자동 신호가 남는다 |

### 4-6. M-4 — 로컬 실행 격리

003 §10-1 의 10조건에서 서버 전용 조건(3 · 4 · 7)은 소멸하고, 나머지는 로컬로 옮겨 온다.

| # | 조건 | 수단 | 되돌리기 |
|---|---|---|---|
| L-1 | DB | ~~로컬 postgres 에 앱별 빈 DB(이름 예 `pleiades_fin`·`pleiades_fit`)~~ **정정 (2회차 · U97-8):** **기존 5432 인스턴스에 `pleiades_fin`(M-2 에서 이미 생성)·`pleiades_fit` 두 개만.** 생성·삭제는 **그 두 이름만** — 서비스 기본값 `myfinance`·`myfitness` 와 겹치지 않는다. 다른 DB 에 대해 `migrate reset`·`db push`·`DROP` 을 하지 않는다. `DROP` 전에 이름을 문자열로 대조한다. **파괴 명령 목록에 `prisma migrate dev` 추가**(공유 인스턴스에 shadow DB 생성·삭제 · Q61 정합 — 3회차 · [A2] R6). fit 웹은 기동만으로 이 DB 에 쓴다(003 §10-1 (c)) — 무해 | **즉시** — `DROP DATABASE pleiades_fin` · `DROP DATABASE pleiades_fit` |
| L-2 | `.env` | **새로 쓴다.** ~~원본 `~/workspace/myF*/.env` 를 복사하지 않는다~~ **정정 (2회차 · [A] N10):** 복사 금지 대상은 **셋** — ① 원본 `.env`(존재 ㉔) ② **worktree `repos/*/.env`**(존재 ㉔) ③ **`.env.example` 그대로**(fin `…/myfinance` · fit `…/myfitness` 가 **같은 5432 의 사용자 개발 DB 를 가리키고** `PORT` 가 4100/4200). 템플릿은 루트(`apps/*` 밖)에 두고 스크립트가 `apps/<app>/.env` 로 떨군다 · 스크립트는 `DATABASE_URL` 의 DB 이름이 `pleiades_` 로 시작하지 않으면 중단. **정정 (3회차 · [A2] R6) — `.env` 접두 검사는 불충분하다.** 두 앱 `prisma.config.ts` · fin `standalone.ts:10`·`mcp/server.ts:4` · fit `scripts/*` 가 `import "dotenv/config"` 로 cwd `.env`. dotenv·`@next/env` 는 기존 `process.env` 를 덮지 않음 → **셸 export `DATABASE_URL`·`TELEGRAM_BOT_TOKEN` 이 이긴다.** Next 는 `.env.local`·`.env.development`·`.env.production` 을 `.env` 보다 먼저. 현재 셸 관련 export 0 · 프로필 `DATABASE_URL` 0(잠재 위험). → 기동·migrate 헬퍼가 **실효 env 사전 검사**(`DATABASE_URL` 호스트 ∈ {localhost,127.0.0.1,::1} · 포트 5432 · DB 이름 `pleiades_` 접두) · **`env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN` 실행** · **cwd = `apps/<app>`** · **`apps/*/.env.*` 부재 확인** | **즉시** |
| L-3 | 포트 | `PORT`·`MCP_PORT` 를 4100/4200/4210/4301 **그리고 `next dev` 기본 3000** 과 다르게(사용자가 로컬에서 원본을 띄울 수 있다). **주의 (3회차 · [A2] B1): fin `src/lib/ai/mcp-config.json` 은 `http://127.0.0.1:4210/mcp` 하드코딩 — `MCP_PORT` 를 무시한다**(advisor 는 L-7 로 막으므로 이 경로는 쓰이지 않는다) | **즉시** |
| L-4 | 텔레그램 | ~~기본 **`TELEGRAM_BOT_TOKEN` 비움**. 발송을 봐야 하면 검증 전용 봇 토큰 + 검증 전용 채팅(Q53)~~ **정정 (2회차 · U97-7):** **검증 봇 토큰**(사용자가 BotFather 로 발급 · 앱마다 · 서비스 토큰과 다른 봇) + **검증 전용 채팅**만 `TELEGRAM_ALLOWED_CHAT_IDS`(fin 은 `ADMIN_CHAT_IDS` 도)에. 토큰이 준비되기 전에는 비움. **3회차 · [A2] R7 — 토큰 혼입 경로: R6 셸 env 우선 + 사용자 오붙여넣기.** 템플릿에 **검증 봇 id(토큰 `:` 앞 숫자 · 공개값) 허용 목록** · 기동 전 **실효 토큰 id 대조(API 호출 없이)** · **두 앱이 서로 다른 봇인지 확인**(같은 토큰 둘이면 로컬끼리 409) | **즉시**(env) · 보낸 메시지는 불가(검증 채팅이라 무해) |
| L-5 | Garmin | `GARMIN_*` 비움 · cron tick 에러 로그 수용(⑭) · `.garmin-tokens/` 반입 금지 | **즉시** |
| L-6 | 외부 쓰기 API | fin `WHOOING_WEBHOOK_URL` 비움(설정 UI 로도 넣지 않는다) · fit `MFDS_API_KEY` 비움 | **즉시** |
| L-7 | AI | ~~`CLAUDE_BIN` 비움 — X8 이 "계정 분리" 로 확인되기 전에는 로컬 advisor 를 돌리지 않는다~~ **정정 (3회차 · [A2] B1 · 블로커):** "`CLAUDE_BIN` 비움 → 로컬 advisor 안 돈다" 는 두 앱 모두 불성립(fit PATH `claude` 폴백 · fin `'claude'` 하드코딩 — ⑯). U97-7 로 M-4 가 봇을 띄우면 스케줄러·리포트가 로컬 `claude` 를 자동 실행 — X8(같은 계정) 이면 서버 advisor 와 쿼터 경쟁. → **fit: `CLAUDE_BIN=/nonexistent/claude-disabled`(비어 있지 않은 없는 경로) · fin: env 로 끌 수 없음 → 웹·봇을 `claude` 가 없는 PATH(pleiades 로컬 `bin/` 의 exit 1 shim 선행)로 기동 · 기동 스크립트가 `command -v claude` 가 shim 인지 확인 후 시작.** X8 이 "계정 분리" 로 확인되기 전에는 로컬 advisor 를 돌리지 않는다 | **즉시** |
| L-8 | 인증 | fin `AUTH_SECRET`·`AUTH_PIN` 로컬 값 | **즉시** |
| L-9 | 봇 프로세스 | ~~기본은 기동하지 않는다~~ **정정 (2회차 · U97-7): L-4 검증 토큰으로 기동한다**(`next start` 가 아니라 앱의 봇 엔트리 · pm2 불사용). **서비스 토큰이면 409(⑮)** — ~~L-2 가 그것을 구조적으로 막는다~~ **L-2 실효 env 검사 + L-4 봇 id 허용 목록이 막는다**(3회차 · [A2] R6·R7 — `.env` 만으로는 셸 export 가 이긴다) · **PATH shim·`CLAUDE_BIN` 없는 경로(L-7)로 기동**([A2] B1) | **즉시**(프로세스 정지) |

- **첫 목표(U97-4) 판정** = M-3 CI 녹색 + L-1~L-9 로 두 앱의 **웹과 봇**이 로컬 기동 + 검증 봇이 검증 채팅에 응답.
- 멈추면: 로컬에서 두 앱을 띄우는 절차. 서비스 쓰기·운영 영향 0.

### 4-S. 정기 수용 — 서비스 `dev` → pleiades `apps/*`

**서비스 저장소에는 https 읽기만 한다**(U97-6). 절차는 §4-3 명령 골격과 같다(가드 A·B 포함). 차이만 적는다.

```bash
# 0. 뒤처짐 판정 (세션 시작 · pleiades-resume Step 2 대체) — 읽기 전용
git ls-remote https://github.com/fomalhaut84/myFinance.git refs/heads/dev
#    ↔ pleiades 의 마지막 수용 머지 트레일러 'Service-Dev: <sha>' (git log --grep '^Service-Repo: myFinance' -1)
# 1. pleiades 에서 dev 최신화 → chore/<issue>-sync-apps-<YYYYMMDD> → 앱마다 §4-3 골격(스크래치 위치 검사 → 가드 A → 재작성 → 게이트 → fetch → 가드 C → 가드 B → merge)   # 3회차: 가드 C · 위치 검사([A2] R3·R4)
# 2. 충돌 해결 → 8절(apps 행) → PR base dev → "Create a merge commit" → 머지 후 부모 2 확인
```

~~(1회차: `git subtree pull --prefix=apps/finance https://…myFinance.git dev` · 마지막 SHA 는 subtree 머지 메시지·트레일러)~~ — U97-5 로 대체.

| 수용마다 요구되는 것 | L2(권고) | L1 |
|---|---|---|
| lock | **없음** — 서비스 lock 이 그대로 온다. M-5 이후 lock 충돌이면 서비스 lock 을 받고(`--theirs`) 앱에서 `npm install` 로 `file:` 1줄을 다시 얹는다 → lock diff 검토 | 루트 lock 재생성 · 드리프트 재측정 |
| overrides | **없음** | 앱 `overrides` diff → 루트 병합 · 누락하면 서비스가 막은 취약 버전이 해석된다 |
| 소스 충돌 | pleiades 가 `apps/*` 를 고친 파일에서만(M-5 이후 · ㉓) | 같다 |
| 하네스 | `apps/finance/.claude/` 는 서비스 판이 그대로 온다(Q58) | 같다 |
| **메시지 게이트·가드** *(2회차)* | **매번** — 새로 들어오는 서비스 커밋 메시지도 ~~네 형식~~ **다섯 형식**(3회차 · [A2] R1) 0 이어야 push. 가드 A·B 실패 시 **중단하고 사용자에게 보고**(자동 복구 금지). **가드 C 실패 시(이전 동기화 PR 이 squash 됨) `-s ours` 복구 PR 먼저**(§4-3 · [A2] R3) | 같다 |
| **도구 버전** *(2회차)* | `tools/import/VERSIONS` 와 다르면 가드 B 가 실패한다(재작성 SHA 가 달라짐). **git 은 venv 로 고정할 수 없다(Apple Git · CLT 업데이트로 변동) — git 드리프트도 가드 B 가 잡는다**(3회차 · [A2] R5). **버전을 올리려면 전 이력 재병합(unrelated · 중간) + 이력 중복(편도)** — 올리지 않는 것이 기본 | 같다 |

- **리뷰 범위**: 충돌 해결분 + 머지 위생(게이트·가드 로그) + 8절. 서비스 유래 코드의 봇 지적은 **pleiades 이슈로만**(Q55).
- **되돌리기**: 머지 전 즉시 · 머지 후 revert `-m 1` → **중간**(다음 수용이 이미 조상인 재작성 커밋을 다시 가져오지 않으므로 revert 의 revert). **서비스가 force-push 했다면(가드 A/B 실패)**: 재작성 이력이 이어지지 않아 unrelated 재병합 → **중간** · 옛 이력과 새 이력이 둘 다 남는다 → **편도**([A] N2).
- **주기**: Q54b.
- **머무는 비용**: `apps/*` 를 고친 양 × 그 파일의 서비스 변경 빈도(㉓ — fin 1a-4 대상은 90일 fin 커밋의 17/59). M-4 까지는 `apps/*` 무변경이라 수용은 무충돌이어야 한다.

### 4-7. M-5 — notify 통합 (1a-3 · 1a-4 를 `apps/*` 안에서)

| 항목 | 1a-3 계획(`_workspace/1a-3/`)에서 | M-5 에서 |
|---|---|---|
| 코드 결정 D-1~D-4 · U-3 · U-5 | 사용자 승인됨 | **재사용** — 경로만 `apps/fitness`. src 동일 전제(⑰)는 **M-5 직전 수용 0** 으로 다시 세운다 |
| 소스 | fit worktree 브랜치 `fd8b7c5` | `fd8b7c5` 의 `src/` 8 파일 diff 를 **GitHub 에서 읽기 전용 fetch(`--no-tags`)** → `git apply --directory=apps/fitness`. `package.json`·lock 은 버린다. **동작 실측**(㉒ · 442 테스트) |
| 패키지 참조 | Q48 = SHA 40자 핀 | **Q48 소멸** — `file:../../packages/notify` |
| **선행** *(2회차)* | — | **루트 `npm ci`(`prepare` → `packages/notify/dist`)** — 빠지면 rc 127 → 연쇄 실패(㉒ · [A] N8). **ALT-d 위임 키**(`main`·`types`·`exports`·`files`)만 삭제 후보 · **`prepare`(또는 같은 일을 하는 명시 빌드 스크립트)는 유지** |
| 검증 | 8절 4종 + γ + β2-I(서버) | ~~**8절 4종 + CI + 로컬 기동(M-4)**~~ **정정 (2회차 · [A] N12):** fit 발송 6건은 **전부 봇 프로세스**에서 나간다(1a-3 계획 S-1) — 웹 기동으로는 교체 경로를 밟지 않는다. **8절 4종 + CI + 봇 기동(M-4 L-9 · 검증 봇) 후 검증 채팅 수신**. β2 소멸 |
| 등급 | "즉시 — 미배포·β2-R 미실행 동안 · 이후 중간"(U-8) | **즉시** — 전환 전 배포 경로 없음 |
| 이슈 | #95(보류) · #96 | #95 소진 → M-5a 이슈로 대체 · #96 흡수 가능 |
| fin(1a-4) | Q27 미결 | 그대로 M-5b 선결 · **대상 파일이 fin 에서 자주 바뀐다**(㉓) → M-5b 는 **착수 직전 수용 0 + 짧은 브랜치 수명** |

- `packages/notify/` 는 움직이지 않는다(003 §2-1).
- **멈추면:** fit 만 통합돼도 손해 없다 — 서비스는 원래 코드, pleiades `apps/fitness` 만 갈라진다.
- 되돌리기 **즉시**(pleiades revert PR).

### 4-8. M-6 — Discord (1b)

- `DiscordTransport` 는 `packages/notify/` 에 추가(003 §6). 검증 Discord 서버·웹훅은 새로 만든다.
- **1b-2 스키마(003 Q12)** 를 `apps/*/prisma` 에 넣으면 수용 충돌 + 전환 시 편도 마이그레이션 → Q61.
- 되돌리기 **즉시**. 스키마를 바꿨다면 전환 이월분은 편도 후보.
- 멈추면: 첫 릴리즈 조건(#88)의 Discord 절반이 pleiades 안에서 충족. 서비스 무변화.

---

## 5. 격리 불변식 — pleiades 가 서비스에 닿을 수 있는 모든 경로

**원칙(U97-6 경계): 쓰기 0 · 운영 영향 0 · 관측 흔적(소유자 traffic 통계)만 허용.** 차단 규칙이 없는 행은 없다.

| # | 경로 | 어떻게 닿나 | 차단 규칙 | 기계적 보조 | 위반 시 되돌리기 |
|---|---|---|---|---|---|
| **I-1** | 서비스 저장소 쓰기 | push · 브랜치(동결된 `integration/*` 포함) · PR · 이슈 · 코멘트 · 라벨 · 리뷰 · 릴리즈 | **전부 금지.** ~~`gh` 의 `-R fomalhaut84/myF…` 는 읽기 동사만(`view`·`list`·`api` GET)~~ **정정 (2회차 · [A] N13):** `gh api` 는 **메서드·필드 플래그 없음 또는 `-X GET`** 만 · 그 외 서브커맨드는 읽기 동사만. 출처는 https URL 직접 · 리모트 미등록. **3회차 · [A2] R9:** `gh api graphql -f query='mutation …'` 은 경로 없이 node id 로 서비스에 쓸 수 있음 → **graphql 은 `mutation` 포함 시 거부** · **`--method`·`-XPOST` 붙여 쓰기 형태 매칭** | 훅(Q56b) | 대부분 되돌릴 수 있으나 알림·이벤트는 편도 |
| **I-2** | GitHub 교차 참조 | pleiades 이슈·PR·커밋 메시지의 **자동 링크 형식**(`owner/repo#N` · 서비스 URL · `#N` · `GH-N`) → 대상 이슈 타임라인에 `referenced`/`mentioned` 이벤트(⑲). **가져온 커밋 메시지**가 가장 큰 원천(⑱) | ~~서비스 참조는 코드 스팬(`` `myFitness#492` ``)으로~~ **정정 (2회차 · [A] B2):** 코드 스팬이 참조 추출을 막는다는 근거가 없다. **비링크 형식**(`fin#492`·`fit#492` — 소유자 없음)으로 쓴다(Q56). 가져온 메시지는 U97-5 ② 치환 + **grep-0 게이트**. 파일 안의 참조는 무해(⑲) | 게이트 스크립트(M-0) | **편도** |
| **I-3** | 서버 | ssh · pm2 · nginx · β2 `~/pleiades-int` · 서버 DB | **전부 금지.** 서버 잔여물 정리는 **사용자 단독**(Q54) | 훅(`ssh`) | 사용자만 |
| **I-4** | 서비스 텔레그램 봇 토큰 | 409 · `deleteWebhook()` · 서비스 봇 명의 발송 | 서비스 토큰을 어떤 `.env`·secret·명령줄에도 두지 않는다 · `.env` 복사 금지 3종(L-2) · **검증 봇은 별도 봇**(U97-7) · **(3회차 · [A2] R6·R7) 실효 env 사전 검사 · `env -u TELEGRAM_BOT_TOKEN` · 검증 봇 id 허용 목록 대조 · 두 앱 다른 봇** | 헬퍼 검사 | **서비스 중단**(사용자 재기동) |
| **I-5** | 텔레그램 수신자 | 실사용 채팅으로 발송 | `ALLOWED/ADMIN_CHAT_IDS` = 검증 채팅만 | 없음 | 편도(보낸 메시지) |
| **I-6** | Garmin 계정 | fit 웹 기동만으로 싱크 cron(⑭) | `GARMIN_*` 비움 · 토큰 디렉터리 반입 금지 | 없음 | 서비스 재로그인(사용자) |
| **I-7** | 서비스 DB | 서비스 `DATABASE_URL` · 부팅 쓰기 | 서비스 DB 접속 정보를 pleiades 어디에도 두지 않는다 · CI 는 러너 컨테이너 | 없음 | 편도 |
| **I-8** | 외부 API·쿼터 | Whooing(실 가계부) · MFDS · `claude -p` 계정 공유(X8) · Codex 봇 쿼터 공유(X8) | 비움 · ~~`CLAUDE_BIN` 비움~~ **(3회차 · [A2] B1) fit `CLAUDE_BIN=/nonexistent/claude-disabled` · fin PATH shim(exit 1) 선행 + `command -v claude` 확인 후 기동**(L-7 — "`CLAUDE_BIN` 비움" 은 두 앱 모두 불성립) · 대형 PR 리뷰 비용은 Q65. **X8 이 "같은 계정" 이면 pleiades 세션 자체가 쿼터를 공유한다**([A] F4) — 그 경우 원칙 적용 범위를 사용자가 정한다 | 없음 | 쿼터는 시간 경과 · 가계부 편도 |
| **I-9** | GitHub Actions | `deploy.yml` 루트 이동 · `DEPLOY_*`·`TELEGRAM_*` secret | `apps/*/.github/` 를 루트로 옮기지 않는다 · secrets **0 유지** · ~~secrets 0 을 CI 로 점검~~ **정정 (2회차 · [A] N13):** 점검은 **로컬 `gh api repos/fomalhaut84/pleiades/actions/secrets --jq .total_count` → 0**(세션 시작) | 로컬 점검 | 사용자만 |
| **I-10** | **중첩 서비스 하네스의 지시** | ~~`bin/claude-with` 가 `apps/*` 를 붙이지 않는다로 차단 · "I-1·I-3 을 지시문으로 유도"~~ **정정 (2회차 · [A] N5 · [S2] X10):** 추적되는 `apps/finance/**` 파일을 **읽는 순간** fin `CLAUDE.md` + rules 5 가 지연 로드되고 skill 7(`release-publisher`) · agent(`release-manager`)가 발견된다(⑧). "서비스 쓰기 유도" 는 과장이었다(fin 하네스에 `fomalhaut84`·`-R` 0건) — 실체는 **cwd 기준 명령**이 pleiades 를 겨누는 것(I-19) | ① 룰에 **"`apps/*` 안의 하네스(CLAUDE.md·rules·skills·agents)는 pleiades 세션에서 효력이 없다 — 충돌 시 pleiades 룰"** ② `claudeMdExcludes` 로 `apps/*/CLAUDE.md`·`apps/*/.claude/**` 제외(**미실험** — [A] U8) ~~③ 중첩 skill 발견은 추적 경로에서만 일어나므로 막을 수단은 ②뿐~~ **정정 (3회차 · [A2] R8):** `claude-code-mechanisms.md:121`: **② 는 CLAUDE.md·rules 만** 배제한다 — **skill·agent 발견 차단 수단은 미확인(U8).** **실제 방어선은 ① 룰 한 줄 + I-19 훅** | ① 룰 · I-19 훅 · ②(설정 · CLAUDE.md·rules 한정) | 즉시(세션) |
| **I-11** | 원본·worktree 의 `.git` | `repos/*` 에서 git 명령 → 원본 `.git` 변경 | 동결 — `repos/*` 에서 git 명령 금지 | 훅 | 로컬 메타데이터 |
| **I-12** | 포트 | 로컬 원본과 충돌 | L-3(3000 포함) | 없음 | 즉시 |
| **I-13** *(2회차)* | **traffic 흔적** | https `clone`/`fetch`/`ls-remote` 가 서비스 저장소 소유자 Insights(`traffic/clones`)에 집계 | **허용(U97-6)** — 쓰기 0 · 운영 영향 0. 빈도는 수용 주기(Q54b)가 정한다 | — | — |
| **I-14** *(2회차)* | **로컬 5432 공유** | 사용자 서비스 개발 DB 와 같은 인스턴스(㉔ · U97-8). 잘못된 `DROP`·`migrate reset` · `.env.example` 복사로 `myfinance`/`myfitness` 를 가리킴 | 생성·삭제는 `pleiades_fin`·`pleiades_fit` 만 · `.env` 스크립트의 `pleiades_` 접두 검사 · 파괴 명령(`DROP`·`migrate reset`·`db push --force-reset` · **`prisma migrate dev`**(3회차 · [A2] R6 — 공유 인스턴스에 shadow DB 생성·삭제)) 전 DB 이름 대조 · **(3회차 · [A2] R6) `.env` 접두 검사는 불충분 — 셸 export 가 이긴다 → 실효 env 사전 검사(호스트 ∈ {localhost,127.0.0.1,::1} · 포트 5432 · `pleiades_` 접두) · `env -u DATABASE_URL` · cwd = `apps/<app>` · `apps/*/.env.*` 부재 확인** | 헬퍼 검사 | 사용자 개발 DB 손상은 **편도**(서비스 운영 영향은 0 — 로컬이다) |
| **I-15** *(2회차)* | **서비스 dev force-push** | pleiades 가 막을 수 없다(⑳) | 가드 A·B — 실패 시 중단·보고 · **(3회차 · [A2] R3) 가드 C — 이전 동기화 PR 의 squash 머지 감지 · 복구 `-s ours` PR(즉시)** | 가드 스크립트 | 재병합 중간 · 이력 중복 편도 |
| **I-16** *(2회차)* | **태그** | fetch 의 태그 자동 추종 → 서비스 태그(fin 27 · fit 85)가 pleiades 로 → 릴리즈 절 `git push origin --tags` 가 pleiades 원격에 올린다 | **`--no-tags`**(clone·fetch) · 릴리즈는 **`git push origin v<X.Y.Z>`**(태그 하나 명시 · workflow 릴리즈 절 정정 — §9) | 없음 | pleiades 원격 태그 삭제(즉시) · 릴리즈를 트리거했다면 중간 |
| **I-17** *(2회차)* | **`@멘션`** | 가져온 커밋 메시지의 `@user` 가 알림을 보낼 가능성(X13) | 선택지(Q62) — 무해화하면 메시지 원문이 바뀐다 | callback | 알림은 편도 |
| **I-18** *(2회차)* | **push protection** | 가져온 이력의 플레이스홀더(fin `PRIVATE KEY` 헤더)가 M-1 push 를 막을 수 있다(X14) | 막히면 **우회(bypass)하지 않고 사용자에게 보고** — 서비스 영향은 없다(push 가 거부될 뿐) | GitHub | — |
| **I-19** *(2회차)* | **서비스 배포 스크립트를 pleiades 에서 실행** | `apps/*/deploy/deploy.sh`·`ecosystem.config.js` 는 cwd 기준 — 실행하면 pleiades 에서 `git fetch origin --tags` → `git checkout -f`(pleiades 작업트리 파괴) · fit `ecosystem.config.js` 는 서버 절대경로 | **실행 금지**(fin 하네스의 `./deploy/deploy.sh dev` 지시 포함 — I-10) | 훅(M-0) | 작업트리 복구(중간) |
| **I-20** *(2회차)* | **Dependabot** | 켜면 pleiades 에 `apps/*` 의존성 PR 이 열린다(서비스 무관 · 갈라짐) | **켜지 않는다**(현재 꺼짐 ㉕) | — | 즉시 |
| **I-21** *(3회차)* | **pleiades 안에서 filter-repo 실행** | `git-filter-repo --force …` 에 `cd`/`-C` 가 없으면 **현재 디렉터리를 재작성**하고 `--force` 는 fresh-clone 검사도 끈다 — pleiades 에서 실행하면 로컬 이력 재작성·reflog 만료([A2] R4 · 서비스 영향 0 · pleiades 사고) | `(cd "$T/…" && …)` 로만 · 스크립트가 먼저 `realpath "$T"` 가 pleiades 밖인지 검사 | 스크립트 · 훅 | 원격 무사 → **중간**(재클론) · 미커밋 작업 손실 |

> **이관 이슈 정책(#83)은 I-1 에 걸린다.** 새 발견은 pleiades 이슈에만(Q55). 대장 #82 는 동결.

---

## 6. 남은 미결 질문

번호는 003 Q48 다음을 잇는다. **결정된 것은 표 아래 "소진" 에 모았다.**

| | 질문 | 무엇을 가르는가 | 권고 | 우선 |
|---|---|---|---|---|
| **Q51** | 설치·lock 전략 — L2 / L1 / L3 | 서비스 버전 동일성(⑪) · override 수동 병합(⑫) | **L2** | **높음 — M-2 전** |
| **Q52** | CI 필수 체크 · DB | 수용 PR 머지 차단 여부 | DB = Actions postgres 컨테이너. **서비스 CI 와 같은 단계만 필수** · **워크플로우 `paths` 필터 없이**(필요하면 job 안 skip) · 추가분 비필수 | 중간 — M-3 |
| **Q54** | 동결 산출물 최종 처리 | pleiades 가 무엇을 정리하나 | 서비스 원격 브랜치·이관 이슈·서버 잔여는 **pleiades 가 영구히 건드리지 않는다**(사용자 단독). ~~로컬 worktree 는 M-5a 이후 제거 제안(원본 `.git/worktrees` 메타데이터만)~~ **정정 (2회차 · [A] N11):** `git worktree remove` 는 **원본 `.git` 에 쓰고** worktree 의 ignored 파일(`.env` · `node_modules`)을 **지운다** — I-11 과 같은 성격이다. **worktree 처리도 사용자 단독 결정**으로 두고, pleiades 는 위 사실만 기록한다. #95 는 M-5a 이슈로 대체하며 닫는다(pleiades 이슈) · #82 는 동결 표기 | 낮음 |
| **Q54b** | 수용 주기 | 갈라짐 누적 · traffic 흔적 빈도 | 세션 시작 판정(`ls-remote`) + **M-5a·M-5b 착수 직전 필수 0** | 낮음 |
| **Q55** | 이관 이슈 정책(#83) 대체 | I-1 | **pleiades 이슈에만** | **높음 — M-0** |
| **Q56** | pleiades GitHub 텍스트의 서비스 참조 표기 | I-2 | ~~코드 스팬으로만~~ **비링크 형식 `fin#N`·`fit#N`**(소유자 없음 · [A] B2) · 과거 문서·PR 은 소급 안 함 · ~~X11 확인 후 확정~~ **X11 확인됨(3회차 · [A2] R2 — 렌더 links=0 · 코드 스팬 한정 참조는 커밋 추출 미확인 → 비링크 권고 유지)** | 중간 — M-0 |
| **Q56b** | 차단 훅 | 실수 방지 | **둔다** — 메서드·필드 플래그 검사 · deploy 실행 거부 포함([A] N13) | 중간 — M-0 |
| **Q57** | `apps/*` 에서 서비스 결함을 고치나 | 갈라짐 | **고치지 않는다** — 비필수 체크 + pleiades 이슈. 예외는 M-5 대상 파일 | 중간 — M-3 |
| **Q58** | 하네스 — `bin/claude-with` · `apps/finance/.claude/`(서비스 판) · 동결 fit 하네스 | I-10 · I-19 | `bin/claude-with` **소진**(`repos/*` 동결 · 대상이 사라졌다 — ~~"서비스 하네스는 서비스 워크플로우 지시다" 만으로 차단된다는 1회차 논리는 지연 로드로 무효~~). `apps/*/.claude/` **수정하지 않는다**. **지연 로드 대응: 룰 한 줄(효력 없음 · pleiades 우선) + `claudeMdExcludes` 실험 후 적용**([A] U8). **정정 (3회차 · [A2] R8): `claudeMdExcludes` 는 CLAUDE.md·rules 만 · skill·agent 발견 차단 수단은 미확인 — 실제 방어선은 룰 한 줄 + I-19 훅.** 동결 fit 하네스는 가져오지 않는다 | **높음 — M-0** |
| **Q59** | 002 단계 0 | 서비스 경로 불가 · 로컬 빈 DB 로는 가치 검증 불가 | **보류** · Q23 소진 | 낮음 |
| **Q60** | 전환(cutover) | 원칙이 풀리는 유일한 지점 · 첫 릴리즈(#88) | **별도 스펙(007 가칭)** — M-6 이후 | 낮음(지금) · 필수(첫 릴리즈 전) |
| **Q61** | 1b-2 스키마 변경 | 전환 편도 누적 | **전환 설계 전 스키마 무변경** | 낮음 — M-6 |
| **Q62** *(2회차)* | 가져온 메시지의 `@멘션` 무해화 | I-17 · 메시지 원문 보존 | **무해화한다**(`@` 뒤 제로폭 문자 등 — 결정적 치환). X13 이 "알림 없음" 으로 확인되면 생략 가능. **M-1 이후 바꾸면 재작성 SHA 가 달라져 가드 B 가 실패**하므로 M-1 전에 정한다. **3회차 · [A2] §4 확인: 제로폭 무해화 `@​sagan` links=0 · 대가: `@prisma/client` 류 검색이 깨진다** | **높음 — M-1 전** |
| **Q63** *(2회차)* | 서비스 원 SHA 트레일러의 **단위** — 수용 머지 커밋에만 / **커밋마다**(`commit-callback` 의 `original_id`) | 개별 파일 이력을 서비스 커밋으로 역추적할 수 있나 | **머지 커밋 트레일러는 필수**(가드 A 입력). 커밋마다는 **X15 결정성 확인 후** 추가 — Q62 와 같은 이유로 M-1 전에 정한다 | **높음 — M-1 전** |
| **Q65** *(2회차)* | M-1 대형 PR 의 봇 자동 리뷰 | Codex 쿼터(X8) · 리뷰 가치(이미 리뷰된 코드) | draft 로 열어 자동 리뷰를 피할 수 있는지 확인(X8) · 불가하면 9-3 "봇이 돌지 않을 때" 와 같은 대체 경로로 두고 사용자 확인 | 중간 — M-1 |
| **Q66** *(2회차)* | filter-repo **설치·고정 방식** | U97-5 ⑤ · 가드 B 안정성 | pleiades 밖 고정 경로의 venv 에 **정확한 버전 핀**(~~측정 버전 `a40bce548d2c`~~ **`git-filter-repo==2.47.0`** — 3회차 · [A2] R5: `a40bce548d2c` 는 `--version` 출력이라 pip 핀 불가) · `tools/import/VERSIONS` 에 **`git-filter-repo --version`·`git --version` 출력**·callback 해시 기록 · 시스템 패키지 관리자 설치는 버전이 움직이므로 쓰지 않는다 · **git(Apple Git 2.50.1)은 venv 로 고정할 수 없다 → git 드리프트는 가드 B 가 잡는다** | **높음 — M-0** |
| **Q67** *(3회차 · [A2] F3)* | **동기화 PR 만 별도 규칙을 둘까** — 예: 머지 방식 강제 수단(동기화 PR 에만 merge commit 을 강제하는 장치) | pleiades ruleset 은 squash 를 허용하고 평소 squash 를 쓴다(`d9d1535 … (#90) (#93)`) → **동기화 PR 머지 방식이 사람 실수에 달린다**([A2] R3) | **가드 C 로 충분 · 추가 강제는 불필요** — 가드 C 가 다음 수용 전에 반드시 감지하고 복구(`-s ours` PR)가 즉시다. **단 squash 실수 2회 전례(#75 · #501)를 근거로 사용자가 판단**한다 | 중간 — M-1 전 |

**소진·결정 (2회차):** ~~Q49~~ → **U97-5**(filter-repo) · ~~Q50~~ → 경로 이력이 살아나 **소진** · ~~Q53~~ → **U97-7** · (1회차에 없던) DB 위치 → **U97-8** · 원칙 경계 → **U97-6**.

<details><summary>1회차 미결 표의 바뀐 행 (기록)</summary>

- ~~Q49 "★X1·★X2 측정 후 결정 … ★X1 = 0 이면 (a)"~~ → U97-5
- ~~Q50 "(a) 를 택할 때 경로 이력 끊김 — 수용하고 헬퍼"~~ → 소진
- ~~Q53 "M-4 에서는 발급하지 않는다 · M-5a 착수 전 발급"~~ → U97-7
- ~~Q52 "앱 job 을 필수로" (paths 필터 병행)~~ → N9 정정
- ~~Q56 "코드 스팬으로만"~~ → B2 정정
</details>

---

## 7. 판단이 바뀐 것

| 이전 결론 | 어디 | 무엇이 뒤집었나 |
|---|---|---|
| *"단계 4 진입 조건 = 도메인 #3"* + 병렬 관측 지표 | 002 §4 | U97-4. 관측 지표는 관측 전 소진(git dep 소비자가 생기지 않았다) |
| *"단계 4 를 앞당기지 않는 근거 3개"* | 003 §2-3 | ① 배포 재설계·릴리즈 격리 상실 — 이 문서는 배포를 건드리지 않는다 → **전환(Q60)으로 이월**(사라지지 않는다) ② 3방향 전파 — pleiades 안에서만 · 1a-1 테스트 93건이 L3 를 일부 검증 ③ 캘린더 없음 — 사용자가 순서를 바꿨다 |
| *"worktree 는 계단이 아니다 … 승계되는 것은 `integration/pleiades` 의 커밋 이력뿐"* | 004 §2-4 | 그 이력도 승계되지 않는다 — 가져오는 것은 서비스 `dev`(⑰) · worktree 는 동결 |
| *"중첩 `.claude/` skills·agents 미발견"* *(2회차)* | 004 §3-2 | **gitignored 조건의 값이었다.** 추적되는 `apps/*` 에서는 CLAUDE.md·rules 지연 로드 + skill 발견(⑧) |
| *"`next build` DB 요구 없음"* *(2회차)* | measured-facts 1a-0/1a-2 · CLAUDE.md 2026-09-11 문단 | **fit 한정.** fin 은 스키마 DB 필요(㉑) |
| *"두 `package.json` 의 git URL → 워크스페이스 `"*"` 1줄"* | 003 §2-1 | `file:` 1줄(동작 실측 ㉒) · 그 1줄은 수용 충돌 후보 · **`prepare` 는 여전히 하중**(㉒) |
| Q15 · Q28 · Q47 ALT-d · Q48 · Q45 · Q42 · Q44 β2 | 003 | 소비 경로 변경으로 **소진**. ALT-d 는 **위임 키만** 소진 · `prepare` 유지 |
| 1a-3 등급 U-8 | 1a-3 계획 · #95 | 이 문서 범위 안에서 **즉시 고정** |
| 서비스 dev 를 서비스 저장소 안에서 받는다(#70) | workflow.md | pleiades 안에서 · filter-repo 재작성으로(§4-S). 머지 커밋·squash 금지·리뷰 범위는 승계 |
| 이관 이슈는 고치는 저장소에(#83) | workflow.md 5절 | pleiades 에만(Q55) |
| `bin/claude-with` 대상 = worktree(#80) | CLAUDE.md · 005 | 소진(Q58) |
| *(2회차)* "`git subtree` 로 이력 포함"(U97-1 원문) | #97 | **U97-5 — filter-repo.** subtree 는 서비스 한정 참조를 push 로 서비스 타임라인에 남긴다(편도 · 원칙 위반) |

---

## 8. 제외 사항

| 제외 | 이유 | 언제 다시 |
|---|---|---|
| 전환(cutover) | 원칙과 정의상 충돌 | Q60 · 첫 릴리즈 전 필수 |
| 캘린더 · 도메인 모듈 계약 | U97-4 순서 밖 | M-6 이후 |
| 인바운드 봇 통합(Q3) · 단일 DB(Q7) · 단일 웹 UI | 002 §5 | 전환 이후 |
| 서비스 결함 수정 | Q57 | — |
| 동결 산출물의 삭제(원격 브랜치 · 이관 이슈 · worktree · 서버 잔여) | U97-3 · Q54 — **전부 사용자 단독** | — |
| workspaces 도입 | Q51 L2 | 전환 설계 |
| gitleaks 급 스캔 도구 설치 | X5 | M-1 전 선택 |
| ~~★X1 GitHub 재현용 테스트 저장소~~ | **소진**([A] N15) | — |
| filter-repo 버전 올림 | 가드 B 가 깨진다 · 전 이력 재병합 | 필요가 생기면 별도 결정 |

---

## 9. 상위 문서 개정 목록 (정본 반영 시 — **삭제 없음**)

표기: **소진** · **정정** · **보류** · **추가**. 전부 되돌리기 **즉시**(문서·설정).

| 문서 · 위치 | 표기 | 무엇 |
|---|---|---|
| **002** §4 단계 4 진입 조건 · 병렬 관측 지표 | 정정 | U97-4 · 관측 전 소진 |
| 002 §4 단계 0 · 상태 줄 | 보류 | Q59 |
| 002 §4 단계 1 정정 블록의 서버·재시작 서술 | 소진 | 배포 경로 범위 밖 |
| **003** §1 Q15 · §1-1 정정들 · §10 Q48 | 소진 | 소비자 `apps/*` · `file:` |
| 003 §2-1 · 1a-0 ALT-d | 정정 · **부분 소진** | `file:` 1줄 · **위임 키만 소진 · `prepare` 유지**([A] N8) |
| 003 §2-2·§2-4 | 소진 | git dep 이 생기지 않았다 |
| 003 §2-3 근거 3개 | 정정 | ①은 전환으로 이월 |
| 003 §5-2 1a-3·1a-4 행 · §8-1 | 소진 | M-5 · 즉시 고정 |
| 003 §10-1 10조건 · Q42·Q44·Q45 | 소진(3·4·7) · 정정(→ M-4 L-1~L-9) | 조건표 정본은 006 §4-6 |
| 003 Q46 | 정정 | 발급 = M-4(U97-7) |
| **004** 전체 · §2-4 · §7 · Q23 · Q24 | 소진 · 정정 | worktree 동결 · Q23 소진 · Q24 계속 유예 |
| **004 §3-2** *(2회차 · [A] N16)* | 정정 | "중첩 `.claude/` 미발견" 은 **gitignored 조건** 값 · 추적 경로에서는 CLAUDE.md·rules 지연 로드 + skill 발견(⑧) |
| **005** §4-5·§4-6 · `bin/claude-with` | 소진 | Q58 |
| **005 "저장소에 남은 하네스는 자동 로드되지 않는다"** 류 서술 *(2회차 · N16)* | 정정 | `apps/*` 에서는 지연 로드된다 |
| **`workflow.md`** 브랜치 전략 대상 저장소 행 · `dev 수용` 행 · 7절 base 표 · 5절 이관 · 8절 `repos/*` 행 · 10절 | 소진 · 정정 | I-1 · §4-S · **8절에 `apps/finance`(선행: `pleiades_fin` + `prisma migrate deploy` · M-5 후 루트 `npm ci`) · `apps/fitness`(선행: `prisma generate` · M-5 후 루트 `npm ci`) 행 추가** |
| **workflow.md 릴리즈 전략 절** *(2회차 · N14)* | 정정 | `git push origin --tags` → **`git push origin v<X.Y.Z>`** |
| workflow.md 9-0 | 정정 | `apps/**` 변경 — 에이전트 필수 |
| `.claude/skills/dual-repo-change` · `agents/dual-repo-operator` | 소진 | 승인 게이트 개념만 `apps/*` 변경 규약으로 |
| `.claude/skills/pleiades-resume` Step 2 | 정정 | `ls-remote` ↔ `Service-Dev` 트레일러 · secrets 0 점검(I-9) |
| `.claude/skills/pleiades-handoff` | 정정 | #82 동결 |
| *(2회차 · N16)* `.claude/skills/pleiades-codex-loop`(15곳) · `pleiades-orchestrator`(6) · `reversibility-audit`(3) · `repo-measure`(3) · `orphan-check`(1) | 정정 | `repos/*`·대상 저장소·이관 서술 → `apps/*`·pleiades 이슈 |
| *(2회차 · N16)* `.claude/agents/repo-surveyor`(7) · `reversibility-auditor`(3) | 정정 | 측정 대상 = `apps/*` + 서비스 원격 https 읽기(스크래치) |
| *(2회차 · N16)* `docs/research/claude-code-mechanisms.md`(4곳) | 정정 | 중첩 로드 실측(⑧) |
| **`docs/research/measured-facts.md`** | 추가 · **정정** | [S2] 결과 추가 · **1a-0/1a-2 "`next build` DB 요구 없음" → fit 한정** · 004 §3-2 인용부 정정([A] N6·N16) |
| `CLAUDE.md` 상태·대상 저장소 절·작업 규칙·핵심 전제 4 · **하네스 절**(2회차 · N16 — `--add-dir`·`claude-with`·"자동 로드되지 않는다") | 정정 | 원칙 1줄 · `repos/*` 동결 · 하네스 절 소진·지연 로드 |
| *(2회차 · N16)* 아티팩트 `docs/artifacts/integration-artifact.html`(18곳) | 정정 | 발행 절차(read → 병합 → 재발행) |
| *(2회차 · N16)* `.gitignore`(`repos/` 줄 · Grep 안내) | 정정 | `repos/` 줄은 동결 동안 유지 · `apps/` 는 추적 → Grep 이 `apps/` 를 검색한다는 안내 |
| *(2회차)* `tools/import/` | 추가 | M-0 |
| *(3회차 · [A2] R10 ①)* **`.claude/settings.json`** | 추가 | 훅(Q56b — `gh api` 메서드·필드 플래그 · graphql `mutation` · `repos/*` 안 git · `ssh` · deploy 실행 · pleiades 안 filter-repo) · `claudeMdExcludes`(CLAUDE.md·rules 한정 · Q58) 위치 |
| *(3회차 · [A2] R10 ②)* **`docs/research/measured-facts.md` — [S2] X2 "남은 `#N` 0"** | 정정 | `/#N` fin 3 · fit 3 잔존(`/#383`·`/#407` · callback `(?<![\w/])#` 이 건너뜀) |
| **이슈** #95 · #96 · #82 · #66 | 소진 · 흡수 · 동결 · 정정 | 1회차와 같다 |
| **CI** `ci.yml` · `security-audit.yml` | 무변경 | `apps-ci.yml` 신설(M-3) |

---

## 10. 유효기간

| 조건 | 무엇을 다시 여나 |
|---|---|
| ~~★X1·★X2 측정 결과~~ | ~~Q49~~ — **소진(U97-5)** |
| **X11(비링크 형식이 링크되지 않는가)이 거짓으로 드러날 때** *(2회차)* | U97-5 ② 치환 형식 · M-1 push 보류 — **3회차 · [A2] R2: 렌더로는 확인됨 · 틀려도 pleiades 이슈 잡음(편도)뿐 · 서비스 영향 없음** |
| **가드 C 가 실패할 때(동기화 PR squash)** *(3회차)* | Q67 — 머지 방식 강제 수단 재검토 |
| **가드 A 또는 B 가 처음 실패할 때** *(2회차)* | §4-S 수용 절차 · 서비스 쪽 이력 정책(사용자) |
| M-4 완료(첫 목표 달성) | M-5 이후 순서 |
| 수용 충돌이 M-4 이전에 발생 | §4-S 무충돌 가정 |
| M-6 완료 또는 전환 논의 | Q60 → 별도 스펙. 그때까지 원칙은 절대다 |
| 서비스 저장소 중 하나가 PRIVATE 으로 바뀔 때 | 수용 출처(https 무인증)가 깨진다 |
| **X8 이 "같은 계정" 으로 확인될 때** *(2회차)* | I-8 · 원칙 적용 범위(사용자) |
