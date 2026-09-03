# 02 · writer — 단계 1 `@pleiades/notify` 설계 초안

작성 2026-09-03 · **개정 2026-09-03 (감사 1회 반영)** · 상태 **초안 (감사 반영본)**
정본 아님. `docs/specs/003-*.md` 발행 여부는 오케스트레이터 판단(Phase 4) 대기.
근거: `_workspace/01_surveyor_transport.md`, `_workspace/01_surveyor_porting.md`,
`_workspace/03_auditor_notify.md` (감사 실측), `docs/research/measured-facts.md`
(전송 계층 상세 · Discord 이식 제약 절).

> **감사 결과 (2026-09-03, `reversibility-auditor`).** 확인 2 / **정정 4** / 미확인 1.
> 정정 4건과 추가 발견 E1~E7 을 **전부 반영했다.** 어느 절이 어떻게 바뀌었는지는 **§9 감사 반영 이력**.
> **구조적 결론은 유지된다** — L3 권고, 1a/1b 분할, 1a → 1b 순서 강제. 바뀐 것은 근거 문장 일부와
> **되돌리기 표 전체의 단가**다. 정정 4건은 전부 *1a 를 더 비싸게, 1b-2d 롤백을 더 싸게* 만든다.

> **숫자 규율.** 이 문서의 모든 개수·행번호·파일수는 위 네 출처의 **인용**이다.
> 새로 측정하거나 추정한 저장소 값은 없다. 유일한 예외는 §5 의 *소요 시간* 열로,
> 이는 실측이 아니라 **인용된 건수로부터 유도한 작업량 추정**이며 그렇게 표기했다.

---

## 1. 무엇이 바뀌었나

002 는 단계 1(알림 어댑터 + Discord 아웃바운드 전환)을 **승격**했다. 근거가 넷이었다:

| # | 002 의 근거 | 실측 후 판정 |
|---|---|---|
| 1 | 사용자가 **어차피 원하는** 작업이다 (Q6) | **유지.** 실측이 건드리지 않는다 |
| 2 | 아웃바운드는 **이미 초크포인트**다 (발견 4) | **절반만 맞다.** ↓ |
| 3 | **Next 무관**이라 정렬을 기다리지 않는다 (발견 6) | **유지.** `src/bot` → `next` import 양쪽 0건 |
| 4 | 추출 패턴의 **파일럿** — 가장 작은 조각으로 B1 검증 | **유지.** 오히려 강해진다 (§4 참조) |

근거 2 가 깨진 방식이 이 문서 전체를 결정한다.

> **"이미 초크포인트"는 전송 호출에 대해서만 참이다.**
> 아웃바운드에서 원시 전송을 하는 곳은 fin 2곳 / fit 0곳뿐이고 (`01_surveyor_porting.md` §2-1),
> `chat_id` snake 표기는 양쪽 src 전체 **0건**이다. 여기까지는 002 가 맞다.
> 그러나 채널을 바꿀 때 실제로 손대야 하는 것 셋 — **콘텐츠 모델(HTML)**, **수신자 식별(타입·루프)**,
> **인터랙션 루프** — 은 초크포인트를 지나지 않는다. 그것들은 호출부와 DB 와 인바운드에 있다.

깨진 것을 발견 번호로 정리한다 (002 의 발견 7 다음).

### 발견 8 — 두 초크포인트는 **추상화 층위가 다르다**

| | myFinance `sendHtml` | myFitness `sendToAll` |
|---|---|---|
| 시그니처 | `(bot, chatId: number, html: string): Promise<void>` (`bot/utils/telegram.ts:56`) | `(bot, text: string): Promise<SendResult>` (`bot/notifications/send.ts:77`) |
| 수신자 | **인자로 받음**, 1건 | **자기가 env 조회**, N건 |
| chatId 루프 | **호출부가 돈다 — 22곳** | **초크포인트가 흡수 — 2곳, 둘 다 `send.ts` 내부** |
| per-chat try/catch | 21 / 22 | (초크포인트가 집계) |
| 수신자 목록 함수 | `getAllowedChatIds()` **4중 복제** (`lib/cron.ts:13`, `budget-alert.ts:14`, `scheduler.ts:21`, `retry/route.ts:29`) | `getChatIds()` **1곳** |

> **정정 (2026-09-03 감사 반영 · 주장 2 부수).** `getAllowedChatIds` 정의 행번호를 14/15/22/30 →
> **13/14/21/29** 로 고쳤다. 전부 −1 이다. 원 출처 `01_surveyor_transport.md` §1-3 의 표에도 같은
> 오차가 남아 있다 (그 파일은 이 문서가 고치지 않는다 — 인용 시 주의).

> **정정 (2026-09-03 감사 반영 · 감사 E6).** 아웃바운드 chat id 파싱 지점은 4곳이 아니라 **5곳**이다.
> `lib/ai/advisor-monitor.ts:199` 가 `TELEGRAM_ADMIN_CHAT_IDS` 를 **인라인으로** 파싱한다
> (`!Number.isNaN` 사용, `01_surveyor_porting.md` §4-2 표). `getAllowedChatIds` 라는 **이름을 쓰지 않아서**
> 4중 복제 집계에 잡히지 않았다. 등급 축이 ADMIN 이라 §4-5 의 `Route` 가 흡수해야 할 대상이고,
> §3-2 의 "`getAllowedChatIds` 4곳 제거"는 **5번째 지점을 포함하지 않는다.**

→ 하나의 인터페이스로 묶으면 **한쪽은 반드시 호출부 마이그레이션이 붙는다.** 어느 쪽이냐가 §2 다.

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
> adjustment id 로 한다(`auto-adjust-callback.ts:231-238`). 즉 **죽은 인덱스**이고, 소비 지점이 아니다.
> 실제 제약은 인덱스가 아니라 **컬럼 타입 `String?`** 에서 온다. 발견 9 의 결론은 그대로 성립한다.

### 발견 10 — `chatId: number` 20건이 Discord snowflake 를 담지 못한다

`Number('1234567890123456789')` → `1234567890123456800`, 왕복 불일치 (19자리 > `Number.MAX_SAFE_INTEGER`).
myFinance 아웃바운드 `chatId: number` 시그니처 **20건**, 인바운드 인증 `Set<number>` + `.map(Number)`
(`middleware/auth.ts:3-9`). myFitness 아웃바운드는 이미 `string` (`send.ts:21,41`).
**텔레그램 chat id 9~10자리에서는 드러나지 않던 문제이고, 양쪽이 비대칭이다.**

### 발견 11 — 4096 → 2000 은 상수 교체가 아니다

| | myFinance | myFitness |
|---|---|---|
| 상수 정의 | 1 (`utils/formatter.ts:50`) + 리터럴 1 (`commands/briefing.ts:98`) | **4개 독립 정의** |
| 아웃바운드 초과 처리 | **분할** (`splitMessage`) | **절단** (`send.ts:36` `slice(0, MAX-3)+"..."`) |
| 인/아웃바운드 상수 공유 | **공유** | 분리 |
| splitter 가 HTML 태그 경계를 아나 | **아니오** | **아니오** |

구조 변경 3건: (1) myFitness 아웃바운드에 **분할 로직 신규 도입** — 지금은 절단이라 한도가 절반이면
버려지는 양이 2배 이상, (2) 어느 splitter 도 태그를 몰라 한도 절반 → 분할 지점 약 2배 →
`<b>…</b>` 절단 → plain 폴백 발동 확률 상승, (3) myFinance 는 아웃바운드만 낮추려면
상수를 쪼개야 하고 그러면 인바운드 텔레그램 경로도 함께 건드린다.

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

**아웃바운드 어댑터만 갈아서는 완성되지 않는다.** Discord components 는 interaction 응답 엔드포인트
(gateway 또는 HTTP interactions endpoint)가 있어야 동작하고, `answerCallbackQuery` /
`editMessageReplyMarkup` (`auto-adjust-callback.ts:308`) 대응 개념도 다르다.
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
escape 됨/raw 로 혼재한다.

### 발견 15 — 추출 후보 목록이 틀렸다 (정정)

> **정정 (2026-09-03 재측정).** `measured-facts.md` 의 "이름이 같은 파일" 목록은
> `src/bot/utils/{error,formatter,telegram}.ts` 를 한 덩어리 B1 후보로 묶었다.
> **`formatter.ts` 는 공유 후보가 아니다** — 겹치는 export **0개**. myFinance 는 금액·수익률 포맷,
> myFitness 는 거리·페이스 포맷. 채널 중립인 것은 `splitMessage` **하나뿐**이다.
> 반대로 **`error.ts` 가 가장 좋은 후보**다 — 원시 diff 118줄이지만 export **5/5 완전 일치**,
> 정규화 diff 20줄, 실동작 차이 **2건**(`ENOTFOUND` 유무 / `sanitizeError` 최종 마스킹 유무).

부수 발견: myFinance `isHtmlParseError` **참조 0건** (죽은 export — `telegram.ts:79` 의 로컬
`isParseError`, `error_code===400` 기준을 씀). **두 저장소가 HTML 파싱 실패를 다른 기준으로 판정한다.**
`sanitizeMessage` / `getErrorCode` 는 양쪽 다 참조 0건 → 공개 API 에서 제외 가능.

---

## 2. 핵심 설계 결정 — 정본 층위

발견 8 이 만든 질문: `Notifier` 인터페이스의 층위를 **per-chat** 으로 잡을 것인가 **broadcast** 로 잡을 것인가.

### 2-1. 세 옵션과 마이그레이션 청구서

청구서의 모든 건수는 인용값이다.

| | **L1 · per-chat 단일층**<br>(myFinance 층위 채택) | **L2 · broadcast 단일층**<br>(myFitness 층위 채택) | **L3 · 2층**<br>(포트 = per-target, 파사드 = broadcast) |
|---|---|---|---|
| 어댑터가 구현하는 것 | `send(target, msg)` | `broadcast(msg)` | `send(target, msg)` **만** |
| 호출부가 부르는 것 | `send(target, msg)` | `notify(route, msg)` | `notify(route, msg)` (+ 필요 시 `send`) |
| **myFinance 청구서** | 호출 **20건** 형태 유지 (인자만 교체).<br>루프 **22곳 그대로 남음**.<br>`getAllowedChatIds` **4중 복제 그대로**.<br>per-chat try/catch **21곳 그대로** | 호출 **20건** 수정.<br>루프 **21곳 제거** (22 중 `quarterly-report.ts:52` 는 §4-4 로 남음).<br>try/catch **21곳 제거**.<br>`getAllowedChatIds` **4 → 0** — 단 `length===0` **가드 2곳**을 파사드가 대신 제공해야 함 | L2 와 동일 (파사드를 쓰므로) |
| **myFitness 청구서** | `sendToAll` 을 파사드로 **재구성**.<br>`SendResult` 집계를 호출부 or 헬퍼로 이전.<br>소비 지점 **분기 5곳 + DB 저장 2곳** 전부 재검증 | 호출 **6건** 거의 무변경.<br>`SendResult` 그대로 | L2 와 동일 |
| 재시도·폴백·분할 위치 | 어댑터 내부 (채널마다 복제됨) | 어댑터 내부 (채널마다 복제됨) | **어댑터 밖 공용 코어** (채널당 1회 구현 아님) |
| 도메인 #3 이 붙을 때 | 새 도메인이 루프·try/catch·수신자 파싱을 **또 짬** | 새 도메인은 `notify(route, msg)` 한 줄 | 좌동 |
| 어댑터 표면 | 좁음 | **넓음** (수신자 해석 + 루프 + 집계 + 재시도 + 분할 + 폴백이 전부 채널 구현체 안) | **가장 좁음** |

