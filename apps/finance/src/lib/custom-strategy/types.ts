/**
 * Phase 29-E — 커스텀 전략 조건 스펙.
 * Phase 31-A (v2) — 시간/요일/보유 필터 추가.
 * Phase 34-A/B — 어닝 조건 + 크로스-티커 (change_percent / price) 추가.
 * Phase 38-A (#448) — 크로스-티커 metric 을 TA 지표 (rsi / macd_signal / sma_cross / bb_position) 로 확장.
 *
 * 사용자 자연어 → AI 파싱 → Condition[] JSON 으로 CustomStrategy.conditions 저장.
 * cron 이 evaluator 로 순수 코드 평가 (매번 AI 호출 X).
 */

export type ConditionType =
  | 'price'           // 현재가
  | 'rsi'             // RSI14 값
  | 'macd_signal'     // MACD crossover
  | 'sma_cross'       // SMA golden/dead cross
  | 'bb_position'     // Bollinger Bands position
  | 'change_pct'      // 기간 변동 %
  // v2 additions —
  | 'time_window'     // KST 시각 범위 필터 (HH:MM~HH:MM)
  | 'weekday'         // KST 요일 필터 (MON/TUE/…)
  | 'holding_status'  // 사용자 보유 여부
  // v3 additions (Phase 34) —
  | 'earnings_within_days'  // 다음 어닝까지 남은 일수 (data 없거나 과거만 있으면 false)
  | 'cross_ticker'          // 다른 티커의 price/changePercent 조건 (SPY, VIX 등 벤치마크 게이트)

export type Operator = '<' | '<=' | '>' | '>=' | '==' | 'is'

/** timeframe 지원 조건 타입 (change_pct 전용) */
export type Timeframe = '1d' | '5d' | '20d'

/**
 * cross_ticker 조건에서 비교할 지표.
 * - `price` / `change_percent`: 숫자 (기존 34-B).
 * - `rsi`: 0~100 숫자.
 * - `macd_signal` / `sma_cross` / `bb_position`: 카테고리컬 → 정수 코드로 표준화.
 *   parser JSON / UI 폼이 단일 스키마 (`metric` + `operator` + `value:number`) 로 통일.
 *   * `macd_signal`: 1 = GOLDEN, 0 = NONE (크로스 이벤트 없음), -1 = DEAD. `==` 만.
 *   * `sma_cross`  : 1 = GOLDEN cross true, -1 = DEAD cross true. `==` 만.
 *   * `bb_position`: 1 = ABOVE_UPPER, 0 = WITHIN (near/middle), -1 = BELOW_LOWER. `==` 만.
 */
export type CrossTickerMetric =
  | 'price'
  | 'change_percent'
  | 'rsi'
  | 'macd_signal'
  | 'sma_cross'
  | 'bb_position'

/** 요일 코드 (KST 기준) */
export type WeekdayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

export interface Condition {
  type: ConditionType
  operator: Operator
  /** number (수치 조건) | string (단일 상태) | WeekdayCode[] (weekday 배열) */
  value: number | string | WeekdayCode[]
  timeframe?: Timeframe
  /** cross_ticker 전용 — 참조할 티커 (대문자 정규화) */
  crossTicker?: string
  /** cross_ticker 전용 — 어떤 지표와 비교할지 */
  metric?: CrossTickerMetric
}

export type LogicOp = 'AND' | 'OR'
export type Frequency = 'once' | 'daily' | 'always'

/** AI 파싱 결과 */
export interface ParsedStrategy {
  name: string
  ticker: string
  conditions: Condition[]
  logic: LogicOp
  frequency: Frequency
}

/** 지원 문자열 값 (macd_signal, sma_cross, bb_position, holding_status) */
export const ALLOWED_STRING_VALUES = {
  macd_signal: ['GOLDEN', 'DEAD'] as const,
  sma_cross: ['GOLDEN', 'DEAD'] as const,
  bb_position: ['BELOW_LOWER', 'ABOVE_UPPER'] as const,
  holding_status: ['HELD', 'NOT_HELD'] as const,
} as const

