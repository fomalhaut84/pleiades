/**
 * #500 사전 리뷰 P1 회귀 — 관심종목 테이블의 지수 포인트 표기.
 *
 * 렌더가 아니라 순수 포맷 함수만 검증 (표기 규칙이 회귀 대상).
 */

import { describe, expect, it } from 'vitest'
import { formatPrice } from '../WatchlistTable'

describe('WatchlistTable formatPrice (#500)', () => {
  it('지수는 통화가 아니라 포인트', () => {
    const s = formatPrice('^KS11', 6717.28, 'KR')

    expect(s).toBe('6,717.28')
    expect(s).not.toContain('원')
    expect(s).not.toContain('₩')
  })

  it('미국 지수도 동일 ($ 없음)', () => {
    expect(formatPrice('^GSPC', 6512.5, 'US')).toBe('6,512.50')
  })

  it('한국 종목은 기존 원화 표기 유지', () => {
    expect(formatPrice('005930.KS', 70123.4, 'KR')).toBe('70,123원')
  })

  it('미국 종목은 기존 달러 표기 유지', () => {
    expect(formatPrice('AAPL', 252.82, 'US')).toBe('$252.82')
  })

  it('목표가/매수구간 값에도 같은 규칙 적용', () => {
    expect(formatPrice('^KS11', 6500, 'KR')).toBe('6,500.00')
  })
})
