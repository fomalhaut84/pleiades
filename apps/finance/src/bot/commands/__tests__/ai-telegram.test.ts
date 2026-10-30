/**
 * pleiades 009 D-3 PR-1b (pleiades#385) — AI 대화 · AI 거래 파싱 · `aitrade:` · `/ai` · `/reset` 텔레그램 특성 테스트.
 *
 * 판단 분리(설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 H2 · B · Q · S) **전** 코드에서 먼저 통과시키고, 분리 뒤에도 그대로 통과해야 한다.
 * 기준은 **grammY 호출열 동등**(이름 · 인자 · 순서). typing 은 타이머라 calls 줄 밖에서 센다.
 * 덮는 지점: T8 AI 거래 JSON 해석 · T9 `aitrade:` · T10 AI fallback 분기 · T13 동시 1건·세션·`/reset` · T14 분할·HTML 폴백 ·
 * T17 `aitrade:` 의 `from` 없음 = 거부 · T18 fire-and-forget 오류 안내.
 * "현재 동작" 이라 적은 테스트는 서비스 유래 결함을 그대로 고정한다(UQ-3 — 고칠 때 별도 커밋).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    priceCache: { findUnique: vi.fn(), findMany: vi.fn() },
    holding: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/trade-service', () => ({ createTrade: vi.fn() }))
// 오류 클래스·안내 문구는 진짜를 쓰고 호출만 대체한다(advisor 호출 0)
vi.mock('@/lib/ai/claude-advisor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/claude-advisor')>()),
  askAdvisor: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { createTrade } from '@/lib/trade-service'
import { askAdvisor, AdvisorError, AdvisorTimeoutError, describeAdvisorError } from '@/lib/ai/claude-advisor'
import { registerAiCommands, registerAiFallback } from '../ai'
import { splitMessage } from '../../utils/formatter'
import { markdownToTelegramHtml } from '../../utils/markdown'
import { buildTickerCheckLines } from '../../utils/trade-price-check'
import { captureBot, fakeCtx, flush, replyButtons, rowsOf, type FakeCtxOptions } from './telegram-fake'

const mocked = {
  accounts: vi.mocked(prisma.account.findMany),
  priceFind: vi.mocked(prisma.priceCache.findUnique),
  priceMany: vi.mocked(prisma.priceCache.findMany),
  holdingFirst: vi.mocked(prisma.holding.findFirst),
  createTrade: vi.mocked(createTrade),
  ask: vi.mocked(askAdvisor),
}

const commands = captureBot(registerAiCommands)
const fallbacks = captureBot(registerAiFallback)
const aiCommand = commands.commands.find((c) => c.name === 'ai')!
const resetCommand = commands.commands.find((c) => c.name === 'reset')!
const callback = commands.on[0]
const fallback = fallbacks.on[0]

const FORMAT_HINT = '"매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.'
const TRADE_TEXT = '세진 삼성전자 10주 샀어'
const ACCOUNT = { id: 'a1', name: '세진' }
const AAPL = { ticker: 'AAPL', displayName: 'Apple', market: 'NASDAQ', currency: 'USD', price: 150, quoteName: 'Apple Inc.' }
const SAMSUNG = { ticker: '005930.KS', displayName: '삼성전자', market: 'KOSPI', currency: 'KRW', price: 70000, quoteName: 'Samsung' }
const FX = { ticker: 'USDKRW=X', price: 1300 }

// 대화 상태(세션·busy)는 모듈 전역이고 chat 단위다 — 테스트마다 새 chat 을 쓴다
let nextChatId = 5000
const freshChat = () => nextChatId++

async function say(text: string, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text, ...opts })
  await fallback.handler(f.ctx, vi.fn())
  return f
}

async function runCommand(cmd: typeof aiCommand, match: string | undefined, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text: '/x', match, ...opts })
  await cmd.handler(f.ctx, vi.fn())
  return f
}

async function press(data: string, messageId: number | null, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ data, messageId, ...opts })
  const next = vi.fn(async () => undefined)
  await callback.handler(f.ctx, next)
  return { ...f, next }
}

/** priceCache.findUnique 를 ticker 별로 답한다. */
function priceTable(table: Record<string, unknown>) {
  mocked.priceFind.mockImplementation((async (args: { where: { ticker: string } }) => table[args.where.ticker] ?? null) as never)
}

