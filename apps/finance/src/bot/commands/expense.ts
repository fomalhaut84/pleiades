import { Bot, Context, InlineKeyboard } from 'grammy'
import { prisma } from '@/lib/prisma'
import { parseExpenseInput, isParseError } from '@/lib/expense-parser'
import { matchCategory, getAllCategories, type MatchedCategory } from '@/lib/category-matcher'
import { formatKRWFull } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'
import { isTradeMessage } from '../utils/trade-trigger'

interface PendingTransaction {
  requestedByUserId: number
  description: string
  amount: number
  type: 'expense' | 'income'
  categoryId: string
  categoryName: string
  expiresAt: number
}

// messageKey → 대기 중인 거래 정보
const pendingTransactions = new Map<string, PendingTransaction>()

// 5분 후 자동 만료
const PENDING_TTL_MS = 5 * 60 * 1000

function cleanExpired(): void {
  const now = Date.now()
  pendingTransactions.forEach((pending, key) => {
    if (pending.expiresAt < now) {
      pendingTransactions.delete(key)
    }
  })
}

/**
 * 카테고리 선택 InlineKeyboard 생성.
 * 2열 그리드로 표시.
 */
function buildCategoryKeyboard(
  categories: MatchedCategory[],
  txId: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard()

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    const label = cat.icon ? `${cat.icon} ${cat.name}` : cat.name
    keyboard.text(label, `tx:cat:${txId}:${cat.id}`)
    // 2열 그리드
    if (i % 2 === 1) keyboard.row()
  }
  // 홀수개면 마지막 행 닫기
  if (categories.length % 2 === 1) keyboard.row()

  keyboard.text('❌ 취소', `tx:cancel:${txId}`)

  return keyboard
}

/**
 * 자연어 소비/수입 입력 처리.
 * 기존 커맨드(주가, 환율, 매수, 매도, 현황, 계좌)에 매칭되지 않는 텍스트를 처리.
 */
async function handleExpenseInput(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''

  const result = parseExpenseInput(text)
  if (isParseError(result)) {
    await ctx.reply(`⚠️ ${result.error}`)
    return
  }

  const { description, amount, type } = result
  const typeLabel = type === 'expense' ? '소비' : '수입'

  // 카테고리 매칭
  const matched = await matchCategory(description, type)

  const txId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  if (matched.length === 1) {
    // 단일 매칭 → 확인 키보드
    const cat = matched[0]
    const catLabel = cat.icon ? `${cat.icon} ${cat.name}` : cat.name

    cleanExpired()
    const pending: PendingTransaction = {
      requestedByUserId: ctx.from?.id ?? 0,
      description,
      amount,
      type,
      categoryId: cat.id,
      categoryName: cat.name,
      expiresAt: Date.now() + PENDING_TTL_MS,
    }

    const keyboard = new InlineKeyboard()
      .text('✅ 확인', `tx:confirm:${txId}`)
      .text('🔄 카테고리 변경', `tx:change:${txId}`)
      .row()
      .text('❌ 취소', `tx:cancel:${txId}`)

    const sent = await ctx.reply(
      `📝 ${typeLabel} 기록\n\n` +
        `내용: ${description}\n` +
        `금액: ${formatKRWFull(amount)}\n` +
        `카테고리: ${catLabel}\n\n` +
        `기록하시겠습니까?`,
      { reply_markup: keyboard }
    )

    const key = `${sent.chat.id}:${sent.message_id}:${txId}`
    pendingTransactions.set(key, pending)
    return
  }

  // 다중 매칭 또는 미매칭 → 카테고리 선택
  const categories = matched.length > 1 ? matched : await getAllCategories(type)

  if (categories.length === 0) {
    await ctx.reply(`⚠️ ${typeLabel} 카테고리가 없습니다. 웹에서 카테고리를 추가해주세요.`)
    return
  }

  cleanExpired()
  // categoryId는 아직 미확정 — 선택 후 설정
  const basePending = {
    requestedByUserId: ctx.from?.id ?? 0,
    description,
    amount,
    type,
    categoryId: '',
    categoryName: '',
    expiresAt: Date.now() + PENDING_TTL_MS,
  }

  const prompt =
    matched.length > 1
      ? `여러 카테고리가 매칭됩니다. 선택해주세요:`
      : `카테고리를 선택해주세요:`

  const keyboard = buildCategoryKeyboard(categories, txId)
  const sent = await ctx.reply(
    `📝 ${typeLabel} 기록\n\n` +
      `내용: ${description}\n` +
      `금액: ${formatKRWFull(amount)}\n\n` +
      prompt,
    { reply_markup: keyboard }
  )

  const key = `${sent.chat.id}:${sent.message_id}:${txId}`
  pendingTransactions.set(key, basePending)
}

