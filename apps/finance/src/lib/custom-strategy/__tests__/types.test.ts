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

  it('earnings_within_days 정수 (v3)', () => {
    expect(
      conditionToString({ type: 'earnings_within_days', operator: '<=', value: 3 }),
    ).toBe('earnings_within_days <= 3')
  })
})

describe('earnings_within_days (v3, Phase 34-A / #419)', () => {
  it('숫자 연산자 5개 모두 허용, 정수 값', () => {
    for (const op of ['<', '<=', '>', '>=', '==']) {
      expect(
        validateCondition({ type: 'earnings_within_days', operator: op, value: 3 }),
      ).toBe(true)
    }
  })

  it('음수 값 거부 (미래 카운트다운 의미상)', () => {
    expect(
      validateCondition({ type: 'earnings_within_days', operator: '>=', value: -1 }),
    ).toBe(false)
  })

  it('소수 값 거부 (일 단위 정수만)', () => {
    expect(
      validateCondition({ type: 'earnings_within_days', operator: '<=', value: 1.5 }),
    ).toBe(false)
  })

  it('is 연산자 거부 (numeric 타입)', () => {
    expect(
      validateCondition({ type: 'earnings_within_days', operator: 'is', value: 3 }),
    ).toBe(false)
  })

  it('value 문자열 거부', () => {
    expect(
      validateCondition({ type: 'earnings_within_days', operator: '<=', value: '3' }),
    ).toBe(false)
  })

  it('0 (오늘 어닝) 허용', () => {
    expect(
      validateCondition({ type: 'earnings_within_days', operator: '==', value: 0 }),
    ).toBe(true)
  })
})

describe('cross_ticker (v3, Phase 34-B / #420)', () => {
  it('필수 필드 (crossTicker + metric + operator + value) 모두 있으면 통과', () => {
    expect(validateCondition({
      type: 'cross_ticker', operator: '<=', value: -2,
      crossTicker: 'SPY', metric: 'change_percent',
    })).toBe(true)
    expect(validateCondition({
      type: 'cross_ticker', operator: '>', value: 25,
      crossTicker: 'VIX', metric: 'price',
    })).toBe(true)
  })

  it('crossTicker 누락 → false', () => {
    expect(validateCondition({
      type: 'cross_ticker', operator: '<=', value: 0, metric: 'price',
    })).toBe(false)
  })

  it('crossTicker 빈 문자열 → false', () => {
    expect(validateCondition({
      type: 'cross_ticker', operator: '<=', value: 0, crossTicker: '   ', metric: 'price',
    })).toBe(false)
  })

  it('metric 화이트리스트 외 → false', () => {
    // Phase 38-A (#448) 이후 rsi/macd_signal/sma_cross/bb_position 도 유효.
    // 여전히 무효인 임의 문자열 metric 으로 확인.
    expect(validateCondition({
      type: 'cross_ticker', operator: '<=', value: 0,
      crossTicker: 'SPY', metric: 'volume',
    })).toBe(false)
    expect(validateCondition({
      type: 'cross_ticker', operator: '<=', value: 0, crossTicker: 'SPY',
    })).toBe(false)
  })

  it('is 연산자 거부 (numeric 타입)', () => {
    expect(validateCondition({
      type: 'cross_ticker', operator: 'is', value: 0,
      crossTicker: 'SPY', metric: 'price',
    })).toBe(false)
  })
})

describe('conditionToString — cross_ticker', () => {
  it('SPY.change_percent <= -2 형태', () => {
    expect(conditionToString({
      type: 'cross_ticker', operator: '<=', value: -2,
      crossTicker: 'SPY', metric: 'change_percent',
    })).toBe('SPY.change_percent <= -2')
  })
})

