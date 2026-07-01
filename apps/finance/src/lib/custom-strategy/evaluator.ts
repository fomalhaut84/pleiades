/**
 * Custom strategy condition evaluator — 순수 코드 평가 (매번 AI 호출 X).
 *
 * 입력:
 *   - Condition[]: 사용자 정의 조건 (parser 로 자연어 파싱된 결과)
 *   - MarketSnapshot: priceCache + (필요 시) TAReport
 *
 * 출력: 각 조건 만족 여부 boolean[] → logic (AND/OR) 결합 → 최종 만족 여부
 */

import type { Condition } from './types'
import type { TAReport } from '@/lib/ta/types'

export interface PriceSnapshot {
  price: number
  changePercent: number | null
}

export interface MarketSnapshot {
  price: PriceSnapshot | null
  ta: TAReport | null
}

/** 지원 조건 타입 중 TA 필요 여부 판단 — 평가 전에 TAReport fetch 여부 결정 */
export function requiresTA(conditions: Condition[]): boolean {
  return conditions.some((c) =>
    c.type === 'rsi' ||
    c.type === 'macd_signal' ||
    c.type === 'sma_cross' ||
    c.type === 'bb_position' ||
    (c.type === 'change_pct' && c.timeframe !== '1d') // 1d 는 priceCache 로 충분
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

/** 단일 Condition 평가. 데이터 부족 시 false (안전 default). */
export function evaluateCondition(cond: Condition, snapshot: MarketSnapshot): boolean {
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
): EvaluationResult {
  const perCondition = conditions.map((c) => ({
    condition: c,
    result: evaluateCondition(c, snapshot),
  }))
  const results = perCondition.map((p) => p.result)
  const satisfied = logic === 'AND' ? results.every(Boolean) : results.some(Boolean)
  return { satisfied, perCondition }
}
