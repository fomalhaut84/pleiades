import { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import { fetchQuote, InvalidTickerError, searchYahooByName, type QuoteResult } from '@/lib/price-fetcher'
import { searchKrxByName } from '@/lib/krx-stocks'
import { formatUSD, splitMessage } from '../utils/formatter'

function formatChange(change: number, currency: string): string {
  const sign = change >= 0 ? '+' : ''
  if (currency === 'USD') return `${sign}${formatUSD(change)}`
  if (currency === 'KRW') return `${sign}₩${Math.round(change).toLocaleString('ko-KR')}`
  return `${sign}${change.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function formatChangePercent(changePercent: number): string {
  const sign = changePercent >= 0 ? '+' : ''
  return ` (${sign}${changePercent.toFixed(2)}%)`
}

async function handlePrice(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const match = text.match(/^주가(?:\s+(.*))?$/)
  const query = match?.[1]?.trim()

  if (!query) {
    await ctx.reply('사용법: 주가 [종목명 또는 티커]\n예: 주가 AAPL, 주가 삼성전자, 주가 카카오')
    return
  }

  const upperQuery = query.toUpperCase()

  // 1. PriceCache에서 ticker 확정 시도 (보유 종목 빠른 매칭)
  const resolvedTicker = await resolveTickerFromCache(ctx, query, upperQuery)

  if (resolvedTicker === null) {
    // 여러 후보가 있어서 사용자에게 안내함 → 종료
    return
  }

  if (resolvedTicker) {
    // 보유 종목 ticker 확정 → 실시간 조회 (실패 시 캐시 fallback)
    await fetchAndReplyWithFallback(ctx, resolvedTicker)
    return
  }

  // 2. PriceCache 미매칭 → 종목명 검색 시도

  // 2-a. 한글 입력 → KRX DB에서 한국 종목 검색
  if (/[가-힣]/.test(query)) {
    const krxResults = await searchKrxByName(query)
    if (krxResults.length === 1) {
      await fetchAndReply(ctx, krxResults[0].ticker)
      return
    }
    if (krxResults.length > 1) {
      const candidates = krxResults
        .slice(0, 10)
        .map((r) => `${r.name} (${r.ticker}) [${r.market}]`)
        .join('\n  ')
      const suffix = krxResults.length > 10 ? '\n  외 다수' : ''
      for (const chunk of splitMessage(
        `여러 종목이 검색됩니다:\n  ${candidates}${suffix}\n\n정확한 종목명 또는 티커를 입력해주세요.`
      )) {
        await ctx.reply(chunk)
      }
      return
    }
    // KRX 미매칭 → 종목 못 찾음
    await ctx.reply(`⚠️ 종목을 찾을 수 없습니다: ${query}\n\n정확한 종목명 또는 티커를 입력해주세요.\n예: 삼성전자, AAPL, 005930.KS`)
    return
  }

  // 2-b. 영문 ticker 포맷 → yahoo-finance2 직접 조회
  // 원본 입력이 대문자+숫자+기호만이면 ticker로 간주 (예: AAPL, 005930.KS)
  // 소문자 포함 시(예: Apple, Tesla) 종목명 검색으로 fallthrough
  if (/^[A-Z0-9.\-=^]+$/.test(query)) {
    await fetchAndReply(ctx, upperQuery)
    return
  }

  // 2-c. 영문 종목명 → yahoo-finance2 search API
  const yahooResults = await searchYahooByName(query)
  if (yahooResults.length === 1) {
    await fetchAndReply(ctx, yahooResults[0].symbol)
    return
  }
  if (yahooResults.length > 1) {
    const candidates = yahooResults
      .slice(0, 10)
      .map((r) => `${r.shortname} (${r.symbol}) [${r.exchange}]`)
      .join('\n  ')
    for (const chunk of splitMessage(
      `여러 종목이 검색됩니다:\n  ${candidates}\n\n정확한 티커를 입력해주세요.`
    )) {
      await ctx.reply(chunk)
    }
    return
  }

  await ctx.reply(`⚠️ 종목을 찾을 수 없습니다: ${query}\n\n종목명 또는 티커를 입력해주세요.\n예: 삼성전자, Apple, AAPL`)
}

/**
 * PriceCache에서 ticker를 확정한다.
 * - 단일 매칭: ticker 반환
 * - 다중 매칭: 사용자에게 후보 안내 후 null 반환
 * - 미매칭: undefined 반환
 */
async function resolveTickerFromCache(
  ctx: Context,
  query: string,
  upperQuery: string
): Promise<string | null | undefined> {
  // 정확 일치 (ticker)
  const exactByTicker = await prisma.priceCache.findUnique({
    where: { ticker: upperQuery },
    select: { ticker: true },
  })
  if (exactByTicker) return exactByTicker.ticker

  // 정확 일치 (displayName, case-insensitive)
  const exactByName = await prisma.priceCache.findMany({
    where: { displayName: { equals: query, mode: 'insensitive' } },
    select: { ticker: true, displayName: true },
    take: 2,
  })
  if (exactByName.length === 1) return exactByName[0].ticker
  if (exactByName.length > 1) {
    const candidates = exactByName.map((p) => `${p.displayName} (${p.ticker})`).join('\n  ')
    for (const chunk of splitMessage(`여러 종목이 매칭됩니다:\n  ${candidates}\n\n티커를 입력해주세요.`)) {
      await ctx.reply(chunk)
    }
    return null
  }

  // 부분 일치
  const partialMatches = await prisma.priceCache.findMany({
    where: {
      OR: [
        { displayName: { contains: query, mode: 'insensitive' } },
        { ticker: { contains: upperQuery, mode: 'insensitive' } },
      ],
    },
    select: { ticker: true, displayName: true },
    orderBy: { ticker: 'asc' },
    take: 11,
  })

  if (partialMatches.length === 1) return partialMatches[0].ticker
  if (partialMatches.length > 1) {
    const candidates = partialMatches
      .slice(0, 10)
      .map((p) => `${p.displayName} (${p.ticker})`)
      .join('\n  ')
    const suffix = partialMatches.length > 10 ? '\n  외 다수' : ''
    for (const chunk of splitMessage(`여러 종목이 매칭됩니다:\n  ${candidates}${suffix}\n\n정확한 종목명 또는 티커를 입력해주세요.`)) {
      await ctx.reply(chunk)
    }
    return null
  }

  // 미매칭
  return undefined
}

/**
 * 보유 종목 실시간 조회. 실패 시 PriceCache fallback.
 */
async function fetchAndReplyWithFallback(ctx: Context, ticker: string): Promise<void> {
  try {
    const quote = await fetchQuote(ticker)
    await replyQuote(ctx, quote)
  } catch (error) {
    console.error(`[bot] 실시간 조회 실패, 캐시 fallback (${ticker}):`, error)
    const cached = await prisma.priceCache.findUnique({ where: { ticker } })
    if (cached) {
      const updatedAt = cached.updatedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      await replyQuote(ctx, {
        ticker: cached.ticker,
        displayName: cached.displayName,
        price: cached.price,
        currency: cached.currency,
        market: cached.market,
        change: cached.change,
        changePercent: cached.changePercent,
      }, `⚠️ 실시간 조회 실패, 캐시 데이터 표시 (${updatedAt})`)
    } else {
      await ctx.reply(`⚠️ 주가 조회 중 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`)
    }
  }
}

/**
 * 비보유 종목 실시간 조회. fallback 없음.
 */
async function fetchAndReply(ctx: Context, ticker: string): Promise<void> {
  try {
    const quote = await fetchQuote(ticker)
    await replyQuote(ctx, quote)
  } catch (error) {
    if (error instanceof InvalidTickerError) {
      await ctx.reply(`⚠️ 종목을 찾을 수 없습니다: ${ticker}\n\n티커를 정확히 입력해주세요.\n예: AAPL, 005930.KS, TSLA`)
    } else {
      console.error(`[bot] 실시간 주가 조회 실패 (${ticker}):`, error)
      await ctx.reply(`⚠️ 주가 조회 중 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`)
    }
  }
}

function formatPrice(price: number, currency: string): string {
  if (currency === 'USD') return formatUSD(price)
  if (currency === 'KRW') return `₩${Math.round(price).toLocaleString('ko-KR')}`
  return `${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

async function replyQuote(ctx: Context, quote: QuoteResult, suffix?: string): Promise<void> {
  const changeStr = quote.change != null ? formatChange(quote.change, quote.currency) : ''
  const changePctStr = quote.changePercent != null ? formatChangePercent(quote.changePercent) : ''
  const emoji = quote.changePercent != null ? (quote.changePercent >= 0 ? '🟢' : '🔴') : ''

  const priceStr = formatPrice(quote.price, quote.currency)
  const suffixLine = suffix ? `\n\n${suffix}` : ''

  await ctx.reply(
    `📈 ${quote.displayName} (${quote.ticker})\n\n` +
      `현재가: ${priceStr} ${emoji}\n` +
      `변동: ${changeStr}${changePctStr}${suffixLine}`
  )
}

async function handleFxRate(ctx: Context): Promise<void> {
  const fxData = await prisma.priceCache.findUnique({
    where: { ticker: 'USDKRW=X' },
  })

  if (!fxData) {
    await ctx.reply('⚠️ 환율 데이터가 없습니다. 주가 갱신을 확인해주세요.')
    return
  }

  const changeStr = fxData.change != null ? formatChange(fxData.change, 'KRW') : ''
  const changePctStr = fxData.changePercent != null ? formatChangePercent(fxData.changePercent) : ''

  const updatedAt = fxData.updatedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  await ctx.reply(
    `💱 USD/KRW 환율\n\n` +
      `$1 = ₩${fxData.price.toFixed(2)}\n` +
      `변동: ${changeStr}${changePctStr}\n` +
      `갱신: ${updatedAt}`
  )
}

export function registerPriceCommands(bot: Bot): void {
  bot.hears(/^주가(?:\s+.*)?$/, async (ctx) => {
    try {
      await handlePrice(ctx)
    } catch (error) {
      console.error('[bot] 주가 조회 실패:', error)
      await ctx.reply('⚠️ 주가 조회에 실패했습니다.')
    }
  })

  bot.hears(/^환율\s*$/, async (ctx) => {
    try {
      await handleFxRate(ctx)
    } catch (error) {
      console.error('[bot] 환율 조회 실패:', error)
      await ctx.reply('⚠️ 환율 조회에 실패했습니다.')
    }
  })
}
