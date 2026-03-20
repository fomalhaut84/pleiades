import { Bot, Context } from 'grammy'
import { runBacktest } from '@/lib/backtest/engine'
import { PRESET_STRATEGIES, STRATEGY_ALIASES } from '@/lib/backtest/presets'
import { replyHtml, escapeHtml, h } from '../utils/telegram'
import { formatPercent } from '../utils/formatter'

const TYPING_INTERVAL_MS = 5000

/**
 * 백테스트 [종목] [전략] [기간(일)]
 * 백테스트 NVDA rsi 365
 * 백테스트 AAPL 골든크로스
 * 백테스트 AAPL (기본: RSI, 1년)
 */
async function handleBacktest(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const args = text.replace(/^(\/backtest(?:@\w+)?|백테스트)\s*/i, '').trim()

  if (!args) {
    const stratList = Object.entries(PRESET_STRATEGIES)
      .map(([key, s]) => `  ${key} — ${s.description}`)
      .join('\n')
    await replyHtml(ctx,
      `🧪 ${h.b('백테스트')}\n\n` +
      `사용법: 백테스트 [종목] [전략] [기간(일)]\n` +
      `예: 백테스트 NVDA rsi 365\n` +
      `예: 백테스트 AAPL 골든크로스\n\n` +
      `${h.b('프리셋 전략:')}\n${escapeHtml(stratList)}`
    )
    return
  }

  const parts = args.split(/\s+/)
  const ticker = parts[0].toUpperCase()
  const strategyKey = parts[1] ? (STRATEGY_ALIASES[parts[1]] ?? parts[1]) : 'rsi'
  const days = parts[2] ? parseInt(parts[2], 10) : 365

  const strategy = PRESET_STRATEGIES[strategyKey]
  if (!strategy) {
    const available = Object.keys(PRESET_STRATEGIES).join(', ')
    await ctx.reply(`⚠️ 알 수 없는 전략: ${parts[1]}\n사용 가능: ${available}`)
    return
  }

  if (!Number.isInteger(days) || days < 30 || days > 3650) {
    await ctx.reply('⚠️ 기간은 30~3650일 사이여야 합니다.')
    return
  }

  await replyHtml(ctx,
    `🧪 ${h.b(`${escapeHtml(ticker)} 백테스트`)} 실행 중...\n` +
    `전략: ${escapeHtml(strategy.name)} | 기간: ${days}일`
  )

  // fire-and-forget
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => {})
  }, TYPING_INTERVAL_MS)

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  runBacktest({
    ticker,
    strategy,
    startDate,
    endDate,
    initialCapital: 10_000_000,
    positionSize: 0.9,
    commission: 0.0025,
  })
    .then(async (result) => {
      const m = result.metrics
      const lines = [
        `🧪 ${h.b(`${escapeHtml(ticker)} 백테스트 결과`)}`,
        `전략: ${escapeHtml(result.strategyName)}`,
        `기간: ${escapeHtml(result.period)}`,
        '',
        `${h.b('📊 성과')}`,
        `총 수익률: ${h.b(formatPercent(m.totalReturn))}`,
        `연환산: ${formatPercent(m.annualizedReturn)}`,
        `벤치마크 (바이앤홀드): ${formatPercent(result.benchmarkReturn)}`,
        `초과 수익: ${formatPercent(m.totalReturn - result.benchmarkReturn)}`,
        '',
        `${h.b('📉 리스크')}`,
        `최대 낙폭 (MDD): ${formatPercent(-m.maxDrawdown)}`,
        `샤프 비율: ${m.sharpeRatio.toFixed(2)}`,
        '',
        `${h.b('📈 거래')}`,
        `총 거래: ${m.totalTrades}회`,
        `승률: ${m.winRate.toFixed(0)}%`,
        `Profit Factor: ${m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2)}`,
        `평균 보유: ${m.avgHoldDays}일`,
      ]

      if (result.trades.length > 0) {
        lines.push('')
        lines.push(`${h.b('최근 거래 (최대 5건)')}`)
        const recentTrades = result.trades.slice(-5)
        for (const t of recentTrades) {
          const emoji = t.type === 'BUY' ? '📥' : '📤'
          const pnlStr = t.pnl != null ? ` (${t.pnl >= 0 ? '+' : ''}${Math.round(t.pnl).toLocaleString('ko-KR')}원)` : ''
          lines.push(`  ${emoji} ${escapeHtml(t.date)} ${t.price.toFixed(2)} × ${t.shares}주${pnlStr}`)
        }
      }

      await replyHtml(ctx, lines.join('\n'))
    })
    .catch(async (error) => {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류'
      console.error(`[bot] 백테스트 실패 (${ticker}):`, error)
      await ctx.reply(`⚠️ 백테스트 실패: ${msg}`)
    })
    .finally(() => clearInterval(typingInterval))
}

export function registerBacktestCommands(bot: Bot): void {
  bot.command('backtest', handleBacktest)
  bot.hears(/^백테스트(?:\s+.*)?$/, handleBacktest)
}
