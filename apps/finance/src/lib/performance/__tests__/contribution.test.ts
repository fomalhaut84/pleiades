/**
 * pleiades#554 — 010 A1-2: calculateContribution 이 현금흐름 보정(Modified Dietz)을 낸다.
 * 순수 함수 자체는 modified-dietz.test.ts — 여기서는 조회 모양과 연결만 본다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findUniqueOrThrow: vi.fn() },
    portfolioSnapshot: { findMany: vi.fn() },
    dividend: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { calculateContribution } from '../contribution'
import { sharesDiffer } from '../shares'

type H = { ticker: string; displayName: string; shares: number; valueKRW: number }
const day = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 86400000)
const snap = (n: number, holdings: H[]) => ({
  snapshotDate: day(n),
  totalValueKRW: holdings.reduce((a, h) => a + h.valueKRW, 0),
  holdingSnapshots: holdings,
})

function given(snaps: ReturnType<typeof snap>[], dividends: { ticker: string; payDate: Date; amountKRW: number }[] = []) {
  vi.mocked(prisma.portfolioSnapshot.findMany).mockResolvedValue(snaps as never)
  vi.mocked(prisma.dividend.findMany).mockResolvedValue(dividends as never)
}

beforeEach(() => {
  vi.mocked(prisma.account.findUniqueOrThrow).mockReset().mockResolvedValue({ name: '계좌' } as never)
  vi.mocked(prisma.portfolioSnapshot.findMany).mockReset()
  vi.mocked(prisma.dividend.findMany).mockReset().mockResolvedValue([] as never)
})

describe('sharesDiffer', () => {
  it('부동소수 합산 오차는 변동이 아니다 · 소수 주 매수는 변동이다', () => {
    expect(sharesDiffer(0.1 + 0.2, 0.3)).toBe(false)
    expect(sharesDiffer(1.5, 1.75)).toBe(true)
  })
})

describe('calculateContribution — 현금흐름 보정', () => {
  // 회귀: #262 — 판 만큼 평가액이 줄면 옛 식은 −60% 로 보였다. 보정값은 가격 변화만 남는다
  it('수량을 줄인 종목은 매도분을 손실로 보지 않는다 · 기여도 합 = 기간 수익률', async () => {
    given([
      snap(0, [
        { ticker: 'AAA', displayName: '에이', shares: 10, valueKRW: 1000 },
        { ticker: 'BBB', displayName: '비', shares: 10, valueKRW: 1000 },
      ]),
      snap(30, [
        { ticker: 'AAA', displayName: '에이', shares: 10, valueKRW: 1100 },
        { ticker: 'BBB', displayName: '비', shares: 4, valueKRW: 400 },
      ]),
    ])
    const r = await calculateContribution('acc', '1M')
    const b = r.holdings.find((h) => h.ticker === 'BBB')!
    expect(b.netFlowKRW).toBeCloseTo(-600)
    expect(b.gainKRW).toBeCloseTo(0)
    expect(b.returnPct).toBeCloseTo(0)
    const sum = r.holdings.reduce((a, h) => a + (h.contribution ?? 0), 0)
    expect(sum).toBeCloseTo(r.totalReturn!)
    expect(r.hasData).toBe(true)
  })

  it('기간 스냅샷 전체를 날짜순으로 읽고 보유는 3필드+이름만 · 배당은 [첫, 끝) 지급일', async () => {
    given([snap(0, [{ ticker: 'A', displayName: 'A', shares: 1, valueKRW: 1 }]), snap(30, [{ ticker: 'A', displayName: 'A', shares: 1, valueKRW: 1 }])])
    await calculateContribution('acc', 'ALL')
    const q = vi.mocked(prisma.portfolioSnapshot.findMany).mock.calls[0][0]!
    expect(q.where).toEqual({ accountId: 'acc' })
    expect(q.orderBy).toEqual({ snapshotDate: 'asc' })
    expect(q.select?.holdingSnapshots).toEqual({ select: { ticker: true, displayName: true, shares: true, valueKRW: true } })
    expect(q).not.toHaveProperty('take')
    const d = vi.mocked(prisma.dividend.findMany).mock.calls[0][0]!
    expect(d.where).toEqual({ accountId: 'acc', payDate: { gte: day(0), lt: day(30) } })
  })

  it('전량 매도한 종목은 마지막 보유 때 이름으로 남는다 · 매도 뒤 배당 종목도 들어간다', async () => {
    given(
      [
        snap(0, [{ ticker: 'OLD', displayName: '옛이름', shares: 3, valueKRW: 300 }, { ticker: 'K', displayName: '케이', shares: 1, valueKRW: 700 }]),
        snap(10, [{ ticker: 'K', displayName: '케이', shares: 1, valueKRW: 700 }]),
        snap(30, [{ ticker: 'K', displayName: '케이', shares: 1, valueKRW: 700 }]),
      ],
      [{ ticker: 'OLD', payDate: day(20), amountKRW: 12 }]
    )
    const r = await calculateContribution('acc', '1M')
    const old = r.holdings.find((h) => h.ticker === 'OLD')!
    expect(old.displayName).toBe('옛이름')
    expect(old.dividendKRW).toBe(12)
    expect(old.weightEnd).toBe(0)
  })

  it('손익 절대값 순으로 정렬한다 — 큰 손실이 앞', async () => {
    given([
      snap(0, [
        { ticker: 'UP', displayName: 'UP', shares: 1, valueKRW: 1000 },
        { ticker: 'DOWN', displayName: 'DOWN', shares: 1, valueKRW: 1000 },
        { ticker: 'FLAT', displayName: 'FLAT', shares: 1, valueKRW: 1000 },
      ]),
      snap(30, [
        { ticker: 'UP', displayName: 'UP', shares: 1, valueKRW: 1050 },
        { ticker: 'DOWN', displayName: 'DOWN', shares: 1, valueKRW: 800 },
        { ticker: 'FLAT', displayName: 'FLAT', shares: 1, valueKRW: 1000 },
      ]),
    ])
    const r = await calculateContribution('acc', '1M')
    expect(r.holdings.map((h) => h.ticker)).toEqual(['DOWN', 'UP', 'FLAT'])
  })

  it('기간 초 대량 매도로 계좌 분모가 작으면 기간 수익률·기여도 null 이 결과까지 간다(Q5)', async () => {
    given([
      snap(0, [{ ticker: 'A', displayName: 'A', shares: 100, valueKRW: 10000 }]),
      snap(1, [{ ticker: 'A', displayName: 'A', shares: 1, valueKRW: 100 }]),
      snap(30, [{ ticker: 'A', displayName: 'A', shares: 1, valueKRW: 100 }]),
    ])
    const r = await calculateContribution('acc', '1M')
    expect(r.hasData).toBe(true)
    expect(r.totalReturn).toBeNull()
    expect(r.holdings[0].contribution).toBeNull()
  })

  it('스냅샷이 2개 미만이면 hasData=false · 기간 수익률 null', async () => {
    given([snap(0, [])])
    const r = await calculateContribution('acc', '1M')
    expect(r).toMatchObject({ hasData: false, totalReturn: null, holdings: [] })
  })
})
