/**
 * fin notifier 배선 — 라우트 → Discord(M-6a-2 #143 · M-6b-1 #147 · M-6b-4 #155).
 * pleiades 009 D-5 B4 (pleiades#512): 텔레그램을 지웠다 — 라우트 스위치(`NOTIFY_*_CHANNEL`)와 텔레그램 env 를 읽지 않고 늘 Discord.
 * 재시도·분할·변환 baseline 은 packages/notify 테스트가 덮는다. 이 파일은 fin 의 배선(라우트 → 웹훅·봇 · 실행 판정)만 고정한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discordBotConfig,
  fileRecipientCount,
  htmlContent,
  interactiveNotifierFor,
  interactiveRecipientCount,
  lastErrorOf,
  notifierFor,
  recipients,
  Route,
  sendFile,
} from '../notifier'

const WEBHOOK_FIN = 'https://discord.com/api/webhooks/1/fin-token'
const WEBHOOK_ADMIN = 'https://discord.com/api/webhooks/2/admin-token'
const CHANNEL = '123456789012345678'

/** 옛 텔레그램 · 스위치 env — 남아 있어도 읽지 않는다(서버 `.env` 에 줄이 남는 경우 · 009 §5-2). */
function stubLegacyTelegramEnv(): void {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:x')
  vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '11,22')
  vi.stubEnv('TELEGRAM_ADMIN_CHAT_IDS', '99')
  vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'telegram')
  vi.stubEnv('NOTIFY_ADMIN_CHANNEL', 'telegram')
  vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', 'telegram')
}

