import { Bot, Context, InlineKeyboard } from 'grammy'
import { prisma } from '@/lib/prisma'
import { createTrade } from '@/lib/trade-service'
import { formatKRWFull, formatUSD } from '../utils/formatter'

interface PendingTrade {
  requestedByUserId: number
  accountId: string
  accountName: string
  ticker: string
  displayName: string
  market: string
  type: 'BUY' | 'SELL'
  shares: number
  price: number
  currency: string
  fxRate: number | null
  expiresAt: number
}

// 메시지 ID → 대기 중인 거래 정보
const pendingTrades = new Map<string, PendingTrade>()

// 5분 후 자동 만료
const PENDING_TTL_MS = 5 * 60 * 1000

function cleanExpired(): void {
  const now = Date.now()
  pendingTrades.forEach((pending, key) => {
    if (pending.expiresAt < now) {
      pendingTrades.delete(key)
    }
  })
}

function formatTradePreview(type: 'BUY' | 'SELL', pending: PendingTrade): string {
  const typeLabel = type === 'BUY' ? '📥 매수' : '📤 매도'
  const priceStr = pending.currency === 'USD'
    ? formatUSD(pending.price)
    : formatKRWFull(pending.price)

  const totalKRW = pending.currency === 'USD'
    ? Math.round(pending.price * pending.shares * (pending.fxRate ?? 0))
    : Math.round(pending.price * pending.shares)

  const lines = [
    `${typeLabel} 확인`,
    '',
    `계좌: ${pending.accountName}`,
    `종목: ${pending.displayName} (${pending.ticker})`,
    `수량: ${pending.shares}주`,
    `단가: ${priceStr}`,
  ]

  if (pending.currency === 'USD' && pending.fxRate) {
    lines.push(`환율: ₩${pending.fxRate.toFixed(2)}`)
  }

  lines.push(`총액: ${formatKRWFull(totalKRW)}`)
  lines.push('')
  lines.push('거래를 기록하시겠습니까?')

  return lines.join('\n')
}

