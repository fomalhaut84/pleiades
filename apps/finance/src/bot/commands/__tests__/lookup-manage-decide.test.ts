/**
 * pleiades 009 D-3 PR-2a (pleiades#392) — 조회·관리 판단 함수 계약(설계 §4 P · A2).
 *
 * 텔레그램 호출열은 `lookup-telegram.test.ts` · `manage-telegram.test.ts` 가 고정한다. 여기서는
 * ① grammY 에 등록된 정규식이 export 한 상수와 **같은 객체**다 — PR-3 의 chat `hears` 가 같은 상수를 쓰면 의미가 갈리지 않는다(P)
 * ② 텔레그램 원문 → 인자 벗기기 표(A2 — Discord 는 라우터 `args` 를 그대로 넘긴다)
 * ③ 판단 함수가 인자와 응답 모델만으로 동작한다(플랫폼 무관)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchlist: { findUnique: vi.fn(), delete: vi.fn() },
    holding: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/price-fetcher', () => ({ fetchQuote: vi.fn(), searchYahooByName: vi.fn(), InvalidTickerError: class extends Error {} }))
vi.mock('@/lib/krx-stocks', () => ({ searchKrxByName: vi.fn() }))
vi.mock('@/lib/ta/engine', () => ({ generateTAReport: vi.fn() }))

import { prisma } from '@/lib/prisma'
import type { BotReply, ReplyOutput } from '../../core/reply'
import { decideHelp, decideStart, registerCommands } from '../start'
import { ACCOUNT_DETAIL_RE, PORTFOLIO_SUMMARY_RE, decideAccountDetail, registerPortfolioCommands } from '../portfolio'
import { FX_RATE_RE, PRICE_RE, decidePrice, registerPriceCommands } from '../price'
import { ANALYSIS_RE, analysisArgsFromText, decideAnalysis, registerAnalysisCommands } from '../analysis'
import { STRATEGY_LIST_RE, STRATEGY_RE, decideStrategy, registerStrategyCommands, strategyArgsFromText } from '../strategy'
import {
  UNWATCH_RE, WATCHLIST_RE, WATCH_RE, decideUnwatch, decideWatch, registerWatchlistCommands, unwatchArgsFromText, watchArgsFromText,
} from '../watchlist'
import {
  ASSET_ADD_RE, ASSET_LIST_RE, ASSET_UPDATE_RE, NET_WORTH_RE, assetAddArgsFromText, assetUpdateArgsFromText, decideAssetAdd,
  registerNetWorthCommands,
} from '../networth'
import {
  BUDGET_SET_RE, BUDGET_STATUS_RE, EXPENSE_SUMMARY_RE, INCOME_SUMMARY_RE, decideBudgetSet, registerBudgetCommands,
} from '../budget'
import { captureBot } from './telegram-fake'

/** 가짜 출력 — reply 는 plain/html 을, replyLong 은 html 본문을 따로 남긴다. */
function fakeOut() {
  const sent: (BotReply | { long: string })[] = []
  const typing = vi.fn(async () => undefined)
  const out: ReplyOutput = {
    reply: async (m) => { sent.push(m); return 'k' },
    replyLong: async (html) => { sent.push({ long: html }) },
    typing,
    typingIntervalMs: 60_000,
  }
  return { out, sent, typing }
}

beforeEach(() => {
  vi.mocked(prisma.watchlist.findUnique).mockReset()
  vi.mocked(prisma.holding.findMany).mockReset()
})

describe('정규식 상수 = 등록 객체 (P)', () => {
  it.each([
    ['portfolio', registerPortfolioCommands, [PORTFOLIO_SUMMARY_RE, ACCOUNT_DETAIL_RE]],
    ['price', registerPriceCommands, [PRICE_RE, FX_RATE_RE]],
    ['analysis', registerAnalysisCommands, [ANALYSIS_RE]],
    ['strategy', registerStrategyCommands, [STRATEGY_RE, STRATEGY_LIST_RE]],
    ['watchlist', registerWatchlistCommands, [WATCH_RE, UNWATCH_RE, WATCHLIST_RE]],
    ['networth', registerNetWorthCommands, [NET_WORTH_RE, ASSET_LIST_RE, ASSET_ADD_RE, ASSET_UPDATE_RE]],
    ['budget', registerBudgetCommands, [EXPENSE_SUMMARY_RE, INCOME_SUMMARY_RE, BUDGET_STATUS_RE, BUDGET_SET_RE]],
  ] as const)('%s', (_name, register, constants) => {
    const bot = captureBot(register as never)
    expect(bot.hears.map((h) => h.re)).toHaveLength(constants.length)
    bot.hears.forEach((h, i) => expect(h.re).toBe(constants[i]))
  })

  it('start 는 영어 명령뿐', () => {
    expect(captureBot(registerCommands).hears).toEqual([])
  })

  it('정확 일치 명령은 "이름 + 다른 말" 을 잡지 않는다(그 말은 소비·AI fallback 으로 간다)', () => {
    for (const [re, text] of [
      [PORTFOLIO_SUMMARY_RE, '현황 어때?'], [FX_RATE_RE, '환율 알려줘'], [STRATEGY_LIST_RE, '전략목록 보여줘'],
      [WATCHLIST_RE, '관심목록 정리'], [NET_WORTH_RE, '순자산 얼마?'], [ASSET_LIST_RE, '자산목록 줘'],
      [EXPENSE_SUMMARY_RE, '소비 패턴 분석해줘'], [INCOME_SUMMARY_RE, '수입 10000'], [BUDGET_STATUS_RE, '예산 어때'],
    ] as const) expect(re.test(text)).toBe(false)
    expect(WATCH_RE.test('관심삭제 X')).toBe(false)
    expect(WATCH_RE.test('관심목록')).toBe(false)
  })
})

