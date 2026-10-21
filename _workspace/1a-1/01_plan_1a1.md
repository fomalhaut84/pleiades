# 1a-1 구현 계획 — `@pleiades/notify` 포트 · 코어 · `TelegramTransport` · 패키지 테스트

작성 2026-09-10 · 오케스트레이터 직접 실측(Phase 1) · **2회차** — 착수 직전 재감사(`03_auditor_1a1plan.md` · 정정 13건 · 블로커 1) 반영
입력: 003 §1-4(요구사항 2) · §3-1(기능 정본) · §4-2(2026-09-09 재작성 시그니처) · §4-3(제약 3) · §4-4(Route) · §5-1·§5-2(범위·단계) ·
measured-facts `#32 I1`(2026-09-09) · `C-1~C-7` · `M1`(git 의존성 `prepare`) · 두 저장소 원문(아래 §0) · 감사 실측(`03_auditor_1a1plan.md` §1·§2·§5·§6).

> **이 단계가 건드리는 것은 pleiades 저장소뿐이다.** `repos/*`·원본 `~/workspace/myF*` 쓰기 0. 서버·DB·텔레그램 무접촉.
> 되돌리기 **즉시** — `packages/notify/src` 를 1a-0 상태로 revert (1a-3 착수 전까지 · 003 §5-2 · 감사 §7 확인).

## 0-1. 2회차에서 무엇이 바뀌었나 (감사 §10 번호)

| 감사 # | 반영 | 어디 |
|---|---|---|
| **1 (블로커)** | `TelegramApi.sendMessage` 의 `other.parse_mode` 를 `'HTML'` → **`string`** (V1 · fin 1.44.0 · fit 1.42.0 양쪽 통과). **메서드 단축 문법 유지** — 프로퍼티(화살표) 문법이면 양변성이 사라져 V8 로 실패 | §2 |
| **2** | **grammy 대입 프로브**를 E6 에 추가 — `repos/*/node_modules/grammy` 를 `paths` 로 참조하는 스크래치패드 `tsc` · 두 버전 · 결과는 measured-facts | §4 E6 · §5 |
| 3 · 4 | S-2 문안 교체(*"`import type` 으로도 불가"* → *"선언 없이 참조하면 깨진다"*) · `build-config.test.ts` 전제 부정 **삭제** · D-3 대안 둘(devDep · peerDep) + 실측 비용표 + ERESOLVE 위험 | §0 S-2 · §8 D-3 |
| 5 | 포트 계약 명문화: **`maxLength` 유한 → 코어가 분할·재시도·폴백 소유 / `Infinity` → 어댑터 소유, 코어는 그 `send` 를 재시도하지 않는다. 섞을 수 없다** | §0 S-3 · §2 |
| 6 | 분할 행 근거 교체 — `telegramMessageId` 쓰기 2 · **읽기 0**(발견 9 정정). 결론(마지막 청크) 유지 | §2 표 |
| 7 | `csvEnv(name, { numericOnly? })` — fin 의 `.map(Number).filter(!isNaN)` 탈락 규칙을 **옵션으로 보존**(호출부가 고른다 · 기본은 문자열 유지 = fit). `total` 의미 변화 경로 차단. env 실값 **미확인** 명시 | §1 · §2 표 |
| 8 | fin 폴백 트리거 축소(400 전체 → `isHtmlParseError`)를 **빈도 미측정 관측 변경 후보 1건**으로 명시. 003 §5-2 정정 ① 에 3번째 행으로 역반영(E5b) | §2 표 · §4 E5b |
| 9 | `escapeHtml` **흡수** — `src/escape.ts`(fin·fit 구현 동일 · 함수 1 + 테스트 1). 003 §5-1·§7-2 의 발췌 약속 이행 | §1 · §4 E2 |
| 10 | `error.ts` shim 결정을 **1a-3·1a-4 착수 시 결정**으로 §7 에 이월 명시 | §7 |
| 11 | **`Route → Transport` 매핑을 설정에 넣는다** — `NotifierConfig.transport` 가 단일 또는 `Partial<Record<Route, …>>`. 003 §1-4 요구사항 1 은 **이미 확정된 정본 요구사항**이라 새 결정이 아니다 — 안 넣으면 1b 되돌리기가 즉시 → 중간으로 오른다. 포트 무변경 · 소비자 0 · 되돌리기 즉시 | §2 · §3 · §6 |
| 12 | §6 보강 — `@types/node` 단서 · `workflow.md` 8절 1줄 · lockfile −18 | §6 |
| 13 | E6 문안 — 소비자 `package.json` **키를 `@pleiades/notify`** 로 선언(이름 없는 `npm install <url>` 은 `node_modules/pleiades` 로 들어가 실패 · 실측) | §4 E6 |
| 14 · 15 | 003 역반영 2건(`Content` 정의 · fin 트리거 축소 후보)을 **같은 PR 의 E5b** 로 — `decision-writer` 가 정정 블록 append | §4 E5b |
| 경미 | §0 표 `src/index.ts` 1줄 → **2줄**(주석 1 + export 1) | §0 |

