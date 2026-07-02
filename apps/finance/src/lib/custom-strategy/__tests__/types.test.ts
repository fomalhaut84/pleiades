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

  // ── v2 (Phase 31-A) —
  describe('time_window (v2)', () => {
    it('유효한 HH:MM~HH:MM', () => {
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '09:00~15:30' })).toBe(true)
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '23:00~02:00' })).toBe(true)
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '00:00~23:59' })).toBe(true)
    })
    it('range 밖 시각 → 무효', () => {
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '24:00~05:00' })).toBe(false)
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '09:60~10:00' })).toBe(false)
    })
    it('잘못된 포맷 → 무효', () => {
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '9:00~15:00' })).toBe(false)
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '09:00-15:00' })).toBe(false)
      expect(validateCondition({ type: 'time_window', operator: 'is', value: '오전 9시' })).toBe(false)
    })
    it('operator 가 is 아니면 무효', () => {
      expect(validateCondition({ type: 'time_window', operator: '<', value: '09:00~15:00' })).toBe(false)
    })
  })

  describe('weekday (v2)', () => {
    it('유효한 요일 배열', () => {
      expect(validateCondition({ type: 'weekday', operator: 'is', value: ['MON', 'TUE', 'WED', 'THU', 'FRI'] })).toBe(true)
      expect(validateCondition({ type: 'weekday', operator: 'is', value: ['SAT'] })).toBe(true)
    })
    it('빈 배열 → 무효 (의미 없음)', () => {
      expect(validateCondition({ type: 'weekday', operator: 'is', value: [] })).toBe(false)
    })
    it('알 수 없는 요일 코드 → 무효', () => {
      expect(validateCondition({ type: 'weekday', operator: 'is', value: ['MON', 'MONDAY'] })).toBe(false)
      expect(validateCondition({ type: 'weekday', operator: 'is', value: ['mon'] })).toBe(false)
    })
    it('중복 요일 → 무효 (정규화 요구)', () => {
      expect(validateCondition({ type: 'weekday', operator: 'is', value: ['MON', 'MON'] })).toBe(false)
    })
    it('문자열/숫자 값 → 무효', () => {
      expect(validateCondition({ type: 'weekday', operator: 'is', value: 'MON' })).toBe(false)
      expect(validateCondition({ type: 'weekday', operator: 'is', value: 1 })).toBe(false)
    })
  })

  describe('holding_status (v2)', () => {
    it('HELD / NOT_HELD 유효', () => {
      expect(validateCondition({ type: 'holding_status', operator: 'is', value: 'HELD' })).toBe(true)
      expect(validateCondition({ type: 'holding_status', operator: 'is', value: 'NOT_HELD' })).toBe(true)
    })
    it('기타 값 → 무효', () => {
      expect(validateCondition({ type: 'holding_status', operator: 'is', value: 'held' })).toBe(false)
      expect(validateCondition({ type: 'holding_status', operator: 'is', value: 'OWNED' })).toBe(false)
    })
    it('operator 가 is 아니면 무효', () => {
      expect(validateCondition({ type: 'holding_status', operator: '<', value: 'HELD' })).toBe(false)
    })
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

  it('weekday 는 배열을 [MON,FRI] 형태로 표시', () => {
    expect(
      conditionToString({ type: 'weekday', operator: 'is', value: ['MON', 'FRI'] }),
    ).toBe('weekday is [MON,FRI]')
  })

  it('time_window 문자열 그대로', () => {
    expect(
      conditionToString({ type: 'time_window', operator: 'is', value: '09:00~15:30' }),
    ).toBe('time_window is 09:00~15:30')
  })

  it('holding_status', () => {
    expect(
      conditionToString({ type: 'holding_status', operator: 'is', value: 'HELD' }),
    ).toBe('holding_status is HELD')
  })
})
