import { describe, expect, it } from 'vitest'
import { businessErrorResponse, isSafeBusinessError } from '../api-errors'

describe('isSafeBusinessError', () => {
  it('보유 수량 부족 메시지 매칭', () => {
    expect(isSafeBusinessError(new Error('보유 수량 부족: 5주 매도 시도, 현재 2주'))).toBe(true)
  })

  it('보유 수량 초과 메시지 매칭', () => {
    expect(isSafeBusinessError(new Error('보유 수량(10주)을 초과합니다.'))).toBe(true)
  })

  it('이미 등록된 티커 메시지 매칭', () => {
    expect(
      isSafeBusinessError(new Error('AAPL은(는) 이미 US/USD로 등록되어 있습니다.'))
    ).toBe(true)
  })

  it('USD 환율 누락 메시지는 화이트리스트 외부', () => {
    expect(
      isSafeBusinessError(new Error('USD 거래에는 유효한 환율이 필요합니다.'))
    ).toBe(false)
  })

  it('일반 에러 메시지 차단', () => {
    expect(isSafeBusinessError(new Error('random error'))).toBe(false)
  })

  it('"이미" 단독 substring 만으로는 매칭 안 됨 (우연 매칭 차단)', () => {
    expect(isSafeBusinessError(new Error('이미 처리됨'))).toBe(false)
  })

  it('"초과합니다" 단독 substring 만으로는 매칭 안 됨', () => {
    expect(isSafeBusinessError(new Error('한도 초과합니다'))).toBe(false)
  })

  it('Error 인스턴스 아닌 값은 false', () => {
    expect(isSafeBusinessError('보유 수량 부족: ...')).toBe(false)
    expect(isSafeBusinessError(null)).toBe(false)
    expect(isSafeBusinessError(undefined)).toBe(false)
    expect(isSafeBusinessError({ message: '보유 수량 부족: ...' })).toBe(false)
  })
})

describe('businessErrorResponse', () => {
  it('화이트리스트 매칭 시 400 + envelope 응답', async () => {
    const res = businessErrorResponse(new Error('보유 수량 부족: 5주'))
    expect(res).not.toBeNull()
    expect(res?.status).toBe(400)
    const body = await res?.json()
    expect(body).toEqual({ success: false, error: '보유 수량 부족: 5주' })
  })

  it('화이트리스트 외부는 null 반환', () => {
    expect(businessErrorResponse(new Error('random'))).toBeNull()
    expect(businessErrorResponse('보유 수량 부족: ...')).toBeNull()
  })
})
