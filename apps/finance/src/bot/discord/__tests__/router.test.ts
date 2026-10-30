/**
 * pleiades 009 D-3 PR-3 (pleiades#398) — Discord 라우팅 표(설계 §4 P · A · B · D · H · T "Discord 라우팅 표").
 *
 * 판단 함수는 텔레그램 특성 테스트·판단 계약 테스트가 이미 고정했다 — 여기서는 판단을 가짜로 바꾸고
 * ① 어느 텍스트가 어느 판단으로 · 어떤 인자로 가는가 ② 명령 모양 · 첨부만 · 정확 일치 명령의 "이름 + 다른 말" 은 fallback
 * ③ 버튼 접두 5 + 알 수 없는 접두 ④ 정적 안내 감싸기 ⑤ 브리핑 응답 대상 = 요청 채널 · `!ai` — 를 본다.
 * 정규식 상수와 원문 벗기기 식은 진짜를 쓴다(텔레그램과 같은 객체).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/trade-service', () => ({ createTrade: vi.fn() }))
vi.mock('@/lib/whooing-webhook', () => ({ sendToWhooing: vi.fn() }))
vi.mock('@/bot/notifications/budget-alert', () => ({ checkBudgetUsage: vi.fn() }))
vi.mock('@/bot/notifications/briefing', () => ({ sendBriefing: vi.fn() }))
vi.mock('@/lib/ai/claude-advisor', async (o) => ({ ...(await o<typeof import('@/lib/ai/claude-advisor')>()), askAdvisor: vi.fn() }))
vi.mock('@/bot/notifications/notifier', async (o) => ({
  ...(await o<typeof import('@/bot/notifications/notifier')>()),
  notifierForDiscordChannel: vi.fn(() => ({ tag: 'req-notifier' })),
}))
vi.mock('@/bot/commands/vest-confirm', async (o) => ({
  ...(await o<typeof import('@/bot/commands/vest-confirm')>()),
  decideVest: vi.fn(async () => ({ kind: 'alert', text: '없는 RSU' })),
}))
const { fake } = vi.hoisted(() => ({ fake: () => vi.fn(async () => undefined) }))
vi.mock('../../commands/ai', async (o) => ({
  ...(await o<typeof import('../../commands/ai')>()),
  decideAiCommand: fake(), decideReset: fake(), decideAiQuestion: vi.fn(), decideTradeParse: vi.fn(), decideAiTradeButton: fake(),
}))
vi.mock('../../commands/alert', async (o) => ({ ...(await o<typeof import('../../commands/alert')>()), decideAlertConfig: fake() }))
vi.mock('../../commands/analysis', async (o) => ({ ...(await o<typeof import('../../commands/analysis')>()), decideAnalysis: fake() }))
vi.mock('../../commands/backtest', async (o) => ({ ...(await o<typeof import('../../commands/backtest')>()), decideBacktest: fake() }))
vi.mock('../../commands/briefing', async (o) => ({ ...(await o<typeof import('../../commands/briefing')>()), decideBriefing: fake() }))
vi.mock('../../commands/budget', async (o) => ({
  ...(await o<typeof import('../../commands/budget')>()),
  decideBudgetSet: fake(), decideBudgetStatus: fake(), decideTransactionSummary: fake(),
}))
vi.mock('../../commands/custom-strategy', async (o) => ({
  ...(await o<typeof import('../../commands/custom-strategy')>()),
  decideCustomStrategyRegister: fake(), decideCustomStrategyList: fake(), decideCustomStrategyDelete: fake(),
}))
vi.mock('../../commands/expense', async (o) => ({
  ...(await o<typeof import('../../commands/expense')>()),
  decideExpenseInput: fake(), decideExpenseButton: fake(), decideMultiExpenseButton: fake(),
}))
vi.mock('../../commands/networth', async (o) => ({
  ...(await o<typeof import('../../commands/networth')>()),
  decideNetWorth: fake(), decideAssetList: fake(), decideAssetAdd: fake(), decideAssetUpdate: fake(),
}))
vi.mock('../../commands/portfolio', async (o) => ({
  ...(await o<typeof import('../../commands/portfolio')>()),
  decidePortfolioSummary: fake(), decideAccountDetail: fake(),
}))
vi.mock('../../commands/price', async (o) => ({ ...(await o<typeof import('../../commands/price')>()), decidePrice: fake(), decideFxRate: fake() }))
vi.mock('../../commands/report', async (o) => ({ ...(await o<typeof import('../../commands/report')>()), decideReport: fake() }))
vi.mock('../../commands/start', async (o) => ({ ...(await o<typeof import('../../commands/start')>()), decideStart: fake(), decideHelp: fake() }))
vi.mock('../../commands/strategy', async (o) => ({
  ...(await o<typeof import('../../commands/strategy')>()),
  decideStrategy: fake(), decideStrategyList: fake(),
}))
vi.mock('../../commands/trade', async (o) => ({ ...(await o<typeof import('../../commands/trade')>()), decideTrade: fake(), decideTradeButton: fake() }))
vi.mock('../../commands/watchlist', async (o) => ({
  ...(await o<typeof import('../../commands/watchlist')>()),
  decideWatch: fake(), decideUnwatch: fake(), decideWatchlist: fake(),
}))

import { decideVest } from '@/bot/commands/vest-confirm'
import { notifierForDiscordChannel } from '@/bot/notifications/notifier'
import * as ai from '../../commands/ai'
import * as alert from '../../commands/alert'
import * as analysis from '../../commands/analysis'
import * as backtest from '../../commands/backtest'
import * as briefing from '../../commands/briefing'
import * as budget from '../../commands/budget'
import * as custom from '../../commands/custom-strategy'
import * as expense from '../../commands/expense'
import * as networth from '../../commands/networth'
import * as portfolio from '../../commands/portfolio'
import * as price from '../../commands/price'
import * as report from '../../commands/report'
import * as start from '../../commands/start'
import * as strategy from '../../commands/strategy'
import * as trade from '../../commands/trade'
import * as watchlist from '../../commands/watchlist'
import { ENGLISH_COMMANDS } from '../reply'
import { UNKNOWN_BUTTON_TEXT } from '../vest-button'
import { createDiscordRouter, DISCORD_AI_COMMAND } from '../router'

const DECIDES = [
  ai.decideAiCommand, ai.decideReset, ai.decideAiQuestion, ai.decideTradeParse, ai.decideAiTradeButton,
  alert.decideAlertConfig, analysis.decideAnalysis, backtest.decideBacktest, briefing.decideBriefing,
  budget.decideBudgetSet, budget.decideBudgetStatus, budget.decideTransactionSummary,
  custom.decideCustomStrategyRegister, custom.decideCustomStrategyList, custom.decideCustomStrategyDelete,
  expense.decideExpenseInput, expense.decideExpenseButton, expense.decideMultiExpenseButton,
  networth.decideNetWorth, networth.decideAssetList, networth.decideAssetAdd, networth.decideAssetUpdate,
  portfolio.decidePortfolioSummary, portfolio.decideAccountDetail, price.decidePrice, price.decideFxRate,
  report.decideReport, start.decideStart, start.decideHelp, strategy.decideStrategy, strategy.decideStrategyList,
  trade.decideTrade, trade.decideTradeButton, watchlist.decideWatch, watchlist.decideUnwatch, watchlist.decideWatchlist,
].map((f) => vi.mocked(f as (...a: unknown[]) => unknown))

const router = createDiscordRouter()

function msg(text: string, attachments: unknown[] = []) {
  return {
    platform: 'discord' as const,
    userId: 'u1',
    channelId: 'c1',
    messageId: 'm1',
    text,
    attachments,
    sentAt: 0,
    typing: vi.fn(async () => undefined),
    reply: vi.fn(async () => ({ id: 'r', channelId: 'c1', edit: vi.fn(), setButtons: vi.fn(), delete: vi.fn() })),
    replyFile: vi.fn(),
  }
}
function btn(action: string) {
  return {
    platform: 'discord' as const,
    action,
    userId: 'u1',
    channelId: 'c1',
    messageId: 'm7',
    edit: vi.fn(async () => {}),
    setButtons: vi.fn(async () => {}),
    notice: vi.fn(async () => {}),
    send: vi.fn(),
  }
}
const called = () => DECIDES.filter((f) => f.mock.calls.length > 0)
const send = async (text: string) => {
  const c = msg(text)
  await router.handleMessage(c as never)
  return c
}

beforeEach(() => {
  for (const f of DECIDES) f.mockClear()
  vi.mocked(decideVest).mockClear()
})

describe('영어 이름 21 — `!` 명령 · 인자 = 라우터 args', () => {
  it.each(ENGLISH_COMMANDS.map((n) => [n]))('!%s 는 판단 하나로 간다(fallback 아님)', async (name) => {
    await send(`!${name} x`)
    expect(called()).toHaveLength(1)
    expect([expense.decideExpenseInput, ai.decideAiQuestion]).not.toContain(called()[0])
  })

  it.each([
    ['!analysis nvda', analysis.decideAnalysis, 'nvda'],
    ['!REPORT 2026 1', report.decideReport, '2026 1'],
    ['!backtest NVDA rsi 365', backtest.decideBacktest, 'NVDA rsi 365'],
    ['!watch sofi 단타', watchlist.decideWatch, 'sofi 단타'],
    ['!alertconfig 급락 -3', alert.decideAlertConfig, '급락 -3'],
  ] as const)('%s', async (text, decide, args) => {
    await send(text)
    expect(vi.mocked(decide).mock.calls[0][0]).toBe(args)
  })

  it('!start — 이름 없이 · !ai · !reset — 상태 키 discord:<채널>:<사용자>', async () => {
    await send('!start')
    expect(vi.mocked(start.decideStart).mock.calls[0][0]).toBeUndefined()
    await send('!ai 질문 있어')
    expect(vi.mocked(ai.decideAiCommand).mock.calls[0].slice(0, 2)).toEqual(['질문 있어', 'discord:c1:u1'])
    await send('!reset')
    expect(vi.mocked(ai.decideReset).mock.calls[0][0]).toBe('discord:c1:u1')
  })

  it('접두 없는 영어 이름은 명령이 아니다(`report 2026` → 자유 텍스트)', async () => {
    await send('report 2026')
    expect(report.decideReport).not.toHaveBeenCalled()
  })
})

describe('한글 28 — 텔레그램과 같은 정규식 · 같은 인자', () => {
  it.each([
    ['현황', portfolio.decidePortfolioSummary, undefined],
    ['계좌 소담', portfolio.decideAccountDetail, '계좌 소담'],
    ['주가 NVDA', price.decidePrice, '주가 NVDA'],
    ['환율', price.decideFxRate, undefined],
    ['소비', budget.decideTransactionSummary, 'expense'],
    ['수입', budget.decideTransactionSummary, 'income'],
    ['수입 월급 3000000', expense.decideExpenseInput, '수입 월급 3000000'],
    ['예산', budget.decideBudgetStatus, undefined],
    ['예산설정 1000000', budget.decideBudgetSet, '예산설정 1000000'],
    ['알림설정 급락 -3', alert.decideAlertConfig, '급락 -3'],
    ['알림설정', alert.decideAlertConfig, ''],
    ['전략 NVDA 스윙', strategy.decideStrategy, 'NVDA 스윙'],
    ['전략목록', strategy.decideStrategyList, undefined],
    ['커스텀전략등록 SOXL 40', custom.decideCustomStrategyRegister, 'SOXL 40'],
    ['커스텀전략목록', custom.decideCustomStrategyList, undefined],
    ['커스텀전략삭제 abc', custom.decideCustomStrategyDelete, 'abc'],
    ['관심 sofi', watchlist.decideWatch, 'sofi'],
    ['관심삭제 sofi', watchlist.decideUnwatch, 'sofi'],
    ['관심목록', watchlist.decideWatchlist, undefined],
    ['분석 tsla', analysis.decideAnalysis, 'tsla'],
    ['브리핑 한국', briefing.decideBriefing, '한국'],
    ['순자산', networth.decideNetWorth, undefined],
    ['자산목록', networth.decideAssetList, undefined],
    ['자산추가 적금 적금 100', networth.decideAssetAdd, '적금 적금 100'],
    ['자산수정 적금 1,000', networth.decideAssetUpdate, '적금 1,000'],
    ['리포트 2026 1', report.decideReport, '2026 1'],
    ['백테스트 NVDA rsi 365', backtest.decideBacktest, 'NVDA rsi 365'],
  ] as const)('%s', async (text, decide, first) => {
    await send(text)
    expect(called()).toEqual([vi.mocked(decide)])
    const arg = vi.mocked(decide).mock.calls[0][0]
    if (first === undefined) expect(typeof arg).toBe('object') // 첫 인자가 응답 출력
    else expect(arg).toBe(first)
  })

  it('매수 · 매도 — 텔레그램 벗기기 식 · 요청자 discord', async () => {
    await send('매수 소담 NVDA 1 100')
    await send('매도 소담 NVDA 1 100')
    const calls = vi.mocked(trade.decideTrade).mock.calls
    expect(calls.map((c) => [c[0], c[1]])).toEqual([
      ['BUY', trade.tradeArgsFromText('BUY', '매수 소담 NVDA 1 100')],
      ['SELL', trade.tradeArgsFromText('SELL', '매도 소담 NVDA 1 100')],
    ])
    expect(calls[0][3]).toEqual({ userId: 'u1', dbUserId: 'discord:u1' })
  })

  it('`!현황` 은 명령이 아니고 소비·AI 로도 가지 않는다(텔레그램 `/현황` 과 같다)', async () => {
    await send('!현황')
    expect(called()).toEqual([])
  })

  it('정확 일치 명령의 "이름 + 다른 말" 은 명령이 아니다', async () => {
    await send('현황 어때?')
    expect(portfolio.decidePortfolioSummary).not.toHaveBeenCalled()
    await send('소비 패턴 분석해줘')
    expect(budget.decideTransactionSummary).not.toHaveBeenCalled()
  })
})

describe('자유 텍스트 fallback', () => {
  it('금액 → 소비 기록(요청자 discord · DB 표기 discord:<id>)', async () => {
    await send('점심 12000')
    expect(vi.mocked(expense.decideExpenseInput).mock.calls[0][0]).toBe('점심 12000')
    expect(vi.mocked(expense.decideExpenseInput).mock.calls[0][2]).toEqual({ userId: 'u1', dbUserId: 'discord:u1' })
  })

  it('등록되지 않은 `!foo 3` → 소비 아님 · AI 아님', async () => {
    await send('!foo 3')
    expect(called()).toEqual([])
  })

  it('AI 질문 → 상태 키 discord:<채널>:<사용자>', async () => {
    await send('엔비디아 전망 어때?')
    expect(vi.mocked(ai.decideAiQuestion).mock.calls[0].slice(0, 2)).toEqual(['엔비디아 전망 어때?', 'discord:c1:u1'])
  })

  it('첨부만 있는 메시지(빈 텍스트) → 무응답 · 판단 0', async () => {
    const c = msg('', [{ id: 'a' }])
    await router.handleMessage(c as never)
    expect(called()).toEqual([])
    expect(c.reply).not.toHaveBeenCalled()
  })
})

describe('정적 안내 감싸기 — 텔레그램 등록부와 같은 문구', () => {
  it('현황 실패 → 로그 + 안내(원문 없음)', async () => {
    vi.mocked(portfolio.decidePortfolioSummary).mockRejectedValueOnce(new Error('db down secret'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const c = await send('현황')
    expect(c.reply).toHaveBeenCalledWith('⚠️ 포트폴리오 조회에 실패했습니다.')
    err.mockRestore()
  })
})

describe('브리핑 — 요청 채널 · !ai (D2)', () => {
  it('대상 = 그 채널의 notifier · aiCommand !ai', async () => {
    await send('!briefing 미국')
    const [args, target, , options] = vi.mocked(briefing.decideBriefing).mock.calls[0]
    expect(args).toBe('미국')
    expect(options).toEqual({ aiCommand: DISCORD_AI_COMMAND })
    expect(DISCORD_AI_COMMAND).toBe('!ai')
    expect(target?.({})).toEqual({ tag: 'req-notifier' })
    expect(notifierForDiscordChannel).toHaveBeenCalledWith('c1')
  })
})

describe('버튼 — 접두 5 + 알 수 없는 접두', () => {
  it.each([
    ['tx:cancel:t1', expense.decideExpenseButton],
    ['multi:confirm:t1', expense.decideMultiExpenseButton],
    ['trade:confirm:t1', trade.decideTradeButton],
    ['aitrade:confirm:t1', ai.decideAiTradeButton],
  ] as const)('%s', async (action, decide) => {
    const c = btn(action)
    await expect(router.handleButton(c as never)).resolves.toBe(true)
    expect(called()).toEqual([vi.mocked(decide)])
    const [data, press] = vi.mocked(decide).mock.calls[0]
    expect(data).toBe(action)
    expect(press).toEqual({ messageKey: 'discord:c1:m7', clickerId: 'u1' })
  })

  it('판단이 본문을 안 바꾸고 토스트만 → 본인 안내 1', async () => {
    vi.mocked(expense.decideExpenseButton).mockImplementationOnce(async (_d, _p, out) => {
      await out.toast('⏰ 만료된 요청입니다.')
    })
    const c = btn('tx:cat:t1:x')
    await router.handleButton(c as never)
    expect(c.notice).toHaveBeenCalledWith('⏰ 만료된 요청입니다.')
  })

  // 회귀: PR-3 9-1 리뷰 info — 판단이 던져도 모아 둔 토스트는 나간다(예외는 그대로 chat 으로)
  it('판단이 던져도 토스트는 본인 안내로 · 예외는 다시 던진다', async () => {
    vi.mocked(expense.decideExpenseButton).mockImplementationOnce(async (_d, _p, out) => {
      await out.toast('취소됨')
      throw new Error('edit 실패')
    })
    const c = btn('tx:cancel:t1')
    await expect(router.handleButton(c as never)).rejects.toThrow('edit 실패')
    expect(c.notice).toHaveBeenCalledWith('취소됨')
  })

  it('vest: → decideVest · 알 수 없는 접두 → 안내', async () => {
    const v = btn('vest:confirm:r1')
    await router.handleButton(v as never)
    expect(decideVest).toHaveBeenCalledWith('vest:confirm:r1')
    const u = btn('food:x')
    await expect(router.handleButton(u as never)).resolves.toBe(true)
    expect(u.notice).toHaveBeenCalledWith(UNKNOWN_BUTTON_TEXT)
  })
})