/** AI 거래 파싱 — advisor 가 `response` 를 돌려준 뒤까지. */
async function parseTrade(response: string, opts: FakeCtxOptions = {}) {
  mocked.ask.mockResolvedValueOnce({ response } as never)
  const f = await say(TRADE_TEXT, opts)
  await flush()
  return f
}

/** 삼성전자 10주 70000원 매수 확인 메시지까지 — 버튼 data 와 메시지 id. */
async function startAiTrade(opts: FakeCtxOptions = {}) {
  mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
  priceTable({ '005930.KS': SAMSUNG })
  const f = await parseTrade(
    '{"type":"BUY","accountName":"세진","ticker":"005930.KS","displayName":"삼성전자","shares":10,"price":70000,"currency":"KRW"}',
    opts,
  )
  const data = replyButtons(f.calls, 1)
  return { tradeId: data[0].split(':')[2], messageId: f.sentIds[1], f }
}

/** 끝나지 않는 advisor 호출. */
function hangingAsk() {
  mocked.ask.mockImplementationOnce(() => new Promise(() => undefined) as never)
}

beforeEach(() => {
  for (const m of Object.values(mocked)) m.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => vi.useRealTimers())

describe('등록', () => {
  it('명령 ai · reset · 콜백 on 하나 · fallback on message:text', () => {
    expect(commands.commands.map((c) => c.name)).toEqual(['ai', 'reset'])
    expect(commands.on.map((x) => x.filter)).toEqual(['callback_query:data'])
    expect(fallbacks.on.map((x) => x.filter)).toEqual(['message:text'])
  })
})

describe('T10 AI fallback 분기', () => {
  it('/ 로 시작하면 무시', async () => {
    const f = await say('/foo 분석해줘')
    expect(f.calls).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('trim 뒤 3자 미만이면 무시', async () => {
    const f = await say('  a?  ')
    expect(f.calls).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('거래 키워드 → AI 거래 파싱(질문 키워드보다 먼저)', async () => {
    hangingAsk()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const text = '세진 10주 샀어?'
    const f = await say(text)
    expect(f.calls).toEqual([['reply', '📝 거래 정보 파싱 중...']])
    expect(mocked.ask).toHaveBeenCalledTimes(1)
    expect(mocked.ask.mock.calls[0][0]).toMatch(/^다음 자연어 메시지에서 주식 거래 정보를 추출하세요/)
    expect(mocked.ask.mock.calls[0][0].endsWith(`메시지: ${text}`)).toBe(true)
    expect(mocked.ask.mock.calls[0][1]).toStrictEqual({ intent: 'parse', caller: 'bot:trade_parse' })
  })

  it('질문 키워드 → AI 대화', async () => {
    hangingAsk()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const f = await say('포트폴리오 분석 해줘', { chatId: freshChat() })
    expect(f.calls).toEqual([['reply', '🤔 생각 중...']])
    expect(mocked.ask).toHaveBeenCalledWith('포트폴리오 분석 해줘', {
      sessionId: undefined,
      persist: true,
      intent: 'conversation',
      caller: 'bot:ai_chat',
    })
  })

  it('둘 다 아니면 무응답', async () => {
    const f = await say('그냥 메모 하나')
    expect(f.calls).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })
})

describe('T13 /ai · /reset · 동시 1건 · 세션', () => {
  it('/ai 인자 없음 → 사용법', async () => {
    const f = await runCommand(aiCommand, '  ')
    expect(f.calls).toEqual([
      [
        'reply',
        '🤖 AI 어드바이저에게 질문하세요.\n\n' +
          '사용법: /ai 전체 포트폴리오 현황 분석해줘\n' +
          '또는 그냥 자연어로 질문하면 됩니다.\n\n' +
          '거래 입력도 가능합니다:\n' +
          '"소담 TIGER S&P500 10주 24900원에 샀어"',
      ],
    ])
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('/ai 인자 → trim 해서 AI 대화(키워드 없어도)', async () => {
    mocked.ask.mockResolvedValueOnce({ response: '답' } as never)
    const f = await runCommand(aiCommand, '  안녕  ', { chatId: freshChat() })
    await flush()
    expect(mocked.ask.mock.calls[0][0]).toBe('안녕')
    expect(f.calls).toEqual([
      ['reply', '🤔 생각 중...'],
      ['reply', markdownToTelegramHtml('답'), { parse_mode: 'HTML' }],
    ])
  })

  it('같은 chat 2연속 → 두 번째는 처리 중 안내 · advisor 1회', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    hangingAsk()
    const chatId = freshChat()
    await say('이거 어때?', { chatId })
    const second = await say('저건 어때?', { chatId })
    expect(second.calls).toEqual([['reply', '⏳ 이전 질문을 처리 중입니다. 잠시 후 다시 시도해주세요.']])
    expect(mocked.ask).toHaveBeenCalledTimes(1)
  })

  it('다른 chat 은 막지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    hangingAsk()
    hangingAsk()
    await say('이거 어때?', { chatId: freshChat() })
    const other = await say('저건 어때?', { chatId: freshChat() })
    expect(other.calls).toEqual([['reply', '🤔 생각 중...']])
    expect(mocked.ask).toHaveBeenCalledTimes(2)
  })

  it('끝나면 busy 해제 · 세션 id 를 다음 질문에 넘긴다', async () => {
    const chatId = freshChat()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's1' } as never)
    await say('하나 어때?', { chatId })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '2', sessionId: 's1' } as never)
    const f = await say('둘 어때?', { chatId })
    await flush()
    expect(mocked.ask.mock.calls[1][1]).toMatchObject({ sessionId: 's1' })
    expect(f.calls[0]).toEqual(['reply', '🤔 생각 중...'])
  })

  it('세션은 24 h 미사용이면 지워진다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    const chatId = freshChat()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's-old' } as never)
    await say('하나 어때?', { chatId })
    await flush()
    vi.setSystemTime(new Date('2026-10-31T00:00:01Z'))
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    await say('둘 어때?', { chatId })
    await flush()
    expect(mocked.ask.mock.calls[1][1]).toMatchObject({ sessionId: undefined })
  })

  it('세션이 없는 응답은 기존 세션을 바꾸지 않는다', async () => {
    const chatId = freshChat()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's1' } as never)
    await say('하나 어때?', { chatId })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    await say('둘 어때?', { chatId })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '3' } as never)
    await say('셋 어때?', { chatId })
    await flush()
    expect(mocked.ask.mock.calls[2][1]).toMatchObject({ sessionId: 's1' })
  })

  it('/reset → 안내 · 다음 질문은 새 세션', async () => {
    const chatId = freshChat()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's1' } as never)
    await say('하나 어때?', { chatId })
    await flush()
    const r = await runCommand(resetCommand, undefined, { chatId })
    expect(r.calls).toEqual([['reply', '🔄 AI 대화 세션이 초기화되었습니다.']])
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    await say('둘 어때?', { chatId })
    await flush()
    expect(mocked.ask.mock.calls[1][1]).toMatchObject({ sessionId: undefined })
  })

  it('/reset 은 그 chat 세션만 지운다', async () => {
    const a = freshChat()
    const b = freshChat()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 'sa' } as never)
    await say('하나 어때?', { chatId: a })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 'sb' } as never)
    await say('하나 어때?', { chatId: b })
    await flush()
    await runCommand(resetCommand, undefined, { chatId: a })
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    await say('둘 어때?', { chatId: b })
    await flush()
    expect(mocked.ask.mock.calls[2][1]).toMatchObject({ sessionId: 'sb' })
  })

  it('chat 없음 → /reset · AI 대화 모두 무응답', async () => {
    const r = fakeCtx({ text: '/reset' })
    ;(r.ctx as { chat?: unknown }).chat = undefined
    await resetCommand.handler(r.ctx, vi.fn())
    expect(r.calls).toEqual([])

    const q = fakeCtx({ text: '이거 어때?' })
    ;(q.ctx as { chat?: unknown }).chat = undefined
    await fallback.handler(q.ctx, vi.fn())
    expect(q.calls).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })
})

