/**
 * pleiades 009 D-5 B3a (pleiades#509) — ai-telegram.test.ts 를 판단 단위로 옮겼다(어댑터 없음).
 *
 * 옛 특성 테스트(pleiades#385 · T8 · T9 · T10 · T13 · T14 · T17 · T18)의 호출열을 판단 함수(decide*)가 부르는 단계로 옮긴다.
 * fallback 경로는 옛 핸들러와 같게 `aiFallbackRoute` → `decideTradeParse` / `decideAiQuestion` 순으로 부른다.
 * 대화 상태 키는 Discord 모양(`discord:<채널>:<사용자>`)을 쓰고 옛 테스트처럼 테스트마다 새 키를 쓴다.
 * 빠진 것(텔레그램 등록 · `next` · 바깥 try/catch 안내)은 `scratchpad/b3/map-ai.md` 에 적었다.
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
import { aiFallbackRoute, decideAiCommand, decideAiQuestion, decideAiTradeButton, decideReset, decideTradeParse } from '../ai'
import type { BotReply, ButtonOutput, MessageKey, ReplyOutput } from '../../core/reply'
import { discordMessageKey, discordStateKey, type StateKey } from '../../core/state-key'
import { splitMessage } from '../../utils/formatter'
import { markdownToTelegramHtml } from '../../utils/markdown'
import { buildTickerCheckLines } from '../../utils/trade-price-check'
import {
  FLOW_CHANNEL,
  FLOW_TYPING_INTERVAL_MS,
  flush,
  press,
  recordingButtons,
  recordingOutput,
  replyActions,
  requester,
  type Step,
} from './test-utils'

const mocked = {
  accounts: vi.mocked(prisma.account.findMany),
  priceFind: vi.mocked(prisma.priceCache.findUnique),
  priceMany: vi.mocked(prisma.priceCache.findMany),
  holdingFirst: vi.mocked(prisma.holding.findFirst),
  createTrade: vi.mocked(createTrade),
  ask: vi.mocked(askAdvisor),
}

const FORMAT_HINT = '"매수 [계좌] [종목] [수량] [가격]" 형식으로 입력해주세요.'
const TRADE_TEXT = '세진 삼성전자 10주 샀어'
const ACCOUNT = { id: 'a1', name: '세진' }
const AAPL = { ticker: 'AAPL', displayName: 'Apple', market: 'NASDAQ', currency: 'USD', price: 150, quoteName: 'Apple Inc.' }
const SAMSUNG = { ticker: '005930.KS', displayName: '삼성전자', market: 'KOSPI', currency: 'KRW', price: 70000, quoteName: 'Samsung' }
const FX = { ticker: 'USDKRW=X', price: 1300 }

// 대화 상태(세션·busy)는 모듈 전역이고 상태 키 단위다 — 테스트마다 새 키를 쓴다(옛 chat 100 기본값 = DEFAULT_KEY)
const DEFAULT_KEY = discordStateKey(FLOW_CHANNEL, '7')
let nextUser = 5000
const freshKey = (): StateKey => discordStateKey(FLOW_CHANNEL, String(nextUser++))

interface SayOptions {
  /** 대화 상태 키 — 생략하면 DEFAULT_KEY · null 이면 키 없음(옛 chat 없음) */
  stateKey?: StateKey | null
  /** 요청자 ID — 생략하면 '7' */
  userId?: string
  /** 미리 만든 출력 — 생략하면 새 기록 출력 */
  rec?: ReturnType<typeof recordingOutput>
}

/** 옛 fallback 핸들러와 같은 분기 — 명령 모양(`/` 시작)이 아닌 텍스트. */
function say(text: string, opts: SayOptions = {}) {
  const rec = opts.rec ?? recordingOutput()
  const stateKey = opts.stateKey === null ? undefined : (opts.stateKey ?? DEFAULT_KEY)
  const route = aiFallbackRoute(text, false)
  if (route === 'trade') decideTradeParse(text, requester(opts.userId ?? '7'), rec.out)
  if (route === 'question') decideAiQuestion(text, stateKey, rec.out)
  return rec
}

/** 셋째 인자를 생략하면 본인 · `undefined` 를 넘기면 누른 사람 없음(`press` 와 같은 규칙 — 기본 인자 금지). */
async function click(data: string, messageKey: MessageKey | undefined, ...clicker: [] | [string | undefined]) {
  const rec = recordingButtons()
  await decideAiTradeButton(data, press(messageKey, ...clicker), rec.out)
  return rec
}

