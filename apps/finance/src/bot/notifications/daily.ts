/**
 * 매일 포트폴리오 요약 알림
 * AlertConfig.daily_summary_hour 시각에 실행
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import {
  accountEmoji,
  formatKRWCompact,
  formatPercent,
  splitMessage,
} from '@/bot/utils/formatter'

export async function sendDailySummary(chatIds: number[]): Promise<void> {
  const bot = getBot()

  // 환율 조회
  const fxCache = await prisma.priceCache.findUnique({
    where: { ticker: 'USDKRW=X' },
  })
  const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

  // 전체 계좌 + 보유 종목
  const accounts = await prisma.account.findMany({
    include: { holdings: true },
    orderBy: { createdAt: 'asc' },
  })

  // 전체 보유 종목 시세
  const allTickers = accounts.flatMap((a) => a.holdings.map((h) => h.ticker))
  const prices = allTickers.length > 0
    ? await prisma.priceCache.findMany({
        where: { ticker: { in: allTickers } },
      })
    : []
  const priceMap = new Map(prices.map((p) => [p.ticker, p]))

  let grandTotal = 0
  let grandCost = 0
  const accountLines: string[] = []

  for (const account of accounts) {
    let accountValue = 0
    let accountCost = 0

    for (const h of account.holdings) {
      const price = priceMap.get(h.ticker)
      const cost = calcCostKRW(h)
      accountCost += cost

      if (price) {
        const currentFxRate = h.currency === 'USD' ? fxRate : 1
        accountValue += calcCurrentValueKRW(h, price.price, currentFxRate)
      } else {
        accountValue += cost // 시세 없으면 매입금 기준
      }
    }

    grandTotal += accountValue
    grandCost += accountCost

    const pl = accountValue - accountCost
    const returnPct = accountCost > 0 ? (pl / accountCost) * 100 : 0

    const emoji = accountEmoji(account.name)
    accountLines.push(
      `${emoji} ${account.name}: ${formatKRWCompact(accountValue)} (${formatPercent(returnPct)})`
    )
  }

  const grandPL = grandTotal - grandCost
  const grandReturn = grandCost > 0 ? (grandPL / grandCost) * 100 : 0

  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const dateStr = `${kst.getFullYear()}.${String(kst.getMonth() + 1).padStart(2, '0')}.${String(kst.getDate()).padStart(2, '0')}`

  const lines = [
    `📊 일일 포트폴리오 요약 (${dateStr})\n`,
    `💰 총 평가금: ${formatKRWCompact(grandTotal)} (${formatPercent(grandReturn)})`,
    '',
    ...accountLines,
    '',
    `환율: ${fxRate.toLocaleString('ko-KR')}원/달러`,
  ]

  const fullMessage = lines.join('\n')

  for (const chatId of chatIds) {
    try {
      for (const chunk of splitMessage(fullMessage)) {
        await bot.api.sendMessage(chatId, chunk)
      }
    } catch (error) {
      console.error(`[notification] 일일 요약 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log('[notification] 일일 포트폴리오 요약 발송 완료')
}
