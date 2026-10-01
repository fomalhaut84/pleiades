export type SignalLevel = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
export type RSISignal = 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL'
export type MACDTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL'
export type MACDCrossover = 'GOLDEN' | 'DEAD'
export type BBPosition = 'ABOVE_UPPER' | 'NEAR_UPPER' | 'MIDDLE' | 'NEAR_LOWER' | 'BELOW_LOWER'

export interface TAReport {
  ticker: string
  period: string
  price: {
    current: number
    change1d: number
    change5d: number
    change20d: number
    high52w: number
    low52w: number
    fromHigh52w: number
  }
  indicators: {
    rsi14: { value: number; signal: RSISignal }
    macd: {
      macd: number
      signal: number
      histogram: number
      trend: MACDTrend
      crossover?: MACDCrossover
    }
    bollingerBands: {
      upper: number
      middle: number
      lower: number
      position: BBPosition
      bandwidth: number
    }
    sma: {
      sma20: number
      sma50: number
      sma200: number | null
      priceVsSma20: number
      goldenCross?: boolean
      deathCross?: boolean
    }
    volume: {
      current: number
      avg20d: number
      ratio: number
      surge: boolean
    }
  }
  support: number[]
  resistance: number[]
  signalSummary: {
    overall: SignalLevel
    reasons: string[]
  }
}