/**
 * InlineKeyboard 콜백 처리.
 * tx:confirm:{txId} — 확인
 * tx:cancel:{txId} — 취소
 * tx:cat:{txId}:{categoryId} — 카테고리 선택
 * tx:change:{txId} — 카테고리 변경
 */
async function handleExpenseCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('tx:')) return

  const parts = data.split(':')
  const action = parts[1]
  const txId = parts[2]
  const message = ctx.callbackQuery?.message
  if (!message || !txId) {
    await ctx.answerCallbackQuery({ text: '⚠️ 메시지를 찾을 수 없습니다.' })
    return
  }

  const key = `${message.chat.id}:${message.message_id}:${txId}`

  const pending = pendingTransactions.get(key)
  if (!pending) {
    await ctx.answerCallbackQuery({ text: '⚠️ 만료된 요청입니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    return
  }

  // 요청자 검증 (모든 액션 공통)
  if (ctx.from?.id !== pending.requestedByUserId) {
    await ctx.answerCallbackQuery({ text: '⚠️ 본인만 확인/취소할 수 있습니다.' })
    return
  }

  if (pending.expiresAt < Date.now()) {
    pendingTransactions.delete(key)
    await ctx.answerCallbackQuery({ text: '⚠️ 요청이 만료되었습니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    return
  }

  if (action === 'cancel') {
    pendingTransactions.delete(key)
    await ctx.answerCallbackQuery({ text: '취소되었습니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    await ctx.editMessageText('❌ 기록이 취소되었습니다.')
    return
  }

  if (action === 'cat') {
    // 카테고리 선택 — 중복 클릭 방지를 위해 먼저 Map에서 제거
    pendingTransactions.delete(key)

    const categoryId = parts[3]
    if (!categoryId) {
      await ctx.answerCallbackQuery({ text: '⚠️ 카테고리 정보가 없습니다.' })
      return
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, icon: true },
    })

    if (!category) {
      await ctx.answerCallbackQuery({ text: '⚠️ 카테고리를 찾을 수 없습니다.' })
      return
    }

    await createTransaction(ctx, { ...pending, categoryId: category.id, categoryName: category.name })
    return
  }

  if (action === 'change') {
    // 카테고리 변경 → 전체 카테고리 목록 표시
    const categories = await getAllCategories(pending.type)
    if (categories.length === 0) {
      await ctx.answerCallbackQuery({ text: '⚠️ 카테고리가 없습니다.' })
      return
    }

    const typeLabel = pending.type === 'expense' ? '소비' : '수입'
    const keyboard = buildCategoryKeyboard(categories, txId)
    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      `📝 ${typeLabel} 기록\n\n` +
        `내용: ${pending.description}\n` +
        `금액: ${formatKRWFull(pending.amount)}\n\n` +
        `카테고리를 선택해주세요:`,
      { reply_markup: keyboard }
    )
    return
  }

  if (action === 'confirm') {
    if (!pending.categoryId) {
      await ctx.answerCallbackQuery({ text: '⚠️ 카테고리가 선택되지 않았습니다.' })
      return
    }

    pendingTransactions.delete(key)
    await createTransaction(ctx, pending)
    return
  }
}

async function createTransaction(
  ctx: Context,
  pending: PendingTransaction
): Promise<void> {
  const typeLabel = pending.type === 'expense' ? '소비' : '수입'

  try {
    const category = await prisma.category.findUnique({
      where: { id: pending.categoryId },
      select: { icon: true, name: true },
    })

    await prisma.transaction.create({
      data: {
        amount: pending.amount,
        description: pending.description,
        categoryId: pending.categoryId,
        userId: String(pending.requestedByUserId),
        transactedAt: new Date(),
      },
    })

    const catLabel = category?.icon
      ? `${category.icon} ${category.name}`
      : pending.categoryName

    await ctx.answerCallbackQuery({ text: '기록 완료!' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    await ctx.editMessageText(
      `✅ ${typeLabel} 기록 완료\n\n` +
        `내용: ${pending.description}\n` +
        `금액: ${formatKRWFull(pending.amount)}\n` +
        `카테고리: ${catLabel}`
    )
  } catch (error) {
    console.error('[bot] 거래 기록 실패:', error)
    await ctx.answerCallbackQuery({ text: '⚠️ 기록에 실패했습니다.' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    await ctx.editMessageText(`⚠️ ${typeLabel} 기록에 실패했습니다. 잠시 후 다시 시도해주세요.`)
  }
}

export function registerExpenseCommands(bot: Bot): void {
  // "수입 ..." 명시적 prefix (인자 필수 — "수입" 단독은 budget 핸들러가 처리)
  bot.hears(/^수입\s+.+$/, async (ctx) => {
    try {
      await handleExpenseInput(ctx)
    } catch (error) {
      console.error('[bot] 수입 입력 실패:', error)
      await ctx.reply('⚠️ 수입 기록에 실패했습니다.')
    }
  })

  // InlineKeyboard 콜백 (tx: prefix)
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery?.data
    if (data?.startsWith('tx:')) {
      try {
        await handleExpenseCallback(ctx)
      } catch (error) {
        console.error('[bot] 콜백 처리 실패:', error)
        await ctx.answerCallbackQuery({ text: '⚠️ 처리 중 오류가 발생했습니다.' })
      }
    } else {
      await next()
    }
  })
}

/**
 * 다른 커맨드에 매칭되지 않은 텍스트를 자연어 소비 입력으로 처리.
 * 반드시 다른 모든 hears 핸들러 이후에 등록해야 한다.
 */
export function registerExpenseFallback(bot: Bot): void {
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text
    // 슬래시 커맨드는 무시 → 다음 핸들러로
    if (text.startsWith('/')) return next()
    // 기존 커맨드 패턴은 무시 (이미 다른 핸들러에서 처리됨)
    // 커맨드 단어 뒤에 공백 또는 문자열 끝이어야 매칭 (예: "매수수수료"는 통과)
    // "수입 ..."은 expense 핸들러가 처리, "소비"/"수입" 단독은 budget 핸들러가 처리
    if (/^(현황|계좌|주가|환율|매수|매도|수입|예산설정)(\s|$)/i.test(text)) return next()
    if (/^(소비|예산)\s*$/i.test(text)) return next()

    // 숫자 미포함 → 다음 핸들러(AI fallback)로 전달
    if (!/\d/.test(text)) return next()

    // 숫자 포함이지만 질문형 키워드가 있으면 AI fallback으로 전달
    // (예: "테슬라 2026 전망 알려줘")
    if (isAiQuestion(text)) return next()

    // 숫자 포함이지만 거래 키워드가 있으면 AI 거래 파싱으로 전달
    // (예: "소담 TIGER S&P500 10주 24900원에 샀어")
    if (isTradeMessage(text)) return next()

    try {
      await handleExpenseInput(ctx)
    } catch (error) {
      console.error('[bot] 소비 입력 실패:', error)
      await ctx.reply('⚠️ 소비 기록에 실패했습니다.')
    }
  })
}
