# 003 — `@pleiades/notify` 패키지 설계 (002 단계 1 상세)

작성 2026-09-03 · 상태 **방향 확정 · 1a 착수 대기**
읽기용 아티팩트: **없음** (미발행)
(**정본은 이 파일이다.**)

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

### 5-2. 단계 — 1a-0 ~ 1a-4

각 단계는 **그 지점에서 멈춰도 손해가 없다.** 소요는 추정이다.

| 단계 | 내용 | 여기서 멈추면 남는 것 | 되돌리기 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|---|---|
| **1a-0** | pleiades **GitHub 원격 발행** + `package.json` 신설 + `packages/notify/` 스캐폴딩 + 빌드 산출물 정의(`exports`·`.d.ts`) + `prepare` 빌드 스크립트 + 서버 2대 접근 자격(deploy key/토큰) | pleiades 가 버전 관리되는 원격을 갖는다. **두 저장소는 아직 아무것도 모른다** | **즉시** | 원격 저장소 삭제 또는 방치. 두 저장소 무변경이므로 되돌릴 것이 **이 저장소 안에만** 있다 | **미측정** (npm 스캐폴딩·발행) |
| **1a-1** | `@pleiades/notify` 구현 — 포트 + 코어 + `TelegramTransport` + 패키지 자체 테스트 | 인터페이스와 구현이 존재한다. **L3 층위가 맞는지 코드로 확인된다** — 파일럿의 절반 | **즉시 — 단 1a-3 착수 전까지만** | 패키지 디렉터리 삭제. **"아직 아무도 안 쓴다"는 1a-3/1a-4 착수 전까지만 참이다** — 그 뒤엔 삭제가 양쪽 `npm ci` 를 깬다 | 반나절 + **미측정**(빌드·발행) |
| **1a-2** | myFitness vitest 도입 (devDep 3 + `vitest.config.mts` 15줄 + scripts 3줄) | myFitness 에 **회귀 baseline 이 생긴다.** 002 Q4 의 이행이고, 1b 안전성의 전제 | **즉시** | **4파일 revert** (`package.json`·`package-lock.json`·`vitest.config.mts`·테스트) + **`npm ci`**. 코드 무영향 | 1시간 미만 |
| **1a-3** | myFitness `send.ts`(124줄) → 패키지 교체, 호출 6건 | fit 아웃바운드가 재시도·폴백을 **키보드 전송에서도** 얻는다(§4-1(a) 해소). 한쪽만 이전됐지만 그 자체로 개선 | **중간** | `send.ts`(124줄) 복원 + import 6건 되돌림 + `package.json`/lockfile revert + **`npm ci`** + 재빌드 + `pm2 restart` (서버 1대 × {web, bot}) | 되돌리기 반나절 |
| **1a-4** | myFinance 호출 20건 → 파사드, 루프 **21곳**·try/catch 21곳 제거, `getAllowedChatIds` 4곳 제거, `rsu.ts` 키보드 흡수 | **코드 드리프트 정지.** 아웃바운드 전송 로직이 한 곳에 있다. 도메인 #3 이 `notify(route, msg)` 한 줄로 알림을 얻는다 — 002 단계 4 도메인 계약 중 **"알림 라우트" 조각 완성** | **중간** | `git revert`. 충돌 시 21개 지점 수작업 복원. **+ 서버 2대 `npm ci`·재빌드·`pm2 restart`** | 되돌리기 1~2일 + **미측정**(배포분) |

**조건부 항목 (Q10 이 "예"일 때만 1a 에 포함).** fit 절단 → 분할 통일 + plain 폴백 정본 선택.
되돌리기는 **코드 즉시**(상수·정책 1줄) / **이미 나간 메시지는 불가**. 소요 1시간 미만.
Q10 이 "아니오"면 1a 는 **관측 가능한 동작 변경이 0** 인 상태로 깨끗하게 끝난다.

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
재빌드 + `pm2 restart`, 실서비스 서버 2대.**
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

**1a 착수 직전 측정 1건.** myFinance **22곳 루프 본문이 전송 외에 무엇을 하는가** —
정적 측정이 가능하고, 감사가 대표 4곳을 부분 수행했다. `repo-surveyor` 재호출로 1a-4 청구서를
확정한 뒤 착수한다.

---

## 10. 남은 미결 질문

