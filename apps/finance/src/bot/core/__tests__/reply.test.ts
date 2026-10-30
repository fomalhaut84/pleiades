/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 S · B): 상태 키 형식 · 본인 확인 경계 · 텔레그램 키보드 변환.
 */

import { describe, expect, it, vi } from 'vitest'
import { htmlReply, isSameRequester, plainReply } from '../reply'
import { discordMessageKey, discordStateKey, pendingKey, telegramMessageKey, telegramStateKey } from '../state-key'
import { telegramButtonOutput, telegramButtonPress, telegramRequester, toInlineKeyboard } from '../../utils/telegram-reply'
import type { Context } from 'grammy'

describe('상태 키 · 메시지 키', () => {
  it('형식 — 플랫폼 접두', () => {
    expect(telegramStateKey(-100123)).toBe('telegram:-100123')
    expect(discordStateKey('2002', '9')).toBe('discord:2002:9')
    expect(telegramMessageKey(100, 5)).toBe('telegram:100:5')
    expect(discordMessageKey('100', '5')).toBe('discord:100:5')
    expect(pendingKey(telegramMessageKey(100, 5), 'tx1')).toBe('telegram:100:5:tx1')
  })

  it('같은 숫자의 텔레그램·Discord 키는 다르다(구조상 충돌 0)', () => {
    expect(pendingKey(telegramMessageKey(100, 5), 'a')).not.toBe(pendingKey(discordMessageKey('100', '5'), 'a'))
    expect(telegramStateKey(7)).not.toBe(discordStateKey('7', '7'))
  })
})

describe('본인 확인 — 누른 사람 ID 가 없으면 거부(T17)', () => {
  it.each([
    [undefined, '0', false],
    [undefined, '7', false],
    ['7', '7', true],
    ['8', '7', false],
    ['0', '0', true],
  ] as const)('clicker %s · requester %s → %s', (clicker, requester, ok) => {
    expect(isSameRequester(clicker, requester)).toBe(ok)
  })
})

describe('응답 생성기', () => {
  it('버튼 없으면 buttons 키가 없다', () => {
    expect(plainReply('a')).toEqual({ text: 'a', format: 'plain' })
    expect('buttons' in plainReply('a')).toBe(false)
    expect(htmlReply('b', [[{ label: 'x', action: 'y' }]])).toEqual({
      text: 'b',
      format: 'html',
      buttons: [[{ label: 'x', action: 'y' }]],
    })
  })
})

describe('텔레그램 어댑터', () => {
  it('toInlineKeyboard — 행 그대로 · 빈 행도 옮긴다', () => {
    const kb = toInlineKeyboard([
      [{ label: 'a', action: '1' }, { label: 'b', action: '2' }],
      [{ label: 'c', action: '3' }],
      [],
    ])
    expect(kb.inline_keyboard).toEqual([
      [{ text: 'a', callback_data: '1' }, { text: 'b', callback_data: '2' }],
      [{ text: 'c', callback_data: '3' }],
      [],
    ])
  })

  it('버튼 단계의 인자 모양을 엄격히 — toast() 인자 0 · removeButtons 는 reply_markup 키를 가진 객체(9-1 리뷰 info 3)', async () => {
    const ctx = {
      answerCallbackQuery: vi.fn(async () => true),
      editMessageReplyMarkup: vi.fn(async () => true),
      editMessageText: vi.fn(async () => true),
    }
    const out = telegramButtonOutput(ctx as unknown as Context)
    await out.toast()
    await out.toast('t')
    await out.removeButtons()
    await out.edit(plainReply('p'))
    await out.edit(htmlReply('h'))
    expect(ctx.answerCallbackQuery.mock.calls).toStrictEqual([[], [{ text: 't' }]])
    expect(ctx.editMessageReplyMarkup.mock.calls).toStrictEqual([[{ reply_markup: undefined }]])
    expect(Object.keys((ctx.editMessageReplyMarkup.mock.calls[0] as unknown[])[0] as object)).toEqual(['reply_markup'])
    expect(ctx.editMessageText.mock.calls).toStrictEqual([['p'], ['h', { parse_mode: 'HTML' }]])
  })

  it('요청자 — from 없으면 "0"(지금 기본값) · DB 표기도 같은 값', () => {
    expect(telegramRequester({ from: { id: 42 } } as unknown as Context)).toEqual({ userId: '42', dbUserId: '42' })
    expect(telegramRequester({ from: undefined } as unknown as Context)).toEqual({ userId: '0', dbUserId: '0' })
  })

  it('눌린 버튼 — from 없으면 clicker undefined · 메시지 없으면 키 undefined', () => {
    const ctx = (from: unknown, message: unknown) => ({ from, callbackQuery: { message } }) as unknown as Context
    expect(telegramButtonPress(ctx({ id: 7 }, { chat: { id: 100 }, message_id: 5 }))).toEqual({
      messageKey: 'telegram:100:5',
      clickerId: '7',
    })
    expect(telegramButtonPress(ctx(undefined, undefined))).toEqual({ messageKey: undefined, clickerId: undefined })
  })
})