/** priceCache.findUnique 를 ticker 별로 답한다. */
function priceTable(table: Record<string, unknown>) {
  mocked.priceFind.mockImplementation((async (args: { where: { ticker: string } }) => table[args.where.ticker] ?? null) as never)
}

/** AI 거래 파싱 — advisor 가 `response` 를 돌려준 뒤까지. */
async function parseTrade(response: string, opts: SayOptions = {}) {
  mocked.ask.mockResolvedValueOnce({ response } as never)
  const rec = say(TRADE_TEXT, opts)
  await flush()
  return rec
}

/** 삼성전자 10주 70000원 매수 확인 메시지까지 — 버튼 action 과 메시지 키. */
async function startAiTrade(opts: SayOptions = {}) {
  mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
  priceTable({ '005930.KS': SAMSUNG })
  const rec = await parseTrade(
    '{"type":"BUY","accountName":"세진","ticker":"005930.KS","displayName":"삼성전자","shares":10,"price":70000,"currency":"KRW"}',
    opts,
  )
  const actions = replyActions(rec.steps, 1)
  return { tradeId: actions[0].split(':')[2], messageKey: rec.keys[1], rec }
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

describe('T10 AI fallback 분기', () => {
  // `/` 시작을 명령으로 보는 판정은 어댑터의 일이다 — 판단은 isCommand 를 받아 무시한다
  it('/ 로 시작하면 무시', async () => {
    expect(aiFallbackRoute('/foo 분석해줘', true)).toBe('none')
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('trim 뒤 3자 미만이면 무시', async () => {
    const rec = say('  a?  ')
    expect(rec.steps).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('거래 키워드 → AI 거래 파싱(질문 키워드보다 먼저)', async () => {
    hangingAsk()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const text = '세진 10주 샀어?'
    expect(aiFallbackRoute(text, false)).toBe('trade')
    const rec = say(text)
    expect(rec.steps).toEqual([['reply', '📝 거래 정보 파싱 중...', 'plain']])
    expect(mocked.ask).toHaveBeenCalledTimes(1)
    expect(mocked.ask.mock.calls[0][0]).toMatch(/^다음 자연어 메시지에서 주식 거래 정보를 추출하세요/)
    expect(mocked.ask.mock.calls[0][0].endsWith(`메시지: ${text}`)).toBe(true)
    expect(mocked.ask.mock.calls[0][1]).toStrictEqual({ intent: 'parse', caller: 'bot:trade_parse' })
  })

  it('질문 키워드 → AI 대화', async () => {
    hangingAsk()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    expect(aiFallbackRoute('포트폴리오 분석 해줘', false)).toBe('question')
    const rec = say('포트폴리오 분석 해줘', { stateKey: freshKey() })
    expect(rec.steps).toEqual([['reply', '🤔 생각 중...', 'plain']])
    expect(mocked.ask).toHaveBeenCalledWith('포트폴리오 분석 해줘', {
      sessionId: undefined,
      persist: true,
      intent: 'conversation',
      caller: 'bot:ai_chat',
      allowWriteTools: true, // pleiades#419 — 대화 경로만 쓰기를 받는다
    })
  })

  it('진행 안내가 advisor 호출보다 먼저다(대화 · 거래 파싱 · 9-1 리뷰 info 1)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const cases = [
      ['요즘 시장 어때?', '🤔 생각 중...'],
      [TRADE_TEXT, '📝 거래 정보 파싱 중...'],
    ] as const
    for (const [text, progress] of cases) {
      const rec = recordingOutput()
      mocked.ask.mockImplementationOnce((() => {
        rec.steps.push(['askAdvisor'])
        return new Promise(() => undefined)
      }) as never)
      say(text, { stateKey: freshKey(), rec })
      expect(rec.steps).toEqual([['reply', progress, 'plain'], ['askAdvisor']])
    }
  })

  it('둘 다 아니면 무응답', async () => {
    expect(aiFallbackRoute('그냥 메모 하나', false)).toBe('none')
    const rec = say('그냥 메모 하나')
    expect(rec.steps).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })
})

describe('T13 /ai · /reset · 동시 1건 · 세션', () => {
  it('/ai 인자 없음 → 사용법', async () => {
    const rec = recordingOutput()
    await decideAiCommand('  ', DEFAULT_KEY, rec.out)
    expect(rec.steps).toEqual([
      [
        'reply',
        '🤖 AI 어드바이저에게 질문하세요.\n\n' +
          '사용법: /ai 전체 포트폴리오 현황 분석해줘\n' +
          '또는 그냥 자연어로 질문하면 됩니다.\n\n' +
          '거래 입력도 가능합니다:\n' +
          '"소담 TIGER S&P500 10주 24900원에 샀어"',
        'plain',
      ],
    ])
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('/ai 인자 → trim 해서 AI 대화(키워드 없어도)', async () => {
    mocked.ask.mockResolvedValueOnce({ response: '답' } as never)
    const rec = recordingOutput()
    await decideAiCommand('  안녕  ', freshKey(), rec.out)
    await flush()
    expect(mocked.ask.mock.calls[0][0]).toBe('안녕')
    expect(rec.steps).toEqual([
      ['reply', '🤔 생각 중...', 'plain'],
      ['reply', markdownToTelegramHtml('답'), 'html'],
    ])
  })

  it('같은 chat 2연속 → 두 번째는 처리 중 안내 · advisor 1회', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    hangingAsk()
    const stateKey = freshKey()
    say('이거 어때?', { stateKey })
    const second = say('저건 어때?', { stateKey })
    expect(second.steps).toEqual([['reply', '⏳ 이전 질문을 처리 중입니다. 잠시 후 다시 시도해주세요.', 'plain']])
    expect(mocked.ask).toHaveBeenCalledTimes(1)
  })

  it('다른 chat 은 막지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    hangingAsk()
    hangingAsk()
    say('이거 어때?', { stateKey: freshKey() })
    const other = say('저건 어때?', { stateKey: freshKey() })
    expect(other.steps).toEqual([['reply', '🤔 생각 중...', 'plain']])
    expect(mocked.ask).toHaveBeenCalledTimes(2)
  })

  it('끝나면 busy 해제 · 세션 id 를 다음 질문에 넘긴다', async () => {
    const stateKey = freshKey()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's1' } as never)
    say('하나 어때?', { stateKey })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '2', sessionId: 's1' } as never)
    const rec = say('둘 어때?', { stateKey })
    await flush()
    expect(mocked.ask.mock.calls[1][1]).toMatchObject({ sessionId: 's1' })
    expect(rec.steps[0]).toEqual(['reply', '🤔 생각 중...', 'plain'])
  })

  it('세션은 24 h 미사용이면 지워진다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    const stateKey = freshKey()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's-old' } as never)
    say('하나 어때?', { stateKey })
    await flush()
    vi.setSystemTime(new Date('2026-10-31T00:00:01Z'))
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    say('둘 어때?', { stateKey })
    await flush()
    expect(mocked.ask.mock.calls[1][1]).toMatchObject({ sessionId: undefined })
  })

  it('세션이 없는 응답은 기존 세션을 바꾸지 않는다', async () => {
    const stateKey = freshKey()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's1' } as never)
    say('하나 어때?', { stateKey })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    say('둘 어때?', { stateKey })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '3' } as never)
    say('셋 어때?', { stateKey })
    await flush()
    expect(mocked.ask.mock.calls[2][1]).toMatchObject({ sessionId: 's1' })
  })

  it('/reset → 안내 · 다음 질문은 새 세션', async () => {
    const stateKey = freshKey()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 's1' } as never)
    say('하나 어때?', { stateKey })
    await flush()
    const r = recordingOutput()
    await decideReset(stateKey, r.out)
    expect(r.steps).toEqual([['reply', '🔄 AI 대화 세션이 초기화되었습니다.', 'plain']])
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    say('둘 어때?', { stateKey })
    await flush()
    expect(mocked.ask.mock.calls[1][1]).toMatchObject({ sessionId: undefined })
  })

  it('/reset 은 그 chat 세션만 지운다', async () => {
    const a = freshKey()
    const b = freshKey()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 'sa' } as never)
    say('하나 어때?', { stateKey: a })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: '1', sessionId: 'sb' } as never)
    say('하나 어때?', { stateKey: b })
    await flush()
    await decideReset(a, recordingOutput().out)
    mocked.ask.mockResolvedValueOnce({ response: '2' } as never)
    say('둘 어때?', { stateKey: b })
    await flush()
    expect(mocked.ask.mock.calls[2][1]).toMatchObject({ sessionId: 'sb' })
  })

  // 옛 "chat 없음" = 상태 키 없음(undefined) — 판단이 무응답을 정한다
  it('chat 없음 → /reset · AI 대화 무응답 · /ai 는 사용법만', async () => {
    const r = recordingOutput()
    await decideReset(undefined, r.out)
    expect(r.steps).toEqual([])

    // /ai — 인자 없음은 키 없이도 사용법 · 인자 있음은 무응답(9-1 리뷰 info 2)
    const usage = recordingOutput()
    await decideAiCommand('', undefined, usage.out)
    expect(usage.steps.map((s) => s[0])).toEqual(['reply'])
    expect(String(usage.steps[0][1]).startsWith('🤖 AI 어드바이저에게 질문하세요.')).toBe(true)

    const asked = recordingOutput()
    await decideAiCommand('안녕', undefined, asked.out)
    expect(asked.steps).toEqual([])

    const q = say('이거 어때?', { stateKey: null })
    expect(q.steps).toEqual([])
    expect(mocked.ask).not.toHaveBeenCalled()
  })
})

