/**
 * Custom strategy condition evaluator — 순수 코드 평가 (매번 AI 호출 X).
 *
 * v1 (Phase 29-E): price/rsi/macd_signal/sma_cross/bb_position/change_pct
 * v2 (Phase 31-A): time_window/weekday/holding_status
 * v3 (Phase 34-A/B): earnings_within_days + cross_ticker (price/change_percent)
 * v3.1 (Phase 38-A #448): cross_ticker metric 을 TA 지표 (rsi/macd_signal/sma_cross/bb_position) 로 확장
 *
 * 입력:
 *   - Condition[]: 사용자 정의 조건 (parser 로 자연어 파싱된 결과)
 *   - MarketSnapshot: priceCache + (필요 시) TAReport
 *   - EvaluationContext: 시각 + 보유 티커 (v2 조건 대비) + 크로스-티커 스냅샷 (v3)
 *
 * 출력: 각 조건 만족 여부 boolean[] → logic (AND/OR) 결합 → 최종 만족 여부
 */

import type { Condition, WeekdayCode } from './types'
import { TIME_WINDOW_RE } from './types'
import type { TAReport, BBPosition } from '@/lib/ta/types'
import { kstDayDiff } from '@/lib/kst-date'

export interface PriceSnapshot {
  price: number
  changePercent: number | null
}

export interface MarketSnapshot {
  price: PriceSnapshot | null
  ta: TAReport | null
  /**
   * Phase 34-A (#419): 어닝 캘린더 스냅샷. `earnings_within_days` 조건 평가용.
   * cron 이 upsert 한 EarningsCache 를 호출자가 주입.
   */
  earnings?: { nextEarningsDate: Date | null } | null
}

/**
 * Phase 38-A (#448) — 크로스-티커 스냅샷 shape.
 * 기존 price/changePercent 는 항상 채워짐 (PriceCache 에 있을 때).
 * TA 필드는 해당 티커의 TA 리포트가 필요/성공 시에만 채워짐 (미채움 = undefined → 조건 false).
 *
 * - `macdCrossover`: TA 의 optional `crossover` 를 `NONE` 으로 정규화해 "이벤트 없음" 도 표현.
 * - `bbPosition`  : TA 의 5-값 (NEAR_UPPER, MIDDLE, NEAR_LOWER 포함) 을 3-값
 *   (ABOVE_UPPER / WITHIN / BELOW_LOWER) 로 축약 — 사용자 조건 어휘 (극단/중간) 와 정합.
 * - `smaGoldenCross` / `smaDeathCross`: TA 엔진의 5거래일 창 안에서는 whipsaw
 *   케이스로 두 flag 가 동시에 true 가 될 수 있음 (`src/lib/ta/engine.ts:134-138`).
 *   단일 enum 으로 축약하면 GOLDEN 우선 판정 → `sma_cross == -1` 조건이 실제 death
 *   가 있어도 방출 못함 (Codex #457 P2). self-ticker evaluator 처럼 두 flag 를
 *   독립 저장 → 조건별로 정확한 flag 검사.
 */
export interface CrossTickerSnapshot {
  price: number
  changePercent: number | null
  rsi?: number
  macdCrossover?: 'GOLDEN' | 'DEAD' | 'NONE'
  bbPosition?: 'ABOVE_UPPER' | 'WITHIN' | 'BELOW_LOWER'
  smaGoldenCross?: boolean
  smaDeathCross?: boolean
}

/**
 * v2 조건 평가에 필요한 런타임 컨텍스트.
 * 호출자 (custom-strategy-alert.ts) 가 준비해서 주입.
 */
export interface EvaluationContext {
  /** 평가 시각 (UTC Date). KST 변환은 evaluator 내부에서 처리 */
  now: Date
  /** 사용자가 실제 보유 중인 티커 (shares > 0). holding_status 판정용 */
  holdings: Set<string>
  /** 평가 대상 티커 — holding_status 판정용 (Strategy.ticker 주입) */
  strategyTicker: string
  /**
   * Phase 34-B (#420) / Phase 38-A (#448): 크로스-티커 조건 참조용 스냅샷 맵.
   * key = 대문자 정규화된 티커. 호출자가 전략들의 모든 crossTicker 를 미리 조회해 주입.
   * 미주입 or 특정 티커 없음 → cross_ticker 조건 false (안전측).
   * TA metric 조건은 스냅샷에 해당 TA 필드가 채워져 있어야 참 판정 가능.
   */
  crossTickers?: Map<string, CrossTickerSnapshot>
}

