import { Bot, Context, InlineKeyboard } from 'grammy'
import {
  askAdvisor,
  AdvisorTimeoutError,
  AdvisorError,
} from '@/lib/ai/claude-advisor'
import { prisma } from '@/lib/prisma'
import { createTrade } from '@/lib/trade-service'
import { splitMessage, formatKRWFull, formatUSD } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'
import { isTradeMessage } from '../utils/trade-trigger'
import { markdownToTelegramHtml } from '../utils/markdown'

const TYPING_INTERVAL_MS = 5000
const MIN_AI_TEXT_LENGTH = 3

// ============================================================
// AI 질문 처리
// ============================================================

function fireAiQuestion(ctx: Context, question: string): void {
  ctx.reply('🤔 생각 중...')
    .catch((e) => console.error('[bot] 생각 중 응답 실패:', e))

  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing')
      .catch(() => { /* 무시 */ })
  }, TYPING_INTERVAL_MS)

  askAdvisor(question)
    .then(async (result) => {
      const html = markdownToTelegramHtml(result.response)
      // HTML 전체를 한 번에 전송 시도, 4096자 초과 시 plain text fallback
      if (html.length <= 4096) {
        try {
          await ctx.reply(html, { parse_mode: 'HTML' })
        } catch {
          await ctx.reply(result.response)
        }
      } else {
        // 긴 응답: HTML 태그 분할 문제를 피하기 위해 plain text로 전송
        const chunks = splitMessage(result.response)
        for (const chunk of chunks) {
          await ctx.reply(chunk)
        }
      }
    })
    .catch(async (error) => {
      if (error instanceof AdvisorTimeoutError) {
        await ctx.reply('⚠️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
      } else if (error instanceof AdvisorError) {
        await ctx.reply(`⚠️ ${error.message}`)
      } else {
        console.error('[bot] AI 질문 처리 실패:', error)
        await ctx.reply('⚠️ AI 질문 처리에 실패했습니다.')
      }
    })
    .catch((e) => console.error('[bot] AI 응답 전송 실패:', e))
    .finally(() => clearInterval(typingInterval))
}

// ============================================================
// AI 거래 파싱
// ============================================================

interface ParsedTrade {
  type: 'BUY' | 'SELL'
  accountName: string
  ticker: string
  displayName: string
  shares: number
  price: number
  currency: 'KRW' | 'USD'
}

interface PendingAiTrade {
  requestedByUserId: number
  parsed: ParsedTrade
  accountId: string
  market: string
  fxRate: number | null
  expiresAt: number
}

const pendingAiTrades = new Map<string, PendingAiTrade>()
const PENDING_TTL_MS = 5 * 60 * 1000

function cleanExpiredAiTrades(): void {
  const now = Date.now()
  pendingAiTrades.forEach((v, k) => {
    if (v.expiresAt < now) pendingAiTrades.delete(k)
  })
}

const TRADE_PARSE_PROMPT = `다음 자연어 메시지에서 주식 거래 정보를 추출하세요. 반드시 아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요.

형식:
{"type":"BUY또는SELL","accountName":"계좌명","ticker":"티커","displayName":"종목명","shares":수량,"price":단가,"currency":"KRW또는USD"}

규칙:
- type: 샀/매수 → "BUY", 팔았/매도 → "SELL"
- accountName: 세진, 소담, 다솜 중 하나
- ticker: 영문 티커 (예: AAPL). 한국 ETF는 한글명으로 displayName에, ticker는 비워두기
- price: 숫자만 (원, 달러 단위)
- currency: 가격이 원화면 "KRW", 달러면 "USD"
- 파싱 불가능하면 {"error":"이유"} 반환

메시지: `

function fireTradeParseQuestion(ctx: Context, text: string): void {
  ctx.reply('📝 거래 정보 파싱 중...')
    .catch((e) => console.error('[bot] 파싱 중 응답 실패:', e))

  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing')
      .catch(() => { /* 무시 */ })
  }, TYPING_INTERVAL_MS)

  askAdvisor(TRADE_PARSE_PROMPT + text)
    .then(async (result) => {
      await handleParsedTrade(ctx, result.response)
    })
    .catch(async (error) => {
      if (error instanceof AdvisorTimeoutError) {
        await ctx.reply('⚠️ 파싱 시간이 초과되었습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.')
      } else {
        console.error('[bot] 거래 파싱 실패:', error)
        await ctx.reply('⚠️ 거래 파싱에 실패했습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.')
      }
    })
    .catch((e) => console.error('[bot] 파싱 응답 전송 실패:', e))
    .finally(() => clearInterval(typingInterval))
}

