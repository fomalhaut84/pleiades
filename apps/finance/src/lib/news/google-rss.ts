/**
 * pleiades#280 — Google 뉴스 RSS (키 불필요 · 비공식 경로 · 사용자 수용).
 * 전부 pubDate 를 가진다 (2026-11-04 실측). 링크는 기사로 리다이렉트되지 않아 쓰지 않는다.
 */

import { NEWS_SOURCE_MAX_LENGTH, NEWS_TITLE_MAX_LENGTH, sanitizeNewsText } from './sanitize'
import { NewsFetchError, type NewsItem, type ProviderFetch } from './types'

const BASE_URL = 'https://news.google.com/rss/search'
const LOCALE = {
  ko: { hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
} as const

export const GOOGLE_NEWS_TIMEOUT_MS = 8_000
/** 100건 응답도 이 크기 안쪽이다. 크기를 막지 않으면 잘못된 응답이 MCP 메모리로 그대로 들어온다 */
export const GOOGLE_NEWS_MAX_BYTES = 2 * 1024 * 1024

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** pure */
export function buildGoogleNewsUrl(query: string, days: number, lang: 'ko' | 'en'): string {
  const params = new URLSearchParams({ q: `${query} when:${days}d`, ...LOCALE[lang] })
  return `${BASE_URL}?${params.toString()}`
}

function tagText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block)
  if (!match) return null
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(match[1])
  return cdata ? cdata[1] : match[1]
}

/** Google 제목 끝의 ` - 언론사` 를 뗀다. pure */
function stripSourceSuffix(title: string, source: string): string {
  const suffix = ` - ${source}`
  return source && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title
}

/** 정규식은 이 크기 안쪽 조각에만 쓴다. 정상 기사 한 건은 1 KB 안팎이다 */
const MAX_ITEM_CHARS = 16 * 1024

/** 전체 본문에 정규식을 쓰면 닫히지 않은 `<item>` 반복에서 이차 시간이 된다 — indexOf 로 나눈다. pure */
function itemBlocks(xml: string): { blocks: string[]; truncated: boolean } {
  const blocks: string[] = []
  let from = 0
  for (;;) {
    const open = xml.indexOf('<item', from)
    if (open < 0) return { blocks, truncated: false }
    const close = xml.indexOf('</item>', open)
    // 잘린 응답이다 — 조용히 버리면 '기사 0건' 으로 읽힌다 (PR #475 Codex P2)
    if (close < 0) return { blocks, truncated: true }
    blocks.push(xml.slice(open, close))
    from = close + '</item>'.length
  }
}

/** RSS 본문 → 기사 목록. 게시일·제목을 못 읽으면 버리고 센다 — 날짜 보장이 이 도구의 이유다. pure */
export function parseGoogleNewsRss(xml: string): ProviderFetch {
  // 안내 페이지 같은 HTML 200 을 '기사 0건' 으로 읽으면 실패가 숨는다
  if (!/<rss[\s>]/.test(xml)) throw new NewsFetchError('응답 형식 오류')
  const items: NewsItem[] = []
  const { blocks, truncated } = itemBlocks(xml)
  let unreadable = truncated ? 1 : 0
  for (const block of blocks) {
    if (block.length > MAX_ITEM_CHARS) {
      unreadable += 1
      continue
    }
    const publishedAt = new Date(tagText(block, 'pubDate')?.trim() ?? '')
    const source = sanitizeNewsText(tagText(block, 'source') ?? '', NEWS_SOURCE_MAX_LENGTH)
    // 언론사 접미사가 상한에 잘리지 않게 넉넉히 정리하고 뗀 뒤 다시 자른다
    const fullTitle = sanitizeNewsText(tagText(block, 'title') ?? '', NEWS_TITLE_MAX_LENGTH + NEWS_SOURCE_MAX_LENGTH + 3)
    const title = sanitizeNewsText(stripSourceSuffix(fullTitle, source), NEWS_TITLE_MAX_LENGTH)
    if (Number.isNaN(publishedAt.getTime()) || !title) {
      unreadable += 1
      continue
    }
    items.push({ publishedAt, source: source || '출처 미상', title, url: null })
  }
  return { items, unreadable }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new NewsFetchError('응답 형식 오류')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new NewsFetchError('응답 크기 초과')
    }
    text += decoder.decode(value, { stream: true })
  }
}

export async function fetchGoogleNews(
  args: { query: string; days: number; lang: 'ko' | 'en' },
  deps: { fetchImpl?: FetchLike; timeoutMs?: number; maxBytes?: number } = {},
): Promise<ProviderFetch> {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init))
  const response = await fetchImpl(buildGoogleNewsUrl(args.query, args.days, args.lang), {
    headers: { Accept: 'application/rss+xml, application/xml;q=0.9' },
    signal: AbortSignal.timeout(deps.timeoutMs ?? GOOGLE_NEWS_TIMEOUT_MS),
  })
  if (!response.ok) throw new NewsFetchError(`HTTP ${response.status}`)
  return parseGoogleNewsRss(await readCapped(response, deps.maxBytes ?? GOOGLE_NEWS_MAX_BYTES))
}
