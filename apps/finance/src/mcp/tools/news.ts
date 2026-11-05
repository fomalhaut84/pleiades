import { collectNews } from '@/lib/news/collect'
import { formatNewsResult } from '@/lib/news/format'
import { NewsTargetError, queryTarget, resolveNewsTarget } from '@/lib/news/resolve-target'
import { sanitizeNewsText } from '@/lib/news/sanitize'
import { toolError, toolResult, ToolInputError } from '../utils'

const TICKER_PATTERN = /^\^?[A-Z0-9][A-Z0-9.-]{0,14}$/
const QUERY_MAX_LENGTH = 100

export const NEWS_DEFAULT_DAYS = 7
export const NEWS_MAX_DAYS = 30
export const NEWS_DEFAULT_LIMIT = 10
export const NEWS_MAX_LIMIT = 20

/** get_news: 게시일이 확인된 기사 목록 (pleiades#280). 소스가 실패해도 도구는 오류가 아니라 사유를 돌려준다. */
export async function getNews(args: { ticker?: string; query?: string; days?: number; limit?: number }) {
  try {
    const ticker = args.ticker?.trim().toUpperCase()
    const query = args.query === undefined ? undefined : sanitizeNewsText(args.query, QUERY_MAX_LENGTH).replace(/…$/, '')
    if (Boolean(ticker) === Boolean(query)) throw new ToolInputError('ticker 와 query 중 하나만 지정한다')
    if (ticker && !TICKER_PATTERN.test(ticker)) throw new ToolInputError('티커 형식이 아니다')

    const target = ticker ? await resolveNewsTarget(ticker) : queryTarget(query as string)
    const result = await collectNews(target, {
      days: args.days ?? NEWS_DEFAULT_DAYS,
      limit: args.limit ?? NEWS_DEFAULT_LIMIT,
    })
    return toolResult(formatNewsResult(result))
  } catch (error) {
    return toolError(error instanceof NewsTargetError ? new ToolInputError(error.message) : error)
  }
}
