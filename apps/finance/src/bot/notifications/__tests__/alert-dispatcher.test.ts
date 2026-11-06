/**
 * Phase 37-B (#445) — 알림 재발송 dispatcher 회귀 테스트.
 *
 * 테스트 대상:
 *   - createRetryRateLimiter: cooldown 준수, reset, 시간 경과 후 재허용
 *   - buildRetryContext: 원본 shape 유지 + retriedFrom 마커, 원본 mutate 방지
 *   - redispatchAlert: #finance 웹훅 재발송 · 저장 본문 escape → Discord 마크다운 (pleiades#136 · 009 D-5 B4 R11)
 *   - persistRetryHistory: retriedFrom 포함 recordAlertHistory 호출
 *
 * NOTE: '@/lib/prisma' 는 env 미설정 테스트에서 crash 방지 위해 mock 필수.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      createMany: vi.fn(),
    },
  },
}))
vi.mock('@/bot/utils/html', () => ({
  // Codex #462 P2: redispatchAlert 이 escapeHtml 을 호출하므로 mock 도 노출 필요.
  // 실제 로직 (`&` → `&amp;` 등) 을 그대로 replay 해 회귀 테스트가 정확한 escape
  // 결과를 assert 할 수 있게 함.
  escapeHtml: (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}))

import {
  createRetryRateLimiter,
  RETRY_COOLDOWN_MS,
  buildRetryContext,
  redispatchAlert,
  persistRetryHistory,
  type RedispatchTargetRow,
} from '../alert-dispatcher'

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
  // pleiades 009 D-5 B4 (pleiades#512): 수신자는 #finance 웹훅 하나(DISCORD_WEBHOOK_FINANCE) — 옛 채널 env 는 읽지 않는다.
  // 전송은 @pleiades/notify DiscordTransport → fetch. 재시도는 네트워크 오류(코드 있는 연결 실패)에서만이라
  // 아래 오류들('네트워크 오류' · 403 · 문자열)은 즉시 실패로 집계된다(실제 sleep 없음).
  // 여러 대상의 부분 실패(partial · 마지막 실패 lastError)는 대상이 하나라 이 경로에 없다 —
  // 매핑은 alert-history.test(computeDeliveryStatus) · notifier.test(lastErrorOf)가 덮는다.
  const WEBHOOK = 'https://discord.com/api/webhooks/1/fin-token'
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>()
  const okResponse = { ok: true, status: 200, json: async () => ({ id: 'd1' }), text: async () => '' }

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(okResponse)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', WEBHOOK)
    // 옛 채널 env 가 남아 있어도 읽지 않는다(서버 .env 잔여 · 009 §5-2)
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:x')
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '1,2,3')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // Codex #462 P2: 저장된 message 는 plain-text 요약. HTML metacharacter (`<`, `>`, `&`) 가 있는 이름
  // (예: `SOXL < 40`) 이 마크업으로 해석되지 않게 redispatchAlert 는 escape 후 HTML 로 넘긴다.
  // Codex #463 P2 (2차): kind 기반 gating — raw kind (custom_strategy 등) 는 그대로
  // escape, pre-escaped kind (target_hit 등) 는 decode 후 재escape 로 round-trip.
  // 009 D-5 B4 R11: HTML → Discord 마크다운 변환(`discord-md`)을 거친 웹훅 본문으로 확인한다.
  const row = { message: '<b>hi</b>', kind: 'custom_strategy' }
  // `<` 는 Discord 마크다운에서 `\<` 로 escape 된다(멘션·링크 문법 차단 · 화면에는 `<` 로 보인다)
  const sentContent = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body).content as string

  it('웹훅 성공 → status=sent, successCount=totalChats=1. 태그는 마크업이 아니라 글자로 간다', async () => {
    const res = await redispatchAlert(row)
    expect(res).toEqual({ successCount: 1, totalChats: 1, status: 'sent', lastError: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${WEBHOOK}?wait=true`)
    // raw `<b>hi</b>` 가 굵게(`**hi**`)로 바뀌지 않는다 (Codex #462 P2)
    expect(sentContent()).toBe('\\<b>hi\\</b>')
  })

  // Codex #462 P2 회귀 방지 — 사용자 입력 (custom strategy name 등) 의 HTML metacharacter 를 원문 그대로
  it('raw kind + HTML metacharacter → 원문 문자 그대로 표시', async () => {
    const dangerous = { message: 'SOXL < 40 & QQQ > 500 (사용자 & 이름)', kind: 'custom_strategy' }
    await redispatchAlert(dangerous)
    expect(sentContent()).toBe('SOXL \\< 40 & QQQ > 500 (사용자 & 이름)')
  })

  // Codex #463 P2 (1차) 회귀 방지 — pre-escaped kind (target_hit 등) 는 decode→escape
  // round-trip 으로 double-encode 방지. 009 D-5 B4 R11: 옛 HTML 저장분이 Discord 에 entity 째 보이지 않는다.
  it('pre-escaped kind (target_hit) — 옛 HTML 저장분이 entity 없이 원래 문자로', async () => {
    const preEscaped = {
      message: '🎯 A &amp; B (AAPL) 목표가 도달: 100 (목표 &lt;100&gt;)',
      kind: 'target_hit',
    }
    await redispatchAlert(preEscaped)
    expect(sentContent()).toBe('🎯 A & B (AAPL) 목표가 도달: 100 (목표 \\<100>)')
  })

  // Codex #463 P2 (2차) 회귀 방지 — raw kind 에서 사용자가 literal `&amp;` 를 이름에
  // 넣었으면 decode 하지 않고 그대로 escape 해야 원본 문자 (`&amp;` 리터럴) 보존.
  it('raw kind + literal HTML entity (custom_strategy 이름) → decode 하지 않음', async () => {
    const literalEntity = { message: 'A &amp; B 전략 (AAPL) — AND 조건 만족', kind: 'custom_strategy' }
    await redispatchAlert(literalEntity)
    expect(sentContent()).toBe('A &amp; B 전략 (AAPL) — AND 조건 만족')
  })

  // 009 D-5 B4 R11: 마크다운 문자는 Discord 에서 서식이 되지 않게 escape 된다
  it('마크다운 문자(* _ `)는 escape 돼 서식이 되지 않는다', async () => {
    await redispatchAlert({ message: '*TQQQ* _급락_ `-5%`', kind: 'drop' })
    expect(sentContent()).toBe('\\*TQQQ\\* \\_급락\\_ \\`-5%\\`')
  })

  it('웹훅 거부(403) → status=failed, lastError 세팅', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'Missing Access' }), text: async () => '' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await redispatchAlert(row)
    expect(res.status).toBe('failed')
    expect(res.successCount).toBe(0)
    expect(res.totalChats).toBe(1)
    expect(res.lastError).toMatch(/^Discord webhook 응답 403/)
    errSpy.mockRestore()
  })

  it('연결 실패(코드 없는 오류) → 재시도 없이 failed, lastError = 원문', async () => {
    fetchMock.mockRejectedValue(new Error('네트워크 오류'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await redispatchAlert(row)
    expect(res.status).toBe('failed')
    expect(res.lastError).toBe('네트워크 오류')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('웹훅 비어 있음 → status=failed, totalChats=0, 전송 없음 · 옛 채널 env 가 있어도', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
    const res = await redispatchAlert(row)
    expect(res.status).toBe('failed')
    expect(res.totalChats).toBe(0)
    expect(res.successCount).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Error 아닌 예외 (문자열) 도 lastError 로 캐치', async () => {
    fetchMock.mockRejectedValue('string-error')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await redispatchAlert(row)
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
