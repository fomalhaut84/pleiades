/**
 * Phase 37-B (#445) — 알림 재발송 dispatcher 회귀 테스트.
 *
 * 테스트 대상:
 *   - createRetryRateLimiter: cooldown 준수, reset, 시간 경과 후 재허용
 *   - buildRetryContext: 원본 shape 유지 + retriedFrom 마커, 원본 mutate 방지
 *   - redispatchAlert: chat 별 sendHtml 성공/실패 카운트, computeDeliveryStatus 매핑
 *   - persistRetryHistory: retriedFrom 포함 recordAlertHistory 호출
 *
 * NOTE: '../index' (getBot) 는 모듈 로드시 모든 command register 를 chain-import 하므로
 * env 미설정 테스트에서 crash 방지 위해 mock 필수. '@/lib/prisma' 도 마찬가지.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      createMany: vi.fn(),
    },
  },
}))
vi.mock('../../index', () => ({
  getBot: vi.fn(() => ({} as unknown)),
}))
vi.mock('@/bot/utils/telegram', () => ({
  sendHtml: vi.fn(),
}))

import {
  createRetryRateLimiter,
  RETRY_COOLDOWN_MS,
  buildRetryContext,
  redispatchAlert,
  persistRetryHistory,
  type RedispatchTargetRow,
} from '../alert-dispatcher'
import type { Bot } from 'grammy'
import { sendHtml } from '@/bot/utils/telegram'

describe('createRetryRateLimiter', () => {
  it('첫 시도는 항상 allowed', () => {
    const rl = createRetryRateLimiter()
    expect(rl.check('id-1', 1_000)).toEqual({ allowed: true, retryAfterMs: 0 })
  })

  it('markAttempt 후 cooldown 이내 시도는 blocked + retryAfter 계산', () => {
    const rl = createRetryRateLimiter(60_000) // 60s
    rl.markAttempt('id-1', 1_000)
    const r = rl.check('id-1', 30_000) // 29s 경과
    expect(r.allowed).toBe(false)
    expect(r.retryAfterMs).toBe(31_000)
  })

  it('cooldown 경과 후 다시 allowed', () => {
    const rl = createRetryRateLimiter(60_000)
    rl.markAttempt('id-1', 1_000)
    const r = rl.check('id-1', 61_001)
    expect(r).toEqual({ allowed: true, retryAfterMs: 0 })
  })

  it('cooldown 경계값 (정확히 cooldownMs 경과) 은 allowed', () => {
    const rl = createRetryRateLimiter(60_000)
    rl.markAttempt('id-1', 1_000)
    // 정확히 60_000 경과 → elapsed === cooldown → allowed
    const r = rl.check('id-1', 61_000)
    expect(r.allowed).toBe(true)
  })

  it('다른 id 는 독립적으로 추적', () => {
    const rl = createRetryRateLimiter(60_000)
    rl.markAttempt('id-1', 1_000)
    // id-2 는 mark 안됨 → 언제든 allowed
    expect(rl.check('id-2', 2_000).allowed).toBe(true)
    // id-1 은 여전히 blocked
    expect(rl.check('id-1', 2_000).allowed).toBe(false)
  })

  it('reset() 은 모든 트래킹 제거', () => {
    const rl = createRetryRateLimiter(60_000)
    rl.markAttempt('id-1', 1_000)
    rl.markAttempt('id-2', 1_500)
    rl.reset()
    expect(rl.check('id-1', 2_000).allowed).toBe(true)
    expect(rl.check('id-2', 2_000).allowed).toBe(true)
  })

  it('기본 cooldown = RETRY_COOLDOWN_MS (5분)', () => {
    expect(RETRY_COOLDOWN_MS).toBe(5 * 60 * 1000)
    const rl = createRetryRateLimiter()
    rl.markAttempt('x', 0)
    // 4분 59초 → blocked
    expect(rl.check('x', 4 * 60 * 1000 + 59_000).allowed).toBe(false)
    // 5분 → allowed
    expect(rl.check('x', 5 * 60 * 1000).allowed).toBe(true)
  })
})

describe('buildRetryContext', () => {
  it('object 원본 → spread + retriedFrom 마커 추가', () => {
    const original = { type: 'drop', price: 150, changePercent: -6.2, marketOpen: true }
    const ctx = buildRetryContext(original, 'orig-id', 'drop')
    expect(ctx).toMatchObject({
      type: 'drop', price: 150, changePercent: -6.2, marketOpen: true,
      retriedFrom: 'orig-id',
    })
  })

  it('원본 object 를 mutate 하지 않음 (spread 검증)', () => {
    const original = { type: 'drop', price: 150 }
    buildRetryContext(original, 'orig-id', 'drop')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect('retriedFrom' in original).toBe(false)
  })

  it('null 원본 → 최소 shape { type: kind, retriedFrom }', () => {
    const ctx = buildRetryContext(null, 'orig-id', 'surge')
    expect(ctx).toEqual({ type: 'surge', retriedFrom: 'orig-id' })
  })

  it('undefined 원본 → 최소 shape', () => {
    const ctx = buildRetryContext(undefined, 'orig-id', 'ta_signal')
    expect(ctx).toEqual({ type: 'ta_signal', retriedFrom: 'orig-id' })
  })

  it('scalar 원본 (string) → 최소 shape (object 아님을 감지)', () => {
    const ctx = buildRetryContext('legacy-json-string', 'orig-id', 'fx')
    expect(ctx).toEqual({ type: 'fx', retriedFrom: 'orig-id' })
  })

  it('원본이 이미 retry row 면 root id 를 유지 (chain 을 따라가지 않음, Codex #454 P2)', () => {
    // R0 (original id=first-orig) → R1 (retry, contextJson.retriedFrom=first-orig)
    // 이제 R1 을 다시 retry (parent id=second-orig) → R2 는 chain root 를 참조해야 함.
    // 그렇지 않으면 rate limiter 가 각 retry row 를 별도 그룹으로 취급 → cooldown 우회.
    const original = { type: 'drop', retriedFrom: 'first-orig' }
    const ctx = buildRetryContext(original, 'second-orig', 'drop')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx as any).retriedFrom).toBe('first-orig')
  })

  it('원본에 retriedFrom 이 string 이 아닌 값이면 fallback 으로 parent id 사용', () => {
    // 손상된 contextJson (retriedFrom 이 숫자·null 등) 에 대한 defense.
    const original = { type: 'drop', retriedFrom: 12345 }
    const ctx = buildRetryContext(original, 'parent-id', 'drop')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx as any).retriedFrom).toBe('parent-id')
  })
})

describe('redispatchAlert', () => {
  beforeEach(() => {
    vi.mocked(sendHtml).mockReset()
  })

  const fakeBot = {} as Bot
  const row = { message: '<b>hi</b>' }

  it('모든 chat 성공 → status=sent, successCount=totalChats', async () => {
    vi.mocked(sendHtml).mockResolvedValue(undefined as never)
    const res = await redispatchAlert(row, [1, 2, 3], fakeBot)
    expect(res.status).toBe('sent')
    expect(res.successCount).toBe(3)
    expect(res.totalChats).toBe(3)
    expect(res.lastError).toBeUndefined()
    expect(sendHtml).toHaveBeenCalledTimes(3)
    expect(sendHtml).toHaveBeenNthCalledWith(1, fakeBot, 1, '<b>hi</b>')
  })

  it('모든 chat 실패 → status=failed, lastError 세팅', async () => {
    vi.mocked(sendHtml).mockRejectedValue(new Error('네트워크 오류'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await redispatchAlert(row, [1, 2], fakeBot)
    expect(res.status).toBe('failed')
    expect(res.successCount).toBe(0)
    expect(res.lastError).toBe('네트워크 오류')
    errSpy.mockRestore()
  })

  it('일부 실패 → status=partial', async () => {
    vi.mocked(sendHtml)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('403'))
      .mockResolvedValueOnce(undefined as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await redispatchAlert(row, [1, 2, 3], fakeBot)
    expect(res.status).toBe('partial')
    expect(res.successCount).toBe(2)
    expect(res.lastError).toBe('403')
    errSpy.mockRestore()
  })

  it('빈 chatIds → status=failed, totalChats=0, sendHtml 미호출', async () => {
    const res = await redispatchAlert(row, [], fakeBot)
    expect(res.status).toBe('failed')
    expect(res.totalChats).toBe(0)
    expect(res.successCount).toBe(0)
    expect(sendHtml).not.toHaveBeenCalled()
  })

  it('Error 아닌 예외 (문자열) 도 lastError 로 캐치', async () => {
    vi.mocked(sendHtml).mockRejectedValue('string-error')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await redispatchAlert(row, [1], fakeBot)
    expect(res.lastError).toBe('string-error')
    errSpy.mockRestore()
  })
})

describe('persistRetryHistory', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockReset()
  })

  const originalRow: RedispatchTargetRow = {
    id: 'orig-id-1',
    kind: 'drop',
    ticker: 'AAPL',
    price: 150,
    changePercent: -6.2,
    message: 'AAPL 급락',
    contextJson: { type: 'drop', price: 150, changePercent: -6.2, marketOpen: true },
  }

  it('성공 결과 → recordAlertHistory 에 retriedFrom 포함 context 로 저장', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockResolvedValueOnce({ count: 1 } as never)

    await persistRetryHistory(originalRow, {
      successCount: 2, totalChats: 2, status: 'sent', lastError: undefined,
    })

    expect(prisma.alertHistory.createMany).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.alertHistory.createMany).mock.calls[0][0]!
    const data = call.data as Array<Record<string, unknown>>
    expect(data[0]).toMatchObject({
      kind: 'drop', ticker: 'AAPL', price: 150, changePercent: -6.2,
      message: 'AAPL 급락', deliveryStatus: 'sent', recipientCount: 2,
    })
    // context 안에 retriedFrom 마커
    expect(data[0].contextJson).toMatchObject({
      type: 'drop', retriedFrom: 'orig-id-1',
    })
    // 성공 이력에는 errorMessage 없음
    expect(data[0].errorMessage).toBeNull()
  })

  it('실패 결과 → errorMessage 저장, status=failed', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockResolvedValueOnce({ count: 1 } as never)

    await persistRetryHistory(originalRow, {
      successCount: 0, totalChats: 2, status: 'failed', lastError: '네트워크 오류',
    })

    const call = vi.mocked(prisma.alertHistory.createMany).mock.calls[0][0]!
    const data = call.data as Array<Record<string, unknown>>
    expect(data[0].deliveryStatus).toBe('failed')
    expect(data[0].errorMessage).toBe('네트워크 오류')
  })

  it('원본 context 가 null 인 legacy row 도 최소 shape 로 저장', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.createMany).mockResolvedValueOnce({ count: 1 } as never)

    await persistRetryHistory(
      { ...originalRow, contextJson: null },
      { successCount: 1, totalChats: 1, status: 'sent', lastError: undefined },
    )

    const call = vi.mocked(prisma.alertHistory.createMany).mock.calls[0][0]!
    const data = call.data as Array<Record<string, unknown>>
    expect(data[0].contextJson).toMatchObject({
      type: 'drop', retriedFrom: 'orig-id-1',
    })
  })
})
