import { describe, expect, it } from 'vitest'
import { validateTradeInput } from '../trade-utils'

const baseKRW = {
  accountId: 'acc_1',
  ticker: '005930',
  displayName: '삼성전자',
  market: 'KR',
  type: 'BUY',
  shares: 10,
  price: 70000,
  currency: 'KRW',
  tradedAt: '2024-01-15',
}

const baseUSD = {
  accountId: 'acc_2',
  ticker: 'AAPL',
  displayName: 'Apple Inc.',
  market: 'US',
  type: 'BUY',
  shares: 5,
  price: 180.5,
  currency: 'USD',
  fxRate: 1340,
  tradedAt: '2024-01-15',
}

describe('validateTradeInput — 정상', () => {
  it('KRW BUY 정상', () => {
    expect(validateTradeInput(baseKRW)).toEqual([])
  })
  it('USD BUY 정상', () => {
    expect(validateTradeInput(baseUSD)).toEqual([])
  })
  it('SELL 정상', () => {
    expect(validateTradeInput({ ...baseKRW, type: 'SELL' })).toEqual([])
  })
})

describe('validateTradeInput — 필수 필드', () => {
  it('accountId 누락', () => {
    const errors = validateTradeInput({ ...baseKRW, accountId: undefined })
    expect(errors.find((e) => e.field === 'accountId')?.message).toBe('계좌를 선택해주세요.')
  })
  it('ticker 공백', () => {
    const errors = validateTradeInput({ ...baseKRW, ticker: '   ' })
    expect(errors.find((e) => e.field === 'ticker')?.message).toBe('종목을 선택해주세요.')
  })
  it('displayName 공백', () => {
    const errors = validateTradeInput({ ...baseKRW, displayName: '' })
    expect(errors.find((e) => e.field === 'displayName')?.message).toBe('종목명을 입력해주세요.')
  })
})

describe('validateTradeInput — 형식', () => {
  it('잘못된 market', () => {
    const errors = validateTradeInput({ ...baseKRW, market: 'JP' })
    expect(errors.find((e) => e.field === 'market')?.message).toBe('시장을 선택해주세요 (US/KR).')
  })
  it('잘못된 type', () => {
    const errors = validateTradeInput({ ...baseKRW, type: 'HOLD' })
    expect(errors.find((e) => e.field === 'type')?.message).toBe(
      '거래 유형을 선택해주세요 (BUY/SELL).'
    )
  })
  it('shares 0', () => {
    const errors = validateTradeInput({ ...baseKRW, shares: 0 })
    expect(errors.find((e) => e.field === 'shares')?.message).toBe('수량은 1 이상의 정수여야 합니다.')
  })
  it('shares 소수', () => {
    const errors = validateTradeInput({ ...baseKRW, shares: 1.5 })
    expect(errors.find((e) => e.field === 'shares')?.message).toBe('수량은 1 이상의 정수여야 합니다.')
  })
  it('shares 문자열', () => {
    const errors = validateTradeInput({ ...baseKRW, shares: '10' })
    expect(errors.find((e) => e.field === 'shares')?.message).toBe('수량은 1 이상의 정수여야 합니다.')
  })
  it('price 0', () => {
    const errors = validateTradeInput({ ...baseKRW, price: 0 })
    expect(errors.find((e) => e.field === 'price')?.message).toBe('단가는 0보다 큰 숫자여야 합니다.')
  })
  it('price 음수', () => {
    const errors = validateTradeInput({ ...baseKRW, price: -100 })
    expect(errors.find((e) => e.field === 'price')?.message).toBe('단가는 0보다 큰 숫자여야 합니다.')
  })
})

describe('validateTradeInput — 교차 검증', () => {
  it('USD 환율 누락', () => {
    const errors = validateTradeInput({ ...baseUSD, fxRate: null })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toContain('환율')
  })
  it('USD 환율 0', () => {
    const errors = validateTradeInput({ ...baseUSD, fxRate: 0 })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toContain('환율')
  })
  it('USD 환율 NaN (CSV import 호환)', () => {
    const errors = validateTradeInput({ ...baseUSD, fxRate: NaN })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toContain('환율')
  })
  it('USD 환율 문자열', () => {
    const errors = validateTradeInput({ ...baseUSD, fxRate: 'bad' })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toContain('환율')
  })
  it('US 시장 + KRW 통화', () => {
    const errors = validateTradeInput({ ...baseUSD, currency: 'KRW' })
    expect(errors.find((e) => e.field === 'currency')?.message).toBe(
      'US 시장은 USD 통화만 가능합니다.'
    )
  })
  it('KR 시장 + USD 통화', () => {
    const errors = validateTradeInput({ ...baseKRW, currency: 'USD' })
    expect(errors.find((e) => e.field === 'currency')?.message).toBe(
      'KR 시장은 KRW 통화만 가능합니다.'
    )
  })
})

describe('validateTradeInput — 거래일', () => {
  it('미래 날짜', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const errors = validateTradeInput({ ...baseKRW, tradedAt: future })
    expect(errors.find((e) => e.field === 'tradedAt')?.message).toBe('미래 날짜는 입력할 수 없습니다.')
  })
  it('1999 년 이전', () => {
    const errors = validateTradeInput({ ...baseKRW, tradedAt: '1999-12-31' })
    expect(errors.find((e) => e.field === 'tradedAt')?.message).toBe(
      '2000-01-01 이후 날짜를 입력해주세요.'
    )
  })
  it('parse 불가 날짜', () => {
    const errors = validateTradeInput({ ...baseKRW, tradedAt: 'not-a-date' })
    expect(errors.find((e) => e.field === 'tradedAt')?.message).toBe('유효한 거래일을 입력해주세요.')
  })
  it('tradedAt null', () => {
    const errors = validateTradeInput({ ...baseKRW, tradedAt: null })
    expect(errors.find((e) => e.field === 'tradedAt')?.message).toBe('유효한 거래일을 입력해주세요.')
  })
})
