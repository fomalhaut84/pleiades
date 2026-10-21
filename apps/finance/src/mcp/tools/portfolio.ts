import { prisma } from '@/lib/prisma'
import {
  calcProfitLoss,
  calcCostKRW,
  calcCurrentValueKRW,
  formatDate,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import {
  resolveAccountId,
  getAllAccountIds,
  toolResult,
  toolError,
  formatMoney,
} from '../utils'

/**
 * get_portfolio: 계좌별 보유 종목 + 손익 현황
 */
export async function getPortfolio(args: { account_name: string }) {
  try {
    const accountId = await resolveAccountId(args.account_name)

    const accounts =
      accountId != null
        ? [{ id: accountId, name: args.account_name }]
        : await getAllAccountIds()

    const accountIds = accounts.map((a) => a.id)

    // 배치 쿼리: 전체 holdings + prices + 환율 한 번에 조회
    const [allHoldings, fxCache] = await Promise.all([
      prisma.holding.findMany({
        where: { accountId: { in: accountIds } },
        orderBy: { ticker: 'asc' },
      }),
      prisma.priceCache.findUnique({ where: { ticker: 'USDKRW=X' } }),
    ])

    const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

    // 보유 종목 시세 일괄 조회
    const allTickers = Array.from(new Set(allHoldings.map((h) => h.ticker)))
    const prices =
      allTickers.length > 0
        ? await prisma.priceCache.findMany({
            where: { ticker: { in: allTickers } },
          })
        : []
    const priceMap = new Map(prices.map((p) => [p.ticker, p]))

    // accountId별 그룹핑
    const holdingsByAccount = new Map<string, typeof allHoldings>()
    for (const h of allHoldings) {
      const list = holdingsByAccount.get(h.accountId)
      if (list) {
        list.push(h)
      } else {
        holdingsByAccount.set(h.accountId, [h])
      }
    }

    const results: string[] = []

    for (const account of accounts) {
      const holdings = holdingsByAccount.get(account.id) ?? []

      if (holdings.length === 0) {
        results.push(`## ${account.name}\n보유 종목 없음`)
        continue
      }

      let totalCost = 0
      let totalValue = 0
      let unpricedCost = 0
      const lines: string[] = [`## ${account.name}`]

      for (const h of holdings) {
        const price = priceMap.get(h.ticker)
        const currentFxRate = h.currency === 'USD' ? fxRate : 1
        const cost = calcCostKRW(h)

        if (!price) {
          unpricedCost += cost
          lines.push(
            `- ${h.displayName} (${h.ticker}): ${h.shares}주` +
              ` | 매입금 ${formatMoney(cost, 'KRW')} (시세 미수신)`
          )
          continue
        }

        const currentPrice = price.price
        const value = calcCurrentValueKRW(h, currentPrice, currentFxRate)
        const pl = calcProfitLoss(h, currentPrice, currentFxRate)

        totalCost += cost
        totalValue += value

        const priceStr =
          h.currency === 'USD'
            ? `$${currentPrice.toFixed(2)}`
            : `${currentPrice.toLocaleString('ko-KR')}원`

        lines.push(
          `- ${h.displayName} (${h.ticker}): ${h.shares}주 × ${priceStr}` +
            ` = ${formatMoney(value, 'KRW')}` +
            ` | 손익 ${formatMoney(pl.totalPL, 'KRW')} (${pl.returnPct >= 0 ? '+' : ''}${pl.returnPct.toFixed(1)}%)`
        )
      }

      const totalPL = totalValue - totalCost
      const totalReturn = totalCost > 0 ? (totalPL / totalCost) * 100 : 0
      lines.push(
        `\n**합계**: 평가금 ${formatMoney(totalValue, 'KRW')}` +
          ` | 매입금 ${formatMoney(totalCost, 'KRW')}` +
          ` | 손익 ${formatMoney(totalPL, 'KRW')} (${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}%)`
      )
      if (unpricedCost > 0) {
        lines.push(
          `※ 시세 미수신 종목 매입금 ${formatMoney(unpricedCost, 'KRW')}은 합계에서 제외`
        )
      }
      lines.push(`환율: ${fxRate.toLocaleString('ko-KR')}원/달러`)

      results.push(lines.join('\n'))
    }

    return toolResult(results.join('\n\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * get_trades: 최근 거래 내역 조회
 */
export async function getTrades(args: {
  account_name: string
  days?: number
}) {
  try {
    const accountId = await resolveAccountId(args.account_name)
    const days = args.days ?? 30
    const since = new Date()
    since.setDate(since.getDate() - days)

    const accounts =
      accountId != null
        ? [{ id: accountId, name: args.account_name }]
        : await getAllAccountIds()

    const accountIds = accounts.map((a) => a.id)

    // 배치 쿼리
    const allTrades = await prisma.trade.findMany({
      where: {
        accountId: { in: accountIds },
        tradedAt: { gte: since },
      },
      orderBy: { tradedAt: 'desc' },
    })

    // accountId별 그룹핑
    const tradesByAccount = new Map<string, typeof allTrades>()
    for (const t of allTrades) {
      const list = tradesByAccount.get(t.accountId)
      if (list) {
        list.push(t)
      } else {
        tradesByAccount.set(t.accountId, [t])
      }
    }

    const results: string[] = []

    for (const account of accounts) {
      const trades = tradesByAccount.get(account.id) ?? []

      if (trades.length === 0) {
        results.push(`## ${account.name}\n최근 ${days}일간 거래 없음`)
        continue
      }

      const lines = [`## ${account.name} (최근 ${days}일, ${trades.length}건)`]
      for (const t of trades) {
        const typeLabel = t.type === 'BUY' ? '매수' : '매도'
        const priceStr = formatMoney(t.price, t.currency)
        lines.push(
          `- ${formatDate(t.tradedAt)} ${typeLabel} ${t.displayName} (${t.ticker})` +
            ` ${t.shares}주 × ${priceStr}` +
            ` = ${formatMoney(t.totalKRW, 'KRW')}`
        )
      }

      results.push(lines.join('\n'))
    }

    return toolResult(results.join('\n\n'))
  } catch (error) {
    return toolError(error)
  }
}
