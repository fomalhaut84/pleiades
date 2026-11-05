/** pleiades#280 — 티커·질의 → 수집 대상. 한국 종목은 영어 소스에 기사가 없어(0건 실측) 한글명으로 찾는다. */

import { searchYahooByName } from '@/lib/price-fetcher'
import { prisma } from '@/lib/prisma'
import { companyCoreName } from './relevance'
import { NEWS_SOURCE_MAX_LENGTH, sanitizeNewsText } from './sanitize'
import type { NewsTarget } from './types'
import { withNewsTimeout } from './yahoo-news'

const NAME_LOOKUP_TIMEOUT_MS = 4_000
const HANGUL = /\p{Script=Hangul}/u

/** 종목명도 외부 값이고 label 은 데이터 블록 밖에 찍힌다 */
const cleanName = (name: string | null | undefined): string => sanitizeNewsText(name ?? '', NEWS_SOURCE_MAX_LENGTH)

/** 공식명과 기사 표기가 다른 종목. 없으면 제목 거르기가 전부 뺀다 */
const KR_NAME_ALIASES: Record<string, string> = {
  NAVER: '네이버',
  POSCO홀딩스: '포스코홀딩스',
}

const INDEX_TARGETS: Record<string, { label: string; query: string; lang: 'ko' | 'en'; names: string[] }> = {
  '^KS11': { label: '코스피', query: '코스피', lang: 'ko', names: ['코스피'] },
  '^KQ11': { label: '코스닥', query: '코스닥', lang: 'ko', names: ['코스닥'] },
  '^KS200': { label: '코스피200', query: '코스피200', lang: 'ko', names: ['코스피200', '코스피 200'] },
  '^GSPC': { label: 'S&P 500', query: 'S&P 500 stocks', lang: 'en', names: ['S&P 500', 'S&P', 'SP500'] },
  '^IXIC': { label: 'Nasdaq', query: 'Nasdaq stocks', lang: 'en', names: ['Nasdaq'] },
  '^DJI': { label: 'Dow Jones', query: 'Dow Jones stocks', lang: 'en', names: ['Dow Jones', 'Dow'] },
}

export class NewsTargetError extends Error {}

export function queryTarget(query: string): NewsTarget {
  return { label: query, rssQuery: query, rssLang: HANGUL.test(query) ? 'ko' : 'en', names: [], filterTitles: false }
}

async function koreanTarget(ticker: string): Promise<NewsTarget> {
  const krx = cleanName((await prisma.krxStock.findFirst({ where: { yahooTicker: ticker }, select: { name: true } }))?.name)
  // 시세 캐시 이름은 Yahoo 영문명이나 티커일 수 있다 — 한글 소스에서 찾아 봐야 전부 제외돼 '0건' 으로 읽힌다
  const cached = krx ? '' : cleanName((await prisma.priceCache.findUnique({ where: { ticker }, select: { displayName: true } }))?.displayName)
  const name = krx || (HANGUL.test(cached) ? cached : '')
  if (!name) throw new NewsTargetError(`${ticker} 의 한글 종목명을 찾을 수 없다. query 에 회사명을 넣어 다시 조회한다`)
  const alias = KR_NAME_ALIASES[name]
  return {
    label: `${name} (${ticker})`,
    rssQuery: alias ?? name,
    rssLang: 'ko',
    names: alias ? [name, alias] : [name],
    filterTitles: true,
  }
}

/** 시세 캐시의 영문 이름(`displayName` 은 사용자 라벨일 수 있어 `quoteName` 먼저) → 없으면 Yahoo 조회. 이름 없이도 수집은 된다 */
async function englishName(ticker: string): Promise<string> {
  try {
    const cached = await prisma.priceCache.findUnique({ where: { ticker }, select: { displayName: true, quoteName: true } })
    const known = [cached?.quoteName, cached?.displayName].find((name) => name && !HANGUL.test(name))
    if (known) return cleanName(known)
    const quotes = await withNewsTimeout(searchYahooByName(ticker, 3), NAME_LOOKUP_TIMEOUT_MS)
    return cleanName(quotes.find((q) => q.symbol.toUpperCase() === ticker)?.shortname)
  } catch {
    return ''
  }
}

async function globalTarget(ticker: string): Promise<NewsTarget> {
  const core = companyCoreName(await englishName(ticker))
  return {
    label: core ? `${core} (${ticker})` : ticker,
    rssQuery: `${core || ticker} stock`,
    rssLang: 'en',
    names: core ? [core] : [],
    filterTitles: false,
    yahooTicker: ticker,
    note: core ? undefined : '회사명을 찾지 못해 티커로만 찾았다. 무관한 기사가 섞일 수 있다',
  }
}

export async function resolveNewsTarget(rawTicker: string): Promise<NewsTarget> {
  const ticker = rawTicker.trim().toUpperCase()
  if (ticker.startsWith('^')) {
    const index = INDEX_TARGETS[ticker]
    if (!index) throw new NewsTargetError('지원하는 지수가 아니다. query 에 지수 이름을 넣어 다시 조회한다')
    return { label: index.label, rssQuery: index.query, rssLang: index.lang, names: index.names, filterTitles: true }
  }
  return /\.(KS|KQ)$/.test(ticker) ? koreanTarget(ticker) : globalTarget(ticker)
}
