/**
 * pleiades M-6b-4 (pleiades#155) — Discord 버튼 → decideVest(텔레그램과 같은 판단) → 원본 수정 또는 본인 안내.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/bot/commands/vest-confirm', () => ({ decideVest: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
const gatewayStart = vi.fn()
vi.mock('@pleiades/notify', async (orig) => ({
  ...(await orig<typeof import('@pleiades/notify')>()),
  createDiscordGateway: vi.fn(() => ({ start: gatewayStart, stop: vi.fn() })),
}))

import { decideVest } from '@/bot/commands/vest-confirm'
import { createDiscordGateway } from '@pleiades/notify'
import { handleDiscordButton, startDiscordInteractions } from '../discord-interactions'

function ctx(customId: string) {
  return {
    customId,
    userId: '1',
    channelId: '2',
    messageId: '3',
    edit: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    removeButtons: vi.fn(async () => {}),
  }
}

describe('handleDiscordButton', () => {
  beforeEach(() => {
    vi.mocked(decideVest).mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('확정 — 원본을 완료 본문으로(HTML escape · 버튼 제거는 edit 기본)', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'edit', text: '✅ 완료\n종목: A<B> & C', toast: '완료' })
    const c = ctx('vest:confirm:r1')
    await handleDiscordButton(c)
    expect(decideVest).toHaveBeenCalledWith('vest:confirm:r1')
    expect(c.edit).toHaveBeenCalledWith('✅ 완료\n종목: A&lt;B&gt; &amp; C')
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('alert — 본인 안내만 · 원본·버튼 유지(다시 누를 수 있다)', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'alert', text: 'RSU 스케줄을 찾을 수 없습니다.' })
    const c = ctx('vest:confirm:none')
    await handleDiscordButton(c)
    expect(c.reply).toHaveBeenCalledWith('RSU 스케줄을 찾을 수 없습니다.')
    expect(c.edit).not.toHaveBeenCalled()
    expect(c.removeButtons).not.toHaveBeenCalled()
  })

  // commit 뒤 원본 수정 실패가 throw 되면 gateway 가 "처리 중 오류" 를 보낸다 — 이미 반영된 vest 를 실패로 보이게 하지 않는다
  it('원본 수정 실패 — 던지지 않고 본인 안내로 대신', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'edit', text: '✅ 완료', toast: '완료' })
    const c = ctx('vest:confirm:r1')
    c.edit.mockRejectedValue(new Error('Discord 인터랙션 원본 수정 응답 404'))
    await expect(handleDiscordButton(c)).resolves.toBeUndefined()
    expect(c.reply).toHaveBeenCalledWith('✅ 완료')
  })

  it('원본 수정·안내 둘 다 실패해도 던지지 않는다', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'edit', text: '✅ 완료', toast: '완료' })
    const c = ctx('vest:confirm:r1')
    c.edit.mockRejectedValue(new Error('404'))
    c.reply.mockRejectedValue(new Error('Unknown interaction'))
    await expect(handleDiscordButton(c)).resolves.toBeUndefined()
  })

  it('다른 접두사는 판단하지 않고 안내만', async () => {
    const c = ctx('auto_adjust:accept:x')
    await handleDiscordButton(c)
    expect(decideVest).not.toHaveBeenCalled()
    expect(c.reply).toHaveBeenCalledWith('알 수 없는 요청입니다.')
  })
})

describe('startDiscordInteractions', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('토큰·채널이 없으면 시작하지 않는다', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(startDiscordInteractions()).toBeUndefined()
    log.mockRestore()
  })

  it('설정이 갖춰지면 gateway 시작 · 허용 = 그 사용자 AND 그 채널 · 허용 사용자 0 이면 경고', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(startDiscordInteractions()).toBeDefined()
    expect(gatewayStart).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DISCORD_ALLOWED_USER_IDS 비어 있음'))
    const opts = vi.mocked(createDiscordGateway).mock.calls[0][0]
    expect(opts.token).toBe('fake-token')
    expect(opts.allowedChannelIds()).toEqual(['123456789012345678'])
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '111111')
    expect(opts.allowedUserIds()).toEqual(['111111']) // 호출 때마다 다시 읽는다
    warn.mockRestore()
  })
})