describe('T14 AI 대화 응답 — 분할 · 조각별 HTML · 실패 시 원문', () => {
  const longResponse = `**첫째** & <x>\n${'가'.repeat(3000)}\n${'나'.repeat(3000)}`

  it('조각마다 markdown → HTML 로 보낸다', async () => {
    mocked.ask.mockResolvedValueOnce({ response: longResponse } as never)
    const rec = say('길게 설명해줘?', { stateKey: freshKey() })
    await flush()
    const chunks = splitMessage(longResponse)
    expect(chunks.length).toBe(2)
    expect(rec.steps).toEqual([
      ['reply', '🤔 생각 중...', 'plain'],
      ...chunks.map((c) => ['reply', markdownToTelegramHtml(c), 'html']),
    ])
  })

  it('HTML 전송이 실패한 조각만 원문으로 다시 보낸다', async () => {
    mocked.ask.mockResolvedValueOnce({ response: longResponse } as never)
    const base = recordingOutput()
    const original = base.out.reply
    let htmlTries = 0
    const out: ReplyOutput = {
      ...base.out,
      reply: async (message: BotReply) => {
        const key = await original(message)
        if (message.format === 'html' && htmlTries++ === 0) throw new Error('Bad Request: can\'t parse entities')
        return key
      },
    }
    say('길게 설명해줘?', { stateKey: freshKey(), rec: { ...base, out } })
    await flush()
    const chunks = splitMessage(longResponse)
    expect(base.steps).toEqual([
      ['reply', '🤔 생각 중...', 'plain'],
      ['reply', markdownToTelegramHtml(chunks[0]), 'html'],
      ['reply', chunks[0], 'plain'],
      ['reply', markdownToTelegramHtml(chunks[1]), 'html'],
    ])
  })
})

