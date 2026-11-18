/**
 * 013 P3-b2 (#779) 9-1 info — 알림 배선(DB 값 → 카드 빌더 입력) 분기를 고정한다.
 * 일일 요약: 전일 스냅샷이 있는 계좌만 `change` · 총 전일 대비는 그 계좌들만 · D-day: 미리보기 실패 · 성공 분기.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Content } from '@pleiades/notify'

const notify = vi.fn(async (_route: string, _content: Content) => ({ sent: 1, failed: 0, total: 1, deliveries: [] }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    priceCache: { findUnique: vi.fn(), findMany: vi.fn() },
    account: { findMany: vi.fn() },
    portfolioSnapshot: { findMany: vi.fn() },
    rSUSchedule: { findMany: vi.fn() },
  },
}))
vi.mock('../notifier', () => ({
  Route: { ALLOWED: 'ALLOWED', ADMIN: 'ADMIN' },
  NOTIFY_CTX: { label: 'notification' },
  notifierFor: () => ({ notify }),
  interactiveNotifierFor: () => ({ notify }),
}))
vi.mock('@/lib/rsu-vest-service', () => ({ getRsuVestPreview: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getRsuVestPreview } from '@/lib/rsu-vest-service'
import { sendDailySummary } from '../daily'
import { sendRSUVestConfirmations } from '../rsu'

const m = prisma as unknown as {
  priceCache: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  account: { findMany: ReturnType<typeof vi.fn> }
  portfolioSnapshot: { findMany: ReturnType<typeof vi.fn> }
  rSUSchedule: { findMany: ReturnType<typeof vi.fn> }
}
const sent = (): Content => notify.mock.calls.at(-1)![1]

beforeEach(() => {
  notify.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('sendDailySummary', () => {
  const ACCOUNTS = [
    { id: 'a1', name: '세진', holdings: [{ ticker: 'X', shares: 10, avgPrice: 10_000, currency: 'KRW' }] },
    { id: 'a2', name: '소담', holdings: [{ ticker: 'Y', shares: 10, avgPrice: 10_000, currency: 'KRW' }] },
  ]
  beforeEach(() => {
    m.priceCache.findUnique.mockResolvedValue({ price: 1400 })
    m.account.findMany.mockResolvedValue(ACCOUNTS)
    m.priceCache.findMany.mockResolvedValue([
      { ticker: 'X', price: 12_000 },
      { ticker: 'Y', price: 9_000 },
    ])
  })

  it('전일 스냅샷이 있는 계좌만 전일 칸 · 총 전일 대비는 그 계좌만으로', async () => {
    m.portfolioSnapshot.findMany.mockResolvedValue([{ accountId: 'a1', totalValueKRW: 110_000 }])
    await sendDailySummary()
    const c = sent()
    // a1: 120,000 - 110,000 = +10,000 (+9.1%) — a2 는 비교에서 빠진다
    expect(c.text).toContain('· 전일 +₩1만 (+9.1%)')
    expect(c.cards![0].description).toBe('• **💼 세진** — ₩12만 · +20.0% · 전일 +₩1만 🟢\n• **👧 소담** — ₩9만 · -10.0%')
  })

  it('전일 스냅샷이 없으면 전일 대비를 쓰지 않는다', async () => {
    m.portfolioSnapshot.findMany.mockResolvedValue([])
    await sendDailySummary()
    expect(sent().text).not.toContain('전일')
  })
})

describe('sendRSUVestConfirmations', () => {
  const RSU = { id: 'r1', shares: 10, sellShares: 3, basisValue: 1_500_000, vestingDate: new Date(), account: { name: '세진' } }
  beforeEach(() => m.rSUSchedule.findMany.mockResolvedValue([RSU]))

  it('미리보기 실패 → 종가 "조회 실패" · 매도 예정은 일정의 sellShares', async () => {
    vi.mocked(getRsuVestPreview).mockRejectedValueOnce(new Error('yahoo'))
    await sendRSUVestConfirmations()
    const d = sent().cards![0].description!
    expect(d).toContain('• **종가** — 조회 실패')
    expect(d).toContain('• **매도 예정** — 3주 (autoSell=✓)')
    expect(sent().components).toEqual([[{ label: '✅ 확정', action: 'vest:confirm:r1' }, { label: '✖️ 취소', action: 'vest:cancel:r1' }]])
  })

  it('미리보기 성공 → 종가 · 출처 · 미리보기의 매도 값 · 종가 없음은 안내', async () => {
    vi.mocked(getRsuVestPreview).mockResolvedValueOnce({ vestPrice: 151_000, vestPriceSource: 'historical', autoSellDefault: false, sellShares: null } as never)
    await sendRSUVestConfirmations()
    expect(sent().cards![0].description).toContain('• **종가** — ₩151,000 (historical)')
    expect(sent().cards![0].description).toContain('• **매도 예정** — 없음 (autoSell=✗)')
    vi.mocked(getRsuVestPreview).mockResolvedValueOnce({ vestPrice: null, vestPriceSource: 'fallback', autoSellDefault: true, sellShares: 2 } as never)
    await sendRSUVestConfirmations()
    expect(sent().cards![0].description).toContain('• **종가** — 자동 조회 실패 — 웹에서 직접 처리')
    expect(sent().cards![0].description).toContain('• **매도 예정** — 2주 (autoSell=✓)')
  })
})
