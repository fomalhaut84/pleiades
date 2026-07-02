/**
 * Custom strategy condition evaluator — 순수 코드 평가 (매번 AI 호출 X).
 *
 * v1 (Phase 29-E): price/rsi/macd_signal/sma_cross/bb_position/change_pct
 * v2 (Phase 31-A): time_window/weekday/holding_status
 *
 * 입력:
 *   - Condition[]: 사용자 정의 조건 (parser 로 자연어 파싱된 결과)
 *   - MarketSnapshot: priceCache + (필요 시) TAReport
 *   - EvaluationContext: 시각 + 보유 티커 (v2 조건 대비)
 *
 * 출력: 각 조건 만족 여부 boolean[] → logic (AND/OR) 결합 → 최종 만족 여부
 */

import type { Condition, WeekdayCode } from './types'
import { TIME_WINDOW_RE } from './types'
import type { TAReport } from '@/lib/ta/types'

export interface PriceSnapshot {
  price: number
  changePercent: number | null
}

export interface MarketSnapshot {
  price: PriceSnapshot | null
  ta: TAReport | null
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
    default:
      return false
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
