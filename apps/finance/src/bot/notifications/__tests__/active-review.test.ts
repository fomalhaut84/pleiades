/**
 * #499 회귀 — 클로징 리뷰 프롬프트가 지수를 get_prices 도구값으로 확인하는지 검증.
 *
 * 배경: KR 클로징 (15:40 KST) 은 마감 10분 뒤라 당일 마감 기사가 검색에 안 잡히는 날이 많다.
 * 프롬프트에 지수 조회 도구 단계가 없으면 "데이터 부족" 오보가 매일 재발한다.
 *
 * active-review 는 봇/Prisma/Advisor 를 import 하므로 side effect 를 mock 으로 차단하고
 * pure 함수 (buildClosingPrompt) 만 검증한다.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { alertConfig: { upsert: vi.fn() } } }))
vi.mock('@/bot/index', () => ({ getBot: vi.fn() }))
vi.mock('@/lib/ai/claude-advisor', () => ({
  askAdvisor: vi.fn(),
  describeAdvisorError: vi.fn(() => ''),
}))
vi.mock('@/bot/utils/telegram', () => ({ sendHtml: vi.fn() }))

import { buildClosingPrompt } from '../active-review'

// 2026-09-17 15:40 KST = 2026-09-17 06:40 UTC (실제 오보가 발생한 시각)
const KR_CLOSING_NOW = new Date('2026-09-17T06:40:00Z')

describe('buildClosingPrompt (#499)', () => {
  it('KR: 코스피/코스닥 지수 티커 + 오늘 KST 날짜를 포함', () => {
    const prompt = buildClosingPrompt('KR', KR_CLOSING_NOW)
    expect(prompt).toContain('^KS11')
    expect(prompt).toContain('^KQ11')
    expect(prompt).toContain('2026-09-17')
  })

  it('KR: KST 자정 직전에도 KST 날짜 기준 (UTC 날짜로 밀리지 않음)', () => {
    // 2026-09-17 23:30 KST = 2026-09-17 14:30 UTC
    expect(buildClosingPrompt('KR', new Date('2026-09-17T14:30:00Z'))).toContain('2026-09-17')
    // 2026-09-18 00:30 KST = 2026-09-17 15:30 UTC → KST 로는 이미 다음날
    expect(buildClosingPrompt('KR', new Date('2026-09-17T15:30:00Z'))).toContain('2026-09-18')
  })

  it('US: S&P500/나스닥/다우 지수 티커를 포함', () => {
    const prompt = buildClosingPrompt('US', KR_CLOSING_NOW)
    expect(prompt).toContain('^GSPC')
    expect(prompt).toContain('^IXIC')
    expect(prompt).toContain('^DJI')
    expect(prompt).not.toContain('^KS11')
  })

  it('두 세션 모두 get_prices 단계가 WebSearch 단계보다 앞선다', () => {
    for (const session of ['KR', 'US'] as const) {
      const prompt = buildClosingPrompt(session, KR_CLOSING_NOW)
      const priceIdx = prompt.indexOf('get_prices')
      const searchIdx = prompt.indexOf('WebSearch')
      expect(priceIdx).toBeGreaterThanOrEqual(0)
      expect(searchIdx).toBeGreaterThanOrEqual(0)
      expect(priceIdx).toBeLessThan(searchIdx)
    }
  })

  it('US 만 미국 현지 날짜 단서를 포함 (KST 어제 기사 과잉 억제 방지)', () => {
    const us = buildClosingPrompt('US', KR_CLOSING_NOW)
    const kr = buildClosingPrompt('KR', KR_CLOSING_NOW)
    expect(us).toContain('미국 현지 날짜 기준')
    expect(kr).not.toContain('미국 현지 날짜 기준')
  })

  it('"데이터 부족" 표현 가드 지시를 포함', () => {
    expect(buildClosingPrompt('KR', KR_CLOSING_NOW)).toContain('데이터 부족')
    expect(buildClosingPrompt('KR', KR_CLOSING_NOW)).toContain('당일 뉴스 미확인')
  })
})