async function handleParsedTrade(ctx: Context, response: string): Promise<void> {
  // JSON 추출 (응답에 부가 텍스트가 있을 수 있음)
  const jsonMatch = response.match(/\{[^}]+\}/)
  if (!jsonMatch) {
    await ctx.reply('⚠️ 거래 정보를 파싱할 수 없습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.')
    return
  }

  let parsed: ParsedTrade
  try {
    const raw = JSON.parse(jsonMatch[0])
    if (raw.error) {
      await ctx.reply(`⚠️ 파싱 실패: ${raw.error}\n"매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.`)
      return
    }
    if (raw.type !== 'BUY' && raw.type !== 'SELL') {
      await ctx.reply(`⚠️ 매수/매도를 구분할 수 없습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.`)
      return
    }
    parsed = {
      type: raw.type,
      accountName: String(raw.accountName ?? ''),
      ticker: String(raw.ticker ?? ''),
      displayName: String(raw.displayName ?? ''),
      shares: Number(raw.shares),
      price: Number(raw.price),
      currency: raw.currency === 'USD' ? 'USD' : 'KRW',
    }
  } catch {
    await ctx.reply('⚠️ 거래 정보를 파싱할 수 없습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.')
    return
  }

  // 검증
  if (!parsed.accountName) {
    await ctx.reply('⚠️ 계좌명을 확인해주세요.')
    return
  }
  if (!Number.isFinite(parsed.shares) || parsed.shares <= 0 || !Number.isInteger(parsed.shares)) {
    await ctx.reply('⚠️ 수량은 1 이상의 정수여야 합니다.')
    return
  }
  if (!Number.isFinite(parsed.price) || parsed.price <= 0) {
    await ctx.reply('⚠️ 가격은 0보다 큰 숫자여야 합니다.')
    return
  }

  // 계좌 조회
  const accounts = await prisma.account.findMany({
    where: { name: parsed.accountName },
    take: 2,
  })
  if (accounts.length !== 1) {
    const allAccounts = await prisma.account.findMany({ select: { name: true } })
    const names = allAccounts.map((a) => a.name).join(', ')
    await ctx.reply(`⚠️ 계좌를 찾을 수 없습니다: ${parsed.accountName}\n사용 가능: ${names}`)
    return
  }
  const account = accounts[0]

  // 종목 조회 (ticker 또는 displayName)
  let ticker = parsed.ticker
  let displayName = parsed.displayName
  let market = ''
  let currency = parsed.currency

  if (ticker) {
    const priceData = await prisma.priceCache.findUnique({
      where: { ticker: ticker.toUpperCase() },
    })
    if (priceData) {
      ticker = priceData.ticker
      displayName = priceData.displayName
      market = priceData.market
      currency = priceData.currency as 'KRW' | 'USD'
    }
  }

  if (!market && displayName) {
    const byName = await prisma.priceCache.findMany({
      where: { displayName: { equals: displayName, mode: 'insensitive' } },
      take: 2,
    })
    if (byName.length > 1) {
      const candidates = byName.map((p) => `${p.displayName} (${p.ticker})`).join('\n  ')
      await ctx.reply(`여러 종목이 매칭됩니다:\n  ${candidates}\n\n티커를 정확히 입력해주세요.`)
      return
    }
    if (byName.length === 1) {
      ticker = byName[0].ticker
      displayName = byName[0].displayName
      market = byName[0].market
      currency = byName[0].currency as 'KRW' | 'USD'
    }
  }

  if (!market) {
    // Holding에서 검색
    const holding = await prisma.holding.findFirst({
      where: {
        accountId: account.id,
        OR: [
          ...(ticker ? [{ ticker: ticker.toUpperCase() }] : []),
          ...(displayName ? [{ displayName: { equals: displayName, mode: 'insensitive' as const } }] : []),
        ],
      },
    })
    if (holding) {
      ticker = holding.ticker
      displayName = holding.displayName
      market = holding.market
      currency = holding.currency as 'KRW' | 'USD'
    }
  }

  if (!ticker || !market) {
    await ctx.reply(`⚠️ 종목을 찾을 수 없습니다: ${parsed.displayName || parsed.ticker}\n티커를 정확히 입력하거나 "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.`)
    return
  }

  // 파싱 통화와 종목 통화 불일치 체크
  if (parsed.currency !== currency) {
    const currLabel = currency === 'USD' ? '달러(USD)' : '원화(KRW)'
    await ctx.reply(`⚠️ ${displayName}은(는) ${currLabel} 종목입니다. 가격 단위를 확인해주세요.`)
    return
  }

  // 환율 조회 (USD 종목)
  let fxRate: number | null = null
  if (currency === 'USD') {
    const fxData = await prisma.priceCache.findUnique({
      where: { ticker: 'USDKRW=X' },
    })
    if (!fxData || !Number.isFinite(fxData.price) || fxData.price <= 0) {
      await ctx.reply('⚠️ 환율 데이터가 없습니다.')
      return
    }
    fxRate = fxData.price
  }

  // 확인 키보드 표시
  cleanExpiredAiTrades()

  const typeLabel = parsed.type === 'BUY' ? '📥 매수' : '📤 매도'
  const priceStr = currency === 'USD'
    ? formatUSD(parsed.price)
    : formatKRWFull(parsed.price)
  const totalKRW = currency === 'USD'
    ? Math.round(parsed.price * parsed.shares * (fxRate ?? 0))
    : Math.round(parsed.price * parsed.shares)

  const preview = [
    `${typeLabel} 확인 (AI 파싱)`,
    '',
    `계좌: ${parsed.accountName}`,
    `종목: ${displayName} (${ticker})`,
    `수량: ${parsed.shares}주`,
    `단가: ${priceStr}`,
    ...(currency === 'USD' && fxRate ? [`환율: ₩${fxRate.toFixed(2)}`] : []),
    `총액: ${formatKRWFull(totalKRW)}`,
    '',
    '거래를 기록하시겠습니까?',
  ].join('\n')

  const tradeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const keyboard = new InlineKeyboard()
    .text('✅ 확인', `aitrade:confirm:${tradeId}`)
    .text('❌ 취소', `aitrade:cancel:${tradeId}`)

  const sent = await ctx.reply(preview, { reply_markup: keyboard })

  const key = `${sent.chat.id}:${sent.message_id}:${tradeId}`
  pendingAiTrades.set(key, {
    requestedByUserId: ctx.from?.id ?? 0,
    parsed: { ...parsed, ticker, displayName, currency },
    accountId: account.id,
    market,
    fxRate,
    expiresAt: Date.now() + PENDING_TTL_MS,
  })
}

