/**
 * pleiades M-6b-4 (pleiades#155) — Discord 버튼 → decideVest(텔레그램과 같은 판단) → 원본 수정 또는 본인 안내.
 * pleiades 009 D-1 (pleiades#349) — gateway 를 @pleiades/chat 으로(action · notice · edit 는 plain 그대로 · 버튼 제거는 edit 기본).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/bot/commands/vest-confirm', () => ({ decideVest: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
const chatStart = vi.fn()
vi.mock('@pleiades/chat', async (orig) => ({
  ...(await orig<typeof import('@pleiades/chat')>()),
  createChat: vi.fn(() => ({ start: chatStart, stop: vi.fn(), send: vi.fn() })),
}))

import { decideVest } from '@/bot/commands/vest-confirm'
import { createChat } from '@pleiades/chat'
import { discordRouter, handleDiscordButton, startDiscordInteractions } from '../discord-interactions'
import { BOT_PROCESS_WITHOUT_TELEGRAM } from '../notifier'

function ctx(action: string) {
  return {
    platform: 'discord' as const,
    action,
    userId: '1',
    channelId: '2',
    messageId: '3',
    edit: vi.fn(async () => {}),
    setButtons: vi.fn(async () => {}),
    notice: vi.fn(async () => {}),
    send: vi.fn(async () => ({ id: 'm', channelId: '2', edit: async () => {}, setButtons: async () => {} })),
  }
}

describe('handleDiscordButton', () => {
  beforeEach(() => {
    vi.mocked(decideVest).mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('확정 — 원본을 완료 본문으로(plain 그대로 · 버튼 제거는 edit 기본)', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'edit', text: '✅ 완료\n종목: A<B> & C', toast: '완료' })
    const c = ctx('vest:confirm:r1')
    await handleDiscordButton(c)
    expect(decideVest).toHaveBeenCalledWith('vest:confirm:r1')
    expect(c.edit).toHaveBeenCalledWith('✅ 완료\n종목: A<B> & C')
    expect(c.notice).not.toHaveBeenCalled()
  })

  it('alert — 본인 안내만 · 원본·버튼 유지(다시 누를 수 있다)', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'alert', text: 'RSU 스케줄을 찾을 수 없습니다.' })
    const c = ctx('vest:confirm:none')
    await handleDiscordButton(c)
    expect(c.notice).toHaveBeenCalledWith('RSU 스케줄을 찾을 수 없습니다.')
    expect(c.edit).not.toHaveBeenCalled()
    expect(c.setButtons).not.toHaveBeenCalled()
  })

  // commit 뒤 원본 수정 실패가 throw 되면 chat 이 "처리 중 오류" 를 보낸다 — 이미 반영된 vest 를 실패로 보이게 하지 않는다
  it('원본 수정 실패 — 던지지 않고 본인 안내로 대신', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'edit', text: '✅ 완료', toast: '완료' })
    const c = ctx('vest:confirm:r1')
    c.edit.mockRejectedValue(new Error('Discord 인터랙션 원본 수정 응답 404'))
    await expect(handleDiscordButton(c)).resolves.toBeUndefined()
    expect(c.notice).toHaveBeenCalledWith('✅ 완료')
  })

  it('원본 수정·안내 둘 다 실패해도 던지지 않는다', async () => {
    vi.mocked(decideVest).mockResolvedValue({ kind: 'edit', text: '✅ 완료', toast: '완료' })
    const c = ctx('vest:confirm:r1')
    c.edit.mockRejectedValue(new Error('404'))
    c.notice.mockRejectedValue(new Error('Unknown interaction'))
    await expect(handleDiscordButton(c)).resolves.toBeUndefined()
  })

  it('다른 접두사는 판단하지 않고 안내만', async () => {
    const c = ctx('auto_adjust:accept:x')
    await handleDiscordButton(c)
    expect(decideVest).not.toHaveBeenCalled()
    expect(c.notice).toHaveBeenCalledWith('알 수 없는 요청입니다.')
  })

  it('라우터는 모든 버튼을 핸들러로 보낸다 — 알 수 없는 접두사도 처리됨', async () => {
    const c = ctx('auto_adjust:accept:x')
    await expect(discordRouter.handleButton(c)).resolves.toBe(true)
    expect(c.notice).toHaveBeenCalledWith('알 수 없는 요청입니다.')
  })
})

describe('startDiscordInteractions', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('토큰·채널이 없으면 시작하지 않는다', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(startDiscordInteractions(BOT_PROCESS_WITHOUT_TELEGRAM)).toBeUndefined()
    log.mockRestore()
  })

  it('설정이 갖춰지면 시작 · intents 0 · IDENTIFY 보호 · 허용 = 그 사용자 AND 그 채널 · 허용 사용자 0 이면 경고', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(startDiscordInteractions(BOT_PROCESS_WITHOUT_TELEGRAM)).toBeDefined()
    expect(chatStart).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DISCORD_ALLOWED_USER_IDS 비어 있음'))
    const opts = vi.mocked(createChat).mock.calls[0][0]
    expect(opts.token()).toBe('fake-token')
    expect(opts.label).toBe('discord-fin')
    expect(opts.intents).toBe(0)
    expect(opts.identifyGuard).not.toBe('none')
    expect(opts.allowedChannelIds()).toEqual(['123456789012345678'])
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '111111')
    expect(opts.allowedUserIds()).toEqual(['111111']) // 호출 때마다 다시 읽는다
    warn.mockRestore()
  })
})
