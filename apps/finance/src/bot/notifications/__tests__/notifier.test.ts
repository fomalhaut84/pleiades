/**
 * pleiades M-6a-2 (pleiades#143) — 라우트별 Discord 전환 회귀 테스트.
 * env 미설정 = 텔레그램(구 동작) · NOTIFY_<ROUTE>_CHANNEL=discord = 웹훅 · 키보드/PDF 목록은 항상 텔레그램.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot } from 'grammy'
import {
  htmlContent,
  interactiveNotifierFor,
  notifierFor,
  recipients,
  Route,
  telegramRecipients,
} from '../notifier'

const WEBHOOK_FIN = 'https://discord.com/api/webhooks/1/fin-token'
const WEBHOOK_ADMIN = 'https://discord.com/api/webhooks/2/admin-token'

describe('fin notifier — 라우트별 채널', () => {
  const sendMessage = vi.fn(async () => ({ message_id: 7 }))
  const bot = { api: { sendMessage } } as unknown as Bot
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'd1' }),
    text: async () => '',
  }))

  beforeEach(() => {
    sendMessage.mockClear()
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '11,22')
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_IDS', '99')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', WEBHOOK_FIN)
    vi.stubEnv('DISCORD_WEBHOOK_ADMIN', WEBHOOK_ADMIN)
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', '')
    vi.stubEnv('NOTIFY_ADMIN_CHANNEL', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('env 미설정 — 지금처럼 텔레그램 · Discord 호출 없음', async () => {
    const r = await notifierFor(bot).notify(Route.ALLOWED, htmlContent('<b>x</b>'))
    expect(r).toMatchObject({ sent: 2, total: 2 })
    expect(sendMessage.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['11', '22'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('NOTIFY_ALLOWED_CHANNEL=discord — #finance 웹훅 1곳 · md 변환 · ADMIN 은 그대로 텔레그램', async () => {
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'Discord ')
    const r = await notifierFor(bot).notify(Route.ALLOWED, htmlContent('<b>x</b>'))
    expect(r).toMatchObject({ sent: 1, total: 1, first: { target: 'finance', ref: 'd1' } })
    expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK_FIN}?wait=true`)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toBe('**x**')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(recipients.targetCount(Route.ALLOWED)).toBe(1)

    await notifierFor(bot).notify(Route.ADMIN, htmlContent('a'))
    expect(sendMessage).toHaveBeenCalledWith('99', 'a', { parse_mode: 'HTML' })
  })

  it('NOTIFY_ADMIN_CHANNEL=discord — 관리자 알림은 #admin', async () => {
    vi.stubEnv('NOTIFY_ADMIN_CHANNEL', 'discord')
    await notifierFor(bot).notify(Route.ADMIN, htmlContent('a'))
    expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK_ADMIN}?wait=true`)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('Discord 를 골랐는데 웹훅이 비면 수신자 0 — 가드가 건너뛴다', async () => {
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
    expect(recipients.targetCount(Route.ALLOWED)).toBe(0)
    const r = await notifierFor(bot).notify(Route.ALLOWED, htmlContent('x'))
    expect(r.total).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('키보드 메시지(interactiveNotifierFor)와 PDF 목록은 Discord 선택과 무관하게 텔레그램', async () => {
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
    const kb = { inline_keyboard: [[{ text: 'ok', callback_data: 'c' }]] }
    const r = await interactiveNotifierFor(bot).notify(Route.ALLOWED, htmlContent('rsu', kb))
    expect(r).toMatchObject({ sent: 2, total: 2 })
    expect(sendMessage).toHaveBeenCalledWith('11', 'rsu', { parse_mode: 'HTML', reply_markup: kb })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(telegramRecipients(Route.ALLOWED)).toEqual(['11', '22'])
  })
})
