import type { Bot, Context } from 'grammy'
import { generateTAReport } from '@/lib/ta/engine'
import { formatPercent } from '../utils/formatter'
import { escapeHtml, h } from '../utils/telegram'
import { plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-2a (pleiades#392 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · H2): 기술적 분석.
 * 판단(decideAnalysis)은 인자(`args`)와 중립 응답 모델만 안다 · 텔레그램 원문 벗기기는 `analysisArgsFromText`(지금 식 그대로).
 * 특성 테스트 `__tests__/lookup-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

export const ANALYSIS_RE = /^분석(?:\s+.*)?$/

/** 텔레그램 원문 → 인자 — `/analysis[@bot]` · `/분석` · `분석` 을 벗기고 trim(대소문자 무시). */
export function analysisArgsFromText(text: string): string {
  return text.replace(/^(\/analysis(?:@\w+)?|\/분석|분석)\s*/i, '').trim()
}

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

export async function decideAnalysis(args: string, out: ReplyOutput): Promise<void> {
  const ticker = args.toUpperCase()

  if (!ticker) {
    await out.replyLong(
      `📊 ${h.b('기술적 분석')}\n\n` +
      `사용법: 분석 [종목]\n` +
      `예: 분석 NVDA`
    )
    return
  }

  await out.typing()

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
    await out.replyLong(message)
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error(`[bot] 분석 실패 (${ticker}):`, error)
    await out.reply(plainReply(`⚠️ ${ticker} 분석 실패: ${msg}`))
  }
}

export function registerAnalysisCommands(bot: Bot): void {
  // 등록에 try/catch 가 없다 — 판단 밖으로 던진 오류(typing 실패 등)는 지금처럼 grammY bot.catch 로 간다
  const handle = (ctx: Context) =>
    decideAnalysis(analysisArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))
  bot.command('analysis', handle)
  bot.hears(ANALYSIS_RE, handle)
}
