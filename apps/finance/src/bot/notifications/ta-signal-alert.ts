/**
 * 전략 기반 TA 시그널 알림
 *
 * 스윙/모멘텀/단타 전략 종목에 대해 TA 조건 충족 시 텔레그램 알림.
 * 시세 갱신(refreshPrices) 후 호출.
 */

import { prisma } from '@/lib/prisma'
import { generateTAReport } from '@/lib/ta/engine'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { getBot } from '@/bot/index'
import { sendHtml, escapeHtml } from '@/bot/utils/telegram'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'
import { isMarketOpenFor } from '@/lib/market-hours'
import type { TAReport } from '@/lib/ta/types'

/** 당일 시그널 발송 기록 (키 → date string) */
const sentToday = new Map<string, string>()

function getTodayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  const today = getTodayKST()
  if (sentToday.size > 0) {
    const firstDate = sentToday.values().next().value
    if (firstDate !== today) sentToday.clear()
  }
}

interface SignalResult {
  ticker: string
  displayName: string
  strategy: string
  signals: string[]
  signalIds: string[]
}

interface Signal {
  id: string
  message: string
}

interface TickerMeta {
  displayName: string
  market: string
  strategies: Set<string>
}

/** 전략별 시그널 조건 매칭 — id는 중복 방지 키에 사용 */
function checkSignals(report: TAReport, strategy: string): Signal[] {
  const signals: Signal[] = []
  const { rsi14, macd, bollingerBands, volume, sma } = report.indicators

  switch (strategy) {
    case 'swing':
      if (rsi14.signal === 'OVERSOLD') signals.push({ id: 'RSI_OVERSOLD', message: `📉 RSI 과매도 (${rsi14.value.toFixed(1)}) — 매수 기회` })
      if (rsi14.signal === 'OVERBOUGHT') signals.push({ id: 'RSI_OVERBOUGHT', message: `📈 RSI 과매수 (${rsi14.value.toFixed(1)}) — 매도 검토` })
      if (macd.crossover === 'GOLDEN') signals.push({ id: 'MACD_GOLDEN', message: '🔄 MACD 골든크로스 — 매수 시그널' })
      if (macd.crossover === 'DEAD') signals.push({ id: 'MACD_DEAD', message: '🔄 MACD 데드크로스 — 매도 시그널' })
      break

    case 'momentum':
      if (volume.surge && report.price.change1d > 0) signals.push({ id: 'VOL_SURGE', message: `🚀 거래량 급증 (${volume.ratio.toFixed(1)}배) + 상승` })
      if (sma.goldenCross) signals.push({ id: 'SMA_GOLDEN', message: '🔄 SMA 골든크로스 — 상승 추세 전환' })
      if (sma.deathCross) signals.push({ id: 'SMA_DEAD', message: '🔄 SMA 데드크로스 — 하락 추세 전환' })
      break

    case 'scalp':
      if (bollingerBands.position === 'BELOW_LOWER') signals.push({ id: 'BB_BELOW', message: '📉 BB 하단 이탈 — 매수 구간' })
      if (bollingerBands.position === 'ABOVE_UPPER') signals.push({ id: 'BB_ABOVE', message: '📈 BB 상단 이탈 — 매도 구간' })
      if (rsi14.value < 25) signals.push({ id: 'RSI_EXTREME_LOW', message: `📉 RSI 극단 과매도 (${rsi14.value.toFixed(1)})` })
      if (rsi14.value > 75) signals.push({ id: 'RSI_EXTREME_HIGH', message: `📈 RSI 극단 과매수 (${rsi14.value.toFixed(1)})` })
      break

    case 'long_hold':
      if (report.signalSummary.overall === 'STRONG_SELL') {
        signals.push({ id: 'STRONG_SELL', message: `⚠️ 종합 STRONG_SELL — ${report.signalSummary.reasons.slice(0, 2).join(', ')}` })
      }
      break
  }

  return signals
}

let isChecking = false

/**
 * 전략 기반 TA 시그널 체크 + 알림 발송
 */
export async function checkTASignals(chatIds: number[]): Promise<void> {
  if (isChecking) {
    console.log('[ta-signal] 이미 체크 진행 중, 스킵')
    return
  }
  isChecking = true
  try {
    await doCheckTASignals(chatIds)
  } finally {
    isChecking = false
  }
}