describe('T14 AI 대화 응답 — 분할 · 조각별 HTML · 실패 시 원문', () => {
  const longResponse = `**첫째** & <x>\n${'가'.repeat(3000)}\n${'나'.repeat(3000)}`

  it('조각마다 markdown → HTML 로 보낸다', async () => {
    mocked.ask.mockResolvedValueOnce({ response: longResponse } as never)
    const f = await say('길게 설명해줘?', { chatId: freshChat() })
    await flush()
    const chunks = splitMessage(longResponse)
    expect(chunks.length).toBe(2)
    expect(f.calls).toEqual([
      ['reply', '🤔 생각 중...'],
      ...chunks.map((c) => ['reply', markdownToTelegramHtml(c), { parse_mode: 'HTML' }]),
    ])
  })

  it('HTML 전송이 실패한 조각만 원문으로 다시 보낸다', async () => {
    mocked.ask.mockResolvedValueOnce({ response: longResponse } as never)
    const f = fakeCtx({ text: '길게 설명해줘?', chatId: freshChat() })
    const original = f.ctx.reply.getMockImplementation()!
    let htmlTries = 0
    f.ctx.reply.mockImplementation(async (...args: unknown[]) => {
      const sent = await original(...args)
      if ((args[1] as { parse_mode?: string } | undefined)?.parse_mode === 'HTML' && htmlTries++ === 0) {
        throw new Error('Bad Request: can\'t parse entities')
      }
      return sent
    })
    await fallback.handler(f.ctx, vi.fn())
    await flush()
    const chunks = splitMessage(longResponse)
    expect(f.calls).toEqual([
      ['reply', '🤔 생각 중...'],
      ['reply', markdownToTelegramHtml(chunks[0]), { parse_mode: 'HTML' }],
      ['reply', chunks[0]],
      ['reply', markdownToTelegramHtml(chunks[1]), { parse_mode: 'HTML' }],
    ])
  })
})