### 2-2. 권고 — **L3 (2층)**

근거 셋. 전부 실측에서 나온다.

**(a) 발견 G 가 L2 를 반증한다.** `sendToAllWithKeyboard` 는 재시도 백오프도 HTML 폴백도 **둘 다 없다**
(`send.ts:98`, 주석에 "재시도 로직 없이 단순 전송" / "HTML fallback 없음" 명시). 이유는 구조적이다 —
broadcast 층에 채널 로직과 공용 로직이 **한 함수로 섞여 있어서**, 두 번째 전송 함수를 만들 때 공용 부분이
복제되지 않고 그냥 빠졌다. L2 는 이 구조를 인터페이스로 승격시킨다. 어댑터가 2개(Telegram/Discord)
× 전송 형태가 2개(텍스트/키보드)면 같은 누락이 4칸 중 몇 칸에서 재발한다.

**(b) 어댑터가 실제로 구현해야 하는 최소 단위는 per-target 이다.** Discord 도 전송 단위는 채널 1개다.
수신자 목록 해석 · N건 루프 · 결과 집계 · 재시도 백오프(`[2000,8000,30000]`ms ×4회, 양쪽 **동일 상수**) ·
파싱 실패 폴백 · 길이 분할 은 전부 **채널 무관 로직**이다 — **단 길이 분할은 예외다(↓ 정정).**
나머지를 어댑터 안에 넣을 이유가 없다.

> **정정 (2026-09-03 감사 반영 · 주장 6-C).** 길이 한도는 **변환 후** 문자열에 걸린다. §4-1 의
> HTML→Discord-md 역변환기는 Transport 직전에 있고, HTML 태그(`<b>…</b>`)와 엔티티(`&amp;`)가
> 길이를 부풀려 **변환 전후 길이가 다르다.** 분할을 "어댑터 밖 공용 코어"에 두면 **잘못된 문자열의
> 길이로 계산**된다. 따라서 분할은 **변환 뒤**(Transport 경계 안쪽)에 있거나, 포트가 "변환 후 길이
> 예산"을 코어에 알려주는 형태여야 한다.
> **근거 (b) 는 재시도·폴백·집계·수신자 해석에 대해서만 성립한다.**
> L3 권고 자체는 근거 (a)·(c) 로 **유지**된다 — 축소된 것은 (b) 하나다.

**(c) 청구서가 L2 와 같다.** L3 의 마이그레이션 비용은 L2 와 동일하다 (호출부가 파사드를 쓰므로).
2층으로 나누는 것은 **공짜로 얻는 구조**다 — 파사드는 포트 위 얇은 코어이고, 새 표면이 아니다.

L1 을 버리는 이유: myFinance 쪽 청구서가 가장 싸 보이지만, **드리프트 정지라는 단계 1 의 목적을
달성하지 못한다.** (정확히는 **코드 드리프트** 정지다 — §3-2 정정. L1 은 그것조차 못 멈춘다.)
`getAllowedChatIds` 4중 복제와 per-chat try/catch 21곳이 그대로 남고, 도메인 #3 이 5번째 복제를 만든다.
002 §1 이 "드리프트가 3배가 된다"고 쓴 바로 그 문제다.

### 2-3. 반환 타입 — 발견 9 의 제약을 만족하는 형태

`Promise<void>` 는 불가. myFitness 의 `first.messageId` 가 `String?` 컬럼으로 **영속화**되므로
(`schema.prisma:359`) 어댑터는 **불투명 메시지 참조**를 반환하고 그 참조가 `String` 으로
영속화 가능해야 한다.

> **정정 (2026-09-03 감사 반영 · 주장 1).** 초안은 근거를 *"`first.messageId` 가 **DB 인덱스**까지
> 걸려 있으므로"* 라고 썼다. `@@index([telegramMessageId])`(`schema.prisma:367`)는 존재하지만
> **읽기 경로 0건 — 죽은 인덱스**다. 제약은 인덱스가 아니라 **컬럼 타입**(`String?`)에서 온다.
> 결론(불투명 `MessageRef = string`)은 바뀌지 않는다.

```ts
// 포트 (어댑터가 구현) — 채널 1개 · 대상 1개
type MessageRef = string;                        // 불투명. 파싱 금지. String 영속화 가능
interface Transport {
  readonly channel: string;                      // "telegram" | "discord"
  send(target: string, content: Content): Promise<MessageRef>;
}

// 파사드 (호출부가 사용) — 라우트 1개 · 대상 N개
interface Notifier {
  notify(route: Route, content: Content): Promise<BroadcastResult>;
  targetCount(route: Route): number;             // ← 전송이 아니라 "가드"용. ↓ 정정 참조
}

interface BroadcastResult {
  sent: number; failed: number; total: number;   // ← myFitness 소비 지점 5곳 그대로 만족
  first?: { target: string; ref: MessageRef };   // ← DB 저장 2곳 그대로 만족
  deliveries: { target: string; ok: boolean; ref?: MessageRef; error?: string }[];
}
```

> **정정 (2026-09-03 감사 반영 · 주장 2-f).** 초안의 파사드 표면에는 `targetCount` 가 없었다.
> `getAllowedChatIds` 는 **전송용으로만 쓰이지 않는다** — `scheduler.ts:41` 은 `chatIds.length === 0`
> 이면 **스케줄 등록 자체를 스킵**하고, `lib/cron.ts:96` 도 `length > 0` 가드를 건다.
> 파사드가 이 표면을 제공하지 않으면 §2-1·§3-2 의 **"`getAllowedChatIds` 4 → 0" 이 성립하지 않는다.**

**`target: string` 으로 고정하는 것이 발견 10 의 해법이다.** myFinance 아웃바운드 `chatId: number`
20건이 파사드 뒤로 사라지므로(L3/L2), 숫자 정밀도 문제가 **아웃바운드에서는 구조적으로 소멸한다**.
인바운드 `Set<number>` + `.map(Number)` 는 텔레그램에 남으므로 이번 범위 밖 (§4 제외 목록).

**DB 영향 — 여기가 중요하다.** `telegramMessageId` 는 이미 `String?` 이다.
따라서 `first.messageId: number` → `ref: string` 변경은 **DB 마이그레이션을 유발하지 않는다**
(오히려 `String(messageId)` 변환 지점이 사라진다). 채널을 바꾸지 않는 한 스키마는 무변경이다.
DB 가 걸리는 것은 §3 의 1b 이고, 그 성격은 §5-3 에서 따로 다룬다.

### 2-4. 기능 합집합 — 정본을 한쪽으로 고르면 양쪽 다 잃는다

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
| md→HTML 변환기 | **myFinance** (103줄 vs 10줄, 표·코드블록·인용·취소선) | 발견 14 — 단 **패키지 밖**, §4 제외 |
| **plain 폴백 문자열 처리** | **미결 — 정본이 정해지지 않았다.** 구현이 이미 둘로 갈라져 있다 | 감사 주장 6-B ↓ |

> **정정 (2026-09-03 감사 반영 · 주장 6-B).** 초안의 합집합 표에 **plain 폴백 행이 없었다.**
> `utils/telegram.ts:69` 의 인라인 폴백은 `chunk.replace(/<[^>]+>/g, '')` 로 태그만 벗기고
> **엔티티를 디코드하지 않는다**(`&amp;` 가 리터럴로 남는다). `utils/markdown.ts:96-103` 의
> `stripHtml` 은 태그 제거 + `&amp;`/`&lt;`/`&gt;` **디코드까지** 한다. 패키지는 둘 중 하나를
> 정본으로 골라야 하고, **어느 쪽을 고르든 한쪽 저장소의 폴백 출력이 관측 가능하게 바뀐다.**
> Q10 과 **같은 성격의 동작 변경**이므로 1a 착수 전에 함께 결정해야 한다.

> **길이 정책 통일은 관측 가능한 동작 변경이다.** myFitness 아웃바운드가 절단 → 분할이 되면
> 지금 조용히 버려지던 내용이 살아나고 **사용자에게 메시지 수가 늘어난다**. 기능 개선이지만
> 무단으로 넣을 변경은 아니다 → §6 Q10.

---

## 3. 단계 1 을 쪼갤 것인가

### 3-1. 판정 — **쪼갠다.** 두 작업의 성격이 다르다

분할안: **1a = 인터페이스 추출 + Telegram 어댑터** (채널 전환 없음) / **1b = Discord 아웃바운드 전환**.

성립 근거 넷.

**(a) 002 의 승격 근거 4개 중 3개는 1a 만으로 충족된다.**

| 002 의 승격 근거 | 1a 로 충족되나 | 1b 가 추가로 필요한가 |
|---|---|---|
| 어차피 원하는 작업 (Q6) | 부분 (채널은 아직 텔레그램) | **예 — Q6 의 본체** |
| 이미 초크포인트 | **예** (전송 호출은 실제로 수렴) | **아니오 — 여기서 근거가 깨진다** (발견 11·13·14) |
| Next 무관 | **예** (`src/bot`→`next` import 0건) | 예 (동일) |
| 추출 패턴의 파일럿 | **예** | 아니오 (파일럿은 1a 에서 끝난다) |

즉 **승격의 근거는 1a 를 지지하고, 1b 를 지지하지 않는다.** 1b 는 Q6 하나만으로 서 있다.
Q6 은 유효한 근거지만 "싸다"는 근거는 아니다.

**(b) 비용의 성격이 다르다 — 자릿수가 아니라 종류가 다르다.**

| | 1a | 1b |
|---|---|---|
| 건드리는 것 | 코드 이동 + 호출부 시그니처 | 코드 + **DB** + **콘텐츠 모델** + **신규 인프라(interaction endpoint)** + **실서비스 채널 이전** |
| 관측 가능한 동작 변경 | 없음 (Q10 을 "아니오"로 두면) | **전면** — 사용자가 받는 채널 자체가 바뀜 |
| 되돌리기 | 코드 revert. 데이터 무변경 | §5-3 참조 — **코드 revert 로 안 끝날 수 있다** |
| 실패 시 blast radius | 알림 전송 (기존과 같은 채널) | 알림 전송 + 인터랙션 플로우 2건 + pending 조정 건 매칭 |

