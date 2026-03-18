import { Bot, Context } from 'grammy'
import { generateTAReport } from '@/lib/ta/engine'
import { formatPercent } from '../utils/formatter'

const SIGNAL_EMOJI: Record<string, string> = {
  STRONG_BUY: '🟢🟢',
  BUY: '🟢',
  NEUTRAL: '⚪',
  SELL: '🔴',
  STRONG_SELL: '🔴🔴',
}

function formatPrice(price: number): string {
  return price >= 1000
    ? price.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
    : price.toFixed(2)
}

async function handleAnalysis(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const ticker = text.replace(/^(\/analysis(?:@\w+)?|\/분석|분석)\s*/i, '').trim().toUpperCase()

  if (!ticker) {
    await ctx.reply(
      '📊 기술적 분석\n\n' +
      '사용법: 분석 [종목]\n' +
      '예: 분석 NVDA\n' +
      '예: 분석 AAPL'
    )
    return
  }

  await ctx.replyWithChatAction('typing')

  try {
    const report = await generateTAReport(ticker)
    const p = report.price
    const ind = report.indicators
    const sig = report.signalSummary

    const signalEmoji = SIGNAL_EMOJI[sig.overall] ?? '⚪'

    const lines = [
      `📊 ${ticker} 기술적 분석`,
      '',
      `**현재가**: ${formatPrice(p.current)} (${formatPercent(p.change1d)})`,
      `5일: ${formatPercent(p.change5d)} | 20일: ${formatPercent(p.change20d)}`,
      `52주: ${formatPrice(p.low52w)} ~ ${formatPrice(p.high52w)} (고점 대비 ${formatPercent(p.fromHigh52w)})`,
      '',
      `**RSI(14)**: ${ind.rsi14.value.toFixed(1)} — ${ind.rsi14.signal === 'OVERBOUGHT' ? '과매수 ⚠️' : ind.rsi14.signal === 'OVERSOLD' ? '과매도 📉' : '중립'}`,
      `**MACD**: ${ind.macd.trend === 'BULLISH' ? '📈 상승' : ind.macd.trend === 'BEARISH' ? '📉 하락' : '⚪ 중립'}${ind.macd.crossover ? ` (${ind.macd.crossover === 'GOLDEN' ? '골든크로스 🔥' : '데드크로스 💀'})` : ''}`,
      `**BB**: ${ind.bollingerBands.position.replace('_', ' ')} (밴드폭 ${ind.bollingerBands.bandwidth.toFixed(1)}%)`,
      `**SMA**: 20일 ${formatPrice(ind.sma.sma20)} | 50일 ${formatPrice(ind.sma.sma50)}${ind.sma.sma200 != null ? ` | 200일 ${formatPrice(ind.sma.sma200)}` : ''}`,
      `  20일선 대비: ${formatPercent(ind.sma.priceVsSma20)}`,
      ...(ind.sma.goldenCross ? ['  🔥 골든크로스 (50/200)'] : []),
      ...(ind.sma.deathCross ? ['  💀 데드크로스 (50/200)'] : []),
      `**거래량**: ${ind.volume.ratio.toFixed(1)}배 (20일 평균 대비)${ind.volume.surge ? ' 🔊 급증' : ''}`,
    ]

    if (report.support.length > 0) {
      lines.push(`**지지선**: ${report.support.map(formatPrice).join(', ')}`)
    }
    if (report.resistance.length > 0) {
      lines.push(`**저항선**: ${report.resistance.map(formatPrice).join(', ')}`)
    }

    lines.push('')
    lines.push(`${signalEmoji} **종합 시그널: ${sig.overall}**`)
    if (sig.reasons.length > 0) {
      for (const r of sig.reasons) {
        lines.push(`  - ${r}`)
      }
    }

    await ctx.reply(lines.join('\n'))
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error(`[bot] 분석 실패 (${ticker}):`, error)
    await ctx.reply(`⚠️ ${ticker} 분석 실패: ${msg}`)
  }
}

export function registerAnalysisCommands(bot: Bot): void {
  bot.command('analysis', handleAnalysis)
  bot.hears(/^분석(?:\s+.*)?$/, handleAnalysis)
}