## 0. 실측 (2026-09-10 · worktree `integration/pleiades` · fin `6542152` · fit `2195854` · 둘 다 clean · 감사 §9 전항 일치)

| 항목 | 값 | 출처 |
|---|---|---|
| `packages/notify` 현재 | `src/index.ts`(주석 1 + `VERSION` export 1 = 2줄) · 테스트 2(`index.test.ts` 스모크 · `build-config.test.ts` M1·M2 안전 조건) · `tsconfig.json` `exclude` 4패턴 · devDep `vitest ^4.1.8` 만 · vitest config 없음 | `find packages -type f` |
| 루트 스크립트 | `prepare`=`build`=`tsc -p packages/notify` · `typecheck` · `test`(=`npm --prefix packages/notify run test`) · devDep `typescript ^5` | `package.json` |
| 흡수 원문 (fin) | `bot/utils/telegram.ts` **118**(`sendHtml`·`replyHtml`·`withRetry`·로컬 `isParseError`·`escapeHtml`·`h`) · `bot/utils/formatter.ts:52-78` `splitMessage`(줄 경계 우선 · 초과 줄은 하드 슬라이스) · `bot/utils/error.ts` **101**(export 5) | `cat -n` |
| 흡수 원문 (fit) | `bot/notifications/send.ts` **124**(`sendToAll`·`sendToAllWithKeyboard`·`truncate`·`sendOneWithRetry`) · `bot/utils/error.ts` **85**(export 5 · `ENOTFOUND` 없음 · 최종 마스킹 없음) · `bot/utils/telegram.ts:18-23` `escapeHtml`(인바운드 `replyLong:26-36` 도 씀 → **발췌**, §7-2) | 〃 |
| grammy | fin `^1.41.1`(설치 1.44.0) · fit `^1.42.0`(설치 1.42.0) · `Api.sendMessage(chat_id, text, other?: Other<…>, signal?)` (`out/core/api.d.ts:156` 양쪽 동일) · node v20.18.0 | `package.json` · `node_modules/grammy` |
| 키보드 호출부 | fin `rsu.ts:178-186`(`InlineKeyboard` → `reply_markup`) · fit `auto-adjust.ts:62,395`(`buildAutoAdjustKeyboard` → `sendToAllWithKeyboard`) | grep |
| `first.messageId` 소비 | fit `auto-adjust.ts:413-419` · `auto-adjust-cron.ts:97-100` — `String(messageId)` 로 DB 쓰기 **2곳 · 읽기 0**(콜백은 `ctx.editMessageReplyMarkup` 으로 컨텍스트 메시지를 직접 편집 · `auto-adjust-callback.ts:308`) | 감사 §5c |
| 수신자 파싱 | fin 5지점(`scheduler.ts:21`·`cron.ts:13`·`budget-alert.ts:14`·`retry/route.ts:29`·ADMIN `advisor-monitor.ts:199-204`): `split(',')·trim·filter·map(Number)·filter(!isNaN)` · fit `send.ts:24-29`: `split·trim·filter`(문자열 유지) | `sed` · 감사 §5d |

