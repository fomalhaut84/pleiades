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
  formatSignedKRWCompact,
  formatPercent,
  profitEmoji,
} from '@/bot/utils/formatter'
import { sendHtml } from '@/bot/utils/telegram'

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

  // 전일 스냅샷 조회 (D-1 변동 계산용)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const yesterday = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - 1))
  const prevSnapshots = await prisma.portfolioSnapshot.findMany({
    where: { snapshotDate: yesterday },
  })
  const prevMap = new Map(prevSnapshots.map((s) => [s.accountId, s]))

  let grandTotal = 0
  let grandCost = 0
  let grandPrevTotal = 0
  let hasPrevData = false
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
    const prev = prevMap.get(account.id)
    let changeSuffix = ''
    if (prev) {
      hasPrevData = true
      grandPrevTotal += prev.totalValueKRW
      const change = accountValue - prev.totalValueKRW
      changeSuffix = ` | ${formatSignedKRWCompact(change)} ${profitEmoji(change)}`
    }
    accountLines.push(
      `${emoji} ${account.name}: ${formatKRWCompact(accountValue)} (${formatPercent(returnPct)})${changeSuffix}`
    )
  }

  const grandPL = grandTotal - grandCost
  const grandReturn = grandCost > 0 ? (grandPL / grandCost) * 100 : 0

  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const dateStr = `${kst.getFullYear()}.${String(kst.getMonth() + 1).padStart(2, '0')}.${String(kst.getDate()).padStart(2, '0')}`

  // 총합 D-1: 전일 데이터가 있는 계좌만 비교 (일부 누락 시 왜곡 방지)
  const grandCurrentForCompare = accounts
    .filter((a) => prevMap.has(a.id))
    .reduce((s, a) => {
      let v = 0
      for (const h of a.holdings) {
        const p = priceMap.get(h.ticker)
        if (p) { v += calcCurrentValueKRW(h, p.price, h.currency === 'USD' ? fxRate : 1) }
        else { v += calcCostKRW(h) }
      }
      return s + v
    }, 0)
  const grandChangeLine = hasPrevData && grandPrevTotal > 0
    ? `📈 전일 대비: ${formatSignedKRWCompact(grandCurrentForCompare - grandPrevTotal)} (${formatPercent(((grandCurrentForCompare - grandPrevTotal) / grandPrevTotal) * 100)}) ${profitEmoji(grandCurrentForCompare - grandPrevTotal)}`
    : null

  const lines = [
    `📊 <b>일일 포트폴리오 요약</b> (${dateStr})\n`,
    `💰 총 평가금: <b>${formatKRWCompact(grandTotal)}</b> (${formatPercent(grandReturn)})`,
    ...(grandChangeLine ? [grandChangeLine] : []),
    '',
    ...accountLines,
    '',
    `💱 환율: ${fxRate.toLocaleString('ko-KR')}원/달러`,
  ]

  const fullMessage = lines.join('\n')

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, fullMessage)
    } catch (error) {
      console.error(`[notification] 일일 요약 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log('[notification] 일일 포트폴리오 요약 발송 완료')
}
