// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2): 중립 응답 모델(`../core/reply`) → grammY 호출.
// 리팩터 전 핸들러가 내던 `ctx.reply` 인자열을 그대로 만든다(특성 테스트 `__tests__/telegram-handlers.test.ts`):
//   html → { parse_mode: "HTML" } · 버튼 → { reply_markup: InlineKeyboard } · clearKeyboard → { reply_markup: { remove_keyboard: true } }
//   옵션이 없으면 인자 1개 · long → replyLong(4096 분할 · HTML 실패 시 plain 재전송).

import { InlineKeyboard } from "grammy";
import type { BotReply, ButtonOutput, ReplyButton, ReplyOutput } from "../core/reply";
import { replyLong } from "./telegram";

type ReplyFn = (text: string, options?: Record<string, unknown>) => Promise<unknown>;

/** 메시지 응답에 필요한 grammY ctx 부분. */
export interface TelegramReplyCtx {
  reply: ReplyFn;
  replyWithChatAction?: (action: "typing") => Promise<unknown>;
}

/** 버튼(callback query) 응답에 필요한 grammY ctx 부분. */
export interface TelegramButtonCtx extends TelegramReplyCtx {
  answerCallbackQuery: (other?: { text?: string }) => Promise<unknown>;
  editMessageReplyMarkup: (other: { reply_markup: undefined }) => Promise<unknown>;
}

export function toInlineKeyboard(rows: readonly (readonly ReplyButton[])[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  rows.forEach((row, i) => {
    if (i > 0) keyboard.row();
    for (const b of row) keyboard.text(b.label, b.action);
  });
  return keyboard;
}

/** `ctx.reply` 인자열 — 옵션이 없으면 본문 하나만. */
export function telegramReplyArgs(message: BotReply): [string] | [string, Record<string, unknown>] {
  const options: Record<string, unknown> = {};
  if (message.format === "html") options.parse_mode = "HTML";
  if (message.buttons && message.buttons.length > 0) {
    options.reply_markup = toInlineKeyboard(message.buttons);
  } else if (message.clearKeyboard) {
    options.reply_markup = { remove_keyboard: true };
  }
  return Object.keys(options).length === 0 ? [message.text] : [message.text, options];
}

/** 한 메시지 전송 — long 이면 replyLong(텔레그램 4096 분할). */
export async function sendTelegramReply(ctx: TelegramReplyCtx, message: BotReply): Promise<void> {
  if (message.long) {
    await replyLong(ctx, message.text, message.format === "html");
    return;
  }
  const [text, options] = telegramReplyArgs(message);
  if (options === undefined) await ctx.reply(text);
  else await ctx.reply(text, options);
}

export function telegramOutput(ctx: TelegramReplyCtx): ReplyOutput {
  return {
    reply: (message) => sendTelegramReply(ctx, message),
    typing: async () => {
      await ctx.replyWithChatAction?.("typing");
    },
  };
}

export function telegramButtonOutput(ctx: TelegramButtonCtx): ButtonOutput {
  return {
    ...telegramOutput(ctx),
    notice: async (text) => {
      if (text === undefined) await ctx.answerCallbackQuery();
      else await ctx.answerCallbackQuery({ text });
    },
    removeButtons: async () => {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    },
  };
}