### ⚠ 가정을 뒤집는 값 3건 (감사 반영본)

| # | 무엇 | 왜 계획이 바뀌나 |
|---|---|---|
| **S-1** | **003 은 `Content` 타입을 정의하지 않는다** — docs 전체 `interface Content\|type Content` **0건**, 003 의 8건은 전부 참조(감사 §4). 단서는 §5-1 *"`rsu.ts` 키보드 → 포트에 `components` 옵션(텔레그램 구현만)"* · §7-1·§4-3 제약 3 *"본문은 HTML"* · **§4-1(b) *"파싱 실패 폴백은 채널 무관 로직"***  | **이 계획이 정의한다**(§2 · D-1). 확정 뒤 003 §4-2 에 정정 블록으로 **역반영**(E5b) — 정본이 참조만 하고 정의하지 않는 상태를 닫는다 |
| **S-2** | **패키지가 grammy 를 참조하려면 루트 `package.json` 에 선언해야 한다.** 선언 없이 `import type` 만 쓰면 소비자 임시 클론의 `prepare`(`tsc -p packages/notify`)가 **TS2307 → `npm install` 실패**(감사 케이스 B 재현 · 두 실서비스 `npm ci` 동시 파손 경로 = 1a-0 `exclude` 교훈). 단 git 의존성 준비 명령이 **`--include=peer`** 를 포함하므로 루트 **peerDep 도 devDep 도 `prepare` 를 통과**한다(케이스 C·D) — `build-config.test.ts:5-6` 의 peerDep 전제는 성립한다 | 세 형태 중 **구조적 타입(grammy 0)** 이 가장 싸고 위험이 없다(§8 D-3 실측표). 대신 **대입 가능성은 패키지 테스트가 보증하지 못하므로** grammy 프로브를 E6 에 둔다(감사 A-1: 1회차 시그니처는 양쪽 grammy 에서 TS2322 였다) |
| **S-3** | **분할 위치와 재시도·폴백 단위가 얽힌다.** fin 은 **청크 단위**로 재시도·폴백(`telegram.ts:61-73`). 분할을 `Transport.send` 안에 두고 재시도를 코어에 두면 `send` 가 *부분 성공 후 throw* 하는 비멱등 연산이 되어 **청크 1 중복 전송**. Q10-L ①로 fit 도 다중 청크가 생긴다(C-2) | §4-3 제약 2 **둘째 형태** 채택: `Transport.maxLength` · 코어 분할 · `send` = **청크 1건 = 멱등 단위** · 청크마다 재시도+폴백. **포트 계약:** `maxLength` 유한 → 코어 소유 / `Infinity` → 어댑터가 분할·재시도·폴백을 전부 소유하고 코어는 그 `send` 를 재시도하지 않는다 — **섞을 수 없다**(감사 §3(다)). `TelegramTransport` 는 변환이 항등이라 예산 정확 |

## 1. 파일 구성 (신규 · `packages/notify/`)

