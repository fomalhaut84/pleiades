/**
 * Phase 37-B (#445) — 재발송 route 회귀 테스트.
 *
 * 커버리지:
 *  - 실패 row 만 재발송 허용
 *  - Rate limit (동일 원본 5분내 재시도 금지)
 *  - **Retry-of-retry cooldown key 통합** (Codex #454 P2) —
 *    dispatcher 가 chain root 를 propagate 하므로 route 는 한 단계만 lookup 하면 됨.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/bot/notifications/alert-dispatcher', async () => {
  const actual = await vi.importActual<
    typeof import('@/bot/notifications/alert-dispatcher')
  >('@/bot/notifications/alert-dispatcher')
  return {
    ...actual,
    // 실제 rate limiter 를 유지 (테스트에서 reset). redispatchAlert 만 spy.
    redispatchAlert: vi.fn(async () => ({
      successCount: 0,
      totalChats: 1,
      status: 'failed' as const,
      lastError: 'mocked',
    })),
    persistRetryHistory: vi.fn(async () => undefined),
  }
})

describe('POST /api/alerts/history/[id]/retry', () => {
  const OLD_ENV = process.env.TELEGRAM_ALLOWED_CHAT_IDS

  beforeEach(async () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '111'
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findUnique).mockReset()

    // 매 테스트 전 rate limiter 리셋 (프로세스 in-memory 라 테스트 간 공유됨).
    const { globalRetryLimiter } = await import('@/bot/notifications/alert-dispatcher')
    globalRetryLimiter.reset()
  })

  afterEach(() => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = OLD_ENV
  })

  const buildReq = () => new Request('http://x/api/alerts/history/x/retry', { method: 'POST' })

  it('실패가 아닌 row 는 400', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findUnique).mockResolvedValueOnce({
      id: 'a1',
      deliveryStatus: 'sent',
      kind: 'drop',
      ticker: 'AAPL',
      price: 150,
      changePercent: -6,
      message: 'x',
      contextJson: null,
    } as never)

    const { POST } = await import('../route')
    const res = await POST(buildReq() as never, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(400)
  })

  it('없는 row → 404', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findUnique).mockResolvedValueOnce(null as never)

    const { POST } = await import('../route')
    const res = await POST(buildReq() as never, { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('같은 원본 두 번 → 두번째는 429 (cooldown)', async () => {
    const { prisma } = await import('@/lib/prisma')
    const row = {
      id: 'a1',
      deliveryStatus: 'failed',
      kind: 'drop',
      ticker: 'AAPL',
      price: 150,
      changePercent: -6,
      message: 'x',
      contextJson: null,
    }
    vi.mocked(prisma.alertHistory.findUnique).mockResolvedValue(row as never)

    const { POST } = await import('../route')
    const res1 = await POST(buildReq() as never, { params: Promise.resolve({ id: 'a1' }) })
    expect(res1.status).toBe(200)

    const res2 = await POST(buildReq() as never, { params: Promise.resolve({ id: 'a1' }) })
    expect(res2.status).toBe(429)
  })

  // Codex #454 P2 회귀 방지 — retry row 를 다시 retry 해도 cooldown 이 원본 기준으로 잡혀야 함.
  it('retry-of-retry: contextJson.retriedFrom 이 있는 row 는 원본 id 로 cooldown 잡힘', async () => {
    const { prisma } = await import('@/lib/prisma')

    // 1. 먼저 원본 (id=orig) 재발송 → cooldown 시작
    const original = {
      id: 'orig',
      deliveryStatus: 'failed',
      kind: 'drop',
      ticker: 'AAPL',
      price: 150,
      changePercent: -6,
      message: 'x',
      contextJson: null,
    }
    vi.mocked(prisma.alertHistory.findUnique).mockResolvedValueOnce(original as never)

    const { POST } = await import('../route')
    const res1 = await POST(buildReq() as never, { params: Promise.resolve({ id: 'orig' }) })
    expect(res1.status).toBe(200)

    // 2. dispatcher 가 저장했을 새 retry row (id=retry1, retriedFrom=orig) 를 다시 UI 가 retry
    const retry1 = {
      id: 'retry1',
      deliveryStatus: 'failed',
      kind: 'drop',
      ticker: 'AAPL',
      price: 150,
      changePercent: -6,
      message: 'x',
      contextJson: { type: 'drop', retriedFrom: 'orig' },
    }
    vi.mocked(prisma.alertHistory.findUnique).mockResolvedValueOnce(retry1 as never)

    // 원본과 동일 cooldown 그룹 → 429 (id 가 다르지만 root=orig 로 cooldown 걸림)
    const res2 = await POST(buildReq() as never, { params: Promise.resolve({ id: 'retry1' }) })
    expect(res2.status).toBe(429)
  })

  it('다른 원본은 별도 cooldown', async () => {
    const { prisma } = await import('@/lib/prisma')

    const rowA = {
      id: 'A',
      deliveryStatus: 'failed',
      kind: 'drop',
      ticker: 'AAPL',
      price: 1,
      changePercent: 0,
      message: 'a',
      contextJson: null,
    }
    const rowB = {
      id: 'B',
      deliveryStatus: 'failed',
      kind: 'drop',
      ticker: 'MSFT',
      price: 1,
      changePercent: 0,
      message: 'b',
      contextJson: null,
    }
    vi.mocked(prisma.alertHistory.findUnique)
      .mockResolvedValueOnce(rowA as never)
      .mockResolvedValueOnce(rowB as never)

    const { POST } = await import('../route')
    expect((await POST(buildReq() as never, { params: Promise.resolve({ id: 'A' }) })).status).toBe(200)
    expect((await POST(buildReq() as never, { params: Promise.resolve({ id: 'B' }) })).status).toBe(200)
  })

  it('chat 목록이 비어있으면 500 (cooldown 미마킹 — 환경변수 재설정 후 즉시 재시도 가능)', async () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = ''
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findUnique).mockResolvedValue({
      id: 'a1',
      deliveryStatus: 'failed',
      kind: 'drop',
      ticker: 'AAPL',
      price: 1,
      changePercent: 0,
      message: 'x',
      contextJson: null,
    } as never)

    const { POST } = await import('../route')
    const res = await POST(buildReq() as never, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(500)

    // 환경변수 복구 후 즉시 재시도 → cooldown 안걸림 → 200
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '111'
    const res2 = await POST(buildReq() as never, { params: Promise.resolve({ id: 'a1' }) })
    expect(res2.status).toBe(200)
  })
})
