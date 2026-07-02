import { describe, expect, it } from 'vitest'
import {
  evaluateCondition,
  evaluateStrategy,
  requiresTA,
  type MarketSnapshot,
  type EvaluationContext,
} from '../evaluator'
import type { Condition } from '../types'
import type { TAReport } from '@/lib/ta/types'

function makeSnapshot(overrides?: Partial<MarketSnapshot>): MarketSnapshot {
  return {
    price: { price: 100, changePercent: 1.5 },
    ta: null,
    ...overrides,
  }
}

/**
 * 기본 context — 2026-01-05 (월) 10:00 UTC = 2026-01-05 19:00 KST.
 * 개별 테스트가 필요 시 오버라이드.
 */
function makeContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    now: new Date('2026-01-05T10:00:00Z'),
    holdings: new Set<string>(),
    strategyTicker: 'TEST',
    ...overrides,
  }
}

function makeTAReport(overrides: Partial<TAReport> = {}): TAReport {
  const base: TAReport = {
    ticker: 'TEST',
    period: '1d',
    price: {
      current: 100,
      change1d: 0,
      change5d: 0,
      change20d: 0,
      high52w: 200,
      low52w: 50,
      fromHigh52w: 50,
    },
    indicators: {
      rsi14: { value: 50, signal: 'NEUTRAL' },
      macd: { macd: 0, signal: 0, histogram: 0, trend: 'NEUTRAL' },
      bollingerBands: {
        upper: 110,
        middle: 100,
        lower: 90,
        position: 'MIDDLE',
        bandwidth: 20,
      },
      sma: { sma20: 100, sma50: 100, sma200: 100, priceVsSma20: 0 },
      volume: { current: 1_000_000, avg20d: 900_000, ratio: 1.1, surge: false },
    },
    support: [],
    resistance: [],
    signalSummary: { overall: 'NEUTRAL', reasons: [] },
  }
  return { ...base, ...overrides }
}

describe('evaluateCondition — v1', () => {
  const ctx = makeContext()

  it('price < value satisfied', () => {
    const cond: Condition = { type: 'price', operator: '<', value: 200 }
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('price > value not satisfied when equal', () => {
    const cond: Condition = { type: 'price', operator: '>', value: 100 }
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('rsi <= value with TA report', () => {
    const cond: Condition = { type: 'rsi', operator: '<=', value: 30 }
    const ta = makeTAReport({
      indicators: {
        ...makeTAReport().indicators,
        rsi14: { value: 28, signal: 'OVERSOLD' },
      },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }), ctx)).toBe(true)
  })

  it('rsi missing TA → false', () => {
    const cond: Condition = { type: 'rsi', operator: '<=', value: 30 }
    expect(evaluateCondition(cond, makeSnapshot({ ta: null }), ctx)).toBe(false)
  })

  it('macd_signal is GOLDEN', () => {
    const cond: Condition = { type: 'macd_signal', operator: 'is', value: 'GOLDEN' }
    const baseInd = makeTAReport().indicators
    const ta = makeTAReport({
      indicators: {
        ...baseInd,
        macd: { ...baseInd.macd, crossover: 'GOLDEN' },
      },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }), ctx)).toBe(true)
  })

  it('sma_cross is GOLDEN — golden true', () => {
    const cond: Condition = { type: 'sma_cross', operator: 'is', value: 'GOLDEN' }
    const baseInd = makeTAReport().indicators
    const ta = makeTAReport({
      indicators: {
        ...baseInd,
        sma: { ...baseInd.sma, goldenCross: true },
      },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }), ctx)).toBe(true)
  })

  it('bb_position is BELOW_LOWER', () => {
    const cond: Condition = { type: 'bb_position', operator: 'is', value: 'BELOW_LOWER' }
    const baseInd = makeTAReport().indicators
    const ta = makeTAReport({
      indicators: {
        ...baseInd,
        bollingerBands: { ...baseInd.bollingerBands, position: 'BELOW_LOWER' },
      },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }), ctx)).toBe(true)
  })

  it('change_pct 5d 사용 → TA.change5d', () => {
    const cond: Condition = { type: 'change_pct', operator: '<=', value: -10, timeframe: '5d' }
    const ta = makeTAReport({
      price: { ...makeTAReport().price, change5d: -12 },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }), ctx)).toBe(true)
  })

  it('change_pct 1d fallback → priceCache.changePercent', () => {
    const cond: Condition = { type: 'change_pct', operator: '<=', value: -5, timeframe: '1d' }
    const snap = makeSnapshot({
      price: { price: 100, changePercent: -6 },
    })
    expect(evaluateCondition(cond, snap, ctx)).toBe(true)
  })
})

