/**
 * Phase 37-A (#444) — AlertHistoryContext 빌더 pure test.
 * 각 kind × 필드 채움/누락 시나리오. hook 회귀 방지용.
 */

import { describe, expect, it } from 'vitest'
import {
  buildPriceContext,
  buildFxContext,
  buildTaContext,
  buildCustomStrategyContext,
  isValidContext,
} from '../context'
import type { TAReport } from '@/lib/ta/types'
import type { Condition } from '@/lib/custom-strategy/types'

function fakeReport(overrides: Partial<TAReport['indicators']> = {}): TAReport {
  return {
    ticker: 'AAPL',
    period: '6mo',
    price: {
      current: 150,
      change1d: 1.2,
      change5d: 3.5,
      change20d: -2.1,
      high52w: 200,
      low52w: 100,
      fromHigh52w: -25,
    },
    indicators: {
      rsi14: { value: 32.1, signal: 'OVERSOLD' },
      macd: { macd: 0.2, signal: 0.1, histogram: 0.1, trend: 'BULLISH', crossover: 'GOLDEN' },
      bollingerBands: { upper: 160, middle: 150, lower: 140, position: 'BELOW_LOWER', bandwidth: 0.13 },
      sma: { sma20: 145, sma50: 140, sma200: 130, priceVsSma20: 3.4, goldenCross: true, deathCross: false },
      volume: { current: 100_000_000, avg20d: 50_000_000, ratio: 2.0, surge: true },
      ...overrides,
    },
    support: [140, 130],
    resistance: [160, 180],
    signalSummary: { overall: 'STRONG_BUY', reasons: ['RSI 과매도', 'MACD 골든크로스'] },
  }
}

describe('buildPriceContext', () => {
  it('surge/drop/target_hit/stop_loss/watch_buy/watch_zone 모두 동일 shape', () => {
    const types = ['surge', 'drop', 'target_hit', 'stop_loss', 'watch_buy', 'watch_zone'] as const
    for (const t of types) {
      const ctx = buildPriceContext({
        type: t,
        price: 150,
        changePercent: -5.2,
        threshold: 100,
        marketOpen: true,
      })
      expect(ctx.type).toBe(t)
      expect(ctx.price).toBe(150)
      expect(ctx.changePercent).toBe(-5.2)
      expect(ctx.threshold).toBe(100)
      expect(ctx.marketOpen).toBe(true)
      expect(isValidContext(ctx)).toBe(true)
    }
  })

  it('optional 필드 미지정 시 null 로 정규화', () => {
    const ctx = buildPriceContext({
      type: 'surge',
      price: 150,
      changePercent: null,
      marketOpen: null,
    })
    expect(ctx.threshold).toBeNull()
    expect(ctx.marketOpen).toBeNull()
    expect(ctx.changePercent).toBeNull()
  })
})

describe('buildFxContext', () => {
  it('환율 필드 그대로 저장', () => {
    const ctx = buildFxContext({ rate: 1330, changeKrw: 55, changePercent: 4.3 })
    expect(ctx.type).toBe('fx')
    expect(ctx.rate).toBe(1330)
    expect(ctx.changeKrw).toBe(55)
    expect(ctx.changePercent).toBe(4.3)
    expect(isValidContext(ctx)).toBe(true)
  })

  it('changeKrw null 허용', () => {
    const ctx = buildFxContext({ rate: 1330, changeKrw: null, changePercent: null })
    expect(ctx.changeKrw).toBeNull()
    expect(ctx.changePercent).toBeNull()
  })
})

