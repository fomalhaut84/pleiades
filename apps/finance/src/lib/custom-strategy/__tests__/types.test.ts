import { describe, expect, it } from 'vitest'
import {
  validateCondition,
  validateParsedStrategy,
  conditionToString,
} from '../types'

describe('validateCondition', () => {
  it('price 숫자 조건 유효', () => {
    expect(validateCondition({ type: 'price', operator: '<=', value: 40 })).toBe(true)
  })

  it('price 문자열 값 → 무효', () => {
    expect(validateCondition({ type: 'price', operator: '<=', value: 'cheap' })).toBe(false)
  })

  it('macd_signal is GOLDEN 유효', () => {
    expect(validateCondition({ type: 'macd_signal', operator: 'is', value: 'GOLDEN' })).toBe(true)
  })

  it('macd_signal is FOO → 무효 (allowed 아님)', () => {
    expect(validateCondition({ type: 'macd_signal', operator: 'is', value: 'FOO' })).toBe(false)
  })

  it('bb_position is INSIDE → 무효 (v1 미지원)', () => {
    expect(validateCondition({ type: 'bb_position', operator: 'is', value: 'INSIDE' })).toBe(false)
  })

  it('bb_position is BELOW_LOWER 유효', () => {
    expect(validateCondition({ type: 'bb_position', operator: 'is', value: 'BELOW_LOWER' })).toBe(true)
  })

  it('rsi <= 숫자 유효', () => {
    expect(validateCondition({ type: 'rsi', operator: '<=', value: 30 })).toBe(true)
  })

  it('rsi is GOLDEN → 무효 (문자열 op)', () => {
    expect(validateCondition({ type: 'rsi', operator: 'is', value: 'GOLDEN' })).toBe(false)
  })

  it('change_pct with 5d timeframe 유효', () => {
    expect(
      validateCondition({ type: 'change_pct', operator: '<', value: -5, timeframe: '5d' }),
    ).toBe(true)
  })

  it('change_pct with 30d timeframe → 무효 (v1 미지원)', () => {
    expect(
      validateCondition({ type: 'change_pct', operator: '<', value: -5, timeframe: '30d' }),
    ).toBe(false)
  })

  it('change_pct 는 timeframe 필수 — 없으면 무효', () => {
    expect(
      validateCondition({ type: 'change_pct', operator: '<', value: -5 }),
    ).toBe(false)
  })

  it('unknown type → 무효', () => {
    expect(validateCondition({ type: 'volume', operator: '>', value: 1000 })).toBe(false)
  })

  it('NaN value → 무효', () => {
    expect(validateCondition({ type: 'price', operator: '<', value: NaN })).toBe(false)
  })
})

describe('validateParsedStrategy', () => {
  it('완전 유효', () => {
    expect(
      validateParsedStrategy({
        name: 'SOXL 저점',
        ticker: 'SOXL',
        conditions: [{ type: 'price', operator: '<=', value: 40 }],
        logic: 'AND',
        frequency: 'daily',
      }),
    ).toBe(true)
  })

  it('빈 조건 배열 → 무효', () => {
    expect(
      validateParsedStrategy({
        name: 'x',
        ticker: 'SOXL',
        conditions: [],
        logic: 'AND',
        frequency: 'daily',
      }),
    ).toBe(false)
  })

  it('알 수 없는 logic → 무효', () => {
    expect(
      validateParsedStrategy({
        name: 'x',
        ticker: 'SOXL',
        conditions: [{ type: 'price', operator: '<=', value: 40 }],
        logic: 'XOR',
        frequency: 'daily',
      }),
    ).toBe(false)
  })

  it('알 수 없는 frequency → 무효', () => {
    expect(
      validateParsedStrategy({
        name: 'x',
        ticker: 'SOXL',
        conditions: [{ type: 'price', operator: '<=', value: 40 }],
        logic: 'AND',
        frequency: 'hourly',
      }),
    ).toBe(false)
  })
})

describe('conditionToString', () => {
  it('price 조건', () => {
    expect(
      conditionToString({ type: 'price', operator: '<=', value: 40 }),
    ).toBe('price <= 40')
  })

  it('change_pct with timeframe', () => {
    expect(
      conditionToString({ type: 'change_pct', operator: '<', value: -5, timeframe: '5d' }),
    ).toBe('change_pct(5d) < -5')
  })
})