async function handleTrade(ctx: Context, type: 'BUY' | 'SELL'): Promise<void> {
  const typeLabel = type === 'BUY' ? '매수' : '매도'
  const text = ctx.message?.text ?? ''
  const match = text.match(new RegExp(`^${typeLabel}(?:\\s+(.*))?$`))
  const args = match?.[1]?.trim()

  if (!args) {
    await ctx.reply(
      `사용법: ${typeLabel} [계좌] [종목] [수량] [가격]\n` +
      `예: ${typeLabel} 세진 AAPL 10 150\n` +
      `예: ${typeLabel} 소담 TIGER미국S&P500 5 18500`
    )
    return
  }

  // 파싱: 마지막 2개는 수량, 가격. 첫번째는 계좌명. 나머지는 종목명.
  const parts = args.split(/\s+/)
  if (parts.length < 4) {
    await ctx.reply(
      `⚠️ 입력이 부족합니다.\n` +
      `사용법: ${typeLabel} [계좌] [종목] [수량] [가격]\n` +
      `예: ${typeLabel} 세진 AAPL 10 150`
    )
    return
  }

  const priceStr = parts[parts.length - 1]
  const sharesStr = parts[parts.length - 2]
  const accountName = parts[0]
  const tickerOrName = parts.slice(1, parts.length - 2).join(' ')

  // 수량/가격 엄격 검증 (숫자만 허용, 단위 문자 혼입 방지)
  if (!/^[1-9]\d*$/.test(sharesStr)) {
    await ctx.reply(`⚠️ 수량은 1 이상의 정수여야 합니다: ${sharesStr}`)
    return
  }
  if (!/^\d+(\.\d+)?$/.test(priceStr)) {
    await ctx.reply(`⚠️ 가격은 0보다 큰 숫자여야 합니다: ${priceStr}`)
    return
  }

  const shares = parseInt(sharesStr, 10)
  const price = parseFloat(priceStr)

  if (price <= 0) {
    await ctx.reply(`⚠️ 가격은 0보다 큰 숫자여야 합니다: ${priceStr}`)
    return
  }

  // 계좌 조회 (정확 일치, 다건 방어)
  const matchedAccounts = await prisma.account.findMany({
    where: { name: accountName },
    take: 2,
  })
  if (matchedAccounts.length === 0) {
    const allAccounts = await prisma.account.findMany({ select: { name: true } })
    const names = allAccounts.map((a) => a.name).join(', ')
    await ctx.reply(`⚠️ 계좌를 찾을 수 없습니다: ${accountName}\n사용 가능: ${names}`)
    return
  }
  if (matchedAccounts.length > 1) {
    await ctx.reply(`⚠️ 동일 이름의 계좌가 여러 개 있습니다. 관리자에게 문의해주세요.`)
    return
  }
  const account = matchedAccounts[0]

  // 종목 조회 (PriceCache 또는 Holding에서)
  const upperQuery = tickerOrName.toUpperCase()

  // PriceCache에서 ticker 정확 일치
  const priceByTicker = await prisma.priceCache.findUnique({
    where: { ticker: upperQuery },
  })

  let ticker: string
  let displayName: string
  let market: string
  let currency: string

  if (priceByTicker) {
    ticker = priceByTicker.ticker
    displayName = priceByTicker.displayName
    market = priceByTicker.market
    currency = priceByTicker.currency
  } else {
    // displayName으로 검색 (다건 가능성 처리)
    const priceByName = await prisma.priceCache.findMany({
      where: { displayName: { equals: tickerOrName, mode: 'insensitive' } },
      take: 2,
    })
    if (priceByName.length === 1) {
      ticker = priceByName[0].ticker
      displayName = priceByName[0].displayName
      market = priceByName[0].market
      currency = priceByName[0].currency
    } else if (priceByName.length > 1) {
      const candidates = priceByName
        .map((p) => `${p.displayName} (${p.ticker})`)
        .join('\n  ')
      await ctx.reply(
        `여러 종목이 매칭됩니다:\n  ${candidates}\n\n티커를 입력해주세요.`
      )
      return
    } else {
      // Holding에서 검색 (PriceCache에 없는 종목)
      const holding = await prisma.holding.findFirst({
        where: {
          accountId: account.id,
          OR: [
            { ticker: upperQuery },
            { displayName: { equals: tickerOrName, mode: 'insensitive' } },
          ],
        },
      })
      if (holding) {
        ticker = holding.ticker
        displayName = holding.displayName
        market = holding.market
        currency = holding.currency
      } else {
        await ctx.reply(`⚠️ 종목을 찾을 수 없습니다: ${tickerOrName}`)
        return
      }
    }
  }

  // SELL: 보유 수량 사전 확인
  if (type === 'SELL') {
    const holding = await prisma.holding.findUnique({
      where: { accountId_ticker: { accountId: account.id, ticker } },
    })
    if (!holding || holding.shares < shares) {
      const current = holding?.shares ?? 0
      await ctx.reply(`⚠️ 보유 수량(${current}주)을 초과합니다.`)
      return
    }
  }

  // USD 종목 환율 자동 조회
  let fxRate: number | null = null
  if (currency === 'USD') {
    const fxData = await prisma.priceCache.findUnique({
      where: { ticker: 'USDKRW=X' },
    })
    if (!fxData) {
      await ctx.reply('⚠️ 환율 데이터가 없습니다. 주가 갱신을 확인해주세요.')
      return
    }
    fxRate = fxData.price
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      await ctx.reply('⚠️ 환율 데이터가 비정상입니다. 주가 갱신을 확인해주세요.')
      return
    }
  }

  // 확인 키보드 표시
  cleanExpired()

  const pending: PendingTrade = {
    requestedByUserId: ctx.from?.id ?? 0,
    accountId: account.id,
    accountName: account.name,
    ticker,
    displayName,
    market,
    type,
    shares,
    price,
    currency,
    fxRate,
    expiresAt: Date.now() + PENDING_TTL_MS,
  }

  const tradeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const keyboard = new InlineKeyboard()
    .text('✅ 확인', `trade:confirm:${tradeId}`)
    .text('❌ 취소', `trade:cancel:${tradeId}`)

  const sent = await ctx.reply(formatTradePreview(type, pending), {
    reply_markup: keyboard,
  })

  // tradeId 키로 저장 (chatId:messageId도 함께 매핑)
  const key = `${sent.chat.id}:${sent.message_id}:${tradeId}`
  pendingTrades.set(key, pending)
}

