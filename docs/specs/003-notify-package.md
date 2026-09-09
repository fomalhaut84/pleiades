# 003 — `@pleiades/notify` 패키지 설계 (002 단계 1 상세)

작성 2026-09-03 · 상태 **방향 확정 · 1a 착수 대기**
읽기용 아티팩트: **없음** (미발행)
(**정본은 이 파일이다.**)

> **개정 2026-09-04 (이슈 #7) — 정정 병기본.** 이슈 #2·#4 의 측정이 이 문서의 숫자 여러 건을
> 뒤집었다. **기존 서술은 한 줄도 지우지 않았다.** 틀린 자리마다 정정 블록을 병기했고,
> 새로 확정된 사실은 **발견 16~23** 으로 승격했다.
>
> | 절 | 무엇이 바뀌었나 | 출처 |
> |---|---|---|
> | §3 발견 16~23 | 루프 22곳 전수 분류 · 부수효과 게이트 · `chatIds` 전파 · 로그 표면 · U1 원인 (신규) | #4 · #2 |
> | §4-2 | `targetCount()` 청구서 "가드 2곳" → **21지점**. 파사드에 **목록 반환 표면**과 **context 인자**가 빠져 있다 | #4 |
> | §5-1 | `length===0` 가드 2 → **10곳**. *"`getAllowedChatIds` 4곳 제거"* → **완전 제거 가능은 1곳** | #4 |
> | §5-2 | *"Q10 이 아니오면 1a 는 관측 가능한 동작 변경 0"* **불성립** (fin `rsu.ts:184`). 1a-4 되돌리기 "21개 지점" → **60+ 지점** | #4 |
> | §9 | **U1 해소 — 결론은 맞았고 원인이 틀렸다.** blocker 는 vitest 가 아니라 fit `overrides` 의 `$postcss` 한 줄 | #2 |
> | §10 | 미결 **Q16~Q19 · Q25 · Q26** 신설 | #2 · #4 |
>
> **되돌리기 등급은 한 건도 바뀌지 않았다.** 바뀐 것은 ① **청구서의 크기**(1a-4)와
> ② *"1a 는 관측 가능한 동작 변경 0 으로 끝난다"* 는 주장이다. 후자가 이 개정의 본체다.
>
> 추가 근거 계보: `_workspace/05_surveyor_fin_loops.md` (#4 · 루프 22곳 전수) ·
> `_workspace/05_operator_u1_vitest.md` (#2 · U1 집행).


**이 문서는 개정본이 아니다.** 002 를 대체하지 않고 **002 의 단계 1(알림 어댑터 + Discord
아웃바운드)만 상세화한다.** 002 의 경로 0~4, 확정된 답 Q1·Q4·Q5·Q6, 미결 Q7·Q2·Q3 은 전부
그대로 유효하다. 이 문서가 002 에 되돌려 보내는 변경은 **두 군데뿐**이고 002 파일 안에
정정 블록으로 명시했다 — ① 단계 1 절에 "상세 설계는 003" 포인터, ② 단계 4 진입 조건에
관측 지표 1개 추가 (§2-4).

근거 계보:
`_workspace/01_surveyor_transport.md` · `_workspace/01_surveyor_porting.md` (실측) →
`_workspace/02_writer_notify.md` (초안, 감사 반영본) → `_workspace/03_auditor_notify.md`
(감사: 확인 2 / 정정 4 / 미확인 1) → **이 문서**.

> **숫자 규율.** 이 문서의 모든 개수·행번호·파일수는 위 산출물의 **인용**이다.
> 새로 측정하거나 추정한 저장소 값은 없다. 유일한 예외는 §6·§8 의 *소요 시간* 열로,
> 이는 실측이 아니라 **인용된 건수에서 유도한 작업량 추정**이며 그렇게 표기했다.

---

## 1. 확정된 답

| | 질문 | 답 | 근거 |
|---|---|---|---|
| **Q15** | 패키지 배포 방식 (`file:` / **git 의존성** / 사설 레지스트리) | **git 의존성.** pleiades 를 GitHub 에 발행하고 두 저장소가 git URL 로 참조한다 | 사용자, 2026-09-03 |
| **Q9** | 단계 1 을 1a / 1b 로 쪼개나 | **쪼갠다. 1a → 1b 순서** | 사용자, 2026-09-03 |
| **Q8** | 정본 층위 (L1 / L2 / L3) | **L3 (2층)** — `Transport` 포트 + `Notifier` 파사드 | 사용자, 2026-09-03 |
| **Q11** | 텔레그램·Discord 혼합 운영 | **허용 — 도메인별 채널 선택** | 사용자, 2026-09-03 |

### 1-1. Q15 가 왜 이 순서로 답을 받았나

감사(`03_auditor_notify.md` E1)가 확인한 사실 하나가 Q15 를 Q8 보다 앞으로 밀었다:
**pleiades 에는 `package.json` 도 git 원격도 없다** (`git -C ~/workspace/pleiades remote -v` 무출력).
세 배포 방식 중 어느 것도 현재 상태로는 성립하지 않으므로, Q15 의 답 없이는 1a 의
되돌리기 등급 자체가 확정되지 않는다.

**git 의존성이 택해지면서 확정되는 것:**

| 항목 | 내용 |
|---|---|
| 형태 | `"@pleiades/notify": "git+ssh://…#<tag>"` — 두 저장소 `package.json` |
| 선결 조건 | pleiades **GitHub 원격 발행** + 서버 2대의 **접근 자격**(deploy key/토큰) + TS 배포 시 **`prepare` 빌드 스크립트** |
| `npm ci` 와의 관계 | lockfile 이 **커밋 해시**를 핀한다. 원격 접근 실패 시 `npm ci` 실패 |
| **되돌릴 대상의 경계** | `package.json` + `package-lock.json` **안에 갇힌다.** 원격 저장소는 남겨도 무해 |
| 버려지는 배제안 | `file:` 링크 — 진입은 가장 싸 보이지만 **두 `deploy.sh` 에 pleiades 체크아웃·pull 단계 신설**이 선결이고, 되돌릴 대상이 **배포 스크립트 + 서버 파일시스템**으로 새어 나간다. 사설 레지스트리 — 호스팅 + 서버 2대 토큰 배포가 추가 |

> **정정 (2026-09-08 · 이슈 #31 · 초안 `_workspace/1a-0/02_writer_1a0.md` · 감사 3회)** **위 표의 "형태" 와 "선결 조건" 두 칸이 실측으로 뒤집혔다.**
> 기존 서술은 그대로 두고 개정본을 병기한다. 출처는 `docs/research/measured-facts.md` 2026-09-08 절 2개다.
>
> | 칸 | 기존 | 개정 |
> |---|---|---|
> | **형태** | ~~`"@pleiades/notify": "git+ssh://…#<tag>"`~~ | **`"@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#<tag>"`** — 단 **`package.json` 직접 편집**이 함께여야 유지된다 |
> | **선결 조건** | ~~서버 2대의 **접근 자격**(deploy key/토큰)~~ | **소멸.** 세 형태(`github:` · `git+https://` · `git+ssh://`) 전부 자격 증명 **불필요**하고 실제 전송은 셋 다 **https** 다 |
>
> **왜 그런가.** pacote 는 GitHub-hosted spec 을 **https 로 먼저** 해석하고 ssh 는 catch 폴백이다
> (`pacote/lib/git.js` `#resolvedFromHosted`). `git+ssh://` 라고 써도 **ssh 호출 0회**였다(대조군 — 비-hosted URL 2회).
>
> **표기가 유지되지 않는다 (설치 명령 경로).** `npm install "git+https://…"` 는 **`package.json` 문자열까지 `github:` 단축형으로 정규화**한다.
> 따라서 1a-3 집행 지시에 절차 3항목을 넣는다: **① 의존성은 `package.json` 직접 편집으로 추가 ② 설치 후 문자열이 `github:` 로 바뀌지 않았는지 확인 ③ `npm ci` 재현성 확인**(직접 편집분은 유지됨 — 실측).
> 정규화를 수용하고 `github:…#<tag>` 를 정본 표기로 삼는 대안도 있다 — 되돌리기 **즉시**(1줄), 대가는 표기가 npm 단축형이 되는 것뿐이다.
>
> **lockfile 은 어느 형태든 `git+ssh://` 로 적히고 `integrity` 는 없다** — 그러나 **커밋 SHA 로 핀되므로 재현성은 보장된다.**
> lockfile 의 `git+ssh://` 를 **요구사항으로 읽으면 안 된다**(그것이 §5-2 "딸린 소멸" 오정정의 원인이었다 — 아래 정정 참조).
>
> **`prepare` 는 남지만 실행 시점이 다르다** — 설치 1회가 아니라 **`npm ci` 마다**다. 두 저장소 `deploy/deploy.sh` 가 `npm ci` 를 쓰므로
> **배포마다 서버에서 클론 + devDeps 설치 + `tsc`** 가 돈다(§8-1 정정 참조).
>
> **→ Q28 은 소멸했다.** 답: **형태 = `git+https://…#<tag>` + 직접 편집 절차** (사용자 확인 2026-09-08 · 이슈 #31).

### 1-2. Q8 = L3 — 무엇을 채택했나

`Transport`(포트, 채널 1개 · 대상 1개)와 `Notifier`(파사드, 라우트 1개 · 대상 N개)의 2층.
마이그레이션 청구서는 L2(broadcast 단일층)와 **동일**하다 — 호출부가 파사드를 쓰기 때문이다.
2층으로 나누는 것은 **공짜로 얻는 구조**이고, 이유는 §3 발견 8 과 §4-1 이다.

### 1-3. Q9 = 쪼갠다 — 순서가 강제된다

**1a = 인터페이스 추출 + Telegram 어댑터(채널 전환 없음)** / **1b = Discord 아웃바운드 전환.**
역순·병행은 성립하지 않는다. 002 §3 이 인바운드에 대해 쓴 원칙 — *"저장소별로 각각 Discord 로
옮기면 안 된다. 비싼 작업을 두 번 하고, 통합할 때 버린다"* — 이 아웃바운드에도 그대로 적용된다.
층위가 다른 두 초크포인트(발견 8)에 각각 Discord 를 붙이면 정확히 같은 일이 벌어진다.

### 1-4. Q11 = 허용 — 1a 설계에 붙는 요구사항 둘

혼합 운영(도메인별 채널 선택)을 허용하면 **1a 가 미리 해둬야 하는 것이 둘** 생긴다.

1. **`Route → Transport` 매핑을 설정으로 뺀다.** 이걸 1a 에서 안 하면 1b 의 되돌리기가
   "env 플립"에서 "코드 revert + 재배포"로 한 등급 올라간다.
2. **HTML→Discord-md 역변환기의 위치가 `Transport` 직전으로 강제된다.** 같은 `Content` 가
   텔레그램(HTML 유지)과 Discord(md 변환)로 **동시에 fan-out** 될 수 있으므로, 채널 무관 층인
   파사드에서 변환하면 **텔레그램 배송이 깨진다.** (§4-3)

---

## 2. 딸린 확인 — 두 저장소는 결국 pleiades 아래로 들어온다

Q15 를 답하면서 사용자가 함께 물었다:

> **"그치만 결국 myFitness와 myFinance도 pleiades 아래에 들어와야 하지 않을까?"**
> — 2026-09-03

**맞다.** 그것이 002 의 **단계 4(B2 모노레포)** 이고, 진입 조건은 002 가 이미 확정했다 —
**"도메인 #3(캘린더)을 실제로 붙일 때"**(002 §4 단계 4 표). 이 확인은 로드맵을 바꾸지 않는다.
바꾸는 것은 **1a 의 설계 요구사항 하나**와 **버전 드리프트의 해석**이다.

### 2-1. 요구사항 — 패키지를 처음부터 `packages/notify/` 에 둔다

**1a 의 설계 요구사항으로 명시한다.** 패키지 경로는 pleiades 저장소 안의
`packages/notify/` 이고, 이는 **모노레포에서 갖게 될 바로 그 경로**다
(002 §4: `apps/{finance,fitness,calendar}` + `packages/{notify,mcp-core,advisor}`).

그러면 단계 4 이행이 이렇게 끝난다:

| 단계 4 에서 하는 일 | 패키지에 미치는 영향 |
|---|---|
| 두 앱을 `apps/{finance,fitness}` 로 이동 | 패키지 **무관** |
| 두 `package.json` 의 git URL 의존성 → 워크스페이스 `"*"` 로 교체 | 의존성 **선언 1줄** |
| 원격 발행 단계 삭제 | 배포 설정 |
| `prepare` 빌드 스크립트 삭제 | 빌드 설정 |
| **`packages/notify/` 자체** | **움직이지 않는다** |

> **정정 (2026-09-08 · 이슈 #31 · 초안 `_workspace/1a-0/02_writer_1a0.md` · 감사 3회)** **위 표에 행이 하나 빠졌다 — 루트 `package.json` 이다.**
> **npm 은 git 의존성에서 클론 *루트* 의 `package.json` 만 읽는다**(루트에 없으면 `ENOENT`, EXIT 254 · 서브디렉터리 지정 문법은 npm 10 문서에 **없다**).
> 그러므로 §2-1 이 그린 형태(루트 = `name:"pleiades"` · `private` · `workspaces`)를 **그대로 두면 소비가 불가능하다** —
> 그 형태로 설치하면 `node_modules/**pleiades**/` 로 들어오고 `prepare` 가 돌지 않아 `require('@pleiades/notify')` 가 `MODULE_NOT_FOUND` 다.
>
> **채택된 형태 (Q47 = ALT-d 위임형 · 사용자 2026-09-08 · 이슈 #31):**
> 루트 `package.json` 을 **신설**하되 `name:"pleiades"` · `private:true` 를 유지하고,
> **`main`·`types`·`exports`·`files`·`prepare` 5키가 `packages/notify/dist` 를 위임**한다.
> 설치 경로는 루트 `name` 이 아니라 **소비자 `dependencies` 의 키**가 정하므로(실측), 소비자가 키를 `@pleiades/notify` 로 적으면
> `node_modules/@pleiades/notify/packages/notify/dist/` 로 들어오고 `require`·`tsc --noEmit`(fin·fit 동일 옵션)이 통과한다.
> **`workspaces` 는 1a-0 에 넣지 않는다** — 넣으면 임시 클론의 루트 설치가 워크스페이스 멤버의 devDeps 까지 끌어와
> 소비자 `npm ci` 가 **2.14 s → 3.67~3.96 s**, npm 캐시가 **19 MB → 134 MB** 로 는다(실측).
> **`peerDependencies` 도 1a-0 에 넣지 않는다** (§10 Q47 · 아래 §8-1 정정).
>
> **그래서 위 표의 마지막 두 행은 이렇게 개정된다:**
>
> | 단계 4 에서 하는 일 | 패키지에 미치는 영향 |
> |---|---|
> | **루트 `package.json`** *(신설 행)* | **6키 처리 + 1키 추가** — 삭제 5(`main`·`types`·`exports`·`files`·`prepare`) + **`peerDependencies` 를 `packages/notify` 로 이동** 1 + **`workspaces` 추가** 1. `scripts.build/typecheck/test` 는 **재작성**. **유지: `name`·`version`·`private`** |
> | **`packages/notify/` 자체** | **움직이지 않는다** (원 서술 유지 — 실측으로 재확인) |
>
> **따라서 *"버려지는 것은 원격 발행 설정과 `prepare` 빌드 스크립트뿐"* 은 그대로는 성립하지 않는다.**
> 정확히는 **키 5개(`main`·`types`·`exports`·`files`·`peerDependencies`)를 더하고 `scripts` 재작성을 붙이면 성립한다.**
> **승계되는 것은 `packages/notify/` 디렉터리와 루트의 정체성(`name`·`private`)이다** — 경로 주장(§2-1 서두)은 실측으로 재확인됐다.

**버려지는 것은 원격 발행 설정과 `prepare` 빌드 스크립트뿐이다.** 1a 작업량의 대부분 —
인터페이스(§4)·구현·테스트(§5-2) — 은 **그대로 승계된다.** 반대로 패키지를 임시 위치에 두면
단계 4 에서 경로 이동 + 두 저장소의 import 경로 재작성이 추가된다.

### 2-2. 발견 (g) 버전 드리프트의 재해석

감사 발견 (g)(주장 2-g)는 1a 의 목적 서술을 정정했다:

> 1a 는 드리프트를 **없애지 않는다. 코드 드리프트를 버전 드리프트로 옮긴다** —
> lockfile 2개 · 핀 2개 · 패키지를 한 번 고칠 때마다 **PR 2개.**
> 한쪽이 버전을 안 올리면 다시 갈라진다.

모노레포에서 이 구조는 **소멸한다.** 워크스페이스 의존성은 lockfile 이 하나이고 핀이 없고
PR 이 하나다. 즉 **버전 드리프트의 누적은 단계 4 를 앞당길 근거가 된다.**
1a 는 이 근거를 만들어내는 장치이기도 하다 — 002 가 원래 원했던 "관측된 아픔"의 형태다.

### 2-3. 그럼에도 단계 4 진입 조건을 지금 앞당기지 않는 근거 3개

| # | 근거 |
|---|---|
| 1 | **B2 는 되돌리기 비용이 가장 높다.** 실서비스 2개의 배포 파이프라인을 **동시에 재설계**해야 하고, **릴리즈 격리를 잃는다**(002 Q2 가 아직 미결이다). 이 저장소의 원칙(되돌리기 비용 순)에서 가장 마지막에 오는 항목이다 |
| 2 | **1a 가 인터페이스(L3 층위 선택)가 맞는지를 싸게 검증한다.** 층위가 틀렸다면 모노레포 안에서 고치는 쪽이 더 아프다 — 두 앱이 한 트리에 있으면 잘못된 추상화가 즉시 3방향으로 퍼진다. 1a 는 되돌리기 "중간"에서 그 검증을 끝낸다 |
| 3 | **캘린더는 아직 존재하지 않는다.** 도메인 #3 이 코드로 있기 전까지는 실제 시간 간격이 있고, 그 간격 동안 1a 가 운영된다 |

### 2-4. 002 에 되돌려 보내는 관측 지표

002 §4 단계 4 진입 조건에 다음을 **추가했다** (002 파일에 정정 블록으로 반영 완료):

> **1a 운영 중 패키지 수정 PR 2개짜리 왕복이 반복적으로 성가시면, 그것이 단계 4 를 앞당길 증거다.**

002 §4 의 진입 조건은 원래 *"도메인 #3(캘린더)을 실제로 붙일 때"* 하나였다. 이 지표는 그것을
대체하지 않고 **병렬 조건**으로 붙는다 — 001 이 요구했으나 002 가 "요구사항 그 자체"로
격상하면서 잃었던 **관측된 아픔** 형태의 근거를 되살린다.

---

## 3. 실측 근거 — 발견 8~15

숫자는 전부 인용이다. 출처: `docs/research/measured-facts.md`,
`_workspace/01_surveyor_transport.md`, `_workspace/01_surveyor_porting.md`,
`_workspace/03_auditor_notify.md`(감사 실측). 002 의 발견 7 다음 번호를 이어 받는다.

### 발견 8 — 두 초크포인트는 **추상화 층위가 다르다**

| | myFinance `sendHtml` | myFitness `sendToAll` |
|---|---|---|
| 시그니처 | `(bot, chatId: number, html: string): Promise<void>` (`bot/utils/telegram.ts:56`) | `(bot, text: string): Promise<SendResult>` (`bot/notifications/send.ts:77`) |
| 수신자 | **인자로 받음**, 1건 | **자기가 env 조회**, N건 |
| chatId 루프 | **호출부가 돈다 — 22곳** | **초크포인트가 흡수 — 2곳, 둘 다 `send.ts` 내부** |
| per-chat try/catch | 21 / 22 | (초크포인트가 집계) |
| 수신자 목록 함수 | `getAllowedChatIds()` **4중 복제** (`lib/cron.ts:13`, `budget-alert.ts:14`, `scheduler.ts:21`, `retry/route.ts:29`) | `getChatIds()` **1곳** |

→ 하나의 인터페이스로 묶으면 **한쪽은 반드시 호출부 마이그레이션이 붙는다.** Q8 이 그 질문이었다.

> **정정 (2026-09-03 감사 반영 · 주장 2).** `getAllowedChatIds` 정의 행번호를 14/15/22/30 →
> **13/14/21/29** 로 고쳤다. 전부 −1 이다. 원 출처 `_workspace/01_surveyor_transport.md` §1-3 의
> 표에는 오차가 남아 있다 (그 파일은 이 문서가 고치지 않는다 — 인용 시 주의).

> **정정 (2026-09-03 감사 반영 · 발견 E6).** 아웃바운드 chat id 파싱 지점은 4곳이 아니라 **5곳**이다.
> `lib/ai/advisor-monitor.ts:199` 가 `TELEGRAM_ADMIN_CHAT_IDS` 를 **인라인으로** 파싱한다
> (`!Number.isNaN` 사용). `getAllowedChatIds` 라는 **이름을 쓰지 않아서** 4중 복제 집계에 잡히지
> 않았다. 등급 축이 ADMIN 이라 §4-4 의 `Route` 가 흡수해야 할 대상이고, §5-1 의
> "`getAllowedChatIds` 4곳 제거"는 **5번째 지점을 포함하지 않는다.**

### 발견 9 — `Promise<void>` 는 정본 시그니처가 될 수 없다

`SendResult` 는 장식이 아니라 **분기 5곳 + DB 컬럼 2개**로 소비된다.

| 소비 지점 | 하는 일 |
|---|---|
| `scheduler.ts:35,39` · `auto-adjust.ts:402,406` · `auto-adjust-cron.ts:79,83` | `total===0` / `sent===0` 분기 |
| `lib/monitoring/admin-alerts.ts:233` | `delivered = r.sent > 0` → **rate-limit 상태 결정** |
| `auto-adjust.ts:413-419` · `auto-adjust-cron.ts:97-100` | `first.messageId` / `first.chatId` **DB 저장** |

`myFitness/prisma/schema.prisma:359-360` — `telegramMessageId String?`, `telegramChatId String?`.
myFinance 스키마의 `messageId`/`telegramMessageId`: **0건**.

> **정정 (2026-09-03 감사 반영 · 주장 1).** 초안은 소비 지점에 **"인덱스 1개"** 를 넣었다. 틀렸다.
> `@@index([telegramMessageId])`(`schema.prisma:367`)는 존재하지만 **읽기 경로가 0건**이다 —
> 전 저장소에서 `telegramMessageId` 를 **읽는** 코드가 없다. 매칭은 `callback_data` 에 embed 된
> adjustment id 로 한다(`auto-adjust-callback.ts:231-238`). 즉 **죽은 인덱스**이고 소비 지점이 아니다.
> 실제 제약은 인덱스가 아니라 **컬럼 타입 `String?`** 에서 온다. 발견 9 의 결론은 그대로 성립한다.

### 발견 10 — `chatId: number` 20건이 Discord snowflake 를 담지 못한다

`Number('1234567890123456789')` → `1234567890123456800`, 왕복 불일치
(19자리 > `Number.MAX_SAFE_INTEGER`). myFinance 아웃바운드 `chatId: number` 시그니처 **20건**,
인바운드 인증 `Set<number>` + `.map(Number)` (`middleware/auth.ts:3-9`).
myFitness 아웃바운드는 이미 `string` (`send.ts:21,41`).
**텔레그램 chat id 9~10자리에서는 드러나지 않던 문제이고, 양쪽이 비대칭이다.**

### 발견 11 — 4096 → 2000 은 상수 교체가 아니다

| | myFinance | myFitness |
|---|---|---|
| 상수 정의 | 1 (`utils/formatter.ts:50`) + 리터럴 1 (`commands/briefing.ts:98`) | **4개 독립 정의** |
| 아웃바운드 초과 처리 | **분할** (`splitMessage`) | **절단** (`send.ts:36` `slice(0, MAX-3)+"..."`) |
| 인/아웃바운드 상수 공유 | **공유** | 분리 |
| splitter 가 HTML 태그 경계를 아나 | **아니오** | **아니오** |

구조 변경 3건: (1) myFitness 아웃바운드에 **분할 로직 신규 도입** — 지금은 절단이라 한도가
절반이면 버려지는 양이 2배 이상, (2) 어느 splitter 도 태그를 몰라 한도 절반 → 분할 지점 약 2배 →
`<b>…</b>` 절단 → plain 폴백 발동 확률 상승, (3) myFinance 는 아웃바운드만 낮추려면 상수를
쪼개야 하고, 그러면 인바운드 텔레그램 경로도 함께 건드린다.

### 발견 12 — 초크포인트 예외 2곳이 하필 **키보드와 첨부**다

| | 초크포인트 경유 | 원시 `bot.api.*` |
|---|---|---|
| myFinance | 14 / 16 모듈 | **2** — `rsu.ts:184` (keyboard), `quarterly-report.ts:54` (`sendDocument` + `InputFile`, 분기 PDF) |
| myFitness | 4 / 4 모듈 | 0 (원시 호출은 `send.ts` 내부 3곳) |

`rsu.ts` 가 초크포인트를 우회하는 이유는 **myFinance 초크포인트에 키보드 지원이 없어서**다.
그리고 그 예외 둘이 정확히 Discord 이식 난도가 가장 높은 두 기능이다.

### 발견 13 — 아웃바운드에 인터랙션 루프가 2건 붙어 있다

| 플로우 | 발신 (아웃바운드) | 수신 (인바운드) | 상태 |
|---|---|---|---|
| fin RSU 베스팅 확정 | `rsu.ts:178-190`, `callback_data=vest:confirm:<rsuId>` | `commands/vest-confirm.ts:22` | callback_data 에 embed |
| fit 훈련 자동조정 수락/거절/스누즈 | `auto-adjust.ts:394` → `send.ts:98 sendToAllWithKeyboard()` | `notifications/auto-adjust-callback.ts:230` | **DB 영속** |

**아웃바운드 어댑터만 갈아서는 완성되지 않는다.** Discord components 는 interaction 응답
엔드포인트(gateway 또는 HTTP interactions endpoint)가 있어야 동작하고,
`answerCallbackQuery` / `editMessageReplyMarkup`(`auto-adjust-callback.ts:308`) 대응 개념도 다르다.
002 가 "인바운드는 텔레그램으로 둔다"고 했는데, **이 2건은 인바운드에 있으면서 아웃바운드에 물려 있다.**

### 발견 14 — HTML 은 초크포인트가 아니라 **본문 생성부**에 있다

| | myFinance | myFitness |
|---|---|---|
| 아웃바운드 모듈 중 `escapeHtml`/`h` import | **14 / 16** | 0 (템플릿 리터럴에 태그 직타) |
| `bot/notifications` HTML 태그 hits | 15 / 6 of 20 파일 | 13 / 3 of 5 파일 |
| `src/bot` 밖 아웃바운드 HTML | `lib/ai/advisor-monitor.ts:60-74` **8 hits** | `lib/monitoring/admin-alerts.ts:276-326` **11 hits** |
| `h.b/h.i/h.code/h.pre` 참조 | **91 라인 / 19 파일** | 0 / 0 (헬퍼 없음) |
| md→HTML 변환기 | `utils/markdown.ts:51` (103줄) | `utils/telegram.ts:6` (10줄) |

그리고 myFinance 에서 **HTML 은 전송 포맷을 넘어 저장 포맷**이다 —
`PRE_ESCAPED_KINDS = {target_hit, stop_loss, watch_buy, watch_zone}` 가 3개 파일에 중복 정의
(`alert-dispatcher.ts:100`, `app/alerts/history/client-utils.ts:43`,
`app/api/alerts/history/export/csv-format.ts:46`)되어 있고, 저장된 alert 메시지가 kind 에 따라
escape 됨/raw 로 혼재한다. → 이것이 §7-1 제외 결정의 근거다.

### 발견 15 — 추출 후보 목록이 틀렸다 (정정)

> **정정 (2026-09-03 재측정).** `measured-facts.md` 의 "이름이 같은 파일" 목록은
> `src/bot/utils/{error,formatter,telegram}.ts` 를 한 덩어리 B1 후보로 묶었다.
> **`formatter.ts` 는 공유 후보가 아니다** — 겹치는 export **0개**. myFinance 는 금액·수익률 포맷,
> myFitness 는 거리·페이스 포맷. 채널 중립인 것은 `splitMessage` **하나뿐**이다.
> 반대로 **`error.ts` 가 가장 좋은 후보**다 — 원시 diff 118줄이지만 export **5/5 완전 일치**,
> 정규화 diff 20줄, 실동작 차이 **2건**(`ENOTFOUND` 유무 / `sanitizeError` 최종 마스킹 유무).

부수 발견: myFinance `isHtmlParseError` **참조 0건**(죽은 export — `telegram.ts:79` 의 로컬
`isParseError`, `error_code===400` 기준을 씀). **두 저장소가 HTML 파싱 실패를 다른 기준으로 판정한다.**
`sanitizeMessage` / `getErrorCode` 는 양쪽 다 참조 0건 → 공개 API 에서 제외 가능.

### 발견 16 — 루프 22곳 전수 분류: **부수효과 0 · 수신자별 분기 0**

003 §9 가 "1a 착수 직전 측정 1건"으로 남겨둔 항목이 이행됐다(이슈 #4).
감사가 대표 4곳만 부분 수행한 것을 **22곳 전수**로 마감했다.

출처 `_workspace/05_surveyor_fin_loops.md` M0·M1 (worktree `repos/myFinance`, `integration/pleiades`,
HEAD `c549fa6`, dirty 0).

| 분류 | 뜻 | 건수 |
|---|---|---|
| (a) 순수 전송 | 본문이 전송 호출 하나뿐 | **16 / 22** |
| (b) 전송 + 결과 수집 | 반환값·성공 카운터를 모은다 | **5 / 22** |
| **(c) 전송 + 부수효과** | DB 쓰기·상태 변경이 **루프 안**에 | **0 / 22** |
| **(d) 전송 + 분기** | 수신자별로 내용이 달라진다 | **0 / 22** |
| (e) 전송 아님 / 포트 밖 | `quarterly-report.ts:52` `sendDocument` | **1 / 22** |

부수 확인 3건:

- **병렬 fan-out 0.** 22곳 전부 `await` 이 붙은 **순차 for-of**. `forEach`·`map`·`Promise.all`·
  인덱스 루프 전부 0건이고, 빈 결과가 패턴 오류가 아님을 다른 정규식으로 교차 확인해 같은 22곳을 얻었다.
- **(d) = 0 은 전수 확인값이다.** 루프 본문에서 `chatId` 를 쓰는 19줄이 **전부** (1) 전송 대상 인자
  또는 (2) 실패 로그 템플릿 문자열이다. 그 외 용도 0건.
- 메시지 본문(`message`/`html`/`fullMessage`/`msg`/`combined`)은 **22곳 전부 루프 진입 전에 확정**된다.

→ **§4-2 의 `notify(route, content)` 단일 `content` 로 22곳을 전부 커버한다.
수신자별 라우팅·개인화 설계는 1a-4 에 불필요하다.** 이 발견은 1a-4 를 **싸게** 만든다.
(003 은 이 가능성을 열어두고 있었고, 이제 닫혔다.)

### 발견 17 — 비용은 루프 **안**이 아니라 루프 **바로 밖**에 있다

(b) 5곳의 카운터가 루프 종료 직후 **부수효과를 게이트한다. 7 지점 / 5 모듈.**
출처 `_workspace/05_surveyor_fin_loops.md` M1-B.

| 소비 지점 | 카운터 | 하는 일 | 등급 |
|---|---|---|---|
| `ta-signal-alert.ts:344-354` | `sendSuccess > 0` | `sentToday` dedupe Map + `lastAiAskByTicker` AI 쿨다운 Map 기록 | 메모리 상태 변경 |
| `ta-signal-alert.ts:375-376` | `sendSuccess`, `chatIds.length` | `computeDeliveryStatus` → `recordAlertHistory` | **DB write** |
| `price-alert.ts:349-350` | 〃 | 동일 | **DB write** |
| `custom-strategy-alert.ts:301-302` | `sentCount`, `chatIds.length` | 동일 | **DB write** |
| `custom-strategy-alert.ts:304-320` | `sentCount === 0` → `return` | `prisma.customStrategy.updateMany` **2건을 스킵**(`lastTriggeredAt`·`isActive`) | **DB (게이트)** |
| `alert-dispatcher.ts:131-132` | `successCount`, `chatIds.length`, `lastError` | `RedispatchResult` → `retry/route.ts:74` `persistRetryHistory` + `:76-86` **API 응답 body** | **DB + API 계약** |
| `advisor-monitor.ts:228` | `anySuccess` | `AlertSender` 반환 → 모니터 상태 진행(`:135` `delivered`) | 상태 변경 |

**전부 루프 밖이므로 파사드가 옮길 대상이 아니다 — 정확한 값만 돌려주면 그대로 유지된다.**
§4-2 `BroadcastResult` 대조:

| 필요한 값 | 현재 출처 | `BroadcastResult` |
|---|---|---|
| 성공 건수 | `successCount`/`sendSuccess`/`sentCount` | ○ `sent` |
| 전체 대상 수 (**DB 컬럼** `AlertHistory.recipientCount`) | `chatIds.length` | ○ `total` |
| 최소 1건 성공 | `sendSuccess > 0` / `anySuccess` | ○ `sent > 0` |
| **마지막 실패 사유 문자열** | `lastError = error.message` | **△ 파생** — `deliveries.filter(d=>!d.ok).at(-1)?.error` |

→ **`BroadcastResult` 는 형태를 바꿀 필요가 없다.** 단 `lastError` 는 필드가 아니라 **파생**이므로
호출부 **4곳**(`alert-dispatcher`·`ta-signal-alert`·`price-alert`·`custom-strategy-alert`)에
한 줄씩 붙는다. **"루프 제거"는 순수 삭제가 아니라 삭제 + 파생 코드 추가다.**

### 발견 18 — `chatIds: number[]` 가 **18 시그니처 · 19 호출부**로 전파된다

출처 `_workspace/05_surveyor_fin_loops.md` M2-5·M4.

| 대상 | 건수 |
|---|---|
| `chatIds: number[]` 파라미터를 받는 함수 시그니처 | **18** (알림 진입점 16 + 내부 위임 2: `doCheckTASignals`·`runScan`) |
| `chatIds` 를 실인자로 넘기는 호출 (테스트 제외) | **19** |
| `getAllowedChatIds()` **호출** 지점 | 5 (정의는 4 — `budget-alert.ts` 가 2회 호출) |

`scheduler.ts:40` 이 만든 값 **하나**를 **13개 cron 콜백이 클로저로 캡처**한다
(`:81,95,108,121,135,148,161,186,200,213,226,243,256`).

**결정적인 것:** `quarterly-report.ts:52` 의 `sendDocument` 루프가 **목록 자체**를 요구하므로
`scheduler.ts:21` 의 `getAllowedChatIds` 정의와 `:108` 호출부는 **실질적으로 지울 수 없다.**
→ **§4-2 파사드 표면에 목록 반환이 추가로 필요하거나, `sendDocument` 를 1a 에 넣어야 한다.**
선택지와 되돌리기 비용은 §4-2 정정 블록, 결정은 **Q25**.

> **정정 (2026-09-09 · 이슈 #37).** 위 *"결정은 **Q25**"* 는 **소진된 포인터**다.
> **Q25 는 ①(`targets(route): string[]` 추가)로 확정**됐고 하위 선택 ADMIN 은 **A(실값 · fin 전용)** 다 (사용자 2026-09-09).
> 그 결과 `scheduler.ts:21` 정의와 `:108` 호출부는 **지울 수 있게 됐다** — `quarterly-report.ts` 가 파사드의 `targets()` 로 목록을 받는다.
> **정본은 §4-2 맨 위 시그니처**이고 §4-2 정정 블록들은 선택지 이력으로 강등됐다.
> 포인터를 그대로 두면 다음 세션이 **소진된 질문을 다시 연다.**

`getAllowedChatIds` 4곳의 완전 대체 가능 여부:

| 정의 | 반환값 용도 | `targetCount()` 로 대체 |
|---|---|---|
| `budget-alert.ts:14` | 가드 2곳 + 루프 2곳. **파일 안에서 생성·소비가 닫힌다** | **○ 완전 대체 — 4곳 중 유일** |
| `scheduler.ts:21` | 가드 1 + **13 cron 콜백 전달** + `:108` 목록 필요 | **✕** (Q25 에 종속) |
| `lib/cron.ts:13` | 가드 1 + 3개 함수 전달 (그 3개가 각자 또 `length===0` 가드를 가짐 → **가드 4중**) | △ 3 시그니처 동시 개편 시 |
| `retry/route.ts:29` | 가드 1(**HTTP 500 분기**) + `redispatchAlert` 전달 → 반환 `totalChats` 가 **API 응답 필드** | △ **API 응답 계약이 걸려 있다** |

### 발견 19 — `chatIds.length` 21 hits = **가드 10 + 분모 11**

003 §5-1 은 `scheduler.ts:41` 과 `lib/cron.ts:96` **2곳**만 지목했다. 전수 결과는 다르다.
출처 `_workspace/05_surveyor_fin_loops.md` M2-3.

**가드 = 10곳** (제어 흐름. 파사드가 `targetCount(route)` 로 대신 제공해야 하는 것)

| 위치 | 형태 | 스킵되는 것 | 003 §5-1 |
|---|---|---|---|
| `scheduler.ts:41` | `===0` → return | **cron 등록 전체** | ○ |
| `lib/cron.ts:96` | `>0` | 가격/전략/TA 체크 3건 | ○ |
| `retry/route.ts:64` | `===0` → `fail(…, 500)` | **API 500 응답 분기** | ✕ 누락 |
| `advisor-monitor.ts:205` | `===0` → `return false` | ADMIN alert | ✕ (별건으로 분리돼 있었음) |
| `budget-alert.ts:29` · `:96` | `===0` return | 예산 경고 · 증여세 경고 | ✕ 누락 |
| `custom-strategy-alert.ts:116` | `===0` return | 전략 스캔 | ✕ 누락 |
| `networth-snapshot.ts:85` | `>0` | 알림만 (**DB 스냅샷 저장 `:80` 은 가드 밖**) | ✕ 누락 |
| `ta-signal-alert.ts:173` | `===0` return | TA 시그널 | ✕ 누락 |
| `price-alert.ts:80` | `===0` return | 변동 알림 | ✕ 누락 |

**분모 = 11곳** (집계값)

| 쓰임 | 건수 |
|---|---|
| `computeDeliveryStatus(success, total)` → `sent`/`partial`/`failed` 판정 | 4 |
| `recordAlertHistory(…, chatIds.length, …)` → **DB 컬럼 `AlertHistory.recipientCount`** | **3** |
| `alert-dispatcher.ts:132` `totalChats` → **API 응답 body** (`retry/route.ts:81`) | **1** |
| `console.log` | 3 |

→ **`targetCount()` 는 "가드 2곳 대신"이 아니라 "가드 10곳 + 분모 11곳" 총 21지점의 대체재다.**
그중 **3곳은 DB 컬럼 값, 1곳은 API 응답 필드**이므로 **값의 의미가 바뀌면 안 된다.**
`networth-snapshot.ts:85` 은 성격이 하나 더 다르다 — DB 스냅샷 저장이 가드 **밖**(`:80`)이라
수신자가 0명이어도 실행된다. 파사드가 이 가드를 흡수할 때 **실행 순서 보존 확인이 필요하다.**

### 발견 20 — 로그·에러 표면: 문자열 **17종**, `sanitizeError` 불일치, `lastError` 가 **DB → UI → CSV**

출처 `_workspace/05_surveyor_fin_loops.md` M3. per-chat `catch` 22개의 전수 분류:
**재던지는 것 0건 · 사용자에게 알리는 것 0건 — 전부 삼킨다.**

| 유형 | 건수 | 내용 | 파사드 흡수 |
|---|---|---|---|
| A `console.error(raw error)` | 12 | 에러 객체를 2번째 인자로 그대로 | ○ (라벨을 넘기면) |
| B `console.error(sanitizeError(error))` | 5 | 템플릿 보간 | ○ |
| C `lastError = error.message` + A | 4 | A 의 부분집합 | △ **파생 필요** (발견 17) |
| D 빈 `catch {}` | 5 | `// 무시` 주석만 | ○ |

흡수 판정: **무손실 17 / 파생 코드 필요 4 / 범위 밖 1**(`quarterly-report.ts:57`).

**흡수하면 반드시 바뀌는 것 3가지:**

1. **로그 문자열이 17종이다.** 로깅하는 catch 17곳이 전부 다른 prefix 를 쓴다 —
   `[notification]`(세부 문구 9종) · `[alert-retry]` · `[active-review]` · `[briefing]` ·
   `[custom-strategy]` · `[networth]` · `[report]` · `[ta-signal]` · `[advisor-monitor]`.
   파사드가 한 형식으로 찍으면 **운영 로그 grep 패턴이 전부 깨진다.**
   → **§4-2 `notify(route, content)` 에 호출부 라벨(context) 인자 자리가 없다.** 개정안은 §4-2 정정, 결정은 **Q26**.
2. **`sanitizeError` 적용이 지금 일관되지 않다** (12 raw / 5 sanitized). 파사드가 통일하면
   한쪽 12곳 또는 5곳의 로그 내용이 바뀐다. (`sanitizeError` 는 봇 토큰만 마스킹 — 보안 개선이지 손실이 아니다.)
3. **`lastError` 가 raw `error.message` 로 DB 를 거쳐 화면·CSV 에 노출된다.**

| 경로 | 위치 |
|---|---|
| 쓰기 | `alert-history.ts:76` → `prisma/schema.prisma:344 errorMessage String?` |
| 읽기 → API | `app/api/alerts/history/route.ts:77` |
| 읽기 → **화면** | `AlertHistoryClient.tsx:449` (`↳ {r.errorMessage}`) · `AlertHistoryDetailModal.tsx:103` (`에러: {row.errorMessage}`) |
| 읽기 → **CSV 내보내기** | `app/api/alerts/history/export/csv-format.ts:19,146` |

→ 파사드가 `sanitizeError` 를 통일 적용하면 **UI·CSV 문자열이 바뀐다 — 관측 가능한 동작 변경이다.**
그리고 **현재 상태가 이미 `CLAUDE.md` 컨벤션 위반이다** (*"catch 블록에서 `error.message` 원문 노출 금지"*).
**1a-4 가 만드는 문제가 아니라 1a-4 가 손대는 바로 그 4줄에 이미 있는 문제**다 → **Q19**.

> **정정 (2026-09-09 · 이슈 #37) — 이 발견이 가리키는 두 포인터는 소진됐다.**
> ① 위 1번의 *"→ **§4-2 `notify(route, content)` 에 호출부 라벨(context) 인자 자리가 없다.** 개정안은 §4-2 정정, 결정은 **Q26**"* —
> **Q26 은 ①(`label` 인자만)로 확정**됐다(사용자 2026-09-09). 자리는 `notify(route, content, ctx?: NotifyContext)` 로 생겼고
> **`onError` 는 두지 않는다.** 정본은 §4-2 맨 위 시그니처.
> ② 위 3번 말미의 *"→ **Q19**"* — **방향은 C(포트가 raw 를 담는다)로 확정**됐다(같은 날). 파사드는 `sanitizeError` 를
> **통일 적용하지 않으므로** 이 절이 적은 *"UI·CSV 문자열이 바뀐다"* 는 **일어나지 않는다.** 컨벤션 위반의 해소는 **1a-4 확정 + 별건 가드**로 남는다.
> **그리고 읽기 표면은 4가 아니라 5다** — 위 표(DB · API(history) · 화면 2 · CSV)에 **API(retry) `app/api/alerts/[id]/retry/route.ts:82`**(DB 미경유 직접 반환)가 빠져 있다 (`measured-facts.md` **C-5**).

### 발견 21 — 짝 루프 4쌍 (22 중 8 = 36%) — 바깥 try/catch 4개는 **남는다**

출처 `_workspace/05_surveyor_fin_loops.md` M1-C.

| 모듈 | 본문 루프 | 폴백 루프 | 바깥 catch |
|---|---|---|---|
| `briefing.ts` | :69 | :91 | :79 |
| `active-review.ts` | :123 | :140 | :132 |
| `monthly-report.ts` | :53 | :67 | :62 |
| `quarterly-report.ts` | :37 (진행 알림) | :66 | :63 |

두 번째 루프는 첫 번째를 감싼 **바깥 `try` 의 `catch` 안**에 있고 **AI 생성 실패** 시 안내를 보낸다.
그 바깥 try/catch 4개는 **전송 실패용이 아니므로 파사드가 흡수하지 않는다.**
→ **1a-4 이후에도 이 4파일은 try/catch 구조를 유지한다.** 003 §5-1 의 *"try/catch 21곳 제거"* 는
per-chat catch 만을 가리키며, 파일에서 try/catch 가 사라진다는 뜻이 아니다.

### 발견 22 — 테스트 결합은 얕다 — **1 / 42 파일 · 9 / 25 `it()`**

출처 `_workspace/05_surveyor_fin_loops.md` M5.

| 항목 | 값 |
|---|---|
| `chatIds`/`sendHtml` 를 참조하는 fin 테스트 파일 | **1 / 42** (`bot/notifications/__tests__/alert-dispatcher.test.ts`) |
| 그 파일의 `it()` 블록 | 25 |
| 그중 `sendHtml` 을 직접 assert (`toHaveBeenNthCalledWith(1, fakeBot, 1, '…')` — **인자 순서 고정**) | **9 / 25** |
| `TELEGRAM_ALLOWED_CHAT_IDS` env 를 세팅하는 테스트 | `retry/__tests__/route.test.ts` `it()` 6개 — `redispatchAlert` 를 mock 하므로 **파사드 교체와 무관** |

→ **1a-4 가 테스트에서 비싸지지는 않는다.** 고칠 것은 1 파일 · 9 블록.

### 발견 23 — U1 의 blocker 는 vitest 가 아니라 fit `overrides` 의 **`$postcss` 한 줄**

출처 `_workspace/05_operator_u1_vitest.md` §1 (dry-run 2회, **대상 저장소 파일 변경 0**, md5 동일 검증).

**vitest 3종은 fit 트리에서 peer 충돌 없이 resolve 된다 — `ERESOLVE` 0건.**

| 패키지 | 현재 fit | 추가 후 |
|---|---|---|
| `vitest` / `@vitest/coverage-v8` | 없음 | **4.1.11** / **4.1.11** |
| `vite-tsconfig-paths` | 없음 | **6.1.1** |
| `vite` | 없음 | **6.4.3** — **fin 과 동일 버전** |
| `postcss` / `esbuild` | 8.5.25 / 0.28.1 | **무변경** |
| lock 엔트리 | 716 | **785** (+69) |

막는 것은 fit `package.json` `overrides` 의 **`"postcss": "$postcss"`** 한 줄이다.
npm 스택이 원인을 그대로 보여준다:

```
Error: Unable to resolve reference $postcss
    at get spec        (@npmcli/arborist/lib/edge.js:202:15)
    at #nodeFromEdge   (build-ideal-tree.js:1036:46)
    at #loadPeerSet    (build-ideal-tree.js:1294:35)   ← peer set 확장 경로
```

**peer set 확장 경로에서 npm 이 `$name` 참조를 해석하지 못한다.** `vitest → vite → postcss` 로
postcss 가 트리에 들어오는 순간 드러난다. 변형 5종(A/D/E/B + 무관 패키지)으로 원인을 분리했고
`$esbuild` 는 **무관**함을 확인했다.

> **이 결함은 원래부터 있었고 vitest 가 조건을 처음 만족시켰을 뿐이다.**
> 인자 없는 `npm install --dry-run` 은 지금도 통과한다(210 packages, EXIT=0).

수정은 **의미가 동일한 1줄** — `"postcss": "$postcss"` → `"^8.5.10"`
(fit `devDependencies.postcss` 가 정확히 `^8.5.10`이고, 양쪽 모두 postcss 8.5.25 로 수렴함을 실증).
**미승인이라 적용하지 않았다** → **Q16**.


### 3-1. 기능 합집합 — 정본을 한쪽으로 고르면 양쪽 다 잃는다

L3 를 택했으므로 각 기능의 정본을 골라야 한다. 근거는 전부 위 발견들이다.

| 기능 | 정본 | 근거 |
|---|---|---|
| 재시도 백오프 `[2000,8000,30000]`ms ×4회 | 양쪽 동일 → 그대로 | 기능 매트릭스 |
| 재시도 판정 `isNetworkError` | **myFinance** (`NETWORK_CODES` 7개, `ENOTFOUND` 포함) | 발견 15 차이 #1 |
| `sanitizeError` 최종 마스킹 | **myFinance** (`sanitizeMessage(parts.join())` 이중 보호) | 발견 15 차이 #2 |
| 파싱 실패 폴백 판정 | **myFitness `isHtmlParseError`** (공유 정규식). fin 로컬 `isParseError`(400 코드)는 광범위 — 400 이 전부 파싱 오류는 아니다 | 발견 15 부수 |
| 폴백 시 재시도 예산 | **myFitness** (`attempt--` 로 예산 보존) | 기능 매트릭스 |
| 길이 초과 처리 | **myFinance 분할** (`splitMessage`) — fit 절단은 내용 유실 | 발견 11 |
| 결과 집계 `SendResult` | **myFitness** | 발견 9 |
| messageId 반환 | **myFitness** (`first`) | 발견 9 |
| 키보드/컴포넌트 | **myFitness** (fin 은 없어서 `rsu.ts` 가 우회) | 발견 12 |
| md→HTML 변환기 | **myFinance** (103줄 vs 10줄) — 단 **패키지 밖**, §7-2 제외 | 발견 14 |
| **plain 폴백 문자열 처리** | **미결 (Q10 에 병합).** 구현이 이미 둘로 갈라져 있다 ↓ | 감사 주장 6-B |

> **정정 (2026-09-03 감사 반영 · 주장 6-B).** `utils/telegram.ts:69` 의 인라인 폴백은
> `chunk.replace(/<[^>]+>/g, '')` 로 태그만 벗기고 **엔티티를 디코드하지 않는다**
> (`&amp;` 가 리터럴로 남는다). `utils/markdown.ts:96-103` 의 `stripHtml` 은 태그 제거 +
> `&amp;`/`&lt;`/`&gt;` **디코드까지** 한다. 패키지는 둘 중 하나를 정본으로 골라야 하고,
> **어느 쪽을 고르든 한쪽 저장소의 폴백 출력이 관측 가능하게 바뀐다.** Q10 과 **같은 성격의
> 동작 변경**이므로 1a 착수 전에 함께 결정한다.

> **정정 (2026-09-09 · 이슈 #37 · 사용자 확정 Q10-P) — 위 정정의 대비가 불성립한다.**
> 위 블록은 *"어느 쪽을 고르든 **한쪽 저장소의** 폴백 출력이 관측 가능하게 바뀐다"* 고 적었다. **틀렸다.**
> `utils/telegram.ts:69` 와 `utils/markdown.ts:96-103` 은 **둘 다 myFinance 파일**이고 myFitness 에는
> `src/bot/utils/markdown.ts` 가 **없다.** 그리고 `stripHtml` 은 **importer 0 인 죽은 export** 다
> (`measured-facts.md` **C-3** · 2026-09-09). **fit 쪽 대비항이 애초에 존재하지 않았다.**
>
> **정확한 서술:** 태그-only = **양쪽 0**(리터럴 `<>` 제외) · 엔티티 디코드 = **fin 11 모듈만 · fit 0**.
> fit 에서 엔티티를 만드는 아웃바운드 모듈 2개는 **폴백 분기가 없는 `sendToAllWithKeyboard`** 로 나가고,
> 폴백이 있는 `sendToAll` 로 가는 4 호출의 본문은 엔티티를 만들지 않는다 (**C-4**).
> ∴ **Q10 의 plain 절반은 "양쪽 저장소 절충"이 아니라 fin 한쪽의 개선을 넣을지 말지다.**
>
> **답 — Q10-P ① 태그-only (사용자 2026-09-09 · 이슈 #37).**
> 위 표의 *"**plain 폴백 문자열 처리** | **미결 (Q10 에 병합).** 구현이 이미 둘로 갈라져 있다 ↓"* 행은
> **Q10-P 로 분리되어 정본 = 태그-only(라이브 두 구현과 동일 동작)** 로 확정됐다.
> 근거 셋 — ① 라이브 두 구현이 **둘 다 엔티티를 디코드하지 않는다**(C-3) ② 엔티티 디코드의 이득 크기를 잴 방법이 없다:
> **폴백 발동 빈도 로그가 0** 이다(C-1) ③ *잃고 있던 것을 되찾는* 변경이 아니라 *표시 품질을 바꾸는* 변경이다.
>
> **단서 1건 — "동작 변경 0" 에 붙는 조건.** 라이브 두 구현은 정규식 수량자가 다르다(fin `/<[^>]+>/g` · fit `/<[^>]*>/g`).
> 차이가 나는 입력은 **리터럴 `<>` 하나**이고 **그 입력이 실제로 발생하는지는 미측정**이다 (C-3).
> **별건(결정 요청 아님):** 죽은 export `stripHtml` 폐기 — fin 단독 · 되돌리기 **즉시**.
> **되돌리기:** 코어 정규식 1줄 — **즉시 (1a-3 착수 전까지 · 이후 중간 — §8-1)**.

> **길이 정책 통일도 관측 가능한 동작 변경이다.** myFitness 아웃바운드가 절단 → 분할이 되면
> 지금 조용히 버려지던 내용이 살아나고 **사용자에게 메시지 수가 늘어난다**. 기능 개선이지만
> 무단으로 넣을 변경은 아니다 → §10 Q10.

---

## 4. 인터페이스 설계 — L3 (2층)

### 4-1. 왜 2층인가 (Q8 채택 근거)

**(a) `sendToAllWithKeyboard` 가 L2 를 반증한다.** 이 함수는 재시도 백오프도 HTML 폴백도
**둘 다 없다**(`send.ts:98`, 주석에 "재시도 로직 없이 단순 전송" / "HTML fallback 없음" 명시).
이유는 구조적이다 — broadcast 층에 채널 로직과 공용 로직이 **한 함수로 섞여 있어서**, 두 번째
전송 함수를 만들 때 공용 부분이 복제되지 않고 그냥 빠졌다. L2 는 이 구조를 인터페이스로
승격시킨다. 어댑터 2개(Telegram/Discord) × 전송 형태 2개(텍스트/키보드)면 같은 누락이
4칸 중 몇 칸에서 재발한다.

**(b) 어댑터가 실제로 구현해야 하는 최소 단위는 per-target 이다.** Discord 도 전송 단위는
채널 1개다. 수신자 목록 해석 · N건 루프 · 결과 집계 · 재시도 백오프 · 파싱 실패 폴백은 전부
**채널 무관 로직**이다 — **단 길이 분할은 예외다(§4-3 제약 2).**

**(c) 청구서가 L2 와 같다.** L3 의 마이그레이션 비용은 L2 와 동일하다(호출부가 파사드를 쓰므로).
2층으로 나누는 것은 **공짜로 얻는 구조**다.

L1(per-chat 단일층)을 버린 이유: myFinance 청구서가 가장 싸 보이지만 **코드 드리프트 정지라는
1a 의 목적을 달성하지 못한다.** `getAllowedChatIds` 4중 복제와 per-chat try/catch 21곳이 그대로
남고, 도메인 #3 이 5번째 복제를 만든다. 002 §1 이 "드리프트가 3배가 된다"고 쓴 그 문제다.

### 4-2. 시그니처

> **확정 — 사용자 2026-09-09 · 이슈 #37. 이 절은 재작성됐다.**
> **Q25 ①**(`targets` 추가) · **Q25 하위 ADMIN A**(실값 · fin 전용) · **Q26 ①**(`label` 만) · **Q19 C**(포트가 raw 를 담는다)
> 가 확정되어 **아래 코드 블록이 1a-1 이 구현할 정본 시그니처**다.
> 종전 본문 코드 블록과 정정 블록 5개는 **삭제하지 않고 이 절 뒤로 강등**했다 — 형태 판정은 초안
> `_workspace/1a-1-prep/02_writer_1a1prep.md` §3 (C) 3안, 근거 수치는 `docs/research/measured-facts.md`
> **`## #37 감사 실측 (2026-09-09)` §A**(§4-2 = 597~713 · **117행 중 78행이 정정 블록** · 블록 **5개**: 636 · 645 · 659 · 668 · 682)다 — **행 번호는 전부 이 재작성 이전 기준**이다.
> **재작성한 이유는 정정이 본문을 덮었기 때문이다** — 종전 맨 위 코드 블록에는 `targets` 도 `ctx` 도 없어
> 시그니처를 읽으려면 블록 5~6개를 재구성해야 했다.

```ts
// 포트 (어댑터가 구현) — 채널 1개 · 대상 1개
type MessageRef = string;                        // 불투명. 파싱 금지. String 영속화 가능

interface Transport {
  readonly channel: string;                      // "telegram" | "discord"
  send(target: string, content: Content): Promise<MessageRef>;
}

// 파사드 (호출부가 사용) — 라우트 1개 · 대상 N건
interface Notifier {
  notify(route: Route, content: Content, ctx?: NotifyContext): Promise<BroadcastResult>;
  targetCount(route: Route): number;             // 전송이 아니라 "가드"용 — 가드 10 + 분모 11 (발견 19)
  targets(route: Route): string[];               // Q25 ① — quarterly-report.ts:52 가 목록을 받는다 (옵셔널 아님)
}

interface NotifyContext {
  label: string;                                 // Q26 ① — 기존 로그 prefix 17종을 그대로 넘긴다
}                                                // onError 는 두지 않는다 (Q26 ② 미채택 → Q19 B 가 닫힌다)

interface BroadcastResult {
  sent: number; failed: number; total: number;   // myFitness 소비 지점 5곳을 그대로 만족
  first?: { target: string; ref: MessageRef };   // DB 저장 2곳을 그대로 만족
  deliveries: {
    target: string; ok: boolean; ref?: MessageRef;
    error?: string;                              // Q19 C — raw(error.message 원문). 파사드는 sanitize 하지 않는다
  }[];
}

// Route — 등급 축은 1a 에서 실제 값을 받는다 (Q25 하위 A · §4-4 "자리만"에서 한 칸 나아간다)
//   fin: ALLOWED → TELEGRAM_ALLOWED_CHAT_IDS · ADMIN → TELEGRAM_ADMIN_CHAT_IDS
//   fit: ALLOWED → TELEGRAM_ALLOWED_CHAT_IDS · ADMIN 은 매핑하지 않는다 → targetCount(ADMIN) === 0
```

**확정 근거 — 질문 · 답 · 누가 언제**

| 시그니처 요소 | 확정된 답 | 근거 |
|---|---|---|
| `targets(route): string[]` — **옵셔널 아님** | **Q25 ①** (목록 반환 표면을 둔다) | 사용자 2026-09-09 · 이슈 #37. 선택지·비용 표는 아래 강등된 **정정 ②** |
| `Route.ADMIN` **실값** · 수신자는 **fin 만 매핑** | **Q25 하위 A** (fit 미매핑) | 사용자 2026-09-09 · 이슈 #37. **3안(A fin 전용 / B fit 매핑 / C 자리만)과 B·C 의 대가는 §10 표의 2026-09-09 정정 블록 ①** — B 는 `Route.ADMIN` 의 뜻을 저장소마다 다르게 만들고(되돌리는 경로가 Q13 뿐) C 는 루프 1 + catch 1 을 파사드 밖에 남긴다 |
| `ctx?: NotifyContext { label: string }` · **`onError` 없음** | **Q26 ①** (`label` 만) | 사용자 2026-09-09 · 이슈 #37. 표는 아래 강등된 **정정 ③** |
| `deliveries[].error?: string` = **raw** | **Q19 C** — 포트 계약의 *방향*. 최종 적용(1a-4 4지점)은 §10 Q19 행 | 사용자 2026-09-09 · 이슈 #37 |

**이 확정이 함께 정하는 것 다섯.**
1. **파싱 지점 5 → 0.** Q25 ① + ADMIN A 의 조합값이다(아래 강등된 PR #9 정정이 유도한 *"①② 5→0"*). §5-1 의 *"5번째 파싱 지점(ADMIN)은 별건이다"* 는 **소진**되고 루프 제거는 **21** 그대로다 — §5-1 의 2026-09-09 정정 참조.
2. **`targets?()` 가 아니라 `targets()`.** 아래 강등된 정정 ③ 의 개정안은 옵셔널(`targets?()`)로 적었으나, Q25 ① 채택으로 **파사드 필수 표면**이 됐다. 포트(`Transport`)는 이 표면을 갖지 않는다.
3. **Q19 B(raw + 호출부 sanitize)는 닫힌다.** `deliveries[].error?: string` 을 유지하는 한 파사드가 error **객체**를 넘기는 표면은 `onError` 뿐인데 Q26 ①이 그것을 두지 않는다. 별건 가드가 필요해지면 **B′**(호출부 4지점에 `sanitizeMessage` 만 — 포트 계약 무관)로 간다. **필드를 `unknown` 으로 넓히는 B″ 는 별개의 포트 변경이고 이 절은 `string` 을 유지한다.**
4. **fit 에서 `targetCount(ADMIN)` 은 0 이다.** 구현이 `Route` 매핑을 전수(exhaustive)로 강제하는 형태를 고르면 fit 값은 **빈 목록**이고, 그때도 무전송이다. **1a-4 지시에 `targetCount(ADMIN) === 0` 가드를 명시한다** — fin `advisor-monitor.ts:205-211` 의 `console.warn` + `return false` fail-safe 는 파사드가 복원해 주지 않는다(초안 §5-2 #12 · 미확인).
5. **되돌리기: 즉시 (1a-3 착수 전까지 · 이후 중간 — §8-1).** 되돌리는 행위는 `targets` 표면 1개 삭제 + `quarterly-report.ts` 로컬 `getAllowedChatIds` 복원 · `label` 인자 제거(호출부 20곳 재편집) · `Route.ADMIN` 값 1개 제거 + `advisor-monitor:199` 인라인 파싱 복원. **불가한 것 둘** — 이미 찍힌 로그, 이미 저장된 DB 행.

**`MessageRef = string` (불투명).** 근거는 발견 9 — myFitness 의 `first.messageId` 가
`String?` 컬럼으로 **영속화**된다(`schema.prisma:359`). 제약은 인덱스가 아니라 **컬럼 타입**이다
(`@@index([telegramMessageId])`는 읽기 경로 0건인 죽은 인덱스, 발견 9 정정).
따라서 `first.messageId: number` → `ref: string` 변경은 **DB 마이그레이션을 유발하지 않고**,
오히려 `String(messageId)` 변환 지점 2곳(`auto-adjust.ts:418`, `auto-adjust-cron.ts:98-99`)이 사라진다.

**`target: string` 고정이 발견 10 의 해법이다.** myFinance 아웃바운드 `chatId: number` 20건이
파사드 뒤로 사라지므로, 숫자 정밀도 문제가 **아웃바운드에서는 구조적으로 소멸한다.**
인바운드 `Set<number>` + `.map(Number)` 는 텔레그램에 남으므로 범위 밖(§7-3).

**`targetCount(route)` 는 왜 파사드 표면인가.** `getAllowedChatIds` 는 전송용으로만 쓰이지
않는다 — `scheduler.ts:41` 은 `chatIds.length === 0` 이면 **스케줄 등록 자체를 스킵**하고,
`lib/cron.ts:96` 도 `length > 0` 가드를 건다. 파사드가 이 표면을 제공하지 않으면
**"`getAllowedChatIds` 4 → 0" 이 성립하지 않는다** (감사 주장 2-f).

> **아래는 소진된 이력이다 — 값의 정본은 이 절 맨 위 시그니처다 (2026-09-09 · 이슈 #37).**
>
> 순서: **종전 본문 코드 블록**(2026-09-04) → **정정 ①**(발견 19) → **정정 ②**(발견 18 · Q25 선택지) →
> **PR #9 Codex P2 정정 2개**(ADMIN 별건 여부 · ②도 `targetCount` 를 남긴다) → **정정 ③**(발견 20 · Q26 선택지).
> **내용은 원문 그대로이고 순서만 뒤로 옮겼다** — 지우면 왜 그 형태가 됐는지가 사라진다(§5-2 2026-09-08 정정의 규율).

```ts
// 포트 (어댑터가 구현) — 채널 1개 · 대상 1개
type MessageRef = string;                        // 불투명. 파싱 금지. String 영속화 가능

interface Transport {
  readonly channel: string;                      // "telegram" | "discord"
  send(target: string, content: Content): Promise<MessageRef>;
}

// 파사드 (호출부가 사용) — 라우트 1개 · 대상 N건
interface Notifier {
  notify(route: Route, content: Content): Promise<BroadcastResult>;
  targetCount(route: Route): number;             // 전송이 아니라 "가드"용 ↓
}

interface BroadcastResult {
  sent: number; failed: number; total: number;   // myFitness 소비 지점 5곳을 그대로 만족
  first?: { target: string; ref: MessageRef };   // DB 저장 2곳을 그대로 만족
  deliveries: { target: string; ok: boolean; ref?: MessageRef; error?: string }[];
}
```

> **정정 ① (2026-09-04 · 이슈 #4 전수 측정 · 발견 19).** 위 *"`targetCount(route)` 는 왜 파사드
> 표면인가"* 문단은 소비처를 **`scheduler.ts:41` · `lib/cron.ts:96` 2곳**으로 적었다.
> **전수 측정 결과는 21지점이다 — 가드 10곳 + 분모 11곳.**
> 그중 **3곳이 DB 컬럼 `AlertHistory.recipientCount` 값**이고 **1곳이 API 응답 필드 `totalChats`** 다.
>
> 인터페이스 결론은 **바뀌지 않는다** — `targetCount(route): number` 하나로 21지점을 전부 만족한다.
> 바뀐 것은 **청구서의 크기**이고, 새로 붙는 제약은 **값의 의미를 바꾸면 안 된다**는 것이다
> (DB 컬럼 + API 계약). §5-1·§5-2 정정 참조.

> **정정 ② (2026-09-04 · 이슈 #4 · 발견 18) — 파사드 표면이 하나 부족하다.**
> 위 §4-2 는 파사드를 `notify` + `targetCount` **둘**로 잡았다. 이것으로는
> §5-1 의 *"`getAllowedChatIds` 4곳 제거"* 가 **성립하지 않는다.**
> `quarterly-report.ts:52`(§7-4 로 남는 `sendDocument` 루프)가 **개수가 아니라 목록 자체**를
> 요구하므로, `scheduler.ts:21` 정의와 `:108` 호출부가 목록을 계속 만들어야 한다.
>
> **선택지 3개. 결정은 Q25.**
>
> | | 안 | 파사드 표면 | 1a 에서 남는 것 | 되돌리기 등급 | 되돌리는 행위 |
> |---|---|---|---|---|---|
> | **①** | 파사드에 **`targets(route): string[]`** 추가 (권고) | `notify` + `targetCount` + `targets` | 파싱 지점 5 → **1**(`advisor-monitor` ADMIN 인라인, 별건). `quarterly-report.ts` 는 `targets()` 로 목록을 받는다 | **즉시** | 표면 1개 삭제 + 그 유일한 호출부(`quarterly-report.ts`)를 로컬 `getAllowedChatIds` 로 되돌림. 어댑터·포트 무영향 |
> | ② | **`sendDocument` 를 1a 포트에 넣는다** (첨부 개념 추가) | **`notify` + `targetCount`** (`targets` 만 없음. `Content` 에 첨부) | 파싱 지점 5 → 1. 초크포인트 커버리지 fin **16/16** | **중간** | 포트에서 첨부 개념 제거 + `quarterly-report.ts` raw 복원. **1b 에서 `DiscordTransport` 를 쓴 뒤에는 어댑터도 함께 고쳐야 한다** — 포트가 넓어지면 **모든 어댑터가 구현 의무를 진다**(§7-4 가 제외한 바로 그 이유) |
> | ③ | **아무것도 하지 않는다** — `quarterly-report.ts` 만 로컬 `getAllowedChatIds` 유지 | 현행 `notify` + `targetCount` | 파싱 지점 5 → **2**(`scheduler.ts:21` + ADMIN 인라인). 부분 드리프트가 남는다 | **즉시** | 없음 (변경 자체가 없다) |
>
> **정정 (PR #9 Codex 리뷰 P2) — ADMIN 인라인 파싱은 "별건"이 아닐 수 있다.**
> `advisor-monitor` 의 루프는 **22곳 중 하나라 1a-4 가 이전한다**(발견 16·17). 그리고 발견 E6 은
> 그 5번째 파싱 지점을 *"§4-4 의 `Route` 가 흡수해야 할 대상"* 이라고 적었다. **1a 의 `Route` 가
> ADMIN 등급을 실제로 담는다면** 그 호출부는 `notify(ADMIN, …)` · `targetCount(ADMIN)` 이 되고
> **인라인 파싱은 남을 이유가 없다** — 그때 위 표의 결과는 **①② 5→0 · ③ 5→1** 이다.
> **단 §4-4 는 `Route` 를 "자리만 만든다"고 했다.** 따라서 이 정정은 **`Route` 가 1a 에서
> ADMIN 을 실제 값으로 받는가**에 종속된다 — 그 답에 따라 위 표의 숫자가 바뀐다.
> **Q25 의 하위 선택(ADMIN)으로 명시했다 — 거기서 함께 답한다.**
>
> **정정 (PR #9 Codex 리뷰 P2) — ②도 `targetCount` 를 남긴다.** 표면을 *"`notify` 만"* 으로 적었으나,
> `targetCount()` 는 **`sendDocument` 루프와 무관하게** 가드 10곳 + 분모 11곳(발견 19)에서 필요하다.
> `notify` 하나로 줄이면 호출부가 **로컬 수신자 파싱을 되살리거나 `scheduler.ts:41`·API 분기의
> 가드를 없애야** 하고, 후자는 **동작 변경**이다. ②가 ①과 다른 점은 `targets` 유무뿐이다.
>
> **①을 권고한다.** 되돌리기가 ③과 같은 "즉시"이면서 §5-1 이 목표한 상태(파싱 지점 수렴)에
> 실제로 도달한다. ②는 **포트를 넓히는 유일한 안**이고, §7-4 가 "1건 때문에 모든 어댑터에
> 구현 의무를 지우지 않는다"고 제외한 결정을 뒤집는다 — 되돌리기 등급이 한 칸 오르는 대가로
> 커버리지 1건을 얻는다.
>
> **①의 부작용 하나를 명시한다.** `targets()` 는 수신자 목록을 다시 호출부에 노출하므로,
> 발견 10 의 해법(*"`chatId: number` 20건이 파사드 뒤로 사라진다"*)이 **1건에서 뚫린다.**
> 반환 타입을 `string[]` 으로 고정하면 정밀도 문제는 발생하지 않는다 (텔레그램 chat id 9~10자리).

> **정정 ③ (2026-09-04 · 이슈 #4 · 발견 20) — `notify(route, content)` 에 호출부 라벨 자리가 없다.**
> per-chat catch 22곳 중 로깅하는 **17곳이 17종의 로그 prefix** 를 쓴다
> (`[notification]` 세부 9종 · `[alert-retry]` · `[active-review]` · `[briefing]` ·
> `[custom-strategy]` · `[networth]` · `[report]` · `[ta-signal]` · `[advisor-monitor]`).
> 파사드가 한 형식으로 찍으면 **운영 로그 grep 패턴이 전부 깨진다.** 위 시그니처에는 그 자리가 없다.
>
> **개정안 (Q26 으로 결정):**
>
> ```ts
> interface Notifier {
>   notify(route: Route, content: Content, ctx?: NotifyContext): Promise<BroadcastResult>;
>   targetCount(route: Route): number;
>   targets?(route: Route): string[];                     // 정정 ② / Q25
> }
>
> interface NotifyContext {
>   label: string;                                        // 기존 로그 prefix 를 그대로 넘긴다
>   onError?: (target: string, error: unknown) => void;   // 옵션 ②에서만
> }
> ```
>
> | | 안 | 로그 보존 | 되돌리기 등급 | 되돌리는 행위 | 대가 |
> |---|---|---|---|---|---|
> | **①** | **`label` 인자만** (권고) | prefix 17종 보존. 뒤 문구는 파사드 형식으로 통일 | **즉시(코드)** / **불가(이미 찍힌 로그)** | 인자 제거 — 단 호출부 20곳 재편집이 따라온다 | 인자 1개 |
> | ② | `label` + `onError` 콜백 | **100% 보존** | **즉시(코드)** | 콜백 제거 | 파사드가 흡수한 catch 가 사실상 호출부로 돌아온다 — *"try/catch 21곳 제거"* 의 이득이 줄어들고, 어댑터마다 콜백 호출 시점을 지켜야 한다 |
> | ③ | **인자 없음 (현행 003)** | 없음 — 한 형식으로 통일 | **즉시(코드)** / **불가(이미 찍힌 로그)** | 시그니처 되돌림 | 운영 로그 grep 패턴이 깨진다. 되돌려도 **깨진 구간의 로그는 복구되지 않는다** |
>
> **①을 권고한다.** ③과 코드 되돌리기 등급이 같고(즉시), 비용은 인자 1개다.
> 세 안 모두 **이미 찍힌 로그는 되돌릴 수 없다** — 그래서 이것이 시그니처 확정 시점(1a-1)에
> 답해야 하는 질문이지 1a-4 에서 즉흥으로 정할 항목이 아니다.


### 4-3. 감사가 요구한 제약 3개 — 협상 대상이 아니다

| # | 제약 | 근거 |
|---|---|---|
| **1 · 지연 생성** | 패키지는 `Bot` 을 **정적으로 참조해선 안 되고**, `TelegramTransport` 의 **생성이 지연 가능**해야 한다(팩토리 또는 lazy provider) | 둘이다. ① `alert-dispatcher.test.ts:11-12` 주석 — *"`'../index'`(getBot)는 모듈 로드시 모든 command register 를 chain-import 하므로 env 미설정 테스트에서 crash 방지 위해 mock 필수"*. ② `lib/ai/advisor-monitor.ts:216-217` 이 `await import('@/bot')` **동적 import** 를 쓴다 — 주석(`:213-214`)이 밝히듯 **웹/봇 순환참조 회피**가 목적이고, 이 동적 import 는 주입 지점에 그대로 남아야 한다. `getBot()` 호출 19곳 중 `src/bot` 밖은 이 1곳뿐 (감사 E6) |
| **2 · 분할 위치** | 길이 분할은 **변환 뒤**, 즉 `Transport` 경계 안쪽에 있거나, 포트가 "변환 후 길이 예산"을 코어에 알려주는 형태여야 한다 | 한도는 **변환 후** 문자열에 걸린다. HTML 태그(`<b>…</b>`)와 엔티티(`&amp;`)가 길이를 부풀려 **변환 전후 길이가 다르다.** 분할을 "어댑터 밖 공용 코어"에 두면 **잘못된 문자열의 길이로 계산**된다 (감사 주장 6-C) |
| **3 · 역변환기 위치** | HTML→Discord-md 역변환기는 **파사드가 아니라 `Transport` 직전** | 근거는 `alert-dispatcher` 의 round-trip 이 **아니다** — 그 round-trip 은 `:117-119` 에서 끝나고 전송 호출은 `:124` 이므로 파사드도 그 이후다. 진짜 근거는 **변환이 채널 의존적**이라는 것 — Q11 혼합 운영에서 같은 `Content` 가 텔레그램(HTML 유지)과 Discord(md 변환)로 동시에 fan-out 되므로, 채널 무관 층에서 변환하면 **텔레그램 배송이 깨진다** (감사 주장 6-A/6) |

> **제약 1 을 어기면 추출한 의미가 사라진다.** 패키지 테스트마다 봇 전체 그래프를 mock 해야 하고,
> 패키지가 grammY 뿐 아니라 **각 저장소의 명령 그래프에 결합**된다.

### 4-4. `Route` — 자리만 만든다

현재 실측: fin 2등급(`ALLOWED`/`ADMIN`) · fit 1등급 · **도메인 축 양쪽 0**.
env 이름도 `TELEGRAM_` prefix 라 3도메인 공유 시 재설계가 따라온다.

**1a 에서는 `Route` 타입에 (도메인 × 등급) 축을 두되, 값은 기존 env 를 그대로 읽는다.**
이름 재설계와 도메인별 채널 분리는 도메인 #3 을 붙일 때. **자리를 만들어두는 비용은 타입 하나다.**
Q11(혼합 운영 허용)이 여기에 요구사항 하나를 더한다 — `Route → Transport` 매핑은 **설정**이다(§1-4).

---

## 5. 1a 범위와 단계

**목적:** 채널 전환이 아니라 **코드 드리프트 정지 + 층위 통일.**
(드리프트가 소멸하는 것이 아니라 **버전 드리프트로 이전**된다 — §2-2)

### 5-1. 범위

| 항목 | 내용 | 인용 근거 |
|---|---|---|
| 패키지 경로 | **`packages/notify/`** — 모노레포에서 갖게 될 그 경로 (§2-1, 설계 요구사항) | 002 §4 |
| 패키지 구성 | `@pleiades/notify` = 포트(`Transport`) + 코어(재시도·폴백·집계·라우팅) + `TelegramTransport`. **분할은 §4-3 제약 2 의 위치** | §4 |
| 배포 | **git 의존성** — pleiades GitHub 원격 발행 + 두 저장소가 git URL 참조 (Q15) | §1-1 |
| 흡수하는 파일 | `error.ts`(export 5/5 일치, 실동작 차 2건 — **단 인바운드 6곳 import 경로가 바뀐다, §7-3**), `splitMessage`(fin `formatter.ts:52`), fit `send.ts` 전량(124줄), fin `sendHtml`/재시도/폴백. fit `escapeHtml` 은 **발췌**(파일은 남는다, §7-2) | 발견 15 · 감사 2-b · E7 |
| myFinance 변경 | 호출 20건 → `notify()`. 루프 **21곳** 제거(`quarterly-report.ts:52` 는 §7-4 로 남고 `sendQuarterlyReport(chatIds: number[])` 시그니처도 남는다). try/catch 21곳 제거. `getAllowedChatIds` 4곳 제거 — 단 `scheduler.ts:41`·`lib/cron.ts:96` 의 `length===0` 가드를 파사드가 `targetCount()` 로 대신 제공해야 하고, `advisor-monitor.ts:199` 의 **5번째 파싱 지점**(ADMIN)은 별건이다 | 발견 8 · 감사 2-e/2-f/E6 |
| myFitness 변경 | `send.ts` 삭제 → 패키지. 호출 6건. `SendResult` 형태 유지 | 발견 9 |
| 예외 2곳 | `rsu.ts` 키보드 → 포트에 `components` 옵션(텔레그램 구현만). `quarterly-report.ts` sendDocument → **포트 밖, 그대로 둔다** | 발견 12 |
| 테스트 | myFitness vitest 도입. 범위는 **패키지 코드로만** 한정 | 002 Q4 |
| **채널 전환** | **없음.** 텔레그램 유지 | — |
| **DB** | **무변경** (`telegramMessageId String?` 그대로) | §4-2 |

**착수 직전에 정할 구현 결정 1건 (사용자 판단 불필요).** `error.ts` 흡수가 인바운드 6곳의
import 경로를 바꾼다(§7-3). 로컬 `utils/error.ts` 를 `export * from '@pleiades/notify'` **shim**
으로 남기면 인바운드 변경을 **0** 으로 만들 수 있다 (대신 파일 2개가 껍데기로 남는다).
둘 다 되돌리기 등급이 같으므로 구현 시점에 고른다.

> **정정 (2026-09-04 · 이슈 #4 전수 측정).** 위 범위 표의 **myFinance 변경** 칸은 세 군데가 틀렸다.
> 기존 서술은 그대로 두고 개정된 청구서를 아래에 병기한다. 출처는 전부
> `_workspace/05_surveyor_fin_loops.md` 이고, 발견 16~22 가 근거다.
>
> | # | 003 의 서술 | 실측 | 판정 |
> |---|---|---|---|
> | 1 | *"`scheduler.ts:41`·`lib/cron.ts:96` 의 `length===0` 가드"* — **2곳** | **가드 10곳 + 분모 11곳 = 21지점** (발견 19) | **과소** |
> | 2 | *"`getAllowedChatIds` 4곳 제거"* | **완전 제거 가능은 `budget-alert.ts` 1곳뿐.** 나머지 3곳은 `chatIds` 를 다른 모듈로 전달한다 (발견 18) | **불성립** |
> | 3 | *"루프 21곳 제거 · try/catch 21곳 제거"* — 개수는 맞다 | 개수는 맞으나 **순수 삭제가 아니다.** `lastError` 파생 코드가 **호출부 4곳**에 붙고(발견 17), **`chatIds: number[]` 18 시그니처 / 19 호출부**가 따라 바뀐다(발견 18) | **불완전** |
>
> **개정된 1a-4 청구서 (myFinance 단독, 편집 지점 기준)**
>
> | 항목 | 지점 | 근거 |
> |---|---|---|
> | 루프 + per-chat try/catch 블록 제거 | **21** | 발견 16 (22 중 `quarterly-report.ts:52` 제외) |
> | `length===0` 가드 → `targetCount()` | **10** | 발견 19 |
> | `chatIds.length` 분모 → `BroadcastResult.total` | **11** (DB 컬럼 3 · API 필드 1 포함) | 발견 19 |
> | `lastError` 파생 한 줄 추가 | **4** | 발견 17 |
> | `chatIds: number[]` 시그니처 개편 | **18** (`quarterly-report.ts` 1개는 §7-4 로 유지 → 실제 17) | 발견 18 |
> | 실인자 호출부 | **19** | 발견 18 |
> | `getAllowedChatIds` 정의 제거 | **4 중 1~3** (Q25 에 종속) | 발견 18 |
> | `rsu.ts` 키보드 흡수 | 1 | 발견 12 |
> | 테스트 수정 | **1 파일 · `it()` 9 블록** | 발견 22 |
> | **합계** | **약 94 지점 · 최소 60 지점**(시그니처·호출부 개편 39 를 빼도) | — |
>
> **바뀌지 않은 것:** 인터페이스(§4-2)는 형태를 바꿀 필요가 없다. `BroadcastResult` 의
> `sent`/`total`/`first`/`deliveries` 가 부수효과 7 지점을 그대로 만족한다(발견 17).
> **수신자별 라우팅 설계도 불필요하다** — (d) 분기가 전수 0건이다(발견 16).
> 커진 것은 **손대야 하는 지점의 수**이지 설계의 복잡도가 아니다.

> **정정 — 범위 표에 추가되는 항목 2개 (2026-09-04).**
>
> | 항목 | 내용 | 근거 |
> |---|---|---|
> | **파사드 목록 반환 표면** | `targets(route): string[]` 추가 **또는** `sendDocument` 를 1a 포트에 포함 **또는** `quarterly-report.ts` 만 로컬 유지 — 셋 중 하나를 고르지 않으면 파싱 지점이 5 → 2 에서 멈춘다 | §4-2 정정 ② · **Q25** |
> | **`notify` 의 context 인자** | 로그 prefix 17종 보존 여부. 시그니처 확정(1a-1) 시점의 결정이다 | §4-2 정정 ③ · **Q26** |
>
> 그리고 **1a-4 이후에도 남는 try/catch** 가 있다 — `briefing`·`active-review`·`monthly-report`·
> `quarterly-report` 의 **바깥 try/catch 4개**는 AI 생성 실패용이라 파사드가 흡수하지 않는다(발견 21).
> *"try/catch 21곳 제거"* 는 **per-chat catch** 만을 가리킨다.

> **정정 (2026-09-09 · 이슈 #37 · Q25 ① + ADMIN A 확정) — 이 절의 미확정 숫자 세 곳이 닫혔다.**
>
> **ⓐ 범위 표 myFinance 변경 칸 (`003:749` 당시 원문).**
> *"호출 20건 → `notify()`. 루프 **21곳** 제거(`quarterly-report.ts:52` 는 §7-4 로 남고 `sendQuarterlyReport(chatIds: number[])` 시그니처도 남는다). try/catch 21곳 제거. `getAllowedChatIds` 4곳 제거 — 단 `scheduler.ts:41`·`lib/cron.ts:96` 의 `length===0` 가드를 파사드가 `targetCount()` 로 대신 제공해야 하고, `advisor-monitor.ts:199` 의 **5번째 파싱 지점**(ADMIN)은 별건이다"*
> → **ADMIN 이 실값이 되면서 *"5번째 파싱 지점(ADMIN)은 별건이다"* 는 소진된다.** 그 호출부는 1a-4 가
> `notify(ADMIN, …)` · `targetCount(ADMIN)` 으로 이전하므로 인라인 파싱이 남지 않는다.
> **루프 제거는 21 그대로다** — 21 이 20 으로 내려가는 것은 **C(자리만)를 골랐을 때**뿐이었다
> (`notify` 가 `Route` 만 받으므로 C 에서는 `advisor-monitor.ts:220-227` 의 per-chat 루프 1 + catch 1 이 파사드 밖에 남는다).
> **C 는 채택되지 않았다.**
>
> **ⓑ 청구서 표 `getAllowedChatIds` 정의 제거 행 (원문: `| getAllowedChatIds 정의 제거 | **4 중 1~3** (Q25 에 종속) | 발견 18 |`).**
> → **Q25 ① 채택으로 4 중 4** 다. `quarterly-report.ts` 가 파사드의 `targets()` 로 목록을 받으므로
> `scheduler.ts:21` 정의도 남을 이유가 없다. *"1~3"* 이라는 미확정 범위는 **소진**됐다(③ 현상 유지였다면 4 중 3).
>
> **ⓒ "범위 표에 추가되는 항목 2개" 정정의 두 행 (원문 그대로).**
> *"| **파사드 목록 반환 표면** | `targets(route): string[]` 추가 **또는** `sendDocument` 를 1a 포트에 포함 **또는** `quarterly-report.ts` 만 로컬 유지 — 셋 중 하나를 고르지 않으면 파싱 지점이 5 → 2 에서 멈춘다 |"*
> → **①`targets(route): string[]` 채택 → 파싱 지점 5 → 0** (ADMIN A 동반). **소진.**
> *"| **`notify` 의 context 인자** | 로그 prefix 17종 보존 여부. 시그니처 확정(1a-1) 시점의 결정이다 |"*
> → **① `label` 만 채택 · `onError` 미채택 → prefix 17종 보존 · Q19 B 는 닫힌다.** **소진.**
>
> 세 항목 모두 **되돌리기는 §4-2 맨 위 시그니처와 같다** — 즉시 (1a-3 착수 전까지 · 이후 중간 — §8-1).


### 5-2. 단계 — 1a-0 ~ 1a-4
> **정정 (2026-09-04) — 1a-0 의 "GitHub 원격 발행"은 이미 끝났다.**
> `github.com/fomalhaut84/pleiades` 가 **PUBLIC** 으로 발행됐고 `main`·`dev` 가 올라가 있다.
> 그 위에서 **이슈 #1~#8 과 PR #6·#9 가 운영 중**이고, `.claude/rules/workflow.md` 전체가
> 그 원격을 추적 기반으로 쓴다 (`gh issue create -R fomalhaut84/pleiades`,
> `Closes fomalhaut84/pleiades#<issue>`).
> 따라서 초안이 적은 되돌리기 행위 *"원격 저장소 삭제 또는 방치"* 는 **더 이상 즉시도 아니고
> 손해 0 도 아니다.** 1a-0 에 남은 것은 `package.json` 신설 · `packages/notify/` 스캐폴딩 ·
> 빌드 산출물 정의 · `prepare` 스크립트다.
>
> **딸린 소멸 1건 — 단, 의존성 URL 형태를 바꿔야 성립한다 (2차 정정, PR #13 Codex 리뷰 P1).**
> 저장소가 PUBLIC 이 된 것만으로는 **서버 2대 접근 자격이 사라지지 않는다.**
> §1-1 이 규정한 형태는 **`git+ssh://…`** 이고, **`git+ssh` 는 public 저장소에도 SSH 인증을 요구한다.**
> 그대로 두면 키가 없는 서버에서 **`npm ci` 가 실패한다.**
>
> | 형태 | public 저장소에서 자격 증명 | 비고 |
> |---|---|---|
> | `git+ssh://git@github.com/…#<tag>` (§1-1 현행) | **필요** | 서버 2대에 deploy key |
> | `git+https://github.com/…#<tag>` | **불필요** | pleiades 가 private 이 되면 깨진다 |
> | `github:owner/repo#<tag>` (npm 단축형) | **미확인** — npm 이 ssh 로 해석하는 것으로 알려져 있다 | **1a-0 에서 실제로 확인할 것** |
>
> **따라서 "자격 증명 불필요" 는 `git+https://` 를 택했을 때만 참이다.** → **Q28**

> **정정 (2026-09-08 · 이슈 #31 · 초안 `_workspace/1a-0/02_writer_1a0.md` · 감사 3회)** **바로 위 "딸린 소멸 1건" 의 2차 정정(PR #13 Codex P1)은 세 칸 모두 틀렸다.**
> 지우지 않고 그 위에 정정을 얹는다 — **왜 틀렸는지가 재발 방지의 본체**이기 때문이다.
>
> | 형태 | 위 표의 판정 | **실측 (2026-09-08)** |
> |---|---|---|
> | `git+ssh://git@github.com/…#<tag>` | ~~필요 — 서버 2대에 deploy key~~ | **불필요** — ssh 호출 **0회**, 실제 전송 https |
> | `git+https://github.com/…#<tag>` | ~~불필요 (private 되면 깨진다)~~ | **불필요.** private 전환 시에는 **ssh 폴백이 자동 발동**하므로 "깨진다"도 부정확하다 — 그때 필요한 것은 키다 |
> | `github:owner/repo#<tag>` | ~~미확인 — npm 이 ssh 로 해석하는 것으로 알려져 있다~~ | **불필요** — 셋 다 같은 경로(https 우선 · ssh 폴백)를 탄다. **Q28 표의 "미확인" 칸이 여기서 채워진다** |
>
> **틀린 원인:** lockfile 의 `resolved` 가 `git+ssh://` 로 기록되는 것을 **요구사항으로 읽었다.**
> 그 문자열은 pacote 의 `repoUrl` 이 ssh 를 우선 문자열로 만들 뿐이고, **그 lockfile 로 키 없이 `npm ci` 가 된다**(실측).
> **표기를 계약으로 읽지 않는다** — 이 저장소가 같은 유형으로 두 번째 걸린 자리다.
>
> **§5-2 1a-0 행의 "내용" 칸도 개정된다.** ~~서버 2대 접근 자격(deploy key/토큰)~~ 은 **소멸**하고, 남는 것은 다섯이다:
> **① 루트 `package.json` 신설(위임형 · `workspaces`·`peerDependencies` 없이 · §2-1 정정) ② `packages/notify/` 스캐폴딩 —
> 서브 `package.json` · `tsconfig.json`(**`exclude:["**/*.test.ts"]` 필수**) · `src/index.ts`(버전 상수) · vitest 스모크 1건
> ③ `prepare` = `tsc -p packages/notify`(**S-2**, typescript 는 **루트** devDep) ④ `dist` **미커밋**(`.gitignore` 1줄)
> ⑤ 검증 명령 정의(`workflow.md` 8절 pleiades 행).** 되돌리기 등급은 **즉시** 그대로다 — 되돌릴 것이 pleiades 저장소 안에 갇힌다.
>
> **단 예외가 하나 있다.** `tsconfig` 의 **`exclude` 누락은 되돌리기가 즉시(1줄)지만 비용이 1a-3 으로 이연된다** —
> `prepare` 가 임시 클론에서 테스트 파일을 컴파일하다 **`TS2307` 로 실패하고 소비자 `npm install` 이 통째로 깨지며**(실측: `node_modules` 미생성),
> 그 상태가 두 저장소에 들어가면 **`deploy.sh` 의 `npm ci` 가 두 실서비스에서 동시에 깨진다.** 원인이 pleiades 에 있어 **대상 저장소 롤백으로 풀리지 않는다.**

각 단계는 **그 지점에서 멈춰도 손해가 없다.** 소요는 추정이다.

| 단계 | 내용 | 여기서 멈추면 남는 것 | 되돌리기 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|---|---|
| **1a-0** | pleiades **GitHub 원격 발행** + `package.json` 신설 + `packages/notify/` 스캐폴딩 + 빌드 산출물 정의(`exports`·`.d.ts`) + `prepare` 빌드 스크립트 + 서버 2대 접근 자격(deploy key/토큰) | pleiades 가 버전 관리되는 원격을 갖는다. **두 저장소는 아직 아무것도 모른다** | **즉시 — 단 원격 발행분은 완료됨** | **원격 삭제는 더 이상 선택지가 아니다** — 되돌릴 것은 `package.json`·`packages/notify/` 뿐 | **미측정** (npm 스캐폴딩·발행) |
| **1a-1** | `@pleiades/notify` 구현 — 포트 + 코어 + `TelegramTransport` + 패키지 자체 테스트 | 인터페이스와 구현이 존재한다. **L3 층위가 맞는지 코드로 확인된다** — 파일럿의 절반 | **즉시 — 단 1a-3 착수 전까지만** | 패키지 디렉터리 삭제. **"아직 아무도 안 쓴다"는 1a-3/1a-4 착수 전까지만 참이다** — 그 뒤엔 삭제가 양쪽 `npm ci` 를 깬다 | 반나절 + **미측정**(빌드·발행) |
| **1a-2** | myFitness vitest 도입 (devDep 3 + `vitest.config.mts` 15줄 + scripts 3줄) | myFitness 에 **회귀 baseline 이 생긴다.** 002 Q4 의 이행이고, 1b 안전성의 전제 | **즉시** | **4파일 revert** (`package.json`·`package-lock.json`·`vitest.config.mts`·테스트) + **`npm ci`**. 코드 무영향 | 1시간 미만 |
| **1a-3** | myFitness `send.ts`(124줄) → 패키지 교체, 호출 6건 | fit 아웃바운드가 재시도·폴백을 **키보드 전송에서도** 얻는다(§4-1(a) 해소). 한쪽만 이전됐지만 그 자체로 개선 | **중간** | `send.ts`(124줄) 복원 + import 6건 되돌림 + `package.json`/lockfile revert + **`npm ci`** + 재빌드 + `pm2 restart` (서버 1대 × {web, bot}) | 되돌리기 반나절 |
| **1a-4** | myFinance 호출 20건 → 파사드, 루프 **21곳**·try/catch 21곳 제거, `getAllowedChatIds` 4곳 제거, `rsu.ts` 키보드 흡수 | **코드 드리프트 정지.** 아웃바운드 전송 로직이 한 곳에 있다. 도메인 #3 이 `notify(route, msg)` 한 줄로 알림을 얻는다 — 002 단계 4 도메인 계약 중 **"알림 라우트" 조각 완성** | **중간** | `git revert`. 충돌 시 21개 지점 수작업 복원. **+ 서버 2대 `npm ci`·재빌드·`pm2 restart`** | 되돌리기 1~2일 + **미측정**(배포분) |

**조건부 항목 (Q10 이 "예"일 때만 1a 에 포함).** fit 절단 → 분할 통일 + plain 폴백 정본 선택.
되돌리기는 **코드 즉시**(상수·정책 1줄) / **이미 나간 메시지는 불가**. 소요 1시간 미만.
Q10 이 "아니오"면 1a 는 **관측 가능한 동작 변경이 0** 인 상태로 깨끗하게 끝난다.

> **정정 (2026-09-09 · 이슈 #37 · Q10 확정) — 조건부 항목이 둘로 갈라졌다.**
> 위 원문: *"**조건부 항목 (Q10 이 \"예\"일 때만 1a 에 포함).** fit 절단 → 분할 통일 + plain 폴백 정본 선택."*
> **Q10 은 Q10-L(길이) 과 Q10-P(plain 폴백)로 분리됐고, 성격도 자리도 다르다** (근거는 §3-1 의 2026-09-09 정정).
>
> | 갈라진 항목 | 답 (사용자 2026-09-09 · #37) | 자리 | 조건부인가 | 되돌리기 |
> |---|---|---|---|---|
> | **Q10-P** — plain 폴백 정본 | **① 태그-only** | **1a-1 코어 정본** | **아니다** — 라이브 두 구현과 동일 동작이라 관측 변경 0(리터럴 `<>` 단서 제외) | 코어 정규식 1줄 · **즉시 (1a-3 착수 전까지 · 이후 중간 — §8-1)** |
> | **Q10-L** — fit 절단 → 분할 | **① 분할로 통일** | **1a-3**(fit `send.ts` 교체) | **그렇다** — 사용자에게 보이는 동작 변경(메시지 수 증가)이라 승인 대상이었고 **승인을 받았다** | 길이 정책 1줄 되돌림 · **코드 즉시 (1a-3 착수 전까지 · 이후 중간)** / **이미 나간 메시지는 불가** |
>
> **위 문단의 되돌리기 표기 *"코드 즉시"* 에는 시점 한정이 붙는다** — 1a-3 착수 이후에는 `git revert` 에
> `npm ci` + 재빌드 + `pm2 restart`(병행 인스턴스)가 따라붙어 **중간**이다 (§8-1).
> **그리고 *"Q10 이 아니오면 1a 는 동작 변경 0"* 은 이미 아래 정정 ①이 불성립으로 판정했다** — 이번 답에서도 같다:
> Q10-L ①을 골랐으므로 **fit 리포트 말미 복원(메시지 수 증가) 1건이 관측 변경으로 들어온다.**
> `lastError` 쪽은 **Q19 C(raw 보존)라 관측 변경 0** 이고, `rsu.ts:184` 는 **Q27**(1a-4 안건)에 남아 있다.

> **정정 ① (2026-09-04 · 이슈 #4 · 발견 20 · M2-2) — *"Q10 이 아니오면 1a 는 관측 가능한 동작
> 변경이 0"* 은 **불성립한다.** 바로 위 문장은 틀렸다. myFinance 쪽에서 **동작 변경이 두 갈래로 발생한다.**
>
> | # | 지점 | 지금 | 파사드 흡수 후 | 되돌리기 |
> |---|---|---|---|---|
> | 1 | `rsu.ts:184` | raw `bot.api.sendMessage` — **재시도도 HTML 폴백도 없다** | `[2000,8000,30000]`ms **×4 재시도** + HTML→plain 폴백이 **새로 붙는다** | **코드 즉시** / **이미 나간 메시지는 불가** |
> | 2 | `lastError` 4곳 (발견 20) | raw `error.message` 가 DB `AlertHistory.errorMessage` → **화면 2곳 + CSV** | 파사드가 `sanitizeError` 를 통일 적용하면 **UI·CSV 문자열이 바뀐다** | **코드 즉시** / **이미 저장된 DB 행은 불가**(무해 — 과거 로그 행) |
>
> 003 은 myFitness `sendToAllWithKeyboard` 의 **같은 성격의 개선**(§4-1(a), §5-3)은 명시했으나
> **fin `rsu.ts` 쪽 대칭 항목을 빠뜨렸다.** 둘 다 기능 개선이지만, 이 문서가 세워둔 기준
> (*"무단으로 넣을 변경은 아니다"*)에 따르면 **동일하게 사용자 확인 대상**이다.
>
> **정확한 서술:** *"Q10 이 아니오여도 1a-4 는 관측 가능한 동작 변경 2건을 동반한다 —
> `rsu.ts` 전송 신뢰성 향상(무조건 발생, 회피하려면 `rsu.ts` 를 §7-4 처럼 예외로 남겨야 한다)과
> `lastError` sanitize(Q19 로 회피 가능)."* 1a-0~1a-3 은 여전히 **동작 변경 0** 이다.
>
> `rsu.ts` 를 예외로 남기는 선택지도 있다 — 되돌리기 **즉시**(아무것도 안 함)지만,
> 그러면 초크포인트 커버리지가 **14/16 에서 오르지 않고** 발견 12 의 우회가 그대로 남는다.
> **권고: 흡수한다.** 회피 비용이 목적 자체를 깎는다.

> **정정 ② (2026-09-04 · 이슈 #4) — 1a-4 되돌리기 "1~2일 / 21개 지점" 재산정.**
> 위 표의 1a-4 행은 *"충돌 시 **21개 지점** 수작업 복원"* 이라 적었다. **21 은 루프 개수일 뿐이다.**
> 실제 수작업 복원 대상은 §5-1 정정의 개정 청구서 그대로 **약 94 지점 — 시그니처·호출부
> 개편분 39 를 빼고 세어도 최소 60 지점**이다 (루프+catch 21 · 가드 10 · 분모 11 ·
> `lastError` 파생 4 · `getAllowedChatIds` 정의 3 · 테스트 `it()` 9 · `rsu.ts` 키보드 1 …).
>
> | | 003 기존 | 개정 |
> |---|---|---|
> | 되돌리기 **등급** | **중간** | **중간 — 유지** |
> | 되돌리는 행위 | `git revert`. 충돌 시 **21개 지점** 수작업 + 서버 2대 `npm ci`·재빌드·`pm2 restart` | `git revert`. 충돌 시 **60+ 지점**(표 합계 94) 수작업 + 서버 2대 `npm ci`·재빌드·`pm2 restart` |
> | 소요 (추정) | 되돌리기 1~2일 | **되돌리기 2~4일** (지점 수 약 3배 · 단 절반 이상이 시그니처/호출부의 **기계적 복원**) |
> | 되돌릴 수 없는 잔여물 | 없음 | **이미 나간 `rsu.ts` 메시지**(재시도로 인한 중복·지연) · **이미 sanitize 되어 저장된 `errorMessage` 행** · **깨진 구간의 로그 문자열** — 셋 다 **무해**하고 자가 소멸 |
>
> **등급이 유지되는 근거:** DB 스키마 무변경 · 데이터 마이그레이션 없음 · `git revert` 가
> 여전히 1차 수단 · 잔여물이 전부 자가 소멸하는 로그성 데이터. "높음"으로 올릴 조건
> (이력이 얽힘 · 역방향 마이그레이션 필요)에 **하나도 해당하지 않는다.**
> 커진 것은 **충돌 시 수작업 분량**이고, 그것은 등급이 아니라 **소요** 열의 값이다.

> **정정 ③ (2026-09-04 · 이슈 #2 · 발견 23) — 1a-2 의 되돌리기 단위와 선결 조건.**
> 위 표의 1a-2 행(*"4파일 revert + `npm ci`"*)은 **등급도 파일 수도 그대로 유효하다.**
> 추가되는 것은 **선결 조건 하나와 결정 하나**다.
>
> | 항목 | 내용 | 되돌리기 |
> |---|---|---|
> | **선결 — `overrides.postcss` 1줄 수정** | `"$postcss"` → `"^8.5.10"`. 이것 없이는 **1a-2 가 첫 명령에서 멈춘다**(`npm error Unable to resolve reference $postcss`). 4파일 중 `package.json` 안이므로 **되돌리기 단위는 늘지 않는다** | **즉시** — 1줄 되돌림. 빌드 산출물의 postcss 는 8.5.25 로 **동일** → 서비스 영향 없음 |
> | **결정 — 테스트 파일 경로** | `src/**/__tests__/` (fin 과 대칭 · fit `eslint src/ --max-warnings 0` 게이트 **적용됨**) vs 루트 `__tests__/` (게이트 회피 · 컨벤션 어긋남) | **즉시** — 파일 이동. 단 **뒤로 미룰수록 옮길 파일이 는다** |
> | **`--save-dev`** | dry-run 은 지시대로 플래그 없이 돌려서 npm 이 `dependencies` 에 넣으려 했다. fin 은 `devDependencies` 다 | **즉시** — `package.json` 1블록 이동 |
>
> **1a-2 등급은 "즉시" 그대로다.** 세 항목 전부 코드 무영향이고 되돌리기가 파일 편집이다.


### 5-3. 1a 가 끝났을 때 남는 것 (전체)

- 아웃바운드 전송 로직이 **한 곳**에 있다. fin/fit 의 **코드** 가 갈라질 자리가 없어진다
  (단 **버전 드리프트로 이전**된다 — §2-2)
- fit 아웃바운드가 재시도·폴백을 **키보드 전송에서도** 얻는다
- 도메인 #3(캘린더)이 `notify(route, msg)` 한 줄로 알림을 얻는다
- **B1 추출 패턴이 실증된다** (파일럿 목적 달성). 실패하면 나머지 패키지 계획을 재검토할 근거가 생긴다
- **`packages/notify/` 가 단계 4 에 그대로 승계된다** (§2-1)
- Discord 는 **하지 않아도 손해가 없다.** 포트가 있으므로 언제든 어댑터만 추가하면 된다

---

## 6. 1b 범위 — Discord 아웃바운드 전환

**착수 전제:** 1a-4 완료. **1b 를 통째로 하면 되돌리기 등급이 한 칸 오른다** — 그래서 또 쪼갠다.

| | **1b-1 · 텍스트 알림만** | **1b-2 · 인터랙션 · 첨부 · DB** |
|---|---|---|
| 범위 | `DiscordTransport` + 채널 라우팅(`#finance`/`#fitness`/`#calendar`) + 2000자 분할 + HTML→Discord-md 역변환 + 수신자 env 중립화 | 인터랙션 엔드포인트 2건 + PDF 첨부 1건 + `WorkoutAdjustment` 컬럼 중립화 |
| 남는 텔레그램 | 인터랙션 2건(RSU 베스팅 · 훈련 자동조정), PDF 분기 리포트 | 없음 (아웃바운드 전량 Discord) |
| 필요한 것 | 라우트별 채널 선택 (**혼합 운영 — Q11 허용됨**) | gateway 또는 HTTP interactions endpoint (**신규 인프라**), `answerCallbackQuery`/`editMessageReplyMarkup` 대응 개념 재설계, DB 처리(Q12) |
| 되돌리기 | **env 값 1개 + 재시작 4회** · git 이력 밖 (§8-2) | §8-2 · Q12 |

### 6-1. 1b-1 이 처리해야 하는 것

| 항목 | 규모 | 근거 |
|---|---|---|
| 2000자 분할 | fit 아웃바운드에 **분할 신규 도입**(지금 절단). splitter 가 태그 경계를 모름 → 분할 지점 약 2배 | 발견 11 |
| HTML 중립화 | fin 아웃바운드 **14/16 모듈** + `advisor-monitor.ts` 8 hits, fit **템플릿 직타 3/5 모듈** + `admin-alerts.ts` 11 hits | 발견 14 |
| 수신자 env | `TELEGRAM_` prefix 6곳(fin)/2곳(fit) 파싱. 등급 축 fin 2 / fit 1, **도메인 축 0** | §4-4 |
| fin 상수 분리 | fin 은 인/아웃바운드가 4096 상수를 **공유**하므로 아웃바운드만 낮추려면 상수를 쪼개야 한다 | 발견 11 |

**HTML 중립화는 두 갈래다.** 본문 생성부 18~19 모듈을 고치거나, **어댑터 안에 HTML→Discord-md
역변환기를 두거나.** 후자를 택한다 — 근거는 §7-1.

### 6-2. 1b-2 의 DB 처리 (Q12, 권고 D-a)

`WorkoutAdjustment` 의 `telegramMessageId`/`telegramChatId` 를 어떻게 다루느냐로 되돌리기 등급이 갈린다.

| | **D-a · 컬럼 그대로 두고 Discord id 저장 (권고)** | **D-b · 채널 중립 컬럼 추가 + 백필** |
|---|---|---|
| 스키마 변경 | **없음** (`String?`/`TEXT` 라 19자리 snowflake 가 그대로 들어감. 길이 제약·CHECK 없음) | 컬럼 3개 추가 + 인덱스 + 백필 + 구 컬럼 폐기 |
| 정직한가 | **아니오** — 컬럼 이름이 거짓이 된다 | 예 |
| 되돌리기 등급 | **즉시(코드)** | **사실상 편도** |
| 잔여물 | **사실상 0.** 매칭은 `callback_data` 의 adjustment id 로 하고(`auto-adjust-callback.ts:231-238`) `telegramMessageId` 는 **읽기 경로 0건**이다. 실제 잔여물은 롤백 후 Discord 메시지 버튼이 응답 대상을 잃는 것이고 그건 **1b-2a(인프라) 문제로 D-a/D-b 와 무관**하다. 노출은 **정적 상한**이 있다 — 제안 하루 1회(`scheduler.ts:103`), TTL 8h 또는 KST 자정(`auto-adjust-cron.ts:13`), cron 이 자동 `expired` 마킹(`:123-136`) → **최대 ~1건 · ≤8시간 · 자가 소멸** | 코드 revert 로 **끝나지 않는다.** 역방향 백필 마이그레이션을 따로 써야 한다 |

**권고 D-a.** 컬럼 이름의 부정직함은 **가역적 부채**(나중에 rename)지만, D-b 의 마이그레이션은
되돌리기 등급을 단계 1 전체에서 **유일하게 "사실상 편도"** 로 올린다. 그리고 채널 중립 컬럼
이름은 **002 Q7(도메인별 DB vs 단일 DB schema 분리)의 답에 종속**된다 — Q7 이 미결인 채로
중립 스키마를 확정하면 두 번 마이그레이션한다. **Q7 이 미결인 동안 DB 를 건드리지 않으면
단계 1 은 Q7 과 독립을 유지한다.**

---

## 7. 명시적으로 제외하는 것

### 7-1. HTML 콘텐츠 모델 중립화의 **저장·UI 파급** — 제외

**제외 대상:** `PRE_ESCAPED_KINDS` 3중 정의 정리, alert 히스토리 테이블의 저장 규약 변경,
`app/alerts/history` 웹 UI, CSV export(`csv-format.ts:46`),
`decodeHtmlEntities`→`escapeHtml` round-trip gating(`alert-dispatcher.ts:117-119`).

**이유:** HTML 이 myFinance 에서 **저장 포맷**이기 때문에(발견 14), 콘텐츠 모델을 채널 중립으로
바꾸면 봇 코드에서 끝나지 않고 **DB 저장 규약 + 웹 UI + export** 로 번진다. 이 셋은 알림 채널과
아무 관계가 없다. 단계 1 목적에 대한 **순수 부수 비용**이다.

**대신 무엇을 하나:** 어댑터 안(§4-3 제약 3 위치)에 **HTML→Discord-md 역변환기**를 둔다.
본문은 계속 HTML 로 생성·저장되고, Discord 로 나갈 때만 변환된다.

> **정정 (2026-09-03 감사 반영 · 주장 6-A).** 초안은 *"`markdownToTelegramHtml` 의 역방향이므로
> 정본 참조가 이미 있다"* 고 썼다. 그 문장은 역변환을 실제보다 싸게 보이게 한다.
> `markdownToTelegramHtml`(`utils/markdown.ts:51`, 103줄)은 **부분** 참조이지 대칭 역함수가 아니다 —
> 정방향은 `& < >` 만 escape 하고(`markdown.ts:57-60`) 마크다운 메타문자(별표·밑줄·물결·백틱·
> 파이프·역슬래시)를 **소비**하지만, 역방향은 그것들을 **생성**하면서 동시에 **텍스트 노드 안의
> 같은 문자를 escape** 해야 한다. **정방향에 대응 단계가 없는 새 단계다.**
> 이건 이론이 아니다 — `displayName`·`ticker`·전략명은 **사용자 입력**이고 `escapeHtml` 만
> 거친다(`price-alert.ts:219,284`). `csv-format.ts:67-68` 과 `alert-dispatcher.ts:112-113` 주석이
> `SOXL < 40 > RSI` 같은 이름이 **실재**함을 명시한다. 밑줄·별표가 든 이름은 Discord 에서
> **서식으로 렌더된다** — 이 escape 를 빠뜨리면 **서식 주입**이다. 또 `convertTables`
> (`markdown.ts:55`)로 이미 리스트가 된 표는 **복원 불가**다.

**제외했을 때 남는 것:** 저장 포맷은 HTML 그대로. `PRE_ESCAPED_KINDS` 중복 3곳도 그대로.
`h` 헬퍼 91회/19파일도 그대로. **알림 채널만 바뀐다.** 그게 원래 목표다.

### 7-2. `h` 헬퍼 / md→HTML 변환기 / `formatter.ts` — 제외

| 항목 | 제외 이유 | 남는 것 |
|---|---|---|
| `h.b/h.i/h.code/h.pre` (fin 91라인/19파일, fit 0) | 패키지로 옮기면 **myFinance 19개 파일이 어댑터에 의존**한다. 표면이 "전송"에서 "포매팅"으로 넓어짐 | `h` 는 myFinance 로컬. 어댑터는 문자열만 받는다 |
| `markdownToTelegramHtml`(103줄) / `mdToHtml`(10줄) | 역량 차가 커서 통합하면 fit 동작이 바뀐다. 그리고 이건 **입력 포맷 변환**이지 전송이 아니다 | 각 저장소 로컬 |
| `formatter.ts` 공유 | **겹치는 export 0개** — 이름만 같다 (발견 15) | 도메인 포맷터는 각자. **`splitMessage` 하나만** 패키지로 |
| fit `escapeHtml` 중복 2곳 (`telegram.ts:18`, `auto-adjust.ts:112`) | **제외 아님 — 단 "자동 해소"는 과장이다** (감사 E7). `utils/telegram.ts:18` 은 **인바운드 `replyLong`(`:30,33`)도 쓰므로** 파일이 통째로 사라지지 않는다 | 패키지가 **발췌**해 가고 로컬에 인바운드용 잔여가 남는다 — 중복이 **2 → 1** 이지 0 이 아니다 |
| fin `isHtmlParseError` 죽은 export (참조 0) | **제외 아님** | 패키지화 시 정본 1개로 수렴 |

### 7-3. 인바운드 전부 — 제외 (002 §3 확정 사항). **단 하나 예외**

명령 30파일 / 전송 210건(fin 149 · fit 61) / grammY `Context` 결합. 002 가 "단일 봇까지
텔레그램으로 둔다"고 확정했다.

> **정정 (2026-09-03 감사 반영 · 주장 2-b).** *"인바운드 변경 없음"* 은 그대로 참이 아니다.
> `error.ts` 를 패키지가 흡수하면 **인바운드 파일 6곳**의 import 경로가 바뀐다 —
> fin `commands/watchlist.ts:6` · `commands/vest-confirm.ts:19` · `commands/ai.ts:14` ·
> `standalone.ts:14`, fit `auto-adjust-callback.ts:8` · `standalone.ts:4`.
> 로컬 `utils/error.ts` 를 `export * from '@pleiades/notify'` **shim** 으로 남기면 0 으로 만들 수
> 있다 (§5-1 구현 결정).

여기에 딸린 제외 항목 둘:
- myFinance 인바운드 4096 상수(`commands/briefing.ts:98` 하드코딩) — 인바운드가 텔레그램이면
  4096 이 맞다. 단 fin 은 상수를 인/아웃바운드가 **공유**하므로(발견 11) **1b 에서 상수를
  쪼개는 작업만은 발생한다**
- 인바운드 인증 `Set<number>` + `.map(Number)`(발견 10) — 텔레그램 chat id 는 9~10자리라 안전.
  Discord 인바운드를 하게 될 때 다시 열 것

### 7-4. `quarterly-report.ts` PDF 첨부 — 1a 에서 제외, 1b-2 로

포트를 `send(target, content)` 로 좁게 잡는다. 바이너리 첨부는 아웃바운드 **1건**
(`quarterly-report.ts:54`, `sendDocument` + `InputFile`, fit 은 0건)이다. 1건 때문에 포트에
첨부 개념을 넣으면 **모든 어댑터가 그것을 구현해야 한다.**
**1a 에서는 텔레그램 raw 호출로 그대로 둔다.**

**남는 것:** 아웃바운드 초크포인트 커버리지가 fin **15/16**(현재 14/16). `rsu.ts` 는 흡수,
`quarterly-report.ts` 는 예외로 남고 그 사실이 문서에 남는다. 그리고 `:52` 루프와
`sendQuarterlyReport(chatIds: number[])` 시그니처도 함께 남는다.

### 7-5. 수신자 라우팅의 **도메인 축 재설계** — 1a 는 자리만

§4-4 참조. 실제 재설계(env 이름 중립화 · 도메인별 채널 분리)는 도메인 #3 을 붙일 때.

### 7-6. fit 관리자 alert 수신자 오발송 — 제외 (별건 → Q13)

fin `advisor-monitor.ts:187-194` 주석이 명시적으로 금지한 동작을 fit `admin-alerts.ts:232` 가
하고 있다(`sendToAll` → `TELEGRAM_ALLOWED_CHAT_IDS`, 가족 chat 포함). 1a 가 `Route` 개념을
만들면 **고칠 자리는 생기지만** 고치는 것은 별개 결정이다 — 지금 받던 사람이 못 받게 되는
**관측 가능한 동작 변경**이고, fit 에는 `TELEGRAM_ADMIN_CHAT_IDS` 가 아예 없어 env 신설이 따라온다.

---

## 8. 되돌리기 비용 (감사 정정 반영본)

> **소요 시간 열은 실측이 아니다.** 인용된 건수에서 유도한 작업량 추정이다.
> **등급과 "되돌리는 행위"가 이 표의 본체다.**

### 8-1. 1a — `git revert` 로 끝나지 않는다

**1a 전체 되돌리기 = `git revert`(`package.json`·`package-lock.json` 포함) + `npm ci` +
재빌드 + `pm2 restart`, ~~실서비스 서버 2대~~ **병행 인스턴스 2개(`myfinance-int`·`myfitness-int`)** — Q42 확정(2026-09-07, §10-1 정정)으로 실서비스 프로세스는 대상이 아니다.**
DB 무변경, env 무변경, 사용자가 받는 채널 무변경.

> **정정 (2026-09-03 감사 반영 · 주장 2).** 002 §4 는 단계 1 의 되돌리기를 *"재인라인 며칠"*
> 이라고 썼다. **코드 부분만 정확하고 의존성·배포 부분이 빠져 있다.** 빠진 것 넷:
>
> 1. **파일 수가 어디에도 없었다.** 초안은 호출 **건수**만 셌다. 실제 union 은 myFinance
>    **약 29파일**, myFitness **약 13파일** — **실서비스 두 곳 합계 40여 파일**이다
>    (`package.json`·`package-lock.json`·`next.config.mjs`·`vitest.config.mts`·테스트 포함).
>    "호출 20건"이 주는 인상과 다르다.
> 2. **`npm ci` 가 되돌리기 단위에 들어간다.** `@pleiades/notify` 가 **의존성**이고 배포
>    스크립트가 `npm ci`(`myFinance/deploy/deploy.sh:106`, myFitness 동일)이므로
>    **lockfile 이 배포 경로에 실린다.** `npm ci` 는 lockfile 과 `package.json` 불일치 시 **실패**한다.
> 3. **`file:` 링크였다면 두 `deploy.sh` 에 pleiades 체크아웃·pull 단계 신설이 선결이었다.**
>    현재 두 스크립트는 **자기 저장소만** `git pull` 하고 `ecosystem.config.js` 의 `cwd` 는
>    `/home/nasty68/myFitness` 다. **Q15 가 git 의존성으로 답해지면서 이 항목은 소멸했다** —
>    되돌릴 대상이 `package.json` + lockfile 안에 갇힌다 (§1-1).
> 4. **Next 빌드 그래프에 들어간다.** myFinance 웹 라우트
>    (`app/api/alerts/history/[id]/retry/route.ts` → `alert-dispatcher` → `sendHtml`)가
>    초크포인트에 도달하므로, 패키지가 **TS 소스를 배포하면 양쪽 `next.config.mjs` 에
>    `transpilePackages` 추가**가 필요하고, **컴파일 JS 를 배포하면 설치 시점 빌드(패키지 선행
>    빌드 순서)** 가 생긴다. 현재 `next.config.mjs` 는 fin 이 `experimental.instrumentationHook`
>    뿐, fit 은 빈 객체다.
>
> 등급 자체(**중간**)는 바뀌지 않는다. 바뀐 것은 **되돌리기의 단위와 실행 장소**다 —
> 개발 머신의 `git revert` 가 아니라 **실서비스 서버 2대의 재설치·재빌드·재시작**이 포함된다.

> **정정 (2026-09-08 · 이슈 #31 · 초안 `_workspace/1a-0/02_writer_1a0.md` · 감사 3회)** **`npm ci` 자체에 git 의존성 비용이 붙는다 — 그리고 매번 붙는다.**
> `prepare` 는 설치 1회가 아니라 **`npm ci` 마다** 실행된다(§1-1 정정). 채택 형태(S-2 · 위임형) 실측:
>
> | 시나리오 | `npm ci` |
> |---|---|
> | **채택 형태** (git dep · `prepare` = `tsc -p packages/notify`) | **1.99~2.15 s**(케이스 B) / **2.14 s**(위임형) |
> | 서브 install 을 거치는 형태(S-1b) | 3.14~3.15 s |
> | **`workspaces` 를 넣은 위임형** | **3.67~3.96 s** · npm 캐시 **134 MB** — 그래서 넣지 않는다 |
> | 서브 devDeps 에 vitest 를 둔 S-1 | 9.24 s · 캐시 140 MB |
> | 대조 — dist 를 커밋하고 `prepare` 를 없앤 형태 | **0.43~0.45 s** |
>
> **`dist` 커밋이 절약하는 값은 배포당 약 1.6 초다**(2.0 − 0.43). **그래도 `dist` 는 커밋하지 않는다** —
> 절약이 작고, 산출물 diff 가 리뷰 신호를 덮으며, **태그와 산출물이 어긋난 상태가 존재할 수 없다**는 성질을 잃기 때문이다.
>
> **되돌리기 등급은 바뀌지 않는다(중간).** 새로 생기는 것은 **`prepare` 실패 = 배포 실패이자 롤백 실패**라는 실패 모드다 —
> 되돌리기 경로의 `npm ci` 도 같은 클론·컴파일을 돈다.
>
> **정정 4 재확인.** 두 `next.config.mjs` 에 `transpilePackages` 키는 **여전히 0건**이므로, 컴파일된 JS 를 배포하는 한 **두 저장소 변경은 0** 이다.

단계별 되돌리기는 §5-2 표. 층위 옵션 자체의 되돌리기는:

| 옵션 | 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|
| L1 per-chat | **중간** | 패키지 import 를 로컬 함수로 재인라인. fit `SendResult` 집계를 `send.ts` 로 복원 | 1~2일 |
| L2 broadcast | **중간** | 재인라인 + **fin 루프 21곳·try/catch 21곳 복원**(`git revert` 로 가능, 그 사이 커밋과 충돌 시 수작업) | 2~3일 |
| **L3 2층 (채택)** | **중간** | L2 와 동일. 단 포트가 얇아 어댑터 쪽 revert 는 파일 단위로 깨끗 | 2~3일 |

세 옵션 모두 **데이터 무변경**이다. "사실상 불가"는 없다.
**단 세 옵션 모두** 위 정정의 `npm ci` + 서버 2대 재빌드·재시작이 붙는다.

### 8-2. 1b — DB 가 걸리면 코드 revert 로 안 끝난다

| # | 항목 | 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|---|
| 1b-1a | `DiscordTransport` 신설 | **즉시** | 파일 삭제 | 1~2일 |
| **1b-1b** | 라우트→채널 매핑을 Discord 로 전환 (텍스트만) | **즉시(운영) · 수 분 · git 이력 밖** | **env 값 1개 + 재시작 4회** ↓ 정정 | 수 분 |
| 1b-1c | 2000자 분할 (fit 신규 도입, fin 상수 분리) | **즉시(코드)** / **불가(이미 나간 메시지)** | 상수·정책 revert | 반나절 |
| 1b-1d | HTML→Discord-md 역변환기 | **즉시** | `Transport` 직전 훅 제거 | 1~2일 |
| 1b-1e | 수신자 env 를 채널 중립 이름으로 | **즉시** | env 이름 복원 (양쪽 병행 기간 두면 무중단) | 반나절 |
| 1b-2a | interaction 엔드포인트 신설 (gateway 또는 HTTP) | **중간** | 엔드포인트 제거 + PM2/Nginx 설정 되돌림. **실서비스 라우팅 변경** | 수일 |
| 1b-2b | 인터랙션 2건 이식 (RSU 베스팅 · 훈련 자동조정) | **중간** | 코드 revert. 전환 중 발송돼 미응답인 건은 **1b-2a 가 사라져 응답 대상을 잃는다** | 수일 |
| 1b-2c | PDF 첨부 이식 (`quarterly-report.ts`) | **즉시** | raw `sendDocument` 복원 | 반나절 |
| 1b-2d | `WorkoutAdjustment` DB 처리 | **D-a 즉시 / D-b 사실상 편도** | §6-2 | — |

> **정정 (2026-09-03 감사 반영 · 주장 3).** 002 §4 의 *"채널은 env 1줄"* 과 §단계 1 의
> *"채널 되돌리기는 env 한 줄"* 은 **세 군데서 틀렸다.** 하드코딩 블로커가 없다는 부분은
> 확인됐지만, **"한 줄"이라는 단가가 틀렸다.**
>
> 1. **그 한 줄은 git 밖에 있다.** `.env` 는 양쪽 `.gitignore:28` 이다. 되돌리기는 `git revert` 가
>    아니라 **실서비스 서버 2대에서의 수동 편집**이고, 이력에 남지 않으며 CI 가 검증하지 않는다.
>    시간은 1a 보다 싸지만 **추적성은 1a 보다 나쁘다.**
> 2. **재시작 없이는 반영되지 않는다 — 프로세스 4개.** `scheduler.ts:40` 이 `chatIds` 를 한 번
>    계산해 모든 cron 콜백에 **클로저로 캡처**하고(`:68~`), `standalone.ts:10` 의 `dotenv/config`
>    는 부팅 시 1회다. 웹 프로세스도 아웃바운드 경로를 가진다
>    (`app/api/alerts/history/[id]/retry/route.ts`). → **서버 2대 × {web, bot} = 재시작 4회.**
>    봇 재시작에는 텔레그램 long-poll **409 위험**이 붙는다(myFitness `deploy.sh` 가
>    `pm2 delete` + `pm2 start` 를 쓰는 이유).
> 3. **플립이 env-only 인 것은 `DiscordTransport` 가 이미 양쪽에 빌드·배포된 뒤부터다.**
>    `build:bot` 의 esbuild `--external:` 목록이 **두 저장소 `package.json` 에 하드코딩**돼 있어
>    Discord SDK 추가는 코드 변경 + 재빌드 + 재배포다. 되돌린 뒤에도 SDK 는 번들에 남는다.
>
> 정확한 서술: **"채널 되돌리기는 (선행 배포가 끝난 뒤) env 값 1개 + 재시작 4회, 소요 수 분,
> git 이력 밖."** 등급은 여전히 1b 에서 가장 싸다 — 바뀐 것은 **추적성과 선행 조건**이다.

---

## 9. 미확인 항목 — 재지 못한 것이 아니라 **실행하지 않아서 모르는 것**

읽기 전용 규율상 대상 저장소에서 `npm install` · `npm run lint` 를 돌리지 않았다.
둘 다 **1a-2 의 성립 여부**에 직결된다.

| # | 미확인 항목 | 무엇을 막고 있나 | **확인 방법** |
|---|---|---|---|
| **U1** | myFitness 에서 `vitest@^4.1.8` + `@vitest/coverage-v8@^4.1.8` + `vite-tsconfig-paths@^6.1.1` 이 **충돌 없이 resolve 되는가** | **1a-2 의 성립 여부.** fit 트리는 eslint 9 / eslint-config-next 16 / prisma 6.19.3 으로 fin(eslint 8 / 15 / prisma 6.19.2)과 **다르다** — fin 에서 되는 것이 fit 에서 된다는 보장이 없다 | `dual-repo-operator` 가 myFitness 에서 **1회**: `npm install --dry-run --package-lock-only vitest@^4.1.8 @vitest/coverage-v8@^4.1.8 vite-tsconfig-paths@^6.1.1`. **파일 무변경** |
| **U2** | myFitness 테스트 파일이 `eslint src/ --max-warnings 0` **zero-warning 게이트**를 통과하는가 | 1a-2 완료 판정. fit lint 는 eslint 9 / eslint-config-next 16 이고 `eslint.config.mjs` 의 `ignores` 는 `src/generated/**` 뿐이라 **`__tests__` 가 검사 대상**이다 | 테스트 파일을 쓴 뒤 myFitness 에서 `npm run lint` **1회**. fin 은 `next lint`(eslint 8/15)라 기준이 다르므로 **양쪽 각각** 확인 |

**부수 비대칭 하나 (확인됨, 미확인 아님).** myFitness 에만 `typecheck: tsc --noEmit` 이 있고
`tsconfig.include` 가 `**/*.ts` 다. 새 테스트 파일이 **fit 에서만** `tsc --noEmit` 검사 대상이 된다.
같은 패키지 테스트를 양쪽이 다르게 취급하게 된다.

**아직 측정되지 않은 값 (Q10/Q14 관련).** 아웃바운드 알림의 **실제 길이 분포**(평균/최대/2000
초과 비율)는 런타임 데이터라 실서비스 DB 접근이 필요하다(→ Q14). 이것이 **Q10 하나만** 막는다.

> **정정 (2026-09-09 · 이슈 #37 · Q10·Q14 재범위) — 위 문단과 §10 Q14 행을 함께 고친다.**
> 원문: *"아웃바운드 알림의 **실제 길이 분포**(평균/최대/2000 초과 비율)는 런타임 데이터라 실서비스 DB 접근이 필요하다(→ Q14). 이것이 **Q10 하나만** 막는다."*
> §10 Q14 행도 같은 문장(*"§9 의 알림 길이 분포 **1건**이 풀린다. **Q10 하나만** 막는다"*)을 쓴다. 셋을 고친다.
>
> **① 로그 우회 경로는 존재하지 않는다.** 절단·분할·폴백 **4지점이 전부 무음**이고 로그가 나오는 곳은 재시도와 전송 실패뿐이다
> (`measured-facts.md` **C-1**). 계량하려면 **계측 코드 추가 + 실서비스 배포 + 대기**이지, 조회만의 문제가 아니다.
> **② 필요한 대상이 하나로 좁혀졌다.** fit 아웃바운드 6 호출 중 4096 을 넘길 수 있는 것은 **`scheduler.ts:34`(LLM 일일·주간 리포트) 하나**뿐이고
> 그 원문은 이미 fit DB 에 있다(`lib/daily-report.ts:109-114` 의 `prisma.aIAdvice.create({ …, response: result })` — **절단 이전** 본문) (**C-2**).
> → 질의는 **단일 테이블·단일 컬럼 길이 집계 1회**(`AIAdvice.response`, `category IN (morning_report, evening_report, weekly_report)`)이고
> **계약은 `length(response)` 집계값만 반환 · `response`·`prompt` 본문 반출 0** 이다. `response` 는 **AI 가 쓴 개인 건강 리포트 본문**이므로
> 식별 열이 없다는 사실만으로 반출 안전이 성립하지 않는다. 전송본이 접두와 `mdToHtml` 치환을 더하므로 **`length(response)` 는 하한**이다.
> **③ Q14 는 이제 무엇도 막지 않는다.** *"Q10 하나만 막는다"* 의 정확한 서술은 **"Q10-L 을 ③(측정 후 결정)으로 고를 때만 필요해진다"** 인데,
> **Q10-L 은 ①(분할로 통일)로 확정**됐다(사용자 2026-09-09 · #37) — 따라서 **Q14 는 1a 경로에서 빠진다.**
> 다시 필요해지는 조건은 §11 유효기간의 *"Q14 가 열릴 때"* 행뿐이다. **되돌리기: 문구 (즉시).**

**1a 착수 직전 측정 1건.** myFinance **22곳 루프 본문이 전송 외에 무엇을 하는가** —
정적 측정이 가능하고, 감사가 대표 4곳을 부분 수행했다. `repo-surveyor` 재호출로 1a-4 청구서를
확정한 뒤 착수한다.

---

> **정정 ① (2026-09-04 · 이슈 #2 집행 · 발견 23) — U1 은 해소됐다. 결론은 맞았고 원인이 틀렸다.**
>
> 위 U1 행은 막는 요인으로 *"fit 트리는 eslint 9 / eslint-config-next 16 / prisma 6.19.3 으로
> fin(eslint 8 / 15 / prisma 6.19.2)과 다르다"* 를 지목했다. **그 차이들은 이번 resolve 에
> 전혀 관여하지 않았다** — vitest 는 eslint·prisma 와 의존 관계가 없다.
>
> | | 003 §9 의 가설 | 실측 (`_workspace/05_operator_u1_vitest.md`) |
> |---|---|---|
> | 실패 형태 | peer dependency 충돌(`ERESOLVE`) 예상 | **`ERESOLVE` 0건.** `npm error Unable to resolve reference $postcss` |
> | 원인 | eslint / eslint-config-next / prisma 버전 차 | fit `package.json` `overrides` 의 **`"postcss": "$postcss"` 한 줄** (`$esbuild` 는 무관) |
> | resolve 결과 | 미확인 | vitest **4.1.11** · coverage-v8 **4.1.11** · vite-tsconfig-paths **6.1.1** · vite **6.4.3(fin 과 동일)**. postcss·esbuild **무변경**. lock 716 → **785** |
> | 판정 | — | **조건부 성립** — 1줄 수정이 선결 |
>
> **U1 가설은 결론적으로 옳았다** (*"fin 에서 되는 것이 fit 에서 된다는 보장이 없다"*).
> 옳은 결론에 틀린 이유가 붙어 있었고, 그 이유대로 대비했다면 **엉뚱한 것을 고쳤을 것이다.**
> 실제 수정은 의미 동일한 1줄이고 **미승인이라 적용하지 않았다** → **Q16**.
>
> 집행 규율 확인: 대상 저장소에서 실행한 명령은 `--dry-run --package-lock-only` **2건뿐**,
> 원인 분리(변형 5종)와 lock 생성은 전부 scratchpad 사본. `package.json`·`package-lock.json`
> md5 가 baseline 과 동일하고 두 worktree 모두 `git status` clean.

> **정정 ② (2026-09-04 · 이슈 #2) — 아래 "부수 비대칭 하나(확인됨)" 문단이 부정확하다.**
> *"myFitness 에만 `typecheck` 가 있고 `tsconfig.include` 가 `**/*.ts` 다"* 중 **include 부분이 틀렸다.**
> `include` 에 `**/*.ts` 가 있는 것은 **fin 도 마찬가지**다 (fit 은 `.next/dev/types/**/*.ts` 1줄이 더 있을 뿐).
> **비대칭의 원인은 `typecheck` 스크립트의 유무 하나뿐이다.**
> 결론(새 테스트 파일이 fit 에서만 `tsc --noEmit` 대상이 된다)은 유효하되,
> **fin 도 `next build` 가 타입 검사를 수행하므로**(`ignoreBuildErrors` 없음) **빌드 단계에서는 fin 도 걸린다.**
> 즉 비대칭은 *"검사되냐 안 되냐"* 가 아니라 *"어느 단계에서 걸리냐"* 다.

> **정정 ③ (2026-09-04 · 이슈 #2) — U2 에 한정 조건이 하나 붙는다.**
> 위 U2 행은 fit `eslint.config.mjs` 의 `ignores` 가 `src/generated/**` 뿐이라 **`__tests__` 가
> 검사 대상**이라고 적었다. **맞다 — 단 `src/` 안에 둘 때만이다.**
> fit 의 `lint` 는 `eslint src/ --max-warnings 0` 이라 **`src/` 밖은 아예 검사하지 않는다.**
> fin 의 기존 테스트 44개+ 가 `src/**/__tests__/` 에 있으므로 **대칭을 지키면 게이트에 걸리고,
> 루트에 두면 게이트를 피하는 대신 컨벤션이 어긋난다.**
> → **테스트 파일 경로가 U2 의 결과를 좌우하는 결정 사항이다** → **Q17**.
> U2 자체는 **여전히 미확인** (테스트 파일 미작성 → `npm run lint` 미실행).

> **신규 미확인 U3 (2026-09-04 · 이슈 #2 부수 발견) — fit 에서 vitest 가 런타임에 도는지 모른다.**
>
> | | vite 가 쓰게 되는 esbuild | 방식 |
> |---|---|---|
> | myFinance (현재 실동작) | `vite/node_modules/esbuild@0.25.12` | **중첩 설치.** vite 선언(`esbuild: ^0.25.0`) 범위 **안** |
> | myFitness (추가 시 예상) | `esbuild@0.28.1` (top-level, 중첩 사본 없음) | fit `"esbuild": "$esbuild"` override 가 **중첩을 막는다** |
>
> npm overrides 는 설계상 범위 검사를 우회하므로 **resolve 는 통과하지만**,
> `vite@6.4.3` 이 **선언 범위 밖 esbuild 0.28.1** 위에서 실제로 도는지는 **미확인**이다.
> 확인 방법: 실제 설치 후 myFitness 에서 `npx vitest run` **1회**.
> **무엇을 막나:** 1a-2 의 완료 판정. U1 이 "resolve 된다"까지만 확정했으므로,
> 실패하면 1a-2 의 대안(fit `$esbuild` override 도 리터럴화 — **되돌리기 즉시, 1줄** /
> 또는 vitest 버전 하향)이 필요하다. **1a-2 집행 중에 드러나는 항목이지 착수 선결 조건은 아니다.**

> **이행 완료 (2026-09-04 · 이슈 #4).** 아래 *"1a 착수 직전 측정 1건 — myFinance 22곳 루프
> 본문이 전송 외에 무엇을 하는가"* 는 **수행됐다.** 결과는 발견 16~22
> (`_workspace/05_surveyor_fin_loops.md`)이고, 청구서는 §5-1 정정의 개정 표로 확정됐다.
> **1a-4 착수 전에 남은 정적 측정은 없다.** 남은 것은 결정뿐이다(§10-1).


## 10. 남은 미결 질문

| | 질문 | 무엇을 가르는가 | 우선 |
|---|---|---|---|
| ~~**Q10**~~ **확정 (사용자 2026-09-09 · #37)** | myFitness 아웃바운드 **절단 → 분할**을, 그리고 **plain 폴백 정본**을 1a 에서 받나 | 받으면 지금 버려지던 4096 초과분이 살아나 **사용자에게 메시지 수가 늘어난다**(관측 가능한 동작 변경). 안 받아도 **1a 가 자동으로 무동작-변경이 되지는 않는다** — fin `rsu.ts:184` 의 재시도 ×4 + plain 폴백은 **Q27 에 달렸고**(흡수하면 붙고, 예외로 남기면 안 붙는다), `lastError` sanitize 는 **Q19 에 달렸다**. **셋을 모두 "안 함"으로 답해야** 1a 가 동작 변경 0 이 된다. Q10 만 아니오면 **fit 쪽 손실만 지속**된다. plain 폴백(`telegram.ts:69` vs `markdown.ts:96-103`)도 **어느 쪽을 골라도 한쪽 저장소의 출력이 바뀌는** 같은 성격의 변경이라 함께 답한다 — **이 마지막 문장은 틀렸다(§3-1 2026-09-09 정정: 두 구현 다 fin 파일)**. **답: Q10 을 Q10-L / Q10-P 로 분리 · Q10-L ① 분할로 통일(1a-3) · Q10-P ① 태그-only(1a-1 코어 정본)** — 아래 정정 블록 | ~~높음 — 1a 착수 전~~ **소진 (2026-09-09)** |
| ~~**Q28**~~ **확정 (2026-09-08)** | 의존성 URL 형태 — **`git+https://`**(자격 증명 불필요) / **`git+ssh://`**(§1-1 현행, 서버 2대 deploy key 필요) (2026-09-04 신설) | **1a-0 의 "서버 2대 접근 자격" 항목이 남는지 사라지는지.** 저장소가 PUBLIC 이어도 `git+ssh` 는 인증을 요구하므로, 키 없는 서버에서 **`npm ci` 가 실패한다** (PR #13 Codex 리뷰 P1). `git+https://` 를 택하면 자격 증명이 불필요해지지만 **pleiades 를 나중에 private 으로 바꾸면 깨진다.** npm 단축형 `github:` 의 해석은 미확인 — **1a-0 에서 실제로 확인한다**. **→ 답: 세 형태 전부 자격 불필요(실제 전송 https). 형태 = `git+https://…#<tag>` + `package.json` 직접 편집 절차** (§1-1 정정) | ~~중간~~ **확정** |
| **Q27** | fin `rsu.ts:184` 를 **파사드로 흡수하나**(권고), **§7-4 처럼 예외로 남기나** (2026-09-04 신설) | **§5-2 정정 ①이 사용자 확인 대상으로 분류한 항목인데 이를 승인하는 질문이 없었다** (PR #9 Codex 리뷰 P2). Q10 은 **myFitness** 절단·폴백만, Q19 는 **에러 sanitize** 만 다룬다. 흡수하면 RSU 알림에 `[2000,8000,30000]`ms **×4 재시도 + plain 폴백**이 새로 붙는다 — **사용자에게 지연 또는 중복 전송이 보일 수 있다.** 되돌리기는 **코드 즉시** / **이미 나간 메시지는 불가**. 예외로 남기면 되돌리기 **즉시**(아무것도 안 함)지만 초크포인트 커버리지가 **14/16 에서 오르지 않고** 발견 12 의 우회가 남는다 | **높음 — 1a-4 착수 전** |
| **Q12** | 1b-2d 의 DB 처리 — **D-a(권고)** / D-b | **판돈이 줄었다.** 감사가 D-a 의 잔여 리스크를 **사실상 0** 으로 확인했다(죽은 인덱스 · 매칭은 adjustment id · 노출 최대 ~1건·≤8시간·자가 소멸). 남은 것은 *D-b 를 굳이 택할 이유가 있는가* 뿐이다. D-b 는 단계 1 전체에서 **유일하게 되돌리기가 "사실상 편도"** 이고, 중립 컬럼 이름은 **002 Q7 의 답에 종속**된다 | 중간 (1b-2 착수 전) · **판돈 축소** |
| **Q13** | fit 관리자 alert 수신자 분리(`admin-alerts.ts:232` → 신설 `ADMIN` 그룹)를 언제 고치나 | 고치면 지금 받던 사람이 못 받게 된다(동작 변경) + fit 에 없는 env 신설. 1a 가 `Route` 를 만들면 자리는 생긴다. 안 고치면 fin 주석이 명시적으로 금지한 동작이 계속된다 | 중간 |
| **Q14** | 실서비스 DB **읽기 전용 조회**를 허용하나 | §9 의 알림 길이 분포 **1건**이 풀린다. **Q10 하나만** 막는다. 불허면 Q10 은 근거 없이 내려야 한다. 초안은 미측정 2건을 근거로 들었으나 그중 `WorkoutAdjustment` pending row 수는 **정적으로 상한이 유도돼 삭제**됐다 — **정당화 절반이 사라졌다** | **낮음** |
| **Q16** | myFitness `package.json` `overrides` 의 **`"postcss": "$postcss"` → `"^8.5.10"` 1줄 수정**을 승인하나 (2026-09-04 신설) | **1a-2 가 시작되느냐 마느냐.** 승인 없이는 `npm install` 이 **첫 명령에서 멈춘다**(`Unable to resolve reference $postcss`, 발견 23). 의미가 동일한 리터럴 치환이고 postcss 는 양쪽 다 8.5.25 로 수렴하므로 **서비스 영향 0**. 다만 **1a-2 의 승인 범위에 없던 파일 변경**이라 범위 확대에 해당한다. 불허하면 1a-2 는 다른 테스트 프레임워크 또는 범위 축소로 재설계해야 한다 | **높음 — 1a-2 착수 전** |
| **Q17** | myFitness 테스트 파일 경로 — **`src/**/__tests__/`**(권고) vs 루트 `__tests__/` (2026-09-04 신설) | **U2(zero-warning 게이트) 통과 여부가 여기서 갈린다.** fit `lint` 는 `eslint src/ --max-warnings 0` 이라 **`src/` 밖은 검사하지 않는다.** fin 의 기존 테스트 44개+ 가 `src/**/__tests__/` 이므로 대칭을 지키면 게이트에 걸리고, 루트로 피하면 **두 저장소의 테스트 경로 컨벤션이 갈라진다**(그리고 그 드리프트는 002 단계 4 에서 다시 정리 대상이 된다). 늦게 답할수록 옮길 파일이 는다. **그리고 루트를 고르면 `vitest.config.mts` 의 `include` 를 함께 넓혀야 한다** — fin 에서 가져올 15줄 설정은 `include: ['src/**/__tests__/**/*.test.ts']` 이라 **루트 `__tests__/` 를 탐지하지 못하고, 1a-2 가 약속한 회귀 baseline 이 0건으로 끝난다**(PR #9 Codex 리뷰 P1) | **높음 — 1a-2 착수 전** |
| **Q18** | 1a-2 의 vitest 3종을 **`--save-dev`** 로 넣나 (2026-09-04 신설) | 사실상 확인 절차다 — fin 은 `devDependencies` 에 있다. 플래그 없이 넣으면 `dependencies` 로 들어가 **실서비스 번들·`npm ci --omit=dev` 판단에 영향**을 준다. 답이 로드맵을 바꾸지 않으므로 **구현 결정에 가깝지만, 실서비스 `package.json` 이라 명시적으로 확인받는다** | 낮음 — 1a-2 집행 시 |
| ~~**Q19**~~ **방향 확정 (사용자 2026-09-09 · #37) — 1a-4 확정만 잔존** | `lastError` 의 **raw `error.message` → `sanitizeError`** 전환을 1a-4 와 함께 하나, 별건으로 빼나, 현행 유지하나 (2026-09-04 신설) | **세 가지가 걸려 있다.** ① 현재 상태가 **`CLAUDE.md` 컨벤션 위반**이다(*"catch 에서 `error.message` 원문 노출 금지"*) — **1a-4 가 만드는 문제가 아니라 1a-4 가 손대는 그 4줄에 이미 있는 문제**다. ② 파사드가 통일 적용하면 **화면 2곳 + CSV 의 문자열이 바뀐다**(관측 가능한 동작 변경, 발견 20). ③ 별건으로 빼면 1a-4 는 `lastError` 를 **raw 로 유지**해야 하고, 그러려면 파사드가 `deliveries[].error` 에 **원문을 담아야 한다** — 즉 **포트 설계에 영향을 준다**. 실제로 무엇이 얼마나 바뀌는지는 DB 의 현재 문자열 분포를 봐야 알고 그건 **Q14 에 종속**된다 — **④ 실측이 이 서술 셋을 고쳤다(아래 정정 블록).** **답: C(포트가 raw 를 담는다) · 최종 적용은 1a-4 · 토큰 가드는 별건(B′)** | ~~중간 — 1a-1(포트 확정) 전에 방향, 1a-4 전에 확정~~ **방향 소진 · 1a-4 확정만 남는다** |
| ~~**Q25**~~ **확정 (사용자 2026-09-09 · #37)** | 파사드에 **목록 반환 표면 `targets(route)`** 을 두나(권고), **`sendDocument` 를 1a 포트에** 넣나, **`quarterly-report.ts` 만 로컬 유지**하나 (2026-09-04 신설) | **§5-1 의 *"`getAllowedChatIds` 4곳 제거"* 가 성립하는지가 여기서 갈린다.** `quarterly-report.ts:52` 가 개수가 아니라 **목록 자체**를 요구하기 때문이다(발견 18). ①`targets()` → 파싱 지점 5→1, 되돌리기 **즉시**. ②`sendDocument` 포함 → 커버리지 16/16 이지만 **포트가 넓어져 모든 어댑터가 구현 의무**를 지고 되돌리기가 **중간**으로 오른다(§7-4 결정을 뒤집는다). ③현상 유지 → 파싱 지점 5→2, 되돌리기 **즉시**(변경 없음). 선택지·비용 표는 §4-2 정정 ②. **하위 선택 (ADMIN):** 위 숫자는 `advisor-monitor:199` 의 ADMIN 인라인 파싱을 **남기는** 전제다. **`Route` 가 1a 에서 ADMIN 을 실제 값으로 받으면**(§4-4 는 지금 "자리만"이라고 적었다) 1a-4 가 그 호출부를 `notify(ADMIN, …)`·`targetCount(ADMIN)` 로 바꾸므로 인라인 파싱이 사라져 **①② 5→0 · ③ 5→1** 이 된다. **ADMIN 을 1a 의 실제 Route 로 둘지 함께 답한다** — 두면 fit 쪽 Q13(관리자 alert 수신자 분리)의 자리도 같이 열린다 — **답: ①`targets(route): string[]`(옵셔널 아님) + 하위 선택 ADMIN A(실값 · fin 전용 · fit 미매핑) → 파싱 지점 5→0.** 정본은 §4-2 맨 위 시그니처 | ~~높음 — 1a-1 착수 전 (인터페이스 확정 시점)~~ **소진 (2026-09-09)** |
| ~~**Q26**~~ **확정 (사용자 2026-09-09 · #37)** | `notify()` 에 **호출부 라벨(context) 인자**를 두나 — `label` 만(권고) / `label`+`onError` / 없음 (2026-09-04 신설) | **운영 로그가 유지되느냐 깨지느냐.** per-chat catch 22곳 중 로깅하는 **17곳이 17종의 prefix** 를 쓴다(발견 20). 인자가 없으면 파사드가 한 형식으로 찍고 **grep 패턴이 전부 깨진다** — 그리고 **되돌려도 그 구간의 로그는 복구되지 않는다.** `onError` 까지 열면 로그는 100% 보존되지만 파사드가 흡수한 catch 가 사실상 호출부로 돌아와 *"try/catch 21곳 제거"* 의 이득이 줄어든다. 선택지·비용 표는 §4-2 정정 ③ — **답: ①(`label` 만) · `onError` 미채택.** **그래서 Q19 B(호출부 sanitize)가 닫힌다** — 포트가 error *객체* 를 넘기는 표면이 없다(아래 정정 블록) | ~~높음 — 1a-1 착수 전 (시그니처 확정 시점)~~ **소진 (2026-09-09)** |
| **Q47** *(2026-09-08 신설 · 확정)* | **패키지 배포 형태** — 케이스 B(루트 `name`=`@pleiades/notify`) / **ALT-d 위임형** / `git subtree split` 배포 브랜치 / 릴리즈 타르볼 | **§2-1 승계 주장의 운명이 갈린다.** B 면 단계 4 에서 루트 재작성, ALT-d 면 6키 처리 + 1키 추가, 나머지 둘은 루트 무변경이되 **릴리즈 운영이 붙고 미측정 선결이 생긴다**. **→ 답: ALT-d 위임형. `workspaces`·`peerDependencies` 는 1a-0 에 넣지 않는다** (사용자, 2026-09-08 · §2-1 정정) | **확정** |
| **Q44** *(2026-09-08 신설 · 확정)* | **1a 검증 경로** — α(RO 롤) / β1(실데이터 사본) / **β2(빈 스키마 사본)** / γ(로컬 `repos/*`) / δ(대상 저장소 env 스위치) | **1a 가 무엇을 증명할 수 있는지가 갈린다.** α 면 fit 은 4 모듈 중 1 만 정상 본문이 관측되고 **Q10 이 다루는 절단·plain 분기를 볼 수 없다**. β1 은 개인 데이터 사본을 서버에 만들고, δ 는 대상 저장소에 영구 코드 표면을 만든다. **→ 답: γ(로컬 개발 루프) + β2(`myfinance_int`·`myfitness_int` 빈 스키마 사본으로 서버 도달 검증). α·β1 배제 · δ 보류. β2 의 서버 승인은 1a-3 과 함께** (사용자, 2026-09-08 · §10-1 정정) | **확정** |
| **Q46** *(2026-09-08 신설 · 확정)* | 검증용 **텔레그램 봇 토큰**을 별도 발급하나 (BotFather — 사용자만 가능) | 수신자는 `TELEGRAM_ALLOWED_CHAT_IDS`(fin admin 경로는 `TELEGRAM_ADMIN_CHAT_IDS`)만으로 격리되고 **하드코딩 chat id 는 0건**이라 토큰은 *"두 번째 층"* 이다. 그러나 **되돌리기가 "이미 나간 메시지는 불가"** 인 유일한 조건이다. **→ 답: 발급한다. 병행 인스턴스 기동 전** (사용자, 2026-09-08) | **확정** |
| **Q45** *(2026-09-08 신설)* | **서버의 github.com https 아웃바운드**가 열려 있나 (+ 서버 **node/npm 버전** · `git` 설치 여부) — 측정 · **서버 접속 별도 승인** | **막혀 있으면 §1-1 정정이 다시 뒤집힌다** — ssh 폴백이 유일 경로가 되어 **deploy key 가 되살아난다**. 그리고 `prepare` 는 **매 배포마다** github 를 치므로(§8-1 정정), 미확인인 채 1a-3 을 하면 **두 실서비스 배포가 처음 깨지는 지점이 배포 당일**이 된다. node 값은 `engines` 기재 여부를 가른다(현재는 서버 값 미측정이라 **적지 않는다**) | **높음 — 1a-3 착수 전.** 1a-0·1a-1 은 막지 않는다 |


> **정정 (2026-09-09 · 이슈 #37 · 사용자 확정 4건) — 위 표의 네 행이 답을 받았고, 세 행의 근거 서술이 실측으로 고쳐졌다.**
> 초안은 `_workspace/1a-1-prep/02_writer_1a1prep.md`(3회 개정 · 감사 3회), 실측은 `docs/research/measured-facts.md` **C-1~C-7**.
>
> **① Q25 — ① `targets(route): string[]` · 하위 선택 ADMIN **A**(실값 · fin 전용).**
> 하위 선택은 3안이었다 — **A**(fin 만 매핑) · **B**(fit 도 `TELEGRAM_ALLOWED_CHAT_IDS` 에 매핑) · **C**(타입 멤버만, 매핑 없음).
> **B 의 대가:** fit `Route.ADMIN` = 전체 화이트리스트가 되어 **`Route.ADMIN` 의 뜻이 저장소마다 달라진다**(fin=관리자 전용 / fit=가족 포함 전체).
> 그 동작은 fin `advisor-monitor.ts:190-194` 가 *"secure default 원칙 위반"* 으로 **명시 금지**했고 §7-6 이 **결함으로 등재**한 것이며,
> **되돌리는 경로가 Q13 하나뿐**이라 되돌리기 등급이 "즉시"여도 **되돌림 자체가 동작 변경**이다.
> **C 의 대가:** `notify` 가 `Route` 만 받으므로 `advisor-monitor.ts:220-227` 의 per-chat 루프 1 + catch 1 이 파사드 밖에 남고 §5-1 의 *"루프 21곳 제거"* 가 **20** 이 된다.
> **A 가 성립하는 근거(설계 귀결 — 측정 아님):** fit 에는 오늘 **ADMIN 등급 자체가 없고**(§4-4: fin 2등급 / fit 1등급)
> fit 관리자 alert 는 `admin-alerts.ts:232 sendToAll` → `send.ts:24-29 getChatIds()` = `TELEGRAM_ALLOWED_CHAT_IDS` 로 나가므로,
> *"동작 변경 0"* 을 지키면 그 호출은 `notify(ALLOWED, …)` 가 된다 — **fit 에서 ADMIN 을 넘기는 지점이 생기지 않는다.**
> **딸린 것:** fit `targetCount(ADMIN) === 0` 가드와 fin fail-safe(`advisor-monitor.ts:205-211`) 보존은 **1a-4 지시 항목**이다(§4-2 확정 블록 4항 · 미확인).
>
> **② Q26 — ①(`label` 만). `onError` 는 두지 않는다.** ③과 코드 되돌리기 등급이 같고 비용은 인자 1개다.
> ② 는 로그를 100% 지키는 대신 파사드가 흡수한 catch 를 호출부로 되돌려 *"try/catch 21곳 제거"* 의 이득을 깎는다.
> **무엇을 가르는가에 결합 조건을 추가한다:** **`deliveries[].error?: string` 을 유지하는 한 `onError` 가 파사드에서 error *객체* 를 넘기는 유일한 표면**이므로,
> **①·③ 을 고르면 Q19 B(raw + 호출부 `sanitizeError`)는 지점 수가 바뀌는 게 아니라 성립하지 않는다.** ①을 골랐으므로 **B 는 닫혔다.**
> (필드를 `unknown` 으로 넓히는 **B″** 는 별개의 포트 변경이고 §4-2 는 `string` 을 유지한다.)
>
> **③ Q19 — 방향 C(포트가 raw 를 담는다). 최종 적용은 1a-4, 토큰 가드는 별건(형태 = B′).**
> 위 행의 근거 세 가지가 실측으로 이렇게 바뀐다:
> **①은 유효하되 비밀 노출 경로는 미발견이다** — grammY 1.44.0 `GrammyError.message` 에 **봇 토큰·chat id 가 없고**(payload 는 `.payload` 프로퍼티),
> 토큰 유입 경로는 `HttpError` + **`sensitiveLogs`** 하나인데 **기본 `false` · 양쪽 미설정**이다 (C-6). 즉 현행 유지는 **형식(컨벤션) 위반**이지 노출이 아니다.
> **②는 유효하되 표면이 5개다** (C-5 — DB · API(history) · 화면 2 · CSV · **API(retry) `route.ts:82`**).
> **③은 유효하며 실측이 근거를 강화한다** — `sanitizeError` 는 축소가 아니라 **확장**이다: 마스킹은 `TOKEN_RE` 정규식 1개뿐이고
> `.error ?? .cause` 를 **깊이 5까지 순회해 join** 하며 `${name}: ` 접두를 붙인다 → **UI·CSV 문자열이 더 길고 더 기술적으로 바뀐다** (C-6).
> **④ 변화의 *형태* 는 정적으로 유도됐고 Q14 에 남는 것은 *현재 분포* 뿐이다** — *"실제로 무엇이 얼마나 바뀌는지는 DB 분포를 봐야 안다"* 는 그 범위에서만 참이다.
> **관측 변경에 대한 정확한 서술(줄여 적지 않는다):**
> > **무조건 0 은 C 뿐 · B′ 는 현 상황(마스킹 대상 0건 — C-6)에서만 0 이고 `sensitiveLogs` 를 켜는 순간 갈린다. 포트를 건드리지 않는 것은 C·B′ 둘 다.**
>
> **`sensitiveLogs` 단서 — C 를 고르는 것은 그 가드가 없는 상태를 유지하기로 하는 것이다.** 누가 디버깅용으로 `client: { sensitiveLogs: true }` 를 켜면
> `HttpError.message` 에 `…/bot<TOKEN>/…` URL 이 붙고 `lastError` 는 마스킹을 하지 않으므로 **토큰이 5 표면으로 나간다.**
> 그래서 **금지 룰 또는 `lastError` 마스킹(= B′ 4지점)** 을 **별건**으로 남긴다 — fin 단독 소규모 · 되돌리기 **즉시** · **포트 계약 무관**.
>
> **④ Q10 — Q10-L ①(분할로 통일 · 1a-3) · Q10-P ①(태그-only · 1a-1 코어 정본).**
> 위 행의 마지막 문장(*"plain 폴백도 어느 쪽을 골라도 한쪽 저장소의 출력이 바뀌는 같은 성격의 변경이라 함께 답한다"*)은 **불성립**이다 — §3-1 의 2026-09-09 정정.
> **L 과 P 는 성격이 다르다:** L 은 **fit 단독 손실 · 근거 미측정**(초과 가능 호출은 6 중 1 · 정적 상한 0건 · 절단·폴백 로그 0 · 절단이 태그 중간을 잘라 폴백을 유발 — C-1·C-2),
> P 는 **fin 단독 개선 · 근거 확정**(C-3·C-4). **L 은 1a-1 을 막지 않는다** — §4-3 제약 2 원문
> *"길이 분할은 **변환 뒤**, 즉 `Transport` 경계 안쪽에 있거나, 포트가 \"변환 후 길이 예산\"을 코어에 알려주는 형태여야 한다"* 는
> **두 형태를 허용**하며, 어느 쪽이든 절단|분할 **정책** 은 `Notifier`(§4-2)에 오지 않는다. **L 이 막는 것은 1a-3** 이다.
> **L ① 은 사용자에게 보이는 동작 변경이라 승인 대상이었고 승인을 받았다**(사용자 2026-09-09 · #37).
>
> **⑤ Q14 행 (미결 유지 · 서술 교체).** 원문 *"§9 의 알림 길이 분포 **1건**이 풀린다. **Q10 하나만** 막는다"* 는
> **"Q10-L 을 ③(측정 후 결정)으로 고를 때만 필요해진다"** 로 읽는다 — **Q10-L 이 ①로 확정됐으므로 Q14 는 1a 경로에서 빠진다.**
> 필요해질 때의 형태는 **단일 테이블·단일 컬럼 길이 집계 1회 + 본문 반출 0 계약**으로 좁혀졌다(§9 의 2026-09-09 정정 · C-2).
>
> **되돌리기 (네 답 공통):** **즉시 (1a-3 착수 전까지 · 이후 중간 — §8-1)** / **불가한 것 셋** — 이미 찍힌 로그 · 이미 저장된 DB 행 · 이미 나간 메시지.
> 되돌리는 행위는 §4-2 맨 위 확정 블록 5항.

**표에 넣지 않은 것.** `error.ts` shim 여부(§5-1)는 사용자 판단이 필요 없는 **구현 결정**이다 —
두 선택지의 되돌리기 등급이 같고, 답이 로드맵을 바꾸지 않는다. 착수 시점에 고른다.

### 10-1. 무엇이 무엇을 막고 있나 (2026-09-04 신설)

**1a 착수를 막는 결정은 8개**다 — 기존 **Q10** + 2026-09-04 신설 **Q16~Q19 · Q25 · Q26 · Q27**.
**Q28**(의존성 URL 형태)은 그 8개와 별개로 **1a-0 집행 시점**에 답한다.
(Q20~Q24 는 `004-repo-layout.md` 의 번호다. 겹치지 않게 003 은 Q25 부터 쓴다.)
표의 번호 순이 아니라 **막고 있는 지점 순**으로 다시 세운다.

| 막히는 것 | 막는 질문 | 하나로 묶어 답할 수 있나 |
|---|---|---|
| **1a-1 (패키지 구현 — 인터페이스 확정)** | **Q25**(목록 반환 표면) · **Q26**(context 인자) · Q19 의 방향(포트가 raw error 를 담나) · **Q10**(코어의 plain 폴백 정본) | 앞 셋은 **§4-2 시그니처 한 장**. **Q10 이 여기 오는 이유:** §3-1 이 코어의 **plain 폴백 정본**을 Q10 으로 정한다 — 답 없이 코어를 구현하면 **패키지 계약을 나중에 다시 쓴다** (PR #9 Codex 리뷰 P2) |
| **1a-2 (myFitness vitest)** | **Q16**(`overrides.postcss` 1줄) · **Q17**(테스트 경로) · Q18(`--save-dev`) | ○ — 셋 다 **1a-2 집행 지시 한 장**에 대한 질문이다 |
| **1a-3 (fit `send.ts` 교체)** | **Q10** | **§5-2 가 fit 의 절단 → 분할 전환을 Q10 으로 정한다.** 답 없이 이전하면 **승인 없는 사용자 가시 변경**이거나, 나중에 답이 뒤집히면 **재작업**이다 (PR #9 Codex 리뷰 P2) |
| **1a-4 (fin 호출부 이전)** | **Q10**(fit 절단→분할 · plain 폴백) · **Q19**(확정) · **Q27**(fin `rsu.ts` 흡수 승인) | Q10 은 Q14 에 근거가 걸려 있다. **Q27 을 빼면 §5-2 가 사용자 확인 대상으로 분류한 동작 변경이 승인 없이 들어간다** |

**1a-0(원격 발행·스캐폴딩)은 이 표의 질문에는 막혀 있지 않다.** 두 저장소를 건드리지 않고
되돌리기가 **즉시**이므로, **위 8개**(Q10 · Q16 · Q17 · Q18 · Q19 · Q25 · Q26 · Q27) 중 하나도 답을 받지 못한 상태에서도 착수 가능하다.

> **정정 (2026-09-07 · 004 Q42 · PR #26 Codex P1).** 위 문장은 **더 이상 성립하지 않는다.** 대상 저장소의 pleiades 작업 메인이
> `integration/pleiades` 로 확정되고 그 브랜치가 **`dev` 로 머지되지 않게 되면서**(004 §8-4), 이 문서 §2-2(git 의존성 배포) ·
> §5(1a-4 청구서의 `pm2 restart`) · Q11(혼합 운영)이 전제한 **실서비스 배포·검증 경로가 사라졌다.** 1a 변경을 어디서 띄워
> Discord 알림을 검증할지(**Q42**)를 정하기 전에는 1a-0 도 착수하지 않는다 — 스캐폴딩 자체는 즉시 되돌릴 수 있지만,
> 검증 경로 없이 시작한 단계는 멈출 지점이 없다(핵심 전제 2).
>
> **Q42 는 같은 날 확정됐다 (이슈 #29).** 검증 장소 = 로컬 `repos/*` + **서버 병행 인스턴스(읽기 전용 DB 롤)**. 따라서
> **1a-0 은 다시 착수 가능**하되, 착수 시 다음을 함께 정한다: ① 1a 발송 경로의 **DB 쓰기 지점 측정**("쓰기 불필요" 전제 실측)
> ② 병행 인스턴스 격리 **6조건**(RO 롤 · 별도 포트 · **Nginx 미연결** · 봇 미기동 · cron off · pm2 이름 분리). 서버 작업은 별도 승인 단계다.
>
> **§5-2 와 §8-1 의 `npm ci` · 재빌드 · `pm2 restart` 는 이 확정 이후 병행 인스턴스의 pm2 이름(`myfinance-int` 등)만 가리킨다.**
> 실서비스 웹·봇 프로세스는 1a 어느 단계에서도 재시작하지 않는다 — 봇은 병행 인스턴스에서 기동조차 하지 않는다 (PR #30 Codex P2).
> **1a-1~1a-4 는 여전히 #1(하네스 통합 — 방향 확정, H-1·H-3(fit) 잔여)이 선결이다.**

> **정정 (2026-09-08 · 이슈 #31 · 초안 `_workspace/1a-0/02_writer_1a0.md` · 감사 3회)** **위 정정이 적은 "격리 6조건" 은 실측으로 셋이 뒤집혔고 축 하나가 빠져 있었다. 조건표의 정본은 여기다** (004 §8-4 는 이 절을 가리킨다).
>
> **뒤집힌 셋** — 출처 `_workspace/1a-0/01_surveyor_db_writes.md`(이하 [A]) · `docs/research/measured-facts.md` 2026-09-08 절:
> **(a) "RO 롤" 은 검증을 축소한다** — fin 15 모듈 중 전송 도달 **10**(파일-로컬 grep 기준 쓰기 0건 모듈 10 과 **같은 집합**), fit 4 모듈 중 정상 본문 도달 **1**.
> fit 리포트 3종·auto-adjust 제안은 **폴백/에러 문구만** 전송되고 admin alert 는 **미전송**이다. 전송 **전** 무가드 쓰기가 fin 4 · fit 5 지점 있기 때문이다([A] M1-2~M1-4).
> **(b) "cron off" 는 env 가 아니다** — on/off 플래그가 두 저장소 합쳐 **0건**. fin 은 cron 표현식까지 하드코딩(`lib/cron.ts` 6 + `bot/notifications/scheduler.ts` 13)이고,
> fit 웹의 `startOrphanSweeper()` 는 **끄는 env 가 없어 코드 변경**이 필요하다([A] M2-3).
> **(c) fit 웹은 기동만으로 DB 를 쓴다** — `instrumentation.ts:33 sweepOrphanedJobs()` → `reportJob.updateMany(status:'failed')` 가 **부팅 1회 + 5분 주기**.
> 쓰기 가능 롤로 같은 DB 를 보면 **실서비스의 pending/running job 을 `failed` 로 마킹**할 수 있다([A] M2-1·M2-2·M2-5). fin 은 `register()` 가 no-op 이라 부팅 쓰기 0.
>
> **빠져 있던 축 — 텔레그램 격리.** *"봇 미기동"* 은 텔레그램 격리가 아니다. **봇을 띄우지 않아도 fin 웹 프로세스가 아웃바운드를 내는 경로가 최소 셋**이다 —
> `POST /api/alerts/history/[id]/retry`(`route.ts:21`) · `POST /api/deposits`(`route.ts:126` → `budget-alert.ts:94~`) · `POST /api/ai/ask` → `advisor-monitor:222`. fit 은 0 이다.
>
> **개정 조건표 — 6 → 10**
>
> | # | 조건 | 무엇을 막나 | 충족 수단 | 되돌리기 |
> |---|---|---|---|---|
> | **1** | **텔레그램 격리** — 수신자(chat id) 분리 + 별도 검증용 봇 토큰(**Q46 확정**) | 검증 전송이 **실사용자에게 가는 것** | 수신자는 전부 `TELEGRAM_ALLOWED_CHAT_IDS`(fin admin 은 `TELEGRAM_ADMIN_CHAT_IDS`)에서만 온다 — **하드코딩 chat id 0건**. 미설정이면 전송 자체가 없다(fail-safe) | **즉시**(env) / **이미 나간 메시지는 불가** |
> | **2** | **DB 격리** — RO 롤 **또는 별도 DB**(채택: β2 빈 스키마 사본) | 실서비스 데이터 오염 (특히 (c)) | `DATABASE_URL` 하나로 전환 — `directUrl`/`shadowDatabaseUrl` 양쪽 0건 | **즉시** / 사본은 `DROP DATABASE` |
> | **3** | **별도 포트** | 4100/4200 충돌 | `ecosystem.config.js` 의 **`args:'start -p 4100'` 이 `PORT` env 를 이긴다** → 파일 재사용 금지, `pm2 start npm --name … -- start` + `PORT` | **즉시** |
> | **4** | **pm2 이름 분리 + cwd 지정** | 실서비스 앱 덮어쓰기 · fit `.runtime/mcp-config.json` 오염 | fin `cwd:__dirname` · **fit 은 `/home/nasty68/myFitness` 하드코딩** → `--cwd` 필수. `ensureMcpConfig()` 가 `process.cwd()/.runtime/` 을 매 호출 재생성한다. **`pm2 --cwd` 동작은 미검증** | **즉시** |
> | **5** | **봇 미기동** | 실서비스 봇과 **409**(`deleteWebhook()` + long polling) | 그 pm2 앱 미기동. 웹은 스스로 polling 하지 않는다 | **즉시** |
> | **6** | **cron off (재정의)** | 스케줄 실전송·실동기화 | fin 웹 **불필요**(등록 없음) · 봇 미기동으로 충족 · **fit 웹 미충족**(`SYNC_CRON` 편법은 문법 수용 미검증, sweeper 는 끌 수 없음) | fin **즉시** / **fit 웹은 조건 2 로 흡수** |
> | **7** | **Nginx 미연결** | 외부 노출 | 서버 nginx 설정은 저장소에 없어 **미측정** — 서버 작업 단계에서 확인 | **즉시** |
> | **8** | **env — 두 열** | 교차 오염 · fit 본문 생성 불가 | **(a) 필수 분리(반드시 다른 값)**: fin **9**(`DATABASE_URL`·`PORT`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_ALLOWED_CHAT_IDS`·`TELEGRAM_ADMIN_CHAT_IDS`·`MCP_PORT`·`AUTH_SECRET`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH`) · fit **8**(`DATABASE_URL`·`PORT`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_ALLOWED_CHAT_IDS`·`MCP_PORT`·`SYNC_CRON`·`GARMIN_EMAIL`·`GARMIN_PASSWORD`). **(b) 필수 설정(값은 같아도 됨)**: `CLAUDE_BIN` | **즉시** |
> | **9** | **MCP 포트·로그 분리** — **fit 은 선택이 아니라 필수** | 4210/4301 충돌 · **fit 본문 생성 불가** | fit 본문은 `askAdvisor` → **`spawn(CLAUDE_BIN)` + MCP HTTP(`MCP_TRANSPORT` 기본 `http` · 4301)** 산물이다 | **즉시** |
> | **10** | **선행 빌드** | *"env 만 바꿔 띄운다"* 오해 | 양쪽 `.next` 없음 → `npm run build`. **fit 은 그 앞에 `npx prisma generate`**(`src/generated/prisma` 부재) | **즉시** |
>
> **조건 8 의 기준 주의.** (a) 는 *"반드시 **달라야** 하는 키"*, (b) 는 *"반드시 **설정돼야** 하는 키"* 다. `CLAUDE_BIN` 은 실행 파일 **경로**라 두 인스턴스가 같은 값을 쓴다 —
> 두 기준을 섞으면 숫자가 어긋난다. **[A] M3-5 는 `CLAUDE_BIN`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH` 셋을 "그대로 재사용 가능" 으로 분류했다** —
> 이 문서는 MCP·advisor 를 띄우는 전제에서 **뒤의 둘을 (a) 로 옮긴다.** 그 차이는 [A] 에 되돌려 보낸다.
>
> **검증 경로 — Q44 확정 (사용자 2026-09-08):** **γ(로컬 `repos/*`) 개발 루프 + β2(빈 스키마 사본 `myfinance_int`·`myfitness_int`) 서버 도달 검증.**
> **α 배제** — 폴백 문구도 같은 `sendToAll` 을 타지만 `send.ts:9 MAX_MSG=4096` · `:34 truncate()` · `:57 HTML parse 실패 → plain 재전송` 분기를 **밟지 못한다**(태그가 없고 4096 에 못 미친다).
> 그 두 분기가 곧 **Q10 의 대상**이므로 α 에서는 1a 가 바꾸는 그 동작을 fit 에서 볼 수 없다.
> **β1(실데이터 사본) 배제** — 위험 분기는 **패키지 자체 테스트(1a-1 vitest)** 가 커버한다(`isHtmlParseError` 가 메시지 정규식이라 mock 으로 결정적).
> 잔여 둘(정규식↔실 API 결합 · 새 L3 HTML 이 실제로 parse 에러를 내는가)은 **어떤 인스턴스 검증도 "한 번 맞았다" 이상을 주지 못하므로** β1 이 그 잔여를 없애지 못한다.
> **δ(대상 저장소 env 스위치) 보류** — cron 을 꺼도 DB 쓰기는 남아 조건 2 를 대체하지 못한다.
> **β2 의 한계 2건을 명시한다:** ① 빈 스키마에서 fit 리포트 **본문이 실제로 생성되는지는 미측정**이다 ② β2 가 **배포 경로(`prepare`·Q45)를 검증하는 것은 병행 인스턴스가 git dep 을 실제로 `npm ci` 한 뒤 = 1a-3 이후**다.
> 따라서 **β2 의 서버 승인 게이트는 1a-3 과 함께 소비**한다. `GARMIN_EMAIL`/`GARMIN_PASSWORD` 에 실값을 넣으면 `syncAll` 이 사본을 실데이터로 채워 **β2 가 β1 이 된다** — 조건 8(a) 에 그래서 들어 있다.
>
> **→ 1a-0 은 착수 가능하고 집행 중이다** (Q47·Q44·Q46 확정 · **Q45 는 1a-3 착수 전**). 1a-1~1a-4 의 #1 선결은 그대로다.

> **단 이 표 밖에 선결 조건이 하나 있다 (PR #9 Codex 리뷰 P2).**
> `004-repo-layout.md` **Q20 — 하네스 통합**이 **"1a 착수 전"** 으로 걸려 있다. 중첩 `.claude/` 가
> 로드되지 않으므로 `repos/` 배치에서는 두 저장소 하네스가 **없는 것과 같기 때문이다**(004 §3-2).
>
> **면제되는 것은 1a-0 하나뿐이다.** 1a-0 의 작업 대상은 **pleiades 저장소 자신**
> (`package.json` 신설 · `packages/notify/` 스캐폴딩)이고 **두 대상 저장소를 열지 않는다.**
>
> **1a-1 부터 선결이다 (2차 정정, PR #13 Codex 리뷰 P1).** 처음에 *"1a-2 부터"* 라고 적었으나
> **1a-1 이 이미 두 저장소를 읽는다** — §5-1 흡수 목록이 `error.ts` · `splitMessage`(fin
> `formatter.ts:52`) · **fit `send.ts` 전량 124줄** · fin `sendHtml`/재시도/폴백이다.
> 그 코드를 읽고 정본을 고르는 작업이라 **저장소별 룰·스킬이 없으면 근거 없이 고르게 된다.**
>
> ~~**즉 1a-0 만 착수 가능하고, 1a-1~1a-4 는 004 Q20 이 선결이다.**~~ (위 2026-09-07 정정으로 폐기 — 1a-0 은 Q42 가 막는다)
>
> **번호 주의:** 이 문서의 **Q25·Q26** 과 `004` 의 **Q20·Q21** 은 서로 다른 질문이다.
> 003 이 나중에 Q16~ 를 새로 매기면서 004 의 Q20~Q24 와 겹쳐, 003 쪽을 **Q25·Q26 으로 재번호**했다.

**되돌리기 등급으로 본 답변 순서:** Q16·Q17·Q18(전부 되돌리기 **즉시**, 서비스 영향 0) →
Q25·Q26(인터페이스 확정, 되돌리기 **즉시**지만 나중에 바꾸면 1a-4 호출부 20곳 재편집) →
Q19 · **Q27**(둘 다 관측 가능한 동작 변경) → Q10(관측 가능한 동작 변경, Q14 에 근거 종속).
**단 Q10 은 1a-1·1a-3 도 막으므로 실제로는 더 일찍 필요하다** — 위 표 참조.

**Q19 를 "별건"으로 뺄 때의 되돌리기.** `lastError` sanitize 만 따로 고치는 것은
fin 단독 **4줄 수정**이고 되돌리기 **즉시(코드)** / **불가(이미 저장된 행)** 이다.
1a 와 무관하게 언제든 할 수 있으므로, **1a-4 를 이 결정에 인질로 잡을 이유는 없다** —
단 파사드가 `deliveries[].error` 에 무엇을 담는지는 1a-1 에서 정해진다.

> **정정 (2026-09-09 · 이슈 #37 · 사용자 확정 4건) — 이 절의 의존 지도와 "8개"가 함께 바뀐다.**
>
> **ⓐ 막는 질문 표.**
>
> | 막히는 것 | 이 절의 현행 서술 | **2026-09-09 이후** |
> |---|---|---|
> | **1a-1** | *"**Q25**(목록 반환 표면) · **Q26**(context 인자) · Q19 의 방향(포트가 raw error 를 담나) · **Q10**(코어의 plain 폴백 정본)"* | **네 질문 모두 해소** — Q25 ① + ADMIN A · Q26 ① · Q19 방향 C · **Q10-P** ① 태그-only. **Q26 과 Q19 는 하나의 결합 질문으로 답했다**(Q26 ① 이면 Q19 B 가 닫힌다). **Q10-L 은 1a-1 을 막지 않는다**(§4-3 제약 2 는 두 형태를 허용하고 어느 쪽이든 정책이 `Notifier` 에 오지 않는다). **남은 선결은 #1(하네스 통합)의 H-1·H-3(fit) 뿐이다** |
> | **1a-2** | Q16 · Q17 · Q18 | 변화 없음 |
> | **1a-3** | *"**Q10**"* | **Q10-L 만 남았고 그것도 ①(분할로 통일)로 확정**됐다. Q10-P 는 1a-1 코어 정본이라 여기서 소진. **Q45**(서버 https·node)는 이 단계 전 측정 |
> | **1a-4** | Q10 · Q19(확정) · Q27 | **Q19 확정 · Q27** 이 남는다. Q10-L 은 여기서 재확인만. **ADMIN A 를 골랐으므로 `targetCount(ADMIN) === 0` 가드와 fin fail-safe 보존이 1a-4 지시 항목으로 들어온다** |
>
> **ⓑ *"1a 착수를 막는 결정은 8개"* 는 더 이상 참이 아니다.** 이 절과 §12 의 세 문장이 함께 걸린다 —
> *"**1a 착수를 막는 결정은 8개**다 — 기존 **Q10** + 2026-09-04 신설 **Q16~Q19 · Q25 · Q26 · Q27**"* ·
> *"되돌리기가 **즉시**이므로, **위 8개**(Q10 · Q16 · Q17 · Q18 · Q19 · Q25 · Q26 · Q27) 중 하나도 답을 받지 못한 상태에서도 착수 가능하다"* ·
> §12 의 *"남은 것은 **결정 8개**다(§10-1: Q10 · Q16 · Q17 · Q18 · Q19 · Q25 · Q26 · Q27)"*.
> **답 이후 남는 것은 열거로 넷 — Q16 · Q17 · Q18 · Q27** 이다(Q19 는 *확정* 만 1a-4 에 남고 **방향은 소진**, Q10 은 P 소진 · L 확정).
> **합계를 고치면서 괄호 안 열거도 함께 고친다** — 합계만 고치면 R1 위반(#11 유형)이다.
> **되돌리기: 문구 (즉시).**

---

## 11. 유효기간

이 문서는 다음 조건에서 다시 연다. 날짜가 아니라 조건이다.

| 조건 | 무엇이 확정되나 |
|---|---|
| **§9 의 미확인 U1 이 해소될 때** | **1a-2 가 성립하는지**가 확정된다. 실패하면 1a-2 의 대안(테스트 프레임워크 변경 또는 범위 축소)을 이 문서가 다시 정해야 한다 |
| **Q10 에 답이 나올 때** | **fit 쪽** 조건부 항목이 붙는지가 확정된다. **1a 전체의 "동작 변경 0" 여부는 Q10 혼자 정하지 않는다** — fin `rsu.ts:184` 는 **Q27**, `lastError` sanitize 는 **Q19** 에 달렸다. **셋이 모두 "안 함"일 때만** 1a 가 동작 변경 0 이다 (PR #9 Codex 리뷰 P2) |
| **1a 착수 직전** | §9 의 "myFinance 22곳 루프 본문 분류" 정적 측정으로 1a-4 청구서를 확정한다 |
| **1a 완료 직후** | **L3 층위 선택이 맞았는지 실증된다** (§2-3 근거 2). 틀렸다면 §4 를 개정본으로 다시 쓴다 |
| **1b 착수 직전** | Discord 측 제한값(2000자·rate limit·embed 한도)이 확인 대상이 된다. 이 문서의 "2000" 은 **저장소 실측이 아니다** |
| **패키지 수정 PR 2개짜리 왕복이 반복적으로 성가셔질 때** | **002 단계 4 를 앞당길 증거**가 된다 (§2-2·§2-4). 그때는 이 문서가 아니라 **002 를 개정**한다 |
| **도메인 #3(캘린더)을 붙일 때 = 002 단계 4 진입** | `packages/notify/` 는 움직이지 않고 git URL 의존성이 워크스페이스 `"*"` 로 교체된다(§2-1). §4-4 의 `Route` 도메인 축이 그때 실제 값을 받는다. **이 문서의 §5·§7-5 를 그 시점에 다시 읽는다** |
| **U3 가 해소될 때 (2026-09-04 신설)** | fit 에서 **vitest 가 런타임에 실제로 도는지**가 확정된다(§9 정정 U3, esbuild override). 실패하면 1a-2 의 대안을 이 문서가 다시 정한다 |
| **Q16·Q17·Q18 에 답이 나올 때 (2026-09-04 신설)** | **1a-2 의 집행 지시가 확정된다.** 그때까지 1a-2 는 첫 명령에서 멈춘 상태다. **Q18 을 빼면 안 된다** — `--save-dev` 없이 설치하면 vitest 3종이 `dependencies` 로 들어가 **실서비스 번들·`npm ci --omit=dev` 판단에 영향**을 준다 (PR #9 Codex 리뷰 P2) |
| **Q45 가 측정될 때 (2026-09-08 신설)** | **§1-1 정정이 확정되거나 다시 뒤집힌다** — 서버 https 아웃바운드가 막혀 있으면 ssh 폴백이 유일 경로가 되어 **서버 2대 deploy key 가 되살아난다.** 서버 node 값은 루트 `package.json` 의 `engines` 기재 여부를 가른다(현재 **미측정이라 적지 않는다**) |
| **실제 `@pleiades/notify` 코드로 `npm ci` 를 다시 잴 때 (2026-09-08 신설)** | **§8-1 정정의 수치가 확정된다.** 지금 값(1.99~2.15 s · 캐시 19 MB · 설치본 16 KB)은 전부 **1행짜리 더미 패키지** 기준이다 — 실제 패키지는 `grammy` peer 와 다중 파일을 갖는다 |
| **pleiades 가 PRIVATE 으로 바뀔 때 (2026-09-08 신설)** | **§1-1 정정을 재측정해야 한다** — https 가 인증을 요구하면서 **ssh 폴백이 실제로 발동**하고, 그때는 형태와 무관하게 **키가 필요하다** |
| **Q25·Q26 · Q19 의 방향에 답이 나올 때 (2026-09-04 신설)** | **§4-2 시그니처가 확정된다.** 1a-1 은 이 답 없이 시작할 수 없다. **Q19 를 빼면 안 된다** — §10-1 이 적었듯 `deliveries[].error` 가 raw 를 담는지 sanitize 된 값을 담는지가 **포트 계약**이라, Q25·Q26 만 답하고 시작하면 에러 계약이 미정인 채로 구현했다가 **재설계**하게 된다 (PR #9 Codex 리뷰 P2) — 나중에 바꾸면 1a-4 호출부 20곳이 재편집 대상이 된다 |


> **정정 (2026-09-04 · 이슈 #2·#4).** 위 표의 두 행이 소진됐다.
> ① *"§9 의 미확인 U1 이 해소될 때"* — **해소됐다.** 1a-2 는 **조건부 성립**이고 그 조건은
> `overrides.postcss` 1줄이다(§9 정정 ①). 이 문서가 1a-2 의 대안을 다시 쓸 필요는 **없어졌고**,
> 대신 **U3**(런타임 동작)가 그 자리를 이어받는다.
> ② *"1a 착수 직전 — 22곳 루프 본문 정적 측정"* — **수행됐다**(발견 16~22).
> **1a-4 착수 전에 남은 정적 측정은 0건**이고, 남은 것은 **결정 8개**다(§10-1: Q10 · Q16 · Q17 · Q18 · Q19 · Q25 · Q26 · Q27).

> **정정 (2026-09-09 · 이슈 #37) — 유효기간 표의 두 행이 소진되고, 바로 위의 "결정 8개" 가 넷이 된다.**
>
> **ⓐ *"Q25·Q26 · Q19 의 방향에 답이 나올 때"* 행 — 소진.** **§4-2 시그니처가 확정됐다**(§4-2 맨 위 · 사용자 2026-09-09).
> 그 자리를 **새 조건 둘**이 이어받는다:
>
> | 새 조건 | 무엇이 바뀌나 |
> |---|---|
> | **누가 `sensitiveLogs: true` 를 켤 때** | **Q19 판정이 즉시 뒤집힌다** — raw 유지가 형식 위반에서 **실제 토큰 노출 경로**가 되고 **B′(4지점 `sanitizeMessage`)가 즉시 안건**이 된다 |
> | **Q14 가 열릴 때** | **Q10-L 이 근거를 갖는다.** 최소 질의(단일 컬럼 길이 집계)와 **본문 반출 0 계약**은 이미 정해져 있고, 답이 ①과 다르면 **1a-3 지시가 바뀐다** |
>
> 덧붙여 **Q26 을 ② 로 다시 답할 때** Q19 B 가 선택지로 열리고 1a-4 의 4지점 지시가 달라진다 — 그때 §4-2 를 다시 연다.
>
> **ⓑ *"Q10 에 답이 나올 때"* 행 — 부분 소진.** 원문은
> *"**fit 쪽** 조건부 항목이 붙는지가 확정된다. **1a 전체의 \"동작 변경 0\" 여부는 Q10 혼자 정하지 않는다** — fin `rsu.ts:184` 는 **Q27**, `lastError` sanitize 는 **Q19** 에 달렸다. **셋이 모두 \"안 함\"일 때만** 1a 가 동작 변경 0 이다"* 이다.
> **셋 조합 판정 자체는 유효하다.** 바뀐 것은 항의 상태다 — **Q10-P 는 소진**(태그-only), **Q10-L 은 ①(분할)로 확정 → "안 함" 이 아니다**,
> **Q19 는 방향 소진(C = 안 함) · 확정만 1a-4**, **Q27 만 미결**. 이 행은 *"**Q10-L** 에 답이 나올 때"* 로 좁혀 읽고,
> 그 답도 이미 나왔으므로 **남는 재개 조건은 Q14(위 ⓐ) 뿐**이다. ∴ **1a 는 동작 변경 0 으로 끝나지 않는다** — 관측 변경은 **fit 리포트 말미 복원 1건**(+ Q27 이 "흡수" 면 `rsu.ts` 1건).
>
> **ⓒ 바로 위 문장의 "결정 8개" 는 넷이다.** *"남은 것은 **결정 8개**다(§10-1: Q10 · Q16 · Q17 · Q18 · Q19 · Q25 · Q26 · Q27)"* →
> **남은 것은 넷 — Q16 · Q17 · Q18 · Q27**(Q19 는 1a-4 확정만 잔존). 합계와 열거를 함께 고친다(R1).
> **되돌리기: 문구 (즉시).**

