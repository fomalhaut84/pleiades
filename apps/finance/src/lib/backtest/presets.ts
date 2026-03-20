import type { StrategyRule } from './types'

export const RSI_REVERSAL: StrategyRule = {
  name: 'RSI 반전',
  description: 'RSI 과매도(30 이하) 매수, 과매수(70 이상) 매도',
  buyConditions: [{ type: 'rsi_below', value: 30 }],
  sellConditions: [{ type: 'rsi_above', value: 70 }],
}

export const GOLDEN_CROSS: StrategyRule = {
  name: '골든크로스',
  description: '가격이 SMA50과 SMA200 위일 때 매수, SMA50 아래로 이탈 시 매도',
  buyConditions: [{ type: 'price_above_sma', period: 50 }, { type: 'price_above_sma', period: 200 }],
  sellConditions: [{ type: 'price_below_sma', period: 50 }],
}

export const BB_BOUNCE: StrategyRule = {
  name: 'BB 반등',
  description: 'BB 하단 이탈 매수, BB 상단 도달 매도',
  buyConditions: [{ type: 'bb_position', zone: 'below_lower' }],
  sellConditions: [{ type: 'bb_position', zone: 'above_upper' }],
}

export const SMA_TREND: StrategyRule = {
  name: 'SMA 추세추종',
  description: '가격 > SMA20 매수, 가격 < SMA20 매도',
  buyConditions: [{ type: 'price_above_sma', period: 20 }],
  sellConditions: [{ type: 'price_below_sma', period: 20 }],
}

export const PRESET_STRATEGIES: Record<string, StrategyRule> = {
  rsi: RSI_REVERSAL,
  golden_cross: GOLDEN_CROSS,
  bb: BB_BOUNCE,
  sma: SMA_TREND,
}

export const STRATEGY_ALIASES: Record<string, string> = {
  'rsi': 'rsi', 'RSI': 'rsi', 'RSI반전': 'rsi',
  '골든크로스': 'golden_cross', 'golden': 'golden_cross',
  'bb': 'bb', 'BB': 'bb', 'BB반등': 'bb', '볼린저': 'bb',
  'sma': 'sma', 'SMA': 'sma', 'SMA추세': 'sma', '추세': 'sma',
}
