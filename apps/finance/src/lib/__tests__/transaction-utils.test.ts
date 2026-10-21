import { describe, expect, it } from 'vitest'
import { validateTransactionInput } from '../transaction-utils'

const base = {
  amount: 12000,
  description: '점심',
  categoryId: 'cat_food',
}

describe('validateTransactionInput — 정상', () => {
  it('기본 거래', () => {
    expect(validateTransactionInput(base)).toEqual([])
  })
  it('transfer_out + linkedAssetId', () => {
    expect(
      validateTransactionInput({
        ...base,
        type: 'transfer_out',
        linkedAssetId: 'asset_1',
        categoryId: 'cat_transfer',
      })
    ).toEqual([])
  })
  it('transactedAt 있는 경우', () => {
    expect(validateTransactionInput({ ...base, transactedAt: '2024-04-01' })).toEqual([])
  })
})

describe('validateTransactionInput — amount', () => {
  it('amount 키 자체 누락 (외부 클라이언트 / curl 호환)', () => {
    const errors = validateTransactionInput({ description: '점심', categoryId: 'cat_food' })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액을 입력해주세요.')
  })
  it('amount 누락', () => {
    const errors = validateTransactionInput({ ...base, amount: undefined })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액을 입력해주세요.')
  })
  it('amount null', () => {
    const errors = validateTransactionInput({ ...base, amount: null })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액을 입력해주세요.')
  })
  it('amount 문자열', () => {
    const errors = validateTransactionInput({ ...base, amount: '12000' })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액은 1 이상의 정수여야 합니다.')
  })
  it('amount 0', () => {
    const errors = validateTransactionInput({ ...base, amount: 0 })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액은 1 이상의 정수여야 합니다.')
  })
  it('amount 음수', () => {
    const errors = validateTransactionInput({ ...base, amount: -100 })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액은 1 이상의 정수여야 합니다.')
  })
  it('amount 소수', () => {
    const errors = validateTransactionInput({ ...base, amount: 100.5 })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액은 1 이상의 정수여야 합니다.')
  })
  it('amount > INT32 max', () => {
    const errors = validateTransactionInput({ ...base, amount: 3_000_000_000 })
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('금액이 허용 범위를 초과했습니다.')
  })
})

describe('validateTransactionInput — description', () => {
  it('description 누락', () => {
    const errors = validateTransactionInput({ ...base, description: undefined })
    expect(errors.find((e) => e.field === 'description')?.message).toBe('내용을 입력해주세요.')
  })
  it('description 공백만', () => {
    const errors = validateTransactionInput({ ...base, description: '   ' })
    expect(errors.find((e) => e.field === 'description')?.message).toBe('내용을 입력해주세요.')
  })
  it('description 200자 초과', () => {
    const errors = validateTransactionInput({ ...base, description: 'a'.repeat(201) })
    expect(errors.find((e) => e.field === 'description')?.message).toBe(
      '내용은 200자 이내로 입력해주세요.'
    )
  })
})

describe('validateTransactionInput — categoryId', () => {
  it('categoryId 누락', () => {
    const errors = validateTransactionInput({ ...base, categoryId: undefined })
    expect(errors.find((e) => e.field === 'categoryId')?.message).toBe('카테고리를 선택해주세요.')
  })
})

describe('validateTransactionInput — transfer 유형', () => {
  it('잘못된 type', () => {
    const errors = validateTransactionInput({ ...base, type: 'random' })
    expect(errors.find((e) => e.field === 'type')?.message).toBe(
      '유형은 transfer_out 또는 transfer_in만 허용됩니다.'
    )
  })
  it('transfer_out 인데 linkedAssetId 누락', () => {
    const errors = validateTransactionInput({ ...base, type: 'transfer_out' })
    expect(errors.find((e) => e.field === 'linkedAssetId')?.message).toBe(
      '출금/입금 시 연결 자산을 선택해주세요.'
    )
  })
  it('transfer_in 인데 linkedAssetId 빈 문자열', () => {
    const errors = validateTransactionInput({
      ...base,
      type: 'transfer_in',
      linkedAssetId: '',
    })
    expect(errors.find((e) => e.field === 'linkedAssetId')?.message).toBe(
      '출금/입금 시 연결 자산을 선택해주세요.'
    )
  })
})

describe('validateTransactionInput — transactedAt', () => {
  it('parse 불가', () => {
    const errors = validateTransactionInput({ ...base, transactedAt: 'bad-date' })
    expect(errors.find((e) => e.field === 'transactedAt')?.message).toBe(
      '유효한 날짜 형식이 아닙니다.'
    )
  })
  it('number 타입', () => {
    const errors = validateTransactionInput({ ...base, transactedAt: 12345 })
    expect(errors.find((e) => e.field === 'transactedAt')?.message).toBe(
      '날짜는 문자열이어야 합니다.'
    )
  })
})