describe('buildTaContext', () => {
  it('TAReport 에서 지표 발췌', () => {
    const report = fakeReport()
    const ctx = buildTaContext({
      report,
      price: 150,
      changePercent: 1.2,
      signals: ['RSI_OVERSOLD', 'MACD_GOLDEN'],
    })
    expect(ctx.type).toBe('ta_signal')
    expect(ctx.rsi).toBeCloseTo(32.1)
    expect(ctx.macdCrossover).toBe('GOLDEN')
    expect(ctx.bbPosition).toBe('BELOW_LOWER')
    expect(ctx.smaGoldenCross).toBe(true)
    expect(ctx.smaDeathCross).toBe(false)
    expect(ctx.volumeSurge).toBe(true)
    expect(ctx.signals).toEqual(['RSI_OVERSOLD', 'MACD_GOLDEN'])
    expect(ctx.overall).toBe('STRONG_BUY')
    expect(isValidContext(ctx)).toBe(true)
  })

  it('crossover 없을 때 null', () => {
    const report = fakeReport({
      macd: { macd: 0, signal: 0, histogram: 0, trend: 'NEUTRAL' },
    })
    const ctx = buildTaContext({ report, price: null, changePercent: null, signals: [] })
    expect(ctx.macdCrossover).toBeNull()
    expect(ctx.signals).toEqual([])
  })

  it('signals 배열은 얕은 복사 (mutation isolation)', () => {
    const signals = ['RSI_OVERSOLD']
    const ctx = buildTaContext({ report: fakeReport(), price: 150, changePercent: 1, signals })
    signals.push('MACD_GOLDEN')
    expect(ctx.signals).toEqual(['RSI_OVERSOLD']) // 원본 mutation 이 컨텍스트에 반영 X
  })
})

describe('buildCustomStrategyContext', () => {
  const cond1: Condition = { type: 'rsi', operator: '<', value: 30 }
  const cond2: Condition = { type: 'price', operator: '>', value: 100 }

  it('conditions + perCondition 저장 + snapshot 통과', () => {
    const ctx = buildCustomStrategyContext({
      strategyId: 'strat_1',
      strategyName: 'SOXL 저점',
      strategyTicker: 'SOXL',
      logic: 'AND',
      conditions: [cond1, cond2],
      perCondition: [
        { condition: cond1, result: true },
        { condition: cond2, result: false },
      ],
      snapshot: { price: 25.4, changePercent: -1.2, rsi: 28.5 },
    })
    expect(ctx.type).toBe('custom_strategy')
    expect(ctx.strategyId).toBe('strat_1')
    expect(ctx.strategyTicker).toBe('SOXL')
    expect(ctx.logic).toBe('AND')
    expect(ctx.conditions).toHaveLength(2)
    expect(ctx.perCondition).toHaveLength(2)
    expect(ctx.perCondition[0].result).toBe(true)
    expect(ctx.snapshot?.price).toBe(25.4)
    expect(isValidContext(ctx)).toBe(true)
  })

  it('conditions 얕은 복사 — 원본 변경이 컨텍스트에 영향 없음', () => {
    const conds: Condition[] = [{ ...cond1 }]
    const ctx = buildCustomStrategyContext({
      strategyId: 'x',
      strategyName: 'n',
      strategyTicker: 'X',
      logic: 'AND',
      conditions: conds,
      perCondition: [{ condition: conds[0], result: true }],
    })
    conds[0].value = 999
    expect((ctx.conditions[0] as Condition).value).toBe(30)
    expect((ctx.perCondition[0].condition as Condition).value).toBe(30)
  })

  it('snapshot 없이도 유효', () => {
    const ctx = buildCustomStrategyContext({
      strategyId: 'x',
      strategyName: 'n',
      strategyTicker: 'X',
      logic: 'OR',
      conditions: [cond1],
      perCondition: [{ condition: cond1, result: true }],
    })
    expect(ctx.snapshot).toBeUndefined()
    expect(isValidContext(ctx)).toBe(true)
  })
})

describe('isValidContext', () => {
  it('알려진 type 만 통과', () => {
    expect(isValidContext({ type: 'surge' })).toBe(true)
    expect(isValidContext({ type: 'drop' })).toBe(true)
    expect(isValidContext({ type: 'fx' })).toBe(true)
    expect(isValidContext({ type: 'ta_signal' })).toBe(true)
    expect(isValidContext({ type: 'custom_strategy' })).toBe(true)
    expect(isValidContext({ type: 'watch_buy' })).toBe(true)
    expect(isValidContext({ type: 'watch_zone' })).toBe(true)
    expect(isValidContext({ type: 'target_hit' })).toBe(true)
    expect(isValidContext({ type: 'stop_loss' })).toBe(true)
  })

  it('알 수 없는 shape 은 거부', () => {
    expect(isValidContext(null)).toBe(false)
    expect(isValidContext(undefined)).toBe(false)
    expect(isValidContext('string')).toBe(false)
    expect(isValidContext(42)).toBe(false)
    expect(isValidContext({})).toBe(false)
    expect(isValidContext({ type: 'unknown_kind' })).toBe(false)
    expect(isValidContext({ type: 42 })).toBe(false)
  })
})