**(c) 1a 없이 1b 를 하면 002 §3 의 원칙을 아웃바운드에서 위반한다.** 002 는 인바운드에 대해
*"저장소별로 각각 Discord 로 옮기면 안 된다 — 비싼 작업을 두 번 하고, 통합할 때 버린다"* 고 썼다.
층위가 다른 두 초크포인트(발견 8)에 각각 Discord 를 붙이면 정확히 같은 일이 아웃바운드에서 벌어진다.
**따라서 순서도 강제된다: 1a → 1b.** 역순이나 병행은 성립하지 않는다.

**(d) 1a 는 그 자체로 멈춰도 손해가 없다.** 멈췄을 때 남는 것 — 아래 §3-2.

### 3-2. 1a — 인터페이스 추출 + Telegram 어댑터

**목적:** 채널 전환이 아니라 **코드 드리프트 정지 + 층위 통일**. (드리프트가 소멸하는 것이 아니라
**버전 드리프트로 이전**된다 — ↓ 정정)

| 항목 | 내용 | 인용 근거 |
|---|---|---|
| 패키지 구성 | `@pleiades/notify` = 포트(`Transport`) + 코어(재시도·폴백·분할·집계·라우팅) + `TelegramTransport` | §2-3 |
| 흡수하는 파일 | `error.ts` (export 5/5 일치, 실동작 차 2건) — **단 인바운드 6곳의 import 경로가 바뀐다, §4-3 정정**, `splitMessage` (fin `formatter.ts:52`), fit `send.ts` 전량(124줄), fin `sendHtml`/재시도/폴백. fit `escapeHtml` 은 **발췌**(파일은 남는다, §4-2) | 발견 15 · 감사 2-b · E7 |
| myFinance 변경 | 호출 20건 → `notify()`. 루프 **21곳** 제거(`quarterly-report.ts:52` 는 §4-4 로 남고 `sendQuarterlyReport(chatIds: number[])` 시그니처도 남는다). try/catch 21곳 제거. `getAllowedChatIds` 4곳 제거 — 단 `scheduler.ts:41`·`lib/cron.ts:96` 의 `length===0` 가드를 파사드가 `targetCount()` 로 대신 제공해야 하고, `advisor-monitor.ts:199` 의 **5번째 파싱 지점**(ADMIN)은 별건이다 | 발견 8 · 감사 2-e/2-f · E6 |
| **패키지 배포 방식** | **미결 (Q15).** pleiades 에 `package.json` 도 git 원격도 없어 `file:` · git 의존성 · 사설 레지스트리 **어느 것도 현재는 성립하지 않는다.** 1a-0 이 선행된다 | 감사 E1 |
| myFitness 변경 | `send.ts` 삭제 → 패키지. 호출 6건. `SendResult` 형태 유지 | 발견 9 |
| 예외 2곳 | `rsu.ts` 키보드 → 포트에 `components` 옵션(텔레그램 구현만). `quarterly-report.ts` sendDocument → **포트 밖, 그대로 둔다** | 발견 12 |
| 테스트 | myFitness vitest 도입 (§4-2). 범위는 패키지 코드로만 한정 | 002 단계 1 선결 |
| **채널 전환** | **없음.** 텔레그램 유지 | — |
| **DB** | **무변경** (`telegramMessageId String?` 그대로) | §2-3 |

**여기서 멈추면 무엇이 남나:**
- 아웃바운드 전송 로직이 **한 곳**에 있다. fin/fit 의 **코드** 가 갈라질 자리가 없어진다
- fit 아웃바운드가 재시도·폴백을 **키보드 전송에서도** 얻는다 (발견 G 해소)
- 도메인 #3(캘린더)이 `notify(route, msg)` 한 줄로 알림을 얻는다 — **002 단계 4 의 도메인 계약 중 "알림 라우트" 조각이 완성된다**
- B1 추출 패턴이 실증된다 (파일럿 목적 달성). 실패하면 나머지 패키지 계획을 재검토할 근거가 생긴다
- Discord 는 **하지 않아도 손해가 없다.** 포트가 있으므로 언제든 어댑터만 추가하면 된다

> **정정 (2026-09-03 감사 반영 · 주장 2-g).** 초안은 첫 항목을 **"드리프트 정지"** 라고 썼다.
> 정확히는 **드리프트 이전**이다. 두 저장소가 각자의 `package-lock.json` 에 패키지 버전(또는 커밋)을
> **독립적으로 핀**하고 배포가 `npm ci` 이므로, 패키지를 한 번 고칠 때마다 **저장소 2곳에 PR 1개씩**이
> 필요하다. 한쪽이 버전을 안 올리면 **다시 갈라진다.** 즉 코드 드리프트가 **버전 드리프트**로 바뀌는
> 것이지 사라지는 것이 아니다. §2-2 의 L1 기각 근거("드리프트 정지가 목적")도 이 범위로 읽어야 한다 —
> L1 기각 자체는 유지된다(L1 은 코드 드리프트조차 못 멈춘다).

### 3-3. 1b — Discord 아웃바운드 전환

성립하는 하위 순서가 하나 더 있다. **1b 를 통째로 하면 되돌리기 등급이 한 칸 오른다.**

| | **1b-1 · 텍스트 알림만** | **1b-2 · 인터랙션 + 첨부** |
|---|---|---|
| 범위 | `DiscordTransport` + 채널 라우팅(`#finance`/`#fitness`/`#calendar`) + 2000자 분할 + HTML→Discord md 역변환 | 인터랙션 엔드포인트 2건 + PDF 첨부 1건 + DB 컬럼 중립화 |
| 남는 텔레그램 | 인터랙션 2건(RSU 베스팅 · 훈련 자동조정), PDF 분기 리포트 | 없음 (아웃바운드 전량 Discord) |
| 필요한 것 | 라우트별 채널 선택 (**혼합 운영**) | gateway 또는 HTTP interactions endpoint (**신규 인프라**), `answerCallbackQuery`/`editMessageReplyMarkup` 대응 개념 재설계, DB 마이그레이션 |
| 되돌리기 | **env 값 1개 + 재시작 4회** (서버 2대 × {web, bot}) · **git 이력 밖** ↓ 정정 | §5-3 |

> **혼합 운영이 성립하려면 파사드가 라우트별로 채널을 고를 수 있어야 한다.**
> 이건 1a 의 설계 요구사항이다 — 1a 에서 `Route → Transport` 매핑을 설정으로 빼두지 않으면
> 1b 의 되돌리기가 "env 플립"에서 "코드 revert + 재배포"로 올라간다. 이 요구사항 자체는 유효하다.

> **정정 (2026-09-03 감사 반영 · 주장 3).** 초안(과 002)의 **"채널 되돌리기는 env 한 줄"은
> 세 군데서 틀렸다.** 하드코딩 블로커가 없다는 부분은 확인됐지만, "한 줄"이라는 단가가 틀렸다.
>
> 1. **그 한 줄은 git 밖에 있다.** `.env` 는 양쪽 `.gitignore:28` 이다. 되돌리기는 `git revert` 가
>    아니라 **실서비스 서버 2대에서의 수동 편집**이고, 이력에 남지 않으며 CI 가 검증하지 않는다.
>    시간은 1a 보다 싸지만 **추적성은 1a 보다 나쁘다.**
> 2. **재시작 없이는 반영되지 않는다 — 프로세스 4개.** `scheduler.ts:40` 이 `chatIds` 를 한 번 계산해
>    모든 cron 콜백에 **클로저로 캡처**하고(`:68~`), `standalone.ts:10` 의 `dotenv/config` 는 부팅 시
>    1회다. 웹 프로세스도 아웃바운드 경로를 가진다(`app/api/alerts/history/[id]/retry/route.ts`).
>    → **서버 2대 × {web, bot} = 재시작 4회.** 봇 재시작에는 텔레그램 long-poll **409 위험**이 붙는다
>    (myFitness `deploy.sh` 가 `pm2 delete` + `pm2 start` 를 쓰는 이유).
> 3. **플립이 env-only 인 것은 `DiscordTransport` 가 이미 양쪽에 빌드·배포된 뒤부터다.**
>    `build:bot` 의 esbuild `--external:` 목록이 **두 저장소 `package.json` 에 하드코딩**돼 있어
>    Discord SDK 추가는 코드 변경 + 재빌드 + 재배포다. 되돌린 뒤에도 SDK 는 번들에 남는다.
>
> 정확한 서술: **"채널 되돌리기는 (선행 배포가 끝난 뒤) env 값 1개 + 재시작 4회, 소요 수 분,
> git 이력 밖."** 등급은 여전히 1b 에서 가장 싸다 — 바뀐 것은 **추적성과 선행 조건**이다.

1b-1 이 처리해야 하는 것 (전부 인용값):

| 항목 | 규모 | 근거 |
|---|---|---|
| 2000자 분할 | fit 아웃바운드에 **분할 신규 도입** (지금 절단). splitter 가 태그 경계를 모름 → 분할 지점 약 2배 | 발견 11 |
| HTML 중립화 | fin 아웃바운드 **14/16 모듈** + `advisor-monitor.ts` 8 hits, fit **템플릿 직타 3/5 모듈** + `admin-alerts.ts` 11 hits | 발견 14 |
| 수신자 env | `TELEGRAM_` prefix 6곳(fin)/2곳(fit) 파싱. 등급 축 fin 2 / fit 1, **도메인 축 0** | 라우팅 절 |
| 관리자 alert 분리 | fit `admin-alerts.ts:232` 가 `ALLOWED` 로 발송 — fin 주석이 명시적으로 금지한 동작 | §4 제외 (별건) |

**HTML 중립화는 두 갈래다.** 본문 생성부 18~19 모듈을 고치거나, **어댑터 안에 HTML→Discord-md
역변환기를 두거나.** 후자를 권고한다 — 이유는 §4-1.

---

## 4. 범위에서 명시적으로 제외할 것

### 4-1. HTML 콘텐츠 모델의 **저장·UI 파급** — 제외

**제외 대상:** `PRE_ESCAPED_KINDS` 3중 정의 정리, alert 히스토리 테이블의 저장 규약 변경,
`app/alerts/history` 웹 UI, CSV export(`csv-format.ts:46`), `decodeHtmlEntities`→`escapeHtml`
round-trip gating(`alert-dispatcher.ts:117-119`).

**이유:** HTML 이 myFinance 에서 **저장 포맷**이기 때문에(발견 14), 콘텐츠 모델을 채널 중립으로
바꾸면 봇 코드에서 끝나지 않고 DB 저장 규약 + 웹 UI + export 로 번진다. 이 셋은 알림 채널과
아무 관계가 없다. 단계 1 의 목적(알림 어댑터)에 대한 순수 부수 비용이다.

**대신 무엇을 하나:** 어댑터 안에 **HTML → Discord-md 역변환기**를 둔다. 본문은 계속 HTML 로
생성·저장되고, Discord 로 나갈 때만 변환된다. `markdownToTelegramHtml`(`utils/markdown.ts:51`, 103줄)이
**부분** 참조가 된다 — **대칭 역함수가 아니다.**