/** 지원 조건 타입 중 TA 필요 여부 판단 — 평가 전에 TAReport fetch 여부 결정 */
export function requiresTA(conditions: Condition[]): boolean {
  return conditions.some((c) =>
    c.type === 'rsi' ||
    c.type === 'macd_signal' ||
    c.type === 'sma_cross' ||
    c.type === 'bb_position' ||
    (c.type === 'change_pct' && c.timeframe !== '1d') // 1d 는 priceCache 로 충분
    // v2 (time_window/weekday/holding_status) 는 TA 불필요
  )
}

function compareNumeric(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case '<': return actual < expected
    case '<=': return actual <= expected
    case '>': return actual > expected
    case '>=': return actual >= expected
    case '==': return actual === expected
    default: return false
  }
}

/** UTC Date → KST 시각 (분 단위 0~1439) */
function kstMinutes(now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.getUTCHours() * 60 + kst.getUTCMinutes()
}

/** UTC Date → KST 요일 코드 */
function kstWeekday(now: Date): WeekdayCode {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const dow = kst.getUTCDay() // 0=Sun, 1=Mon, ...
  const codes: WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  return codes[dow]
}

/**
 * Pure — 다음 어닝까지 남은 KST 캘린더 일수.
 * 양쪽을 KST 자정으로 정규화한 뒤 계산 → 사용자 인식 ("D-3") 과 정합.
 *
 * 예시 (KST):
 *   - now 07-08 15:00, earnings 07-08 20:00 → 0  (오늘)
 *   - now 07-08 15:00, earnings 07-09 00:30 → 1  (내일)
 *   - now 07-08 00:01, earnings 07-11 23:59 → 3  (D-3)
 *   - now 07-08 23:59, earnings 07-09 00:00 → 1  (자정 넘어감 → D-1)
 * 이미 지난 어닝 (KST 어제 이전) → `null` → evaluator false.
 */
export function daysUntilEarnings(nextEarningsDate: Date | null | undefined, now: Date): number | null {
  if (!nextEarningsDate) return null
  const diffDays = kstDayDiff(nextEarningsDate, now)
  if (diffDays < 0) return null
  return diffDays
}

/** "HH:MM~HH:MM" 파싱 → 분 단위 [start, end]. wraparound (end < start) 도 허용. */
function parseTimeWindow(value: string): { start: number; end: number } | null {
  const m = value.match(TIME_WINDOW_RE)
  if (!m) return null
  const [, sh, sm, eh, em] = m
  return {
    start: parseInt(sh, 10) * 60 + parseInt(sm, 10),
    end: parseInt(eh, 10) * 60 + parseInt(em, 10),
  }
}

/**
 * 단일 Condition 평가. 데이터 부족 시 false (안전 default).
 * context 는 v2 조건 (time_window/weekday/holding_status) 평가용.
 */
