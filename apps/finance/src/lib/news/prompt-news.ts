/**
 * pleiades#280 — AI 호출 전에 코드가 뉴스를 모아 프롬프트에 넣는다.
 * 모델이 검색하게 두면 기사가 적고 있을 법한 기사도 '미확인' 으로 나왔다(사용자 보고 2026-11-04).
 * 이 모듈은 던지지 않는다 — 수집이 전부 실패해도 브리핑은 나가야 한다.
 */

import { normalizeMarket } from '@/lib/market-hours'
import { prisma } from '@/lib/prisma'
import { collectNews } from './collect'
import { formatNewsBlock, type NewsSection } from './format'
import { fetchDisclosures, type DisclosureResult } from './opendart'
import { NewsTargetError, queryTarget, resolveNewsTarget } from './resolve-target'
import { sanitizeNewsText } from './sanitize'
import type { NewsResult, NewsTarget } from './types'
import { withNewsTimeout } from './yahoo-news'

type SessionMarket = 'KR' | 'US'

/** 프롬프트 크기와 수집 시간의 상한. 예산($1 · 300 s)을 넘기지 않게 건수를 묶는다 */
export const PROMPT_NEWS_LIMITS = {
  maxHoldings: 12,
  perTarget: 3,
  maxChars: 8_000,
  /** 새 대상을 시작하지 않는 시점. 진행 중인 대상은 조회 6 s + 공시 20 s(첫 고유번호 다운로드 포함 · 뉴스와 동시) 안에 끊겨, 보유 조회까지 더한 최악은 약 52 s 다 */
  overallMs: 20_000,
  /** DB·이름 조회 상한. 쿼리가 멈추면 시간 제한 없이는 AI 호출 전에 브리핑이 멈춘다 */
  lookupMs: 6_000,
  briefingDays: 7,
  closingDays: 2,
  weeklyDays: 7,
  analysisDays: 30,
  analysisLimit: 10,
} as const

const COLLECT_FAILED_NOTICE = '뉴스 수집이 실패했다. 기사가 없다는 뜻이 아니다. 필요한 대상은 get_news 로 조회한다.'

const SESSION_INDEX: Record<SessionMarket, string> = { KR: '^KS11', US: '^GSPC' }

export interface HoldingRow {
  ticker: string
  market: string
  shares: number
  avgPrice: number
}

/**
 * 시장별로 매입액이 큰 종목부터 고른다. 같은 종목의 계좌별 보유는 합친다. pure
 * 상한을 시장 수로 나눠 두 시장을 함께 볼 때 한쪽이 자리를 다 차지하지 않게 한다.
 * 어느 시장에도 속하지 않는 보유는 조용히 빠지지 않게 omitted 로 센다.
 */
export function selectHoldingTickers(
  rows: readonly HoldingRow[],
  markets: readonly SessionMarket[],
  cap: number,
): { tickers: string[]; omitted: number } {
  const perMarket = Math.floor(cap / markets.length)
  const tickers: string[] = []
  const unknownMarket = new Set(
    rows
      .filter((row) => row.shares > 0 && !['KR', 'US'].includes(normalizeMarket(row.market, row.ticker)))
      .map((row) => row.ticker),
  )
  let omitted = unknownMarket.size
  for (const market of markets) {
    const cost = new Map<string, number>()
    for (const row of rows) {
      if (row.shares <= 0 || normalizeMarket(row.market, row.ticker) !== market) continue
      cost.set(row.ticker, (cost.get(row.ticker) ?? 0) + row.shares * row.avgPrice)
    }
    const ranked = [...cost.entries()].sort((a, b) => b[1] - a[1]).map(([ticker]) => ticker)
    tickers.push(...ranked.slice(0, perMarket))
    omitted += Math.max(0, ranked.length - perMarket)
  }
  return { tickers, omitted }
}

export interface PromptNewsDeps {
  collect?: (target: NewsTarget, options: { days: number; limit: number }) => Promise<NewsResult>
  resolve?: (ticker: string) => Promise<NewsTarget>
  disclosures?: (args: { ticker: string; days: number; limit: number }) => Promise<DisclosureResult>
  holdings?: () => Promise<HoldingRow[]>
  /** 이름·6자리 코드 → Yahoo 티커. 없으면 null */
  krxTicker?: (value: string) => Promise<string | null>
  clock?: () => number
}

const loadHoldings = (): Promise<HoldingRow[]> =>
  prisma.holding.findMany({ select: { ticker: true, market: true, shares: true, avgPrice: true } })

async function resolveForPrompt(ticker: string, resolve: (ticker: string) => Promise<NewsTarget>): Promise<NewsTarget | null> {
  try {
    return await withNewsTimeout(resolve(ticker), PROMPT_NEWS_LIMITS.lookupMs)
  } catch {
    return null
  }
}

/** 차례로 수집한다. 동시 호출은 빈도 제한을 재 본 적이 없다 — 0.5초 간격 연속 호출만 실측 통과했다 */
async function collectSections(
  tickers: readonly string[],
  options: { days: number; limit: number },
  deps: PromptNewsDeps,
): Promise<{ sections: NewsSection[]; skipped: number }> {
  const collect = deps.collect ?? collectNews
  const resolve = deps.resolve ?? resolveNewsTarget
  const disclosures = deps.disclosures ?? fetchDisclosures
  const clock = deps.clock ?? Date.now
  const deadline = clock() + PROMPT_NEWS_LIMITS.overallMs
  const sections: NewsSection[] = []
  for (let i = 0; i < tickers.length; i += 1) {
    if (clock() >= deadline) return { sections, skipped: tickers.length - i }
    const ticker = tickers[i]
    const target = await resolveForPrompt(ticker, resolve)
    if (!target) {
      // 종목 분석의 인자는 사용자 입력이다 — 블록 안에 그대로 찍지 않는다
      sections.push({ label: sanitizeNewsText(ticker, 40) || '입력값', failure: '종목명을 찾지 못함' })
      continue
    }
    // 함께 돈다 — 선택 기능인 공시가 뉴스의 시간 예산을 잠식하지 않게 한다(OpenDART 는 다른 호스트다)
    const [news, filing] = await Promise.allSettled([
      collect(target, options),
      disclosures({ ticker, days: options.days, limit: options.limit }),
    ])
    sections.push({
      label: target.label,
      ...(news.status === 'fulfilled' ? { result: news.value } : { failure: '조회 오류' }),
      disclosures: filing.status === 'fulfilled' ? filing.value : { status: 'failed', reason: '조회 오류' },
    })
  }
  return { sections, skipped: 0 }
}

