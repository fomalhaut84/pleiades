/**
 * pleiades M-6a-2 (pleiades#143) — 라우트별 Discord 전환 회귀 테스트.
 * env 미설정 = 텔레그램(구 동작) · NOTIFY_<ROUTE>_CHANNEL=discord = 웹훅 · 키보드/PDF 목록은 항상 텔레그램.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot } from 'grammy'
import {
  BOT_PROCESS_WITHOUT_TELEGRAM,
  discordBotConfig,
  interactiveRecipientCount,
  notifierForChat,
  htmlContent,
  interactiveNotifierFor,
  notifierFor,
  recipients,
  Route,
  fileRecipientCount,
  sendFileIfDiscord,
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
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:x') // 009 D-1: 토큰이 없으면 텔레그램 수신자 0 — 아래 블록
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '11,22')
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_IDS', '99')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', WEBHOOK_FIN)
    vi.stubEnv('DISCORD_WEBHOOK_ADMIN', WEBHOOK_ADMIN)
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', '')
    vi.stubEnv('NOTIFY_ADMIN_CHANNEL', '')
    vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', '')
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

  // 회귀: #143 사전 리뷰 info — 형식이 틀린 웹훅은 쓰지 않는다(토큰 담긴 URL 이 lastError 로 새지 않게)
  it('웹훅 형식이 틀리면 수신자 0 — 따옴표·다른 호스트', async () => {
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
    for (const bad of [`"${WEBHOOK_FIN}"`, 'https://evil.example/api/webhooks/1/t', 'discord.com/api/webhooks/1/t']) {
      vi.stubEnv('DISCORD_WEBHOOK_FINANCE', bad)
      expect(recipients.targetCount(Route.ALLOWED)).toBe(0)
    }
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', 'https://discord.com/api/v10/webhooks/1/tok?thread_id=2')
    expect(recipients.targetCount(Route.ALLOWED)).toBe(1)
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

  // M-6b-4 (#155) — 키보드 메시지 Discord 전환
  it('NOTIFY_INTERACTIVE_CHANNEL=discord — fin 봇으로 #finance · 버튼 변환 · 텔레그램 호출 없음', async () => {
    vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', 'discord')
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    const kb = {
      inline_keyboard: [[
        { text: '✅ 확정', callback_data: 'vest:confirm:r1' },
        { text: '✖️ 취소', callback_data: 'vest:cancel:r1' },
      ]],
    }
    const r = await interactiveNotifierFor(bot).notify(Route.ALLOWED, htmlContent('<b>rsu</b>', kb))
    expect(r).toMatchObject({ sent: 1, total: 1, first: { target: 'finance', ref: 'd1' } })
    expect(sendMessage).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    expect(url).toBe('https://discord.com/api/v10/channels/123456789012345678/messages')
    expect(init.headers.authorization).toBe('Bot fake-token')
    const body = JSON.parse(init.body) as { content: string; components: Array<{ components: Array<{ custom_id: string }> }> }
    expect(body.content).toBe('**rsu**')
    expect(body.components[0].components.map((b) => b.custom_id)).toEqual(['vest:confirm:r1', 'vest:cancel:r1'])
  })

  it('Discord 스위치를 켜도 봇 설정이 없으면 수신자 0 — 텔레그램으로 우회하지 않는다', async () => {
    vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', 'discord')
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', 'not-an-id')
    const kb = { inline_keyboard: [[{ text: 'ok', callback_data: 'c' }]] }
    const r = await interactiveNotifierFor(bot).notify(Route.ALLOWED, htmlContent('rsu', kb))
    expect(r).toMatchObject({ sent: 0, total: 0 })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('discordBotConfig — 허용 사용자는 숫자 ID 만 · ready 는 토큰 + 채널 ID 형식', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', ' t ')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '111111, abc ,222222,')
    expect(discordBotConfig()).toEqual({
      token: 't',
      channelId: '123456789012345678',
      allowedUserIds: ['111111', '222222'],
      ready: true,
    })
  })

  // M-6b-1 (#147) — 분기 PDF 첨부
  describe('sendFileIfDiscord', () => {
    const pdf = { name: 'q.pdf', data: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }

    it("ALLOWED 가 텔레그램이면 'not-discord' — 호출부가 sendDocument", async () => {
      await expect(sendFileIfDiscord('ALLOWED', pdf, 'c')).resolves.toBe('not-discord')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("Discord 면 #finance 웹훅에 multipart 로 'sent'", async () => {
      vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
      await expect(sendFileIfDiscord('ALLOWED', pdf, '📊 리포트')).resolves.toBe('sent')
      expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK_FIN}?wait=true`)
      const form = fetchMock.mock.calls[0][1].body as unknown as FormData
      expect((form.get('files[0]') as File).name).toBe('q.pdf')
    })

    // 회귀: PR #148 Codex P2 — 생성 전 수신자 확인은 채널 선택 기준(텔레그램 OR 아님)
    it('fileRecipientCount — Discord 선택이면 웹훅 유무 · 아니면 텔레그램 수', () => {
      expect(fileRecipientCount('ALLOWED')).toBe(2)
      vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
      expect(fileRecipientCount('ALLOWED')).toBe(1)
      vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
      expect(fileRecipientCount('ALLOWED')).toBe(0) // 텔레그램 chat 이 남아 있어도 0
    })

    it("Discord 인데 웹훅이 비면 'no-webhook' — 텔레그램으로 우회하지 않는다", async () => {
      vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
      vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
      await expect(sendFileIfDiscord('ALLOWED', pdf, 'c')).resolves.toBe('no-webhook')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

// pleiades 009 D-1 (pleiades#349) — 텔레그램 토큰이 없으면 텔레그램 수신자 0 — 실행 판정(recipients · telegramRecipients ·
// fileRecipientCount · interactiveRecipientCount)과 전송이 같은 출처(TELEGRAM_TARGETS)를 본다 · Discord 라우트는 그대로.
describe('fin notifier — 텔레그램 토큰 없음 (009 D-1)', () => {
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'd1' }),
    text: async () => '',
  }))

  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '11,22')
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_IDS', '99')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', WEBHOOK_FIN)
    vi.stubEnv('DISCORD_WEBHOOK_ADMIN', WEBHOOK_ADMIN)
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', '')
    vi.stubEnv('NOTIFY_ADMIN_CHANNEL', '')
    vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('chat ID 가 있어도 텔레그램 수신자 0 — 판정 함수 전부', () => {
    expect(recipients.targetCount(Route.ALLOWED)).toBe(0)
    expect(recipients.targetCount(Route.ADMIN)).toBe(0)
    expect(telegramRecipients(Route.ALLOWED)).toEqual([])
    expect(fileRecipientCount(Route.ALLOWED)).toBe(0)
    expect(interactiveRecipientCount()).toBe(0)
  })

  it('텔레그램 라우트 전송은 throw 없이 0 · /브리핑(notifierForChat)도 0', async () => {
    expect(await notifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(Route.ALLOWED, htmlContent('x'))).toMatchObject({ total: 0 })
    expect(await interactiveNotifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(Route.ALLOWED, htmlContent('x'))).toMatchObject({ total: 0 })
    expect(await notifierForChat(BOT_PROCESS_WITHOUT_TELEGRAM, 11).notify(Route.ALLOWED, htmlContent('x'))).toMatchObject({ total: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 회귀: PR-3 사전 리뷰 info 1 — 토큰은 있는데 텔레그램 없는 핸들(401 중지 알림)로 텔레그램 라우트에 보내면 transport 를 만들려다 던졌다
  it('토큰이 있어도 텔레그램 없는 핸들이면 텔레그램 라우트 수신자 0 — 던지지 않는다', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:x')
    expect(await notifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(Route.ADMIN, htmlContent('x'))).toMatchObject({ total: 0 })
    expect(await interactiveNotifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(Route.ALLOWED, htmlContent('x'))).toMatchObject({ total: 0 })
    expect(recipients.targetCount(Route.ADMIN)).toBe(1) // 실행 판정은 토큰 기준 그대로(봇 프로세스는 api 있는 핸들로 보낸다)
  })

  it('Discord 라우트는 토큰 없이도 보낸다 — ADMIN 포함', async () => {
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
    vi.stubEnv('NOTIFY_ADMIN_CHANNEL', 'discord')
    expect(await notifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(Route.ALLOWED, htmlContent('x'))).toMatchObject({ sent: 1 })
    expect(await notifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(Route.ADMIN, htmlContent('x'))).toMatchObject({ sent: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