async function doCheckTASignals(chatIds: number[]): Promise<void> {
  if (chatIds.length === 0) return

  resetIfNewDay()
  const today = getTodayKST()

  // 전략이 설정된 보유 종목 조회 (모든 전략 포함)
  const allStrategies = ['swing', 'momentum', 'scalp', 'long_hold']
  const holdings = await prisma.holdingStrategy.findMany({
    where: { strategy: { in: allStrategies } },
    include: { holding: { select: { ticker: true, displayName: true, market: true } } },
  })

  // 관심종목 중 액티브 전략 (long_hold 제외 — 관심종목에 장기보유는 해당 없음)
  const watchlist = await prisma.watchlist.findMany({
    where: { strategy: { in: ['swing', 'momentum', 'scalp'] } },
  })

  // 티커별 전략 수집 (다중 전략 지원)
  const tickerStrategies = new Map<string, TickerMeta>()
  for (const h of holdings) {
    const existing = tickerStrategies.get(h.holding.ticker)
    if (existing) {
      existing.strategies.add(h.strategy)
    } else {
      tickerStrategies.set(h.holding.ticker, {
        displayName: h.holding.displayName,
        market: h.holding.market,
        strategies: new Set([h.strategy]),
      })
    }
  }
  for (const w of watchlist) {
    const existing = tickerStrategies.get(w.ticker)
    if (existing) {
      existing.strategies.add(w.strategy)
    } else {
      tickerStrategies.set(w.ticker, {
        displayName: w.displayName,
        market: w.market,
        strategies: new Set([w.strategy]),
      })
    }
  }

  if (tickerStrategies.size === 0) return

  // PriceCache.market을 결정적 소스로 사용 (Holding/Watchlist 간 market 불일치 방지)
  // price-alert.ts와 동일한 패턴 (#261)
  const priceCaches = await prisma.priceCache.findMany({
    where: { ticker: { in: Array.from(tickerStrategies.keys()) } },
    select: { ticker: true, market: true },
  })
  const marketByTicker = new Map(priceCaches.map((p) => [p.ticker, p.market]))

  const results: SignalResult[] = []

  for (const [ticker, meta] of Array.from(tickerStrategies)) {
    // 거래시간 필터: 해당 종목 시장이 닫혀 있으면 분석/알림 스킵 (장외 허위 시그널 차단)
    // PriceCache.market을 단일 결정적 소스로 사용 (Holding/Watchlist 간 불일치 방지)
    // PriceCache 미존재 시 안전 차단 — 다음 cron 주기에 캐시가 채워지면 자연 복구됨
    const market = marketByTicker.get(ticker)
    if (!market) {
      console.warn(`[ta-signal] ${ticker} PriceCache 미존재 — 시그널 스킵 (meta.market=${meta.market})`)
      continue
    }
    if (!isMarketOpenFor(market, ticker)) continue

    try {
      const report = await generateTAReport(ticker)

      // 모든 전략에 대해 시그널 체크
      const allSignals: Signal[] = []
      for (const strategy of Array.from(meta.strategies)) {
        allSignals.push(...checkSignals(report, strategy))
      }

      if (allSignals.length === 0) continue

      // 중복 방지: 고정 ID 기반 (발송 전 필터만, 기록은 발송 성공 후)
      const newSignals = allSignals.filter((sig) => {
        const key = `ta:${ticker}:${sig.id}`
        return sentToday.get(key) !== today
      })

      if (newSignals.length > 0) {
        const stratLabel = Array.from(meta.strategies).join('/')
        results.push({
          ticker,
          displayName: meta.displayName,
          strategy: stratLabel,
          signals: newSignals.map((s) => s.message),
          signalIds: newSignals.map((s) => s.id),
        })
      }
    } catch (error) {
      console.error(`[ta-signal] ${ticker} TA 분석 실패:`, error)
    }
  }

  if (results.length === 0) return

  const STRATEGY_LABELS: Record<string, string> = {
    swing: '스윙', momentum: '모멘텀', scalp: '단타', long_hold: '장기',
  }

  // AI 간략 가이드 생성 (시그널 종목에 대해, 최대 3종목)
  const aiGuides = new Map<string, string>()
  const guideTargets = results.slice(0, 3)
  for (const r of guideTargets) {
    try {
      const prompt = `${r.displayName}(${r.ticker})에서 다음 TA 시그널이 발생했다: ${r.signals.join(', ')}. stock-trading-method 프레임워크 기준으로 현재 상황 1~2줄 가이드를 작성해줘. 간결하게.`
      const guide = await askAdvisor(prompt, { timeout: 30_000, maxBudgetUsd: 0.10 })
      aiGuides.set(r.ticker, guide.response.trim())
    } catch (error) {
      console.warn(`[ta-signal] ${r.ticker} AI 가이드 실패:`, error instanceof Error ? error.message : error)
    }
  }

  const lines = ['📊 <b>TA 시그널 알림</b>\n']
  for (const r of results) {
    const stratLabel = r.strategy.split('/').map((s) => STRATEGY_LABELS[s] ?? s).join('/')
    lines.push(`<b>${escapeHtml(r.displayName)}</b> (${escapeHtml(r.ticker)}) — ${stratLabel}`)
    for (const sig of r.signals) {
      lines.push(`  ${sig}`)
    }
    const guide = aiGuides.get(r.ticker)
    if (guide) {
      const guideHtml = markdownToTelegramHtml(guide.slice(0, 300))
      lines.push('')
      lines.push(`  💡 ${guideHtml}`)
    }
    lines.push('')
  }

  const bot = getBot()
  const message = lines.join('\n')

  let sendSuccess = false
  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, message)
      sendSuccess = true
    } catch (error) {
      console.error(`[ta-signal] 알림 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  // 발송 성공 시에만 dedupe 기록 (실패 시 다음 주기에 재시도)
  if (sendSuccess) {
    for (const r of results) {
      for (const sigId of r.signalIds) {
        sentToday.set(`ta:${r.ticker}:${sigId}`, today)
      }
    }
  }

  console.log(`[ta-signal] TA 시그널 알림: ${results.length}종목`)
}
