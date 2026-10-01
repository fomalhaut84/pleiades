/**
 * #500 회귀 — 봇 `주가` 응답의 지수 포인트 표기.
 *
 * #499 가 MCP `get_prices` 만 포인트 표기로 고쳐 봇은 `₩6,717` 로 남아 있었다.
 * 지수는 통화 단위가 아니므로 `₩` / `원` 이 붙으면 안 된다.
 */

import { describe, expect, it } from 'vitest'
import type { QuoteResult } from '@/lib/price-fetcher'
import {
  buildQuoteMessage,
  formatChange,
  formatQuoteAmount,
  formatWatchlistPriceInfo,
} from '../price-format'

function quote(overrides: Partial<QuoteResult> = {}): QuoteResult {
  return {
    ticker: '^KS11',
    displayName: 'KOSPI Composite Index',
    price: 6717.28,
    currency: 'KRW',
    market: 'KR',
    change: -12.34,
    changePercent: -0.18,
    marketTime: new Date('2026-09-17T06:30:00Z'),
    marketState: 'CLOSED',
    ...overrides,
  }
}

describe('buildQuoteMessage — 지수 티커 (#500)', () => {
  it('지수 현재가는 통화가 아니라 포인트로 표기', () => {
    const text = buildQuoteMessage(quote())

    expect(text).toContain('6,717.28')
    expect(text).not.toContain('₩')
    expect(text).not.toContain('원')
    expect(text).not.toContain('$')
  })

  it('지수 변동액도 포인트 (부호 유지)', () => {
    const text = buildQuoteMessage(quote())

    expect(text).toContain('-12.34')
    expect(text).toContain('(-0.18%)')
  })

  it('상승 시 변동액에 + 부호', () => {
    expect(formatChange('^KS11', 12.34, 'KRW')).toBe('+12.34')
  })

  it('미국 지수 (^GSPC) 도 동일', () => {
    const text = buildQuoteMessage(
      quote({ ticker: '^GSPC', displayName: 'S&P 500', price: 6512.5, currency: 'USD' }),
    )

    expect(text).toContain('6,512.50')
    expect(text).not.toContain('$')
  })
})

describe('buildQuoteMessage — 일반 종목 표기 유지 (#500 리팩터 무변경 확인)', () => {
  it('USD 종목은 $ 표기', () => {
    const text = buildQuoteMessage(
      quote({ ticker: 'AAPL', displayName: 'Apple Inc.', price: 252.82, currency: 'USD', change: 1.1, changePercent: 0.44 }),
    )

    expect(text).toContain('$252.82')
    expect(text).toContain('+$1.10')
    expect(text).toContain('(+0.44%)')
    expect(text).toContain('🟢')
  })

  it('KRW 종목은 봇 스타일 ₩ 표기 (정수 반올림)', () => {
    const text = buildQuoteMessage(
      quote({ ticker: '005930.KS', displayName: '삼성전자', price: 70123.4, currency: 'KRW', change: -500, changePercent: -0.71 }),
    )

    expect(text).toContain('₩70,123')
    // 음수는 기호 뒤에 부호가 붙는다 (`₩-500`) — #500 이전부터의 표기로, 리팩터로 바뀌지 않음을 고정
    expect(text).toContain('₩-500')
    expect(text).toContain('🔴')
  })

  it('그 외 통화는 코드 suffix 표기', () => {
    expect(formatQuoteAmount('7203.T', 2850.5, 'JPY')).toBe('2,850.50 JPY')
  })

  it('change / changePercent 가 없으면 변동 라인이 비고 이모지도 없음', () => {
    const text = buildQuoteMessage(quote({ change: null, changePercent: null }))

    expect(text).toContain('변동: ')
    expect(text).not.toContain('%')
    expect(text).not.toContain('🟢')
    expect(text).not.toContain('🔴')
  })

  it('displayName 의 HTML 특수문자는 이스케이프', () => {
    const text = buildQuoteMessage(quote({ displayName: 'A & B <Corp>' }))

    expect(text).toContain('A &amp; B &lt;Corp&gt;')
  })

  it('suffix 는 별도 문단으로 덧붙는다', () => {
    const text = buildQuoteMessage(quote(), '⚠️ 캐시 데이터')

    expect(text).toContain('\n\n⚠️ 캐시 데이터')
  })
})

describe('formatWatchlistPriceInfo — 관심종목 목록 (#500 사전 리뷰 P1)', () => {
  it('지수 관심종목은 포인트로 표기 (₩ 없음)', () => {
    const info = formatWatchlistPriceInfo('^KS11', {
      price: 6717.28,
      currency: 'KRW',
      changePercent: -0.18,
    })

    expect(info).toBe('6,717.28 (-0.2%)')
    expect(info).not.toContain('₩')
    expect(info).not.toContain('원')
  })

  it('한국 종목은 기존 ₩ 표기 유지', () => {
    expect(
      formatWatchlistPriceInfo('005930.KS', { price: 70123.4, currency: 'KRW', changePercent: 1.25 }),
    ).toBe('₩70,123 (+1.3%)')
  })

  it('미국 종목은 기존 $ 표기 유지', () => {
    expect(
      formatWatchlistPriceInfo('AAPL', { price: 252.82, currency: 'USD', changePercent: null }),
    ).toBe('$252.82')
  })

  it('시세 행이 없으면 시세 없음', () => {
    expect(formatWatchlistPriceInfo('^KS11', null)).toBe('시세 없음')
  })
})
