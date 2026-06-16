import { describe, expect, it } from 'vitest'
import { validateDividendInput } from '../dividend-utils'

const baseKRW = {
  accountId: 'acc_1',
  ticker: '005930',
  displayName: '삼성전자',
  payDate: '2024-04-15',
  amountGross: 1000,
  amountNet: 846,
  currency: 'KRW',
}

const baseUSD = {
  accountId: 'acc_2',
  ticker: 'AAPL',
  displayName: 'Apple Inc.',
  payDate: '2024-05-15',
  amountGross: 1.5,
  amountNet: 1.28,
  currency: 'USD',
  fxRate: 1340,
}

describe('validateDividendInput — 정상', () => {
  it('KRW 정상', () => {
    expect(validateDividendInput(baseKRW)).toEqual([])
  })
  it('USD 정상', () => {
    expect(validateDividendInput(baseUSD)).toEqual([])
  })
})

describe('validateDividendInput — 필수 필드', () => {
  it('accountId 누락', () => {
    const errors = validateDividendInput({ ...baseKRW, accountId: undefined })
    expect(errors.find((e) => e.field === 'accountId')?.message).toBe('계좌를 선택해주세요.')
  })
  it('ticker 공백', () => {
    const errors = validateDividendInput({ ...baseKRW, ticker: '   ' })
    expect(errors.find((e) => e.field === 'ticker')?.message).toBe('종목을 선택해주세요.')
  })
  it('displayName 누락', () => {
    const errors = validateDividendInput({ ...baseKRW, displayName: '' })
    expect(errors.find((e) => e.field === 'displayName')?.message).toBe('종목명을 입력해주세요.')
  })
})

describe('validateDividendInput — 형식', () => {
  it('payDate parse 불가', () => {
    const errors = validateDividendInput({ ...baseKRW, payDate: 'not-a-date' })
    expect(errors.find((e) => e.field === 'payDate')?.message).toBe('유효한 지급일을 입력해주세요.')
  })
  it('amountGross 0', () => {
    const errors = validateDividendInput({ ...baseKRW, amountGross: 0 })
    expect(errors.find((e) => e.field === 'amountGross')?.message).toBe(
      '세전 금액은 0보다 커야 합니다.'
    )
  })
  it('amountGross 음수', () => {
    const errors = validateDividendInput({ ...baseKRW, amountGross: -10 })
    expect(errors.find((e) => e.field === 'amountGross')?.message).toBe(
      '세전 금액은 0보다 커야 합니다.'
    )
  })
  it('amountNet 음수', () => {
    const errors = validateDividendInput({ ...baseKRW, amountNet: -1 })
    expect(errors.find((e) => e.field === 'amountNet')?.message).toBe(
      '세후 금액은 0 이상이어야 합니다.'
    )
  })
  it('amountNet 0 은 허용', () => {
    const errors = validateDividendInput({ ...baseKRW, amountNet: 0 })
    expect(errors.find((e) => e.field === 'amountNet')).toBeUndefined()
  })
  it('잘못된 currency', () => {
    const errors = validateDividendInput({ ...baseKRW, currency: 'JPY' })
    expect(errors.find((e) => e.field === 'currency')?.message).toBe('통화를 선택해주세요 (USD/KRW).')
  })
})

describe('validateDividendInput — USD 환율', () => {
  it('환율 누락', () => {
    const errors = validateDividendInput({ ...baseUSD, fxRate: null })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toBe('USD 배당은 유효한 환율이 필요합니다.')
  })
  it('환율 0', () => {
    const errors = validateDividendInput({ ...baseUSD, fxRate: 0 })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toBe('USD 배당은 유효한 환율이 필요합니다.')
  })
  it('환율 음수', () => {
    const errors = validateDividendInput({ ...baseUSD, fxRate: -1300 })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toBe('USD 배당은 유효한 환율이 필요합니다.')
  })
  it('환율 NaN (CSV import 호환)', () => {
    const errors = validateDividendInput({ ...baseUSD, fxRate: NaN })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toBe('USD 배당은 유효한 환율이 필요합니다.')
  })
  it('환율 문자열', () => {
    const errors = validateDividendInput({ ...baseUSD, fxRate: 'bad' })
    expect(errors.find((e) => e.field === 'fxRate')?.message).toBe('USD 배당은 유효한 환율이 필요합니다.')
  })
})
