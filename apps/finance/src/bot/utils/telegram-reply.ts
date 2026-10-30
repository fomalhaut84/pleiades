/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 B · H2): 중립 응답 모델(`../core/reply`) → grammY 호출.
 *
 * 단계 하나 = 판단 분리 전 핸들러가 내던 grammY 호출 하나(특성 테스트 `commands/__tests__/*-telegram.test.ts` 가 호출열을 고정):
 *   reply   → `ctx.reply(text[, { parse_mode: 'HTML', reply_markup }])` — 옵션이 없으면 인자 1개
 *   toast   → `answerCallbackQuery({ text })` · 텍스트 없으면 `answerCallbackQuery()`
 *   removeButtons → `editMessageReplyMarkup({ reply_markup: undefined })`
 *   edit    → `editMessageText(text[, { parse_mode: 'HTML', reply_markup }])`
 *   typing  → `replyWithChatAction('typing')` · 주기 5 s(지금 값)
 * 본인 확인 값은 지금과 같다 — 요청자 `String(from?.id ?? 0)`(DB `Transaction.userId` 도 같은 값) · 누른 사람은 `from` 없으면 undefined(거부).
 */

import { InlineKeyboard, type Context } from 'grammy'
import type { BotReply, ButtonOutput, ButtonPress, ReplyButtonRows, ReplyOutput, Requester } from '../core/reply'
import { telegramMessageKey, telegramStateKey, type StateKey } from '../core/state-key'

const TELEGRAM_TYPING_INTERVAL_MS = 5000

/** 버튼 행 → InlineKeyboard. 빈 행도 그대로 옮긴다(`row()` 하나 — 지금 키보드 모양). */
export function toInlineKeyboard(rows: ReplyButtonRows): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  rows.forEach((row, i) => {
    if (i > 0) keyboard.row()
    for (const b of row) keyboard.text(b.label, b.action)
  })
  return keyboard
}

/** reply·editMessageText 의 옵션 — 없으면 undefined(인자 1개로 부른다). */
function telegramOptions(message: BotReply): { parse_mode?: 'HTML'; reply_markup?: InlineKeyboard } | undefined {
  const options: { parse_mode?: 'HTML'; reply_markup?: InlineKeyboard } = {}
  if (message.format === 'html') options.parse_mode = 'HTML'
  if (message.buttons) options.reply_markup = toInlineKeyboard(message.buttons)
  return Object.keys(options).length === 0 ? undefined : options
}

export function telegramOutput(ctx: Context): ReplyOutput {
  return {
    reply: async (message) => {
      const options = telegramOptions(message)
      const sent = options === undefined ? await ctx.reply(message.text) : await ctx.reply(message.text, options)
      return telegramMessageKey(sent.chat.id, sent.message_id)
    },
    typing: async () => {
      await ctx.replyWithChatAction('typing')
    },
    typingIntervalMs: TELEGRAM_TYPING_INTERVAL_MS,
  }
}

export function telegramButtonOutput(ctx: Context): ButtonOutput {
  return {
    toast: async (text) => {
      if (text === undefined) await ctx.answerCallbackQuery()
      else await ctx.answerCallbackQuery({ text })
    },
    removeButtons: async () => {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
    },
    edit: async (message) => {
      const options = telegramOptions(message)
      if (options === undefined) await ctx.editMessageText(message.text)
      else await ctx.editMessageText(message.text, options)
    },
  }
}

/** 요청자 — 지금과 같은 `String(from?.id ?? 0)`. */
export function telegramRequester(ctx: Context): Requester {
  const id = String(ctx.from?.id ?? 0)
  return { userId: id, dbUserId: id }
}

/** 눌린 버튼 — 메시지 키 · 누른 사람(`from` 없으면 undefined). */
export function telegramButtonPress(ctx: Context): ButtonPress {
  const message = ctx.callbackQuery?.message
  const fromId = ctx.from?.id
  return {
    messageKey: message ? telegramMessageKey(message.chat.id, message.message_id) : undefined,
    clickerId: fromId === undefined ? undefined : String(fromId),
  }
}

/** 대화 상태 키(AI 세션 · 동시 1건) — chat 이 없으면 undefined(그때 AI 대화·`/reset` 은 무응답 · 지금과 같다). */
export function telegramStateKeyOf(ctx: Context): StateKey | undefined {
  const chatId = ctx.chat?.id
  return chatId ? telegramStateKey(chatId) : undefined
}