describe('T18 fire-and-forget 오류 안내 · typing', () => {
  it('대화 — 시간 초과', async () => {
    mocked.ask.mockRejectedValueOnce(new AdvisorTimeoutError(60000))
    const f = await say('이거 어때?', { chatId: freshChat() })
    await flush()
    expect(f.calls).toEqual([
      ['reply', '🤔 생각 중...'],
      ['reply', '⚠️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'],
    ])
  })

  it('대화 — AdvisorError 는 code 별 안내 · detail 은 로그로만', async () => {
    const err = new AdvisorError('x', 'stderr tail', 'quota_exceeded')
    mocked.ask.mockRejectedValueOnce(err)
    const f = await say('이거 어때?', { chatId: freshChat() })
    await flush()
    expect(f.calls).toEqual([
      ['reply', '🤔 생각 중...'],
      ['reply', describeAdvisorError(err)],
    ])
    expect(console.error).toHaveBeenCalledWith('[bot] AI advisor detail (quota_exceeded): stderr tail')
  })

  it('대화 — 그 외 오류', async () => {
    mocked.ask.mockRejectedValueOnce(new Error('boom'))
    const f = await say('이거 어때?', { chatId: freshChat() })
    await flush()
    expect(f.calls).toEqual([
      ['reply', '🤔 생각 중...'],
      ['reply', '⚠️ AI 질문 처리에 실패했습니다.'],
    ])
  })

  it('대화 — 오류 안내 전송까지 실패해도 busy 는 풀린다', async () => {
    const chatId = freshChat()
    mocked.ask.mockRejectedValueOnce(new Error('boom'))
    const f = fakeCtx({ text: '이거 어때?', chatId })
    const original = f.ctx.reply.getMockImplementation()!
    f.ctx.reply.mockImplementation(async (...args: unknown[]) => {
      const sent = await original(...args)
      if (args[0] === '⚠️ AI 질문 처리에 실패했습니다.') throw new Error('send fail')
      return sent
    })
    await fallback.handler(f.ctx, vi.fn())
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: 'ok' } as never)
    const again = await say('다시 어때?', { chatId })
    expect(again.calls[0]).toEqual(['reply', '🤔 생각 중...'])
    expect(mocked.ask).toHaveBeenCalledTimes(2)
  })

  it('거래 파싱 — 시간 초과', async () => {
    mocked.ask.mockRejectedValueOnce(new AdvisorTimeoutError(60000))
    const f = await say(TRADE_TEXT)
    await flush()
    expect(f.calls).toEqual([
      ['reply', '📝 거래 정보 파싱 중...'],
      ['reply', `⚠️ 파싱 시간이 초과되었습니다. ${FORMAT_HINT}`],
    ])
  })

  it('거래 파싱 — 그 외 오류(해석 중 DB 오류 포함)', async () => {
    mocked.ask.mockResolvedValueOnce({
      response: '{"type":"BUY","accountName":"세진","ticker":"X","displayName":"","shares":1,"price":1,"currency":"KRW"}',
    } as never)
    mocked.accounts.mockRejectedValueOnce(new Error('db down'))
    const f = await say(TRADE_TEXT)
    await flush()
    expect(f.calls).toEqual([
      ['reply', '📝 거래 정보 파싱 중...'],
      ['reply', `⚠️ 거래 파싱에 실패했습니다. ${FORMAT_HINT}`],
    ])
  })

  it('typing — 5 s 마다 · 대화가 끝나면 멈춘다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let resolve!: (v: unknown) => void
    mocked.ask.mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
    const f = await say('이거 어때?', { chatId: freshChat() })
    vi.advanceTimersByTime(4999)
    expect(f.ctx.replyWithChatAction).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledWith('typing')
    resolve({ response: '끝' })
    await flush()
    vi.advanceTimersByTime(20000)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
  })

  it('typing — 거래 파싱도 5 s 마다 · 끝나면 멈춘다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let reject!: (e: unknown) => void
    mocked.ask.mockImplementationOnce(() => new Promise((_, r) => { reject = r }) as never)
    const f = await say(TRADE_TEXT)
    vi.advanceTimersByTime(9999)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(2)
    reject(new Error('x'))
    await flush()
    vi.advanceTimersByTime(20000)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(2)
  })
})

