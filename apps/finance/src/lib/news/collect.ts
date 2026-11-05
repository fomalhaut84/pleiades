/**
 * pleiades#280 — 소스별 실패를 격리해 모으고, 기간·중복·상한을 건다.
 * 소스 실패와 '기사 0건' 은 결과에서 구분된다. 한 소스가 죽어도 다른 소스 결과는 나간다.
 */

import { fetchGoogleNews, type FetchLike } from './google-rss'
import { mentionsTarget } from './relevance'
import { newsFailureReason, type NewsItem, type NewsProvider, type NewsResult, type NewsTarget, type ProviderFetch, type ProviderOutcome } from './types'
import { fetchYahooNews, type YahooNewsSearch } from './yahoo-news'

const DAY_MS = 24 * 60 * 60 * 1000
/** 서버 시계 차이 여유. 이보다 먼 미래 게시일은 믿지 않는다 */
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000

export interface CollectDeps {
  fetchImpl?: FetchLike
  yahooSearch?: YahooNewsSearch
  now?: Date
  /** 소스별 시간 제한. 없으면 각 소스의 기본값 */
  timeoutMs?: number
}

function dedupeKey(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function isWithinWindow(item: NewsItem, days: number, now: Date): boolean {
  const time = item.publishedAt.getTime()
  return time >= now.getTime() - days * DAY_MS && time <= now.getTime() + FUTURE_TOLERANCE_MS
}

/** 기간 안 기사만 · 같은 제목 하나 · 최신순. 앞쪽 입력(직접 링크가 있는 소스)이 중복에서 이긴다. pure */
export function mergeNewsItems(items: readonly NewsItem[], days: number, now: Date): NewsItem[] {
  const seen = new Set<string>()
  const merged: NewsItem[] = []
  for (const item of items) {
    if (!isWithinWindow(item, days, now)) continue
    const key = dedupeKey(item.title)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
}

/** 제목에 대상 이름이 있는 기사를 먼저. 각 묶음 안의 순서(최신순)는 그대로다. pure */
export function rankByMention(items: readonly NewsItem[], target: Pick<NewsTarget, 'names' | 'yahooTicker'>): NewsItem[] {
  const mentioned = (item: NewsItem) => mentionsTarget(item.title, target.names, target.yahooTicker)
  return [...items.filter(mentioned), ...items.filter((item) => !mentioned(item))]
}

interface ProviderTask {
  provider: NewsProvider
  run: () => Promise<ProviderFetch & { irrelevant?: number }>
}

function providerTasks(target: NewsTarget, days: number, deps: CollectDeps): ProviderTask[] {
  const tasks: ProviderTask[] = []
  const { yahooTicker } = target
  if (yahooTicker) {
    tasks.push({
      provider: 'yahoo',
      run: () => fetchYahooNews({ ticker: yahooTicker, names: target.names }, { search: deps.yahooSearch, timeoutMs: deps.timeoutMs }),
    })
  }
  tasks.push({
    provider: 'google',
    run: () => fetchGoogleNews({ query: target.rssQuery, days, lang: target.rssLang }, { fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs }),
  })
  return tasks
}

export async function collectNews(
  target: NewsTarget,
  options: { days: number; limit: number },
  deps: CollectDeps = {},
): Promise<NewsResult> {
  const now = deps.now ?? new Date()
  const tasks = providerTasks(target, options.days, deps)
  const settled = await Promise.allSettled(tasks.map((task) => task.run()))

  const outcomes: ProviderOutcome[] = []
  const gathered: NewsItem[] = []
  let irrelevant = 0
  let unreadable = 0
  settled.forEach((result, index) => {
    const { provider } = tasks[index]
    if (result.status === 'rejected') {
      outcomes.push({ provider, status: 'failed', reason: newsFailureReason(result.reason) })
      return
    }
    const { items, unreadable: unread, irrelevant: rejected = 0 } = result.value
    unreadable += unread
    // 받은 행을 하나도 못 읽었으면 형식이 바뀐 것이다 — '기사 0건' 으로 읽으면 실패가 숨는다
    if (items.length === 0 && rejected === 0 && unread > 0) {
      outcomes.push({ provider, status: 'failed', reason: '응답 형식 오류' })
      return
    }
    const inWindow = items.filter((item) => isWithinWindow(item, options.days, now))
    const kept = provider === 'google' && target.filterTitles
      ? inWindow.filter((item) => mentionsTarget(item.title, target.names))
      : inWindow
    irrelevant += rejected + inWindow.length - kept.length
    outcomes.push({ provider, status: 'ok', fetched: items.length + rejected + unread })
    gathered.push(...kept)
  })

  // Yahoo 관련 티커는 넓다 — 2026-11-05 실측 NVDA 최신 4건의 제목에 회사명이 없었다.
  // 버리면 소형주·ETF 가 비므로 뒤로만 보낸다.
  const merged = rankByMention(mergeNewsItems(gathered, options.days, now), target)
  return {
    label: target.label,
    days: options.days,
    items: merged.slice(0, options.limit),
    outcomes,
    irrelevant,
    unreadable,
    note: target.note,
    truncated: Math.max(0, merged.length - options.limit),
  }
}
