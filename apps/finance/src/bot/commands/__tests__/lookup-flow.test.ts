/**
 * pleiades 009 D-5 B3a (pleiades#509) — 옛 채널 특성 테스트(lookup)를 판단 단위로 옮겼다(어댑터 없음).
 *
 * 조회 명령: start·help · 현황·계좌 · 주가·환율 · 분석. 옛 어댑터 호출열은 기록 출력(`./test-utils`)의 `steps` 로 바뀌었다 —
 * `replyHtml` → `['long', html]` · 일반 응답 → `['reply', text, 'plain']`.
 * 등록(명령·정규식·순서)과 register 의 try/catch 정적 안내는 어댑터 몫이라 옮기지 않았다(오류 경우는 판단이 던지는 것만 고정).
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
import { decideHelp, decideStart } from '../start'
import { decideAccountDetail, decidePortfolioSummary } from '../portfolio'
import { decideFxRate, decidePrice } from '../price'
import { analysisArgsFromText, decideAnalysis } from '../analysis'
import { recordingOutput } from './test-utils'

const mocked = {
  accounts: vi.mocked(prisma.account.findMany),
  priceMany: vi.mocked(prisma.priceCache.findMany),
  priceFind: vi.mocked(prisma.priceCache.findUnique),
  fetchQuote: vi.mocked(fetchQuote),
  yahoo: vi.mocked(searchYahooByName),
  krx: vi.mocked(searchKrxByName),
  ta: vi.mocked(generateTAReport),
}

/** 판단 하나를 기록 출력으로 돌린다 — 옛 `run(handler, text)` 자리. */
async function record(decide: (out: ReturnType<typeof recordingOutput>['out']) => Promise<void>) {
  const r = recordingOutput()
  await decide(r.out)
  return r
}

/** 옛 analysis 등록(command·hears 공통)이 하던 계산 — 원문 → 인자 → 판단. */
const analysisOf = (text: string) => record((out) => decideAnalysis(analysisArgsFromText(text), out))

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

describe('start · help', () => {
  // 이름을 읽는 것은 어댑터 몫 — 판단은 받은 이름을 escape 하고 없으면 "사용자"
  it('start — 이름 escape · 없으면 "사용자"', async () => {
    const named = await record((out) => decideStart('A<b>', out))
    expect(named.steps).toMatchSnapshot()
    const anon = await record((out) => decideStart(undefined, out))
    expect(String(anon.steps[0][1])).toContain('<b>사용자</b>님')
  })

  it('help', async () => {
    const r = await record((out) => decideHelp(out))
    expect(r.steps).toMatchSnapshot()
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
    const r = await record((out) => decidePortfolioSummary(out))
    expect(r.steps).toMatchSnapshot()
  })

  it('계좌 — 인자 없음(정규식상 "계좌" 만) → 사용법(plain)', async () => {
    const r = await record((out) => decideAccountDetail('계좌', out))
    expect(r.steps).toEqual([['reply', '사용법: 계좌 [이름]\n예: 계좌 세진', 'plain']])
    expect(mocked.accounts).not.toHaveBeenCalled()
  })

  it('계좌 — 정확 일치 상세 · 가격 미수신 줄', async () => {
    mocked.accounts.mockResolvedValueOnce(ACCOUNTS as never)
    mocked.priceMany.mockResolvedValueOnce(PRICES as never)
    const r = await record((out) => decideAccountDetail('계좌  세진 ', out))
    expect(r.steps).toMatchSnapshot()
  })

  it('계좌 — 부분 일치 여럿 · 없음(html)', async () => {
    const many = [{ name: '세진A', holdings: [] }, { name: '세진B', holdings: [] }]
    mocked.accounts.mockResolvedValueOnce(many as never)
    mocked.priceMany.mockResolvedValueOnce([] as never)
    const multi = await record((out) => decideAccountDetail('계좌 세진', out))
    mocked.accounts.mockResolvedValueOnce(ACCOUNTS as never)
    mocked.priceMany.mockResolvedValueOnce([] as never)
    const none = await record((out) => decideAccountDetail('계좌 <없음>', out))
    expect([multi.steps, none.steps]).toMatchSnapshot()
  })

  // 정적 안내('⚠️ 포트폴리오 조회에 실패했습니다.' · '⚠️ 계좌 조회에 실패했습니다.')는 등록의 try/catch 몫 — 판단은 던지고 아무것도 보내지 않는다
  it('현황·계좌 — 조회 오류 → 정적 안내', async () => {
    mocked.accounts.mockRejectedValueOnce(new Error('db'))
    const a = recordingOutput()
    await expect(decidePortfolioSummary(a.out)).rejects.toThrow('db')
    mocked.accounts.mockRejectedValueOnce(new Error('db'))
    const b = recordingOutput()
    await expect(decideAccountDetail('계좌 세진', b.out)).rejects.toThrow('db')
    expect(a.steps).toEqual([])
    expect(b.steps).toEqual([])
  })
})

