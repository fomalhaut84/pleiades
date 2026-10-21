import { generateTAReport } from '@/lib/ta/engine'
import { toolResult, toolError } from '../utils'

/**
 * get_technical_analysis: 종목의 기술적 분석 리포트
 */
export async function getTechnicalAnalysis(args: { ticker: string }) {
  try {
    const report = await generateTAReport(args.ticker.toUpperCase())

    const p = report.price
    const ind = report.indicators
    const sig = report.signalSummary

    const lines = [
      `## ${report.ticker} 기술적 분석 (${report.period})`,
      '',
      `현재가: ${p.current} (전일 ${p.change1d >= 0 ? '+' : ''}${p.change1d.toFixed(1)}%)`,
      `5일: ${p.change5d >= 0 ? '+' : ''}${p.change5d.toFixed(1)}% | 20일: ${p.change20d >= 0 ? '+' : ''}${p.change20d.toFixed(1)}%`,
      `52주: ${p.low52w} ~ ${p.high52w} (고점 대비 ${p.fromHigh52w.toFixed(1)}%)`,
      '',
      `RSI(14): ${ind.rsi14.value.toFixed(1)} — ${ind.rsi14.signal}`,
      `MACD: ${ind.macd.trend}${ind.macd.crossover ? ` (${ind.macd.crossover})` : ''}`,
      `  MACD=${ind.macd.macd.toFixed(2)}, Signal=${ind.macd.signal.toFixed(2)}, Histogram=${ind.macd.histogram.toFixed(2)}`,
      `BB: ${ind.bollingerBands.position} (밴드폭 ${ind.bollingerBands.bandwidth.toFixed(1)}%)`,
      `  Upper=${ind.bollingerBands.upper.toFixed(2)}, Middle=${ind.bollingerBands.middle.toFixed(2)}, Lower=${ind.bollingerBands.lower.toFixed(2)}`,
      `SMA: 20일=${ind.sma.sma20.toFixed(2)}, 50일=${ind.sma.sma50.toFixed(2)}${ind.sma.sma200 != null ? `, 200일=${ind.sma.sma200.toFixed(2)}` : ''}`,
      `  20일선 대비: ${ind.sma.priceVsSma20 >= 0 ? '+' : ''}${ind.sma.priceVsSma20.toFixed(1)}%`,
      ...(ind.sma.goldenCross ? ['  골든크로스 (50/200)'] : []),
      ...(ind.sma.deathCross ? ['  데드크로스 (50/200)'] : []),
      `거래량: ${ind.volume.ratio.toFixed(1)}배 (20일 평균 대비)${ind.volume.surge ? ' — 급증' : ''}`,
    ]

    if (report.support.length > 0) {
      lines.push(`지지선: ${report.support.join(', ')}`)
    }
    if (report.resistance.length > 0) {
      lines.push(`저항선: ${report.resistance.join(', ')}`)
    }

    lines.push('')
    lines.push(`종합 시그널: ${sig.overall}`)
    if (sig.reasons.length > 0) {
      lines.push(`근거: ${sig.reasons.join(' | ')}`)
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