> **정정 (2026-09-03 감사 반영 · 주장 6-A).** 초안은 *"역방향이므로 정본 참조가 이미 있다"* 고 썼다.
> 그 문장은 역변환을 실제보다 싸게 보이게 한다. 정방향은 `& < >` 만 escape 하고(`markdown.ts:57-60`)
> 마크다운 메타문자(별표·밑줄·물결·백틱·파이프·역슬래시)를 **소비**한다 — 정방향에서는 그것들이
> *입력 구조*였기 때문이다. 역방향은 반대로 그것들을 *출력 구조*로 **생성**하면서, 동시에
> **텍스트 노드 안의 같은 문자를 escape** 해야 한다. **정방향에 대응 단계가 없는 새 단계다.**
>
> 이건 이론이 아니다. `displayName`·`ticker`·전략명은 **사용자 입력**이고 `escapeHtml` 만 거친다
> (`price-alert.ts:219,284`). `csv-format.ts:67-68` 과 `alert-dispatcher.ts:112-113` 주석이
> `SOXL < 40 > RSI` 같은 이름이 **실재**함을 명시한다. 밑줄·별표가 든 이름은 Discord 에서
> **서식으로 렌더된다** — 이 escape 를 빠뜨리면 **서식 주입**이다.
> 또 `convertTables`(`markdown.ts:55`)로 이미 리스트가 된 표는 **복원 불가**다.

**제외했을 때 남는 것:** 저장 포맷은 HTML 그대로. `PRE_ESCAPED_KINDS` 중복 3곳도 그대로.
`h` 헬퍼 91회/19파일도 그대로. **알림 채널만 바뀐다.** 이게 원래 목표다.

**대가:** 역변환기가 하나 더 생긴다 (HTML→Discord-md). 위치는 **파사드가 아니라 Transport 직전**이다 —
이유는 `alert-dispatcher` 의 round-trip 때문이 **아니다**(그 round-trip 은 `:117-119` 에서 전송 호출
전에 끝나므로 파사드도 그 이후다). 진짜 이유는 **변환이 채널 의존적**이라는 것이다: 혼합 운영(Q11)에서
같은 `Content` 가 텔레그램(HTML 유지)과 Discord(md 변환)로 **동시에 fan-out** 될 수 있으므로,
채널 무관 층인 파사드에서 변환하면 **텔레그램 배송이 깨진다.**

> **정정 (2026-09-03 감사 반영 · 주장 6).** 결론("Transport 직전")은 유지되지만 초안의 **근거가
> non sequitur 였다.** round-trip 은 `alert-dispatcher.ts:117-119` 에서 끝나고 전송 호출은 `:124` 다 —
> **파사드도 `:119` 이후**이므로 round-trip 은 파사드를 배제하는 근거가 되지 못한다. 근거를 교체했다.
> 그리고 이 위치 선택은 §2-2(b) 의 "길이 분할도 채널 무관" 주장을 깬다 — §2-2(b) 단서 참조.

### 4-2. `h` 헬퍼 / md→HTML 변환기 / `formatter.ts` — 제외

| 항목 | 제외 이유 | 남는 것 |
|---|---|---|
| `h.b/h.i/h.code/h.pre` (fin 91라인/19파일, fit 0) | 패키지로 옮기면 **myFinance 19개 파일이 어댑터에 의존**한다. 표면이 "전송"에서 "포매팅"으로 넓어짐 | `h` 는 myFinance 로컬 유지. 어댑터는 문자열만 받는다 |
| `markdownToTelegramHtml` (103줄) / `mdToHtml` (10줄) | 역량 차가 커서 통합하면 fit 동작이 바뀐다. 그리고 이건 **입력 포맷 변환**이지 전송이 아니다 | 각 저장소 로컬 유지 |
| `formatter.ts` 공유 | **겹치는 export 0개** — 이름만 같다 (발견 15) | 도메인 포맷터는 각자. **`splitMessage` 하나만** 패키지로 |
| `escapeHtml` 중복 (fit 2곳: `telegram.ts:18`, `auto-adjust.ts:112`) | — | **제외 아님 — 단 "자동 해소"는 과장이다 (감사 E7).** `utils/telegram.ts:18` 은 **인바운드 `replyLong`(`:30,33`)도 쓰므로 파일이 통째로 사라지지 않는다.** 패키지는 `escapeHtml` 을 **발췌**해 가고 로컬에는 인바운드용 잔여가 남는다 — 중복이 2 → 1 이 되는 것이지 0 이 되는 것이 아니다 |
| `isHtmlParseError` 죽은 export (fin 참조 0) | — | **제외 아님.** 패키지화 시 정본 1개로 수렴 |

### 4-3. 인바운드 전부 — 제외 (002 §3 확정 사항)

명령 30파일 / 전송 210건(fin 149 · fit 61) / grammY `Context` 결합. 002 가 이미 "단일 봇까지
텔레그램으로 둔다"고 확정했다. **변경 없음 — 단 하나 예외.**

> **정정 (2026-09-03 감사 반영 · 주장 2-b).** `error.ts` 를 패키지가 흡수하면(§3-2 "흡수하는 파일")
> **인바운드 파일 6곳**의 import 경로가 바뀐다 — fin `commands/watchlist.ts:6` ·
> `commands/vest-confirm.ts:19` · `commands/ai.ts:14` · `standalone.ts:14`,
> fit `auto-adjust-callback.ts:8` · `standalone.ts:4`.
> 초안의 §3-2("`error.ts` 흡수")와 §4-3("인바운드 **변경 없음**")은 **정면 충돌한다.**
> 완화책: 로컬 `utils/error.ts` 를 `export * from '@pleiades/notify'` **shim** 으로 남기면
> 인바운드 변경을 **0 으로** 만들 수 있다 (대신 파일 2개가 껍데기로 남는다).
> **어느 쪽을 택할지는 결정 사항**이고 1a 착수 전에 정해야 한다.

여기에 딸린 제외 항목 둘:
- myFinance 인바운드 4096 상수 (`commands/briefing.ts:98` 하드코딩) — 인바운드가 텔레그램이면 4096 이 맞다.
  단 **fin 은 상수를 인/아웃바운드가 공유**하므로(발견 11) 1b 에서 상수를 쪼개는 작업만은 발생한다.
- 인바운드 인증 `Set<number>` + `.map(Number)` (발견 10) — 텔레그램 chat id 는 9~10자리라 안전.
  Discord 인바운드를 하게 될 때 다시 열 것.

### 4-4. `quarterly-report.ts` PDF 첨부 — 1a 에서 제외, 1b-2 로

포트를 `send(target, content)` 로 좁게 잡는다. 바이너리 첨부는 아웃바운드 **1건**
(`quarterly-report.ts:54`, `sendDocument` + `InputFile`, fit 은 0건)이다. 1건 때문에 포트에
첨부 개념을 넣으면 모든 어댑터가 그것을 구현해야 한다. **1a 에서는 텔레그램 raw 호출로 그대로 둔다.**

**남는 것:** 아웃바운드 초크포인트 커버리지가 fin 15/16 이 된다(현재 14/16). `rsu.ts` 는 흡수,
`quarterly-report.ts` 는 예외로 남음. 예외가 1곳이라는 사실이 문서에 남는다.

### 4-5. 수신자 라우팅의 **도메인 축 재설계** — 1a 에서 자리만, 실제 재설계는 도메인 #3

현재 실측: fin 2등급(`ALLOWED`/`ADMIN`) · fit 1등급 · **도메인 축 양쪽 0**.
env 이름도 `TELEGRAM_` prefix 라 3도메인 공유 시 재설계가 따라온다.

1a 에서는 `Route` 타입에 (도메인 × 등급) 축을 **두되**, 값은 기존 env 를 그대로 읽는다.
이름 재설계와 도메인별 채널 분리는 도메인 #3 을 붙일 때. **자리를 만들어두는 비용은 타입 하나다.**

### 4-6. fit 관리자 alert 수신자 오발송 — 제외 (별건)

fin `advisor-monitor.ts:187-194` 주석이 명시적으로 금지한 동작을 fit `admin-alerts.ts:232` 가 하고 있다
(`sendToAll` → `TELEGRAM_ALLOWED_CHAT_IDS`, 가족 chat 포함). 1a 가 `Route` 개념을 만들면 **고칠 자리는
생기지만**, 고치는 것은 별개 결정이다 — 지금 받던 사람이 못 받게 되는 **관측 가능한 동작 변경**이고,
fit 에는 `TELEGRAM_ADMIN_CHAT_IDS` 가 아예 없어서(실측: X) env 신설이 따라온다. → §6 Q12.

---

## 5. 되돌리기 비용

> **소요 시간 열은 실측이 아니다.** 인용된 건수(호출 20 / 루프 22 / 모듈 14+5 등)에서 유도한
> 작업량 추정이다. 실제 값은 착수 후에만 안다. 등급과 "되돌리는 행위"가 이 표의 본체다.

### 5-1. 층위 옵션

| 옵션 | 되돌리기 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|
| L1 per-chat | **중간** | 패키지 import 를 로컬 함수로 재인라인. myFitness `SendResult` 집계를 `send.ts` 로 복원 | 되돌리기 1~2일 |
| L2 broadcast | **중간** | 재인라인 + **myFinance 루프 21곳·try/catch 21곳 복원** (git revert 로 가능, 단 그 사이 커밋과 충돌 시 수작업) | 되돌리기 2~3일 |
| **L3 2층 (권고)** | **중간** | L2 와 동일. 단 포트가 얇아 어댑터 쪽 revert 는 파일 단위로 깨끗 | 되돌리기 2~3일 |

세 옵션 모두 **데이터 무변경**이다. "사실상 불가"는 없다.

> **정정 (2026-09-03 감사 반영 · 주장 2-c).** 초안의 *"되돌리기는 **전부 코드 작업**"* 은 좁게 읽어야
> 한다. 세 옵션 모두 `@pleiades/notify` 를 **의존성**으로 넣으므로, 되돌리기 단위에
> `package.json`·`package-lock.json` 되돌림 + **`npm ci`** + 재빌드 + `pm2 restart` 가
> **실서비스 서버 2대에서** 따라붙는다. `file:` 을 택하면 **배포 스크립트 되돌림**까지 붙는다 (§5-2, Q15).

### 5-2. 1a 하위 항목

