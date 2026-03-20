/**
 * 백테스팅 엔진
 *
 * OHLCV 히스토리 + TA 지표 → 전략 룰 평가 → 시뮬레이션 실행
 */

import YahooFinance from 'yahoo-finance2'
import { RSI, MACD, BollingerBands, SMA, EMA } from 'trading-signals'
import type {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  BacktestMetrics,
  Condition,
} from './types'

const yf = new YahooFinance()

interface DayIndicators {
  close: number
  rsi: number | null
  macdHistogram: number | null
  prevMacdHistogram: number | null
  bbUpper: number | null
  bbLower: number | null
  sma20: number | null
  sma50: number | null
  sma200: number | null
  prevSma50: number | null
  prevSma200: number | null
  volumeRatio: number
}

function evaluateConditions(conditions: Condition[], ind: DayIndicators): boolean {
  return conditions.every((c) => {
    switch (c.type) {
      case 'rsi_below': return ind.rsi != null && ind.rsi < c.value
      case 'rsi_above': return ind.rsi != null && ind.rsi > c.value
      case 'macd_cross':
        if (ind.macdHistogram == null || ind.prevMacdHistogram == null) return false
        if (c.direction === 'golden') return ind.prevMacdHistogram <= 0 && ind.macdHistogram > 0
        return ind.prevMacdHistogram >= 0 && ind.macdHistogram < 0
      case 'price_above_sma': {
        const sma = c.period === 20 ? ind.sma20 : c.period === 50 ? ind.sma50 : ind.sma200
        return sma != null && ind.close > sma
      }
      case 'price_below_sma': {
        const sma = c.period === 20 ? ind.sma20 : c.period === 50 ? ind.sma50 : ind.sma200
        return sma != null && ind.close < sma
      }
      case 'bb_position':
        if (c.zone === 'below_lower') return ind.bbLower != null && ind.close < ind.bbLower
        return ind.bbUpper != null && ind.close > ind.bbUpper
      case 'volume_surge': return ind.volumeRatio >= c.ratio
      default: return false
    }
  })
}

