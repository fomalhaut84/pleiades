/**
 * 기술적 분석 엔진
 *
 * yahoo-finance2 OHLCV + trading-signals로 TA 지표를 계산하고
 * 종합 시그널을 판정한다.
 */

import YahooFinance from 'yahoo-finance2'
import { RSI, MACD, BollingerBands, SMA, EMA } from 'trading-signals'
import { findSupportResistance } from './support-resistance'
import type {
  TAReport,
  RSISignal,
  MACDTrend,
  MACDCrossover,
  BBPosition,
  SignalLevel,
} from './types'

const yf = new YahooFinance()

/**
 * 종목의 TA 리포트를 생성한다.
 * @param ticker Yahoo Finance 티커 (예: AAPL, 005930.KS)
 */
export async function generateTAReport(ticker: string): Promise<TAReport> {
  // 250일치 일봉 (200일 SMA 계산을 위해 여유분)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 300)

  const historical = await yf.chart(ticker, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
  })

  const quotes = historical.quotes
  if (!quotes || quotes.length < 30) {
    throw new Error(`데이터 부족: ${ticker} (${quotes?.length ?? 0}일)`)
  }

  const closes = quotes.map((q) => q.close).filter((c): c is number => c != null)
  const highs = quotes.map((q) => q.high).filter((h): h is number => h != null)
  const lows = quotes.map((q) => q.low).filter((l): l is number => l != null)
  const volumes = quotes.map((q) => q.volume).filter((v): v is number => v != null)

  if (closes.length < 30) {
    throw new Error(`유효 데이터 부족: ${ticker} (${closes.length}일)`)
  }

  const currentPrice = closes[closes.length - 1]
  const prevPrice = closes.length >= 2 ? closes[closes.length - 2] : currentPrice

  // === 가격 변동 ===
  const price5dAgo = closes.length >= 6 ? closes[closes.length - 6] : currentPrice
  const price20dAgo = closes.length >= 21 ? closes[closes.length - 21] : currentPrice
  const high52w = Math.max(...highs.slice(-252))
  const low52w = Math.min(...lows.slice(-252))

  // === RSI (14) ===
  const rsi = new RSI(14)
  for (const c of closes) rsi.update(c, false)
  const rsiValue = rsi.getResult() ?? 50
  const rsiSignal: RSISignal =
    rsiValue >= 70 ? 'OVERBOUGHT' : rsiValue <= 30 ? 'OVERSOLD' : 'NEUTRAL'

  // === MACD (12, 26, 9) ===
  const macd = new MACD(new EMA(12), new EMA(26), new EMA(9))
  const macdHistory: { macd: number; signal: number; histogram: number }[] = []
  for (const c of closes) {
    const result = macd.update(c, false)
    if (result) macdHistory.push(result)
  }
  const macdCurrent = macdHistory.length > 0
    ? macdHistory[macdHistory.length - 1]
    : { macd: 0, signal: 0, histogram: 0 }
  const macdTrend: MACDTrend =
    macdCurrent.histogram > 0 ? 'BULLISH' : macdCurrent.histogram < 0 ? 'BEARISH' : 'NEUTRAL'

  // MACD 크로스 감지 (최근 3일)
  let macdCrossover: MACDCrossover | undefined
  if (macdHistory.length >= 3) {
    const recent = macdHistory.slice(-3)
    for (let i = 1; i < recent.length; i++) {
      const prevHist = recent[i - 1].histogram
      const currHist = recent[i].histogram
      if (prevHist <= 0 && currHist > 0) macdCrossover = 'GOLDEN'
      if (prevHist >= 0 && currHist < 0) macdCrossover = 'DEAD'
    }
  }

  // === Bollinger Bands (20, 2) ===
  const bb = new BollingerBands(20, 2)
  for (const c of closes) bb.update(c, false)
  const bbResult = bb.getResult()
  const bbUpper = bbResult?.upper ?? currentPrice
  const bbMiddle = bbResult?.middle ?? currentPrice
  const bbLower = bbResult?.lower ?? currentPrice
  const bandwidth = bbMiddle > 0 ? ((bbUpper - bbLower) / bbMiddle) * 100 : 0

  let bbPosition: BBPosition = 'MIDDLE'
  if (currentPrice > bbUpper) bbPosition = 'ABOVE_UPPER'
  else if (currentPrice > bbMiddle + (bbUpper - bbMiddle) * 0.8) bbPosition = 'NEAR_UPPER'
  else if (currentPrice < bbLower) bbPosition = 'BELOW_LOWER'
  else if (currentPrice < bbMiddle - (bbMiddle - bbLower) * 0.8) bbPosition = 'NEAR_LOWER'

  // === SMA (20, 50, 200) ===
  const sma20 = new SMA(20)
  const sma50 = new SMA(50)
  const sma200 = new SMA(200)
  const sma50History: number[] = []
  const sma200History: number[] = []

  for (const c of closes) {
    sma20.update(c, false)
    const s50 = sma50.update(c, false)
    const s200 = sma200.update(c, false)
    if (s50 != null) sma50History.push(s50)
    if (s200 != null) sma200History.push(s200)
  }

  const sma20Value = sma20.getResult() ?? currentPrice
  const sma50Value = sma50.getResult() ?? currentPrice
  const sma200Value = sma200.getResult()
  const priceVsSma20 = sma20Value > 0 ? ((currentPrice - sma20Value) / sma20Value) * 100 : 0

  // 골든크로스/데드크로스 (최근 5일)
  let goldenCross = false
  let deathCross = false
  if (sma50History.length >= 5 && sma200History.length >= 5) {
    const len50 = sma50History.length
    const len200 = sma200History.length
    for (let i = 1; i <= Math.min(5, len50 - 1, len200 - 1); i++) {
      const prevDiff = sma50History[len50 - 1 - i] - sma200History[len200 - 1 - i]
      const currDiff = sma50History[len50 - i] - sma200History[len200 - i]
      if (prevDiff <= 0 && currDiff > 0) goldenCross = true
      if (prevDiff >= 0 && currDiff < 0) deathCross = true
    }
  }

  // === Volume ===
  const recentVolumes = volumes.slice(-20)
  const currentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0
  const avg20dVolume = recentVolumes.length > 0
    ? recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length
    : 1
  const volumeRatio = avg20dVolume > 0 ? currentVolume / avg20dVolume : 1

  // === 지지/저항선 ===
  const recentHighs = highs.slice(-60)
  const recentLows = lows.slice(-60)
  const { support, resistance } = findSupportResistance(recentHighs, recentLows)

  // === 종합 시그널 ===
  const reasons: string[] = []
  let score = 0

  // RSI
  if (rsiValue <= 30) { score += 2; reasons.push(`RSI ${rsiValue.toFixed(1)} — 과매도`) }
  else if (rsiValue <= 40) { score += 1; reasons.push(`RSI ${rsiValue.toFixed(1)} — 매도 과열 해소 근접`) }
  else if (rsiValue >= 70) { score -= 2; reasons.push(`RSI ${rsiValue.toFixed(1)} — 과매수`) }
  else if (rsiValue >= 60) { score -= 1; reasons.push(`RSI ${rsiValue.toFixed(1)} — 매수 과열 근접`) }

  // MACD
  if (macdCrossover === 'GOLDEN') { score += 2; reasons.push('MACD 골든크로스') }
  else if (macdCrossover === 'DEAD') { score -= 2; reasons.push('MACD 데드크로스') }
  else if (macdTrend === 'BULLISH') { score += 1; reasons.push('MACD 상승 추세') }
  else if (macdTrend === 'BEARISH') { score -= 1; reasons.push('MACD 하락 추세') }

  // BB
  if (bbPosition === 'BELOW_LOWER') { score += 1; reasons.push('BB 하단 이탈') }
  else if (bbPosition === 'ABOVE_UPPER') { score -= 1; reasons.push('BB 상단 이탈') }

  // SMA
  if (goldenCross) { score += 2; reasons.push('SMA 골든크로스 (50/200)') }
  else if (deathCross) { score -= 2; reasons.push('SMA 데드크로스 (50/200)') }
  if (currentPrice > sma20Value && currentPrice > sma50Value) { score += 1 }
  else if (currentPrice < sma20Value && currentPrice < sma50Value) { score -= 1 }

  // Volume
  if (volumeRatio >= 2) { reasons.push(`거래량 급증 (${volumeRatio.toFixed(1)}배)`) }

  let overall: SignalLevel = 'NEUTRAL'
  if (score >= 4) overall = 'STRONG_BUY'
  else if (score >= 2) overall = 'BUY'
  else if (score <= -4) overall = 'STRONG_SELL'
  else if (score <= -2) overall = 'SELL'

  // 기간 문자열
  const firstDate = quotes[0].date
  const lastDate = quotes[quotes.length - 1].date
  const fmt = (d: Date | string) => new Date(d).toISOString().slice(0, 10)
  const period = `${fmt(firstDate)} ~ ${fmt(lastDate)}`

  return {
    ticker,
    period,
    price: {
      current: currentPrice,
      change1d: prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0,
      change5d: price5dAgo > 0 ? ((currentPrice - price5dAgo) / price5dAgo) * 100 : 0,
      change20d: price20dAgo > 0 ? ((currentPrice - price20dAgo) / price20dAgo) * 100 : 0,
      high52w,
      low52w,
      fromHigh52w: high52w > 0 ? ((currentPrice - high52w) / high52w) * 100 : 0,
    },
    indicators: {
      rsi14: { value: rsiValue, signal: rsiSignal },
      macd: {
        macd: macdCurrent.macd,
        signal: macdCurrent.signal,
        histogram: macdCurrent.histogram,
        trend: macdTrend,
        crossover: macdCrossover,
      },
      bollingerBands: {
        upper: bbUpper,
        middle: bbMiddle,
        lower: bbLower,
        position: bbPosition,
        bandwidth,
      },
      sma: {
        sma20: sma20Value,
        sma50: sma50Value,
        sma200: sma200Value,
        priceVsSma20,
        goldenCross: goldenCross || undefined,
        deathCross: deathCross || undefined,
      },
      volume: {
        current: currentVolume,
        avg20d: Math.round(avg20dVolume),
        ratio: volumeRatio,
        surge: volumeRatio >= 2,
      },
    },
    support,
    resistance,
    signalSummary: { overall, reasons },
  }
}