| # | 항목 | 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|---|
| **1a-0** | **패키지 배포 방식 확정**(`file:` / git 의존성 / 사설 레지스트리 — **Q15**) + pleiades `package.json` 신설 · 빌드 산출물 정의 · (필요 시) 원격 발행 | **중간** | 배포 스크립트 되돌림 + 서버측 체크아웃 정리 | **미측정** |
| 1a-1 | `@pleiades/notify` 패키지 신설 (포트+코어+Telegram 어댑터) | **즉시 — 단 1a-3 착수 전까지만** | 패키지 디렉터리 삭제. **"아직 아무도 안 씀"은 1a-3/1a-4 착수 전까지만 참이다** — 그 뒤엔 디렉터리 삭제가 양쪽 `npm ci` 를 깬다 | 반나절 + **미측정**(npm 스캐폴딩·`.d.ts`/exports map 빌드·발행) |
| 1a-2 | myFitness vitest 도입 (devDep 3 + config 15줄 + scripts 3줄) | **즉시** | **4파일 revert**(`package.json`·`package-lock.json`·`vitest.config.mts`·테스트) + **`npm ci`**. 코드 무영향 | 1시간 미만 |
| 1a-3 | myFitness `send.ts` → 패키지 교체, 호출 6건 | **중간** | `send.ts`(124줄) 복원 + import 6건 되돌림 | 되돌리기 반나절 |
| 1a-4 | myFinance 호출 20건 → 파사드, 루프 **21곳**·try/catch 21곳 제거 | **중간** | `git revert`. 충돌 시 21개 지점 수작업 복원. **+ 서버 2대 `npm ci`·재빌드·restart, 배포 스크립트를 고쳤다면 그것도 되돌림** | 되돌리기 1~2일 + **미측정**(배포분) |
| 1a-5 | `getAllowedChatIds` 4중 복제 제거 | **중간** | 1a-4 에 포함 (같은 revert) | — |
| 1a-6 | `rsu.ts` 키보드를 포트로 흡수 | **중간** | raw `bot.api.sendMessage` 복원 (5라인) | 되돌리기 1시간 |
| 1a-7 | fit 절단 → 분할 (Q10 이 "예"일 때만) | **즉시(코드)** / **불가(이미 나간 메시지)** | 코드는 상수·정책 1줄. **단 그 사이 사용자가 받은 분할 메시지는 되돌릴 수 없다** | 1시간 미만 |

**1a 전체 되돌리기 = `git revert`(`package.json`·`package-lock.json` 포함) + `npm ci` + 재빌드 +
`pm2 restart`, 실서비스 서버 2대.** DB 무변경, env 무변경, 사용자가 받는 채널 무변경.

> **정정 (2026-09-03 감사 반영 · 주장 2).** 초안은 이 줄을 *"`git revert` 2개 저장소 + 재빌드 +
> `pm2 restart`"* 로 쓰고 **"002 의 '재인라인 며칠'이 여기서 정확하다"** 고 결론했다.
> **002 의 서술은 코드 부분만 정확하고 의존성·배포 부분이 빠져 있다.** 빠진 것 넷:
>
> 1. **파일 수가 어디에도 없었다.** 초안은 호출 **건수**만 센다. 실제 union 은 myFinance **약 29파일**,
>    myFitness **약 13파일** — **실서비스 두 곳 합계 40여 파일**이다(`package.json`·`package-lock.json`·
>    `next.config.mjs`·`vitest.config.mts`·테스트 포함). "호출 20건"이 주는 인상과 다르다.
> 2. **`npm ci` 가 되돌리기 단위에 들어간다.** `@pleiades/notify` 가 **의존성**이고 배포 스크립트가
>    `npm ci`(`myFinance/deploy/deploy.sh:106`, myFitness 동일)이므로 **lockfile 이 배포 경로에 실린다.**
>    `npm ci` 는 lockfile 과 `package.json` 불일치 시 **실패**한다.
> 3. **`file:` 링크를 택하면 두 `deploy.sh` 에 pleiades 체크아웃·pull 단계 신설이 선결 조건이다.**
>    현재 두 스크립트는 **자기 저장소만** `git pull` 하고, `ecosystem.config.js` 의 `cwd` 는
>    `/home/nasty68/myFitness` 다. 그리고 **pleiades 에는 `package.json` 도 git 원격도 없다** →
>    1a-0 · **Q15**.
> 4. **Next 빌드 그래프에 들어간다.** myFinance 웹 라우트
>    (`app/api/alerts/history/[id]/retry/route.ts` → `alert-dispatcher` → `sendHtml`)가 초크포인트에
>    도달하므로, 패키지가 **TS 소스를 배포하면 양쪽 `next.config.mjs` 에 `transpilePackages` 추가**가
>    필요하고, **컴파일 JS 를 배포하면 설치 시점 빌드(패키지 선행 빌드 순서)** 가 생긴다.
>    현재 `next.config.mjs` 는 fin 이 `experimental.instrumentationHook` 뿐, fit 은 빈 객체다.
>    어느 쪽이든 **초안에 없던 비용**이다.
>
> 등급 자체(**중간**)는 바뀌지 않는다. 바뀐 것은 **되돌리기의 단위와 실행 장소**다 —
> 개발 머신의 `git revert` 가 아니라 **실서비스 서버 2대의 재설치·재빌드·재시작**이 포함된다.

### 5-3. 1b 하위 항목 — **DB 가 걸리면 코드 revert 로 안 끝난다**

| # | 항목 | 등급 | 되돌리는 행위 | 소요 (추정) |
|---|---|---|---|---|
| 1b-1a | `DiscordTransport` 신설 | **즉시** | 파일 삭제 | 1~2일 |
| 1b-1b | 라우트→채널 매핑을 Discord 로 전환 (텍스트 알림만) | **즉시(운영) · git 이력 밖** | **env 값 1개 + 재시작 4회** — 실서비스 서버 2대 × {web, bot}. `.env` 는 양쪽 gitignore(`:28`)라 **수동 서버 편집**이고 CI 가 검증하지 않는다. `scheduler.ts:40` 이 `chatIds` 를 부팅 시 캡처하므로 재시작 없이는 반영되지 않는다. 봇 재시작은 텔레그램 **409 위험** 동반. *(1a 가 매핑을 설정으로 뺐고, **`DiscordTransport` 가 이미 양쪽에 빌드·배포된 뒤**여야 성립 — §3-3 정정)* | 수 분 |
| 1b-1c | 2000자 분할 (fit 신규 도입, fin 상수 분리) | **즉시(코드)** / **불가(이미 나간 메시지)** | 상수·정책 revert | 반나절 |
| 1b-1d | HTML→Discord-md 역변환기 | **즉시** | Transport 직전 훅 제거 | 1~2일 |
| 1b-1e | 수신자 env 를 채널 중립 이름으로 | **즉시** | env 이름 복원 (양쪽 병행 기간 두면 무중단) | 반나절 |
| 1b-2a | interaction 엔드포인트 신설 (gateway 또는 HTTP) | **중간** | 엔드포인트 제거 + PM2/Nginx 설정 되돌림. **실서비스 라우팅 변경** | 수일 |
| 1b-2b | 인터랙션 2건 이식 (RSU 베스팅 · 훈련 자동조정) | **중간** | 코드 revert. **단 전환 중 발송돼 미응답 상태인 건은 어느 쪽에서도 못 받는다** | 수일 |
| 1b-2c | PDF 첨부 이식 (`quarterly-report.ts`) | **즉시** | raw `sendDocument` 복원 | 반나절 |
| **1b-2d** | **`WorkoutAdjustment` 채널 중립 컬럼** | **§ 아래** | **§ 아래** | — |

#### 1b-2d — DB 를 어떻게 다루느냐로 되돌리기 등급이 갈린다

`myFitness/prisma/schema.prisma:358-367` — `telegramMessageId String?` / `telegramChatId String?` /
`@@index([telegramMessageId])`, 마이그레이션 `20260716054043_workout_adjustment`
(migration.sql 의 컬럼 타입은 `TEXT` — **길이 제약·형식 검증·CHECK 없음**. FK 는 `workoutId` 뿐, 조인 없음).

> **정정 (2026-09-03 감사 반영 · 주장 1·4).** 초안은 이 절의 제약을 **인덱스**로 서술했다.
> `@@index([telegramMessageId])`(`:367`)는 **읽기 경로가 0건인 죽은 인덱스**다 — 매칭은
> `callback_data` 의 adjustment id 로 하고(`auto-adjust-callback.ts:231-238`), `telegramMessageId` 를
> 읽는 코드는 전 저장소에 없다. 따라서 인덱스는 **D-a/D-b 판단에 아무 제약을 주지 않는다.**
> 유일한 제약은 **컬럼 타입**(`String?` / `TEXT`)이고, 그것은 19자리 snowflake 문자열을 그대로 받는다.

| | **D-a · 컬럼 그대로 두고 Discord id 저장** | **D-b · 채널 중립 컬럼 추가 + 백필** |
|---|---|---|
| 스키마 변경 | **없음** (`String?` 이라 snowflake 가 그대로 들어감) | 컬럼 3개 추가(`notifyChannel`, `notifyMessageRef`, `notifyTargetRef`) + 인덱스 + 백필 + 구 컬럼 폐기 |
| 정직한가 | **아니오** — 컬럼 이름이 거짓이 된다. 한 컬럼에 telegram id 와 discord id 가 **섞인다** | 예 |
| 되돌리기 등급 | **즉시 (코드)** — 코드 revert + restart | **사실상 편도** |
| 되돌리는 행위 | 코드 revert. **DB 컬럼은 무해하다** — 매칭은 `callback_data` 의 adjustment id 로 하고(`auto-adjust-callback.ts:231-238`) `telegramMessageId` 는 **읽기 경로 0건**이다. 컬럼에 무엇이 들어 있든 매칭은 성공한다. 실제 잔여물은 **롤백 후 Discord 메시지의 버튼이 응답 대상을 잃는 것**이며, 이는 DB 가 아니라 인프라 문제이고 **D-a/D-b 선택과 무관한 1b-2a(인터랙션 엔드포인트) 문제**다. 노출은 **정적으로 상한이 있다** — 제안 하루 1회(`scheduler.ts:103`), TTL 8h 또는 KST 자정 중 이른 쪽(`auto-adjust-cron.ts:13`, `auto-adjust-callback.ts:19-25`), maintenance cron 이 자동 `expired` 마킹(`auto-adjust-cron.ts:123-136`), `processSnoozed`(`auto-adjust-cron.ts:88-107`)는 같은 row id 로 재전송하므로 자가 치유. → **최대 ~1건 · ≤8시간 · 자가 소멸** | 코드 revert 로 **끝나지 않는다.** 컬럼은 DB 에 남고, 신규 row 는 새 컬럼에만 값이 있어 **구 코드가 읽지 못한다.** 역방향 백필 마이그레이션을 따로 써야 한다 |
| 언제 정리하나 | 도메인 #3 / 단계 4 의 DB 결정(Q7)에 얹는다 | 지금 |

**권고: 1b 에서는 D-a.** 이유 — 컬럼 이름의 정직함은 **가역적인 부채**(나중에 rename)이지만,
D-b 의 마이그레이션은 **되돌리기 등급을 단계 1 전체에서 유일하게 "사실상 편도"로 올린다.**
그리고 채널 중립 컬럼 이름은 **Q7(도메인별 DB vs 단일 DB schema 분리)의 답에 종속**된다 —
Q7 이 미결인 채로 채널 중립 스키마를 확정하면 두 번 마이그레이션하게 된다.
**감사에서 D-a 의 잔여 리스크가 사실상 0 으로 확인돼 이 권고는 더 강해졌다** (↓ 정정, §7 Q12).

