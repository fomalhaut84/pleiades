/**
 * pleiades 009 D-3 PR-1a (pleiades#382) — 텔레그램 핸들러 특성 테스트용 가짜 grammY Bot · Context.
 *
 * 판단 분리 전후로 **grammY 호출열**(이름 · 인자 · 순서)이 같아야 한다(설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 B · T).
 * 그래서 가짜 ctx 는 응답 메서드 호출을 한 줄(`calls`)에 순서대로 적는다. InlineKeyboard 는 `inline_keyboard` 로 비교한다
 * (toEqual 은 클래스 타입을 보지 않는다).
 */

import { vi } from 'vitest'
import type { Bot } from 'grammy'

type Handler = (ctx: unknown, next: () => Promise<void>) => Promise<void>

/** register* 가 등록한 핸들러를 잡는다 — 등록 순서·필터도 남긴다. */
export function captureBot(register: (bot: Bot) => void) {
  const hears: { re: RegExp; handler: Handler }[] = []
  const on: { filter: string; handler: Handler }[] = []
  const bot = {
    hears: (re: RegExp, handler: Handler) => hears.push({ re, handler }),
    on: (filter: string, handler: Handler) => on.push({ filter, handler }),
  } as unknown as Bot
  register(bot)
  return { hears, on }
}

export type Call = [string, ...unknown[]]

let nextMessageId = 1000

export interface FakeCtxOptions {
  text?: string
  data?: string
  /** 생략하면 7 · undefined 를 명시하면 `from` 없음 */
  fromId?: number | undefined
  chatId?: number
  /** 콜백이 가리키는 메시지 id — null 이면 `callbackQuery.message` 없음 */
  messageId?: number | null
}

/** 텔레그램 ctx 흉내. reply 는 새 message_id 를 돌려주고(pending 키가 이 값을 쓴다) `sentIds` 에 순서대로 남긴다. */
export function fakeCtx(opts: FakeCtxOptions = {}) {
  const chatId = opts.chatId ?? 100
  const calls: Call[] = []
  const sentIds: number[] = []
  const fromId = 'fromId' in opts ? opts.fromId : 7
  const record = (name: string) =>
    vi.fn(async (...args: unknown[]) => {
      calls.push([name, ...args])
      return true
    })
  const ctx = {
    message: opts.text !== undefined ? { text: opts.text } : undefined,
    from: fromId === undefined ? undefined : { id: fromId },
    chat: { id: chatId },
    callbackQuery:
      opts.data !== undefined
        ? {
            data: opts.data,
            message: opts.messageId === null ? undefined : { chat: { id: chatId }, message_id: opts.messageId ?? 1 },
          }
        : undefined,
    reply: vi.fn(async (...args: unknown[]) => {
      calls.push(['reply', ...args])
      const id = nextMessageId++
      sentIds.push(id)
      return { chat: { id: chatId }, message_id: id }
    }),
    // typing 은 타이머로 끼어들므로 calls 줄 밖에 따로 센다(9-1 리뷰 info 1)
    replyWithChatAction: vi.fn<(action: string) => Promise<boolean>>(async () => true),
    answerCallbackQuery: record('answerCallbackQuery'),
    editMessageReplyMarkup: record('editMessageReplyMarkup'),
    editMessageText: record('editMessageText'),
  }
  return { ctx, calls, sentIds }
}

/** 키보드 행 — [라벨, callback data] 쌍. */
export function rowsOf(markup: unknown): [string, string][][] {
  const kb = (markup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard
  return kb.map((row) => row.map((b) => [b.text, b.callback_data] as [string, string]))
}

/** calls 줄의 n 번째 reply 가 단 키보드의 callback data 들. */
export function replyButtons(calls: Call[], n = 0): string[] {
  const replies = calls.filter((c) => c[0] === 'reply')
  const opts = replies[n]?.[2] as { reply_markup?: unknown } | undefined
  return opts?.reply_markup ? rowsOf(opts.reply_markup).flat().map(([, d]) => d) : []
}

/** fire-and-forget 작업을 끝까지 흘린다. */
export async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r))
}
