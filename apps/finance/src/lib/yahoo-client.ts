import YahooFinance from 'yahoo-finance2'

type YahooFinanceOptions = NonNullable<ConstructorParameters<typeof YahooFinance>[0]>

/** 공용 생성 옵션 — 설문 안내(yahooSurvey) 로그 노이즈 억제 (#521) */
export const YAHOO_FINANCE_OPTIONS: YahooFinanceOptions = {
  suppressNotices: ['yahooSurvey'],
}

/** yahoo-finance2 인스턴스 생성. 모듈별 인스턴스 대신 옵션을 한 곳에서 관리한다. */
export function createYahooFinance() {
  return new YahooFinance(YAHOO_FINANCE_OPTIONS)
}
