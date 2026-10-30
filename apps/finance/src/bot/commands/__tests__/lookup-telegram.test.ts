/**
 * pleiades 009 D-3 PR-2a (pleiades#392) — 조회 명령 텔레그램 특성 테스트: start·help · 현황·계좌 · 주가·환율 · 분석.
 *
 * 판단 분리(설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · H2 · T11) **전** 코드에서 먼저 통과시키고 스냅샷을 만든다.
 * 분리 뒤에도 같은 스냅샷이어야 한다 — 기준은 grammY 호출열(이름 · 인자 · 순서). `replyHtml` 은 `reply(html, {parse_mode})`
 * 로, 일반 응답은 `reply(text)` 한 인자로 찍히므로 두 경로가 스냅샷에서 갈린다.
 * 인자 벗기기(T11)는 명시 단언으로 따로 고정한다(어느 질의가 DB·조회 함수에 닿았나).
 * "현재 동작" 이라 적은 테스트는 서비스 유래 결함을 그대로 고정한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    priceCache: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/price-fetcher', () => {
  class InvalidTickerError extends Error {}
  return { fetchQuote: vi.fn(), searchYahooByName: vi.fn(), InvalidTickerError }
})
vi.mock('@/lib/krx-stocks', () => ({ searchKrxByName: vi.fn() }))
vi.mock('@/lib/ta/engine', () => ({ generateTAReport: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { fetchQuote, InvalidTickerError, searchYahooByName } from '@/lib/price-fetcher'
import { searchKrxByName } from '@/lib/krx-stocks'
import { generateTAReport } from '@/lib/ta/engine'
import { registerCommands } from '../start'
import { registerPortfolioCommands } from '../portfolio'
import { registerPriceCommands } from '../price'
import { registerAnalysisCommands } from '../analysis'
import { captureBot, fakeCtx, type FakeCtxOptions } from './telegram-fake'

const mocked = {
  accounts: vi.mocked(prisma.account.findMany),
  priceMany: vi.mocked(prisma.priceCache.findMany),
  priceFind: vi.mocked(prisma.priceCache.findUnique),
  fetchQuote: vi.mocked(fetchQuote),
  yahoo: vi.mocked(searchYahooByName),
  krx: vi.mocked(searchKrxByName),
  ta: vi.mocked(generateTAReport),
}

const start = captureBot(registerCommands)
const portfolio = captureBot(registerPortfolioCommands)
const price = captureBot(registerPriceCommands)
const analysis = captureBot(registerAnalysisCommands)

type Handler = (ctx: unknown, next: () => Promise<void>) => Promise<void>

async function run(handler: Handler, text: string, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text, ...opts })
  await handler(f.ctx, vi.fn())
  return f
}

const cmd = (bot: ReturnType<typeof captureBot>, name: string) => bot.commands.find((c) => c.name === name)!.handler
const hears = (bot: ReturnType<typeof captureBot>, i: number) => bot.hears[i].handler

/**
 * 날짜를 `toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })` 로 찍는 응답은 Node·ICU 판에 따라 모양이 다르다
 * (Node 20.18 `오후 3:00:00` ↔ 최신 20.x `PM 3:00:00` — PR #393 CI). 같은 런타임 값을 자리표시자로 바꿔 스냅샷을 판에 무관하게 한다.
 */
function kstPlaceholder(calls: unknown, date: Date): unknown {
  const local = date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  return JSON.parse(JSON.stringify(calls).split(local).join('<KST 시각>'))
}

const QUOTE = {
  ticker: 'AAPL', displayName: 'Apple', price: 190.5, currency: 'USD', market: 'NASDAQ',
  change: 1.25, changePercent: 0.66, marketTime: new Date('2026-10-29T20:00:00Z'), marketState: 'CLOSED',
}