export const VALID_WEEKDAYS: readonly WeekdayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const VALID_WEEKDAYS_SET = new Set<WeekdayCode>(VALID_WEEKDAYS)

/** HH:MM~HH:MM 포맷 (00~23:00~59). 자정 wraparound 는 evaluator 가 판정. */
export const TIME_WINDOW_RE = /^([01]\d|2[0-3]):([0-5]\d)~([01]\d|2[0-3]):([0-5]\d)$/

const NUMERIC_TYPES = new Set<ConditionType>(['price', 'rsi', 'change_pct', 'earnings_within_days', 'cross_ticker'])
const VALID_CROSS_METRICS = new Set<CrossTickerMetric>([
  'price', 'change_percent',
  // Phase 38-A (#448) — TA metric 확장
  'rsi', 'macd_signal', 'sma_cross', 'bb_position',
])
/** Phase 38-A: `==` 만 허용되는 cross_ticker 카테고리컬 metric */
const CROSS_TICKER_CATEGORICAL_METRICS = new Set<CrossTickerMetric>([
  'macd_signal', 'sma_cross', 'bb_position',
])
/**
 * Phase 38-A: 카테고리컬 metric 별 허용 threshold 정수 집합.
 * 이 밖의 값은 evaluator 에 도달하기 전 validate 단계에서 거부.
 */
const CROSS_TICKER_CATEGORICAL_VALUES: Record<
  'macd_signal' | 'sma_cross' | 'bb_position',
  ReadonlySet<number>
> = {
  macd_signal: new Set([-1, 0, 1]),
  sma_cross: new Set([-1, 1]),
  bb_position: new Set([-1, 0, 1]),
}
const SINGLE_STRING_TYPES = new Set<ConditionType>(['macd_signal', 'sma_cross', 'bb_position', 'holding_status'])
const NUMERIC_OPS = new Set<Operator>(['<', '<=', '>', '>=', '=='])
const IS_OP: Operator = 'is'

const VALID_LOGIC = new Set<LogicOp>(['AND', 'OR'])
const VALID_FREQUENCY = new Set<Frequency>(['once', 'daily', 'always'])
const VALID_TIMEFRAMES = new Set<Timeframe>(['1d', '5d', '20d'])
const VALID_TYPES = new Set<ConditionType>([
  'price', 'rsi', 'macd_signal', 'sma_cross', 'bb_position', 'change_pct',
  'time_window', 'weekday', 'holding_status',
  'earnings_within_days', 'cross_ticker',
])

