/**
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 §4 D2) — `sendBriefing(session, target?, options?)` 의 응답 대상.
 *
 * 봇 명령은 대상(() → notifier)을 넘기고 크론은 넘기지 않는다. 대상은 함수 안에서 부른다(009 D-5 B4 · 봇 핸들 인자 없음 ·
 * pleiades#512). 실패 안내의 AI 명령 표기는 인자로 바꿀 수 있다(기본 `/ai` · Discord `!ai`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/news/prompt-news', () => ({ gatherBriefingNews: vi.fn(async () => '수집 블록') }))
vi.mock('@/lib/ai/claude-advisor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/claude-advisor')>()),
  askAdvisor: vi.fn(),
}))
vi.mock('../notifier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifier')>()),
  notifierFor: vi.fn(),
}))

import { askAdvisor } from '@/lib/ai/claude-advisor'
import { notifierFor } from '../notifier'
import { sendBriefing } from '../briefing'

function fakeNotifier() {
  return { notify: vi.fn(async () => ({ sent: 1, total: 1, deliveries: [] })) }
}

beforeEach(() => {
  vi.mocked(askAdvisor).mockReset()
  vi.mocked(notifierFor).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('sendBriefing 응답 대상', () => {
  // pleiades#280: 코드가 모은 뉴스가 모델 프롬프트까지 간다
  it('수집한 뉴스를 프롬프트에 넣어 부른다', async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ response: 'x' } as never)
    await sendBriefing('KR', () => ({ notify: vi.fn(async () => undefined) }) as never)
    expect(vi.mocked(askAdvisor).mock.calls[0][0]).toContain('수집 블록')
  })

  it('대상이 있으면 대상 notifier 를 인자 없이 한 번 만들어 보낸다 · 크론 notifier 는 만들지 않는다', async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ response: '**브리핑**' } as never)
    const notifier = fakeNotifier()
    const target = vi.fn(() => notifier as never)
    await sendBriefing('KR', target)
    expect(target).toHaveBeenCalledTimes(1)
    expect(target).toHaveBeenCalledWith()
    expect(notifierFor).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith('ALLOWED', { text: '<b>브리핑</b>', format: 'html' }, { label: 'briefing' })
  })

  it('대상이 없으면 크론 경로(notifierFor)', async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ response: 'x' } as never)
    const notifier = fakeNotifier()
    vi.mocked(notifierFor).mockReturnValueOnce(notifier as never)
    await sendBriefing('US')
    expect(notifierFor).toHaveBeenCalledWith()
    expect(notifier.notify).toHaveBeenCalledTimes(1)
  })

  it('실패 안내 — 기본 !ai(009 D-5 B7a) · aiCommand 로 바꿀 수 있다', async () => {
    const tg = fakeNotifier()
    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error('boom'))
    await sendBriefing('KR', () => tg as never)
    const dc = fakeNotifier()
    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error('boom'))
    await sendBriefing('US', () => dc as never, { aiCommand: '/ask' })
    const text = (n: ReturnType<typeof fakeNotifier>) => (n.notify.mock.calls[0] as unknown[])[1] as { text: string }
    expect(text(tg).text.endsWith('\n!ai 에서 직접 질문해주세요.')).toBe(true)
    expect(text(tg).text.startsWith('📊 🇰🇷 한국장 모닝 브리핑 생성에 실패했습니다.')).toBe(true)
    expect(text(dc).text.endsWith('\n/ask 에서 직접 질문해주세요.')).toBe(true)
  })
})
