import { describe, expect, it, vi } from 'vitest'

const ctorArgs: unknown[] = []
vi.mock('yahoo-finance2', () => {
  class YahooFinance {
    constructor(options?: unknown) {
      ctorArgs.push(options)
    }
  }
  return { default: YahooFinance }
})

import { YAHOO_FINANCE_OPTIONS, createYahooFinance } from '../yahoo-client'

describe('createYahooFinance (#521)', () => {
  it('설문 안내(yahooSurvey) 를 억제하는 공용 옵션으로 생성한다', () => {
    createYahooFinance()
    expect(ctorArgs.at(-1)).toBe(YAHOO_FINANCE_OPTIONS)
    expect(YAHOO_FINANCE_OPTIONS.suppressNotices).toContain('yahooSurvey')
  })
})
