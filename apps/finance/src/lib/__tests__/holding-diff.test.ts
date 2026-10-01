import { describe, expect, it } from 'vitest'
import { formatHoldingDiff, formatHoldingEditDiff } from '../holding-diff'

describe('formatHoldingDiff — 첫 매수', () => {
  it('KRW 신규 보유', () => {
    const r = formatHoldingDiff({
      ticker: '005930',
      displayName: '삼성전자',
      type: 'BUY',
      shares: 10,
      before: null,
      after: { shares: 10, avgPrice: 70000, avgPriceFx: null, avgFxRate: null },
      currency: 'KRW',
    })
    expect(r.title).toBe('삼성전자 10주 매수')
    expect(r.description).toBe('신규 보유 (평단 70,000원)')
  })

  it('USD 신규 보유', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      type: 'BUY',
      shares: 5,
      before: null,
      after: { shares: 5, avgPrice: 247000, avgPriceFx: 185, avgFxRate: 1335 },
      currency: 'USD',
    })
    expect(r.title).toBe('Apple 5주 매수')
    expect(r.description).toBe('신규 보유 (평단 $185.00)')
  })

  it('before.shares = 0 도 첫 매수로 처리', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      type: 'BUY',
      shares: 3,
      before: { shares: 0, avgPrice: 0, avgPriceFx: null, avgFxRate: null },
      after: { shares: 3, avgPrice: 247000, avgPriceFx: 185, avgFxRate: 1335 },
      currency: 'USD',
    })
    expect(r.description).toBe('신규 보유 (평단 $185.00)')
  })
})

describe('formatHoldingDiff — 추가 매수', () => {
  it('평단 변동', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      type: 'BUY',
      shares: 5,
      before: { shares: 10, avgPrice: 240000, avgPriceFx: 180, avgFxRate: 1333 },
      after: { shares: 15, avgPrice: 244000, avgPriceFx: 183, avgFxRate: 1333 },
      currency: 'USD',
    })
    expect(r.title).toBe('Apple 5주 매수')
    expect(r.description).toBe('보유 10 → 15주, 평단 $180.00 → $183.00')
  })

  it('KRW 추가 매수', () => {
    const r = formatHoldingDiff({
      ticker: '005930',
      displayName: '삼성전자',
      type: 'BUY',
      shares: 20,
      before: { shares: 10, avgPrice: 70000, avgPriceFx: null, avgFxRate: null },
      after: { shares: 30, avgPrice: 72000, avgPriceFx: null, avgFxRate: null },
      currency: 'KRW',
    })
    expect(r.description).toBe('보유 10 → 30주, 평단 70,000원 → 72,000원')
  })
})

describe('formatHoldingDiff — 매도', () => {
  it('부분 매도는 평단 변동 없음', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      type: 'SELL',
      shares: 3,
      before: { shares: 15, avgPrice: 244000, avgPriceFx: 183, avgFxRate: 1333 },
      after: { shares: 12, avgPrice: 244000, avgPriceFx: 183, avgFxRate: 1333 },
      currency: 'USD',
    })
    expect(r.title).toBe('Apple 3주 매도')
    expect(r.description).toBe('보유 15 → 12주 (평단 변동 없음)')
  })

  it('전량 매도 — after null', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      type: 'SELL',
      shares: 15,
      before: { shares: 15, avgPrice: 244000, avgPriceFx: 183, avgFxRate: 1333 },
      after: null,
      currency: 'USD',
    })
    expect(r.title).toBe('Apple 15주 매도')
    expect(r.description).toBe('보유 종료')
  })

  it('전량 매도 — after.shares = 0', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      type: 'SELL',
      shares: 15,
      before: { shares: 15, avgPrice: 244000, avgPriceFx: 183, avgFxRate: 1333 },
      after: { shares: 0, avgPrice: 0, avgPriceFx: null, avgFxRate: null },
      currency: 'USD',
    })
    expect(r.description).toBe('보유 종료')
  })

  it('displayName 없으면 ticker 사용', () => {
    const r = formatHoldingDiff({
      ticker: 'AAPL',
      displayName: '',
      type: 'SELL',
      shares: 5,
      before: { shares: 5, avgPrice: 244000, avgPriceFx: 183, avgFxRate: 1333 },
      after: null,
      currency: 'USD',
    })
    expect(r.title).toBe('AAPL 5주 매도')
  })
})

describe('formatHoldingEditDiff', () => {
  it('수량과 평단 모두 변동', () => {
    const r = formatHoldingEditDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      before: { shares: 12, avgPrice: 240000, avgPriceFx: 180, avgFxRate: 1333 },
      after: { shares: 13, avgPrice: 242000, avgPriceFx: 182, avgFxRate: 1333 },
      currency: 'USD',
    })
    expect(r.title).toBe('Apple 거래 수정')
    expect(r.description).toBe('보유 12 → 13주, 평단 $180.00 → $182.00')
  })

  it('수량 동일, 평단만 변동', () => {
    const r = formatHoldingEditDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      before: { shares: 13, avgPrice: 240000, avgPriceFx: 180, avgFxRate: 1333 },
      after: { shares: 13, avgPrice: 245000, avgPriceFx: 184, avgFxRate: 1333 },
      currency: 'USD',
    })
    expect(r.description).toBe('보유 13주 (수량 변동 없음), 평단 $180.00 → $184.00')
  })

  it('전량 매도된 거래 수정 → 보유 종료', () => {
    const r = formatHoldingEditDiff({
      ticker: 'AAPL',
      displayName: 'Apple',
      before: { shares: 5, avgPrice: 240000, avgPriceFx: 180, avgFxRate: 1333 },
      after: null,
      currency: 'USD',
    })
    expect(r.description).toBe('보유 종료')
  })
})
