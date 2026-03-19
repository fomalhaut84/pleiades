/**
 * 분기 점검 리마인더
 * 1/1, 4/1, 7/1, 10/1 09:00 KST
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import { calcGiftTaxSummary } from '@/lib/tax/gift-tax'
import {
  accountEmoji,
  formatKRWFull,
  formatKRWCompact,
} from '@/bot/utils/formatter'
import { sendHtml, escapeHtml, h } from '@/bot/utils/telegram'

function getQuarterLabel(month: number): string {
  if (month <= 3) return 'Q1'
  if (month <= 6) return 'Q2'
  if (month <= 9) return 'Q3'
  return 'Q4'
}

export async function sendQuarterlyReminder(chatIds: number[]): Promise<void> {
  const bot = getBot()

  const accounts = await prisma.account.findMany({
    include: {
      holdings: true,
      deposits: { select: { amount: true, source: true, depositedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // 보유 종목 ticker + 환율만 조회
  const tickers = new Set<string>(['USDKRW=X'])
  for (const account of accounts) {
    for (const h of account.holdings) {
      tickers.add(h.ticker)
    }
  }

  const prices = await prisma.priceCache.findMany({
    where: { ticker: { in: Array.from(tickers) } },
  })

  const priceMap = new Map(prices.map((p) => [p.ticker, p]))
  const fxData = priceMap.get('USDKRW=X')
  const currentFxRate = fxData?.price ?? DEFAULT_FX_RATE_USD_KRW

  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const year = kst.getFullYear()
  const quarter = getQuarterLabel(kst.getMonth() + 1)

  const lines = [`📋 ${h.b(year + '년 ' + quarter + ' 분기 점검 리마인더')}\n`]

  let totalValue = 0
  for (const account of accounts) {
    const value = account.holdings.reduce((sum, holding) => {
      const price = priceMap.get(holding.ticker)
      if (!price) return sum + calcCostKRW(holding)
      return sum + calcCurrentValueKRW(holding, price.price, currentFxRate)
    }, 0)
    totalValue += value
    lines.push(`${accountEmoji(account.name)} ${h.b(escapeHtml(account.name))}: ${formatKRWFull(value)}`)
  }

  lines.push(`\n💰 ${h.b('합계')}: ${formatKRWFull(totalValue)}`)

  if (fxData) {
    lines.push(`💱 환율: $1 = ₩${fxData.price.toFixed(2)}`)
  }

  // 증여 현황 요약 (10년 윈도우 + 성인/미성년 한도)
  const giftLines: string[] = []
  for (const account of accounts) {
    const isMinor = account.ownerAge != null && account.ownerAge < 19
    const summary = calcGiftTaxSummary(account.deposits, isMinor)
    if (summary.totalGifted > 0) {
      const pct = (summary.usageRate * 100).toFixed(1)
      giftLines.push(
        `  ${escapeHtml(account.name)}: ${formatKRWFull(summary.totalGifted)} (${pct}% / ${formatKRWCompact(summary.exemptLimit)})`
      )
    }
  }

  if (giftLines.length > 0) {
    lines.push(`\n🎁 ${h.b('증여 누적 (10년 기준):')}`)
    lines.push(...giftLines)
  }

  lines.push(`\n📌 ${h.b('점검 사항:')}`)
  lines.push('  • 자산배분 비율 확인')
  lines.push('  • 리밸런싱 필요 여부')
  lines.push('  • 증여 한도 확인')
  lines.push('  • 세금 이벤트 점검')

  const fullMessage = lines.join('\n')

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, fullMessage)
    } catch (error) {
      console.error(`[notification] 분기 점검 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log('[notification] 분기 점검 리마인더 발송 완료')
}