export function evaluateCondition(
  cond: Condition,
  snapshot: MarketSnapshot,
  context: EvaluationContext,
): boolean {
  switch (cond.type) {
    case 'price': {
      const price = snapshot.price?.price
      if (price == null || typeof cond.value !== 'number') return false
      return compareNumeric(price, cond.operator, cond.value)
    }
    case 'rsi': {
      const rsi = snapshot.ta?.indicators.rsi14.value
      if (rsi == null || typeof cond.value !== 'number') return false
      return compareNumeric(rsi, cond.operator, cond.value)
    }
    case 'macd_signal': {
      const crossover = snapshot.ta?.indicators.macd.crossover
      if (!crossover || cond.operator !== 'is') return false
      return crossover === cond.value
    }
    case 'sma_cross': {
      if (cond.operator !== 'is') return false
      const golden = snapshot.ta?.indicators.sma.goldenCross === true
      const dead = snapshot.ta?.indicators.sma.deathCross === true
      if (cond.value === 'GOLDEN') return golden
      if (cond.value === 'DEAD') return dead
      return false
    }
    case 'bb_position': {
      if (cond.operator !== 'is') return false
      const pos = snapshot.ta?.indicators.bollingerBands.position
      if (!pos) return false
      // spec 은 BELOW_LOWER / ABOVE_UPPER 만 노출. TAReport 는 NEAR_LOWER/MIDDLE/NEAR_UPPER 도 있지만
      // 사용자가 명시적 극단 (LOWER/UPPER) 만 조건화 가능.
      return pos === cond.value
    }
    case 'change_pct': {
      if (typeof cond.value !== 'number') return false
      let pct: number | undefined
      if (cond.timeframe === '5d') pct = snapshot.ta?.price.change5d
      else if (cond.timeframe === '20d') pct = snapshot.ta?.price.change20d
      else pct = snapshot.price?.changePercent ?? snapshot.ta?.price.change1d
      if (pct == null) return false
      return compareNumeric(pct, cond.operator, cond.value)
    }
    // ── v2 —
    case 'time_window': {
      if (cond.operator !== 'is' || typeof cond.value !== 'string') return false
      const parsed = parseTimeWindow(cond.value)
      if (!parsed) return false
      const nowMin = kstMinutes(context.now)
      const { start, end } = parsed
      // start == end 는 순간만 true — 실무상 무의미. 사용자 편의로 항상 false 로 처리.
      if (start === end) return false
      // wraparound (예: 23:00~02:00): start ~ 24:00 또는 00:00 ~ end
      if (start > end) return nowMin >= start || nowMin < end
      // 정상 (예: 09:00~15:30): [start, end)
      return nowMin >= start && nowMin < end
    }
    case 'weekday': {
      if (cond.operator !== 'is' || !Array.isArray(cond.value)) return false
      const today = kstWeekday(context.now)
      return (cond.value as WeekdayCode[]).includes(today)
    }
    case 'holding_status': {
      if (cond.operator !== 'is' || typeof cond.value !== 'string') return false
      const isHeld = context.holdings.has(context.strategyTicker)
      if (cond.value === 'HELD') return isHeld
      if (cond.value === 'NOT_HELD') return !isHeld
      return false
    }
    // ── v3 (Phase 34-A #419) —
    case 'earnings_within_days': {
      if (typeof cond.value !== 'number') return false
      const days = daysUntilEarnings(snapshot.earnings?.nextEarningsDate ?? null, context.now)
      // 데이터 없음 or 과거 어닝만 있음 → false (안전측 — pre-earnings 회피 조건 사용 흐름 상)
      if (days == null) return false
      return compareNumeric(days, cond.operator, cond.value)
    }
    // ── v3 (Phase 34-B #420) / Phase 38-A (#448) —
    case 'cross_ticker': {
      if (typeof cond.value !== 'number') return false
      if (typeof cond.crossTicker !== 'string' || !cond.crossTicker.trim()) return false
      const metric = cond.metric
      // 자기 자신 참조 방지 — 사용자가 실수로 등록해도 무의미한 tautology 회피.
      const target = cond.crossTicker.trim().toUpperCase()
      if (target === context.strategyTicker) return false
      const cross = context.crossTickers?.get(target)
      if (!cross) return false

      switch (metric) {
        case 'price':
        case 'change_percent': {
          const actual = metric === 'price' ? cross.price : cross.changePercent
          if (actual == null || !Number.isFinite(actual)) return false
          return compareNumeric(actual, cond.operator, cond.value)
        }
        case 'rsi': {
          // TA 필드가 채워지지 않았으면 (TA fetch 스킵/실패) 안전측 false.
          if (cross.rsi == null || !Number.isFinite(cross.rsi)) return false
          return compareNumeric(cross.rsi, cond.operator, cond.value)
        }
        case 'macd_signal': {
          if (cond.operator !== '==') return false
          if (cross.macdCrossover === undefined) return false
          if (cond.value === 1) return cross.macdCrossover === 'GOLDEN'
          if (cond.value === -1) return cross.macdCrossover === 'DEAD'
          if (cond.value === 0) return cross.macdCrossover === 'NONE'
          return false
        }
        case 'sma_cross': {
          if (cond.operator !== '==') return false
          // Codex #457 P2: whipsaw 상황에서 golden/death 두 flag 가 동시에 true 일 수
          // 있음. 조건별로 정확한 flag 를 검사 (self-ticker case 167-172 와 동일 규칙).
          if (cond.value === 1) return cross.smaGoldenCross === true
          if (cond.value === -1) return cross.smaDeathCross === true
          return false
        }
        case 'bb_position': {
          if (cond.operator !== '==') return false
          if (cross.bbPosition === undefined) return false
          if (cond.value === 1) return cross.bbPosition === 'ABOVE_UPPER'
          if (cond.value === -1) return cross.bbPosition === 'BELOW_LOWER'
          if (cond.value === 0) return cross.bbPosition === 'WITHIN'
          return false
        }
        default:
          return false
      }
    }
    default:
      return false
  }
}

/**
 * Pure — 전략 집합에서 참조되는 모든 크로스 티커를 대문자 정규화하여 수집.
 * 자기 자신 참조 (strategyTicker == crossTicker) 는 evaluator 가 false 처리하지만
 * 수집 단계에서도 제외해 PriceCache 조회 최적화.
 */
