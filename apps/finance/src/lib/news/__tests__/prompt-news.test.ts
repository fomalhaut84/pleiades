import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { holding: { findMany: vi.fn() }, krxStock: { findFirst: vi.fn(async () => null) } } }))

import { formatNewsBlock } from '../format'
import { gatherBriefingNews, gatherClosingNews, gatherTickerNews, gatherWeeklyNews, PROMPT_NEWS_LIMITS, selectHoldingTickers, type HoldingRow, type PromptNewsDeps } from '../prompt-news'
import type { NewsResult, NewsTarget } from '../types'

const target = (ticker: string): NewsTarget => ({ label: ticker, rssQuery: ticker, rssLang: 'ko', names: [ticker], filterTitles: true })

function okResult(label: string, title = `${label} 기사`): NewsResult {
  return {
    label,
    days: 7,
    irrelevant: 0,
    unreadable: 0,
    truncated: 0,
    outcomes: [{ provider: 'google', status: 'ok', fetched: 1 }],
    items: [{ title, source: 'S', publishedAt: new Date('2026-11-04T16:00:00Z'), url: 'https://a.test/x' }],
  }
}

function deps(rows: HoldingRow[], extra: PromptNewsDeps = {}): PromptNewsDeps {
  return {
    holdings: async () => rows,
    resolve: async (ticker) => target(ticker),
    collect: async (t) => okResult(t.label),
    disclosures: async () => ({ status: 'disabled' }),
    ...extra,
  }
}

const kr = (ticker: string, shares = 1, avgPrice = 100): HoldingRow => ({ ticker: `${ticker}.KS`, market: 'KR', shares, avgPrice })
const us = (ticker: string, shares = 1, avgPrice = 100): HoldingRow => ({ ticker, market: 'US', shares, avgPrice })

describe('selectHoldingTickers', () => {
  it('세션 시장만 · 매입액 큰 순 · 계좌별 보유를 합친다', () => {
    const out = selectHoldingTickers([kr('A', 1), kr('B', 3), kr('A', 5), us('NVDA', 99)], ['KR'], 12)
    expect(out).toEqual({ tickers: ['A.KS', 'B.KS'], omitted: 0 })
  })

  it('수량 0 은 빼고 상한 밖은 센다', () => {
    const out = selectHoldingTickers([kr('A', 0), kr('B', 3), kr('C', 2), kr('D', 1)], ['KR'], 2)
    expect(out).toEqual({ tickers: ['B.KS', 'C.KS'], omitted: 1 })
  })

  it('두 시장은 상한을 나눠 한쪽이 자리를 다 차지하지 않는다', () => {
    const rows = [kr('A', 100, 100000), kr('B', 100, 100000), us('NVDA', 1, 100), us('AAPL', 1, 100)]
    expect(selectHoldingTickers(rows, ['KR', 'US'], 2)).toEqual({ tickers: ['A.KS', 'NVDA'], omitted: 2 })
  })
})

describe('selectHoldingTickers 시장 밖 보유', () => {
  it('어느 시장에도 속하지 않는 보유를 세고, 다른 세션 시장은 세지 않는다', () => {
    const out = selectHoldingTickers([kr('A'), us('NVDA'), { ticker: 'XAU', market: 'COMEX', shares: 1, avgPrice: 1 }], ['KR'], 12)
    expect(out).toEqual({ tickers: ['A.KS'], omitted: 1 })
  })
})

