/**
 * pleiades#280 — 클로징·주간 리뷰가 코드가 모은 뉴스를 프롬프트로 넘긴다.
 * 연결이 끊기면 프롬프트가 없는 "수집된 뉴스" 를 가리킨다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { alertConfig: { upsert: vi.fn(async () => ({ value: 'on' })) } } }))
vi.mock('@/bot/index', () => ({ notifyBot: vi.fn(() => ({ api: {} })) }))
vi.mock('@/lib/news/prompt-news', () => ({
  gatherClosingNews: vi.fn(async () => '클로징 블록'),
  gatherWeeklyNews: vi.fn(async () => '주간 블록'),
}))
vi.mock('@/lib/ai/claude-advisor', () => ({ askAdvisor: vi.fn(async () => ({ response: 'x' })), describeAdvisorError: vi.fn(() => '') }))
vi.mock('../notifier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifier')>()),
  notifierFor: vi.fn(() => ({ notify: vi.fn(async () => undefined) })),
}))

import { askAdvisor } from '@/lib/ai/claude-advisor'
import { sendClosingReview, sendWeeklyReview } from '../active-review'

describe('리뷰 뉴스 연결', () => {
  beforeEach(() => vi.mocked(askAdvisor).mockClear())

  it('클로징', async () => {
    await sendClosingReview('US')
    expect(vi.mocked(askAdvisor).mock.calls[0][0]).toContain('클로징 블록')
  })

  it('주간', async () => {
    await sendWeeklyReview()
    expect(vi.mocked(askAdvisor).mock.calls[0][0]).toContain('주간 블록')
  })
})