function conditionReason(conditions: Condition[], ind: DayIndicators): string {
  return conditions.map((c) => {
    switch (c.type) {
      case 'rsi_below': return `RSI ${ind.rsi?.toFixed(1)} < ${c.value}`
      case 'rsi_above': return `RSI ${ind.rsi?.toFixed(1)} > ${c.value}`
      case 'macd_cross': return c.direction === 'golden' ? 'MACD 골든크로스' : 'MACD 데드크로스'
      case 'price_above_sma': return `가격 > SMA${c.period}`
      case 'price_below_sma': return `가격 < SMA${c.period}`
      case 'bb_position': return c.zone === 'below_lower' ? 'BB 하단 이탈' : 'BB 상단 돌파'
      case 'volume_surge': return `거래량 ${ind.volumeRatio.toFixed(1)}x`
      default: return ''
    }
  }).join(', ')
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const historical = await yf.chart(config.ticker, {
    period1: config.startDate,
    period2: config.endDate,
    interval: '1d',
  })

  const quotes = historical.quotes.filter((q) => q.close != null && q.high != null)
  if (quotes.length < 30) {
    throw new Error(`데이터 부족: ${config.ticker} (${quotes.length}일)`)
  }

  // TA 지표 계산
  const rsi = new RSI(14)
  const macd = new MACD(new EMA(12), new EMA(26), new EMA(9))
  const bb = new BollingerBands(20, 2)
  const sma20 = new SMA(20)
  const sma50 = new SMA(50)
  const sma200 = new SMA(200)

  const indicators: DayIndicators[] = []
  const volumes: number[] = []
  let prevMacdHist: number | null = null
  let prevSma50Val: number | null = null
  let prevSma200Val: number | null = null

  for (const q of quotes) {
    const close = q.close!
    const vol = q.volume ?? 0
    volumes.push(vol)

    rsi.update(close, false)
    const macdResult = macd.update(close, false)
    bb.update(close, false)
    sma20.update(close, false)
    const s50 = sma50.update(close, false)
    const s200 = sma200.update(close, false)

    const recentVols = volumes.slice(-20)
    const avgVol = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 1
    const bbResult = bb.getResult()

    const ind: DayIndicators = {
      close,
      rsi: rsi.getResult(),
      macdHistogram: macdResult?.histogram ?? null,
      prevMacdHistogram: prevMacdHist,
      bbUpper: bbResult?.upper ?? null,
      bbLower: bbResult?.lower ?? null,
      sma20: sma20.getResult(),
      sma50: s50,
      sma200: s200,
      prevSma50: prevSma50Val,
      prevSma200: prevSma200Val,
      volumeRatio: avgVol > 0 ? vol / avgVol : 1,
    }

    prevMacdHist = macdResult?.histogram ?? prevMacdHist
    prevSma50Val = s50 ?? prevSma50Val
    prevSma200Val = s200 ?? prevSma200Val

    indicators.push(ind)
  }

  // 시뮬레이션
  let capital = config.initialCapital
  let position: 'NONE' | 'LONG' = 'NONE'
  let shares = 0
  let entryPrice = 0
  const trades: BacktestTrade[] = []
  const equityCurve: { date: string; value: number }[] = []

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i]
    const ind = indicators[i]
    const dateStr = new Date(q.date).toISOString().slice(0, 10)

    if (position === 'NONE' && evaluateConditions(config.strategy.buyConditions, ind)) {
      const investAmount = capital * config.positionSize
      shares = Math.floor(investAmount / ind.close)
      if (shares > 0) {
        const buyCost = shares * ind.close
        const buyCommission = buyCost * config.commission
        entryPrice = ind.close
        capital -= buyCost + buyCommission
        position = 'LONG'
        trades.push({
          type: 'BUY',
          date: dateStr,
          price: ind.close,
          shares,
          reason: conditionReason(config.strategy.buyConditions, ind),
        })
      }
    } else if (position === 'LONG' && evaluateConditions(config.strategy.sellConditions, ind)) {
      const proceeds = shares * ind.close
      const sellCommission = proceeds * config.commission
      const buyCommission = shares * entryPrice * config.commission
      const pnl = proceeds - sellCommission - shares * entryPrice - buyCommission
      capital += proceeds - sellCommission
      trades.push({
        type: 'SELL',
        date: dateStr,
        price: ind.close,
        shares,
        reason: conditionReason(config.strategy.sellConditions, ind),
        pnl,
      })
      shares = 0
      position = 'NONE'
    }

    const portfolioValue = capital + shares * ind.close
    equityCurve.push({ date: dateStr, value: Math.round(portfolioValue) })
  }

  // 미청산 포지션 평가
  const finalValue = capital + shares * quotes[quotes.length - 1].close!
  const benchmarkReturn = quotes.length >= 2
    ? ((quotes[quotes.length - 1].close! / quotes[0].close!) - 1) * 100
    : 0

  const metrics = calculateMetrics(trades, equityCurve, config.initialCapital, finalValue)

  const startStr = new Date(config.startDate).toISOString().slice(0, 10)
  const endStr = new Date(config.endDate).toISOString().slice(0, 10)

  return {
    ticker: config.ticker,
    strategyName: config.strategy.name,
    period: `${startStr} ~ ${endStr}`,
    trades,
    metrics,
    benchmarkReturn,
    equityCurve,
  }
}

function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: { date: string; value: number }[],
  initialCapital: number,
  finalValue: number
): BacktestMetrics {
  const totalReturn = ((finalValue / initialCapital) - 1) * 100
  const days = equityCurve.length
  const years = days / 252
  const annualizedReturn = years > 0
    ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100
    : totalReturn

  // 최대 낙폭
  let peak = equityCurve[0]?.value ?? initialCapital
  let maxDrawdown = 0
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const dd = ((peak - point.value) / peak) * 100
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // 승률 + profit factor
  const sellTrades = trades.filter((t) => t.type === 'SELL' && t.pnl != null)
  const wins = sellTrades.filter((t) => (t.pnl ?? 0) > 0)
  const losses = sellTrades.filter((t) => (t.pnl ?? 0) <= 0)
  const winRate = sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0
  const totalProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const totalLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0))
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0

  // 평균 보유 기간
  let totalHoldDays = 0
  let holdCount = 0
  for (let i = 0; i < trades.length - 1; i += 2) {
    if (trades[i].type === 'BUY' && trades[i + 1]?.type === 'SELL') {
      const buyDate = new Date(trades[i].date)
      const sellDate = new Date(trades[i + 1].date)
      totalHoldDays += (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24)
      holdCount++
    }
  }

  // 샤프 비율 (일간 수익률 기준)
  const dailyReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value
    if (prev > 0) dailyReturns.push((equityCurve[i].value - prev) / prev)
  }
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0
  const stdDev = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1))
    : 1
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0

  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    sharpeRatio,
    winRate,
    profitFactor,
    totalTrades: sellTrades.length,
    avgHoldDays: holdCount > 0 ? Math.round(totalHoldDays / holdCount) : 0,
  }
}
