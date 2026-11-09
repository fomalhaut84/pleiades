/**
 * pleiades#262 B — get_performance 텍스트(브리핑·리뷰 AI 입력)에 수량 변동 표시와 주의 줄.
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
import { getPerformance, SHARES_CHANGED_NOTE } from '../performance'

function holding(over: Partial<HoldingContribution>): HoldingContribution {
  return {
    ticker: 'AAA',
    displayName: '에이',
    weightStart: 50,
    weightEnd: 50,
    returnPct: 10,
    contribution: 5,
    sharesStart: 10,
    sharesEnd: 10,
    sharesChanged: false,
    ...over,
  }
}

function given(holdings: HoldingContribution[]) {
  vi.mocked(calculateContribution).mockResolvedValue({
    accountId: 'acc',
    accountName: '계좌',
    period: '1M',
    holdings,
    totalReturn: 1,
    hasData: true,
  })
}

const text = async () => (await getPerformance({ account_name: '계좌' })).content[0].text

beforeEach(() => {
  vi.mocked(calculateContribution).mockReset()
})

describe('get_performance 수량 변동 표시', () => {
  it('수량이 바뀐 종목에만 표시 · 소수 주는 4자리까지 · 주의 줄 1번', async () => {
    given([
      holding({ ticker: 'AAA' }),
      holding({ ticker: 'BBB', displayName: '비', returnPct: -60, sharesStart: 10, sharesEnd: 4, sharesChanged: true }),
      holding({ ticker: 'CCC', displayName: '씨', sharesStart: 1.23456, sharesEnd: 2, sharesChanged: true }),
    ])
    const t = await text()
    const line = (ticker: string) => t.split('\n').find((l) => l.includes(`(${ticker})`))!
    expect(line('AAA')).not.toContain('수량 변동')
    expect(line('BBB')).toContain('⚠ 수량 변동 10→4주')
    expect(line('CCC')).toContain('수량 변동 1.2346→2주')
    expect(t.split(SHARES_CHANGED_NOTE)).toHaveLength(2)
  })

  it('변동 종목이 없으면 주의 줄도 없다', async () => {
    given([holding({})])
    expect(await text()).not.toContain(SHARES_CHANGED_NOTE)
  })
})