async function handleAiTradeCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('aitrade:')) return

  const parts = data.split(':')
  const action = parts[1]
  const tradeId = parts[2]
  const message = ctx.callbackQuery?.message
  if (!message || !tradeId) {
    await ctx.answerCallbackQuery({ text: '⚠️ 메시지를 찾을 수 없습니다.' })
    return
  }

  const key = `${message.chat.id}:${message.message_id}:${tradeId}`
  const pending = pendingAiTrades.get(key)
  if (pending) pendingAiTrades.delete(key)

  if (!pending) {
    await ctx.answerCallbackQuery({ text: '⚠️ 만료된 거래입니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    return
  }

  if (ctx.from?.id !== pending.requestedByUserId) {
    pendingAiTrades.set(key, pending)
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
      const { parsed } = pending
      const result = await createTrade({
        accountId: pending.accountId,
        ticker: parsed.ticker,
        displayName: parsed.displayName,
        market: pending.market,
        type: parsed.type,
        shares: parsed.shares,
        price: parsed.price,
        currency: parsed.currency,
        fxRate: pending.fxRate,
        tradedAt: new Date(),
      })

      const typeLabel = parsed.type === 'BUY' ? '📥 매수' : '📤 매도'
      const holdingInfo = result.holding
        ? `보유: ${result.holding.shares}주`
        : '전량 매도 (보유 0주)'

      await ctx.answerCallbackQuery({ text: '거래 기록 완료!' })
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      await ctx.editMessageText(
        `✅ ${typeLabel} 완료\n\n` +
        `${parsed.displayName} (${parsed.ticker})\n` +
        `${parsed.shares}주 × ${parsed.currency === 'USD' ? formatUSD(parsed.price) : formatKRWFull(parsed.price)}\n` +
        `총액: ${formatKRWFull(result.trade.totalKRW)}\n` +
        `${holdingInfo}`
      )
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : ''
      const isBusinessError = rawMsg.includes('초과합니다') || rawMsg.includes('보유 수량 부족')
      const userMsg = isBusinessError ? rawMsg : '거래 기록에 실패했습니다.'
      if (!isBusinessError) console.error('[bot] AI 거래 기록 실패:', error)
      await ctx.answerCallbackQuery({ text: `⚠️ ${userMsg}` })
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      await ctx.editMessageText(`⚠️ 거래 실패: ${userMsg}`)
    }
  }
}

// ============================================================
// 등록
// ============================================================

export function registerAiCommands(bot: Bot): void {
  bot.command('ai', async (ctx) => {
    const question = ctx.match?.toString().trim()

    if (!question) {
      await ctx.reply(
        '🤖 AI 어드바이저에게 질문하세요.\n\n' +
          '사용법: /ai 전체 포트폴리오 현황 분석해줘\n' +
          '또는 그냥 자연어로 질문하면 됩니다.\n\n' +
          '거래 입력도 가능합니다:\n' +
          '"소담 TIGER S&P500 10주 24900원에 샀어"'
      )
      return
    }

    fireAiQuestion(ctx, question)
  })

  // aitrade: 콜백 처리
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery?.data
    if (data?.startsWith('aitrade:')) {
      try {
        await handleAiTradeCallback(ctx)
      } catch (error) {
        console.error('[bot] AI 거래 콜백 실패:', error)
        await ctx.answerCallbackQuery({ text: '⚠️ 처리 중 오류가 발생했습니다.' })
      }
    } else {
      await next()
    }
  })
}

/**
 * AI fallback: 거래 파싱 또는 일반 질문
 */
export function registerAiFallback(bot: Bot): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text

    if (text.startsWith('/')) return
    if (text.trim().length < MIN_AI_TEXT_LENGTH) return

    // 거래 키워드 → AI 거래 파싱
    if (isTradeMessage(text)) {
      fireTradeParseQuestion(ctx, text)
      return
    }

    // 질문형 키워드 → AI 질문
    if (isAiQuestion(text)) {
      fireAiQuestion(ctx, text)
      return
    }
  })
}
