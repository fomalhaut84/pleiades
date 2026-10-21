import { Bot, Context } from 'grammy'
import { generateTAReport } from '@/lib/ta/engine'
import { formatPercent } from '../utils/formatter'
import { replyHtml, escapeHtml, h } from '../utils/telegram'

const SIGNAL_LABEL: Record<string, string> = {
  STRONG_BUY: '🟢🟢 강력 매수',
  BUY: '🟢 매수',
  NEUTRAL: '⚪ 중립',
  SELL: '🔴 매도',
  STRONG_SELL: '🔴🔴 강력 매도',
}

const BB_LABEL: Record<string, string> = {
  ABOVE_UPPER: '상단 돌파 ⬆️',
  NEAR_UPPER: '상단 근접',
  MIDDLE: '중간대',
  NEAR_LOWER: '하단 근접',
  BELOW_LOWER: '하단 이탈 ⬇️',
}

function fp(price: number): string {
  const s = price >= 1000
    ? price.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
    : price.toFixed(2)
  return escapeHtml(s)
}

async function handleAnalysis(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const ticker = text.replace(/^(\/analysis(?:@\w+)?|\/분석|분석)\s*/i, '').trim().toUpperCase()

  if (!ticker) {
    await replyHtml(ctx,
      `📊 ${h.b('기술적 분석')}\n\n` +
      `사용법: 분석 [종목]\n` +
      `예: 분석 NVDA`
    )
    return
  }

  await ctx.replyWithChatAction('typing')

  try {
    const report = await generateTAReport(ticker)
    const p = report.price
    const ind = report.indicators
    const sig = report.signalSummary

    const signalLabel = SIGNAL_LABEL[sig.overall] ?? '⚪ 중립'
    const bbLabel = BB_LABEL[ind.bollingerBands.position] ?? ind.bollingerBands.position

    // 핵심 시그널 상단
    const header = [
      `📊 ${h.b(`${escapeHtml(ticker)} 기술적 분석`)}`,
      '',
      `${signalLabel}`,
      ...(sig.reasons.length > 0 ? sig.reasons.map((r) => `  └ ${escapeHtml(r)}`) : []),
    ]

    // 가격 섹션
    const priceSection = [
      '',
      `${h.b('💰 가격')}`,
      `현재가 ${fp(p.current)} (${escapeHtml(formatPercent(p.change1d))})`,
      `5일 ${escapeHtml(formatPercent(p.change5d))} · 20일 ${escapeHtml(formatPercent(p.change20d))}`,
      `52주 ${fp(p.low52w)} ~ ${fp(p.high52w)} (고점 대비 ${escapeHtml(formatPercent(p.fromHigh52w))})`,
    ]

    // 지표 섹션 — 간결하게
    const rsiEmoji = ind.rsi14.signal === 'OVERBOUGHT' ? '⚠️' : ind.rsi14.signal === 'OVERSOLD' ? '📉' : ''
    const macdEmoji = ind.macd.trend === 'BULLISH' ? '📈' : ind.macd.trend === 'BEARISH' ? '📉' : '➖'
    const macdCross = ind.macd.crossover
      ? ind.macd.crossover === 'GOLDEN' ? ' 🔥골든크로스' : ' 💀데드크로스'
      : ''

    const indicatorSection = [
      '',
      `${h.b('📈 지표')}`,
      `RSI(14): ${ind.rsi14.value.toFixed(1)} ${rsiEmoji}`,
      `MACD: ${macdEmoji} ${ind.macd.trend === 'BULLISH' ? '상승' : ind.macd.trend === 'BEARISH' ? '하락' : '중립'}${macdCross}`,
      `BB: ${bbLabel} (밴드폭 ${ind.bollingerBands.bandwidth.toFixed(1)}%)`,
    ]

    // SMA — 간결하게 한 줄
    const smaLine = `SMA: 20일 ${fp(ind.sma.sma20)} · 50일 ${fp(ind.sma.sma50)}${ind.sma.sma200 != null ? ` · 200일 ${fp(ind.sma.sma200)}` : ''}`
    indicatorSection.push(smaLine)
    if (ind.sma.goldenCross) indicatorSection.push('  🔥 골든크로스 (50/200)')
    if (ind.sma.deathCross) indicatorSection.push('  💀 데드크로스 (50/200)')

    // 거래량
    const volLine = `거래량: ${ind.volume.ratio.toFixed(1)}배${ind.volume.surge ? ' 🔊급증' : ''}`
    indicatorSection.push(volLine)

    // 지지/저항
    const srSection: string[] = []
    if (report.support.length > 0 || report.resistance.length > 0) {
      srSection.push('')
      srSection.push(`${h.b('🎯 지지·저항')}`)
      if (report.support.length > 0) srSection.push(`지지: ${report.support.map(fp).join(' · ')}`)
      if (report.resistance.length > 0) srSection.push(`저항: ${report.resistance.map(fp).join(' · ')}`)
    }

    const message = [...header, ...priceSection, ...indicatorSection, ...srSection].join('\n')
    await replyHtml(ctx, message)
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
