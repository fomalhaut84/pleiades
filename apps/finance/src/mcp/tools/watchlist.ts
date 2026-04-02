import { prisma } from '@/lib/prisma'
import { fetchQuote } from '@/lib/price-fetcher'
import { toolResult, toolError, formatMoney } from '../utils'

const STRATEGY_LABELS: Record<string, string> = {
  swing: '스윙',
  momentum: '모멘텀',
  value: '가치투자',
  scalp: '단타',
}

/**
 * get_watchlist: 관심종목 + 현재가 + 목표가 대비 현황
 */
export async function getWatchlist() {
  try {
    const items = await prisma.watchlist.findMany({
      orderBy: { addedAt: 'desc' },
    })

    if (items.length === 0) {
      return toolResult('등록된 관심종목이 없습니다.')
    }

    // 현재가 일괄 조회
    const tickers = items.map((w) => w.ticker)
    const prices = await prisma.priceCache.findMany({
      where: { ticker: { in: tickers } },
      select: { ticker: true, price: true, currency: true },
    })
    const priceMap = new Map(prices.map((p) => [p.ticker, p]))

    const lines: string[] = ['## 관심종목 현황\n']

    for (const w of items) {
      const strategy = STRATEGY_LABELS[w.strategy] ?? w.strategy
      let price = priceMap.get(w.ticker)

      // PriceCache 미스 시 실시간 조회 fallback
      if (!price) {
        try {
          const quote = await fetchQuote(w.ticker)
          price = { price: quote.price, currency: quote.currency } as unknown as typeof price
        } catch {
          // 조회 실패 시 무시
        }
      }

      const currentPrice = price?.price ?? null
      const currency = price?.currency ?? (w.market === 'US' ? 'USD' : 'KRW')

      lines.push(`**${w.displayName}** (${w.ticker}) — ${strategy}`)

      if (currentPrice != null) {
        lines.push(`- 현재가: ${formatMoney(currentPrice, currency)}`)
      } else {
        lines.push(`- 현재가: 데이터 없음`)
      }

      if (w.targetBuy != null) {
        lines.push(`- 목표 매수가: ${formatMoney(w.targetBuy, currency)}`)
      }

      if (w.entryLow != null && w.entryHigh != null) {
        lines.push(`- 매수 구간: ${formatMoney(w.entryLow, currency)} ~ ${formatMoney(w.entryHigh, currency)}`)
        if (currentPrice != null && currentPrice >= w.entryLow && currentPrice <= w.entryHigh) {
          lines.push(`- ⚡ **매수 구간 진입 중**`)
        }
      }

      if (w.memo) lines.push(`- 메모 (사용자 입력): ${w.memo.slice(0, 200)}`)
      lines.push(`- 등록일: ${w.addedAt.toISOString().slice(0, 10)}`)
      lines.push('')
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