> **정정 (2026-09-03 감사 반영 · 주장 4).** 초안은 여기에 다음 인용 블록을 두고 있었다 —
> *"어느 쪽을 택하든 '코드 revert 로 끝난다'는 1b 에서 무조건 참이 아니다. D-a 조차 전환 기간에
> 발송된 미응답 조정 건이라는 데이터 흔적을 남긴다. 그 건수를 모르므로(§5-4) 롤백 창을 짧게 잡는 것이
> 유일한 완화책이다."* → **삭제했다.** 두 전제가 다 틀렸기 때문이다.
>
> 1. **미응답 건은 DB 매칭 문제가 아니다.** 매칭은 adjustment id 로 하므로 컬럼 내용과 무관하다.
>    실제 실패 모드는 *롤백 후 Discord 메시지의 버튼이 응답 대상을 잃는 것*이고, 이는 1b-2a 의
>    인터랙션 엔드포인트 문제로 **D-a/D-b 와 무관**하다.
> 2. **건수를 모르는 것이 아니다.** 실서비스 DB 조회 없이 **정적으로 상한이 나온다** —
>    제안 하루 1회 · TTL 8h/KST 자정 · cron 자동 `expired` 마킹 → **최대 ~1건, ≤8시간, 자가 소멸.**
>
> 따라서 **"롤백 창을 짧게 잡는다"는 완화책은 불필요**하다. D-a 의 잔여 리스크는 **사실상 0** 이다.
> 1b 에서 "코드 revert 로 안 끝나는" 항목은 **D-b 와 1b-2a(인프라) 둘뿐**이며, D-a 는 거기 속하지 않는다.

### 5-4. 미측정·미확인 값과, 그것이 막고 있는 결정

| 미측정 항목 | 왜 못 쟀나 | 무엇을 막고 있나 | 재려면 |
|---|---|---|---|
| 아웃바운드 알림의 실제 길이 분포 (평균/최대/2000 초과 비율) | 런타임 데이터. 실서비스 DB 접근이 읽기 전용 규율 밖 | **Q10** (fit 절단→분할) 과 1b-1c 의 실제 영향. 2000 초과가 드물면 분할 신규 도입 비용이 과잉, 흔하면 필수 | myFinance `alertHistory.message` 의 `length()` 분포 SQL (읽기 전용, 사용자 승인 필요). myFitness 는 대응 테이블이 없어 운영 로그 필요 |
| myFinance 22곳 루프 **본문이 전송 외에 무엇을 하는가** | 이번 측정은 루프 개수와 try/catch 비율만 확인 | **1a-4 청구서의 정확도.** 루프가 순수 전송이면 삭제, 집계·로깅·DB 쓰기가 섞여 있으면 각 지점 수작업 | 정적 측정 가능 — `repo-surveyor` 재호출로 22개 루프 본문 분류. **감사에서 대표 4곳 부분 수행**했고 나머지는 **1a 착수 직전 측정으로 충분**하다 (감사 판단) |
| 실제 수신자 chat id 개수 | `.env` 값 열람 금지 | `BroadcastResult` 의 실제 N. 성능·rate limit 설계 | 사용자에게 개수만 질의 |
| Discord 측 제한값 (2000자, embed 필드 한도, rate limit) | 대상 저장소에 Discord 코드 0줄 — 저장소 실측 대상 아님 | 1b-1c 설계 | 문서값. 1b 착수 시 확인 |
| 전환 회귀 baseline | myFitness 테스트 0개 | 1b 안전성 | **1a-2 가 이걸 만든다** — 분할의 또 다른 근거 |
| **myFitness 에서 vitest 3종 devDep 이 충돌 없이 resolve 되는가** (**미확인**) | `npm install`·`npm ci` 실행이 읽기 전용 규율 밖 | **1a-2 의 성립 여부.** fit 트리는 eslint 9 / eslint-config-next 16 / prisma 6.19.3 으로 fin(eslint 8 / 15 / prisma 6.19.2)과 **다르다** — fin 에서 되는 것이 fit 에서 된다는 보장이 없다 | `dual-repo-operator` 가 myFitness 에서 `npm install --dry-run --package-lock-only vitest@^4.1.8 @vitest/coverage-v8@^4.1.8 vite-tsconfig-paths@^6.1.1` **1회**. 파일 무변경 |
| myFitness 테스트 파일이 `eslint src/ --max-warnings 0` 게이트를 통과하는가 (**미확인**) | lint 실행이 필요 | 1a-2 완료 판정 | 테스트 파일 작성 후 `npm run lint` 1회 (`eslint.config.mjs` 의 `ignores` 는 `src/generated/**` 뿐이라 `__tests__` 가 검사 대상) |

> **정정 (2026-09-03 감사 반영 · 주장 4).** 미측정 항목에서 *"`WorkoutAdjustment` 중
> `telegramMessageId` non-null & pending 인 row 수"* 행을 **삭제했다.** 실서비스 DB 조회 없이
> **정적으로 상한이 유도되기 때문**이다(§5-3 정정). 이로써 실서비스 DB 읽기(**Q14**)를 정당화하던
> 근거 **2건 중 1건이 사라졌다.** 남은 것은 알림 길이 분포뿐이고 그것은 **Q10 하나만** 막는다
> → **Q14 우선순위 중간 → 낮음.**

> **추가 (2026-09-03 감사 반영 · 주장 5).** 이 표에 **미확인** 2건을 새로 넣었다. 둘 다 "재지 못한 값"이
> 아니라 **"실행하지 않아서 모르는 값"** 이다 — 읽기 전용 규율상 `npm install`·`npm run lint` 를
> 돌리지 않았다. 첫 번째(**의존성 resolve**)가 해소되기 전에는 **1a-2 가 성립하는지 알 수 없다.**

---

## 6. 테스트 전제 (Q4)

002 가 Q4 를 "붙인다"로 확정했다. 실측이 말하는 **설정 면의** 진입 비용은 작다.
단 fit 쪽에만 붙는 게이트가 셋 있다 (7·8·9번, 감사 반영).

| # | 항목 | 실측 |
|---|---|---|
| 1 | devDependency **3개** — `vitest@^4.1.8`, `@vitest/coverage-v8@^4.1.8`, `vite-tsconfig-paths@^6.1.1` | myFinance 값 그대로 |
| 2 | `vitest.config.mts` 루트 신규 **15줄** (coverage `include` 만 도메인에 맞게) | myFinance 전문이 참조 구현 |
| 3 | scripts **3줄** — `test`, `test:run`, `test:coverage` | 동일 |
| 4 | setup 파일 | **불필요** (myFinance 도 `setupFiles` 미지정) |
| 5 | tsconfig 조정 | **불필요** (양쪽 `paths: {"@/*": ["./src/*"]}` 동일, `vite-tsconfig-paths` 가 해석. 차이는 `jsx` 와 `include` 1줄뿐) |
| 6 | **`npm ci`** (실서비스 서버) — 배포 스크립트가 `npm ci` 이므로 **lockfile 이 배포 경로에 실린다** | **쓰기 → `dual-repo-operator` 소관** |
| 7 | myFitness 는 `typecheck: tsc --noEmit` 보유 (**fin 에는 없음**), `tsconfig.include` 가 `**/*.ts` | 새 테스트 파일이 **fit 에서만** `tsc --noEmit` 검사 대상이 된다. **비대칭 제약** — 같은 패키지 테스트를 양쪽이 다르게 취급 |
| 8 | myFitness lint = `eslint src/ --max-warnings 0` (eslint 9 / eslint-config-next 16), `eslint.config.mjs` 의 `ignores` 는 `src/generated/**` 뿐 | 테스트 파일이 **zero-warning 게이트**를 통과해야 한다. fin 은 `next lint`(eslint 8 / 15)라 기준이 다르다. 통과 여부 **미확인** — lint 실행 필요 |
| 9 | **의존성 resolve 가능 여부** (fit 트리: eslint 9 / config-next 16 / prisma 6.19.3) | **미확인** — install 금지. `npm install --dry-run --package-lock-only vitest@^4.1.8 @vitest/coverage-v8@^4.1.8 vite-tsconfig-paths@^6.1.1` 1회 필요 (`dual-repo-operator`) |

> **정정 (2026-09-03 감사 반영 · 주장 5).** 1~5번은 감사에서 **전부 확인**됐다 — 특히
> **42/42 테스트가 `vitest` 를 명시 import** 하므로 `globals: true` 도 `types: ["vitest/globals"]` 도
> 불필요하다는 것이 확인됐다(4·5번). 그러나 **"진입 비용이 작다"는 결론은 절반만 유지된다**:
> 6번이 `npm install` 이 아니라 **`npm ci`** 이고(따라서 §5-2 1a-2 의 되돌리기가 4파일 + `npm ci` 다),
> **7·8·9번이 초안에 아예 없었다.** 9번이 해소되기 전에는 **1a-2 가 성립하는지 알 수 없다** — §5-4.

현재 격차: myFinance **42 테스트파일 / 786 `it()` / 7,572 LOC**, myFitness **0 / 0 / 0** (218 src 파일).
**범위는 `@pleiades/notify` 코드로만 한정한다.** myFitness 전체에 테스트를 붙이는 프로젝트가 아니다.

### 6-1. 설계 제약 — 이건 협상 대상이 아니다

참고 구현 `myFinance/src/bot/notifications/__tests__/alert-dispatcher.test.ts` (332줄) 의 주석이
남긴 제약을 그대로 인용한다:

> `'../index' (getBot) 는 모듈 로드시 모든 command register 를 chain-import 하므로
> env 미설정 테스트에서 crash 방지 위해 mock 필수`

→ **`@pleiades/notify` 는 `src/bot/index.ts` 를 참조하지 않는다.** `Bot` 인스턴스를 스스로 얻지 않고
`Transport` 를 **주입**받는다. 이 제약을 어기면 패키지 테스트마다 봇 전체 그래프를 mock 해야 하고,
패키지가 grammY 뿐 아니라 **각 저장소의 명령 그래프에 결합**된다 — 추출한 의미가 사라진다.

이 제약이 §2-3 의 포트 형태를 사실상 확정한다: `Transport` 는 **인터페이스**여야 하고,
`Bot` 은 `TelegramTransport` 생성자 인자로만 등장한다.

> **추가 (2026-09-03 감사 반영 · 감사 E6).** **같은 제약이 웹 프로세스 쪽에도 있다.**
> `lib/ai/advisor-monitor.ts:216-217` 은 `await import('@/bot')` / `await import('@/bot/utils/telegram')`
> 으로 **동적 import** 를 쓴다 — 주석(`:213-214`)이 밝히듯 **웹/봇 순환참조 회피**가 목적이다.
> `TelegramTransport` 는 `getBot()` 을 필요로 하므로 이 동적 import 는 **주입 지점에 그대로 남아야 한다.**
> 따라서 포트 형태에 두 번째 제약이 붙는다: 패키지는 `Bot` 을 **정적으로 참조해선 안 되고**,
> `TelegramTransport` 의 **생성이 지연 가능**해야 한다(팩토리 또는 lazy provider).
> `getBot()` 호출 19곳 중 `src/bot` 밖은 이 1곳뿐(`advisor-monitor.ts:218`)이므로 범위는 좁다.