| 파일 | 내용 | 원본 |
|---|---|---|
| `src/types.ts` | `MessageRef` · `Content` · `Components` · `Transport` · `Route` · `NotifyContext` · `BroadcastResult` · `Delivery` · `Notifier` · `NotifierConfig` · `TransportRef` · `Logger` | 003 §4-2 + §2 |
| `src/error.ts` | `sanitizeMessage` · `sanitizeError` · `getErrorCode` · `isNetworkError` · `isHtmlParseError` — **fin 정본 그대로**(`NETWORK_CODES` 7 · `ENOTFOUND` · `:52` 최종 이중 마스킹) | fin `error.ts` 101줄 (§3-1 · 감사 §8 확인) |
| `src/split.ts` | `splitMessage(text, maxLength)` — **fin 정본 그대로** | fin `formatter.ts:50-78` |
| `src/plain.ts` | `toPlain(html)` = `html.replace(/<[^>]+>/g, '')` — **Q10-P ① 코어 정규식 fin** | fin `telegram.ts:44,67` |
| `src/escape.ts` | `escapeHtml(text)` — `&`→`&amp;` · `<`→`&lt;` · `>`→`&gt;` (fin·fit 동일 구현) — **003 §5-1·§7-2 발췌 약속** | fin `telegram.ts:17-22` · fit `telegram.ts:18-23` |
| `src/targets.ts` | `csvEnv(name, opts?: { numericOnly?: boolean })` → `() => string[]`: `split(',')·trim·filter(Boolean)` · `numericOnly` 면 `Number` 변환 실패 토큰 **탈락**(fin 규칙 보존 · 반환은 여전히 `string[]`) | fit `send.ts:24-29` · fin `scheduler.ts:22-27` |
| `src/deliver.ts` | `deliverOne(transport, target, content, policy)` — `maxLength` 유한이면 분할 → 청크 루프 → 시도 루프: `isHtmlParseError` → plain 전환 + `attempt--`(**fit 정본 · 예산 보존**) · `isNetworkError` → 백오프 `[2000, 8000, 30000]`(총 4회) · 그 외 즉시 throw. `Infinity` 면 분할·재시도·폴백 없이 `send` 1회 | fit `send.ts:39-75` + fin `withRetry` |
| `src/notifier.ts` | `createNotifier(config)` — `targets` · `targetCount` · `notify`(Route 별 transport 해석 · 대상 순차 · per-target try/catch · 집계 · `first` · `deliveries[].error` raw) · 로그 2종(`label`) | fit `sendToAll` + fin 호출부 21곳의 공통형(발견 16) |
| `src/telegram.ts` | `createTelegramTransport({ api })` — `channel: 'telegram'` · `maxLength: 4096` · `send` = `api.sendMessage(target, text, { parse_mode?: 'HTML', reply_markup? })` → `String(message_id)`. `api` 는 값 또는 팩토리(제약 1) | fin `sendHtml` · fit `sendOneWithRetry` |
| `src/index.ts` | 위 전부 re-export + `VERSION` 유지 | — |
| `README.md` | 소비자용(설치 표기 · `createNotifier` 예시 · grammy 무의존 · 되돌리기) — **#32 I3** | #32 |
| `tsconfig.test.json` | 5줄(`extends` · `noEmit: true` **파일 안 고정** · `exclude: []`) — **#32 I1 (b)** (감사 §6 전항 재현) | measured-facts #32 I1 §3 |
| 테스트 | `error` · `split` · `plain` · `escape` · `targets` · `deliver` · `notifier` · `telegram` `.test.ts` (+ 기존 2 유지) | — |