describe('cross_ticker TA metric (Phase 38-A / #448)', () => {
  describe('validateCondition — rsi', () => {
    it('SPY.rsi >= 70 유효 (숫자 op + 0~100)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '>=', value: 70,
        crossTicker: 'SPY', metric: 'rsi',
      })).toBe(true)
    })

    it('rsi 값 -1 → false (0 미만)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '<=', value: -1,
        crossTicker: 'SPY', metric: 'rsi',
      })).toBe(false)
    })

    it('rsi 값 101 → false (100 초과)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '>=', value: 101,
        crossTicker: 'SPY', metric: 'rsi',
      })).toBe(false)
    })

    it('rsi 임의 numeric op 모두 허용 (< / <= / > / >= / ==)', () => {
      for (const op of ['<', '<=', '>', '>=', '==']) {
        expect(validateCondition({
          type: 'cross_ticker', operator: op, value: 50,
          crossTicker: 'SPY', metric: 'rsi',
        })).toBe(true)
      }
    })
  })

  describe('validateCondition — macd_signal (== 만, threshold ∈ {-1,0,1})', () => {
    it('== 1 (GOLDEN) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 1,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe(true)
    })
    it('== 0 (NONE) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 0,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe(true)
    })
    it('== -1 (DEAD) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: -1,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe(true)
    })
    it('== 2 → 무효 (허용 집합 밖)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 2,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe(false)
    })
    it('>= 1 → 무효 (== 만 허용)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '>=', value: 1,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe(false)
    })
    it('== 0.5 → 무효 (정수만)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 0.5,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe(false)
    })
  })

  describe('validateCondition — sma_cross (== 만, threshold ∈ {-1,1})', () => {
    it('== 1 (GOLDEN) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 1,
        crossTicker: 'SPY', metric: 'sma_cross',
      })).toBe(true)
    })
    it('== -1 (DEAD) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: -1,
        crossTicker: 'SPY', metric: 'sma_cross',
      })).toBe(true)
    })
    it('== 0 → 무효 (sma_cross 는 NONE 없음)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 0,
        crossTicker: 'SPY', metric: 'sma_cross',
      })).toBe(false)
    })
    it('< -1 → 무효 (== 아님)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '<', value: -1,
        crossTicker: 'SPY', metric: 'sma_cross',
      })).toBe(false)
    })
  })

  describe('validateCondition — bb_position (== 만, threshold ∈ {-1,0,1})', () => {
    it('== 1 (ABOVE_UPPER) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 1,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe(true)
    })
    it('== 0 (WITHIN) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 0,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe(true)
    })
    it('== -1 (BELOW_LOWER) 유효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: -1,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe(true)
    })
    it('== 3 → 무효', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '==', value: 3,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe(false)
    })
    it('> 0 → 무효 (== 만)', () => {
      expect(validateCondition({
        type: 'cross_ticker', operator: '>', value: 0,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe(false)
    })
  })

  describe('conditionToString — 카테고리컬 metric 은 라벨로 렌더', () => {
    it('macd_signal 1 → GOLDEN', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '==', value: 1,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe('SPY.macd_signal == GOLDEN')
    })
    it('macd_signal -1 → DEAD', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '==', value: -1,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe('SPY.macd_signal == DEAD')
    })
    it('macd_signal 0 → NONE', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '==', value: 0,
        crossTicker: 'SPY', metric: 'macd_signal',
      })).toBe('SPY.macd_signal == NONE')
    })
    it('sma_cross 1 → GOLDEN', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '==', value: 1,
        crossTicker: 'SPY', metric: 'sma_cross',
      })).toBe('SPY.sma_cross == GOLDEN')
    })
    it('bb_position -1 → BELOW_LOWER', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '==', value: -1,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe('SPY.bb_position == BELOW_LOWER')
    })
    it('bb_position 0 → WITHIN', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '==', value: 0,
        crossTicker: 'SPY', metric: 'bb_position',
      })).toBe('SPY.bb_position == WITHIN')
    })
    it('rsi 는 라벨링 없음 — 원본 숫자', () => {
      expect(conditionToString({
        type: 'cross_ticker', operator: '>=', value: 70,
        crossTicker: 'SPY', metric: 'rsi',
      })).toBe('SPY.rsi >= 70')
    })
  })
})