describe('T18 fire-and-forget 오류 안내 · typing', () => {
  it('대화 — 시간 초과', async () => {
    mocked.ask.mockRejectedValueOnce(new AdvisorTimeoutError(60000))
    const rec = say('이거 어때?', { stateKey: freshKey() })
    await flush()
    expect(rec.steps).toEqual([
      ['reply', '🤔 생각 중...', 'plain'],
      ['reply', '⚠️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.', 'plain'],
    ])
  })

  it('대화 — AdvisorError 는 code 별 안내 · detail 은 로그로만', async () => {
    const err = new AdvisorError('x', 'stderr tail', 'quota_exceeded')
    mocked.ask.mockRejectedValueOnce(err)
    const rec = say('이거 어때?', { stateKey: freshKey() })
    await flush()
    expect(rec.steps).toEqual([
      ['reply', '🤔 생각 중...', 'plain'],
      ['reply', describeAdvisorError(err), 'plain'],
    ])
    expect(console.error).toHaveBeenCalledWith('[bot] AI advisor detail (quota_exceeded): stderr tail')
  })

  it('대화 — 그 외 오류', async () => {
    mocked.ask.mockRejectedValueOnce(new Error('boom'))
    const rec = say('이거 어때?', { stateKey: freshKey() })
    await flush()
    expect(rec.steps).toEqual([
      ['reply', '🤔 생각 중...', 'plain'],
      ['reply', '⚠️ AI 질문 처리에 실패했습니다.', 'plain'],
    ])
  })

  it('대화 — 오류 안내 전송까지 실패해도 busy 는 풀린다', async () => {
    const stateKey = freshKey()
    mocked.ask.mockRejectedValueOnce(new Error('boom'))
    const base = recordingOutput()
    const original = base.out.reply
    const out: ReplyOutput = {
      ...base.out,
      reply: async (message: BotReply) => {
        const key = await original(message)
        if (message.text === '⚠️ AI 질문 처리에 실패했습니다.') throw new Error('send fail')
        return key
      },
    }
    say('이거 어때?', { stateKey, rec: { ...base, out } })
    await flush()
    mocked.ask.mockResolvedValueOnce({ response: 'ok' } as never)
    const again = say('다시 어때?', { stateKey })
    expect(again.steps[0]).toEqual(['reply', '🤔 생각 중...', 'plain'])
    expect(mocked.ask).toHaveBeenCalledTimes(2)
  })

  it('거래 파싱 — 시간 초과', async () => {
    mocked.ask.mockRejectedValueOnce(new AdvisorTimeoutError(60000))
    const rec = say(TRADE_TEXT)
    await flush()
    expect(rec.steps).toEqual([
      ['reply', '📝 거래 정보 파싱 중...', 'plain'],
      ['reply', `⚠️ 파싱 시간이 초과되었습니다. ${FORMAT_HINT}`, 'plain'],
    ])
  })

  it('거래 파싱 — 그 외 오류(해석 중 DB 오류 포함)', async () => {
    mocked.ask.mockResolvedValueOnce({
      response: '{"type":"BUY","accountName":"세진","ticker":"X","displayName":"","shares":1,"price":1,"currency":"KRW"}',
    } as never)
    mocked.accounts.mockRejectedValueOnce(new Error('db down'))
    const rec = say(TRADE_TEXT)
    await flush()
    expect(rec.steps).toEqual([
      ['reply', '📝 거래 정보 파싱 중...', 'plain'],
      ['reply', `⚠️ 거래 파싱에 실패했습니다. ${FORMAT_HINT}`, 'plain'],
    ])
  })

  it('typing — 5 s 마다 · 대화가 끝나면 멈춘다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let resolve!: (v: unknown) => void
    mocked.ask.mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
    const rec = say('이거 어때?', { stateKey: freshKey() })
    vi.advanceTimersByTime(FLOW_TYPING_INTERVAL_MS - 1)
    expect(rec.typing).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(rec.typing).toHaveBeenCalledTimes(1)
    resolve({ response: '끝' })
    await flush()
    vi.advanceTimersByTime(20000)
    expect(rec.typing).toHaveBeenCalledTimes(1)
  })

  it('typing — 거래 파싱도 5 s 마다 · 끝나면 멈춘다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let reject!: (e: unknown) => void
    mocked.ask.mockImplementationOnce(() => new Promise((_, r) => { reject = r }) as never)
    const rec = say(TRADE_TEXT)
    vi.advanceTimersByTime(2 * FLOW_TYPING_INTERVAL_MS - 1)
    expect(rec.typing).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(rec.typing).toHaveBeenCalledTimes(2)
    reject(new Error('x'))
    await flush()
    vi.advanceTimersByTime(20000)
    expect(rec.typing).toHaveBeenCalledTimes(2)
  })
})