루트: `package.json` scripts **+1** `"typecheck:test": "tsc --noEmit -p packages/notify/tsconfig.test.json"`.
`packages/notify/package.json` devDeps **+1** `"@types/node": "^20"`(해석 20.19.43 · lockfile +18줄).
`.claude/rules/workflow.md` 8절 pleiades 행 **타입 칸**: `npm run typecheck && npm run typecheck:test`(#37 (b) 예고분 이행).
**패키지 `dependencies`·`peerDependencies` 0 — 루트도 서브도. 소스에 `grammy` 문자열 0**(테스트로 고정).

## 2. 시그니처 — 003 §4-2 정본 + 이 계획이 채우는 빈칸

```ts
// ── 003 §4-2 정본 그대로 (maxLength 1개 추가 · ★) ──
export type MessageRef = string;                 // 불투명 · String 영속화 가능
export interface Transport {
  readonly channel: string;                      // 'telegram' | 'discord'
  readonly maxLength: number;                    // ★ §4-3 제약 2 둘째 형태 — "변환 후 길이 예산".
                                                 //   유한: 코어가 분할·재시도·폴백을 소유, send = 청크 1건(멱등 단위)
                                                 //   Infinity: 어댑터가 전부 소유, 코어는 send 를 재시도하지 않는다. 섞을 수 없다
  send(target: string, content: Content): Promise<MessageRef>;
}
export interface Notifier {
  notify(route: Route, content: Content, ctx?: NotifyContext): Promise<BroadcastResult>;
  targetCount(route: Route): number;
  targets(route: Route): string[];
}
export interface NotifyContext { label: string }
export interface Delivery { target: string; ok: boolean; ref?: MessageRef; error?: string /* raw · Q19 C */ }
export interface BroadcastResult {
  sent: number; failed: number; total: number;
  first?: { target: string; ref: MessageRef };
  deliveries: Delivery[];
}

// ── 이 계획이 정의 (S-1 · D-1) ──
export interface Content {
  text: string;                                  // 본문. format 'html' 이면 텔레그램 HTML 부분집합
  format: 'html' | 'plain';                      // 폴백이 'plain' 으로 재전송한다 — 코어가 만든다 (§4-1(b) "폴백은 채널 무관 로직")
  components?: Components;                       // §5-1 "components 옵션(텔레그램 구현만)"
}
export type Components = Record<string, unknown>; // 채널별 불투명 markup. TelegramTransport 는 reply_markup 으로 그대로 전달
export const html = (text: string, components?: Components): Content => ({ text, format: 'html', components });

// Route — §4-4 "(도메인 × 등급) 축 · 값은 기존 env". 등급이 값, 도메인은 Notifier 인스턴스 설정(자리만)
export const Route = { ALLOWED: 'ALLOWED', ADMIN: 'ADMIN' } as const;
export type Route = (typeof Route)[keyof typeof Route];

export type TransportRef = Transport | (() => Transport);   // 제약 1 — 지연 생성
export interface NotifierConfig {
  transport: TransportRef | Partial<Record<Route, TransportRef>>;  // ★ 003 §1-4 요구사항 1 — Route → Transport 매핑은 설정
  targets: Partial<Record<Route, () => string[]>>; // 호출 시점마다 해석(env 변경 반영 · 원본 동일). 미매핑 route → []
  domain?: string;                               // 자리만. 로그·결과에 쓰지 않는다 (§4-4)
  logger?: Pick<Console, 'warn' | 'error'>;      // 기본 console
  sleep?: (ms: number) => Promise<void>;         // 테스트 주입. 기본 setTimeout
  retryDelaysMs?: readonly number[];             // 기본 [2000, 8000, 30000]
}
export interface TelegramApi {                   // S-2 — grammy 무의존 구조적 타입. 소비자는 bot.api 를 넘긴다
  sendMessage(                                   // ★ 메서드 단축 문법 필수 (감사 V8: 프로퍼티 문법이면 양변성이 사라져 TS2322)
    chatId: string | number, text: string,
    other?: { parse_mode?: string; reply_markup?: unknown },   // ★ 감사 V1 — 'HTML' 리터럴은 grammy ParseMode 보다 좁아 TS2322
  ): Promise<{ message_id: number }>;
}
export function createTelegramTransport(opts: { api: TelegramApi | (() => TelegramApi) }): Transport;
export function createNotifier(config: NotifierConfig): Notifier;
export function csvEnv(name: string, opts?: { numericOnly?: boolean }): () => string[];
```

**동작 규칙 (원본 대비 · 근거)**

| 규칙 | 값 | 근거 |
|---|---|---|
| 재시도 | 네트워크 오류만 · `[2000, 8000, 30000]` · 총 4회 · 마지막 실패는 원 에러 throw | 양쪽 동일 |
| 파싱 실패 폴백 | `isHtmlParseError`(fit 공유 정규식) → 같은 청크를 `format: 'plain'`(태그 제거 · `components` **유지**)으로 즉시 재전송 · `attempt--` 로 예산 보존 · plain 도 실패하면 그 에러로 판정 계속 | §3-1 정본 · fit `send.ts:59-62` · 감사 §5a·5b 확인 |
| **관측 변경 후보 1건 (fin)** | fin 현행 `isParseError` 는 **모든 400** 에서 폴백한다(`telegram.ts:79-88`). 새 판정자는 비-파싱 400(예: *message is too long*)에서 폴백하지 않고 에러를 올린다. **빈도 미측정**(폴백 로그 0 · C-1). 003 §5-2 정정 ① fin 측 2건 → **3건 후보**로 역반영(E5b) | 감사 §5b 통지 |
| 분할 | `maxLength` 유한이면 코어가 `splitMessage(text, maxLength)` → 청크 **순차** · `components` 는 **마지막 청크에만** · `delivery.ref` = **마지막 청크의 ref**. 근거: `telegramMessageId` 는 **쓰기 2곳 · 읽기 0건**(발견 9 정정)이라 어느 청크의 ref 든 현존 동작은 불변 — 키보드 청크의 ref 를 고르는 것은 장래 읽기 경로를 위한 선택 | S-3 · 감사 §5c |
| 대상 | `targets(route)` 를 호출 시점에 해석 · 0 이면 전송 없이 `{0,0,0,[],first:undefined}` — **fin fail-safe(`advisor-monitor:205-211`)는 호출부 몫**(1a-4 지시 · 003 §4-2 확정 4) | 003 |
| **`targets` 파싱 차이** | 기본 `csvEnv` 는 fit 규칙(문자열 유지). fin 5지점은 `.map(Number).filter(!isNaN)` 로 비숫자 토큰을 **조용히 탈락**시키는데 그 탈락 여부가 `total` = DB `AlertHistory.recipientCount` 3곳 + API `totalChats` 1곳의 값이다(발견 19 *"값의 의미를 바꾸면 안 된다"*). → `numericOnly: true` 옵션으로 fin 호출부(1a-4)가 규칙을 보존한다. **env 실값에 비숫자 토큰이 있는지는 미확인**(`.env` 열람 금지) | 감사 §5d |
| 전송 순서 | 대상 순차 · 청크 순차 (원본 둘 다 순차) | 원본 |
| Route → Transport | `config.transport` 가 단일이면 전 Route 공통, 맵이면 Route 별. `targets` 가 0 이면 transport 해석 전에 `{0,0,0,[]}` 반환. **대상은 있는데 그 Route 의 transport 가 없으면 설정 오류로 `notify` 가 throw** (조용한 무전송보다 낫다) | 003 §1-4 · 감사 A-3 |
| 로그 | 재시도 `[${label}] 전송 재시도 ${n}/${max} (${target}, ${delay}ms 후): ${sanitizeError(err)}` · 실패 `[${label}] 메시지 전송 실패 (${target}): ${sanitizeError(err)}` — 두 원본 문구의 합집합 · `label` 미지정 시 `'notify'` | Q26 ① · fit `send.ts:68,87` · fin `telegram.ts:113` |
| `deliveries[].error` | `err instanceof Error ? err.message : String(err)` — **raw** · 파사드는 sanitize 하지 않는다 | Q19 C |
| `sensitiveLogs` 가드 | 파사드 **로그**는 `sanitizeError` 를 거친다(두 원본과 동일) — (나) 의 "파사드 로그 1곳" 은 이 설계에서 충족. B′(호출부 4지점)는 1a-4 | 003 §10 Q19 정정 |
| 키보드 | fit `sendToAllWithKeyboard` 의 "재시도 없음 · 폴백 없음" 은 **승계하지 않는다** — §4-1(a) 가 그것을 L2 반증 사례로 들었고 §5-2 1a-3 이 "키보드 전송에서도 재시도·폴백" 을 남는 것으로 적었다 | 003 §4-1(a) · §5-2 |

## 3. 003 요구사항·제약 대조 (§1-4 요구사항 2 + §4-3 제약 3)

| 항목 | 충족 |
|---|---|
| §1-4 요구사항 1 · `Route → Transport` 매핑은 설정 | `NotifierConfig.transport` 가 `Partial<Record<Route, TransportRef>>` 허용. 1b 는 소비자 config 1곳 변경(env 로 고르면 env 플립) — 되돌리기 **즉시** 유지 |
| §1-4 요구사항 2 = 제약 3 · 역변환기는 `Transport` 직전 | 1a 에 역변환기 없음. `Content.format` 은 변환이 아니라 **폴백 상태**이고 §4-1(b) 가 폴백을 채널 무관 로직으로 정했다 |
| 제약 1 · 지연 생성 | `TransportRef` 팩토리 · `createTelegramTransport({ api: () => bot.api })` 팩토리 · 소스 `grammy` 문자열 0(grep 단언 — **부재만 보증**) · **대입 가능성은 E6 프로브**가 보증 |
| 제약 2 · 분할 위치 | 둘째 형태(`maxLength` 예산) + 소유권 규칙 — S-3 |

## 4. 단계 (한 PR · 이슈 1개 · 브랜치 `feat/<issue>-1`)

| # | 작업 | 검증 |
|---|---|---|
| E1 | 게이트: `tsconfig.test.json` · `@types/node` · `typecheck:test` · `workflow.md` 8절 | 주입 오류(`const bad: number = VERSION`)를 `typecheck:test` 가 exit 2 로 잡는다 → 제거 (감사 §6 재현) |
| E2 | `types.ts` · `error.ts` · `split.ts` · `plain.ts` · `escape.ts` · `targets.ts` + 테스트 (RED → GREEN) | `test` · `typecheck:test` |
| E3 | `deliver.ts` + 테스트 — 재시도(주입 sleep) · 폴백 예산 · 분할 청크 순서 · components 마지막 청크 · ref · `Infinity` 경로(재시도 없음) | 〃 |
| E4 | `notifier.ts` · `telegram.ts` · `index.ts` + 테스트 — 집계 · first · raw error · label 로그 · 미매핑 route → [] · Route 별 transport · 지연 생성(팩토리 미호출 단언) · fake api · `grammy` 문자열 부재 | 〃 |
| E5 | `README.md` · 8절 4종 전부 | `npm run typecheck && npm run typecheck:test && npm test && npm run build` |
| **E5b** | **003 역반영 2건** (`decision-writer`): §4-2 에 `Content`·`maxLength`·`TransportRef` 정정 블록 · §5-2 정정 ① 에 fin 폴백 트리거 축소 후보 행 | self-review |
| E6 | **소비자 e2e (스크래치패드)** — 소비자 `package.json` 에 **`"@pleiades/notify": "git+file://…#<sha>"`** 로 선언 → `npm install` 임시 클론 `prepare` exit 0 · `require('@pleiades/notify').createNotifier` 로 fake api 전송 1건 · `npm pack --dry-run` 파일 목록 · `node_modules/@types`·`grammy` 누수 0. **+ grammy 대입 프로브**: `repos/{myFinance,myFitness}/node_modules/grammy` 를 `paths` 로 참조하는 `tsc`(읽기만) — `bot.api` → `TelegramApi` · `InlineKeyboard` → `reply_markup` · 두 버전(1.44.0 · 1.42.0) exit 0 | measured-facts 에 추가 |
| E7 | 9-1 사전 리뷰(`pr-review-toolkit:code-reviewer` · 패키지 코드 → **필수**) → PR → 9-3 봇 → 10절 | — |

## 5. 검증 명령 (8절 pleiades 행)

```bash
npm --prefix packages/notify install
npm run typecheck && npm run typecheck:test && npm test && npm run build
```

## 6. 되돌리기

| 대상 | 등급 | 행위 |
|---|---|---|
| 전체 | **즉시** (1a-3 착수 전까지 · 첫 소비자는 1a-3 · 이 PR 은 태그를 만들지 않는다) | PR revert 1회 — `packages/notify/src` 2파일 · 루트 스크립트 1줄 · `workflow.md` 8절 1줄 · `package-lock.json` −18줄. 소비자 0 |
| 게이트만 | **즉시** — 단 **"게이트 도입 이전 상태로" 만**: 1a-1 테스트가 `node:*` 를 쓰면 `@types/node` 제거가 `build-config.test.ts` 를 깬다(#32 I1 §7) | 파일 1 삭제 · 스크립트 1줄 · devDep 1줄 · 서브 `npm install` |
| `Content`·`maxLength`·`TransportRef` 형태 | **즉시** (1a-3 전) / **중간** (1a-3 후 — 포트·설정 계약이 소비자에 박힌다 · §8-1) | 타입 재정의 + `deliver.ts` 분할 위치 이동 |
| `Route → Transport` 매핑 | 즉시 (config 한 칸) | **넣지 않았을 때의 비용이 더 크다** — 1b 되돌리기 즉시 → 중간(003 §1-4) |

## 7. 범위 밖 (이 PR 에서 하지 않는다)

fin·fit 호출부(1a-3·1a-4) · fit vitest(1a-2) · Discord(1b) · `sendDocument`(§7-4) · `h` 헬퍼·md→HTML(§7-2) · fin `stripHtml` 죽은 export 폐기(fin 단독 별건) ·
버전 태그·릴리즈(1a-3 전 별도 PR) · Q45 서버 측정 · `#32 I1 (a)`(vitest `--typecheck` — (b) 만 채택) ·
**`error.ts` shim 결정**(003 §5-1 *"착수 직전에 정할 구현 결정 1건"* — 인바운드 6곳 import 경로 · 집행이 1a-3·1a-4 이므로 **그 착수 시 결정**으로 이월) ·
fin `isParseError` 폴백 범위 축소의 **빈도 계측**(C-1 — 계측 코드 없이는 불가).

## 8. 사용자에게 보이는 결정 (진행 전 확인)

| | 제안 | 대안 | 되돌리기 |
|---|---|---|---|
| **D-1 `Content` 형태** (S-1) | `{ text, format: 'html'\|'plain', components? }` + `html()` 헬퍼. 003 이 정의하지 않은 빈칸 | `{ html: string, components? }` 로 두고 plain 은 포트 밖 별도 인자 — 포트 `send` 시그니처가 003 과 달라진다 | 즉시(1a-3 전) |
| **D-2 `Transport.maxLength`** (S-3) | 포트 표면 1개 추가(§4-3 제약 2 둘째 형태) + 소유권 규칙(유한=코어 / Infinity=어댑터) | 분할을 `TelegramTransport` 안에 두고 코어 폴백을 포기(fin 청크 단위 폴백 소실 · 청크 중복 위험) 또는 포트에 `sendChunked` 추가 | 즉시(1a-3 전) |
| **D-3 grammy 무의존** (S-2) | 구조적 `TelegramApi`(`parse_mode?: string`) — 감사 실측: 소비자 `npm ci` warm **1.56 s** · cold **2.04 s / 캐시 19 M** · 트리 20 K · 위험 없음 | ① 루트 **devDep** grammy: warm 1.88 s · cold 2.92 s / 22 M · 누수 0 · 3중 버전 관리 ② 루트 **peerDep** grammy: warm 1.90 s · 신규 소비자 2.9 M · **peer 범위가 소비자 설치본보다 좁으면 `npm ci` 가 ERESOLVE 로 죽는다**(케이스 F · fin 1.44.0 / fit 1.42.0 이라 `^1.41.0` 이하 유지 필요) | 즉시 |
| **D-4 `Route → Transport` 매핑** (감사 A-3) | **넣는다** — 003 §1-4 요구사항 1 이 이미 정본이라 새 결정이 아니다. config 한 칸 · 포트 무변경 | 넣지 않고 1b 되돌리기 등급 +1 을 수용(003 이 명시한 대가) | 즉시 |
