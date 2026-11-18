/**
 * 매일 포트폴리오 요약 알림
 * AlertConfig.daily_summary_hour 시각에 실행
 */

import { prisma } from '@/lib/prisma'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import { notifierFor, Route, NOTIFY_CTX } from './notifier'
import { dailySummaryContent, type DailyAccountRow } from './cards'
import { KST_OFFSET_MS } from '@/lib/kst-date'

export async function sendDailySummary(): Promise<void> {

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
  const kstNow = new Date(Date.now() + KST_OFFSET_MS)
  const yesterday = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - 1))
  const prevSnapshots = await prisma.portfolioSnapshot.findMany({
    where: { snapshotDate: yesterday },
  })
  const prevMap = new Map(prevSnapshots.map((s) => [s.accountId, s]))

  let grandTotal = 0
  let grandCost = 0
  let grandPrevTotal = 0
  let hasPrevData = false
  const accountRows: DailyAccountRow[] = []

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

    const prev = prevMap.get(account.id)
    if (prev) {
      hasPrevData = true
      grandPrevTotal += prev.totalValueKRW
    }
    accountRows.push({
      name: account.name,
      value: accountValue,
      returnPct,
      ...(prev ? { change: accountValue - prev.totalValueKRW } : {}),
    })
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
  const grandChange = grandCurrentForCompare - grandPrevTotal
  // 013 P3-b2 (#779) — 위 한 줄 + 계좌 행 목록 카드(`./cards`)
  const content = dailySummaryContent({
    dateStr,
    total: grandTotal,
    returnPct: grandReturn,
    ...(hasPrevData && grandPrevTotal > 0 ? { change: { amount: grandChange, pct: (grandChange / grandPrevTotal) * 100 } } : {}),
    accounts: accountRows,
    fxRate,
  })

  await notifierFor().notify(Route.ALLOWED, content, NOTIFY_CTX)

  console.log('[notification] 일일 포트폴리오 요약 발송 완료')
}
