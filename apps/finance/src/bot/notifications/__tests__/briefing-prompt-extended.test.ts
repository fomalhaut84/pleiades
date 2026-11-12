// #615: 시작 브리핑은 정규장 밖 흐름을 읽는다 — 08:30 KR = 미국 시간외 진행 중 · 23:00 US = 프리마켓(겨울).
// get_portfolio 는 캐시 경로라 시간외가 없다 → 보유 미국주를 get_prices 로 티커 지정 조회하게 한다.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai/claude-advisor', () => ({ askAdvisor: vi.fn(), describeAdvisorError: vi.fn() }))
vi.mock('@/lib/news/prompt-news', () => ({ gatherBriefingNews: vi.fn() }))
vi.mock('../notifier', () => ({ notifierFor: vi.fn(), Route: {}, htmlContent: vi.fn() }))

import { buildBriefingPrompt } from '../briefing'

const NOW = new Date('2026-11-11T23:30:00Z')

describe('buildBriefingPrompt — 정규장 밖 흐름 (#615)', () => {
  it('KR 브리핑: 보유 미국주 get_prices 지정 조회 · 직전 거래일 시간외 → 한국 보유 종목 영향', () => {
    expect(buildBriefingPrompt('KR', NOW)).toContain('직전 미국 거래일')
    const p = buildBriefingPrompt('KR', NOW)
    expect(p).toContain('get_prices 로 보유 미국주(USD) 티커를 지정해 조회')
    expect(p).toContain('시간외')
    expect(p).toContain('한국 보유 종목')
  })

  it('US 브리핑: 프리마켓 흐름을 오늘 대응에 반영', () => {
    const p = buildBriefingPrompt('US', NOW)
    expect(p).toContain('get_prices 로 보유 미국주(USD) 티커를 지정해 조회')
    expect(p).toContain('프리마켓')
  })

  it('값이 없을 때 지어내지 않는다 — get_prices 에 줄이 있을 때만', () => {
    for (const s of ['KR', 'US'] as const) {
      expect(buildBriefingPrompt(s, NOW)).toContain('get_prices 결과에 그 줄이 있을 때만')
    }
  })
})
