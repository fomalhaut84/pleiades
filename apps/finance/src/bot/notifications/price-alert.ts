/**
 * 급등락 / 환율 변동 알림
 *
 * refreshPrices() 후 호출.
 * AlertConfig 임계값 초과 시 텔레그램 알림.
 * 중복 방지: 동일 종목 당일 1회만 발송.
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { formatPercent } from '@/bot/utils/formatter'
import { sendHtml, escapeHtml } from '@/bot/utils/telegram'

/** 당일 알림 발송 기록 (ticker → date string) */
const sentToday = new Map<string, string>()

function getTodayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  const today = getTodayKST()
  if (sentToday.size > 0) {
    const firstDate = sentToday.values().next().value
    if (firstDate !== today) {
      sentToday.clear()
    }
  }
}

/**
 * 주가/환율 변동 알림 체크 + 발송
 * refreshPrices() 직후 호출
 */
export async function checkPriceAlerts(chatIds: number[]): Promise<void> {
  if (chatIds.length === 0) return

  resetIfNewDay()
  const today = getTodayKST()

  // AlertConfig에서 임계값 조회
  const configs = await prisma.alertConfig.findMany({
    where: {
      key: { in: ['price_drop_pct', 'price_surge_pct', 'fx_change_krw'] },
    },
  })
  const configMap = new Map(configs.map((c) => [c.key, c.value]))

  const parseOrDefault = (key: string, fallback: number): number => {
    const raw = parseFloat(configMap.get(key) ?? '')
    return Number.isFinite(raw) ? raw : fallback
  }

  const dropThreshold = parseOrDefault('price_drop_pct', -5)
  const surgeThreshold = parseOrDefault('price_surge_pct', 5)
  const fxThreshold = parseOrDefault('fx_change_krw', 50)

  // 보유 종목만 조회 (전체 PriceCache가 아니라)
  const holdings = await prisma.holding.findMany({
    select: { ticker: true, displayName: true },
    distinct: ['ticker'],
  })
  const holdingTickers = new Set(holdings.map((h) => h.ticker))
  const nameMap = new Map(holdings.map((h) => [h.ticker, h.displayName]))

  // 관심종목 티커도 수집
  const watchlistTickers = await prisma.watchlist.findMany({
    select: { ticker: true },
  })
  const allTickerSet = new Set(Array.from(holdingTickers))
  for (const w of watchlistTickers) allTickerSet.add(w.ticker)
  allTickerSet.add('USDKRW=X')
  const allTickers = Array.from(allTickerSet)

  // PriceCache에서 변동률 조회
  const prices = await prisma.priceCache.findMany({
    where: { ticker: { in: allTickers } },
  })

  const priceMap = new Map(prices.map((p) => [p.ticker, p]))
  const alerts: string[] = []

  for (const p of prices) {
    // 환율은 별도 처리
    if (p.ticker === 'USDKRW=X') {
      if (p.change != null && Math.abs(p.change) >= fxThreshold) {
        const key = `fx:${p.ticker}`
        if (sentToday.get(key) === today) continue
        sentToday.set(key, today)

        const direction = p.change > 0 ? '📈 상승' : '📉 하락'
        alerts.push(
          `💱 환율 ${direction}: ${p.price.toLocaleString('ko-KR')}원 (${p.change > 0 ? '+' : ''}${p.change.toFixed(0)}원)`
        )
      }
      continue
    }

    // 주가 급등락
    if (p.changePercent == null) continue
    if (!holdingTickers.has(p.ticker)) continue

    const key = `price:${p.ticker}`
    if (sentToday.get(key) === today) continue

    if (p.changePercent <= dropThreshold) {
      sentToday.set(key, today)
      const name = nameMap.get(p.ticker) ?? p.ticker
      alerts.push(
        `🔴 ${name} (${p.ticker}) 급락: ${formatPercent(p.changePercent)}`
      )
    } else if (p.changePercent >= surgeThreshold) {
      sentToday.set(key, today)
      const name = nameMap.get(p.ticker) ?? p.ticker
      alerts.push(
        `🟢 ${name} (${p.ticker}) 급등: ${formatPercent(p.changePercent)}`
      )
    }
  }

  // --- 보유종목 목표가/손절가 체크 ---
  const strategies = await prisma.holdingStrategy.findMany({
    where: {
      OR: [
        { targetPrice: { not: null } },
        { stopLoss: { not: null } },
      ],
    },
    include: {
      holding: { select: { ticker: true, displayName: true, currency: true } },
    },
  })

  for (const s of strategies) {
    const price = priceMap.get(s.holding.ticker)
    if (!price) continue

    const currentPrice = price.price
    const name = escapeHtml(s.holding.displayName)
    const ticker = escapeHtml(s.holding.ticker)

    if (s.targetPrice != null && currentPrice >= s.targetPrice) {
      const key = `target:${s.holding.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        alerts.push(
          `🎯 ${name} (${ticker}) 목표가 도달: ${currentPrice.toLocaleString('ko-KR')} (목표 ${s.targetPrice.toLocaleString('ko-KR')})`
        )
      }
    }

    if (s.stopLoss != null && currentPrice <= s.stopLoss) {
      const key = `stoploss:${s.holding.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        alerts.push(
          `🛑 ${name} (${ticker}) 손절가 도달: ${currentPrice.toLocaleString('ko-KR')} (손절 ${s.stopLoss.toLocaleString('ko-KR')})`
        )
      }
    }
  }

  // --- 관심종목 목표 매수가/매수구간 체크 ---
  const watchlist = await prisma.watchlist.findMany({
    where: {
      OR: [
        { targetBuy: { not: null } },
        { entryLow: { not: null } },
      ],
    },
  })

  for (const w of watchlist) {
    const price = priceMap.get(w.ticker)
    if (!price) continue

    const name = escapeHtml(w.displayName)
    const ticker = escapeHtml(w.ticker)

    if (w.targetBuy != null && price.price <= w.targetBuy) {
      const key = `wbuy:${w.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        alerts.push(
          `💰 ${name} (${ticker}) 목표 매수가 도달: ${price.price.toLocaleString('ko-KR')} (목표 ${w.targetBuy.toLocaleString('ko-KR')})`
        )
      }
    }

    if (w.entryLow != null && w.entryHigh != null && price.price >= w.entryLow && price.price <= w.entryHigh) {
      const key = `wzone:${w.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        alerts.push(
          `🔔 ${name} (${ticker}) 매수구간 진입: ${price.price.toLocaleString('ko-KR')} (구간 ${w.entryLow.toLocaleString('ko-KR')}~${w.entryHigh.toLocaleString('ko-KR')})`
        )
      }
    }
  }

  if (alerts.length === 0) return

  const bot = getBot()
  const message = `⚡ <b>변동 알림</b>\n\n${alerts.join('\n')}`

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, message)
    } catch (error) {
      console.error(`[notification] 변동 알림 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log(`[notification] 변동 알림 발송: ${alerts.length}건`)
}
