import { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import { formatKRWFull, formatUSD, formatPercent } from '../utils/formatter'
import { replyHtml, escapeHtml, h } from '../utils/telegram'

const STRATEGY_LABELS: Record<string, string> = {
  swing: '🔄 스윙',
  momentum: '🚀 모멘텀',
  value: '💎 가치투자',
  scalp: '⚡ 단타',
}

const STRATEGY_ALIASES: Record<string, string> = {
  '스윙': 'swing',
  '모멘텀': 'momentum',
  '가치투자': 'value', '가치': 'value',
  '단타': 'scalp',
}

function resolveStrategy(input: string): string {
  return STRATEGY_ALIASES[input] ?? (Object.keys(STRATEGY_LABELS).includes(input) ? input : 'swing')
}

/**
 * /관심 [종목] [전략] [메모...]
 * /관심 SOFI 스윙 RSI 30 이하 진입
 * /관심 SOFI 목표가 8.5
 * /관심 SOFI 매수구간 7.5 8.5
 */
async function handleWatch(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const args = text.replace(/^(\/watch(?:@\w+)?|관심)(\s|$)/i, '').trim()

  if (!args) {
    await ctx.reply(
      '👀 관심종목 관리\n\n' +
      '관심 [종목] — 관심종목 추가\n' +
      '관심 [종목] [전략] [메모] — 전략 + 메모 포함\n' +
      '관심 [종목] 목표가 [가격]\n' +
      '관심 [종목] 매수구간 [하한] [상한]\n' +
      '관심삭제 [종목] — 관심종목 제거\n' +
      '관심목록 — 전체 관심종목 표시'
    )
    return
  }

  const parts = args.split(/\s+/)
  const tickerInput = parts[0].toUpperCase()

  // 이미 보유 중인지 체크
  const holding = await prisma.holding.findFirst({
    where: { ticker: tickerInput },
  })
  if (holding) {
    await ctx.reply(`⚠️ ${escapeHtml(tickerInput)}은(는) 이미 보유 중입니다. /전략 커맨드로 관리하세요.`)
    return
  }

  // PriceCache에서 종목 정보 조회 (ticker → displayName 순서)
  let resolvedTicker = tickerInput
  let priceData = await prisma.priceCache.findUnique({
    where: { ticker: resolvedTicker },
  })

  // ticker 매칭 실패 시 displayName으로 검색 (한글 종목명 지원)
  if (!priceData) {
    const byName = await prisma.priceCache.findMany({
      where: { displayName: { equals: tickerInput, mode: 'insensitive' } },
      take: 2,
    })
    if (byName.length === 1) {
      priceData = byName[0]
      resolvedTicker = byName[0].ticker
    } else if (byName.length > 1) {
      const candidates = byName.map((p) => `${escapeHtml(p.displayName)} (${escapeHtml(p.ticker)})`).join('\n  ')
      await replyHtml(ctx, `여러 종목이 매칭됩니다:\n  ${candidates}\n\n티커를 정확히 입력해주세요.`)
      return
    }
  }

  // 보유 종목 재확인 (resolved ticker로)
  if (resolvedTicker !== resolvedTicker) {
    const holdingCheck = await prisma.holding.findFirst({
      where: { ticker: resolvedTicker },
    })
    if (holdingCheck) {
      await ctx.reply(`⚠️ ${escapeHtml(resolvedTicker)}은(는) 이미 보유 중입니다. /전략 커맨드로 관리하세요.`)
      return
    }
  }

  const displayName = priceData?.displayName ?? resolvedTicker
  const market = priceData?.market ?? 'US'

  // 서브커맨드 처리
  if (parts.length >= 3 && parts[1] === '목표가') {
    const price = parseFloat(parts[2])
    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply('⚠️ 유효한 가격을 입력해주세요.')
      return
    }
    await prisma.watchlist.upsert({
      where: { ticker: resolvedTicker },
      update: { targetBuy: price },
      create: { ticker: resolvedTicker, displayName, market, targetBuy: price },
    })
    await replyHtml(ctx, `✅ ${escapeHtml(displayName)} (${escapeHtml(resolvedTicker)}) 목표 매수가: ${price}`)
    return
  }

  if (parts.length >= 4 && parts[1] === '매수구간') {
    const low = parseFloat(parts[2])
    const high = parseFloat(parts[3])
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0 || low >= high) {
      await ctx.reply('⚠️ 유효한 매수구간을 입력해주세요. (하한 < 상한)')
      return
    }
    await prisma.watchlist.upsert({
      where: { ticker: resolvedTicker },
      update: { entryLow: low, entryHigh: high },
      create: { ticker: resolvedTicker, displayName, market, entryLow: low, entryHigh: high },
    })
    await replyHtml(ctx, `✅ ${escapeHtml(displayName)} (${escapeHtml(resolvedTicker)}) 매수구간: ${low} ~ ${high}`)
    return
  }

  // 추가 (전략 + 메모)
  const strategy = parts.length >= 2 ? resolveStrategy(parts[1]) : 'swing'
  const memo = parts.length >= 3 ? parts.slice(2).join(' ').replace(/^["']|["']$/g, '') : null

  await prisma.watchlist.upsert({
    where: { ticker: resolvedTicker },
    update: { strategy, ...(memo ? { memo } : {}), displayName, market },
    create: { ticker: resolvedTicker, displayName, market, strategy, memo },
  })

  const stratLabel = STRATEGY_LABELS[strategy] ?? strategy
  await replyHtml(ctx,
    `✅ 관심종목 추가: ${h.b(escapeHtml(displayName))} (${escapeHtml(resolvedTicker)})\n` +
    `전략: ${stratLabel}` +
    (memo ? `\n메모: ${escapeHtml(memo)}` : '')
  )
}

/**
 * /관심삭제 [종목]
 */
async function handleUnwatch(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const ticker = text.replace(/^(\/unwatch(?:@\w+)?|관심삭제)\s*/i, '').trim().toUpperCase()

  if (!ticker) {
    await ctx.reply('사용법: 관심삭제 [종목]\n예: 관심삭제 SOFI')
    return
  }

  const existing = await prisma.watchlist.findUnique({ where: { ticker } })
  if (!existing) {
    await ctx.reply(`⚠️ 관심종목에 없습니다: ${escapeHtml(ticker)}`)
    return
  }

  await prisma.watchlist.delete({ where: { ticker } })
  await replyHtml(ctx, `✅ 관심종목 제거: ${escapeHtml(existing.displayName)} (${escapeHtml(ticker)})`)
}

/**
 * /관심목록 — 전체 관심종목 + 현재가
 */
async function handleWatchlist(ctx: Context): Promise<void> {
  const items = await prisma.watchlist.findMany({
    orderBy: { addedAt: 'asc' },
  })

  if (items.length === 0) {
    await ctx.reply('👀 관심종목이 없습니다.\n\n관심 [종목] 으로 추가하세요.')
    return
  }

  // 현재가 조회
  const tickers = items.map((w) => w.ticker)
  const prices = await prisma.priceCache.findMany({
    where: { ticker: { in: tickers } },
  })
  const priceMap = new Map(prices.map((p) => [p.ticker, p]))

  const lines = [`👀 ${h.b('관심종목')} (${items.length})\n`]

  for (const w of items) {
    const price = priceMap.get(w.ticker)
    const stratLabel = STRATEGY_LABELS[w.strategy] ?? w.strategy

    let priceInfo = '시세 없음'
    if (price) {
      const priceStr = price.currency === 'USD'
        ? formatUSD(price.price)
        : formatKRWFull(price.price)
      const changeStr = price.changePercent != null
        ? ` (${formatPercent(price.changePercent)})`
        : ''
      priceInfo = `${priceStr}${changeStr}`
    }

    lines.push(`${h.b(escapeHtml(w.displayName))} (${escapeHtml(w.ticker)}) — ${stratLabel}`)
    lines.push(`  현재가: ${priceInfo}`)

    if (w.targetBuy != null) {
      lines.push(`  목표 매수가: ${w.targetBuy}`)
    }
    if (w.entryLow != null && w.entryHigh != null) {
      lines.push(`  매수구간: ${w.entryLow} ~ ${w.entryHigh}`)
      if (price) {
        const inZone = price.price >= w.entryLow && price.price <= w.entryHigh
        lines.push(`  → ${inZone ? '🔔 구간 진입!' : '⏳ 구간 밖'}`)
      }
    }
    if (w.memo) {
      lines.push(`  메모: ${escapeHtml(w.memo)}`)
    }
    lines.push('')
  }

  await replyHtml(ctx, lines.join('\n'))
}

export function registerWatchlistCommands(bot: Bot): void {
  bot.command('watch', handleWatch)
  bot.hears(/^관심(?!삭제|목록)(?:\s+.*)?$/, handleWatch)

  bot.command('unwatch', handleUnwatch)
  bot.hears(/^관심삭제(?:\s+.*)?$/, handleUnwatch)

  bot.command('watchlist', handleWatchlist)
  bot.hears(/^관심목록\s*$/, handleWatchlist)
}
