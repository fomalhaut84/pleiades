/**
 * 급등락 / 환율 변동 알림
 *
 * refreshPrices() 후 호출.
 * AlertConfig 임계값 초과 시 텔레그램 알림.
 * 중복 방지: 동일 종목 당일 1회만 발송.
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { formatPercent, splitMessage } from '@/bot/utils/formatter'

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

  // PriceCache에서 변동률 조회
  const prices = await prisma.priceCache.findMany({
    where: {
      ticker: { in: Array.from(holdingTickers).concat(['USDKRW=X']) },
    },
  })

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

  if (alerts.length === 0) return

  const bot = getBot()
  const message = `⚡ 변동 알림\n\n${alerts.join('\n')}`

  for (const chatId of chatIds) {
    try {
      for (const chunk of splitMessage(message)) {
        await bot.api.sendMessage(chatId, chunk)
      }
    } catch (error) {
      console.error(`[notification] 변동 알림 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log(`[notification] 변동 알림 발송: ${alerts.length}건`)
}