| | 질문 | 무엇을 가르는가 | 우선 |
|---|---|---|---|
| **Q10** | myFitness 아웃바운드 **절단 → 분할**을, 그리고 **plain 폴백 정본**을 1a 에서 받나 | 받으면 지금 버려지던 4096 초과분이 살아나 **사용자에게 메시지 수가 늘어난다**(관측 가능한 동작 변경). 안 받으면 1a 가 **무동작-변경**으로 깨끗하지만 손실이 지속된다. plain 폴백(`telegram.ts:69` vs `markdown.ts:96-103`)도 **어느 쪽을 골라도 한쪽 저장소의 출력이 바뀌는** 같은 성격의 변경이라 함께 답한다 | **높음 — 1a 착수 전** |
| **Q12** | 1b-2d 의 DB 처리 — **D-a(권고)** / D-b | **판돈이 줄었다.** 감사가 D-a 의 잔여 리스크를 **사실상 0** 으로 확인했다(죽은 인덱스 · 매칭은 adjustment id · 노출 최대 ~1건·≤8시간·자가 소멸). 남은 것은 *D-b 를 굳이 택할 이유가 있는가* 뿐이다. D-b 는 단계 1 전체에서 **유일하게 되돌리기가 "사실상 편도"** 이고, 중립 컬럼 이름은 **002 Q7 의 답에 종속**된다 | 중간 (1b-2 착수 전) · **판돈 축소** |
| **Q13** | fit 관리자 alert 수신자 분리(`admin-alerts.ts:232` → 신설 `ADMIN` 그룹)를 언제 고치나 | 고치면 지금 받던 사람이 못 받게 된다(동작 변경) + fit 에 없는 env 신설. 1a 가 `Route` 를 만들면 자리는 생긴다. 안 고치면 fin 주석이 명시적으로 금지한 동작이 계속된다 | 중간 |
| **Q14** | 실서비스 DB **읽기 전용 조회**를 허용하나 | §9 의 알림 길이 분포 **1건**이 풀린다. **Q10 하나만** 막는다. 불허면 Q10 은 근거 없이 내려야 한다. 초안은 미측정 2건을 근거로 들었으나 그중 `WorkoutAdjustment` pending row 수는 **정적으로 상한이 유도돼 삭제**됐다 — **정당화 절반이 사라졌다** | **낮음** |

**표에 넣지 않은 것.** `error.ts` shim 여부(§5-1)는 사용자 판단이 필요 없는 **구현 결정**이다 —
두 선택지의 되돌리기 등급이 같고, 답이 로드맵을 바꾸지 않는다. 착수 시점에 고른다.

---

## 11. 유효기간

이 문서는 다음 조건에서 다시 연다. 날짜가 아니라 조건이다.

| 조건 | 무엇이 확정되나 |
|---|---|
| **§9 의 미확인 U1 이 해소될 때** | **1a-2 가 성립하는지**가 확정된다. 실패하면 1a-2 의 대안(테스트 프레임워크 변경 또는 범위 축소)을 이 문서가 다시 정해야 한다 |
| **Q10 에 답이 나올 때** | 1a 가 "관측 가능한 동작 변경 0" 으로 끝나는지, 조건부 항목이 붙는지가 확정된다 |
| **1a 착수 직전** | §9 의 "myFinance 22곳 루프 본문 분류" 정적 측정으로 1a-4 청구서를 확정한다 |
| **1a 완료 직후** | **L3 층위 선택이 맞았는지 실증된다** (§2-3 근거 2). 틀렸다면 §4 를 개정본으로 다시 쓴다 |
| **1b 착수 직전** | Discord 측 제한값(2000자·rate limit·embed 한도)이 확인 대상이 된다. 이 문서의 "2000" 은 **저장소 실측이 아니다** |
| **패키지 수정 PR 2개짜리 왕복이 반복적으로 성가셔질 때** | **002 단계 4 를 앞당길 증거**가 된다 (§2-2·§2-4). 그때는 이 문서가 아니라 **002 를 개정**한다 |
| **도메인 #3(캘린더)을 붙일 때 = 002 단계 4 진입** | `packages/notify/` 는 움직이지 않고 git URL 의존성이 워크스페이스 `"*"` 로 교체된다(§2-1). §4-4 의 `Route` 도메인 축이 그때 실제 값을 받는다. **이 문서의 §5·§7-5 를 그 시점에 다시 읽는다** |