### 6-2. 1a 에서 실제로 쓸 테스트 (범위)

| 대상 | 왜 |
|---|---|
| 재시도 백오프 — 네트워크 오류 4회 시도, `[2000,8000,30000]`ms | 양쪽 동일 로직이므로 통합 시 회귀 확인이 유일한 안전망 |
| 파싱 실패 폴백 + **예산 보존**(`attempt--`) | fit 만 있던 동작. 통합 시 유실되기 쉬움 |
| 길이 초과 — **분할** (fin) vs 절단 (fit) | 발견 11. Q10 의 답을 테스트가 고정한다 |
| `BroadcastResult` — `sent`/`failed`/`total`/`first` | 발견 9. 소비 지점 5곳 + DB 2곳의 계약 |
| 키보드 전송이 재시도·폴백을 **받는가** | 발견 G 가 재발하지 않는다는 증명 |
| `sanitizeError` 마스킹 | 정본을 fin(이중 보호)으로 고른 것의 회귀 |

---

## 7. 남은 미결 질문

> **감사 반영 (2026-09-03).** 질문 **Q15 를 신설**(감사 요청, Q8/Q9 와 동급 최상)하고,
> **Q14 우선순위를 중간 → 낮음** 으로 내렸으며, **Q12 의 판돈이 줄었다**는 것을 반영했다.
> 그 밖에 **Q8 · Q10 · Q11 · Q12 에 감사 반영 각주**를 달았다 (근거 문면만 바뀌고 답은 그대로다).
> Q9 · Q13 은 초안 그대로다.

| | 질문 | 무엇을 가르는가 | 우선 | 002 연결 |
|---|---|---|---|---|
| **Q15** | **패키지 배포 방식** — `file:` 링크 / git 의존성 / 사설 레지스트리 (**감사 요청 신설**) | 셋을 가른다: ① **1a 의 되돌리기 비용을 확정할 수 있는가** (§5-2 의 1a-0·1a-1·1a-4 등급이 여기 종속), ② **두 저장소의 `deploy.sh` 를 고쳐야 하는가** (`file:` 이면 pleiades 체크아웃·pull 단계 신설이 선결), ③ **pleiades 를 원격에 발행해야 하는가**. 현재 pleiades 에는 **`package.json` 도 git 원격도 없어 세 방식 중 어느 것도 아직 성립하지 않는다** (감사 E1). 비교표 §7-1 | **최상 — Q8 보다 먼저.** 답이 나오기 전에는 §5-2 의 1a 되돌리기 등급이 **확정되지 않는다** | 002 "되돌리기 비용 순으로 진행" 원칙의 전제 |
| **Q8** | 정본 층위 — L1 / L2 / **L3(권고)** | myFinance 청구서 전체. L1 이면 루프 22곳·try/catch 21곳·`getAllowedChatIds` 4중 복제가 **남고 코드 드리프트 정지 목적이 미달**(§3-2 정정). L2/L3 면 20건 호출 수정이 들어옴 | **최상** — 이게 정해져야 1a 가 시작된다 | — |
| **Q9** | 단계 1 을 1a / 1b 로 쪼개나 (본 문서 권고: **쪼갠다**) | 쪼개면 되돌리기가 "코드 revert"에서 멈추는 지점이 생긴다. 안 쪼개면 DB·인프라·콘텐츠 모델이 한 덩어리로 묶여 부분 롤백 불가 | **최상** | 002 단계 1 정의 |
| **Q10** | myFitness 아웃바운드 **절단 → 분할**을 1a 에서 받나 | 받으면 지금 버려지던 4096 초과분이 살아나고 **사용자에게 메시지 수가 늘어난다**(관측 가능한 동작 변경). 안 받으면 1a 가 무동작-변경으로 깨끗하지만 손실이 지속. **감사 반영:** §2-4 의 **plain 폴백 정본 선택**(`telegram.ts:69` vs `markdown.ts:96-103`)도 어느 쪽을 골라도 한쪽 저장소의 출력이 바뀌는 **같은 성격의 동작 변경**이므로 함께 답해야 한다 | 높음 | — |
| **Q11** | 텔레그램·Discord **혼합 운영**을 허용하나 | 허용하면 1b-1 되돌리기가 **env 플립**으로 유지되고 인터랙션 2건·PDF 를 텔레그램에 남길 수 있다. 전량 컷오버면 1b-2(신규 interaction 인프라)가 **1b 진입 조건**이 된다. **감사 반영:** 혼합 운영은 §4-1 의 역변환기 위치(Transport 직전)를 강제하는 **진짜 근거**이기도 하다 — 같은 `Content` 가 두 채널로 동시에 fan-out 되기 때문 | 높음 — 1a 설계에 영향 (라우트→채널 매핑을 설정으로 뺄지) | 002 "채널 되돌리기는 env 한 줄" — **이 인용은 §3-3 정정으로 단가가 바뀌었다: "env 값 1개 + 재시작 4회, git 이력 밖", 그리고 DiscordTransport 선행 배포 후에만 성립** |
| **Q12** | 1b-2d 의 DB 처리 — **D-a(컬럼 그대로, 권고)** / D-b(중립 컬럼 + 백필) | **판돈이 줄었다 (감사 반영).** 초안은 D-a 에 *"미측정 건수만큼의 잔여 리스크"* 를 달아두고 그것과 D-b 의 편도성을 저울질했다. 감사가 **D-a 의 잔여 리스크를 사실상 0 으로 확인**했다(죽은 인덱스 · 매칭은 adjustment id · 노출 최대 ~1건·≤8시간·자가 소멸, §5-3 정정). 따라서 이 질문은 **"D-a" 로 사실상 결론난 상태에 가깝고**, 남은 것은 *D-b 를 굳이 택할 이유가 있는가* 뿐이다. D-b 는 여전히 단계 1 전체에서 **유일하게 되돌리기가 "사실상 편도"** 이고, 중립 컬럼 이름은 **Q7 의 답에 종속**된다 | 중간 (1b-2 착수 전) · **판돈 축소** | **Q7 직결** |
| **Q13** | fit 관리자 alert 수신자 분리(`admin-alerts.ts:232` → 신설 `ADMIN` 그룹)를 언제 고치나 | 고치면 지금 받던 사람이 못 받게 된다(동작 변경) + fit 에 없는 env 신설. 1a 가 `Route` 를 만들면 자리는 생김. 안 고치면 fin 주석이 명시적으로 금지한 동작이 계속됨 | 중간 | — |
| **Q14** | 실서비스 DB **읽기 전용 조회**를 허용하나 | §5-4 의 미측정 **1건**(알림 길이 분포)이 풀린다. **Q10 하나만** 막는다. 불허면 Q10 은 근거 없이 내려야 한다. **감사 반영:** 초안은 미측정 2건을 근거로 들었으나 그중 `WorkoutAdjustment` pending row 수는 **정적으로 상한이 유도돼 삭제**됐다 — 정당화 절반이 사라졌다 | **낮음** (중간 → 하향, 감사 요청) | — |

### 7-1. Q15 — 패키지 배포 방식 비교 (감사 요청으로 신설)

**먼저 사실 하나.** 현재 `git -C ~/workspace/pleiades remote -v` 는 **출력이 없고**,
`~/workspace/pleiades/package.json` 도 **없다** (감사 E1). 즉 **세 방식 중 어느 것도 지금은
성립하지 않는다.** Q15 의 답이 무엇이든 **1a-0(패키지 스캐폴딩 + 발행 경로 확보)이 선행 작업으로
신설**된다 — 초안 §5-2 에는 이 항목이 아예 없었다.

| | **A · `file:` 링크** | **B · git 의존성** | **C · 사설 레지스트리** |
|---|---|---|---|
| 형태 | `"@pleiades/notify": "file:../pleiades/packages/notify"` | `"@pleiades/notify": "git+ssh://…#<tag>"` | `"@pleiades/notify": "^0.1.0"` + `.npmrc` |
| **공통 선결 조건** | pleiades 에 `package.json` 신설 + 패키지 빌드 산출물(`exports` · `.d.ts`) 정의 — **현재 둘 다 없음** | 좌동 | 좌동 |
| **추가 선결 조건** | **실서비스 서버 2대에 pleiades 체크아웃** + **두 `deploy.sh` 에 pleiades pull 단계 신설** (현재 두 스크립트는 **자기 저장소만** `git pull`, `ecosystem.config.js` `cwd` 는 `/home/nasty68/myFitness`) | **pleiades git 원격 발행** + 서버 2대의 **접근 자격**(deploy key/토큰) + TS 배포 시 `prepare` 빌드 스크립트 | 레지스트리 호스팅 + 서버 2대 **인증 토큰 배포** + 버전 발행 절차 |
| **`npm ci` 와의 관계** | lockfile 이 **로컬 경로**를 핀한다 → 서버에 그 경로가 없으면 **`npm ci` 실패** | lockfile 이 **커밋 해시**를 핀한다 → 원격 접근 실패 시 `npm ci` 실패 | 일반 의존성과 동일 |
| Next 빌드 (세 방식 공통) | TS 배포면 양쪽 `next.config.mjs` 에 `transpilePackages`, JS 배포면 설치 시 패키지 **선행 빌드** | 좌동 | 좌동 |
| 버전 드리프트(§3-2 정정) | 경로 링크라 **핀이 약하다** — 서버 체크아웃 시점이 곧 버전 | 커밋 해시 핀 — 명시적. 저장소 2곳에 PR 1개씩 | semver 핀 — 가장 명시적 |
| **되돌리는 행위** | `package.json`·lockfile revert + `npm ci` + **두 `deploy.sh` 의 pull 단계 제거** + **서버 2대 체크아웃 정리** | `package.json`·lockfile revert + `npm ci` (원격 저장소는 남겨도 무해) | `package.json`·lockfile revert + `npm ci` (발행된 버전은 남지만 무해) |
| **되돌리기 등급** | **중간** — 되돌릴 대상이 **코드 밖**(배포 스크립트 + 서버 파일시스템)으로 새어 나간다 | **중간** — `package.json` + lockfile 안에 갇힌다 | **중간** — `package.json` + lockfile 안에 갇힌다 |
| 소요 | **미측정** | **미측정** | **미측정** |

> **되돌리기 관점의 관찰 (권고 아님).** A(`file:`)는 진입 시 코드 변경이 가장 적어 보이지만
> **되돌릴 대상이 코드 밖으로 새어 나간다** — 배포 스크립트와 서버 파일시스템 상태가 얽힌다.
> B/C 는 진입 비용이 더 크지만 되돌리기가 **`package.json` + lockfile 안에 갇힌다.**
> 이 저장소의 원칙(되돌리기 비용 순)으로 읽으면 **A 는 가장 싸 보이지만 가장 덜 가역적**이다.
> 다만 세 방식의 실제 소요는 **전부 미측정**이므로 **권고를 내지 않고 질문으로 남긴다.**
> 측정하려면 `dual-repo-operator` 가 서버 2대의 배포 파이프라인을 확인해야 한다.

