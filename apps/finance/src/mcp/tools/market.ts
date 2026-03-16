import { prisma } from '@/lib/prisma'
import { formatDate, DEFAULT_FX_RATE_USD_KRW } from '@/lib/format'
import { toolResult, toolError, formatMoney } from '../utils'

/**
 * get_prices: 보유 종목 또는 지정 종목의 현재 시세
 */
export async function getPrices(args: { tickers?: string[] }) {
  try {
    let tickers: string[]
    if (args.tickers && args.tickers.length > 0) {
      tickers = args.tickers
    } else {
      // 보유 종목 ticker만 조회
      const holdings = await prisma.holding.findMany({
        select: { ticker: true },
        distinct: ['ticker'],
      })
      tickers = holdings.map((h) => h.ticker)
      if (tickers.length === 0) {
        return toolResult('보유 종목이 없습니다.')
      }
    }

    const prices = await prisma.priceCache.findMany({
      where: { ticker: { in: tickers } },
      orderBy: { ticker: 'asc' },
    })

    if (prices.length === 0) {
      return toolResult('캐시된 시세 데이터가 없습니다.')
    }

    // 명시적 tickers 지정 시 환율 포함 허용, 미지정 시 환율 제외
    const isExplicit = args.tickers && args.tickers.length > 0
    const displayPrices = isExplicit
      ? prices
      : prices.filter((p) => p.ticker !== 'USDKRW=X')

    if (displayPrices.length === 0) {
      return toolResult('캐시된 시세 데이터가 없습니다.')
    }

    const lines = [`## 시세 (${displayPrices.length}종목)`]

    for (const p of displayPrices) {

      const priceStr = formatMoney(p.price, p.currency)
      const changeStr =
        p.changePercent != null
          ? ` (${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%)`
          : ''

      lines.push(
        `- ${p.displayName} (${p.ticker}): ${priceStr}${changeStr} [${p.market}]`
      )
    }

    const latestUpdate = displayPrices.reduce(
      (latest, p) => (p.updatedAt > latest ? p.updatedAt : latest),
      displayPrices[0].updatedAt
    )
    lines.push(`\n갱신: ${formatDate(latestUpdate)}`)

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * get_fx_rate: 현재 원/달러 환율
 */
export async function getFxRate() {
  try {
    const fx = await prisma.priceCache.findUnique({
      where: { ticker: 'USDKRW=X' },
    })

    if (!fx) {
      return toolResult(
        `환율 데이터 없음. 기본값 사용: ${DEFAULT_FX_RATE_USD_KRW.toLocaleString('ko-KR')}원/달러`
      )
    }

    const changeStr =
      fx.changePercent != null
        ? ` (${fx.changePercent >= 0 ? '+' : ''}${fx.changePercent.toFixed(2)}%)`
        : ''

    return toolResult(
      `USD/KRW: ${fx.price.toLocaleString('ko-KR')}원${changeStr}\n갱신: ${formatDate(fx.updatedAt)}`
    )
  } catch (error) {
    return toolError(error)
  }
}
