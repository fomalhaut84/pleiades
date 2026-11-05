/** pleiades#280 — 게시일이 보장된 뉴스 수집의 공통 타입. */

export type NewsProvider = 'google' | 'yahoo'

export const NEWS_PROVIDER_LABEL: Record<NewsProvider, string> = {
  google: 'Google 뉴스',
  yahoo: 'Yahoo Finance',
}

export interface NewsItem {
  publishedAt: Date
  /** 언론사 이름 (외부 텍스트 · 정리됨) */
  source: string
  /** 기사 제목 (외부 텍스트 · 정리됨) */
  title: string
  /** 바로 열 수 있는 링크. Google RSS 링크는 기사로 넘어가지 않아 두지 않는다 */
  url: string | null
}

export interface ProviderFetch {
  items: NewsItem[]
  /** 게시일·제목을 읽지 못해 버린 건수 */
  unreadable: number
}

export type ProviderOutcome =
  | { provider: NewsProvider; status: 'ok'; fetched: number }
  | { provider: NewsProvider; status: 'failed'; reason: string }

/** 수집 대상. `label`·`names` 는 정리된 값이어야 한다 — 종목명도 외부(Yahoo)에서 온다. */
export interface NewsTarget {
  label: string
  rssQuery: string
  rssLang: 'ko' | 'en'
  names: string[]
  /**
   * Google 결과에서 제목에 이름이 없는 기사를 뺀다. 한국 종목·지수는 계열사가 섞여 필요하고, 해외 종목은
   * 회사명과 기사 표기가 달라(`Amazon.com` · `Taiwan Semiconductor`) 정렬만 한다. 자유 질의는 대조할 이름이 없다.
   */
  filterTitles: boolean
  /** 있으면 Yahoo 도 함께 조회한다 (해외 종목) */
  yahooTicker?: string
  /** 결과를 읽을 때 알아야 할 한계 */
  note?: string
}

export interface NewsResult {
  label: string
  days: number
  items: NewsItem[]
  outcomes: ProviderOutcome[]
  /** 제목에 대상 이름이 없어 뺀 건수 */
  irrelevant: number
  /** 게시일·제목을 읽지 못해 뺀 건수 */
  unreadable: number
  /** 출력 상한에 걸려 뺀 건수 */
  truncated: number
  note?: string
}

/** 사유 문자열이 모델·로그로 나간다 — 외부 오류 원문을 담지 않고 정해진 문구만 쓴다. */
export class NewsFetchError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'NewsFetchError'
  }
}

export function newsFailureReason(error: unknown): string {
  if (error instanceof NewsFetchError) return error.reason
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return '시간 초과'
  return '조회 오류'
}
