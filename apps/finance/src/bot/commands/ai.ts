import type { Bot } from 'grammy'
import {
  askAdvisor,
  AdvisorTimeoutError,
  AdvisorError,
  describeAdvisorError,
} from '@/lib/ai/claude-advisor'
import { prisma } from '@/lib/prisma'
import { createTrade } from '@/lib/trade-service'
import { splitMessage, formatKRWFull, formatUSD } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'
import { isTradeMessage } from '../utils/trade-trigger'
import { markdownToTelegramHtml } from '../utils/markdown'
import { sanitizeError } from '../utils/error'
import { buildTickerCheckLines } from '../utils/trade-price-check'
import {
  htmlReply,
  isSameRequester,
  plainReply,
  type ButtonOutput,
  type ButtonPress,
  type ReplyOutput,
  type Requester,
} from '../core/reply'
import { pendingKey, type StateKey } from '../core/state-key'
import {
  telegramButtonOutput,
  telegramButtonPress,
  telegramOutput,
  telegramRequester,
  telegramStateKeyOf,
} from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-1b (pleiades#385 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 H2 · Q · S):
 * 판단(decide*)은 중립 응답 모델(`../core/reply`)로만 말하고, 아래 register* 는 텔레그램 어댑터다.
 * 대화 상태(세션 · 동시 1건)의 키는 상태 키(`telegram:<chatId>` — Discord 는 채널+사용자 · UQ-4 플랫폼별).
 * 특성 테스트 `__tests__/ai-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

const MIN_AI_TEXT_LENGTH = 3

// 상태 키별 AI 세션 ID + 마지막 사용 시각 관리
const chatSessions = new Map<StateKey, { sessionId: string; lastUsed: number }>()
// 상태 키별 진행 중 플래그 (직렬화)
const chatBusy = new Set<StateKey>()
// 24시간 미사용 세션 정리
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
function cleanExpiredSessions(): void {
  const now = Date.now()
  chatSessions.forEach((v, k) => {
    if (now - v.lastUsed > SESSION_TTL_MS) chatSessions.delete(k)
  })
}

// ============================================================
// AI 질문 처리
// ============================================================

/**
 * AI 대화 — 진행 안내 뒤 곧 돌아가고(fire-and-forget) 답은 나중에 보낸다.
 * 상태 키가 없으면(텔레그램 chat 없음) 무응답 · 같은 키에 진행 중인 질문이 있으면 처리 중 안내.
 */
export function decideAiQuestion(question: string, stateKey: StateKey | undefined, out: ReplyOutput): void {
  if (!stateKey) return

  if (chatBusy.has(stateKey)) {
    out.reply(plainReply('⏳ 이전 질문을 처리 중입니다. 잠시 후 다시 시도해주세요.'))
      .catch(() => {})
    return
  }
  chatBusy.add(stateKey)

  out.reply(plainReply('🤔 생각 중...'))
    .catch((e) => console.error('[bot] 생각 중 응답 실패:', e))

  const typingInterval = setInterval(() => {
    out.typing()
      .catch(() => { /* 무시 */ })
  }, out.typingIntervalMs)

  cleanExpiredSessions()
  askAdvisor(question, {
    sessionId: chatSessions.get(stateKey)?.sessionId,
    persist: true,
    intent: 'conversation',  // 자유 질문 → sonnet (35-A / #433)
    caller: 'bot:ai_chat',
  })
    .then(async (result) => {
      if (result.sessionId) chatSessions.set(stateKey, { sessionId: result.sessionId, lastUsed: Date.now() })
      const chunks = splitMessage(result.response)
      for (const chunk of chunks) {
        const chunkHtml = markdownToTelegramHtml(chunk)
        try {
          await out.reply(htmlReply(chunkHtml))
        } catch {
          await out.reply(plainReply(chunk))
        }
      }
    })
    .catch(async (error) => {
      if (error instanceof AdvisorTimeoutError) {
        await out.reply(plainReply('⚠️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'))
      } else if (error instanceof AdvisorError) {
        // Phase 40-B (#469): code 별 fallback 메시지로 사용자 UX 개선.
        // detail (stderr) 은 console 로만 (사용자 노출 금지).
        if (error.detail) console.error(`[bot] AI advisor detail (${error.code}): ${error.detail}`)
        await out.reply(plainReply(describeAdvisorError(error)))
      } else {
        console.error(`[bot] AI 질문 처리 실패: ${sanitizeError(error)}`)
        await out.reply(plainReply('⚠️ AI 질문 처리에 실패했습니다.'))
      }
    })
    .catch((e) => console.error('[bot] AI 응답 전송 실패:', e))
    .finally(() => { clearInterval(typingInterval); chatBusy.delete(stateKey) })
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
  /** 본인 확인 값 — `Requester.userId`(텔레그램 `String(from?.id ?? 0)`) */
  requestedByUserId: string
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

/** AI 거래 파싱 — 진행 안내 뒤 곧 돌아가고(fire-and-forget) 확인 메시지는 나중에 보낸다. */
export function decideTradeParse(text: string, who: Requester, out: ReplyOutput): void {
  out.reply(plainReply('📝 거래 정보 파싱 중...'))
    .catch((e) => console.error('[bot] 파싱 중 응답 실패:', e))

  const typingInterval = setInterval(() => {
    out.typing()
      .catch(() => { /* 무시 */ })
  }, out.typingIntervalMs)

  askAdvisor(TRADE_PARSE_PROMPT + text, { intent: 'parse', caller: 'bot:trade_parse' })  // 구조 JSON 파싱 → haiku (35-A)
    .then(async (result) => {
      await handleParsedTrade(out, who, result.response)
    })
    .catch(async (error) => {
      if (error instanceof AdvisorTimeoutError) {
        await out.reply(plainReply('⚠️ 파싱 시간이 초과되었습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.'))
      } else {
        console.error('[bot] 거래 파싱 실패:', error)
        await out.reply(plainReply('⚠️ 거래 파싱에 실패했습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.'))
      }
    })
    .catch((e) => console.error('[bot] 파싱 응답 전송 실패:', e))
    .finally(() => clearInterval(typingInterval))
}

async function handleParsedTrade(out: ReplyOutput, who: Requester, response: string): Promise<void> {
  // JSON 추출 (응답에 부가 텍스트가 있을 수 있음)
  const jsonMatch = response.match(/\{[^}]+\}/)
  if (!jsonMatch) {
    await out.reply(plainReply('⚠️ 거래 정보를 파싱할 수 없습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.'))
    return
  }

  let parsed: ParsedTrade
  try {
    const raw = JSON.parse(jsonMatch[0])
    if (raw.error) {
      await out.reply(plainReply(`⚠️ 파싱 실패: ${raw.error}\n"매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.`))
      return
    }
    if (raw.type !== 'BUY' && raw.type !== 'SELL') {
      await out.reply(plainReply(`⚠️ 매수/매도를 구분할 수 없습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.`))
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
    await out.reply(plainReply('⚠️ 거래 정보를 파싱할 수 없습니다. "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.'))
    return
  }

  // 검증
  if (!parsed.accountName) {
    await out.reply(plainReply('⚠️ 계좌명을 확인해주세요.'))
    return
  }
  if (!Number.isFinite(parsed.shares) || parsed.shares <= 0 || !Number.isInteger(parsed.shares)) {
    await out.reply(plainReply('⚠️ 수량은 1 이상의 정수여야 합니다.'))
    return
  }
  if (!Number.isFinite(parsed.price) || parsed.price <= 0) {
    await out.reply(plainReply('⚠️ 가격은 0보다 큰 숫자여야 합니다.'))
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
    await out.reply(plainReply(`⚠️ 계좌를 찾을 수 없습니다: ${parsed.accountName}\n사용 가능: ${names}`))
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
      await out.reply(plainReply(`여러 종목이 매칭됩니다:\n  ${candidates}\n\n티커를 정확히 입력해주세요.`))
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
    await out.reply(plainReply(`⚠️ 종목을 찾을 수 없습니다: ${parsed.displayName || parsed.ticker}\n티커를 정확히 입력하거나 "매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.`))
    return
  }

  // 파싱 통화와 종목 통화 불일치 체크
  if (parsed.currency !== currency) {
    const currLabel = currency === 'USD' ? '달러(USD)' : '원화(KRW)'
    await out.reply(plainReply(`⚠️ ${displayName}은(는) ${currLabel} 종목입니다. 가격 단위를 확인해주세요.`))
    return
  }

  // 환율 조회 (USD 종목)
  let fxRate: number | null = null
  if (currency === 'USD') {
    const fxData = await prisma.priceCache.findUnique({
      where: { ticker: 'USDKRW=X' },
    })
    if (!fxData || !Number.isFinite(fxData.price) || fxData.price <= 0) {
      await out.reply(plainReply('⚠️ 환율 데이터가 없습니다.'))
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

  // #510: 이름 → 티커 오매칭을 확인 단계에서 드러내기 위한 검증 라인
  const tickerCache = await prisma.priceCache.findUnique({
    where: { ticker },
    select: { price: true, quoteName: true },
  })
  const checkLines = buildTickerCheckLines(parsed.price, currency, tickerCache)

  const preview = [
    `${typeLabel} 확인 (AI 파싱)`,
    '',
    `계좌: ${parsed.accountName}`,
    `종목: ${displayName} (${ticker})`,
    ...checkLines,
    `수량: ${parsed.shares}주`,
    `단가: ${priceStr}`,
    ...(currency === 'USD' && fxRate ? [`환율: ₩${fxRate.toFixed(2)}`] : []),
    `총액: ${formatKRWFull(totalKRW)}`,
    '',
    '거래를 기록하시겠습니까?',
  ].join('\n')

  const tradeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const messageKey = await out.reply(plainReply(preview, [[
    { label: '✅ 확인', action: `aitrade:confirm:${tradeId}` },
    { label: '❌ 취소', action: `aitrade:cancel:${tradeId}` },
  ]]))

  pendingAiTrades.set(pendingKey(messageKey, tradeId), {
    requestedByUserId: who.userId,
    parsed: { ...parsed, ticker, displayName, currency },
    accountId: account.id,
    market,
    fxRate,
    expiresAt: Date.now() + PENDING_TTL_MS,
  })
}

export async function decideAiTradeButton(data: string, press: ButtonPress, out: ButtonOutput): Promise<void> {
  if (!data.startsWith('aitrade:')) return

  const parts = data.split(':')
  const action = parts[1]
  const tradeId = parts[2]
  if (!press.messageKey || !tradeId) {
    await out.toast('⚠️ 메시지를 찾을 수 없습니다.')
    return
  }

  const key = pendingKey(press.messageKey, tradeId)
  const pending = pendingAiTrades.get(key)
  if (pending) pendingAiTrades.delete(key)

  if (!pending) {
    await out.toast('⚠️ 만료된 거래입니다.')
    await out.removeButtons()
    return
  }

  if (!isSameRequester(press.clickerId, pending.requestedByUserId)) {
    pendingAiTrades.set(key, pending)
    await out.toast('⚠️ 본인만 확인/취소할 수 있습니다.')
    return
  }

  if (pending.expiresAt < Date.now()) {
    await out.toast('⚠️ 거래가 만료되었습니다.')
    await out.removeButtons()
    return
  }

  if (action === 'cancel') {
    await out.toast('취소되었습니다.')
    await out.removeButtons()
    await out.edit(plainReply('❌ 거래가 취소되었습니다.'))
    return
  }

  if (action === 'confirm') {
    // pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3): "거래 실패" 는 기록(createTrade) 실패에만 — 기록 뒤 원본 수정 실패는
    // 예전에 여기서 "거래 실패" 로 바뀌어 기록된 거래에 거짓 안내를 띄웠다. 이제 기록 뒤 단계는 따로 잡는다.
    const { parsed } = pending
    let result: Awaited<ReturnType<typeof createTrade>>
    try {
      result = await createTrade({
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
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : ''
      const isBusinessError = rawMsg.includes('초과합니다') || rawMsg.includes('보유 수량 부족')
      const userMsg = isBusinessError ? rawMsg : '거래 기록에 실패했습니다.'
      if (!isBusinessError) console.error('[bot] AI 거래 기록 실패:', error)
      await out.toast(`⚠️ ${userMsg}`)
      await out.removeButtons()
      await out.edit(plainReply(`⚠️ 거래 실패: ${userMsg}`))
      return
    }

    const typeLabel = parsed.type === 'BUY' ? '📥 매수' : '📤 매도'
    const holdingInfo = result.holding
      ? `보유: ${result.holding.shares}주`
      : '전량 매도 (보유 0주)'

    // 기록은 끝났다 — 화면 갱신 실패는 로그만(거짓 "거래 실패" 를 띄우지 않는다)
    try {
      await out.toast('거래 기록 완료!')
      await out.removeButtons()
      await out.edit(plainReply(
        `✅ ${typeLabel} 완료\n\n` +
        `${parsed.displayName} (${parsed.ticker})\n` +
        `${parsed.shares}주 × ${parsed.currency === 'USD' ? formatUSD(parsed.price) : formatKRWFull(parsed.price)}\n` +
        `총액: ${formatKRWFull(result.trade.totalKRW)}\n` +
        `${holdingInfo}`
      ))
    } catch (error) {
      console.error('[bot] AI 거래 기록 뒤 원본 수정 실패(기록은 됨):', error)
    }
  }
}

// ============================================================
// 명령 판단
// ============================================================

/** `/ai <질문>` — 인자(앞뒤 공백 포함 원문)가 비면 사용법 · 있으면 AI 대화(키워드 판정 없이). */
export async function decideAiCommand(args: string | undefined, stateKey: StateKey | undefined, out: ReplyOutput): Promise<void> {
  const question = args?.trim()

  if (!question) {
    await out.reply(plainReply(
      '🤖 AI 어드바이저에게 질문하세요.\n\n' +
        '사용법: /ai 전체 포트폴리오 현황 분석해줘\n' +
        '또는 그냥 자연어로 질문하면 됩니다.\n\n' +
        '거래 입력도 가능합니다:\n' +
        '"소담 TIGER S&P500 10주 24900원에 샀어"'
    ))
    return
  }

  decideAiQuestion(question, stateKey, out)
}

/** `/reset` — 그 상태 키의 AI 세션만 지운다(다른 chat·플랫폼 세션은 그대로). */
export async function decideReset(stateKey: StateKey | undefined, out: ReplyOutput): Promise<void> {
  if (!stateKey) return
  chatSessions.delete(stateKey)
  await out.reply(plainReply('🔄 AI 대화 세션이 초기화되었습니다.'))
}

/**
 * AI fallback 경로 — 앞 핸들러(소비 입력 등)가 넘긴 텍스트.
 * 명령 모양 판정은 어댑터가 넘긴다(텔레그램 = `/` 시작 · Discord = 접두 `!` 는 PR-3).
 */
export function aiFallbackRoute(text: string, isCommand: boolean): 'trade' | 'question' | 'none' {
  if (isCommand) return 'none'
  if (text.trim().length < MIN_AI_TEXT_LENGTH) return 'none'
  // 거래 키워드 → AI 거래 파싱 (질문 키워드보다 먼저)
  if (isTradeMessage(text)) return 'trade'
  // 질문형 키워드 → AI 질문
  if (isAiQuestion(text)) return 'question'
  return 'none'
}

// ============================================================
// 등록 — 텔레그램 어댑터
// ============================================================

export function registerAiCommands(bot: Bot): void {
  bot.command('ai', async (ctx) => {
    await decideAiCommand(ctx.match?.toString(), telegramStateKeyOf(ctx), telegramOutput(ctx))
  })

  // AI 세션 초기화
  bot.command('reset', async (ctx) => {
    await decideReset(telegramStateKeyOf(ctx), telegramOutput(ctx))
  })

  // aitrade: 콜백 처리
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery?.data
    if (data?.startsWith('aitrade:')) {
      try {
        await decideAiTradeButton(data, telegramButtonPress(ctx), telegramButtonOutput(ctx))
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
    // 텔레그램 명령 = 슬래시 시작
    const route = aiFallbackRoute(text, text.startsWith('/'))

    if (route === 'trade') {
      decideTradeParse(text, telegramRequester(ctx), telegramOutput(ctx))
      return
    }

    if (route === 'question') {
      decideAiQuestion(text, telegramStateKeyOf(ctx), telegramOutput(ctx))
      return
    }
  })
}