describe('T8 AI 거래 JSON 해석', () => {
  const lastReply = (rec: { steps: Step[] }) => rec.steps[rec.steps.length - 1]

  it('JSON 없음', async () => {
    const rec = await parseTrade('모르겠어요')
    expect(lastReply(rec)).toEqual(['reply', `⚠️ 거래 정보를 파싱할 수 없습니다. ${FORMAT_HINT}`, 'plain'])
  })

  it('JSON 모양이지만 해석 실패', async () => {
    const rec = await parseTrade('결과 {type: BUY}')
    expect(lastReply(rec)).toEqual(['reply', `⚠️ 거래 정보를 파싱할 수 없습니다. ${FORMAT_HINT}`, 'plain'])
  })

  it('error 필드', async () => {
    const rec = await parseTrade('{"error":"계좌 없음"}')
    expect(lastReply(rec)).toEqual(['reply', `⚠️ 파싱 실패: 계좌 없음\n${FORMAT_HINT}`, 'plain'])
  })

  it('type 이 BUY/SELL 아님', async () => {
    const rec = await parseTrade('{"type":"HOLD"}')
    expect(lastReply(rec)).toEqual(['reply', `⚠️ 매수/매도를 구분할 수 없습니다. ${FORMAT_HINT}`, 'plain'])
  })

  it('계좌명 없음 · 수량 · 가격 검증', async () => {
    const base = { type: 'BUY', accountName: '세진', ticker: 'AAPL', displayName: '', shares: 1, price: 1, currency: 'USD' }
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, accountName: '' })))).toEqual(['reply', '⚠️ 계좌명을 확인해주세요.', 'plain'])
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, shares: 1.5 })))).toEqual(['reply', '⚠️ 수량은 1 이상의 정수여야 합니다.', 'plain'])
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, shares: 0 })))).toEqual(['reply', '⚠️ 수량은 1 이상의 정수여야 합니다.', 'plain'])
    expect(lastReply(await parseTrade(JSON.stringify({ ...base, price: 0 })))).toEqual(['reply', '⚠️ 가격은 0보다 큰 숫자여야 합니다.', 'plain'])
    expect(mocked.accounts).not.toHaveBeenCalled()
  })

  it('계좌를 찾지 못하면 사용 가능 목록', async () => {
    mocked.accounts.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ name: '세진' }, { name: '소담' }] as never)
    const rec = await parseTrade('{"type":"BUY","accountName":"철수","ticker":"AAPL","shares":1,"price":1,"currency":"USD"}')
    expect(lastReply(rec)).toEqual(['reply', '⚠️ 계좌를 찾을 수 없습니다: 철수\n사용 가능: 세진, 소담', 'plain'])
    expect(mocked.accounts.mock.calls[0][0]).toStrictEqual({ where: { name: '철수' }, take: 2 })
  })

  it('이름이 여러 종목과 맞으면 후보 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    mocked.priceMany.mockResolvedValueOnce([
      { ticker: 'T1', displayName: '타이거', market: 'KOSPI', currency: 'KRW' },
      { ticker: 'T2', displayName: '타이거', market: 'KOSPI', currency: 'KRW' },
    ] as never)
    const rec = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"","displayName":"타이거","shares":1,"price":1,"currency":"KRW"}')
    expect(lastReply(rec)).toEqual(['reply', '여러 종목이 매칭됩니다:\n  타이거 (T1)\n  타이거 (T2)\n\n티커를 정확히 입력해주세요.', 'plain'])
    expect(mocked.priceFind).not.toHaveBeenCalled()
  })

  it('어디서도 못 찾으면 안내(표시는 이름 → 티커 순)', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([] as never)
    mocked.holdingFirst.mockResolvedValueOnce(null as never)
    const rec = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"zzz","displayName":"없는종목","shares":1,"price":1,"currency":"KRW"}')
    expect(lastReply(rec)).toEqual(['reply', `⚠️ 종목을 찾을 수 없습니다: 없는종목\n티커를 정확히 입력하거나 ${FORMAT_HINT}`, 'plain'])
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
    const rec = await parseTrade('{"type":"SELL","accountName":"세진","ticker":"hold1","displayName":"","shares":2,"price":500,"currency":"KRW"}')
    const preview = rec.steps[1] as [string, string, unknown]
    expect(preview[1]).toContain('📤 매도 확인 (AI 파싱)')
    expect(preview[1]).toContain('종목: 보유주 (HOLD1)')
    expect(mocked.priceMany).not.toHaveBeenCalled()
  })

  it('통화 불일치', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL })
    const rec = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"aapl","shares":1,"price":200000,"currency":"KRW"}')
    expect(lastReply(rec)).toEqual(['reply', '⚠️ Apple은(는) 달러(USD) 종목입니다. 가격 단위를 확인해주세요.', 'plain'])
  })

  it('USD 종목 환율 없음', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL })
    const rec = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"AAPL","shares":1,"price":150,"currency":"USD"}')
    expect(lastReply(rec)).toEqual(['reply', '⚠️ 환율 데이터가 없습니다.', 'plain'])
  })

  it('USD 정상 → 확인 미리보기 · 버튼 한 행(확인 · 취소)', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL, 'USDKRW=X': FX })
    const rec = await parseTrade('{"type":"BUY","accountName":"세진","ticker":"AAPL","shares":3,"price":150,"currency":"USD"}')
    expect(rec.steps.length).toBe(2)
    const [name, text, format, rows] = rec.steps[1] as [string, string, string, [string, string][][]]
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
    // 옛 옵션 키가 reply_markup 하나뿐 = parse_mode 없음 = plain
    expect(format).toBe('plain')
    expect(rows.length).toBe(1)
    const [[confirmLabel, confirmData], [cancelLabel, cancelData]] = rows[0]
    expect([confirmLabel, cancelLabel]).toEqual(['✅ 확인', '❌ 취소'])
    expect(confirmData).toMatch(/^aitrade:confirm:\d+_[a-z0-9]+$/)
    expect(cancelData).toBe(confirmData.replace('confirm', 'cancel'))
    expect(mocked.priceFind).toHaveBeenLastCalledWith({ where: { ticker: 'AAPL' }, select: { price: true, quoteName: true } })
  })
})

