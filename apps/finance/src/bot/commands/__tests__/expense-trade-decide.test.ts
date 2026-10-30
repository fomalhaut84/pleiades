/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 P · A · S · B): 소비·거래 판단 함수를 플랫폼 없이 직접 건다.
 *
 * 텔레그램 호출열은 `*-telegram.test.ts` 가 고정한다. 여기서는 PR-3(Discord 수신)이 기댈 판단 계약을 본다 —
 * 메시지 키 격리(같은 숫자 · 다른 플랫폼) · `Requester.dbUserId` 가 `Transaction.userId` 로 간다(UQ-2 의 자리) ·
 * 명령 모양 판정은 어댑터가 준다(`!foo 3` 이 소비로 가지 않는다) · 인자 벗기기 · 정규식 상수가 등록된 객체와 같다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    category: { findUnique: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: vi.fn(),
    account: { findMany: vi.fn() },
    priceCache: { findUnique: vi.fn(), findMany: vi.fn() },
    holding: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/category-matcher', () => ({
  matchCategory: vi.fn(),
  suggestByHistory: vi.fn(),
  getAllCategories: vi.fn(),
}))
vi.mock('@/lib/ai/claude-advisor', () => ({ askAdvisor: vi.fn() }))
vi.mock('@/lib/whooing-webhook', () => ({ sendToWhooing: vi.fn() }))
vi.mock('@/bot/notifications/budget-alert', () => ({ checkBudgetUsage: vi.fn() }))
vi.mock('@/lib/trade-service', () => ({ createTrade: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAllCategories, matchCategory } from '@/lib/category-matcher'
import { checkBudgetUsage } from '@/bot/notifications/budget-alert'
import { createTrade } from '@/lib/trade-service'
import type { BotReply, ButtonOutput, ButtonPress, ReplyOutput, Requester } from '../../core/reply'
import { discordMessageKey, telegramMessageKey } from '../../core/state-key'
import {
  INCOME_RE,
  decideExpenseButton,
  decideExpenseInput,
  DESCRIPTION_DISPLAY_MAX,
  displayDescription,
  expenseFallbackRoute,
  registerExpenseCommands,
} from '../expense'
import { BUY_RE, SELL_RE, decideTrade, decideTradeButton, registerTradeCommands, tradeArgsFromText } from '../trade'
import { captureBot } from './telegram-fake'

/** 가짜 메시지 출력 — 보낸 메시지마다 `keyOf(n)` 키를 돌려준다. */
function fakeOut(keyOf: (n: number) => string) {
  const sent: BotReply[] = []
  const out: ReplyOutput = {
    reply: async (m) => {
      sent.push(m)
      return keyOf(sent.length - 1)
    },
    replyLong: async () => { throw new Error('replyLong 은 이 판단에서 쓰지 않는다') },
    replyFile: async () => { throw new Error('replyFile 은 이 판단에서 쓰지 않는다') },
    typing: async () => undefined,
    typingIntervalMs: 60_000,
  }
  return { out, sent }
}

function fakeButtons() {
  const steps: [string, unknown?][] = []
  const out: ButtonOutput = {
    toast: async (text) => {
      steps.push(text === undefined ? ['toast'] : ['toast', text])
    },
    removeButtons: async () => {
      steps.push(['removeButtons'])
    },
    edit: async (m) => {
      steps.push(['edit', m])
    },
  }
  return { out, steps }
}

const FOOD = { id: 'c-food', name: '식비', icon: '🍚', type: 'expense' }
const discordUser: Requester = { userId: '555', dbUserId: 'discord:555' }
const telegramUser: Requester = { userId: '555', dbUserId: '555' }

beforeEach(() => {
  vi.mocked(matchCategory).mockReset()
  vi.mocked(prisma.category.findUnique).mockReset()
  vi.mocked(prisma.transaction.create).mockReset()
  vi.mocked(checkBudgetUsage).mockResolvedValue(undefined)
  vi.mocked(createTrade).mockReset()
})

describe('설계 P — 정규식 상수가 텔레그램 등록 객체와 같다', () => {
  it('수입 · 매수 · 매도', () => {
    expect(captureBot(registerExpenseCommands).hears[0].re).toBe(INCOME_RE)
    const trade = captureBot(registerTradeCommands).hears.map((h) => h.re)
    expect(trade[0]).toBe(BUY_RE)
    expect(trade[1]).toBe(SELL_RE)
  })
})

describe('자유 텍스트 경로 — 명령 모양은 어댑터가 정한다', () => {
  it('Discord `!foo 3` 은 명령 모양이라 소비가 아니다 · 같은 텍스트도 명령이 아니면 소비', () => {
    expect(expenseFallbackRoute('!foo 3', true)).toBe('next')
    expect(expenseFallbackRoute('!foo 3', false)).toBe('expense')
    expect(expenseFallbackRoute('점심 12000', false)).toBe('expense')
    expect(expenseFallbackRoute('현황 3', false)).toBe('next')
  })
})

describe('설계 A — 인자 벗기기(텔레그램 원문)', () => {
  it.each([
    ['매수 세진 AAPL 10 150', 'BUY', '세진 AAPL 10 150'],
    ['매수', 'BUY', undefined],
    ['매수   ', 'BUY', ''], // 빈 인자도 사용법 안내(!args)
    ['매도  세진 X 1 2 ', 'SELL', '세진 X 1 2'],
  ] as const)('%s → %s', (text, type, args) => {
    expect(tradeArgsFromText(type, text)).toBe(args)
  })
})

describe('설계 S — 버튼 대기 상태는 플랫폼 메시지 키에 묶인다', () => {
  async function pendingOn(keyOf: (n: number) => string, who: Requester) {
    vi.mocked(matchCategory).mockResolvedValueOnce([FOOD])
    const { out, sent } = fakeOut(keyOf)
    await decideExpenseInput('점심 12000', out, who)
    const txId = sent[0].buttons![0][0].action.split(':')[2]
    return txId
  }

  it('Discord 에서 만든 대기를 같은 숫자의 텔레그램 메시지 키로는 찾지 못한다', async () => {
    const txId = await pendingOn(() => discordMessageKey('100', '5'), discordUser)
    const tg = fakeButtons()
    await decideExpenseButton(`tx:cancel:${txId}`, { messageKey: telegramMessageKey(100, 5), clickerId: '555' }, tg.out)
    expect(tg.steps).toEqual([['toast', '⚠️ 만료된 요청입니다.'], ['removeButtons']])
    const dc = fakeButtons()
    await decideExpenseButton(`tx:cancel:${txId}`, { messageKey: discordMessageKey('100', '5'), clickerId: '555' }, dc.out)
    expect(dc.steps[0]).toEqual(['toast', '취소되었습니다.'])
  })

  it('Requester.dbUserId 가 Transaction.userId 로 간다(텔레그램 "555" · Discord "discord:555")', async () => {
    for (const [who, keyOf] of [
      [telegramUser, () => telegramMessageKey(1, 1)],
      [discordUser, () => discordMessageKey('1', '2')],
    ] as const) {
      const txId = await pendingOn(keyOf, who)
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null)
      vi.mocked(prisma.transaction.create).mockResolvedValueOnce({
        amount: 12000,
        description: '점심',
        categoryId: 'c-food',
        transactedAt: new Date(),
      } as never)
      const b = fakeButtons()
      const press: ButtonPress = { messageKey: keyOf(), clickerId: '555' }
      await decideExpenseButton(`tx:confirm:${txId}`, press, b.out)
      expect(vi.mocked(prisma.transaction.create).mock.calls.at(-1)![0].data.userId).toBe(who.dbUserId)
      expect(b.steps.map((s) => s[0])).toEqual(['toast', 'removeButtons', 'edit'])
    }
  })

  it('본인 확인은 Requester.userId 와 비교 — 누른 사람 없음은 거부', async () => {
    const txId = await pendingOn(() => discordMessageKey('9', '9'), discordUser)
    const b = fakeButtons()
    await decideExpenseButton(`tx:cancel:${txId}`, { messageKey: discordMessageKey('9', '9'), clickerId: undefined }, b.out)
    expect(b.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
  })
})

describe('설계 B — 버튼 출력 단계 열', () => {
  it('trade cancel · confirm 은 toast → removeButtons → edit', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValueOnce([{ id: 'a1', name: '세진' }] as never)
    vi.mocked(prisma.priceCache.findUnique).mockImplementation((async (a: { where: { ticker: string } }) =>
      a.where.ticker === 'X' ? { ticker: 'X', displayName: 'x', market: 'KOSPI', currency: 'KRW', price: 10 } : null) as never)
    const { out, sent } = fakeOut(() => discordMessageKey('3', '4'))
    await decideTrade('BUY', '세진 x 1 10', out, discordUser)
    expect(sent[0].format).toBe('html')
    const tradeId = sent[0].buttons![0][0].action.split(':')[2]
    vi.mocked(createTrade).mockResolvedValueOnce({ trade: { totalKRW: 10 }, holding: null } as never)
    const b = fakeButtons()
    await decideTradeButton(`trade:confirm:${tradeId}`, { messageKey: discordMessageKey('3', '4'), clickerId: '555' }, b.out)
    expect(b.steps.map((s) => s[0])).toEqual(['toast', 'removeButtons', 'edit'])
    expect((b.steps[2][1] as BotReply).format).toBe('html')
  })
})

// 회귀: PR #399 Codex P2 · pleiades#400 — 버튼 붙은 본문이 Discord 2000자를 넘으면 버튼이 새 메시지로 옮겨 가 대기 상태 키와 어긋난다
describe('긴 소비 설명 — 기록 화면 표시는 줄이고 DB 에는 원문', () => {
  const long = '가'.repeat(1990)

  it('displayDescription — 한도 이하는 그대로 · 넘으면 한도 + …', () => {
    expect(displayDescription('점심')).toBe('점심')
    const shown = displayDescription(long)
    expect(Array.from(shown)).toHaveLength(DESCRIPTION_DISPLAY_MAX + 1)
    expect(shown.endsWith('…')).toBe(true)
  })

  it('카테고리 변경 본문(버튼 20 개) < 2000자 · 확인하면 원문이 기록된다', async () => {
    vi.mocked(matchCategory).mockResolvedValueOnce([FOOD])
    const { out, sent } = fakeOut(() => discordMessageKey('7', '8'))
    await decideExpenseInput(`${long} 12000`, out, discordUser)
    expect(Array.from(sent[0].text).length).toBeLessThan(2000)
    const txId = sent[0].buttons![0][0].action.split(':')[2]
    const press: ButtonPress = { messageKey: discordMessageKey('7', '8'), clickerId: '555' }

    const cats = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `카테고리${i}`, icon: '', type: 'expense' }))
    vi.mocked(getAllCategories).mockResolvedValueOnce(cats as never)
    const change = fakeButtons()
    await decideExpenseButton(`tx:change:${txId}`, press, change.out)
    const edited = change.steps.find((st) => st[0] === 'edit')![1] as BotReply
    expect(Array.from(edited.text).length).toBeLessThan(2000)
    expect(edited.buttons!.flat()).toHaveLength(21)

    vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.transaction.create).mockResolvedValueOnce({
      amount: 12000, description: long, categoryId: 'c-food', transactedAt: new Date(),
    } as never)
    await decideExpenseButton(`tx:confirm:${txId}`, press, fakeButtons().out)
    expect(vi.mocked(prisma.transaction.create).mock.calls.at(-1)![0].data.description).toBe(long)
  })
})