describe('주가 · 환율', () => {
  const priceOf = (text: string) => record((out) => decidePrice(text, out))

  it('주가 — 인자 없음 → 사용법', async () => {
    const r = await priceOf('주가')
    expect(r.steps).toEqual([['reply', '사용법: 주가 [종목명 또는 티커]\n예: 주가 AAPL, 주가 삼성전자, 주가 카카오', 'plain']])
  })

  it('주가 — 캐시 티커 정확 일치 → 실시간 시세(html) · 질의는 trim · 대문자', async () => {
    mocked.priceFind.mockResolvedValueOnce({ ticker: 'AAPL' } as never)
    mocked.fetchQuote.mockResolvedValueOnce(QUOTE as never)
    const r = await priceOf('주가   aapl  ')
    expect(mocked.priceFind.mock.calls[0][0]).toStrictEqual({ where: { ticker: 'AAPL' }, select: { ticker: true } })
    expect(mocked.fetchQuote).toHaveBeenCalledWith('AAPL')
    expect(r.steps).toMatchSnapshot()
  })

  it('주가 — 보유 종목 실시간 실패 → 캐시 fallback · 캐시도 없으면 일시 오류', async () => {
    const updatedAt = new Date('2026-10-29T06:00:00Z')
    mocked.priceFind
      .mockResolvedValueOnce({ ticker: 'AAPL' } as never)
      .mockResolvedValueOnce({ ...QUOTE, updatedAt } as never)
    mocked.fetchQuote.mockRejectedValueOnce(new Error('net'))
    const cached = await priceOf('주가 AAPL')
    mocked.priceFind.mockResolvedValueOnce({ ticker: 'AAPL' } as never).mockResolvedValueOnce(null as never)
    mocked.fetchQuote.mockRejectedValueOnce(new Error('net'))
    const nothing = await priceOf('주가 AAPL')
    expect(kstPlaceholder([cached.steps, nothing.steps], updatedAt)).toMatchSnapshot()
  })

  it('주가 — 캐시 이름 여럿 · 부분 여럿(외 다수) → 후보(html)', async () => {
    mocked.priceFind.mockResolvedValue(null as never)
    mocked.priceMany.mockResolvedValueOnce([
      { ticker: 'A1', displayName: '타이거' }, { ticker: 'A2', displayName: '타이거' },
    ] as never)
    const exact = await priceOf('주가 타이거')
    mocked.priceMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(Array.from({ length: 11 }, (_, i) => ({ ticker: `T${i}`, displayName: `코덱스${i}` })) as never)
    const partial = await priceOf('주가 코덱스')
    expect([exact.steps, partial.steps]).toMatchSnapshot()
  })

  it('주가 — 캐시 부분 하나 → 그 티커로 시세', async () => {
    mocked.priceFind.mockResolvedValueOnce(null as never)
    mocked.priceMany.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ ticker: 'AAPL', displayName: 'Apple' }] as never)
    mocked.fetchQuote.mockResolvedValueOnce(QUOTE as never)
    await priceOf('주가 appl')
    expect(mocked.fetchQuote).toHaveBeenCalledWith('AAPL')
  })

  // 회귀: #494 — `주가 amd` 가 캐시의 `AMD=X`(USD/AMD 환율) 하나에 부분 일치해 환율로 확정됐다.
  it('주가 — 부분 일치는 환율·지수 행을 빼고 찾는다 · 질의가 명시하면 넣는다', async () => {
    mocked.priceFind.mockResolvedValue(null as never)
    mocked.priceMany.mockResolvedValue([] as never)
    mocked.yahoo.mockResolvedValue([] as never)
    await priceOf('주가 amd')
    // calls[0] = 이름 정확 일치 · calls[1] = 부분 일치
    const where = (mocked.priceMany.mock.calls[1][0] as { where: Record<string, unknown> }).where
    expect(where.OR).toEqual([
      { displayName: { contains: 'amd', mode: 'insensitive' } },
      { ticker: { contains: 'AMD', mode: 'insensitive' } },
    ])
    expect(where.NOT).toEqual([{ ticker: { endsWith: '=X' } }, { ticker: { startsWith: '^' } }])

    mocked.priceMany.mockClear()
    await priceOf('주가 usd/amd')
    const explicit = (mocked.priceMany.mock.calls[1][0] as { where: Record<string, unknown> }).where
    expect(explicit.NOT).toBeUndefined()
  })

  describe('캐시 미매칭', () => {
    beforeEach(() => {
      mocked.priceFind.mockResolvedValue(null as never)
      mocked.priceMany.mockResolvedValue([] as never)
    })

    it('한글 — KRX 하나 · 여럿(외 다수) · 없음', async () => {
      mocked.krx.mockResolvedValueOnce([{ name: '카카오', ticker: '035720.KS', market: 'KOSPI' }] as never)
      mocked.fetchQuote.mockResolvedValueOnce({ ...QUOTE, ticker: '035720.KS', currency: 'KRW' } as never)
      const one = await priceOf('주가 카카오')
      expect(mocked.fetchQuote).toHaveBeenCalledWith('035720.KS')
      mocked.krx.mockResolvedValueOnce(Array.from({ length: 12 }, (_, i) => ({ name: `카<${i}>`, ticker: `K${i}`, market: 'KOSDAQ' })) as never)
      const many = await priceOf('주가 카')
      mocked.krx.mockResolvedValueOnce([] as never)
      const none = await priceOf('주가 없는종목')
      expect([one.steps, many.steps, none.steps]).toMatchSnapshot()
    })

    it('영문 티커 모양 → 직접 조회 · 없는 티커 · 일시 오류', async () => {
      mocked.fetchQuote.mockRejectedValueOnce(new InvalidTickerError('x'))
      const invalid = await priceOf('주가 ZZZZ')
      expect(mocked.fetchQuote).toHaveBeenLastCalledWith('ZZZZ')
      mocked.fetchQuote.mockRejectedValueOnce(new Error('net'))
      const transient = await priceOf('주가 ZZZZ')
      expect([invalid.steps, transient.steps]).toMatchSnapshot()
      expect(mocked.yahoo).not.toHaveBeenCalled()
    })

    it('영문 이름 → yahoo 검색 하나 · 여럿 · 없음', async () => {
      mocked.yahoo.mockResolvedValueOnce([{ symbol: 'TSLA', shortname: 'Tesla', exchange: 'NMS' }] as never)
      mocked.fetchQuote.mockResolvedValueOnce({ ...QUOTE, ticker: 'TSLA' } as never)
      const one = await priceOf('주가 Tesla')
      expect(mocked.yahoo).toHaveBeenCalledWith('Tesla')
      expect(mocked.fetchQuote).toHaveBeenCalledWith('TSLA')
      mocked.yahoo.mockResolvedValueOnce([{ symbol: 'A', shortname: undefined, exchange: 'X' }, { symbol: 'B', shortname: 'B&Co', exchange: undefined }] as never)
      const many = await priceOf('주가 Apple')
      mocked.yahoo.mockResolvedValueOnce([] as never)
      const none = await priceOf('주가 Nothing')
      expect([one.steps, many.steps, none.steps]).toMatchSnapshot()
    })

    // 회귀: #494 — 소문자 티커는 이름 검색으로 가는데, 결과에 같은 심볼이 있으면 후보 목록 대신 그 종목.
    it('영문 이름 → yahoo 검색에 같은 심볼이 있으면 그 종목(환율 심볼은 다르다)', async () => {
      mocked.yahoo.mockResolvedValueOnce([
        { symbol: 'AMD=X', shortname: 'USD/AMD', exchange: 'CCY' },
        { symbol: 'AMD', shortname: 'Advanced Micro Devices, Inc.', exchange: 'NMS' },
      ] as never)
      mocked.fetchQuote.mockResolvedValueOnce({ ...QUOTE, ticker: 'AMD' } as never)
      await priceOf('주가 amd')
      expect(mocked.fetchQuote).toHaveBeenCalledTimes(1)
      expect(mocked.fetchQuote).toHaveBeenCalledWith('AMD')
    })

    it('영문 이름 → 같은 심볼이 1순위가 아니면 후보 목록(ford ≠ FORD)', async () => {
      mocked.yahoo.mockResolvedValueOnce([
        { symbol: 'F', shortname: 'Ford Motor Company', exchange: 'NYQ' },
        { symbol: 'FORD', shortname: 'Forward Industries', exchange: 'NCM' },
      ] as never)
      const r = await priceOf('주가 ford')
      expect(mocked.fetchQuote).not.toHaveBeenCalled()
      expect(JSON.stringify(r.steps)).toContain('여러 종목이 검색됩니다')
    })
  })

  // 정적 안내('⚠️ 주가 조회에 실패했습니다.')는 등록의 try/catch 몫 — 판단은 던지고 아무것도 보내지 않는다
  it('주가 — 처리 중 던지면 정적 안내', async () => {
    mocked.priceFind.mockRejectedValueOnce(new Error('db'))
    const r = recordingOutput()
    await expect(decidePrice('주가 AAPL', r.out)).rejects.toThrow('db')
    expect(r.steps).toEqual([])
  })

  // 오류의 정적 안내('⚠️ 환율 조회에 실패했습니다.')는 등록의 try/catch 몫 — 판단은 던지고 아무것도 보내지 않는다
  it('환율 — 있음(html) · 없음 · 오류', async () => {
    const updatedAt = new Date('2026-10-30T00:00:00Z')
    mocked.priceFind.mockResolvedValueOnce({
      ticker: 'USDKRW=X', price: 1388.456, change: -3.2, changePercent: -0.23, updatedAt,
    } as never)
    const ok = await record((out) => decideFxRate(out))
    mocked.priceFind.mockResolvedValueOnce(null as never)
    const none = await record((out) => decideFxRate(out))
    mocked.priceFind.mockRejectedValueOnce(new Error('db'))
    const err = recordingOutput()
    await expect(decideFxRate(err.out)).rejects.toThrow('db')
    expect(err.steps).toEqual([])
    expect(kstPlaceholder([ok.steps, none.steps], updatedAt)).toMatchSnapshot()
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
    await analysisOf('/analysis@MyBot nvda')
    await analysisOf('분석   tsla ')
    await analysisOf('/ANALYSIS amd')
    expect(mocked.ta.mock.calls.map((c) => c[0])).toEqual(['NVDA', 'TSLA', 'AMD'])
  })

  it('인자 없음 → 사용법(html) · typing 없음', async () => {
    const r = await analysisOf('분석')
    expect(r.steps).toMatchSnapshot()
    expect(r.typing).not.toHaveBeenCalled()
  })

  it('정상 → typing 1회 뒤 리포트(html)', async () => {
    mocked.ta.mockResolvedValueOnce(REPORT as never)
    const r = await analysisOf('분석 NVDA')
    expect(r.typing).toHaveBeenCalledTimes(1)
    expect(r.steps).toMatchSnapshot()
  })

  it('지지·저항 없음 · sma200 없음 · 시그널 모름', async () => {
    mocked.ta.mockResolvedValueOnce({
      ...REPORT,
      indicators: { ...REPORT.indicators, sma: { ...REPORT.indicators.sma, sma200: null, goldenCross: false, deathCross: true }, macd: { trend: 'NEUTRAL', crossover: null } },
      signalSummary: { overall: 'WHAT', reasons: [] },
      support: [],
      resistance: [],
    } as never)
    const r = await analysisOf('분석 X')
    expect(r.steps).toMatchSnapshot()
  })

  // PR-2c (#396 · UQ-3) 이전: 어떤 오류든 원문을 그대로 보였다
  it('실패 — 엔진 안내(데이터 부족)는 그대로 · 그 밖의 원문은 정적 안내(PR-2c 수정)', async () => {
    mocked.ta.mockRejectedValueOnce(new Error('데이터 부족: NEW (12일)'))
    const known = await analysisOf('분석 NEW')
    mocked.ta.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:443'))
    const other = await analysisOf('분석 NEW')
    expect(known.steps).toEqual([['reply', '⚠️ NEW 분석 실패: 데이터 부족: NEW (12일)', 'plain']])
    expect(other.steps).toEqual([['reply', '⚠️ NEW 분석에 실패했습니다. 잠시 후 다시 시도해주세요.', 'plain']])
  })

  it('typing 실패는 그대로 던진다(try 밖 · 등록에 catch 없음)', async () => {
    const r = recordingOutput()
    r.typing.mockRejectedValueOnce(new Error('typing'))
    await expect(decideAnalysis(analysisArgsFromText('분석 NVDA'), r.out)).rejects.toThrow('typing')
    expect(mocked.ta).not.toHaveBeenCalled()
    expect(r.steps).toEqual([])
  })
})
