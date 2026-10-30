/**
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 §4 D2) — `sendBriefing(session, target?, options?)` 의 응답 대상.
 *
 * 봇 명령은 대상(봇 → notifier)을 넘기고 크론은 넘기지 않는다. `notifyBot()` 은 지금처럼 함수 안에서 먼저 부른다 —
 * 대상 함수는 그 봇을 받는다. 실패 안내의 AI 명령 표기는 인자로 바꿀 수 있다(텔레그램 `/ai` 기본 · Discord `!ai`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const BOT = { api: { tag: 'bot' } }
vi.mock('@/bot/index', () => ({ notifyBot: vi.fn(() => BOT) }))
vi.mock('@/lib/ai/claude-advisor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/claude-advisor')>()),
  askAdvisor: vi.fn(),
}))
vi.mock('../notifier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifier')>()),
  notifierFor: vi.fn(),
}))

import { notifyBot } from '@/bot/index'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { notifierFor } from '../notifier'
import { sendBriefing } from '../briefing'

function fakeNotifier() {
  return { notify: vi.fn(async () => ({ sent: 1, total: 1, deliveries: [] })) }
}

beforeEach(() => {
  vi.mocked(askAdvisor).mockReset()
  vi.mocked(notifierFor).mockReset()
  vi.mocked(notifyBot).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('sendBriefing 응답 대상', () => {
  it('대상이 있으면 notifyBot() 의 봇으로 대상 notifier 를 만들어 보낸다 · 크론 notifier 는 만들지 않는다', async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ response: '**브리핑**' } as never)
    const notifier = fakeNotifier()
    const target = vi.fn(() => notifier as never)
    await sendBriefing('KR', target)
    expect(notifyBot).toHaveBeenCalledTimes(1)
    expect(target).toHaveBeenCalledWith(BOT)
    expect(notifierFor).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith('ALLOWED', { text: '<b>브리핑</b>', format: 'html' }, { label: 'briefing' })
  })

  it('대상이 없으면 크론 경로(notifierFor)', async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ response: 'x' } as never)
    const notifier = fakeNotifier()
    vi.mocked(notifierFor).mockReturnValueOnce(notifier as never)
    await sendBriefing('US')
    expect(notifierFor).toHaveBeenCalledWith(BOT)
    expect(notifier.notify).toHaveBeenCalledTimes(1)
  })

  it('실패 안내 — 기본 /ai · aiCommand 로 바꿀 수 있다', async () => {
    const tg = fakeNotifier()
    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error('boom'))
    await sendBriefing('KR', () => tg as never)
    const dc = fakeNotifier()
    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error('boom'))
    await sendBriefing('US', () => dc as never, { aiCommand: '!ai' })
    const text = (n: ReturnType<typeof fakeNotifier>) => (n.notify.mock.calls[0] as unknown[])[1] as { text: string }
    expect(text(tg).text.endsWith('\n/ai 에서 직접 질문해주세요.')).toBe(true)
    expect(text(tg).text.startsWith('📊 🇰🇷 한국장 모닝 브리핑 생성에 실패했습니다.')).toBe(true)
    expect(text(dc).text.endsWith('\n!ai 에서 직접 질문해주세요.')).toBe(true)
  })
})
