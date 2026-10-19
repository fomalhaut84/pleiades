import { describe, expect, it } from 'vitest'
import {
  PRICE_DEVIATION_WARN_RATIO,
  buildTickerCheckLines,
  priceDeviationWarning,
} from '../trade-price-check'

describe('priceDeviationWarning (#510)', () => {
  it('오매칭 재현: 490490.KS 체결가 10,640원 vs 472150.KS 현재가 16,200원 → 경고', () => {
    const warning = priceDeviationWarning(10640, 16200, 'KRW')
    expect(warning).not.toBeNull()
    expect(warning).toContain('₩16,200')
    expect(warning).toContain('34.3%')
  })

  it('정상 매칭: 10,640원 vs 현재가 10,560원 → 경고 없음', () => {
    expect(priceDeviationWarning(10640, 10560, 'KRW')).toBeNull()
  })

  it('임계 경계: 정확히 20% 차이부터 경고', () => {
    expect(PRICE_DEVIATION_WARN_RATIO).toBe(0.2)
    expect(priceDeviationWarning(120, 100, 'KRW')).not.toBeNull()
    expect(priceDeviationWarning(119.9, 100, 'KRW')).toBeNull()
    expect(priceDeviationWarning(80, 100, 'KRW')).not.toBeNull()
  })

  it('USD 는 $ 소수점 2자리로 현재가 표기', () => {
    expect(priceDeviationWarning(150, 230.5, 'USD')).toContain('$230.50')
  })

  it('현재가 없음/비정상이면 비교하지 않는다', () => {
    expect(priceDeviationWarning(100, null, 'KRW')).toBeNull()
    expect(priceDeviationWarning(100, undefined, 'KRW')).toBeNull()
    expect(priceDeviationWarning(100, 0, 'KRW')).toBeNull()
    expect(priceDeviationWarning(100, Number.NaN, 'KRW')).toBeNull()
  })
})

describe('buildTickerCheckLines (#510)', () => {
  it('캐시 없음 → 라인 없음', () => {
    expect(buildTickerCheckLines(10640, 'KRW', null)).toEqual([])
  })

  it('오매칭: Yahoo 종목명 + 괴리 경고를 함께 노출', () => {
    const lines = buildTickerCheckLines(10640, 'KRW', {
      price: 16200,
      quoteName: 'TIGER DIVIDEND COVERED CALL ACT',
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('Yahoo 종목명: TIGER DIVIDEND COVERED CALL ACT')
    expect(lines[1]).toMatch(/^⚠️/)
  })

  it('정상 매칭: Yahoo 종목명만', () => {
    expect(
      buildTickerCheckLines(10640, 'KRW', { price: 10560, quoteName: 'SOL US Dividend Blended 50' }),
    ).toEqual(['Yahoo 종목명: SOL US Dividend Blended 50'])
  })

  it('quoteName 미적재(구 캐시 행) → 괴리 경고만 판단', () => {
    expect(buildTickerCheckLines(10640, 'KRW', { price: 10560, quoteName: null })).toEqual([])
  })
})
