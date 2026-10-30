/**
 * pleiades M-6b-4 (pleiades#155) — Discord 버튼 → decideVest(텔레그램과 같은 판단) → 원본 수정 또는 본인 안내.
 * pleiades 009 D-1 (pleiades#349) — gateway 를 @pleiades/chat 으로(action · notice · edit 는 plain 그대로 · 버튼 제거는 edit 기본).
 * pleiades 009 D-3 PR-3 (pleiades#398) — 대화 채널 키 스위치 · intents · 기동 로그 · 4014 강등 → ADMIN · 요청 채널 notifier.
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
import { createChat, MESSAGE_INTENTS } from '@pleiades/chat'
import {
  INBOUND_OFF_LOG,
  INBOUND_ON_LOG,
  buttonChannels,
  discordRouter,
  handleDiscordButton,
  messageChannels,
  notifyIntentsFallback,
  startDiscordInteractions,
} from '../discord-interactions'
import * as notifier from '../notifier'
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
    send: vi.fn(async () => ({ id: 'm', channelId: '2', edit: async () => {}, setButtons: async () => {}, delete: async () => {} })),
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

  beforeEach(() => vi.mocked(createChat).mockClear())

  it('설정이 갖춰지면 시작 · intents 0 · IDENTIFY 보호 · 허용 = 그 사용자 AND 그 채널 · 허용 사용자 0 이면 경고', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE_CHAT', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(startDiscordInteractions(BOT_PROCESS_WITHOUT_TELEGRAM)).toBeDefined()
    expect(chatStart).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DISCORD_ALLOWED_USER_IDS 비어 있음'))
    const opts = vi.mocked(createChat).mock.calls[0][0]
    expect(opts.token()).toBe('fake-token')
    expect(opts.label).toBe('discord-fin')
    expect(opts.intents).toBe(0)
    expect(opts.fallbackIntents).toBeUndefined()
    expect(log).toHaveBeenCalledWith(INBOUND_OFF_LOG)
    expect(opts.identifyGuard).not.toBe('none')
    expect(opts.allowedChannelIds()).toEqual(['123456789012345678'])
    expect(opts.messageChannelIds?.()).toEqual([])
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '111111')
    expect(opts.allowedUserIds()).toEqual(['111111']) // 호출 때마다 다시 읽는다
    warn.mockRestore()
    log.mockRestore()
  })

  it('대화 채널 키를 채우면 메시지 intents + 4014 강등 · 메시지 채널 = [대화] · 버튼 채널 = [알림, 대화] 중복 제거', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    vi.stubEnv('DISCORD_ALLOWED_USER_IDS', '111111')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE_CHAT', '223456789012345678')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    startDiscordInteractions(BOT_PROCESS_WITHOUT_TELEGRAM)
    const opts = vi.mocked(createChat).mock.calls[0][0]
    expect(opts.intents).toBe(MESSAGE_INTENTS)
    expect(opts.fallbackIntents).toBe(0)
    expect(typeof opts.onIntentsFallback).toBe('function')
    expect(log).toHaveBeenCalledWith(INBOUND_ON_LOG)
    expect(opts.messageChannelIds?.()).toEqual(['223456789012345678'])
    expect(opts.allowedChannelIds()).toEqual(['123456789012345678', '223456789012345678'])
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE_CHAT', '123456789012345678') // 알림 채널과 같아도 된다
    expect(buttonChannels()).toEqual(['123456789012345678'])
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE_CHAT', 'not-an-id') // 형식이 아니면 끔
    expect(messageChannels()).toEqual([])
    log.mockRestore()
  })

  it('기동 로그 2 줄은 discord-switch.sh 판정 문자열(종료 코드 · 미설정 문구)을 포함하지 않는다', () => {
    for (const line of [INBOUND_ON_LOG, INBOUND_OFF_LOG]) {
      expect(line.startsWith('[discord-fin] ')).toBe(true)
      expect(line).not.toContain('gateway 종료 코드')
      expect(line).not.toContain('미설정')
    }
  })
})

describe('notifyIntentsFallback — 4014 강등 알림 (F)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ADMIN 1 회 · sent=0 이면 경고', async () => {
    const notify = vi.fn(async () => ({ sent: 0, failed: 0, total: 0, deliveries: [] }))
    vi.spyOn(notifier, 'notifierFor').mockReturnValue({ notify, targetCount: () => 0, targets: () => [] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await notifyIntentsFallback(BOT_PROCESS_WITHOUT_TELEGRAM)
    expect(notify).toHaveBeenCalledTimes(1)
    expect((notify.mock.calls[0] as unknown[])[0]).toBe('ADMIN')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('4014 강등 알림 미전송'))
  })
})

describe('notifierForDiscordChannel — /브리핑 요청 채널 (D2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('토큰 없음 → 수신자 0 · sent=0 경고(던지지 않는다)', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const n = notifier.notifierForDiscordChannel('223456789012345678')
    expect(n.targets(notifier.Route.ALLOWED)).toEqual([])
    const r = await n.notify(notifier.Route.ALLOWED, notifier.htmlContent('x'), { label: 'briefing' })
    expect(r.sent).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('요청 채널 발송 안 됨'))
  })

  it('토큰 있음 → 요청 채널 하나', () => {
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    expect(notifier.notifierForDiscordChannel('223456789012345678').targets(notifier.Route.ALLOWED)).toEqual(['req'])
  })
})