beforeEach(() => {
  for (const m of Object.values(mocked)) m.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('등록', () => {
  it('명령·정규식 · 순서', () => {
    expect(start.commands.map((c) => c.name)).toEqual(['start', 'help'])
    expect(portfolio.hears.map((x) => x.re.source)).toEqual(['^현황$', '^계좌(\\s+.+)?$'])
    expect(price.hears.map((x) => x.re.source)).toEqual(['^주가(?:\\s+.*)?$', '^환율\\s*$'])
    expect(analysis.commands.map((c) => c.name)).toEqual(['analysis'])
    expect(analysis.hears.map((x) => x.re.source)).toEqual(['^분석(?:\\s+.*)?$'])
  })
})

describe('start · help', () => {
  it('start — 이름 escape · 없으면 "사용자"', async () => {
    const named = await run(cmd(start, 'start'), '/start', { firstName: 'A<b>' })
    expect(named.calls).toMatchSnapshot()
    const anon = await run(cmd(start, 'start'), '/start')
    expect(String(anon.calls[0][1])).toContain('<b>사용자</b>님')
  })

  it('help', async () => {
    const f = await run(cmd(start, 'help'), '/help')
    expect(f.calls).toMatchSnapshot()
  })
})

describe('현황 · 계좌', () => {
  const ACCOUNTS = [
    {
      name: '세진',
      holdings: [
        { ticker: 'AAPL', displayName: 'Apple', shares: 10, avgPrice: 200000, avgPriceFx: 150, avgFxRate: 1333, currency: 'USD' },
        { ticker: 'NOPRICE', displayName: '미수신', shares: 1, avgPrice: 1000, currency: 'KRW' },
      ],
    },
    { name: '소담', holdings: [{ ticker: '005930.KS', displayName: '삼성<전자>', shares: 5, avgPrice: 60000, currency: 'KRW' }] },
    { name: '다솜', holdings: [] },
  ]
  const PRICES = [
    { ticker: 'AAPL', price: 190, change: 1 },
    { ticker: '005930.KS', price: 70000, change: -100 },
    { ticker: 'USDKRW=X', price: 1400, change: 0 },
  ]

  it('현황 — 요약 · 환율 줄', async () => {
    mocked.accounts.mockResolvedValueOnce(ACCOUNTS as never)
    mocked.priceMany.mockResolvedValueOnce(PRICES as never)
    const f = await run(hears(portfolio, 0), '현황')
    expect(f.calls).toMatchSnapshot()
  })

  it('계좌 — 인자 없음(정규식상 "계좌" 만) → 사용법(plain)', async () => {
    const f = await run(hears(portfolio, 1), '계좌')
    expect(f.calls).toEqual([['reply', '사용법: 계좌 [이름]\n예: 계좌 세진']])
    expect(mocked.accounts).not.toHaveBeenCalled()
  })

  it('계좌 — 정확 일치 상세 · 가격 미수신 줄', async () => {
    mocked.accounts.mockResolvedValueOnce(ACCOUNTS as never)
    mocked.priceMany.mockResolvedValueOnce(PRICES as never)
    const f = await run(hears(portfolio, 1), '계좌  세진 ')
    expect(f.calls).toMatchSnapshot()
  })

  it('계좌 — 부분 일치 여럿 · 없음(html)', async () => {
    const many = [{ name: '세진A', holdings: [] }, { name: '세진B', holdings: [] }]
    mocked.accounts.mockResolvedValueOnce(many as never)
    mocked.priceMany.mockResolvedValueOnce([] as never)
    const multi = await run(hears(portfolio, 1), '계좌 세진')
    mocked.accounts.mockResolvedValueOnce(ACCOUNTS as never)
    mocked.priceMany.mockResolvedValueOnce([] as never)
    const none = await run(hears(portfolio, 1), '계좌 <없음>')
    expect([multi.calls, none.calls]).toMatchSnapshot()
  })

  it('현황·계좌 — 조회 오류 → 정적 안내', async () => {
    mocked.accounts.mockRejectedValueOnce(new Error('db'))
    const a = await run(hears(portfolio, 0), '현황')
    mocked.accounts.mockRejectedValueOnce(new Error('db'))
    const b = await run(hears(portfolio, 1), '계좌 세진')
    expect(a.calls).toEqual([['reply', '⚠️ 포트폴리오 조회에 실패했습니다.']])
    expect(b.calls).toEqual([['reply', '⚠️ 계좌 조회에 실패했습니다.']])
  })
})

describe('주가 · 환율', () => {
  const priceCmd = () => hears(price, 0)

  it('주가 — 인자 없음 → 사용법', async () => {
    const f = await run(priceCmd(), '주가')
    expect(f.calls).toEqual([['reply', '사용법: 주가 [종목명 또는 티커]\n예: 주가 AAPL, 주가 삼성전자, 주가 카카오']])
  })

  it('주가 — 캐시 티커 정확 일치 → 실시간 시세(html) · 질의는 trim · 대문자', async () => {
    mocked.priceFind.mockResolvedValueOnce({ ticker: 'AAPL' } as never)
    mocked.fetchQuote.mockResolvedValueOnce(QUOTE as never)
    const f = await run(priceCmd(), '주가   aapl  ')
    expect(mocked.priceFind.mock.calls[0][0]).toStrictEqual({ where: { ticker: 'AAPL' }, select: { ticker: true } })
    expect(mocked.fetchQuote).toHaveBeenCalledWith('AAPL')
    expect(f.calls).toMatchSnapshot()
  })

  it('주가 — 보유 종목 실시간 실패 → 캐시 fallback · 캐시도 없으면 일시 오류', async () => {
    const updatedAt = new Date('2026-10-29T06:00:00Z')
    mocked.priceFind
      .mockResolvedValueOnce({ ticker: 'AAPL' } as never)
      .mockResolvedValueOnce({ ...QUOTE, updatedAt } as never)
    mocked.fetchQuote.mockRejectedValueOnce(new Error('net'))
    const cached = await run(priceCmd(), '주가 AAPL')
    mocked.priceFind.mockResolvedValueOnce({ ticker: 'AAPL' } as never).mockResolvedValueOnce(null as never)
    mocked.fetchQuote.mockRejectedValueOnce(new Error('net'))
    const nothing = await run(priceCmd(), '주가 AAPL')
    expect(kstPlaceholder([cached.calls, nothing.calls], updatedAt)).toMatchSnapshot()
  })

  it('주가 — 캐시 이름 여럿 · 부분 여럿(외 다수) → 후보(html)', async () => {
    mocked.priceFind.mockResolvedValue(null as never)
    mocked.priceMany.mockResolvedValueOnce([
      { ticker: 'A1', displayName: '타이거' }, { ticker: 'A2', displayName: '타이거' },
    ] as never)
    const exact = await run(priceCmd(), '주가 타이거')
    mocked.priceMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(Array.from({ length: 11 }, (_, i) => ({ ticker: `T${i}`, displayName: `코덱스${i}` })) as never)
    const partial = await run(priceCmd(), '주가 코덱스')
    expect([exact.calls, partial.calls]).toMatchSnapshot()
  })

  it('주가 — 캐시 부분 하나 → 그 티커로 시세', async () => {
    mocked.priceFind.mockResolvedValueOnce(null as never)
    mocked.priceMany.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ ticker: 'AAPL', displayName: 'Apple' }] as never)
    mocked.fetchQuote.mockResolvedValueOnce(QUOTE as never)
    await run(priceCmd(), '주가 appl')
    expect(mocked.fetchQuote).toHaveBeenCalledWith('AAPL')
  })

  describe('캐시 미매칭', () => {
    beforeEach(() => {
      mocked.priceFind.mockResolvedValue(null as never)
      mocked.priceMany.mockResolvedValue([] as never)
    })

    it('한글 — KRX 하나 · 여럿(외 다수) · 없음', async () => {
      mocked.krx.mockResolvedValueOnce([{ name: '카카오', ticker: '035720.KS', market: 'KOSPI' }] as never)
      mocked.fetchQuote.mockResolvedValueOnce({ ...QUOTE, ticker: '035720.KS', currency: 'KRW' } as never)
      const one = await run(priceCmd(), '주가 카카오')
      expect(mocked.fetchQuote).toHaveBeenCalledWith('035720.KS')
      mocked.krx.mockResolvedValueOnce(Array.from({ length: 12 }, (_, i) => ({ name: `카<${i}>`, ticker: `K${i}`, market: 'KOSDAQ' })) as never)
      const many = await run(priceCmd(), '주가 카')
      mocked.krx.mockResolvedValueOnce([] as never)
      const none = await run(priceCmd(), '주가 없는종목')
      expect([one.calls, many.calls, none.calls]).toMatchSnapshot()
    })

    it('영문 티커 모양 → 직접 조회 · 없는 티커 · 일시 오류', async () => {
      mocked.fetchQuote.mockRejectedValueOnce(new InvalidTickerError('x'))
      const invalid = await run(priceCmd(), '주가 ZZZZ')
      expect(mocked.fetchQuote).toHaveBeenLastCalledWith('ZZZZ')
      mocked.fetchQuote.mockRejectedValueOnce(new Error('net'))
      const transient = await run(priceCmd(), '주가 ZZZZ')
      expect([invalid.calls, transient.calls]).toMatchSnapshot()
      expect(mocked.yahoo).not.toHaveBeenCalled()
    })

    it('영문 이름 → yahoo 검색 하나 · 여럿 · 없음', async () => {
      mocked.yahoo.mockResolvedValueOnce([{ symbol: 'TSLA', shortname: 'Tesla', exchange: 'NMS' }] as never)
      mocked.fetchQuote.mockResolvedValueOnce({ ...QUOTE, ticker: 'TSLA' } as never)
      const one = await run(priceCmd(), '주가 Tesla')
      expect(mocked.yahoo).toHaveBeenCalledWith('Tesla')
      expect(mocked.fetchQuote).toHaveBeenCalledWith('TSLA')
      mocked.yahoo.mockResolvedValueOnce([{ symbol: 'A', shortname: undefined, exchange: 'X' }, { symbol: 'B', shortname: 'B&Co', exchange: undefined }] as never)
      const many = await run(priceCmd(), '주가 Apple')
      mocked.yahoo.mockResolvedValueOnce([] as never)
      const none = await run(priceCmd(), '주가 Nothing')
      expect([one.calls, many.calls, none.calls]).toMatchSnapshot()
    })
  })

  it('주가 — 처리 중 던지면 정적 안내', async () => {
    mocked.priceFind.mockRejectedValueOnce(new Error('db'))
    const f = await run(priceCmd(), '주가 AAPL')
    expect(f.calls).toEqual([['reply', '⚠️ 주가 조회에 실패했습니다.']])
  })

  it('환율 — 있음(html) · 없음 · 오류', async () => {
    const updatedAt = new Date('2026-10-30T00:00:00Z')
    mocked.priceFind.mockResolvedValueOnce({
      ticker: 'USDKRW=X', price: 1388.456, change: -3.2, changePercent: -0.23, updatedAt,
    } as never)
    const ok = await run(hears(price, 1), '환율')
    mocked.priceFind.mockResolvedValueOnce(null as never)
    const none = await run(hears(price, 1), '환율 ')
    mocked.priceFind.mockRejectedValueOnce(new Error('db'))
    const err = await run(hears(price, 1), '환율')
    expect(kstPlaceholder([ok.calls, none.calls, err.calls], updatedAt)).toMatchSnapshot()
  })
})

