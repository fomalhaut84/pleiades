/** pleiades#280 — Yahoo Finance 뉴스. 전부 `providerPublishTime` 을 가진다 (2026-10-26 실측). */

import { createYahooFinance } from '@/lib/yahoo-client'
import { mentionsTarget } from './relevance'
import { NEWS_SOURCE_MAX_LENGTH, NEWS_TITLE_MAX_LENGTH, sanitizeNewsText, sanitizeNewsUrl } from './sanitize'
import { NewsFetchError, type NewsItem, type ProviderFetch } from './types'

export const YAHOO_NEWS_TIMEOUT_MS = 8_000
const YAHOO_NEWS_COUNT = 20

export interface YahooNewsRow {
  title?: unknown
  publisher?: unknown
  link?: unknown
  providerPublishTime?: unknown
  relatedTickers?: unknown
}

export type YahooNewsSearch = (ticker: string, newsCount: number) => Promise<{ news?: YahooNewsRow[] }>

let client: ReturnType<typeof createYahooFinance> | null = null

const defaultSearch: YahooNewsSearch = (ticker, newsCount) => {
  client ??= createYahooFinance()
  return client.search(ticker, { quotesCount: 0, newsCount }) as Promise<{ news?: YahooNewsRow[] }>
}

/** Promise 를 시간 제한으로 감싼다 — 라이브러리 호출에 취소 신호를 넘기지 않아도 응답은 끊는다 */
export async function withNewsTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NewsFetchError('시간 초과')), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** 관련 티커 또는 제목의 이름·티커로 거른다. 게시일·제목이 없으면 버리고 센다. pure */
export function mapYahooNews(rows: readonly YahooNewsRow[], ticker: string, names: readonly string[]): ProviderFetch & { irrelevant: number } {
  const items: NewsItem[] = []
  let unreadable = 0
  let irrelevant = 0
  for (const row of rows) {
    // 라이브러리가 Date 로 바꿔 준다. 숫자는 초·밀리초를 알 수 없어 받지 않는다
    const publishedAt = row.providerPublishTime instanceof Date ? row.providerPublishTime : new Date(NaN)
    const title = sanitizeNewsText(typeof row.title === 'string' ? row.title : '', NEWS_TITLE_MAX_LENGTH)
    if (Number.isNaN(publishedAt.getTime()) || !title) {
      unreadable += 1
      continue
    }
    const related = Array.isArray(row.relatedTickers) && row.relatedTickers.some((t) => typeof t === 'string' && t.toUpperCase() === ticker)
    if (!related && !mentionsTarget(title, names, ticker)) {
      irrelevant += 1
      continue
    }
    const source = sanitizeNewsText(typeof row.publisher === 'string' ? row.publisher : '', NEWS_SOURCE_MAX_LENGTH)
    items.push({ publishedAt, source: source || '출처 미상', title, url: sanitizeNewsUrl(row.link) })
  }
  return { items, unreadable, irrelevant }
}

export async function fetchYahooNews(
  args: { ticker: string; names: readonly string[] },
  deps: { search?: YahooNewsSearch; timeoutMs?: number } = {},
): Promise<ProviderFetch & { irrelevant: number }> {
  const search = deps.search ?? defaultSearch
  const result = await withNewsTimeout(search(args.ticker, YAHOO_NEWS_COUNT), deps.timeoutMs ?? YAHOO_NEWS_TIMEOUT_MS)
  // news 필드가 없으면 '기사 0건' 이 아니라 응답이 달라진 것이다
  if (!Array.isArray(result.news)) throw new NewsFetchError('응답 형식 오류')
  return mapYahooNews(result.news, args.ticker, args.names)
}
