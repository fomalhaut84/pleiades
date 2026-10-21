export type Condition =
  | { type: 'rsi_below'; value: number }
  | { type: 'rsi_above'; value: number }
  | { type: 'macd_cross'; direction: 'golden' | 'dead' }
  | { type: 'price_above_sma'; period: 20 | 50 | 200 }
  | { type: 'price_below_sma'; period: 20 | 50 | 200 }
  | { type: 'bb_position'; zone: 'below_lower' | 'above_upper' }
  | { type: 'volume_surge'; ratio: number }

export interface StrategyRule {
  name: string
  description: string
  buyConditions: Condition[]
  sellConditions: Condition[]
}

export interface BacktestConfig {
  ticker: string
  strategy: StrategyRule
  startDate: Date
  endDate: Date
  initialCapital: number
  positionSize: number   // 0.0 ~ 1.0
  commission: number     // 수수료율 (0.0025 = 0.25%)
}

export interface BacktestTrade {
  type: 'BUY' | 'SELL'
  date: string
  price: number
  shares: number
  reason: string
  pnl?: number
}

export interface BacktestMetrics {
  totalReturn: number
  annualizedReturn: number
  maxDrawdown: number
  sharpeRatio: number
  winRate: number
  profitFactor: number
  totalTrades: number
  avgHoldDays: number
}

export interface BacktestResult {
  ticker: string
  strategyName: string
  period: string
  trades: BacktestTrade[]
  metrics: BacktestMetrics
  benchmarkReturn: number
  equityCurve: { date: string; value: number }[]
}