describe('evaluateCondition — v2 time_window', () => {
  it('KST 정상 범위 내 (09:00~15:30, KST 12:00)', () => {
    // 2026-01-05 03:00 UTC = 12:00 KST
    const cond: Condition = { type: 'time_window', operator: 'is', value: '09:00~15:30' }
    const ctx = makeContext({ now: new Date('2026-01-05T03:00:00Z') })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('KST 정상 범위 밖 (09:00~15:30, KST 16:00)', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: '09:00~15:30' }
    const ctx = makeContext({ now: new Date('2026-01-05T07:00:00Z') }) // 16:00 KST
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('KST 정상 범위 경계 시작은 포함 (09:00~15:30, KST 09:00)', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: '09:00~15:30' }
    const ctx = makeContext({ now: new Date('2026-01-05T00:00:00Z') }) // 09:00 KST
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('KST 정상 범위 경계 끝은 제외 [half-open, 15:30 KST → false]', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: '09:00~15:30' }
    const ctx = makeContext({ now: new Date('2026-01-05T06:30:00Z') }) // 15:30 KST
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('KST wraparound 범위 (23:00~02:00, KST 00:30)', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: '23:00~02:00' }
    const ctx = makeContext({ now: new Date('2026-01-05T15:30:00Z') }) // 00:30 KST
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('KST wraparound 범위 밖 (23:00~02:00, KST 10:00)', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: '23:00~02:00' }
    const ctx = makeContext({ now: new Date('2026-01-05T01:00:00Z') }) // 10:00 KST
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('start == end → 항상 false (0-duration 방어)', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: '09:00~09:00' }
    const ctx = makeContext({ now: new Date('2026-01-05T00:00:00Z') })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('잘못된 포맷 → false', () => {
    const cond: Condition = { type: 'time_window', operator: 'is', value: 'noon' }
    expect(evaluateCondition(cond, makeSnapshot(), makeContext())).toBe(false)
  })
})

describe('evaluateCondition — v2 weekday', () => {
  it('KST 월요일 매칭 (2026-01-05 은 월요일)', () => {
    // 2026-01-05 UTC = 2026-01-05 KST (동일 date), 요일=MON
    const cond: Condition = { type: 'weekday', operator: 'is', value: ['MON', 'TUE', 'WED', 'THU', 'FRI'] }
    const ctx = makeContext({ now: new Date('2026-01-05T03:00:00Z') })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('KST 토요일 매칭 X (2026-01-05 월요일 리스트에 SAT 없음)', () => {
    const cond: Condition = { type: 'weekday', operator: 'is', value: ['SAT', 'SUN'] }
    const ctx = makeContext({ now: new Date('2026-01-05T03:00:00Z') })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('KST 요일 boundary — UTC 자정 근처의 KST 는 다음날', () => {
    // 2026-01-04 20:00 UTC = 2026-01-05 05:00 KST → MON
    const cond: Condition = { type: 'weekday', operator: 'is', value: ['MON'] }
    const ctx = makeContext({ now: new Date('2026-01-04T20:00:00Z') })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('KST 요일 boundary — UTC 오후 → KST 다음날 새벽 → 요일 SUN 매칭', () => {
    // 2026-01-03 22:00 UTC = 2026-01-04 07:00 KST → SUN (2026-01-04 은 일요일)
    const cond: Condition = { type: 'weekday', operator: 'is', value: ['SUN'] }
    const ctx = makeContext({ now: new Date('2026-01-03T22:00:00Z') })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })
})

describe('evaluateCondition — v2 holding_status', () => {
  it('HELD — 보유 중 매칭', () => {
    const cond: Condition = { type: 'holding_status', operator: 'is', value: 'HELD' }
    const ctx = makeContext({ holdings: new Set(['SOXL']), strategyTicker: 'SOXL' })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('HELD — 미보유 시 false', () => {
    const cond: Condition = { type: 'holding_status', operator: 'is', value: 'HELD' }
    const ctx = makeContext({ holdings: new Set(['NVDA']), strategyTicker: 'SOXL' })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })

  it('NOT_HELD — 미보유 매칭', () => {
    const cond: Condition = { type: 'holding_status', operator: 'is', value: 'NOT_HELD' }
    const ctx = makeContext({ holdings: new Set(['NVDA']), strategyTicker: 'SOXL' })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(true)
  })

  it('NOT_HELD — 보유 중 시 false', () => {
    const cond: Condition = { type: 'holding_status', operator: 'is', value: 'NOT_HELD' }
    const ctx = makeContext({ holdings: new Set(['SOXL']), strategyTicker: 'SOXL' })
    expect(evaluateCondition(cond, makeSnapshot(), ctx)).toBe(false)
  })
})

describe('evaluateStrategy', () => {
  const c1: Condition = { type: 'price', operator: '<=', value: 200 }
  const c2: Condition = { type: 'price', operator: '>=', value: 50 }
  const ctx = makeContext()

  it('AND — 모두 만족', () => {
    const res = evaluateStrategy([c1, c2], 'AND', makeSnapshot(), ctx)
    expect(res.satisfied).toBe(true)
    expect(res.perCondition).toHaveLength(2)
  })

  it('AND — 하나만 만족 → false', () => {
    const bad: Condition = { type: 'price', operator: '<', value: 50 }
    const res = evaluateStrategy([c1, bad], 'AND', makeSnapshot(), ctx)
    expect(res.satisfied).toBe(false)
  })

  it('OR — 하나만 만족해도 true', () => {
    const bad: Condition = { type: 'price', operator: '<', value: 50 }
    const res = evaluateStrategy([c1, bad], 'OR', makeSnapshot(), ctx)
    expect(res.satisfied).toBe(true)
  })

  it('v1 + v2 조건 혼합 (price + time_window 평일 장시간만)', () => {
    const price: Condition = { type: 'price', operator: '<=', value: 200 }
    const window: Condition = { type: 'time_window', operator: 'is', value: '09:00~15:30' }
    // KST 12:00 (2026-01-05 03:00 UTC)
    const c = makeContext({ now: new Date('2026-01-05T03:00:00Z') })
    expect(evaluateStrategy([price, window], 'AND', makeSnapshot(), c).satisfied).toBe(true)
    // 장 종료 후: KST 16:00 (07:00 UTC)
    const c2 = makeContext({ now: new Date('2026-01-05T07:00:00Z') })
    expect(evaluateStrategy([price, window], 'AND', makeSnapshot(), c2).satisfied).toBe(false)
  })
})

describe('requiresTA', () => {
  it('price 조건만 → false', () => {
    expect(requiresTA([{ type: 'price', operator: '<', value: 100 }])).toBe(false)
  })

  it('change_pct 1d → false (priceCache 로 충분)', () => {
    expect(requiresTA([{ type: 'change_pct', operator: '<', value: -5, timeframe: '1d' }])).toBe(false)
  })

  it('change_pct 5d → true', () => {
    expect(requiresTA([{ type: 'change_pct', operator: '<', value: -10, timeframe: '5d' }])).toBe(true)
  })

  it('rsi → true', () => {
    expect(requiresTA([{ type: 'rsi', operator: '<=', value: 30 }])).toBe(true)
  })

  it('v2 조건들 (time_window / weekday / holding_status) → TA 불필요', () => {
    expect(requiresTA([{ type: 'time_window', operator: 'is', value: '09:00~15:30' }])).toBe(false)
    expect(requiresTA([{ type: 'weekday', operator: 'is', value: ['MON'] }])).toBe(false)
    expect(requiresTA([{ type: 'holding_status', operator: 'is', value: 'HELD' }])).toBe(false)
  })
})