describe('T8 AI 거래 JSON 해석', () => {
  const lastReply = (f: { calls: unknown[][] }) => f.calls[f.calls.length - 1]

  it('JSON 없음', async () => {
    const f = await parseTrade('모르겠어요')
    expect(lastReply(f)).toEqual(['reply', `⚠️ 거래 정보를 파싱할 수 없습니다. ${FORMAT_HINT}`])
  })

  it('JSON 모양이지만 해석 실패', async () => {
    const f = await parseTrade('결과 {type: BUY}')
    expect(lastReply(f)).toEqual(['reply', `⚠️ 거래 정보를 파싱할 수 없습니다. ${FORMAT_HINT}`])
  })

  it('error 필드', async () => {
    const f = await parseTrade('{"error":"계좌 없음"}')
    expect(lastReply(f)).toEqual(['reply', `⚠️ 파싱 실패: 계좌 없음\n${FORMAT_HINT}`])
  })

  it('type 이 BUY/SELL 아님', async () => {
    const f = await parseTrade('{"type":"HOLD"}')
    expect(lastReply(f)).toEqual(['reply', `⚠️ 매수/매도를 구분할 수 없습니다. ${FORMAT_HINT}`])
  })

  it('계좌명 없음 · 수량 · 가격 검증', async () => {
    const base = { type: 'BUY', accountName: '세진', ticker: 'AAPL', displayName: '', shares: 1, price: 1, currency: 'USD' }
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, accountName: '' })))).toEqual(['reply', '⚠️ 계좌명을 확인해주세요.'])
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, shares: 1.5 })))).toEqual(['reply', '⚠️ 수량은 1 이상의 정수여야 합니다.'])
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, shares: 0 })))).toEqual(['reply', '⚠️ 수량은 1 이상의 정수여야 합니다.'])
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, price: 0 })))).toEqual(['reply', '⚠️ 가격은 0보다 큰 숫자여야 합니다.'])
    expect(mocked.accounts).not.toHaveBeenCalled()
  })

  it('계좌를 찾지 못하면 사용 가능 목록', async () => {
    mocked.accounts.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ name: '세진' }, { name: '소담' }] as never)
    const f = await parseTrade('{"type":"BUY","accountName":"철수","ticker":"AAPL","shares":1,"price":1,"currency":"USD"}')
    expect(lastReply(f)).toEqual(['reply', '⚠️ 계좌를 찾을 수 없습니다: 철수\n사용 가능: 세진, 소담'])
    expect(mocked.accounts.mock.calls[0][0]).toStrictEqual({ where: { name: '철수' }, take: 2 })
  })

  it('이름이 여러 종목과 맞으면 후보 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    mocked.priceMany.mockResolvedValueOnce([
      { ticker: 'T1', displayName: '타이거', market: 'KOSPI', currency: 'KRW' },
      { ticker: 'T2', displayName: '타이거', market: 'KOSPI', currency: 'KRW' },
    ] as never)
    const f = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"","displayName":"타이거","shares":1,"price":1,"currency":"KRW"}')
    expect(lastReply(f)).toEqual(['reply', '여러 종목이 매칭됩니다:\n  타이거 (T1)\n  타이거 (T2)\n\n티커를 정확히 입력해주세요.'])
    expect(mocked.priceFind).not.toHaveBeenCalled()
  })

  it('어디서도 못 찾으면 안내(표시는 이름 → 티커 순)', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([] as never)
    mocked.holdingFirst.mockResolvedValueOnce(null as never)
    const f = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"zzz","displayName":"없는종목","shares":1,"price":1,"currency":"KRW"}')
    expect(lastReply(f)).toEqual(['reply', `⚠️ 종목을 찾을 수 없습니다: 없는종목\n티커를 정확히 입력하거나 ${FORMAT_HINT}`])
    expect(mocked.holdingFirst.mock.calls[0][0]).toStrictEqual({
      where: {
        accountId: 'a1',
        OR: [{ ticker: 'ZZZ' }, { displayName: { equals: '없는종목', mode: 'insensitive' } }],
      },
    })
  })

  it('보유 종목에서 찾으면 그 값으로 진행', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.holdingFirst.mockResolvedValueOnce({ ticker: 'HOLD1', displayName: '보유주', market: 'KOSPI', currency: 'KRW' } as never)
    const f = await parseTrade('{"type":"SELL","accountName":"세진","ticker":"hold1","displayName":"","shares":2,"price":500,"currency":"KRW"}')
    const preview = f.calls[1] as [string, string, unknown]
    expect(preview[1]).toContain('📤 매도 확인 (AI 파싱)')
    expect(preview[1]).toContain('종목: 보유주 (HOLD1)')
    expect(mocked.priceMany).not.toHaveBeenCalled()
  })

  it('통화 불일치', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL })
    const f = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"aapl","shares":1,"price":200000,"currency":"KRW"}')
    expect(lastReply(f)).toEqual(['reply', '⚠️ Apple은(는) 달러(USD) 종목입니다. 가격 단위를 확인해주세요.'])
  })

  it('USD 종목 환율 없음', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL })
    const f = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"AAPL","shares":1,"price":150,"currency":"USD"}')
    expect(lastReply(f)).toEqual(['reply', '⚠️ 환율 데이터가 없습니다.'])
  })

  it('USD 정상 → 확인 미리보기 · 버튼 한 행(확인 · 취소)', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL, 'USDKRW=X': FX })
    const f = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"AAPL","shares":3,"price":150,"currency":"USD"}')
    expect(f.calls.length).toBe(2)
    const [name, text, opts] = f.calls[1] as [string, string, { reply_markup: unknown }]
    expect(name).toBe('reply')
    expect(text).toBe(
      [
        '📥 매수 확인 (AI 파싱)',
        '',
        '계좌: 세진',
        '종목: Apple (AAPL)',
        ...buildTickerCheckLines(150, 'USD', { price: 150, quoteName: 'Apple Inc.' }),
        '수량: 3주',
        '단가: $150.00',
        '환율: ₩1300.00',
        `총액: ₩${(Math.round(150 * 3 * 1300)).toLocaleString('ko-KR')}`,
        '',
        '거래를 기록하시겠습니까?',
      ].join('\n'),
    )
    expect(Object.keys(opts)).toEqual(['reply_markup'])
    const rows = rowsOf(opts.reply_markup)
    expect(rows.length).toBe(1)
    const [[confirmLabel, confirmData], [cancelLabel, cancelData]] = rows[0]
    expect([confirmLabel, cancelLabel]).toEqual(['✅ 확인', '❌ 취소'])
    expect(confirmData).toMatch(/^aitrade:confirm:\d+_[a-z0-9]+$/)
    expect(cancelData).toBe(confirmData.replace('confirm', 'cancel'))
    expect(mocked.priceFind).toHaveBeenLastCalledWith({ where: { ticker: 'AAPL' }, select: { price: true, quoteName: true } })
  })
})

