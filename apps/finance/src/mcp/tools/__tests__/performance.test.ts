/**
 * pleiades#554 — get_performance 텍스트(주간 리뷰 AI 입력)가 현금흐름 보정값을 낸다.
 * #546 의 "⚠ 수량 변동" 줄을 대체한다(010 Q2).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/performance/twr', () => ({
  calculateTWR: vi.fn(async () => ({ twr: null, snapshotCount: 1 })),
}))
vi.mock('@/lib/performance/contribution', () => ({ calculateContribution: vi.fn() }))
vi.mock('../../utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils')>()),
  resolveAccountId: vi.fn(async () => 'acc'),
}))

import { calculateContribution, type HoldingContribution } from '@/lib/performance/contribution'
import { CONTRIBUTION_NOTE, getPerformance } from '../performance'

function holding(over: Partial<HoldingContribution>): HoldingContribution {
  return {
    ticker: 'AAA',
    displayName: '에이',
    weightStart: 50,
    weightEnd: 50,
    returnPct: 10,
    contribution: 5,
    gainKRW: 1000,
    netFlowKRW: 0,
    dividendKRW: 0,
    ...over,
  }
}

function given(holdings: HoldingContribution[], totalReturn: number | null = 1.5) {
  vi.mocked(calculateContribution).mockResolvedValue({
    accountId: 'acc',
    accountName: '계좌',
    period: '1M',
    holdings,
    totalReturn,
    hasData: true,
  })
}

const text = async () => (await getPerformance({ account_name: '계좌' })).content[0].text
const line = (t: string, ticker: string) => t.split('\n').find((l) => l.includes(`(${ticker})`))!

beforeEach(() => {
  vi.mocked(calculateContribution).mockReset()
})

describe('get_performance 기여도 — 현금흐름 보정', () => {
  it('기간 수익률 이름 · 손익 · 순매수/순매도 · 배당 · 주의 줄 1번', async () => {
    given([
      holding({ ticker: 'AAA' }),
      holding({ ticker: 'BBB', displayName: '비', netFlowKRW: -600000, gainKRW: -5000, returnPct: -1.2, contribution: -0.3 }),
      holding({ ticker: 'CCC', displayName: '씨', netFlowKRW: 250000, dividendKRW: 1234 }),
    ])
    const t = await text()
    expect(t).toContain('기간 수익률(현금흐름 보정): +1.50%')
    expect(t).not.toContain('전체 수익률')
    expect(line(t, 'AAA')).not.toMatch(/순매수|순매도|배당/)
    expect(line(t, 'BBB')).toContain('손익 -5,000원')
    expect(line(t, 'BBB')).toContain('순매도 600,000원')
    expect(line(t, 'CCC')).toContain('순매수 250,000원')
    expect(line(t, 'CCC')).toContain('배당 1,234원')
    expect(t.split(CONTRIBUTION_NOTE)).toHaveLength(2)
    expect(t).not.toContain('수량 변동') // #546 표시는 대체됐다
  })

  it('null 은 "—" 로 낸다 — 0 으로 읽히지 않게', async () => {
    given([holding({ returnPct: null, contribution: null })], null)
    const t = await text()
    expect(t).toContain('기간 수익률(현금흐름 보정): —')
    expect(line(t, 'AAA')).toContain('수익률 —')
    expect(line(t, 'AAA')).toContain('기여도 —')
  })
})
