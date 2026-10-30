/**
 * pleiades 009 D-3 PR-1b (pleiades#385) — AI 판단 함수 계약(설계 §4 Q · S).
 *
 * 텔레그램 호출열은 `ai-telegram.test.ts` 가 고정한다. 여기서는 플랫폼을 모르는 판단 함수가
 * 상태 키 · 메시지 키 · 요청자만으로 동작하는지 본다 — 같은 숫자의 telegram/discord 키가 서로의
 * 세션 · 동시 1건 · 버튼 대기 상태를 소비하지 않는다(2-2 · 구조상 0 · UQ-4 플랫폼별).
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
vi.mock('@/lib/ai/claude-advisor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/claude-advisor')>()),
  askAdvisor: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { aiFallbackRoute, decideAiQuestion, decideAiTradeButton, decideReset, decideTradeParse } from '../ai'
import type { BotReply, ButtonOutput, ReplyOutput, Requester } from '../../core/reply'
import { discordMessageKey, discordStateKey, telegramMessageKey, telegramStateKey } from '../../core/state-key'
import { flush } from './telegram-fake'

const ask = vi.mocked(askAdvisor)

/** 가짜 출력 — 보낸 메시지와 그 키를 남긴다. 키는 주어진 함수로 만든다(플랫폼 흉내). */
function fakeOut(keyOf: (n: number) => string) {
  const sent: BotReply[] = []
  const keys: string[] = []
  const out: ReplyOutput = {
    reply: async (message) => {
      sent.push(message)
      const key = keyOf(sent.length)
      keys.push(key)
      return key
    },
    replyLong: async () => { throw new Error('replyLong 은 이 판단에서 쓰지 않는다') },
    typing: async () => undefined,
    typingIntervalMs: 60_000,
  }
  return { out, sent, keys }
}

function fakeButtons() {
  const steps: [string, unknown?][] = []
  const out: ButtonOutput = {
    toast: async (text) => { steps.push(['toast', text]) },
    removeButtons: async () => { steps.push(['removeButtons']) },
    edit: async (message) => { steps.push(['edit', message.text]) },
  }
  return { out, steps }
}

const texts = (sent: BotReply[]) => sent.map((m) => m.text)

// 상태는 모듈 전역 — 테스트마다 새 번호
let n = 9000
const fresh = () => n++

beforeEach(() => {
  ask.mockReset()
  vi.mocked(prisma.account.findMany).mockReset()
  vi.mocked(prisma.priceCache.findUnique).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

// 끝나지 않는 AI — 실제 typing 타이머를 남기지 않는다
afterEach(() => vi.useRealTimers())

describe('aiFallbackRoute', () => {
  it('명령 모양은 어댑터가 정한다 — isCommand 면 none', () => {
    expect(aiFallbackRoute('세진 10주 샀어', true)).toBe('none')
    // Discord 접두는 어댑터 몫 — 판단은 `!` 를 특별히 보지 않는다
    expect(aiFallbackRoute('!포트 어때?', false)).toBe('question')
  })

  it('trim 뒤 3자 미만 · 거래 먼저 · 질문 · 나머지', () => {
    expect(aiFallbackRoute('  a? ', false)).toBe('none')
    expect(aiFallbackRoute('세진 10주 샀어?', false)).toBe('trade')
    expect(aiFallbackRoute('요즘 시장 어때?', false)).toBe('question')
    expect(aiFallbackRoute('그냥 메모', false)).toBe('none')
  })
})

describe('대화 상태 키 격리', () => {
  it('상태 키가 없으면 무응답 · advisor 0', () => {
    const { out, sent } = fakeOut(String)
    decideAiQuestion('어때?', undefined, out)
    expect(sent).toEqual([])
    expect(ask).not.toHaveBeenCalled()
  })

  it('같은 숫자의 telegram 키와 discord 키는 서로 처리 중을 막지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ask.mockImplementation(() => new Promise(() => undefined) as never)
    const id = fresh()
    const tg = fakeOut(String)
    const dc = fakeOut(String)
    decideAiQuestion('하나 어때?', telegramStateKey(id), tg.out)
    decideAiQuestion('둘 어때?', discordStateKey(String(id), String(id)), dc.out)
    await flush()
    expect(texts(tg.sent)).toEqual(['🤔 생각 중...'])
    expect(texts(dc.sent)).toEqual(['🤔 생각 중...'])
    expect(ask).toHaveBeenCalledTimes(2)

    const again = fakeOut(String)
    decideAiQuestion('셋 어때?', telegramStateKey(id), again.out)
    expect(texts(again.sent)).toEqual(['⏳ 이전 질문을 처리 중입니다. 잠시 후 다시 시도해주세요.'])
  })

  it('Discord 는 채널 + 사용자 단위 — 같은 채널의 다른 사용자는 막지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ask.mockImplementation(() => new Promise(() => undefined) as never)
    const channel = String(fresh())
    const a = fakeOut(String)
    const b = fakeOut(String)
    decideAiQuestion('하나 어때?', discordStateKey(channel, 'u1'), a.out)
    decideAiQuestion('둘 어때?', discordStateKey(channel, 'u2'), b.out)
    expect(texts(b.sent)).toEqual(['🤔 생각 중...'])
  })

  it('세션은 키별 · reset 은 자기 키만 지운다', async () => {
    const id = fresh()
    const tgKey = telegramStateKey(id)
    const dcKey = discordStateKey(String(id), String(id))
    ask.mockResolvedValueOnce({ response: '1', sessionId: 's-tg' } as never)
    decideAiQuestion('하나 어때?', tgKey, fakeOut(String).out)
    await flush()
    ask.mockResolvedValueOnce({ response: '1', sessionId: 's-dc' } as never)
    decideAiQuestion('하나 어때?', dcKey, fakeOut(String).out)
    await flush()
    expect(ask.mock.calls[1][1]).toMatchObject({ sessionId: undefined })

    const reset = fakeOut(String)
    await decideReset(tgKey, reset.out)
    expect(texts(reset.sent)).toEqual(['🔄 AI 대화 세션이 초기화되었습니다.'])

    ask.mockResolvedValueOnce({ response: '2' } as never)
    decideAiQuestion('둘 어때?', dcKey, fakeOut(String).out)
    await flush()
    ask.mockResolvedValueOnce({ response: '2' } as never)
    decideAiQuestion('둘 어때?', tgKey, fakeOut(String).out)
    await flush()
    expect(ask.mock.calls[2][1]).toMatchObject({ sessionId: 's-dc' })
    expect(ask.mock.calls[3][1]).toMatchObject({ sessionId: undefined })
  })

  it('reset 상태 키 없음 → 무응답', async () => {
    const { out, sent } = fakeOut(String)
    await decideReset(undefined, out)
    expect(sent).toEqual([])
  })

  it('AI 대화 응답은 조각마다 html 로 · 실패한 조각만 plain 으로', async () => {
    ask.mockResolvedValueOnce({ response: '**굵게**' } as never)
    const sent: BotReply[] = []
    const out: ReplyOutput = {
      reply: async (m) => {
        sent.push(m)
        if (m.format === 'html') throw new Error('html 거부')
        return 'k'
      },
      replyLong: async () => { throw new Error('replyLong 은 이 판단에서 쓰지 않는다') },
      typing: async () => undefined,
      typingIntervalMs: 60_000,
    }
    decideAiQuestion('설명 어때?', telegramStateKey(fresh()), out)
    await flush()
    expect(sent.map((m) => [m.format, m.text])).toEqual([
      ['plain', '🤔 생각 중...'],
      ['html', '<b>굵게</b>'],
      ['plain', '**굵게**'],
    ])
  })
})

