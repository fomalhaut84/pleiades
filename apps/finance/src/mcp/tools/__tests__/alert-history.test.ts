import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listAlertHistory } from '../alert-history'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      findMany: vi.fn(),
    },
  },
}))

describe('listAlertHistory', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockReset()
  })

  it('알 수 없는 kind 는 toolError', async () => {
    const result = await listAlertHistory({ kind: 'unknown' })
    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(result.content[0].text).toContain('알 수 없는 kind')
  })

  it('from 형식 오류 → toolError', async () => {
    const result = await listAlertHistory({ from: 'not-a-date' })
    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(result.content[0].text).toContain('ISO 8601')
  })

  it('to 형식 오류 → toolError', async () => {
    const result = await listAlertHistory({ to: 'invalid' })
    expect((result as { isError?: boolean }).isError).toBe(true)
  })

  it('limit 이 양수 아님 → toolError', async () => {
    const result = await listAlertHistory({ limit: -1 })
    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(result.content[0].text).toContain('limit')
  })

  it('빈 결과 → "이력이 없습니다"', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([])

    const result = await listAlertHistory({})
    expect(result.content[0].text).toContain('이력이 없습니다')
  })

  it('limit 상한 200 초과 시 clamp', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([])

    await listAlertHistory({ limit: 1000 })
    const call = vi.mocked(prisma.alertHistory.findMany).mock.calls[0][0]
    expect(call?.take).toBe(200)
  })

  it('필터 조합이 where 로 전달됨', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([])

    await listAlertHistory({
      kind: 'surge',
      ticker: 'AAPL',
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-08T00:00:00Z',
      limit: 30,
    })
    const call = vi.mocked(prisma.alertHistory.findMany).mock.calls[0][0]
    expect(call?.where).toEqual({
      kind: 'surge',
      ticker: 'AAPL',
      firedAt: {
        gte: new Date('2026-07-01T00:00:00Z'),
        lte: new Date('2026-07-08T00:00:00Z'),
      },
    })
    expect(call?.take).toBe(30)
    expect(call?.orderBy).toEqual({ firedAt: 'desc' })
  })

  it('ticker 소문자/공백 입력을 trim().toUpperCase() 로 정규화 (Codex #423 P2 회귀 방지)', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([])

    await listAlertHistory({ ticker: '  aapl ' })
    const call = vi.mocked(prisma.alertHistory.findMany).mock.calls[0][0]
    expect((call?.where as { ticker?: string })?.ticker).toBe('AAPL')
  })

  it('결과 rendering — 시간/kind 라벨/티커/상태/메시지 포함', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([
      {
        id: '1',
        firedAt: new Date('2026-07-08T02:30:00Z'),
        kind: 'drop',
        ticker: 'AAPL',
        price: 150,
        changePercent: -6.2,
        message: '🔴 AAPL 급락',
        deliveryStatus: 'sent',
        recipientCount: 1,
        errorMessage: null,
      },
    ] as never)

    const result = await listAlertHistory({})
    const text = result.content[0].text
    expect(text).toContain('🔴 급락')
    expect(text).toContain('[AAPL]')
    expect(text).toContain('전송')
    expect(text).toContain('🔴 AAPL 급락')
    expect(text).toContain('2026-07-08')
  })
})
