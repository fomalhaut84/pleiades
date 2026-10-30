/**
 * pleiades 009 D-3 PR-2a (pleiades#392) — 관리 명령 텔레그램 특성 테스트: 전략·전략목록 · 관심·관심삭제·관심목록 ·
 * 순자산·자산목록·자산추가·자산수정 · 소비·수입·예산·예산설정.
 *
 * `lookup-telegram.test.ts` 와 같은 방식 — 판단 분리 **전** 코드에서 스냅샷을 만들고 분리 뒤 같은지 본다(호출열 동등).
 * 인자 벗기기(T11)와 DB 쓰기 인자는 명시 단언으로 고정한다. 날짜가 들어가는 명령은 시계를 고정한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    holding: { findMany: vi.fn(), findFirst: vi.fn() },
    holdingStrategy: { upsert: vi.fn() },
    priceCache: { findUnique: vi.fn(), findMany: vi.fn() },
    watchlist: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    asset: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    netWorthSnapshot: { findFirst: vi.fn() },
    transaction: { groupBy: vi.fn(), aggregate: vi.fn() },
    category: { findMany: vi.fn() },
    budget: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/price-fetcher', () => ({ fetchQuote: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { fetchQuote } from '@/lib/price-fetcher'
import { registerStrategyCommands } from '../strategy'
import { registerWatchlistCommands } from '../watchlist'
import { registerNetWorthCommands } from '../networth'
import { registerBudgetCommands } from '../budget'
import { captureBot, fakeCtx, flush, type FakeCtxOptions } from './telegram-fake'

const p = vi.mocked(prisma, { deep: true })
const quote = vi.mocked(fetchQuote)

const strategy = captureBot(registerStrategyCommands)
const watch = captureBot(registerWatchlistCommands)
const networth = captureBot(registerNetWorthCommands)
const budget = captureBot(registerBudgetCommands)

type Handler = (ctx: unknown, next: () => Promise<void>) => Promise<void>
type Bot = ReturnType<typeof captureBot>

async function run(handler: Handler, text: string, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text, ...opts })
  await handler(f.ctx, vi.fn())
  return f
}
const cmd = (bot: Bot, name: string) => bot.commands.find((c) => c.name === name)!.handler
const hears = (bot: Bot, i: number) => bot.hears[i].handler

function resetAll(obj: unknown): void {
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as { mockReset: () => void }).mockReset()
    else if (v && typeof v === 'object') resetAll(v)
  }
}

beforeEach(() => {
  resetAll(p)
  quote.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.useRealTimers())

describe('등록', () => {
  it('명령·정규식 · 순서', () => {
    expect(strategy.commands.map((c) => c.name)).toEqual(['strategy', 'strategylist'])
    expect(strategy.hears.map((x) => x.re.source)).toEqual(['^전략(?:\\s+.*)?$', '^전략목록\\s*$'])
    expect(watch.commands.map((c) => c.name)).toEqual(['watch', 'unwatch', 'watchlist'])
    expect(watch.hears.map((x) => x.re.source)).toEqual(['^관심(?!삭제|목록)(?:\\s+.*)?$', '^관심삭제(?:\\s+.*)?$', '^관심목록\\s*$'])
    expect(networth.commands.map((c) => c.name)).toEqual(['networth', 'assetlist', 'assetadd', 'assetupdate'])
    expect(networth.hears.map((x) => x.re.source)).toEqual(['^순자산\\s*$', '^자산목록\\s*$', '^자산추가(?:\\s+.*)?$', '^자산수정(?:\\s+.*)?$'])
    expect(budget.commands).toEqual([])
    expect(budget.hears.map((x) => x.re.source)).toEqual(['^소비\\s*$', '^수입\\s*$', '^예산\\s*$', '^예산설정(?:\\s+.*)?$'])
  })
})

describe('전략', () => {
  const HOLDING = {
    id: 'h1', ticker: 'NVDA', displayName: 'NVIDIA', account: { name: '세진' },
    strategy: { strategy: 'swing', memo: '메모<1>', targetPrice: 160, stopLoss: 110, entryLow: 120, entryHigh: 130, reviewDate: new Date('2026-12-01T00:00:00Z') },
  }

  it('인자 없음 → 사용법(plain) · /strategy 와 전략 둘 다', async () => {
    const a = await run(cmd(strategy, 'strategy'), '/strategy')
    const b = await run(hears(strategy, 0), '전략')
    expect(a.calls).toEqual(b.calls)
    expect(a.calls).toMatchSnapshot()
  })

  it('현재 동작 — /strategy@bot 은 벗겨지지 않아 "@bot" 이 종목이 된다', async () => {
    p.holding.findMany.mockResolvedValueOnce([] as never)
    const f = await run(cmd(strategy, 'strategy'), '/strategy@MyBot NVDA')
    expect(p.holding.findMany.mock.calls[0][0]).toMatchObject({ where: { OR: [{ ticker: '@MYBOT' }, { displayName: { equals: '@MyBot' } }] } })
    expect(f.calls).toEqual([['reply', '⚠️ 보유 종목을 찾을 수 없습니다: @MyBot']])
  })

  it('종목만 → 현재 전략(plain) · 질의 = 티커 대문자 + 이름', async () => {
    p.holding.findMany.mockResolvedValueOnce([HOLDING] as never)
    const f = await run(hears(strategy, 0), '전략  nvda ')
    expect(p.holding.findMany.mock.calls[0][0]).toStrictEqual({
      where: { OR: [{ ticker: 'NVDA' }, { displayName: { equals: 'nvda', mode: 'insensitive' } }] },
      include: { strategy: true, account: { select: { name: true } } },
      take: 5,
    })
    expect(f.calls).toMatchSnapshot()
  })

  it('계좌명 먼저 → 계좌 필터 · 여러 계좌 후보 안내', async () => {
    p.holding.findMany.mockResolvedValueOnce([HOLDING, { ...HOLDING, account: { name: '소담' } }] as never)
    const f = await run(hears(strategy, 0), '전략 세진 NVDA')
    expect(p.holding.findMany.mock.calls[0][0]).toMatchObject({ where: { account: { name: '세진' } } })
    expect(f.calls).toMatchSnapshot()
  })

  it('전략 변경 + 점검일 + 메모 → upsert · 확인(plain)', async () => {
    p.holding.findMany.mockResolvedValueOnce([HOLDING] as never)
    const f = await run(hears(strategy, 0), '전략 NVDA 스윙 점검일 2026-06-01 "3일선 돌파"')
    expect(p.holdingStrategy.upsert.mock.calls[0][0]).toStrictEqual({
      where: { holdingId: 'h1' },
      update: { strategy: 'swing', memo: '3일선 돌파', reviewDate: new Date('2026-06-01') },
      create: { holdingId: 'h1', strategy: 'swing', memo: '3일선 돌파', reviewDate: new Date('2026-06-01') },
    })
    expect(f.calls).toMatchSnapshot()
  })

  it('목표가 · 손절 · 매수구간 · 메모 · 점검일 · 잘못된 값 · 알 수 없는 하위 명령', async () => {
    const outs: unknown[] = []
    for (const text of [
      '전략 NVDA 목표가 160', '전략 NVDA 목표가 x', '전략 NVDA 손절 110', '전략 NVDA 손절 -1',
      '전략 NVDA 매수구간 120 130', '전략 NVDA 매수구간 130 120', '전략 NVDA 메모 "새 메모"', '전략 NVDA 메모',
      '전략 NVDA 점검일 2026-07-01', '전략 NVDA 점검일 나중', '전략 NVDA 뭐지',
    ]) {
      p.holding.findMany.mockResolvedValueOnce([HOLDING] as never)
      outs.push((await run(hears(strategy, 0), text)).calls)
    }
    expect(outs).toMatchSnapshot()
    expect(p.holdingStrategy.upsert.mock.calls.map((c) => (c[0] as { update: unknown }).update)).toMatchSnapshot()
  })

  it('전략목록 → html · 빈 계좌는 건너뛴다', async () => {
    p.account.findMany.mockResolvedValueOnce([
      { name: '세진', holdings: [{ ticker: 'NVDA', displayName: 'N<V>', strategy: HOLDING.strategy }, { ticker: 'X', displayName: 'X', strategy: null }] },
      { name: '다솜', holdings: [] },
    ] as never)
    const a = await run(hears(strategy, 1), '전략목록')
    expect(a.calls).toMatchSnapshot()
  })

  it('처리 중 던지면 그대로 던진다(등록에 catch 없음)', async () => {
    p.holding.findMany.mockRejectedValueOnce(new Error('db'))
    const f = fakeCtx({ text: '전략 NVDA' })
    await expect(hears(strategy, 0)(f.ctx, vi.fn())).rejects.toThrow('db')
  })
})

describe('관심 · 관심삭제 · 관심목록', () => {
  it('인자 없음 → 사용법 · /watch@bot · 관심 · "관심종목" 은 관심 + 종목명으로 벗기지 않는다', async () => {
    const a = await run(cmd(watch, 'watch'), '/watch@MyBot')
    const b = await run(hears(watch, 0), '관심')
    expect(a.calls).toEqual(b.calls)
    expect(a.calls).toMatchSnapshot()
    p.holding.findFirst.mockResolvedValueOnce(null as never)
    p.priceCache.findUnique.mockResolvedValueOnce(null as never)
    p.priceCache.findMany.mockResolvedValueOnce([] as never)
    quote.mockResolvedValueOnce({} as never)
    await run(hears(watch, 0), '관심종목')
    expect(p.holding.findFirst.mock.calls[0][0]).toStrictEqual({ where: { ticker: '관심종목' } })
  })

  // PR-2c (#396 · UQ-3) 이전: plain 안내가 escapeHtml 을 거쳐 & 가 &amp; 로 보였다
  it('보유 중 → 안내(plain · escape 하지 않는다 — PR-2c 수정)', async () => {
    p.holding.findFirst.mockResolvedValueOnce({ id: 'h' } as never)
    const f = await run(hears(watch, 0), '관심 a&b')
    expect(f.calls).toEqual([['reply', '⚠️ A&B은(는) 이미 보유 중입니다. /전략 커맨드로 관리하세요.']])
  })

  it('이름 여럿 → 후보(html) · 이름으로 찾은 티커가 보유 중 → 안내', async () => {
    p.holding.findFirst.mockResolvedValueOnce(null as never)
    p.priceCache.findUnique.mockResolvedValueOnce(null as never)
    p.priceCache.findMany.mockResolvedValueOnce([{ displayName: '타이거', ticker: 'T1' }, { displayName: '타이거', ticker: 'T2' }] as never)
    const many = await run(hears(watch, 0), '관심 타이거')
    p.holding.findFirst.mockResolvedValueOnce(null as never).mockResolvedValueOnce({ id: 'h' } as never)
    p.priceCache.findUnique.mockResolvedValueOnce(null as never)
    p.priceCache.findMany.mockResolvedValueOnce([{ displayName: '삼성전자', ticker: '005930.KS', market: 'KOSPI' }] as never)
    const held = await run(hears(watch, 0), '관심 삼성전자')
    expect([many.calls, held.calls]).toMatchSnapshot()
  })

  it('목표가 · 매수구간 · 잘못된 값 → upsert · html', async () => {
    const outs: unknown[] = []
    for (const text of ['관심 SOFI 목표가 8.5', '관심 SOFI 목표가 0', '관심 SOFI 매수구간 7.5 8.5', '관심 SOFI 매수구간 9 8']) {
      p.holding.findFirst.mockResolvedValueOnce(null as never)
      p.priceCache.findUnique.mockResolvedValueOnce({ ticker: 'SOFI', displayName: 'SoFi', market: 'US' } as never)
      outs.push((await run(hears(watch, 0), text)).calls)
    }
    expect(outs).toMatchSnapshot()
    expect(p.watchlist.upsert.mock.calls.map((c) => c[0])).toMatchSnapshot()
  })

  it('추가 — 전략·메모 · 캐시 없으면 시세 warm-up(실패해도 응답은 성공)', async () => {
    p.holding.findFirst.mockResolvedValueOnce(null as never)
    p.priceCache.findUnique.mockResolvedValueOnce(null as never)
    p.priceCache.findMany.mockResolvedValueOnce([] as never)
    quote.mockRejectedValueOnce(new Error('net'))
    const f = await run(hears(watch, 0), '관심 sofi 단타 "RSI <30>"')
    await flush()
    expect(quote).toHaveBeenCalledWith('SOFI')
    expect(p.watchlist.upsert.mock.calls[0][0]).toStrictEqual({
      where: { ticker: 'SOFI' },
      update: { strategy: 'scalp', memo: 'RSI <30>', displayName: 'SOFI', market: 'US' },
      create: { ticker: 'SOFI', displayName: 'SOFI', market: 'US', strategy: 'scalp', memo: 'RSI <30>' },
    })
    expect(f.calls).toMatchSnapshot()
  })

  it('추가 — 전략 없음 = swing · 모르는 전략 = swing · 캐시 있으면 warm-up 없음', async () => {
    for (const text of ['관심 SOFI', '관심 SOFI 몰라']) {
      p.holding.findFirst.mockResolvedValueOnce(null as never)
      p.priceCache.findUnique.mockResolvedValueOnce({ ticker: 'SOFI', displayName: 'SoFi', market: 'US' } as never)
      await run(hears(watch, 0), text)
    }
    expect(p.watchlist.upsert.mock.calls.map((c) => (c[0] as { update: { strategy: string } }).update.strategy)).toEqual(['swing', 'swing'])
    expect(quote).not.toHaveBeenCalled()
  })

  it('관심삭제 — 인자 없음 · 없음 · 삭제(html) · 벗기기 대문자', async () => {
    const usage = await run(cmd(watch, 'unwatch'), '/unwatch@MyBot')
    p.watchlist.findUnique.mockResolvedValueOnce(null as never)
    const none = await run(hears(watch, 1), '관심삭제 x<y')
    p.watchlist.findUnique.mockResolvedValueOnce({ displayName: 'SoFi', ticker: 'SOFI' } as never)
    const ok = await run(hears(watch, 1), '관심삭제  sofi ')
    expect(p.watchlist.delete.mock.calls[0][0]).toStrictEqual({ where: { ticker: 'SOFI' } })
    expect([usage.calls, none.calls, ok.calls]).toMatchSnapshot()
  })

  it('관심목록 — 없음 · 캐시 · 실시간 fallback · 실패 · 구간 표시', async () => {
    p.watchlist.findMany.mockResolvedValueOnce([] as never)
    const empty = await run(hears(watch, 2), '관심목록')
    p.watchlist.findMany.mockResolvedValueOnce([
      { ticker: 'SOFI', displayName: 'SoFi', strategy: 'swing', targetBuy: 8, entryLow: 7, entryHigh: 9, memo: 'm&m' },
      { ticker: 'NEW', displayName: 'New', strategy: 'value', targetBuy: null, entryLow: 1, entryHigh: 2, memo: null },
      { ticker: 'BAD', displayName: 'Bad', strategy: 'other', targetBuy: null, entryLow: null, entryHigh: null, memo: null },
    ] as never)
    p.priceCache.findMany.mockResolvedValueOnce([{ ticker: 'SOFI', price: 8.2, currency: 'USD', changePercent: 1.5 }] as never)
    quote.mockResolvedValueOnce({ price: 3, currency: 'USD', changePercent: null } as never).mockRejectedValueOnce(new Error('net'))
    const list = await run(hears(watch, 2), '관심목록')
    expect([empty.calls, list.calls]).toMatchSnapshot()
  })
})

describe('순자산 · 자산', () => {
  it('순자산 — 주식(캐시 · USD avgPriceFx · KRW 평단) + 자산·부채 + 전월 대비 · html', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T03:00:00Z'))
    p.priceCache.findUnique.mockResolvedValueOnce({ price: 1400 } as never)
    p.holding.findMany.mockResolvedValueOnce([
      { ticker: 'AAPL', shares: 2, currency: 'USD', avgPrice: 200000, avgPriceFx: 150 },
      { ticker: 'NOP', shares: 3, currency: 'USD', avgPrice: 100000, avgPriceFx: 70 },
      { ticker: 'KR', shares: 4, currency: 'KRW', avgPrice: 50000, avgPriceFx: null },
    ] as never)
    p.priceCache.findMany.mockResolvedValueOnce([{ ticker: 'AAPL', price: 190 }] as never)
    p.asset.findMany.mockResolvedValueOnce([
      { category: 'savings', value: 5000000, isLiability: false },
      { category: 'real_estate', value: 300000000, isLiability: false },
      { category: 'loan', value: 100000000, isLiability: true },
    ] as never)
    p.netWorthSnapshot.findFirst.mockResolvedValueOnce({ netWorthKRW: 200000000 } as never)
    const f = await run(hears(networth, 0), '순자산')
    expect(p.netWorthSnapshot.findFirst.mock.calls[0][0]).toStrictEqual({
      where: { date: { lt: new Date('2026-10-01T00:00:00Z') } }, orderBy: { date: 'desc' },
    })
    expect(f.calls).toMatchSnapshot()
  })

  it('순자산 — 보유 없음 · 환율 없음(기본값) · 전월 없음', async () => {
    p.priceCache.findUnique.mockResolvedValueOnce(null as never)
    p.holding.findMany.mockResolvedValueOnce([] as never)
    p.asset.findMany.mockResolvedValueOnce([] as never)
    p.netWorthSnapshot.findFirst.mockResolvedValueOnce(null as never)
    const f = await run(cmd(networth, 'networth'), '/networth')
    expect(p.priceCache.findMany).not.toHaveBeenCalled()
    expect(f.calls).toMatchSnapshot()
  })

  it('자산목록 — 없음 · 자산·부채(html)', async () => {
    p.asset.findMany.mockResolvedValueOnce([] as never)
    const empty = await run(hears(networth, 1), '자산목록')
    p.asset.findMany.mockResolvedValueOnce([
      { name: '적금<1>', category: 'savings', value: 1000000, isLiability: false, owner: '세진', note: '만기 & 연장', interestRate: null },
      { name: '집', category: 'unknown', value: 2000000, isLiability: false, owner: '공동', note: null, interestRate: null },
      { name: '대출', category: 'loan', value: 500000, isLiability: true, owner: '공동', note: '변동', interestRate: 4.2 },
    ] as never)
    const list = await run(hears(networth, 1), '자산목록')
    expect([empty.calls, list.calls]).toMatchSnapshot()
  })

  it('자산추가 — 사용법 · 인자 부족 · 모르는 카테고리 · 잘못된 금액 · 등록(부채 포함)', async () => {
    const outs: unknown[] = []
    outs.push((await run(cmd(networth, 'assetadd'), '/assetadd@MyBot')).calls)
    outs.push((await run(hears(networth, 2), '자산추가 이름 적금')).calls)
    outs.push((await run(hears(networth, 2), '자산추가 이름 주식 100')).calls)
    outs.push((await run(hears(networth, 2), '자산추가 이름 적금 -5')).calls)
    p.asset.create.mockImplementation((async (args: { data: Record<string, unknown> }) => ({ ...args.data })) as never)
    outs.push((await run(hears(networth, 2), '자산추가 신한<적금> 적금 5,000,000.6')).calls)
    outs.push((await run(cmd(networth, 'assetadd'), '/assetadd 주담대 대출 100000000 세진')).calls)
    expect(outs).toMatchSnapshot()
    expect(p.asset.create.mock.calls.map((c) => c[0])).toMatchSnapshot()
  })

  it('자산수정 — 사용법 · 인자 부족 · 잘못된 금액 · 없음 · 여럿 · 수정', async () => {
    const outs: unknown[] = []
    outs.push((await run(hears(networth, 3), '자산수정')).calls)
    outs.push((await run(hears(networth, 3), '자산수정 이름')).calls)
    outs.push((await run(hears(networth, 3), '자산수정 이름 abc')).calls)
    p.asset.findMany.mockResolvedValueOnce([] as never)
    outs.push((await run(hears(networth, 3), '자산수정 없음 100')).calls)
    p.asset.findMany.mockResolvedValueOnce([
      { name: '적금', owner: '세진', category: 'savings' }, { name: '적금', owner: '소담', category: 'odd' },
    ] as never)
    outs.push((await run(hears(networth, 3), '자산수정 적금 100')).calls)
    p.asset.findMany.mockResolvedValueOnce([{ id: 'a1', name: '적금', value: 1000 }] as never)
    p.asset.update.mockResolvedValueOnce({ name: '적금', value: 1235 } as never)
    outs.push((await run(cmd(networth, 'assetupdate'), '/assetupdate@MyBot 적금 1,234.5')).calls)
    expect(p.asset.update.mock.calls[0][0]).toStrictEqual({ where: { id: 'a1' }, data: { value: 1235 } })
    expect(p.asset.findMany.mock.calls[0][0]).toStrictEqual({ where: { name: { equals: '없음', mode: 'insensitive' } }, take: 5 })
    expect(outs).toMatchSnapshot()
  })
})

describe('소비 · 수입 · 예산', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // KST 2026-11-01 01:00 = UTC 10-31 16:00 — 월 경계를 KST 로 잡는지
    vi.setSystemTime(new Date('2026-10-31T16:00:00Z'))
  })

  const RANGE = { gte: new Date('2026-10-31T15:00:00Z'), lt: new Date('2026-11-30T15:00:00Z') }

  it('소비 요약 — 없음 · 카테고리 합계 내림차순 · 아이콘 · 모르는 카테고리 · html', async () => {
    p.transaction.groupBy.mockResolvedValueOnce([] as never)
    const empty = await run(hears(budget, 0), '소비')
    p.transaction.groupBy.mockResolvedValueOnce([
      { categoryId: 'c1', _sum: { amount: 10000 }, _count: { id: 2 } },
      { categoryId: 'c2', _sum: { amount: 30000 }, _count: { id: 1 } },
      { categoryId: 'gone', _sum: { amount: null }, _count: { id: 1 } },
    ] as never)
    p.category.findMany.mockResolvedValueOnce([{ id: 'c1', name: '식비', icon: '🍚' }, { id: 'c2', name: '<교통>', icon: null }] as never)
    const list = await run(hears(budget, 0), '소비 ')
    expect(p.transaction.groupBy.mock.calls[1][0]).toStrictEqual({
      by: ['categoryId'], where: { transactedAt: RANGE, category: { type: 'expense' } }, _sum: { amount: true }, _count: { id: true },
    })
    expect([empty.calls, list.calls]).toMatchSnapshot()
  })

  it('수입 요약 — type income · 없음 문구', async () => {
    p.transaction.groupBy.mockResolvedValueOnce([] as never)
    const f = await run(hears(budget, 1), '수입')
    expect(p.transaction.groupBy.mock.calls[0][0]).toMatchObject({ where: { category: { type: 'income' } } })
    expect(f.calls).toEqual([['reply', '📊 11월 수입 내역이 없습니다.']])
  })

  it('예산 현황 — 미설정 · 전체 + 카테고리', async () => {
    p.budget.findFirst.mockResolvedValueOnce(null as never)
    p.budget.findMany.mockResolvedValueOnce([] as never)
    const none = await run(hears(budget, 2), '예산')
    p.budget.findFirst.mockResolvedValueOnce({ amount: 100000 } as never)
    p.budget.findMany.mockResolvedValueOnce([
      { categoryId: 'c1', amount: 50000, category: { name: '식비', icon: '🍚' } },
      { categoryId: 'c2', amount: 10000, category: { name: '<카페>', icon: null } },
    ] as never)
    p.transaction.aggregate.mockResolvedValueOnce({ _sum: { amount: 120000 } } as never)
    p.transaction.groupBy.mockResolvedValueOnce([{ categoryId: 'c1', _sum: { amount: 40000 } }] as never)
    const full = await run(hears(budget, 2), '예산')
    expect(p.budget.findFirst.mock.calls[0][0]).toStrictEqual({ where: { categoryId: null, year: 2026, month: 11 } })
    expect([none.calls, full.calls]).toMatchSnapshot()
  })

  it('예산설정 — 사용법 · 0 · 새로 · 갱신(쉼표 허용)', async () => {
    const usage = await run(hears(budget, 3), '예산설정 abc')
    const bare = await run(hears(budget, 3), '예산설정')
    const zero = await run(hears(budget, 3), '예산설정 0')
    p.budget.findFirst.mockResolvedValueOnce(null as never)
    const created = await run(hears(budget, 3), '예산설정 2,000,000')
    p.budget.findFirst.mockResolvedValueOnce({ id: 'b1' } as never)
    const updated = await run(hears(budget, 3), '예산설정  3000000 ')
    expect(p.budget.create.mock.calls[0][0]).toStrictEqual({ data: { year: 2026, month: 11, amount: 2000000 } })
    expect(p.budget.update.mock.calls[0][0]).toStrictEqual({ where: { id: 'b1' }, data: { amount: 3000000 } })
    expect([usage.calls, bare.calls, zero.calls, created.calls, updated.calls]).toMatchSnapshot()
  })

  it('각 명령 — 처리 중 던지면 정적 안내', async () => {
    p.transaction.groupBy.mockRejectedValue(new Error('db'))
    p.budget.findFirst.mockRejectedValue(new Error('db'))
    const outs = [
      (await run(hears(budget, 0), '소비')).calls,
      (await run(hears(budget, 1), '수입')).calls,
      (await run(hears(budget, 2), '예산')).calls,
      (await run(hears(budget, 3), '예산설정 100')).calls,
    ]
    expect(outs).toEqual([
      [['reply', '⚠️ 소비 조회에 실패했습니다.']],
      [['reply', '⚠️ 수입 조회에 실패했습니다.']],
      [['reply', '⚠️ 예산 조회에 실패했습니다.']],
      [['reply', '⚠️ 예산 설정에 실패했습니다.']],
    ])
  })
})
