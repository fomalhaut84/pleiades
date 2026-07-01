import { prisma } from '@/lib/prisma'
import { fetchQuote, InvalidTickerError } from '@/lib/price-fetcher'
import { normalizeMarket } from '@/lib/market-hours'
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

const VALID_STRATEGIES = ['long_hold', 'swing', 'momentum', 'value', 'scalp']

/**
 * add_watchlist: 관심종목 추가 (신규)
 * fetchQuote로 유효성 검증 + displayName/market 자동 결정
 */
export async function addWatchlist(args: {
  ticker: string
  strategy?: string
  targetBuy?: number
  entryLow?: number
  entryHigh?: number
  memo?: string
}) {
  try {
    const ticker = args.ticker.trim().toUpperCase()
    if (!ticker) return toolError('ticker가 필요합니다.')

    const strategy = args.strategy && VALID_STRATEGIES.includes(args.strategy)
      ? args.strategy
      : 'swing'

    // 매수 구간 검증
    if (args.entryLow != null && args.entryHigh != null && args.entryLow > args.entryHigh) {
      return toolError('매수 구간 하한(entryLow)은 상한(entryHigh)보다 작거나 같아야 합니다.')
    }

    // 중복 확인
    const existing = await prisma.watchlist.findUnique({ where: { ticker } })
    if (existing) {
      return toolError(`이미 관심종목에 등록되어 있습니다: ${ticker}`)
    }

    // 시세 조회로 유효성 확인 + 메타 정보
    let displayName: string
    let market: string
    try {
      const quote = await fetchQuote(ticker)
      displayName = quote.displayName
      const normalized = normalizeMarket(quote.market, ticker)
      if (normalized === 'KR') market = 'KR'
      else if (normalized === 'US') market = 'US'
      else return toolError(`지원하지 않는 시장입니다: ${ticker} (${quote.market})`)
    } catch (error) {
      // 티커 자체 문제만 명확히 안내, 그 외(네트워크/레이트리밋 등)는 일반 에러로 전파
      if (error instanceof InvalidTickerError) {
        return toolError(`유효하지 않은 티커입니다: ${ticker}`)
      }
      return toolError(error)
    }

    const created = await prisma.watchlist.create({
      data: {
        ticker,
        displayName,
        market,
        strategy,
        targetBuy: args.targetBuy ?? null,
        entryLow: args.entryLow ?? null,
        entryHigh: args.entryHigh ?? null,
        memo: args.memo?.trim() || null,
      },
    })

    const lines = [
      `✅ 관심종목 추가: ${created.displayName} (${created.ticker})`,
      `- 시장: ${created.market}`,
      `- 전략: ${STRATEGY_LABELS[created.strategy] ?? created.strategy}`,
    ]
    if (created.targetBuy != null) lines.push(`- 목표 매수가: ${created.targetBuy}`)
    if (created.entryLow != null && created.entryHigh != null) lines.push(`- 매수 구간: ${created.entryLow} ~ ${created.entryHigh}`)
    if (created.memo) lines.push(`- 메모: ${created.memo}`)

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * update_watchlist: 관심종목 부분 업데이트 (ticker로 식별)
 */
export async function updateWatchlist(args: {
  ticker: string
  strategy?: string
  targetBuy?: number | null
  entryLow?: number | null
  entryHigh?: number | null
  memo?: string | null
}) {
  try {
    const ticker = args.ticker.trim().toUpperCase()
    const existing = await prisma.watchlist.findUnique({ where: { ticker } })
    if (!existing) {
      return toolError(`관심종목을 찾을 수 없습니다: ${ticker}`)
    }

    if (args.strategy !== undefined && !VALID_STRATEGIES.includes(args.strategy)) {
      return toolError(`유효한 전략: ${VALID_STRATEGIES.join(', ')}`)
    }

    // 업데이트 후 예상 구간으로 검증
    const nextLow = args.entryLow !== undefined ? args.entryLow : existing.entryLow
    const nextHigh = args.entryHigh !== undefined ? args.entryHigh : existing.entryHigh
    if (nextLow != null && nextHigh != null && nextLow > nextHigh) {
      return toolError('매수 구간 하한(entryLow)은 상한(entryHigh)보다 작거나 같아야 합니다.')
    }

    const data: Record<string, unknown> = {}
    if (args.strategy !== undefined) data.strategy = args.strategy
    if (args.targetBuy !== undefined) data.targetBuy = args.targetBuy
    if (args.entryLow !== undefined) data.entryLow = args.entryLow
    if (args.entryHigh !== undefined) data.entryHigh = args.entryHigh
    if (args.memo !== undefined) data.memo = args.memo === null ? null : args.memo.trim() || null

    if (Object.keys(data).length === 0) {
      return toolError('변경할 필드가 없습니다.')
    }

    const updated = await prisma.watchlist.update({
      where: { ticker },
      data,
    })

    const lines = [
      `✅ 관심종목 업데이트: ${updated.displayName} (${updated.ticker})`,
      `- 전략: ${STRATEGY_LABELS[updated.strategy] ?? updated.strategy}`,
    ]
    if (updated.targetBuy != null) lines.push(`- 목표 매수가: ${updated.targetBuy}`)
    if (updated.entryLow != null && updated.entryHigh != null) lines.push(`- 매수 구간: ${updated.entryLow} ~ ${updated.entryHigh}`)
    if (updated.memo) lines.push(`- 메모: ${updated.memo}`)

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_watchlist: 관심종목 삭제 (ticker로 식별)
 */
export async function deleteWatchlist(args: { ticker: string }) {
  try {
    const ticker = args.ticker.trim().toUpperCase()
    const existing = await prisma.watchlist.findUnique({ where: { ticker } })
    if (!existing) {
      return toolError(`관심종목을 찾을 수 없습니다: ${ticker}`)
    }

    await prisma.watchlist.delete({ where: { ticker } })
    return toolResult(`🗑️ 관심종목 삭제: ${existing.displayName} (${ticker})`)
  } catch (error) {
    return toolError(error)
  }
}