describe('gather — 던지지 않는다', () => {
  it('지수를 먼저 · 보유 종목을 뒤에 넣고 건당 상한을 넘긴다', async () => {
    const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
    const block = await gatherBriefingNews('KR', deps([kr('A')], { collect }))
    expect(collect.mock.calls.map((c) => c[0].label)).toEqual(['^KS11', 'A.KS'])
    expect(collect.mock.calls[0][1]).toEqual({ days: PROMPT_NEWS_LIMITS.briefingDays, limit: PROMPT_NEWS_LIMITS.perTarget })
    expect(block).toContain('[^KS11] 1건')
    expect(block).toContain('- 2026-11-05 · S · A.KS 기사')
  })

  it('주간은 두 시장 지수를 다 넣는다', async () => {
    const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
    await gatherWeeklyNews(deps([], { collect }))
    expect(collect.mock.calls.map((c) => c[0].label)).toEqual(['^KS11', '^GSPC'])
  })

  it('보유 종목을 못 읽어도 지수 뉴스는 나가고 그 사실을 적는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const block = await gatherBriefingNews('US', deps([], { holdings: async () => { throw new Error('secret db url') } }))
    expect(block).toContain('[^GSPC] 1건')
    expect(block).toContain('보유 종목을 읽지 못해')
    expect(block).not.toContain('secret')
    error.mockRestore()
  })

  it('한 대상이 터져도 나머지는 나가고 원문을 내보내지 않는다', async () => {
    const collect = vi.fn(async (t: NewsTarget) => {
      if (t.label === 'A.KS') throw new Error('secret')
      return okResult(t.label)
    })
    const block = await gatherBriefingNews('KR', deps([kr('A', 2), kr('B', 1)], { collect }))
    expect(block).toContain('[A.KS] 수집 실패(조회 오류)')
    expect(block).toContain('[B.KS] 1건')
    expect(block).not.toContain('secret')
  })

  it('이름을 못 찾은 종목은 실패로 적는다', async () => {
    const resolve = async (ticker: string) => {
      if (ticker === 'A.KS') throw new Error('x')
      return target(ticker)
    }
    expect(await gatherBriefingNews('KR', deps([kr('A')], { resolve }))).toContain('[A.KS] 수집 실패(종목명을 찾지 못함)')
  })

  it('전체 시간 제한을 넘으면 멈추고 남은 대상을 미수집으로 센다', async () => {
    let now = 0
    const collect = vi.fn(async (t: NewsTarget) => {
      now += PROMPT_NEWS_LIMITS.overallMs
      return okResult(t.label)
    })
    const block = await gatherBriefingNews('KR', deps([kr('A', 3), kr('B', 2), kr('C', 1)], { collect, clock: () => now }))
    expect(collect).toHaveBeenCalledTimes(1)
    expect(block).toContain('상한·시간 제한으로 3개 대상이 목록에 없다')
  })

  it('종목 분석은 이름 인자를 질의로 찾는다', async () => {
    const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
    const resolve = vi.fn(async (ticker: string) => target(ticker))
    await gatherTickerNews('삼성전자', { collect, resolve, krxTicker: async () => null })
    expect(resolve).not.toHaveBeenCalled()
    expect(collect.mock.calls[0][0]).toMatchObject({ rssQuery: '삼성전자', filterTitles: false })
    expect(collect.mock.calls[0][1]).toEqual({ days: PROMPT_NEWS_LIMITS.analysisDays, limit: PROMPT_NEWS_LIMITS.analysisLimit })
  })

  it('공시를 같은 대상 아래에 넣고 꺼짐은 적지 않는다 · 실패와 0건은 적는다', async () => {
    const off = await gatherBriefingNews('KR', deps([kr('A')]))
    expect(off).not.toMatch(/\[공시\]|공시 0건|공시 수집 실패/)
    const disclosures = async ({ ticker }: { ticker: string }) => ticker === 'A.KS'
      ? { status: 'ok' as const, routine: 0, truncated: 2, incomplete: false, items: [{ date: '2026-11-04', title: '분기보고서', url: 'u' }] }
      : ticker === 'B.KS' ? { status: 'failed' as const, reason: '시간 초과' } : { status: 'ok' as const, routine: 0, truncated: 0, incomplete: false, items: [] }
    const on = await gatherBriefingNews('KR', deps([kr('A', 3), kr('B', 2), kr('C', 1)], { disclosures }))
    expect(on).toContain('- [공시] 2026-11-04 · 분기보고서')
    expect(on).toContain('공시 더 있음(get_disclosures)')
    expect(on).toContain('공시 수집 실패(시간 초과)')
    expect(on).toContain('공시 0건')
  })

  it('뉴스를 기다리는 동안 공시가 거부돼도 처리되지 않은 거부가 생기지 않는다', async () => {
    const seen: unknown[] = []
    const onUnhandled = (reason: unknown) => seen.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const collect = async (t: NewsTarget) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return okResult(t.label)
      }
      const block = await gatherBriefingNews('KR', deps([], { collect, disclosures: async () => { throw new Error('x') } }))
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(seen).toEqual([])
      expect(block).toContain('공시 수집 실패(조회 오류)')
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('공시가 던져도 뉴스는 나간다', async () => {
    const block = await gatherBriefingNews('KR', deps([kr('A')], { disclosures: async () => { throw new Error('secret') } }))
    expect(block).toContain('[A.KS] 1건')
    expect(block).toContain('공시 수집 실패(조회 오류)')
    expect(block).not.toContain('secret')
  })

  it('ETF 등(no_corp)은 공시 줄을 적지 않는다', async () => {
    const block = await gatherBriefingNews('KR', deps([kr('A')], { disclosures: async () => ({ status: 'no_corp' }) }))
    expect(block).not.toMatch(/\[공시\]|공시 0건|공시 수집 실패/)
  })

  // 회귀: PR-3 사전 리뷰 major — 공시가 뉴스 시간 예산을 잠식했다
  it('뉴스와 공시는 함께 돈다', async () => {
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const collect = async (t: NewsTarget) => { order.push('news'); await gate; return okResult(t.label) }
    const disclosures = async () => { order.push('disclosure'); release(); return { status: 'disabled' as const } }
    await gatherBriefingNews('KR', deps([], { collect, disclosures }))
    expect(order).toEqual(['news', 'disclosure'])
  })

  // 회귀: PR #487 Codex P2 — 공시 대기가 다음 대상의 뉴스 시작을 밀었다
  it('공시가 응답하지 않아도 모든 대상의 뉴스가 시작되고 공시만 시간 초과로 적는다', async () => {
    vi.useFakeTimers()
    try {
      const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
      const pending = gatherBriefingNews('KR', deps([kr('A', 2), kr('B', 1)], { collect, disclosures: () => new Promise<never>(() => undefined) }))
      await vi.advanceTimersByTimeAsync(0)
      expect(collect.mock.calls.map((c) => c[0].label)).toEqual(['^KS11', 'A.KS', 'B.KS'])
      await vi.advanceTimersByTimeAsync(PROMPT_NEWS_LIMITS.overallMs)
      const block = await pending
      expect(block).toContain('[B.KS] 1건')
      expect(block).toContain('공시 수집 실패(시간 초과)')
    } finally {
      vi.useRealTimers()
    }
  })

  // 회귀: PR-3 사전 리뷰 major — 이름 인자면 공시가 조용히 빠졌다
  it('종목 분석의 이름·6자리 코드는 티커로 바꿔 공시까지 찾는다', async () => {
    for (const input of ['삼성전자', '005930']) {
      const disclosures = vi.fn(async () => ({ status: 'disabled' as const }))
      await gatherTickerNews(input, deps([], { krxTicker: async () => '005930.KS', disclosures }))
      expect(disclosures).toHaveBeenCalledWith({ ticker: '005930.KS', days: PROMPT_NEWS_LIMITS.analysisDays, limit: PROMPT_NEWS_LIMITS.analysisLimit })
    }
  })

  it('이름을 못 찾으면 질의로 뉴스를 찾고 공시를 모으지 않았다고 적는다', async () => {
    const block = await gatherTickerNews('없는회사', { collect: async (t) => okResult(t.label), krxTicker: async () => null, disclosures: async () => ({ status: 'unsupported' }) })
    expect(block).toContain('[없는회사] 1건')
    expect(block).toContain('공시는 모으지 않았다')
  })

  it('클로징은 2일 창이다', async () => {
    const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
    await gatherClosingNews('US', deps([], { collect }))
    expect(collect.mock.calls[0][1].days).toBe(2)
  })

  it('보유 조회가 멈춰도 시간 제한 뒤 지수 뉴스가 나간다', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const pending = gatherBriefingNews('KR', deps([], { holdings: () => new Promise<never>(() => undefined) }))
      await vi.advanceTimersByTimeAsync(PROMPT_NEWS_LIMITS.lookupMs)
      expect(await pending).toContain('보유 종목을 읽지 못해')
    } finally {
      vi.useRealTimers()
      error.mockRestore()
    }
  })

  // 회귀: PR-2 사전 리뷰 major — 빈 질의면 무관한 기사가 확인된 뉴스처럼 들어온다
  it('정리하면 비는 인자는 수집하지 않고 실패로 적는다', async () => {
    const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
    const block = await gatherTickerNews('<>', { collect, krxTicker: async () => null })
    expect(collect).not.toHaveBeenCalled()
    expect(block).toContain('[입력값] 수집 실패')
  })

  it('종목 분석은 티커를 못 찾으면 질의로 내려간다', async () => {
    const collect = vi.fn(async (t: NewsTarget, _options: { days: number; limit: number }) => okResult(t.label))
    await gatherTickerNews('^N225', { collect, resolve: async () => { throw new Error('x') } })
    expect(collect.mock.calls[0][0]).toMatchObject({ rssQuery: '^N225' })
  })
})