describe('aitrade: 대기 상태 — 메시지 키 · 요청자', () => {
  const ACCOUNT = { id: 'a1', name: '세진' }
  const SAMSUNG = { ticker: '005930.KS', displayName: '삼성전자', market: 'KOSPI', currency: 'KRW', price: 70000, quoteName: 'S' }

  async function startTrade(keyOf: (n: number) => string, who: Requester) {
    vi.mocked(prisma.account.findMany).mockResolvedValueOnce([ACCOUNT] as never)
    vi.mocked(prisma.priceCache.findUnique).mockImplementation((async (args: { where: { ticker: string } }) =>
      args.where.ticker === '005930.KS' ? SAMSUNG : null) as never)
    ask.mockResolvedValueOnce({
      response: '{"type":"BUY","accountName":"세진","ticker":"005930.KS","shares":1,"price":70000,"currency":"KRW"}',
    } as never)
    const f = fakeOut(keyOf)
    decideTradeParse('세진 1주 샀어', who, f.out)
    await flush()
    const preview = f.sent[1]
    const action = preview.buttons![0][1].action
    return { tradeId: action.split(':')[2], messageKey: f.keys[1], preview }
  }

  it('확인 메시지는 plain · 버튼 한 행(확인 · 취소)', async () => {
    const { preview, tradeId } = await startTrade((i) => telegramMessageKey(1, i), { userId: '7', dbUserId: '7' })
    expect(preview.format).toBe('plain')
    expect(preview.buttons).toEqual([[
      { label: '✅ 확인', action: `aitrade:confirm:${tradeId}` },
      { label: '❌ 취소', action: `aitrade:cancel:${tradeId}` },
    ]])
  })

  it('같은 채널·메시지 번호라도 플랫폼이 다르면 다른 거래다', async () => {
    const id = fresh()
    const { tradeId } = await startTrade(() => telegramMessageKey(id, 42), { userId: '7', dbUserId: '7' })
    const b = fakeButtons()
    await decideAiTradeButton(`aitrade:cancel:${tradeId}`, { messageKey: discordMessageKey(String(id), '42'), clickerId: '7' }, b.out)
    expect(b.steps).toEqual([['toast', '⚠️ 만료된 거래입니다.'], ['removeButtons']])

    const owner = fakeButtons()
    await decideAiTradeButton(`aitrade:cancel:${tradeId}`, { messageKey: telegramMessageKey(id, 42), clickerId: '7' }, owner.out)
    expect(owner.steps).toEqual([['toast', '취소되었습니다.'], ['removeButtons'], ['edit', '❌ 거래가 취소되었습니다.']])
  })

  it('본인 확인은 문자열 비교 · 누른 사람 없음은 요청자가 "0" 이어도 거부', async () => {
    const key = discordMessageKey(String(fresh()), 'm1')
    const { tradeId } = await startTrade(() => key, { userId: '0', dbUserId: '0' })
    const anon = fakeButtons()
    await decideAiTradeButton(`aitrade:cancel:${tradeId}`, { messageKey: key, clickerId: undefined }, anon.out)
    expect(anon.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
    const zero = fakeButtons()
    await decideAiTradeButton(`aitrade:cancel:${tradeId}`, { messageKey: key, clickerId: '0' }, zero.out)
    expect(zero.steps[0]).toEqual(['toast', '취소되었습니다.'])
  })

  it('다른 접두는 아무것도 하지 않는다', async () => {
    const b = fakeButtons()
    await decideAiTradeButton('trade:confirm:x', { messageKey: 'k', clickerId: '7' }, b.out)
    expect(b.steps).toEqual([])
  })
})
