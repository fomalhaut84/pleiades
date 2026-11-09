/**
 * pleiades#262 B — 기간 안에 수량이 바뀐 종목을 `sharesChanged` 로 표시한다.
 * 계산식(평가액 변화)은 그대로다 — 현금흐름 보정은 #262 A.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findUniqueOrThrow: vi.fn() },
    portfolioSnapshot: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { calculateContribution, sharesDiffer } from '../contribution'

type H = { ticker: string; displayName: string; shares: number; valueKRW: number }

function snap(id: string, holdings: H[]) {
  return {
    id,
    totalValueKRW: holdings.reduce((a, h) => a + h.valueKRW, 0),
    holdingSnapshots: holdings,
  }
}

function given(start: ReturnType<typeof snap>, end: ReturnType<typeof snap>) {
  vi.mocked(prisma.portfolioSnapshot.findMany).mockResolvedValue([start] as never)
  vi.mocked(prisma.portfolioSnapshot.findFirst).mockResolvedValue(end as never)
}

beforeEach(() => {
  vi.mocked(prisma.account.findUniqueOrThrow).mockReset().mockResolvedValue({ name: '계좌' } as never)
  vi.mocked(prisma.portfolioSnapshot.findMany).mockReset()
  vi.mocked(prisma.portfolioSnapshot.findFirst).mockReset()
})

describe('sharesDiffer', () => {
  it('부동소수 합산 오차는 변동이 아니다', () => {
    expect(sharesDiffer(0.1 + 0.2, 0.3)).toBe(false)
  })
  it('소수 주 매수는 변동이다', () => {
    expect(sharesDiffer(1.5, 1.75)).toBe(true)
  })
})

describe('calculateContribution 수량 변동 표시', () => {
  it('수량이 같으면 sharesChanged=false · 줄면 true(평가액 하락이 손실처럼 보이는 경우)', async () => {
    given(
      snap('s', [
        { ticker: 'AAA', displayName: '에이', shares: 10, valueKRW: 1000 },
        { ticker: 'BBB', displayName: '비', shares: 10, valueKRW: 1000 },
      ]),
      snap('e', [
        { ticker: 'AAA', displayName: '에이', shares: 10, valueKRW: 1100 },
        { ticker: 'BBB', displayName: '비', shares: 4, valueKRW: 400 },
      ]),
    )
    const r = await calculateContribution('acc', '1M')
    const a = r.holdings.find((h) => h.ticker === 'AAA')!
    const b = r.holdings.find((h) => h.ticker === 'BBB')!
    expect(a).toMatchObject({ sharesStart: 10, sharesEnd: 10, sharesChanged: false })
    expect(b).toMatchObject({ sharesStart: 10, sharesEnd: 4, sharesChanged: true })
    expect(b.returnPct).toBeCloseTo(-60) // 계산식은 그대로 — 표시만 붙는다
  })

  it('신규 편입(시작 0)과 전량 매도(끝 0)도 변동이다', async () => {
    given(
      snap('s', [{ ticker: 'OLD', displayName: '옛', shares: 3, valueKRW: 300 }]),
      snap('e', [{ ticker: 'NEW', displayName: '새', shares: 2, valueKRW: 250 }]),
    )
    const r = await calculateContribution('acc', '1M')
    expect(r.holdings.find((h) => h.ticker === 'OLD')).toMatchObject({ sharesStart: 3, sharesEnd: 0, sharesChanged: true })
    expect(r.holdings.find((h) => h.ticker === 'NEW')).toMatchObject({ sharesStart: 0, sharesEnd: 2, sharesChanged: true })
  })

  it('같은 티커 여러 줄은 수량을 합쳐 비교한다', async () => {
    given(
      snap('s', [
        { ticker: 'AAA', displayName: '에이', shares: 4, valueKRW: 400 },
        { ticker: 'AAA', displayName: '에이', shares: 6, valueKRW: 600 },
      ]),
      snap('e', [{ ticker: 'AAA', displayName: '에이', shares: 10, valueKRW: 1200 }]),
    )
    const r = await calculateContribution('acc', '1M')
    expect(r.holdings[0]).toMatchObject({ sharesStart: 10, sharesEnd: 10, sharesChanged: false })
  })
})