describe('fin notifier — 늘 Discord', () => {
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'd1' }),
    text: async () => '',
  }))

  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', WEBHOOK_FIN)
    vi.stubEnv('DISCORD_WEBHOOK_ADMIN', WEBHOOK_ADMIN)
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('ALLOWED — #finance 웹훅 1곳 · md 변환', async () => {
    const r = await notifierFor().notify(Route.ALLOWED, htmlContent('<b>x</b>'))
    expect(r).toMatchObject({ sent: 1, total: 1, first: { target: 'finance', ref: 'd1' } })
    expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK_FIN}?wait=true`)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toBe('**x**')
    expect(recipients.targetCount(Route.ALLOWED)).toBe(1)
  })

  it('ADMIN — #admin 웹훅', async () => {
    await notifierFor().notify(Route.ADMIN, htmlContent('a'))
    expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK_ADMIN}?wait=true`)
    expect(recipients.targetCount(Route.ADMIN)).toBe(1)
  })

  // 회귀: 009 D-5 B3~B4 틈 — 스위치가 telegram 이고 토큰이 있으면 크론이 수신자를 세고 0 건 보냈다
  it('옛 텔레그램 env · 스위치가 남아 있어도 읽지 않는다 — 웹훅으로 보낸다', async () => {
    stubLegacyTelegramEnv()
    expect(recipients.targetCount(Route.ALLOWED)).toBe(1)
    expect(recipients.targetCount(Route.ADMIN)).toBe(1)
    expect(fileRecipientCount(Route.ALLOWED)).toBe(1)
    expect(await notifierFor().notify(Route.ALLOWED, htmlContent('x'))).toMatchObject({ sent: 1, total: 1 })
    expect(await notifierFor().notify(Route.ADMIN, htmlContent('x'))).toMatchObject({ sent: 1, total: 1 })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([`${WEBHOOK_FIN}?wait=true`, `${WEBHOOK_ADMIN}?wait=true`])
  })

  it('웹훅이 비면 수신자 0 — 가드가 건너뛴다 · 텔레그램 env 가 있어도 0', async () => {
    stubLegacyTelegramEnv()
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
    vi.stubEnv('DISCORD_WEBHOOK_ADMIN', '')
    expect(recipients.targetCount(Route.ALLOWED)).toBe(0)
    expect(recipients.targetCount(Route.ADMIN)).toBe(0)
    expect((await notifierFor().notify(Route.ALLOWED, htmlContent('x'))).total).toBe(0)
    expect((await notifierFor().notify(Route.ADMIN, htmlContent('x'))).total).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 회귀: #143 사전 리뷰 info — 형식이 틀린 웹훅은 쓰지 않는다(토큰 담긴 URL 이 lastError 로 새지 않게)
  it('웹훅 형식이 틀리면 수신자 0 — 따옴표·다른 호스트', async () => {
    for (const bad of [`"${WEBHOOK_FIN}"`, 'https://evil.example/api/webhooks/1/t', 'discord.com/api/webhooks/1/t']) {
      vi.stubEnv('DISCORD_WEBHOOK_FINANCE', bad)
      expect(recipients.targetCount(Route.ALLOWED)).toBe(0)
    }
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', 'https://discord.com/api/v10/webhooks/1/tok?thread_id=2')
    expect(recipients.targetCount(Route.ALLOWED)).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // M-6b-4 (#155) — 키보드 메시지는 fin 봇
  it('interactiveNotifierFor — fin 봇으로 #finance 채널 · 버튼 변환 · 스위치를 읽지 않는다', async () => {
    stubLegacyTelegramEnv()
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', CHANNEL)
    const buttons = [[
      { label: '✅ 확정', action: 'vest:confirm:r1' },
      { label: '✖️ 취소', action: 'vest:cancel:r1' },
    ]]
    const r = await interactiveNotifierFor().notify(Route.ALLOWED, htmlContent('<b>rsu</b>', buttons))
    expect(r).toMatchObject({ sent: 1, total: 1, first: { target: 'finance', ref: 'd1' } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    expect(url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`)
    expect(init.headers.authorization).toBe('Bot fake-token')
    const body = JSON.parse(init.body) as { content: string; components: Array<{ components: Array<{ custom_id: string }> }> }
    expect(body.content).toBe('**rsu**')
    expect(body.components[0].components.map((b) => b.custom_id)).toEqual(['vest:confirm:r1', 'vest:cancel:r1'])
    expect(interactiveRecipientCount()).toBe(1)
  })

  it('봇 설정이 없으면 키보드 수신자 0 — 웹훅으로 우회하지 않는다', async () => {
    stubLegacyTelegramEnv()
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', 'not-an-id')
    const r = await interactiveNotifierFor().notify(Route.ALLOWED, htmlContent('rsu', [[{ label: 'ok', action: 'c' }]]))
    expect(r).toMatchObject({ sent: 0, total: 0 })
    expect(interactiveRecipientCount()).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('discordBotConfig — 허용 사용자는 숫자 ID 만 · ready 는 토큰 + 채널 ID 형식', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', ' t ')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', CHANNEL)
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '111111, abc ,222222,')
    expect(discordBotConfig()).toEqual({
      token: 't',
      channelId: CHANNEL,
      allowedUserIds: ['111111', '222222'],
      ready: true,
    })
  })

  // M-6b-1 (#147) — 분기 PDF 첨부
  describe('sendFile', () => {
    const pdf = { name: 'q.pdf', data: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }

    it("#finance 웹훅에 multipart 로 'sent'", async () => {
      await expect(sendFile('ALLOWED', pdf, '📊 리포트')).resolves.toBe('sent')
      expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK_FIN}?wait=true`)
      const form = fetchMock.mock.calls[0][1].body as unknown as FormData
      expect((form.get('files[0]') as File).name).toBe('q.pdf')
    })

    // 회귀: PR #148 Codex P2 — 생성 전 수신자 확인은 웹훅 기준
    it('fileRecipientCount — 웹훅 유무(0/1) · 텔레그램 chat 이 남아 있어도 0', () => {
      stubLegacyTelegramEnv()
      expect(fileRecipientCount('ALLOWED')).toBe(1)
      vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
      expect(fileRecipientCount('ALLOWED')).toBe(0)
    })

    it("웹훅이 비면 'no-webhook' — 보내지 않는다", async () => {
      vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
      await expect(sendFile('ALLOWED', pdf, 'c')).resolves.toBe('no-webhook')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

// 회귀: pleiades#136 사전 리뷰 info — 구 루프는 실패마다 lastError 를 덮어써 **마지막** 실패를 남겼다.
// 009 D-5 B4: 재발송 경로의 대상이 웹훅 하나라 alert-dispatcher.test 에서 옮겨 왔다(함수 단위로 고정).
describe('lastErrorOf', () => {
  it('실패가 둘 이상이면 마지막 실패의 메시지 · 실패 없으면 undefined', () => {
    const deliveries = [
      { target: 'a', ok: false, error: 'A' },
      { target: 'b', ok: true, ref: '2' },
      { target: 'c', ok: false, error: 'B' },
    ]
    expect(lastErrorOf({ sent: 1, total: 3, deliveries } as never)).toBe('B')
    expect(lastErrorOf({ sent: 1, total: 1, deliveries: [deliveries[1]] } as never)).toBeUndefined()
  })
})