async function gatherForMarkets(
  markets: readonly SessionMarket[],
  days: number,
  deps: PromptNewsDeps,
): Promise<string> {
  let notice: string | undefined
  let selected: { tickers: string[]; omitted: number } = { tickers: [], omitted: 0 }
  try {
    const rows = await withNewsTimeout((deps.holdings ?? loadHoldings)(), PROMPT_NEWS_LIMITS.lookupMs)
    selected = selectHoldingTickers(rows, markets, PROMPT_NEWS_LIMITS.maxHoldings)
  } catch {
    notice = '보유 종목을 읽지 못해 종목 뉴스를 모으지 못했다. 필요한 종목은 get_news 로 조회한다.'
    console.error('[news] 보유 종목 조회 실패')
  }
  const tickers = [...markets.map((market) => SESSION_INDEX[market]), ...selected.tickers]
  try {
    const { sections, skipped } = await collectSections(tickers, { days, limit: PROMPT_NEWS_LIMITS.perTarget }, deps)
    return formatNewsBlock(sections, {
      days,
      maxChars: PROMPT_NEWS_LIMITS.maxChars,
      omitted: selected.omitted + skipped,
      notice,
    })
  } catch {
    console.error('[news] 프롬프트 뉴스 수집 실패')
    return formatNewsBlock([], { days, maxChars: PROMPT_NEWS_LIMITS.maxChars, omitted: 0, notice: COLLECT_FAILED_NOTICE })
  }
}

export function gatherBriefingNews(session: SessionMarket, deps: PromptNewsDeps = {}): Promise<string> {
  return gatherForMarkets([session], PROMPT_NEWS_LIMITS.briefingDays, deps)
}

export function gatherClosingNews(session: SessionMarket, deps: PromptNewsDeps = {}): Promise<string> {
  return gatherForMarkets([session], PROMPT_NEWS_LIMITS.closingDays, deps)
}

export function gatherWeeklyNews(deps: PromptNewsDeps = {}): Promise<string> {
  return gatherForMarkets(['KR', 'US'], PROMPT_NEWS_LIMITS.weeklyDays, deps)
}

async function loadKrxTicker(value: string): Promise<string | null> {
  const stock = await prisma.krxStock.findFirst({
    where: /^\d{6}$/.test(value) ? { code: value } : { name: { equals: value, mode: 'insensitive' } },
    select: { yahooTicker: true },
  })
  return stock?.yahooTicker ?? null
}

/** `/브리핑 삼성전자` · `/브리핑 005930` 을 티커로 바꾼다. 못 바꾸면 입력 그대로다 — 던지지 않는다 */
async function canonicalTicker(value: string, deps: PromptNewsDeps): Promise<string> {
  if (/^\^|[.]|^[A-Z][A-Z0-9-]{0,14}$/.test(value)) return value
  try {
    return (await withNewsTimeout((deps.krxTicker ?? loadKrxTicker)(value), PROMPT_NEWS_LIMITS.lookupMs)) ?? value
  } catch {
    return value
  }
}

/** 종목 분석. 이름은 티커로 바꿔 뉴스·공시를 함께 찾고, 못 바꾸면 질의로 뉴스만 찾는다 */
export async function gatherTickerNews(rawTicker: string, deps: PromptNewsDeps = {}): Promise<string> {
  const days = PROMPT_NEWS_LIMITS.analysisDays
  const ticker = await canonicalTicker(rawTicker, deps)
  const unresolved = /^[A-Z0-9^.-]+$/.test(ticker) && !/^\d{6}$/.test(ticker) ? undefined : '이름으로 종목을 찾지 못해 공시는 모으지 않았다. 필요하면 티커로 get_disclosures 를 부른다.'
  const resolve = deps.resolve ?? resolveNewsTarget
  const resolveOrQuery = async (value: string): Promise<NewsTarget> => {
    const looksLikeTicker = /^\^?[A-Z0-9][A-Z0-9.-]{0,14}$/.test(value)
    const target = looksLikeTicker ? await resolveForPrompt(value, resolve) : null
    if (target) return target
    const query = sanitizeNewsText(value, 100)
    // 빈 질의를 보내면 무관한 기사가 확인된 뉴스처럼 들어온다
    if (!query) throw new NewsTargetError('검색어 없음')
    return queryTarget(query)
  }
  try {
    const { sections } = await collectSections([ticker], { days, limit: PROMPT_NEWS_LIMITS.analysisLimit }, { ...deps, resolve: resolveOrQuery })
    return formatNewsBlock(sections, { days, maxChars: PROMPT_NEWS_LIMITS.maxChars, omitted: 0, notice: unresolved })
  } catch {
    console.error('[news] 종목 뉴스 수집 실패')
    return formatNewsBlock([], { days, maxChars: PROMPT_NEWS_LIMITS.maxChars, omitted: 0, notice: COLLECT_FAILED_NOTICE })
  }
}