describe('분석', () => {
  const REPORT = {
    price: { current: 1234.5, change1d: 1.2, change5d: -3.4, change20d: 5, low52w: 900, high52w: 1500, fromHigh52w: -17.7 },
    indicators: {
      rsi14: { value: 72.34, signal: 'OVERBOUGHT' },
      macd: { trend: 'BULLISH', crossover: 'GOLDEN' },
      bollingerBands: { position: 'NEAR_UPPER', bandwidth: 12.34 },
      sma: { sma20: 1200, sma50: 1100, sma200: 1000, goldenCross: true, deathCross: false },
      volume: { ratio: 2.5, surge: true },
    },
    signalSummary: { overall: 'BUY', reasons: ['RSI <과열>'] },
    support: [1100, 1000],
    resistance: [1500],
  }

  it('인자 벗기기 — /analysis@bot · /분석 · 분석 · 대소문자 무시 · 대문자로', async () => {
    mocked.ta.mockResolvedValue(REPORT as never)
    await run(cmd(analysis, 'analysis'), '/analysis@MyBot nvda')
    await run(hears(analysis, 0), '분석   tsla ')
    await run(cmd(analysis, 'analysis'), '/ANALYSIS amd')
    expect(mocked.ta.mock.calls.map((c) => c[0])).toEqual(['NVDA', 'TSLA', 'AMD'])
  })

  it('인자 없음 → 사용법(html) · typing 없음', async () => {
    const f = await run(hears(analysis, 0), '분석')
    expect(f.calls).toMatchSnapshot()
    expect(f.ctx.replyWithChatAction).not.toHaveBeenCalled()
  })

  it('정상 → typing 1회 뒤 리포트(html)', async () => {
    mocked.ta.mockResolvedValueOnce(REPORT as never)
    const f = await run(hears(analysis, 0), '분석 NVDA')
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledWith('typing')
    expect(f.calls).toMatchSnapshot()
  })

  it('지지·저항 없음 · sma200 없음 · 시그널 모름', async () => {
    mocked.ta.mockResolvedValueOnce({
      ...REPORT,
      indicators: { ...REPORT.indicators, sma: { ...REPORT.indicators.sma, sma200: null, goldenCross: false, deathCross: true }, macd: { trend: 'NEUTRAL', crossover: null } },
      signalSummary: { overall: 'WHAT', reasons: [] },
      support: [],
      resistance: [],
    } as never)
    const f = await run(hears(analysis, 0), '분석 X')
    expect(f.calls).toMatchSnapshot()
  })

  it('현재 동작 — 실패 시 오류 원문을 그대로 보인다(서비스 유래)', async () => {
    mocked.ta.mockRejectedValueOnce(new Error('데이터 부족: 30일 미만'))
    const f = await run(hears(analysis, 0), '분석 NEW')
    expect(f.calls).toEqual([['reply', '⚠️ NEW 분석 실패: 데이터 부족: 30일 미만']])
  })

  it('typing 실패는 그대로 던진다(try 밖 · 등록에 catch 없음)', async () => {
    const f = fakeCtx({ text: '분석 NVDA' })
    f.ctx.replyWithChatAction.mockRejectedValueOnce(new Error('typing'))
    await expect(hears(analysis, 0)(f.ctx, vi.fn())).rejects.toThrow('typing')
    expect(mocked.ta).not.toHaveBeenCalled()
  })
})
