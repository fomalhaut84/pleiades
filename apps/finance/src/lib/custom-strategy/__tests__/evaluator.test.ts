import { describe, expect, it } from 'vitest'
import {
  evaluateCondition,
  evaluateStrategy,
  requiresTA,
  type MarketSnapshot,
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

describe('evaluateCondition', () => {
  it('price < value satisfied', () => {
    const cond: Condition = { type: 'price', operator: '<', value: 200 }
    expect(evaluateCondition(cond, makeSnapshot())).toBe(true)
  })

  it('price > value not satisfied when equal', () => {
    const cond: Condition = { type: 'price', operator: '>', value: 100 }
    expect(evaluateCondition(cond, makeSnapshot())).toBe(false)
  })

  it('rsi <= value with TA report', () => {
    const cond: Condition = { type: 'rsi', operator: '<=', value: 30 }
    const ta = makeTAReport({
      indicators: {
        ...makeTAReport().indicators,
        rsi14: { value: 28, signal: 'OVERSOLD' },
      },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }))).toBe(true)
  })

  it('rsi missing TA → false', () => {
    const cond: Condition = { type: 'rsi', operator: '<=', value: 30 }
    expect(evaluateCondition(cond, makeSnapshot({ ta: null }))).toBe(false)
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
    expect(evaluateCondition(cond, makeSnapshot({ ta }))).toBe(true)
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
    expect(evaluateCondition(cond, makeSnapshot({ ta }))).toBe(true)
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
    expect(evaluateCondition(cond, makeSnapshot({ ta }))).toBe(true)
  })

  it('change_pct 5d 사용 → TA.change5d', () => {
    const cond: Condition = { type: 'change_pct', operator: '<=', value: -10, timeframe: '5d' }
    const ta = makeTAReport({
      price: { ...makeTAReport().price, change5d: -12 },
    })
    expect(evaluateCondition(cond, makeSnapshot({ ta }))).toBe(true)
  })

  it('change_pct 1d fallback → priceCache.changePercent', () => {
    const cond: Condition = { type: 'change_pct', operator: '<=', value: -5, timeframe: '1d' }
    const snap = makeSnapshot({
      price: { price: 100, changePercent: -6 },
    })
    expect(evaluateCondition(cond, snap)).toBe(true)
  })
})

describe('evaluateStrategy', () => {
  const c1: Condition = { type: 'price', operator: '<=', value: 200 }
  const c2: Condition = { type: 'price', operator: '>=', value: 50 }

  it('AND — 모두 만족', () => {
    const res = evaluateStrategy([c1, c2], 'AND', makeSnapshot())
    expect(res.satisfied).toBe(true)
    expect(res.perCondition).toHaveLength(2)
  })

  it('AND — 하나만 만족 → false', () => {
    const bad: Condition = { type: 'price', operator: '<', value: 50 }
    const res = evaluateStrategy([c1, bad], 'AND', makeSnapshot())
    expect(res.satisfied).toBe(false)
  })

  it('OR — 하나만 만족해도 true', () => {
    const bad: Condition = { type: 'price', operator: '<', value: 50 }
    const res = evaluateStrategy([c1, bad], 'OR', makeSnapshot())
    expect(res.satisfied).toBe(true)
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
})
