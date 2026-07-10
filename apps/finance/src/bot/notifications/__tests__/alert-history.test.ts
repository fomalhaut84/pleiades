import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computeDeliveryStatus, recordAlertHistory } from '../alert-history'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      createMany: vi.fn(),
    },
  },
}))

describe('computeDeliveryStatus', () => {
  it('total <= 0 → failed (수신자 없는 이벤트는 실질 미발송)', () => {
    expect(computeDeliveryStatus(0, 0)).toBe('failed')
    expect(computeDeliveryStatus(0, -1)).toBe('failed')
  })

  it('전원 성공 → sent', () => {
    expect(computeDeliveryStatus(3, 3)).toBe('sent')
  })

  it('전원 실패 → failed', () => {
    expect(computeDeliveryStatus(0, 3)).toBe('failed')
  })

  it('일부 성공 → partial', () => {
    expect(computeDeliveryStatus(1, 3)).toBe('partial')
    expect(computeDeliveryStatus(2, 3)).toBe('partial')
  })

  it('successCount > total 도 sent (방어)', () => {
    // 상위 로직이 잘못 세어도 최소 sent 판정 유지
    expect(computeDeliveryStatus(5, 3)).toBe('sent')
  })
})

describe('recordAlertHistory', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockReset()
  })

  it('빈 events 는 no-op (createMany 호출 없음)', async () => {
    const { prisma } = await import('@/lib/prisma')
    await recordAlertHistory([], 'sent', 0)
    expect(prisma.alertHistory.createMany).not.toHaveBeenCalled()
  })

  it('event 들을 kind/ticker/message 그대로 매핑하여 createMany 호출', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockResolvedValueOnce({ count: 2 } as never)

    await recordAlertHistory(
      [
        { kind: 'drop', ticker: 'AAPL', price: 150, changePercent: -6.2, message: '🔴 AAPL 급락' },
        { kind: 'fx', ticker: 'USDKRW=X', price: 1330, message: '💱 환율 상승' },
      ],
      'sent',
      2,
    )

    expect(prisma.alertHistory.createMany).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.alertHistory.createMany).mock.calls[0][0]!
    const data = call.data as Array<Record<string, unknown>>
    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({
      kind: 'drop', ticker: 'AAPL', price: 150, changePercent: -6.2,
      message: '🔴 AAPL 급락', deliveryStatus: 'sent', recipientCount: 2,
    })
    expect(data[1]).toMatchObject({
      kind: 'fx', ticker: 'USDKRW=X', price: 1330,
      message: '💱 환율 상승', deliveryStatus: 'sent', recipientCount: 2,
    })
  })

  it('선택 필드 미지정 시 null 로 저장', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockResolvedValueOnce({ count: 1 } as never)

    await recordAlertHistory(
      [{ kind: 'ta_signal', message: '📊 시그널' }],
      'partial',
      3,
      '네트워크 오류',
    )

    const call = vi.mocked(prisma.alertHistory.createMany).mock.calls[0][0]!
    const data = call.data as Array<Record<string, unknown>>
    expect(data[0]).toMatchObject({
      kind: 'ta_signal', ticker: null, price: null, changePercent: null,
      deliveryStatus: 'partial', recipientCount: 3, errorMessage: '네트워크 오류',
    })
  })

  it('Prisma 실패는 삼키고 예외 전파 X (알림 흐름 유지)', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockRejectedValueOnce(new Error('DB down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      recordAlertHistory([{ kind: 'surge', message: 'x' }], 'sent', 1),
    ).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