async function handleTradeCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('trade:')) return

  const parts = data.split(':')
  const action = parts[1]
  const tradeId = parts[2]
  const message = ctx.callbackQuery?.message
  if (!message || !tradeId) {
    await ctx.answerCallbackQuery({ text: '⚠️ 메시지를 찾을 수 없습니다.' })
    return
  }

  const key = `${message.chat.id}:${message.message_id}:${tradeId}`

  // 원자적으로 Map에서 꺼내기 (중복 클릭 방지)
  const pending = pendingTrades.get(key)
  if (pending) {
    pendingTrades.delete(key)
  }

  if (!pending) {
    await ctx.answerCallbackQuery({ text: '⚠️ 만료된 거래입니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    return
  }

  // 요청자 검증
  if (ctx.from?.id !== pending.requestedByUserId) {
    // 원래 사용자가 아니면 다시 Map에 넣어두기
    pendingTrades.set(key, pending)
    await ctx.answerCallbackQuery({ text: '⚠️ 본인만 확인/취소할 수 있습니다.' })
    return
  }

  if (pending.expiresAt < Date.now()) {
    await ctx.answerCallbackQuery({ text: '⚠️ 거래가 만료되었습니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    return
  }

  if (action === 'cancel') {
    await ctx.answerCallbackQuery({ text: '취소되었습니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    await ctx.editMessageText('❌ 거래가 취소되었습니다.')
    return
  }

  if (action === 'confirm') {

    try {
      const result = await createTrade({
        accountId: pending.accountId,
        ticker: pending.ticker,
        displayName: pending.displayName,
        market: pending.market,
        type: pending.type,
        shares: pending.shares,
        price: pending.price,
        currency: pending.currency,
        fxRate: pending.fxRate,
        tradedAt: new Date(),
      })

      const typeLabel = pending.type === 'BUY' ? '📥 매수' : '📤 매도'
      const holdingInfo = result.holding
        ? `보유: ${result.holding.shares}주`
        : '전량 매도 (보유 0주)'

      await ctx.answerCallbackQuery({ text: '거래 기록 완료!' })
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      await ctx.editMessageText(
        `✅ ${typeLabel} 완료\n\n` +
        `${pending.displayName} (${pending.ticker})\n` +
        `${pending.shares}주 × ${pending.currency === 'USD' ? formatUSD(pending.price) : formatKRWFull(pending.price)}\n` +
        `총액: ${formatKRWFull(result.trade.totalKRW)}\n` +
        `${holdingInfo}`
      )
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : ''
      // 비즈니스 에러만 사용자에게 노출
      const isBusinessError = rawMsg.includes('초과합니다') ||
        rawMsg.includes('이미') ||
        rawMsg.includes('보유 수량 부족')
      const userMsg = isBusinessError ? rawMsg : '거래 기록에 실패했습니다.'
      if (!isBusinessError) {
        console.error('[bot] 거래 기록 실패:', error)
      }
      await ctx.answerCallbackQuery({ text: `⚠️ ${userMsg}` })
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      await ctx.editMessageText(`⚠️ 거래 실패: ${userMsg}`)
    }
  }
}

export function registerTradeCommands(bot: Bot): void {
  bot.hears(/^매수(?:\s+.*)?$/, async (ctx) => {
    try {
      await handleTrade(ctx, 'BUY')
    } catch (error) {
      console.error('[bot] 매수 실패:', error)
      await ctx.reply('⚠️ 매수 기록에 실패했습니다.')
    }
  })

  bot.hears(/^매도(?:\s+.*)?$/, async (ctx) => {
    try {
      await handleTrade(ctx, 'SELL')
    } catch (error) {
      console.error('[bot] 매도 실패:', error)
      await ctx.reply('⚠️ 매도 기록에 실패했습니다.')
    }
  })

  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery?.data
    if (data?.startsWith('trade:')) {
      try {
        await handleTradeCallback(ctx)
      } catch (error) {
        console.error('[bot] 콜백 처리 실패:', error)
        await ctx.answerCallbackQuery({ text: '⚠️ 처리 중 오류가 발생했습니다.' })
      }
    } else {
      await next()
    }
  })
}
