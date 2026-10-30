import type { Bot, Context } from 'grammy'
import { runBacktest } from '@/lib/backtest/engine'
import { PRESET_STRATEGIES, STRATEGY_ALIASES } from '@/lib/backtest/presets'
import { escapeHtml, h } from '../utils/telegram'
import { formatPercent } from '../utils/formatter'
import { plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'
import { knownUserMessage } from '../utils/error'

/*
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · Q · H2): 백테스트.
 * 판단(decideBacktest)은 인자와 중립 응답 모델만 안다 · typing 주기는 `out.typingIntervalMs`(텔레그램 5 s 그대로).
 * 특성 테스트 `__tests__/special-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

export const BACKTEST_RE = /^백테스트(?:\s+.*)?$/

/** 텔레그램 원문 → 인자 — `/backtest[@bot]` · `백테스트` 를 벗기고 trim(대소문자 무시). */
export function backtestArgsFromText(text: string): string {
  return text.replace(/^(\/backtest(?:@\w+)?|백테스트)\s*/i, '').trim()
}

/**
 * 백테스트 [종목] [전략] [기간(일)]
 * 백테스트 NVDA rsi 365
 * 백테스트 AAPL 골든크로스
 * 백테스트 AAPL (기본: RSI, 1년)
 */
export async function decideBacktest(args: string, out: ReplyOutput): Promise<void> {

  if (!args) {
    const stratList = Object.entries(PRESET_STRATEGIES)
      .map(([key, s]) => `  ${key} — ${s.description}`)
      .join('\n')
    await out.replyLong(
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
    await out.reply(plainReply(`⚠️ 알 수 없는 전략: ${parts[1]}\n사용 가능: ${available}`))
    return
  }

  if (!Number.isInteger(days) || days < 30 || days > 3650) {
    await out.reply(plainReply('⚠️ 기간은 30~3650일 사이여야 합니다.'))
    return
  }

  await out.replyLong(
    `🧪 ${h.b(`${escapeHtml(ticker)} 백테스트`)} 실행 중...\n` +
    `전략: ${escapeHtml(strategy.name)} | 기간: ${days}일`
  )

  // fire-and-forget
  const typingInterval = setInterval(() => {
    out.typing().catch(() => {})
  }, out.typingIntervalMs)

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

      await out.replyLong(lines.join('\n'))
    })
    .catch(async (error) => {
      // 백테스트 엔진의 사용자용 안내(`lib/backtest/engine.ts`)만 보인다 — 그 밖의 원문은 로그만(PR-2c · UQ-3)
      const known = knownUserMessage(error, ['데이터 부족:'])
      console.error(`[bot] 백테스트 실패 (${ticker}):`, error)
      await out.reply(plainReply(known ? `⚠️ 백테스트 실패: ${known}` : '⚠️ 백테스트에 실패했습니다. 잠시 후 다시 시도해주세요.'))
    })
    .finally(() => clearInterval(typingInterval))
}

export function registerBacktestCommands(bot: Bot): void {
  // 등록에 try/catch 가 없다 — 판단 밖으로 던진 오류는 지금처럼 grammY bot.catch 로 간다
  const handle = (ctx: Context) => decideBacktest(backtestArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))
  bot.command('backtest', handle)
  bot.hears(BACKTEST_RE, handle)
}