describe('원문 → 인자 (A2)', () => {
  it.each([
    [analysisArgsFromText, '/analysis@MyBot  nvda ', 'nvda'],
    [analysisArgsFromText, '/분석 tsla', 'tsla'],
    [analysisArgsFromText, '분석', ''],
    [strategyArgsFromText, '/strategy NVDA 스윙', 'NVDA 스윙'],
    [strategyArgsFromText, '전략   세진 NVDA ', '세진 NVDA'],
    [watchArgsFromText, '/WATCH@bot sofi 단타', 'sofi 단타'],
    [watchArgsFromText, '관심', ''],
    [watchArgsFromText, '관심종목', '관심종목'],
    [unwatchArgsFromText, '관심삭제  sofi', 'sofi'],
    [assetAddArgsFromText, '/assetadd@b 적금 적금 100', '적금 적금 100'],
    [assetUpdateArgsFromText, '자산수정 적금 1,000', '적금 1,000'],
  ])('%#', (fn, text, args) => {
    expect(fn(text)).toBe(args)
  })
})

describe('판단 — 인자와 응답 모델만', () => {
  it('start 이름 escape · 없으면 사용자 · help 는 같은 도움말', async () => {
    const a = fakeOut()
    await decideStart('<A>', a.out)
    const b = fakeOut()
    await decideHelp(b.out)
    const start = (a.sent[0] as { long: string }).long
    const help = (b.sent[0] as { long: string }).long
    expect(start).toContain('<b>&lt;A&gt;</b>님')
    expect(start.endsWith(help)).toBe(true)
  })

  it('사용법은 plain · 목록·결과는 replyLong(html)', async () => {
    const usage = fakeOut()
    await decideStrategy('', usage.out)
    expect(usage.sent.map((m) => ('long' in m ? 'long' : m.format))).toEqual(['plain'])

    const analysis = fakeOut()
    await decideAnalysis('', analysis.out)
    expect(analysis.sent.map((m) => ('long' in m ? 'long' : m.format))).toEqual(['long'])
    expect(analysis.typing).not.toHaveBeenCalled()
  })

  it('Discord 라우터 args 그대로 — 관심삭제는 대문자로 찾는다 · 관심 사용법', async () => {
    vi.mocked(prisma.watchlist.findUnique).mockResolvedValueOnce(null as never)
    const f = fakeOut()
    await decideUnwatch('sofi', f.out)
    expect(prisma.watchlist.findUnique).toHaveBeenCalledWith({ where: { ticker: 'SOFI' } })
    const w = fakeOut()
    await decideWatch('', w.out)
    expect((w.sent[0] as BotReply).text.startsWith('👀 관심종목 관리')).toBe(true)
  })

  it('원문을 쓰는 파싱 — 계좌 · 주가 · 예산설정은 이름이 없으면 사용법', async () => {
    const outs = [fakeOut(), fakeOut(), fakeOut()]
    await decideAccountDetail('계좌', outs[0].out)
    await decidePrice('주가', outs[1].out)
    await decideBudgetSet('예산설정', outs[2].out)
    expect(outs.map((o) => (o.sent[0] as BotReply).text.split('\n')[0])).toEqual([
      '사용법: 계좌 [이름]', '사용법: 주가 [종목명 또는 티커]', '사용법: 예산설정 [금액]',
    ])
  })

  it('자산추가 인자 부족 → plain 안내', async () => {
    const f = fakeOut()
    await decideAssetAdd('적금 적금', f.out)
    expect(f.sent).toEqual([{ text: '⚠️ 사용법: 자산추가 [이름] [카테고리] [금액]', format: 'plain' }])
  })
})