describe('T9 aitrade: 버튼', () => {
  const someKey = discordMessageKey(FLOW_CHANNEL, '1')

  // `next` 로 넘기는 것은 어댑터의 일이다 — 판단은 다른 접두에 아무 단계도 내지 않는다
  it('다른 접두는 next 로 넘긴다', async () => {
    const r = await click('trade:confirm:1', someKey)
    expect(r.steps).toEqual([])
  })

  it('메시지 없음 · tradeId 없음', async () => {
    expect((await click('aitrade:confirm:x', undefined)).steps).toEqual([['toast', '⚠️ 메시지를 찾을 수 없습니다.']])
    expect((await click('aitrade:confirm', someKey)).steps).toEqual([['toast', '⚠️ 메시지를 찾을 수 없습니다.']])
  })

  it('모르는 거래 → 만료 안내 + 버튼 제거', async () => {
    const r = await click('aitrade:confirm:nope', someKey)
    expect(r.steps).toEqual([
      ['toast', '⚠️ 만료된 거래입니다.'],
      ['removeButtons'],
    ])
  })

  it('취소 → 두 호출 순서 · 같은 버튼 다시 누르면 만료', async () => {
    const { tradeId, messageKey } = await startAiTrade()
    const r = await click(`aitrade:cancel:${tradeId}`, messageKey)
    expect(r.steps).toEqual([
      ['toast', '취소되었습니다.'],
      ['removeButtons'],
      ['edit', '❌ 거래가 취소되었습니다.', 'plain'],
    ])
    const again = await click(`aitrade:cancel:${tradeId}`, messageKey)
    expect(again.steps[0]).toEqual(['toast', '⚠️ 만료된 거래입니다.'])
  })

  it('본인 아님 → 거부 · 상태는 남아 본인이 이어서 취소할 수 있다', async () => {
    const { tradeId, messageKey } = await startAiTrade()
    const other = await click(`aitrade:cancel:${tradeId}`, messageKey, '8')
    expect(other.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
    const owner = await click(`aitrade:cancel:${tradeId}`, messageKey)
    expect(owner.steps[0]).toEqual(['toast', '취소되었습니다.'])
  })

  // 옛 텔레그램 요청자 `from` 없음 = '0' · 누른 사람 `from` 없음 = undefined — 판단 규칙(undefined = 거부)만 옮긴다
  it('T17 누른 사람 from 없음 → 거부(요청자 from 도 없어 0 이어도)', async () => {
    const { tradeId, messageKey } = await startAiTrade({ userId: '0' })
    const r = await click(`aitrade:confirm:${tradeId}`, messageKey, undefined)
    expect(r.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
    expect(mocked.createTrade).not.toHaveBeenCalled()
  })

  it('다른 메시지 id 의 같은 tradeId 는 다른 거래다', async () => {
    const { tradeId } = await startAiTrade()
    const r = await click(`aitrade:confirm:${tradeId}`, discordMessageKey(FLOW_CHANNEL, 'other'))
    expect(r.steps[0]).toEqual(['toast', '⚠️ 만료된 거래입니다.'])
  })

  it('5 분이 지나면 만료 안내 + 버튼 제거', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    const { tradeId, messageKey } = await startAiTrade()
    vi.setSystemTime(new Date('2026-10-30T00:05:01Z'))
    const r = await click(`aitrade:confirm:${tradeId}`, messageKey)
    expect(r.steps).toEqual([
      ['toast', '⚠️ 거래가 만료되었습니다.'],
      ['removeButtons'],
    ])
    expect(mocked.createTrade).not.toHaveBeenCalled()
  })

  it('확정 → createTrade · 완료 토스트 · 버튼 제거 · 본문 교체', async () => {
    const { tradeId, messageKey } = await startAiTrade()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 20 } } as never)
    const r = await click(`aitrade:confirm:${tradeId}`, messageKey)
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
    expect(r.steps).toEqual([
      ['toast', '거래 기록 완료!'],
      ['removeButtons'],
      ['edit', '✅ 📥 매수 완료\n\n삼성전자 (005930.KS)\n10주 × ₩70,000\n총액: ₩700,000\n보유: 20주', 'plain'],
    ])
  })

  it('전량 매도 문구', async () => {
    const { tradeId, messageKey } = await startAiTrade()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: null } as never)
    const r = await click(`aitrade:confirm:${tradeId}`, messageKey)
    expect((r.steps[2] as [string, string])[1].endsWith('전량 매도 (보유 0주)')).toBe(true)
  })

  it('업무 오류는 원문 · 그 외는 정적 문구', async () => {
    const first = await startAiTrade()
    mocked.createTrade.mockRejectedValueOnce(new Error('보유 수량 부족: 10주 > 0주'))
    const biz = await click(`aitrade:confirm:${first.tradeId}`, first.messageKey)
    expect(biz.steps).toEqual([
      ['toast', '⚠️ 보유 수량 부족: 10주 > 0주'],
      ['removeButtons'],
      ['edit', '⚠️ 거래 실패: 보유 수량 부족: 10주 > 0주', 'plain'],
    ])

    const second = await startAiTrade()
    mocked.createTrade.mockRejectedValueOnce(new Error('connection reset'))
    const generic = await click(`aitrade:confirm:${second.tradeId}`, second.messageKey)
    expect(generic.steps).toEqual([
      ['toast', '⚠️ 거래 기록에 실패했습니다.'],
      ['removeButtons'],
      ['edit', '⚠️ 거래 실패: 거래 기록에 실패했습니다.', 'plain'],
    ])
  })

  // PR-2c (#396 · UQ-3) 이전: 본문 교체 실패가 catch 로 가 기록된 거래에 "거래 실패" 를 이어 보냈다
  it('확정 뒤 원본 수정이 실패해도 "거래 실패" 를 보내지 않는다 — 로그만(PR-2c 수정)', async () => {
    const { tradeId, messageKey } = await startAiTrade()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 20 } } as never)
    const rec = recordingButtons()
    const out: ButtonOutput = {
      ...rec.out,
      edit: async (message: BotReply) => {
        await rec.out.edit(message)
        throw new Error('message is not modified')
      },
    }
    await decideAiTradeButton(`aitrade:confirm:${tradeId}`, press(messageKey), out)
    expect(mocked.createTrade).toHaveBeenCalledTimes(1)
    expect(rec.steps.map((s) => s[0])).toEqual(['toast', 'removeButtons', 'edit'])
    expect(rec.steps[0]).toEqual(['toast', '거래 기록 완료!'])
    expect(console.error).toHaveBeenCalledWith('[bot] AI 거래 기록 뒤 원본 수정 실패(기록은 됨):', expect.any(Error))
  })

  // 바깥 정적 안내('⚠️ 처리 중 오류가 발생했습니다.')는 router 감싸기의 일 — 판단이 그 앞까지 내고 던지는 것만 본다
  it('처리 중 던지면 바깥에서 정적 안내', async () => {
    const rec = recordingButtons()
    const out: ButtonOutput = {
      ...rec.out,
      removeButtons: async () => {
        await rec.out.removeButtons()
        throw new Error('too old')
      },
    }
    await expect(decideAiTradeButton('aitrade:confirm:nope', press(someKey), out)).rejects.toThrow('too old')
    expect(rec.steps).toEqual([
      ['toast', '⚠️ 만료된 거래입니다.'],
      ['removeButtons'],
    ])
  })
})
