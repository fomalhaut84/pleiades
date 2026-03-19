/**
 * 순자산 스냅샷 자동 저장
 *
 * 매월 1일 실행. 주식 실시간 + 비주식 자산 - 부채 = 순자산.
 * NetWorthSnapshot 테이블에 upsert.
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import {
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import { formatKRWCompact } from '@/bot/utils/formatter'
import { sendHtml, h } from '@/bot/utils/telegram'

export async function takeNetWorthSnapshot(chatIds: number[]): Promise<void> {
  const bot = getBot()

  // 환율
  const fxCache = await prisma.priceCache.findUnique({ where: { ticker: 'USDKRW=X' } })
  const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

  // 주식 평가액
  const holdings = await prisma.holding.findMany()
  const tickers = holdings.map((hld) => hld.ticker)
  const prices = tickers.length > 0
    ? await prisma.priceCache.findMany({ where: { ticker: { in: tickers } } })
    : []
  const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

  let stockValueKRW = 0
  for (const hld of holdings) {
    const cp = priceMap.get(hld.ticker)
    if (cp != null) {
      stockValueKRW += calcCurrentValueKRW(hld, cp, hld.currency === 'USD' ? fxRate : 1)
    } else if (hld.currency === 'USD' && hld.avgPriceFx != null) {
      stockValueKRW += Math.round(hld.avgPriceFx * hld.shares * fxRate)
    } else {
      stockValueKRW += Math.round(hld.avgPrice * hld.shares)
    }
  }

  // 비주식 자산 + 부채
  const assets = await prisma.asset.findMany()
  const assetValueKRW = assets.filter((a) => !a.isLiability).reduce((s, a) => s + a.value, 0)
  const liabilityKRW = assets.filter((a) => a.isLiability).reduce((s, a) => s + a.value, 0)
  const netWorthKRW = stockValueKRW + assetValueKRW - liabilityKRW

  // 카테고리별 breakdown
  const breakdown: Record<string, number> = { stock: stockValueKRW }
  for (const a of assets) {
    const key = a.isLiability ? `liability_${a.category}` : a.category
    breakdown[key] = (breakdown[key] ?? 0) + a.value
  }

  // KST 기준 이번 달 1일
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const snapshotDate = new Date(Date.UTC(kst.getFullYear(), kst.getMonth(), 1))

  // upsert (같은 월 중복 방지)
  await prisma.netWorthSnapshot.upsert({
    where: { date: snapshotDate },
    update: {
      stockValueKRW,
      assetValueKRW,
      liabilityKRW,
      netWorthKRW,
      breakdown,
    },
    create: {
      date: snapshotDate,
      stockValueKRW,
      assetValueKRW,
      liabilityKRW,
      netWorthKRW,
      breakdown,
    },
  })

  console.log(`[networth] 순자산 스냅샷 저장: ${snapshotDate.toISOString().slice(0, 10)} = ${netWorthKRW}`)

  // 텔레그램 알림
  if (chatIds.length > 0) {
    const message =
      `📸 ${h.b('순자산 스냅샷 저장 완료')}\n\n` +
      `📈 주식: ${formatKRWCompact(stockValueKRW)}\n` +
      `📦 비주식: ${formatKRWCompact(assetValueKRW)}\n` +
      (liabilityKRW > 0 ? `🏦 부채: -${formatKRWCompact(liabilityKRW)}\n` : '') +
      `\n💰 ${h.b('순자산')}: ${formatKRWCompact(netWorthKRW)}`

    for (const chatId of chatIds) {
      try {
        await sendHtml(bot, chatId, message)
      } catch (error) {
        console.error(`[networth] 스냅샷 알림 실패 (chatId: ${chatId}):`, error)
      }
    }
  }
}
