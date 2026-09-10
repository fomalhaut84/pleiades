/**
 * @pleiades/notify — 공개 타입 (003 §4-2 정본 시그니처 + 1a-1 계획 §2 가 채운 빈칸).
 *
 * 2층 구조 (L3):
 *   - 포트 `Transport`  — 어댑터가 구현. 채널 1개 · 대상 1개 · 청크 1건.
 *   - 파사드 `Notifier` — 호출부가 사용. 라우트 1개 · 대상 N건. 재시도·폴백·분할·집계·라우팅은 여기(코어)에 있다.
 */

/** 불투명 메시지 참조. 파싱 금지. `String` 컬럼에 그대로 영속화할 수 있다 (003 발견 9). */
export type MessageRef = string;

/**
 * 채널별 불투명 markup (§5-1 "components 옵션 · 텔레그램 구현만").
 * `TelegramTransport` 는 이 값을 `reply_markup` 으로 그대로 전달한다 — 예: grammY `InlineKeyboard` 인스턴스.
 * `object` 인 이유: `Record<string, unknown>` 은 클래스 인스턴스(`InlineKeyboard`)를 받지 못한다 — TS 는 클래스에 암묵적
 * index signature 를 주지 않아 TS2322 (사전 리뷰 M-3 · fit grammy 1.42.0 프로브). 원시값은 여전히 거부된다.
 */
export type Components = object;

/**
 * 전송 본문 (1a-1 계획 D-1 · 003 은 이 타입을 참조만 하고 정의하지 않았다).
 * `format` 은 코어가 만든다 — 파싱 실패 폴백이 같은 본문을 `'plain'` 으로 재전송한다 (003 §4-1(b) "폴백은 채널 무관 로직").
 */
export interface Content {
  /** 본문. `format === 'html'` 이면 텔레그램 HTML 부분집합. */
  text: string;
  format: 'html' | 'plain';
  components?: Components;
}

/** HTML 본문 `Content` 를 만드는 헬퍼 — 호출부 대부분은 이것만 쓴다. */
export const html = (text: string, components?: Components): Content =>
  components === undefined ? { text, format: 'html' } : { text, format: 'html', components };

/**
 * 포트 — 어댑터가 구현한다.
 *
 * `maxLength` 는 §4-3 제약 2 의 둘째 형태("포트가 변환 후 길이 예산을 코어에 알려준다")다. 소유권 규칙:
 *   - **유한** → 코어가 `splitMessage(text, maxLength)` 로 분할하고 청크마다 재시도·폴백을 건다.
 *     `send` 는 **청크 1건 = 멱등 단위**여야 한다 (한 호출이 여러 API 호출을 하면 코어 재시도가 앞 청크를 중복 전송한다).
 *   - **`Infinity`** → 어댑터가 분할·재시도·폴백을 **전부** 소유한다. 코어는 `send` 를 한 번만 호출하고 재시도하지 않는다.
 *   두 형태를 섞을 수 없다.
 */
export interface Transport {
  readonly channel: string;
  /** 유한이면 **1 이상**이어야 한다 (0·음수·NaN 은 코어가 RangeError 로 거부한다). */
  readonly maxLength: number;
  send(target: string, content: Content): Promise<MessageRef>;
}

/** 지연 생성 (003 §4-3 제약 1) — 팩토리를 넘기면 첫 `notify` 까지 어댑터를 만들지 않는다. */
export type TransportRef = Transport | (() => Transport);

/**
 * 라우트 — 등급 축 (003 §4-4). 값은 기존 env 를 그대로 읽는다:
 *   fin: ALLOWED → TELEGRAM_ALLOWED_CHAT_IDS · ADMIN → TELEGRAM_ADMIN_CHAT_IDS
 *   fit: ALLOWED → TELEGRAM_ALLOWED_CHAT_IDS · ADMIN 은 매핑하지 않는다 → targetCount(ADMIN) === 0
 * 도메인 축은 `NotifierConfig.domain` 에 자리만 둔다.
 */
export const Route = { ALLOWED: 'ALLOWED', ADMIN: 'ADMIN' } as const;
export type Route = (typeof Route)[keyof typeof Route];

/** 호출부 컨텍스트 (Q26 ①) — 기존 로그 prefix 17종을 그대로 넘긴다. `onError` 는 두지 않는다. */
export interface NotifyContext {
  label: string;
}

export interface Delivery {
  target: string;
  ok: boolean;
  /** 성공 시. 청크가 여럿이면 **마지막 청크**의 ref (components 가 붙은 메시지). */
  ref?: MessageRef;
  /**
   * 실패 시 raw `error.message` (Q19 C). 파사드는 sanitize 하지 않는다 — 로그만 별도로 sanitize 된다.
   * **봇 토큰이 포함될 수 있다** (grammy `HttpError` 는 `https://api.telegram.org/bot<token>/…` 을 message 에 담는다).
   * 로그·DB·API 응답·UI 에 쓰기 전 반드시 `sanitizeMessage`(또는 `sanitizeError`)를 통과시킨다 — 상속 컨벤션
   * "catch 블록에서 `error.message` 원문 노출 금지" · 003 §10 Q19 `sensitiveLogs` 단서. (사전 리뷰 M-4)
   */
  error?: string;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  total: number;
  /** 첫 성공 전송. 모두 실패면 undefined (fit `SendKeyboardResult.first`). */
  first?: { target: string; ref: MessageRef };
  deliveries: Delivery[];
}

/** 파사드 — 호출부가 사용한다. */
export interface Notifier {
  notify(route: Route, content: Content, ctx?: NotifyContext): Promise<BroadcastResult>;
  /** 전송이 아니라 가드용 — `length === 0` 가드 10곳 + 분모 11곳 (003 발견 19). */
  targetCount(route: Route): number;
  /** Q25 ① — 목록 자체가 필요한 호출부 (`quarterly-report.ts:52`). 파사드 필수 표면. */
  targets(route: Route): string[];
}

export type Logger = Pick<Console, 'warn' | 'error'>;

export interface NotifierConfig {
  /**
   * 단일이면 모든 Route 공통. 맵이면 Route 별 (003 §1-4 요구사항 1 — `Route → Transport` 매핑은 설정).
   * 대상이 있는데 그 Route 의 transport 가 없으면 `notify` 가 throw 한다 (설정 오류).
   */
  transport: TransportRef | Partial<Record<Route, TransportRef>>;
  /** Route 별 대상 해석기. 호출 시점마다 실행된다. 미매핑 Route → `[]`. */
  targets: Partial<Record<Route, () => string[]>>;
  /** 자리만 (003 §4-4). 로그·결과에 쓰지 않는다. */
  domain?: string;
  /** 기본 `console`. */
  logger?: Logger;
  /** 테스트 주입. 기본 `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** 기본 `[2000, 8000, 30000]` (총 4회 시도). */
  retryDelaysMs?: readonly number[];
}