/** Condition 유효성 검증 — evaluator 진입 전 방어 */
export function validateCondition(c: unknown): c is Condition {
  if (!c || typeof c !== 'object') return false
  const cond = c as Record<string, unknown>

  if (!VALID_TYPES.has(cond.type as ConditionType)) return false
  const type = cond.type as ConditionType

  if (NUMERIC_TYPES.has(type)) {
    if (!NUMERIC_OPS.has(cond.operator as Operator)) return false
    if (typeof cond.value !== 'number' || !Number.isFinite(cond.value)) return false
    if (type === 'change_pct') {
      // timeframe 필수 — evaluator 폴백을 방지해 조건 의도가 명확해지도록
      if (!VALID_TIMEFRAMES.has(cond.timeframe as Timeframe)) return false
    }
    if (type === 'earnings_within_days') {
      // 어닝 일수는 정수 + 음수는 무의미 (미래 카운트다운). 소수/음수 거부.
      if (!Number.isInteger(cond.value) || cond.value < 0) return false
    }
    if (type === 'cross_ticker') {
      // crossTicker: 비어있지 않은 문자열 (정규화는 evaluator 가 처리 — 원본 보존).
      if (typeof cond.crossTicker !== 'string' || cond.crossTicker.trim() === '') return false
      // metric: 화이트리스트
      if (!VALID_CROSS_METRICS.has(cond.metric as CrossTickerMetric)) return false
      const metric = cond.metric as CrossTickerMetric
      // Phase 38-A: metric 별 세부 검증.
      if (metric === 'rsi') {
        // RSI14 값은 0~100. 소수 허용 (엔진이 소수 반환).
        if (cond.value < 0 || cond.value > 100) return false
      } else if (CROSS_TICKER_CATEGORICAL_METRICS.has(metric)) {
        // == 만 + 제한된 정수 집합.
        if (cond.operator !== '==') return false
        const allowed = CROSS_TICKER_CATEGORICAL_VALUES[metric as 'macd_signal' | 'sma_cross' | 'bb_position']
        if (!Number.isInteger(cond.value) || !allowed.has(cond.value)) return false
      }
      // price / change_percent 는 기존 그대로 (숫자 op + 유한 숫자).
    }
    return true
  }

  if (SINGLE_STRING_TYPES.has(type)) {
    if (cond.operator !== IS_OP) return false
    if (typeof cond.value !== 'string') return false
    const allowed = ALLOWED_STRING_VALUES[type as keyof typeof ALLOWED_STRING_VALUES] as readonly string[]
    return allowed.includes(cond.value)
  }

  if (type === 'time_window') {
    if (cond.operator !== IS_OP) return false
    if (typeof cond.value !== 'string') return false
    return TIME_WINDOW_RE.test(cond.value)
  }

  if (type === 'weekday') {
    if (cond.operator !== IS_OP) return false
    if (!Array.isArray(cond.value) || cond.value.length === 0) return false
    // 중복 허용하지 않음 → 집합 크기 == 배열 길이. 모두 유효한 코드여야.
    const seen = new Set<string>()
    for (const v of cond.value) {
      if (typeof v !== 'string') return false
      if (!VALID_WEEKDAYS_SET.has(v as WeekdayCode)) return false
      if (seen.has(v)) return false
      seen.add(v)
    }
    return true
  }

  return false
}

export function validateParsedStrategy(p: unknown): p is ParsedStrategy {
  if (!p || typeof p !== 'object') return false
  const s = p as Record<string, unknown>
  if (typeof s.name !== 'string' || !s.name.trim()) return false
  if (typeof s.ticker !== 'string' || !s.ticker.trim()) return false
  if (!Array.isArray(s.conditions) || s.conditions.length === 0) return false
  if (!VALID_LOGIC.has(s.logic as LogicOp)) return false
  if (!VALID_FREQUENCY.has(s.frequency as Frequency)) return false
  return s.conditions.every(validateCondition)
}

/** Phase 38-A: 카테고리컬 cross_ticker metric 의 정수 코드 → 사람 친화 라벨 */
function crossTickerCategoricalLabel(metric: CrossTickerMetric, value: number): string | null {
  if (metric === 'macd_signal') {
    if (value === 1) return 'GOLDEN'
    if (value === -1) return 'DEAD'
    if (value === 0) return 'NONE'
  } else if (metric === 'sma_cross') {
    if (value === 1) return 'GOLDEN'
    if (value === -1) return 'DEAD'
  } else if (metric === 'bb_position') {
    if (value === 1) return 'ABOVE_UPPER'
    if (value === 0) return 'WITHIN'
    if (value === -1) return 'BELOW_LOWER'
  }
  return null
}

export function conditionToString(c: Condition): string {
  const timeframe = c.timeframe ? `(${c.timeframe})` : ''
  if (c.type === 'weekday' && Array.isArray(c.value)) {
    return `weekday ${c.operator} [${c.value.join(',')}]`
  }
  if (c.type === 'cross_ticker') {
    const metric = c.metric ?? '?'
    // 카테고리컬 metric 은 라벨로 렌더링 (사람이 읽기 쉽게).
    // canonical key (diff.condKey) 는 여전히 원본 숫자값을 사용 → 여기서만 라벨링.
    if (typeof c.value === 'number' && (metric === 'macd_signal' || metric === 'sma_cross' || metric === 'bb_position')) {
      const label = crossTickerCategoricalLabel(metric, c.value)
      if (label) return `${c.crossTicker ?? '?'}.${metric} ${c.operator} ${label}`
    }
    return `${c.crossTicker ?? '?'}.${metric} ${c.operator} ${c.value}`
  }
  return `${c.type}${timeframe} ${c.operator} ${c.value}`
}