### 7-2. Q7 과의 관계

002 Q7 — *"도메인별 DB 인가, 단일 DB schema 분리인가"* — 은 002 에서 "단계 4 선행, 우선 중간"이었다.
**Q12 가 그것을 앞당긴다.** `WorkoutAdjustment` 의 채널 중립 컬럼을 지금 만들면 그 이름과 위치가
Q7 의 답을 부분적으로 선점한다. 본 문서가 D-a 를 권고하는 두 번째 이유가 이것이다 —
**Q7 이 미결인 동안 DB 스키마를 건드리지 않으면, 단계 1 은 Q7 과 독립을 유지한다.**

---

## 8. 유효기간

이 초안은 **감사 1회를 반영했다.** 정본화(`docs/specs/003-*.md`) 여부는 오케스트레이터 판단이다.
정본화된 후에는 다음 시점에 다시 연다:

- **Q15 에 답이 나올 때** — §5-2 의 1a-0/1a-1/1a-4 등급과 §7-1 비교표가 확정된다.
  **Q8 보다 먼저 열린다.**
- **§5-4 의 미확인 2건이 해소될 때** — vitest 의존성 resolve(`--dry-run`) 결과가 나오면
  §6 표 9번과 1a-2 의 성립 여부가 확정된다

- **Q8·Q9 에 답이 나올 때** — §2·§3 의 권고가 채택/기각되면 §5 의 표가 확정된다
- **1a 착수 직전** — §5-4 의 "myFinance 22곳 루프 본문 분류"는 정적 측정이 가능하므로,
  착수 전 `repo-surveyor` 재호출로 1a-4 청구서를 확정한다
- **1b 착수 직전** — Discord 측 제한값(2000자·rate limit·embed 한도)이 그때 확인 대상이 된다.
  이 문서의 "2000" 은 저장소 실측이 아니다

---

## 9. 감사 반영 이력

감사 보고서 `_workspace/03_auditor_notify.md` (2026-09-03, `reversibility-auditor`).
판정 **확인 2 / 정정 4 / 미확인 1** + 추가 발견 E1~E7.
**개정본을 새로 발행하지 않고 이 파일을 직접 고쳤다** — 감사 판단이 "부분 수정으로 충분"이었고,
정정이 §5 의 되돌리기 표와 §4-1·§6 의 근거 문장에 국한되기 때문이다.
**지운 기술은 없다.** 틀린 서술은 정정 블록 안에 원문을 인용한 채로 남겼다.

### 9-1. 정정 4건이 어느 절을 어떻게 바꿨나

| 감사 항목 | 판정 | 고친 절 | 무엇이 어떻게 바뀌었나 |
|---|---|---|---|
| **주장 1** — 1a 는 DB 마이그레이션이 없다 | **확인** (근거 1건 정정) | 발견 9 · §2-3 · §5-3 도입부 | 근거를 **"DB 인덱스"** → **"`String?` 컬럼 영속화"** 로 교체. `@@index([telegramMessageId])` 는 **읽기 경로 0건인 죽은 인덱스**임을 세 곳에 명시. 발견 9 의 소비 지점에서 "인덱스 1개"를 삭제. **결론(불투명 `MessageRef = string`, DB 무변경)은 유지** |
| **주장 2-a** — 파일 수가 없다 | 정정 | §5-2 정정 블록 | 호출 건수만 세던 것을 **union 파일 수**로 보강 — fin 약 29파일 / fit 약 13파일 / **합계 40여 파일** |
| **주장 2-b** — `error.ts` 흡수가 §4-3 을 깬다 | 정정 | §4-3 · §3-2 표 | "인바운드 **변경 없음**" → **"변경 없음 — 단 하나 예외"**. 인바운드 6곳 파일 명시 + `export *` shim 완화책 + **결정 사항으로 승격** |
| **주장 2-c** — 배포 파이프라인을 건드린다 | 정정 | §5-1 · §5-2 표·요약 | `npm install` → **`npm ci`**, 되돌리기 단위에 lockfile·재빌드·`pm2 restart` **× 서버 2대** 추가. **1a-0 행 신설**. "002 의 재인라인 며칠이 정확하다" → **"코드 부분만 정확, 의존성·배포가 빠졌다"** |
| **주장 2-d** — Next 빌드 그래프 / `transpilePackages` | 정정 | §5-2 정정 블록 4항 | TS 배포 시 양쪽 `next.config.mjs` 수정, JS 배포 시 선행 빌드 순서 — **초안에 없던 비용**으로 추가 |
| **주장 2-e** — 루프 22곳이 다 없어지지 않는다 | 정정 | §2-1 표 · §3-2 표 · §5-1 · §5-2 1a-4 | **22곳 → 21곳**. `quarterly-report.ts:52`(sendDocument 루프)와 `sendQuarterlyReport(chatIds: number[])` 가 §4-4 로 인해 남는다는 사실 병기 |
| **주장 2-f** — `getAllowedChatIds` 는 가드로도 쓰인다 | 정정 | §2-3 인터페이스 · §2-1 표 · §3-2 표 | `Notifier` 에 **`targetCount(route): number` 추가**. `scheduler.ts:41`·`lib/cron.ts:96` 의 `length===0` 가드를 파사드가 대신 제공해야 "4 → 0" 이 성립함을 명시 |
| **주장 2-g** — 드리프트 정지가 아니라 이전 | 정정 | §3-2 목적 · "여기서 멈추면" | **"드리프트 정지" → "코드 드리프트 정지 + 버전 드리프트로 이전"**. lockfile 2개 · 핀 2개 · **PR 2개** 구조를 명시. L1 기각 근거는 유지 |
| **주장 3** — 채널 되돌리기는 env 한 줄 | **정정** | §3-3 표·인용 블록 · §5-3 1b-1b · §7 Q11 맥락 | **"env 한 줄" → "env 값 1개 + 재시작 4회, 수 분, git 이력 밖"**. 셋을 추가: ① `.env` 가 양쪽 gitignore(`:28`) → **git 이력 밖 수동 서버 편집, 추적성이 1a 보다 나쁨**, ② `scheduler.ts:40` 의 클로저 캡처 → **서버 2대 × {web, bot} 재시작 4회 + 409 위험**, ③ **`build:bot` 의 `--external:` 하드코딩** → env 플립은 **DiscordTransport 선행 배포 후에만** 성립. 등급은 여전히 1b 최저 |
| **주장 4** — D-a 는 마이그레이션이 아니다 | **확인** (근거 2건 정정) | §5-3 도입부·D-a 칸·말미 블록 **삭제** · §5-4 행 **삭제** · §7 Q12·Q14 | "Discord id 로 저장된 pending 건이 매칭되지 않는다" → **틀림**(매칭은 adjustment id). "건수 미측정" → **틀림**(정적 상한 **최대 ~1건 · ≤8시간 · 자가 소멸**). 말미 인용 블록("롤백 창을 짧게"가 유일한 완화책) **삭제**, §5-4 의 pending row 수 행 **삭제**. **Q14 우선순위 중간 → 낮음**, **Q12 판돈 축소** |
| **주장 5** — vitest 진입 비용 | 정정(경미) + **미확인 1** | §6 도입부·표(6번 수정, **7·8·9번 신설**) · §5-2 1a-2 · §5-4 | 6번 `npm install` → **`npm ci`**. 1a-2 되돌리기 **3파일 → 4파일 + `npm ci`**. fit 전용 게이트 3건 추가: **`tsc --noEmit` 비대칭**, **`--max-warnings 0` 게이트(미확인)**, **의존성 resolve(미확인)**. 1~5번은 확인 |
| **주장 6** — 역변환기는 Transport 직전 | **정정** (결론 유지) | §4-1 "대신 무엇을 하나"·"대가" 전체 교체 · §2-2(b) 단서 · §2-4 표 행 신설 | (A) *"역방향이므로 정본 참조가 이미 있다"* → **"부분 참조. 대칭 역함수가 아니다"** + 사용자 입력 **서식 주입** 위험 + `convertTables` **복원 불가**. (B) **plain 폴백이 이미 둘로 갈라져 있다**는 행을 §2-4 합집합 표에 신설. (C) **§2-2(b) 의 "길이 분할도 채널 무관"이 거짓이 됨** — 분할은 변환 뒤여야 한다. **결론(Transport 직전)은 유지, 근거만 교체** |

### 9-2. 추가 발견 E1~E7 반영

| # | 항목 | 반영 위치 |
|---|---|---|
| **E1** | pleiades 에 **`package.json` 도 git 원격도 없다** | §5-2 **1a-0 신설** + 1a-1 등급 단서("1a-3 착수 전까지만 즉시") · §3-2 표 · **§7 Q15** · §7-1 |
| **E2** | 양쪽 배포가 `npm ci` | §5-1 · §5-2 · §6 표 6번 |
| **E3** | 빌드 순서 의존 / `transpilePackages` | §5-2 정정 블록 4항 · §7-1 표 |
| **E4** | `build:bot` `--external:` 하드코딩 | §3-3 정정 3항 · §5-3 1b-1b |
| **E5** | 버전 드리프트 재발 구조 | §3-2 정정(주장 2-g) · §7-1 표 |
| **E6** | `advisor-monitor` **동적 import** + **5번째 chatId 파싱 지점** | §6-1 추가 블록(포트에 **지연 생성 가능** 제약) · 발견 8 정정(파싱 지점 **4 → 5**) · §3-2 표 |
| **E7** | fit `escapeHtml` 2중 정의 중 하나는 **인바운드도 쓴다** | §4-2 표 — "자동 해소" → **"발췌. 중복 2 → 1 이지 0 이 아니다"** |

### 9-3. 반영하지 않은 것 · 남은 것

- **`01_surveyor_transport.md` §1-3 의 행번호 오차(−1)** 는 **고치지 않았다.** 그 파일은 `repo-surveyor`
  산출물이다. 이 문서(발견 8)에서만 13/14/21/29 로 정정하고, 원 출처에 오차가 남아 있음을 명시했다.
- **미확인 2건**은 해소하지 않았다 — `npm install --dry-run` 과 `npm run lint` 는 대상 저장소 실행이고
  이번 작업은 **읽기조차 하지 않는** 규율이었다. §5-4 · §6 표 9번에 **"미확인"으로 표기**하고
  확인 방법(`dual-repo-operator` 위임)을 적었다.
- **로드맵 단계 순서 변경 없음.** 구조적 결론 3개는 전부 유지된다:
  **L3(2층) 권고** — 근거 (b) 만 길이 분할에 대해 축소, (a)·(c) 로 유지 ·
  **1a / 1b 분할** — 정정 4건이 전부 이 분할을 강화한다(1a 가 더 비싸지고, 1b-2d 롤백이 더 싸진다) ·
  **1a → 1b 순서 강제** — §3-1 (b)·(c) 의 논거는 감사에서 건드려지지 않았다.
