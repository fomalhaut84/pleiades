/**
 * #500 사전 리뷰 P1 회귀 — 커스텀 전략 알림 본문의 현재가 표기.
 *
 * cross_ticker 로 지수 (^KS11) 를 1급으로 다루는 경로라, 통화 단위로 찍히면
 * 알림 본문이 그대로 오보가 된다.
 */

import { describe, expect, it } from 'vitest'
import { formatStrategyPriceLabel } from '../custom-strategy-alert'

describe('formatStrategyPriceLabel (#500)', () => {
  it('지수는 포인트 — KRW 접미사 없음', () => {
    const label = formatStrategyPriceLabel('^KS11', { price: 6717.28, currency: 'KRW' })

    expect(label).toBe('6,717.28')
    expect(label).not.toContain('KRW')
    expect(label).not.toContain('원')
    expect(label).not.toContain('₩')
  })

  it('미국 지수도 동일 (USD 접미사 없음)', () => {
    expect(formatStrategyPriceLabel('^GSPC', { price: 6512.5, currency: 'USD' })).toBe('6,512.50')
  })

  it('일반 종목은 기존 "값 + 통화코드" 표기 유지', () => {
    expect(formatStrategyPriceLabel('005930.KS', { price: 70123, currency: 'KRW' })).toBe('70,123 KRW')
    expect(formatStrategyPriceLabel('AAPL', { price: 252.82, currency: 'USD' })).toBe('252.82 USD')
  })

  it('시세 행이 없으면 (가격 미확인)', () => {
    expect(formatStrategyPriceLabel('^KS11', null)).toBe('(가격 미확인)')
  })
})