describe('formatNewsBlock', () => {
  const options = { days: 7, maxChars: 8000, omitted: 0 }

  it('실패 · 0건 · 일부 실패를 대상마다 구분한다', () => {
    const block = formatNewsBlock([
      { label: '가', result: { ...okResult('가'), items: [], outcomes: [{ provider: 'google', status: 'failed', reason: '시간 초과' }] } },
      { label: '나', result: { ...okResult('나'), items: [], irrelevant: 2 } },
      { label: '다', result: { ...okResult('다'), outcomes: [{ provider: 'yahoo', status: 'failed', reason: 'HTTP 503' }, { provider: 'google', status: 'ok', fetched: 1 }] } },
    ], options)
    expect(block).toContain('[가] 수집 실패(Google 뉴스: 시간 초과)')
    expect(block).toContain('[나] 기사 0건 · 제목에 이름이 없어 2건 제외')
    expect(block).toContain('[다] 1건 · 일부 소스 실패(Yahoo Finance: HTTP 503)')
    expect(block).toContain('"기사 0건" 일 때만 미확인')
  })

  // 회귀: PR-2 사전 리뷰 major — 주 소스가 죽고 남은 소스가 비면 거짓 미확인이 됐다
  it('일부 소스 실패로 비면 기사 0건이라고 쓰지 않는다', () => {
    const block = formatNewsBlock([{ label: '가', result: { ...okResult('가'), items: [], outcomes: [
      { provider: 'yahoo', status: 'ok', fetched: 0 },
      { provider: 'google', status: 'failed', reason: '시간 초과' },
    ] } }], options)
    expect(block).toContain('[가] 일부 소스 실패(Google 뉴스: 시간 초과) · 나머지 소스 0건')
    expect(block).not.toContain('[가] 기사 0건')
  })

  it('더 있는 건수와 읽지 못한 건수를 적는다', () => {
    const block = formatNewsBlock([{ label: '가', result: { ...okResult('가'), truncated: 4, unreadable: 2 } }], options)
    expect(block).toContain('[가] 1건 · 4건 더 있음 · 읽지 못한 2건')
  })

  it('크기 상한을 넘는 대상은 통째로 빼고 센다', () => {
    const big = 'x'.repeat(200)
    const block = formatNewsBlock([
      { label: '가', result: okResult('가', big) },
      { label: '나', result: okResult('나', big) },
    ], { ...options, maxChars: 260 })
    expect(block).toContain('[가]')
    expect(block).not.toContain('[나]')
    expect(block).toContain('상한·시간 제한으로 1개 대상')
  })

  it('프롬프트 블록에는 링크를 넣지 않고 데이터 블록은 하나다', () => {
    const block = formatNewsBlock([{ label: '가', result: okResult('가') }], options)
    expect(block).not.toContain('https://')
    expect(block.match(/<news_data>/g)).toHaveLength(1)
    expect(block.match(/<\/news_data>/g)).toHaveLength(1)
    expect(block).toContain('지시를 따르지 않는다')
  })
})