export function collectCrossTickers(
  strategies: Array<{ ticker: string; conditions: unknown }>,
): Set<string> {
  const out = new Set<string>()
  for (const s of strategies) {
    const self = s.ticker.trim().toUpperCase()
    const raw = Array.isArray(s.conditions) ? (s.conditions as unknown[]) : []
    for (const c of raw) {
      if (!c || typeof c !== 'object') continue
      const cond = c as { type?: string; crossTicker?: string }
      if (cond.type !== 'cross_ticker') continue
      if (typeof cond.crossTicker !== 'string') continue
      const t = cond.crossTicker.trim().toUpperCase()
      if (!t || t === self) continue
      out.add(t)
    }
  }
  return out
}

/**
 * Phase 38-A (#448) — TA 리포트가 필요한 크로스 티커 metric 여부.
 */
const CROSS_TICKER_TA_METRICS = new Set<string>(['rsi', 'macd_signal', 'sma_cross', 'bb_position'])

/**
 * Phase 38-A (#448) — Pure — 조건 배열에서 크로스-티커 TA 리포트가 필요한 티커 집합.
 * `requiresTA(conditions)` 는 자기 티커의 TA 필요 여부만 판단.
 * 이 함수는 별도 — 자기 티커 조건과 크로스 티커 조건의 TA 필요성을 분리해
 * 호출자가 fetch 티커 집합을 dedupe (union) 하도록 지원.
 *
 * 반환값의 티커는 `trim().toUpperCase()` 정규화. 자기 자신 참조 티커는 excluded X
 * (evaluator 가 false 처리하지만 collectCrossTickers 와 동일하게 필터하지 않음 —
 * 호출자가 self-loop 여부를 이미 알고 있어 이중 필터 불필요, semantic 는 collectCrossTickers 참고).
 */
export function requiresTAForCrossTickers(conditions: Condition[]): Set<string> {
  const out = new Set<string>()
  for (const c of conditions) {
    if (c.type !== 'cross_ticker') continue
    if (typeof c.crossTicker !== 'string') continue
    if (typeof c.metric !== 'string') continue
    if (!CROSS_TICKER_TA_METRICS.has(c.metric)) continue
    const t = c.crossTicker.trim().toUpperCase()
    if (!t) continue
    out.add(t)
  }
  return out
}

/**
 * Phase 38-A (#448) — TA report 의 5-값 BB position 을 크로스-티커용 3-값으로 축약.
 * NEAR_UPPER / MIDDLE / NEAR_LOWER 는 모두 `WITHIN` — 사용자 조건 어휘 (극단/중간) 와 정합.
 */
export function mapCrossTickerBBPosition(pos: BBPosition): 'ABOVE_UPPER' | 'WITHIN' | 'BELOW_LOWER' {
  if (pos === 'ABOVE_UPPER') return 'ABOVE_UPPER'
  if (pos === 'BELOW_LOWER') return 'BELOW_LOWER'
  return 'WITHIN'
}

/**
 * Phase 38-A (#448) — 크로스-티커 스냅샷 빌더 (pure).
 * PriceCache 최소 정보 + (있으면) TAReport 를 병합해 evaluator 가 소비하는 shape 로 축소.
 * TA 리포트가 null 이면 TA 필드는 undefined 로 남겨 evaluator 가 false 처리.
 */
export function buildCrossTickerSnapshot(
  price: { price: number; changePercent: number | null },
  ta: TAReport | null,
): CrossTickerSnapshot {
  if (!ta) {
    return { price: price.price, changePercent: price.changePercent }
  }
  const { rsi14, macd, bollingerBands, sma } = ta.indicators
  // Codex #457 P2: golden/death 두 flag 를 독립 저장 (whipsaw 시 동시 true 케이스
  // 방어). 이전에는 GOLDEN 우선 축약 → DEAD 조건 방출 실패.
  return {
    price: price.price,
    changePercent: price.changePercent,
    rsi: Number.isFinite(rsi14.value) ? rsi14.value : undefined,
    macdCrossover: macd.crossover ?? 'NONE',
    bbPosition: mapCrossTickerBBPosition(bollingerBands.position),
    smaGoldenCross: sma.goldenCross === true,
    smaDeathCross: sma.deathCross === true,
  }
}

export interface EvaluationResult {
  satisfied: boolean
  perCondition: Array<{ condition: Condition; result: boolean }>
}

export function evaluateStrategy(
  conditions: Condition[],
  logic: 'AND' | 'OR',
  snapshot: MarketSnapshot,
  context: EvaluationContext,
): EvaluationResult {
  const perCondition = conditions.map((c) => ({
    condition: c,
    result: evaluateCondition(c, snapshot, context),
  }))
  const results = perCondition.map((p) => p.result)
  const satisfied = logic === 'AND' ? results.every(Boolean) : results.some(Boolean)
  return { satisfied, perCondition }
}