describe('T9 aitrade: 버튼', () => {
  it('다른 접두는 next 로 넘긴다', async () => {
    const r = await press('trade:confirm:1', 1)
    expect(r.next).toHaveBeenCalledTimes(1)
    expect(r.calls).toEqual([])
  })

  it('메시지 없음 · tradeId 없음', async () => {
    expect((await press('aitrade:confirm:x', null)).calls).toEqual([['answerCallbackQuery', { text: '⚠️ 메시지를 찾을 수 없습니다.' }]])
    expect((await press('aitrade:confirm', 1)).calls).toEqual([['answerCallbackQuery', { text: '⚠️ 메시지를 찾을 수 없습니다.' }]])
  })

  it('모르는 거래 → 만료 안내 + 버튼 제거', async () => {
    const r = await press('aitrade:confirm:nope', 1)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 만료된 거래입니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
  })

  it('취소 → 두 호출 순서 · 같은 버튼 다시 누르면 만료', async () => {
    const { tradeId, messageId } = await startAiTrade()
    const r = await press(`aitrade:cancel:${tradeId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '취소되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '❌ 거래가 취소되었습니다.'],
    ])
    const again = await press(`aitrade:cancel:${tradeId}`, messageId)
    expect(again.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 거래입니다.' }])
  })

  it('본인 아님 → 거부 · 상태는 남아 본인이 이어서 취소할 수 있다', async () => {
    const { tradeId, messageId } = await startAiTrade()
    const other = await press(`aitrade:cancel:${tradeId}`, messageId, { fromId: 8 })
    expect(other.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const owner = await press(`aitrade:cancel:${tradeId}`, messageId)
    expect(owner.calls[0]).toEqual(['answerCallbackQuery', { text: '취소되었습니다.' }])
  })

  it('T17 누른 사람 from 없음 → 거부(요청자 from 도 없어 0 이어도)', async () => {
    const { tradeId, messageId } = await startAiTrade({ fromId: undefined })
    const r = await press(`aitrade:confirm:${tradeId}`, messageId, { fromId: undefined })
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    expect(mocked.createTrade).not.toHaveBeenCalled()
  })

  it('다른 메시지 id 의 같은 tradeId 는 다른 거래다', async () => {
    const { tradeId, messageId } = await startAiTrade()
    const r = await press(`aitrade:confirm:${tradeId}`, messageId + 1)
    expect(r.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 거래입니다.' }])
  })

  it('5 분이 지나면 만료 안내 + 버튼 제거', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    const { tradeId, messageId } = await startAiTrade()
    vi.setSystemTime(new Date('2026-10-30T00:05:01Z'))
    const r = await press(`aitrade:confirm:${tradeId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 거래가 만료되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
    expect(mocked.createTrade).not.toHaveBeenCalled()
  })

  it('확정 → createTrade · 완료 토스트 · 버튼 제거 · 본문 교체', async () => {
    const { tradeId, messageId } = await startAiTrade()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 20 } } as never)
    const r = await press(`aitrade:confirm:${tradeId}`, messageId)
    expect(mocked.createTrade).toHaveBeenCalledTimes(1)
    const args = mocked.createTrade.mock.calls[0][0]
    expect(args).toStrictEqual({
      accountId: 'a1',
      ticker: '005930.KS',
      displayName: '삼성전자',
      market: 'KOSPI',
      type: 'BUY',
      shares: 10,
      price: 70000,
      currency: 'KRW',
      fxRate: null,
      tradedAt: expect.any(Date),
    })
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '거래 기록 완료!' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '✅ 📥 매수 완료\n\n삼성전자 (005930.KS)\n10주 × ₩70,000\n총액: ₩700,000\n보유: 20주'],
    ])
  })

  it('전량 매도 문구', async () => {
    const { tradeId, messageId } = await startAiTrade()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: null } as never)
    const r = await press(`aitrade:confirm:${tradeId}`, messageId)
    expect((r.calls[2] as [string, string])[1].endsWith('전량 매도 (보유 0주)')).toBe(true)
  })

  it('업무 오류는 원문 · 그 외는 정적 문구', async () => {
    const first = await startAiTrade()
    mocked.createTrade.mockRejectedValueOnce(new Error('보유 수량 부족: 10주 > 0주'))
    const biz = await press(`aitrade:confirm:${first.tradeId}`, first.messageId)
    expect(biz.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 보유 수량 부족: 10주 > 0주' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '⚠️ 거래 실패: 보유 수량 부족: 10주 > 0주'],
    ])

    const second = await startAiTrade()
    mocked.createTrade.mockRejectedValueOnce(new Error('connection reset'))
    const generic = await press(`aitrade:confirm:${second.tradeId}`, second.messageId)
    expect(generic.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 거래 기록에 실패했습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '⚠️ 거래 실패: 거래 기록에 실패했습니다.'],
    ])
  })

  it('현재 동작 — 확정 뒤 원본 수정이 실패하면 기록된 거래에 "거래 실패" 를 띄운다(UQ-3)', async () => {
    const { tradeId, messageId } = await startAiTrade()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 20 } } as never)
    const f = fakeCtx({ data: `aitrade:confirm:${tradeId}`, messageId })
    f.ctx.editMessageText.mockImplementationOnce(async (...args: unknown[]) => {
      f.calls.push(['editMessageText', ...args])
      throw new Error('message is not modified')
    })
    await callback.handler(f.ctx, vi.fn())
    expect(mocked.createTrade).toHaveBeenCalledTimes(1)
    expect(f.calls.map((c) => c[0])).toEqual([
      'answerCallbackQuery',
      'editMessageReplyMarkup',
      'editMessageText',
      'answerCallbackQuery',
      'editMessageReplyMarkup',
      'editMessageText',
    ])
    expect(f.calls[3]).toEqual(['answerCallbackQuery', { text: '⚠️ 거래 기록에 실패했습니다.' }])
    expect(f.calls[5]).toEqual(['editMessageText', '⚠️ 거래 실패: 거래 기록에 실패했습니다.'])
  })

  it('처리 중 던지면 바깥에서 정적 안내', async () => {
    const f = fakeCtx({ data: 'aitrade:confirm:nope', messageId: 1 })
    f.ctx.editMessageReplyMarkup.mockImplementationOnce(async (...args: unknown[]) => {
      f.calls.push(['editMessageReplyMarkup', ...args])
      throw new Error('too old')
    })
    await callback.handler(f.ctx, vi.fn())
    expect(f.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 만료된 거래입니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['answerCallbackQuery', { text: '⚠️ 처리 중 오류가 발생했습니다.' }],
    ])
  })
})
