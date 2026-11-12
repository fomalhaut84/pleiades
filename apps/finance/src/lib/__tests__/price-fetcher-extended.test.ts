/**
 * #615 — 야후 quote 의 시간외·프리마켓 값을 버리지 않는다.
 * 실측(2026-11-12 10:35 KST): NVDA marketState=POSTPOST · postMarketPrice 158.78 · postMarketChangePercent -8.61 ·
 * postMarketTime 01:00Z(regularMarketTime 21:00Z 뒤). 한국 종목은 pre/post 필드가 없다.
 */
import { describe, expect, it } from 'vitest'
import { extractExtendedQuote, extractMarketCap } from '../price-fetcher-utils'

const REG = new Date('2026-11-11T21:00:00Z')

describe('extractExtendedQuote (#615)', () => {
  it('정규장 뒤 시간외 값을 post 로 낸다', () => {
    const ext = extractExtendedQuote(
      { postMarketPrice: 158.78, postMarketChange: -14.95, postMarketChangePercent: -8.605306, postMarketTime: '2026-11-12T01:00:00.000Z' },
      REG,
      173.73,
    )
    expect(ext).toEqual({ session: 'post', price: 158.78, change: -14.95, changePercent: -8.605306, time: new Date('2026-11-12T01:00:00Z') })
  })

  it('프리마켓이 시간외보다 늦으면 pre 를 고른다', () => {
    const ext = extractExtendedQuote(
      {
        postMarketPrice: 158.78, postMarketChangePercent: -8.6, postMarketTime: '2026-11-12T01:00:00Z',
        preMarketPrice: 160.1, preMarketChangePercent: -7.85, preMarketTime: '2026-11-12T12:30:00Z',
      },
      REG,
      173.73,
    )
    expect(ext?.session).toBe('pre')
    expect(ext?.price).toBe(160.1)
  })

  it('정규장 시각보다 이른 시간외 값(전날 것)은 내지 않는다 — 장중', () => {
    const ext = extractExtendedQuote(
      { postMarketPrice: 150, postMarketChangePercent: -1, postMarketTime: '2026-11-11T01:00:00Z' },
      new Date('2026-11-11T18:00:00Z'),
      173.73,
    )
    expect(ext).toBeNull()
  })

  it('정규장 시각과 같은 시각의 값은 내지 않는다 (경계 · 뒤에 찍힌 것만)', () => {
    expect(extractExtendedQuote({ postMarketPrice: 150, postMarketChangePercent: -1, postMarketTime: REG.toISOString() }, REG, 173.73)).toBeNull()
  })

  it('시각이 epoch 초 숫자여도 읽는다', () => {
    const sec = Math.floor(Date.parse('2026-11-12T01:00:00Z') / 1000)
    expect(extractExtendedQuote({ postMarketPrice: 158.78, postMarketChangePercent: -8.6, postMarketTime: sec }, REG, 173.73)?.time).toEqual(new Date('2026-11-12T01:00:00Z'))
  })

  it('변동률이 없으면 정규장 종가 대비로 계산한다', () => {
    const ext = extractExtendedQuote({ postMarketPrice: 90, postMarketTime: '2026-11-12T01:00:00Z' }, REG, 100)
    expect(ext?.change).toBeCloseTo(-10)
    expect(ext?.changePercent).toBeCloseTo(-10)
  })

  it('필드가 없거나 가격이 유효하지 않으면 null (한국 종목)', () => {
    expect(extractExtendedQuote({}, REG, 210250)).toBeNull()
    expect(extractExtendedQuote({ postMarketPrice: 0, postMarketTime: '2026-11-12T01:00:00Z' }, REG, 100)).toBeNull()
    expect(extractExtendedQuote({ postMarketPrice: 'x', postMarketTime: '2026-11-12T01:00:00Z' }, REG, 100)).toBeNull()
    expect(extractExtendedQuote({ postMarketPrice: 90 }, REG, 100)).toBeNull()
  })

  it('정규장 시각을 모르면 내지 않는다 (기준을 세울 수 없다)', () => {
    expect(extractExtendedQuote({ postMarketPrice: 90, postMarketTime: '2026-11-12T01:00:00Z' }, null, 100)).toBeNull()
  })
})

describe('extractMarketCap (#615)', () => {
  it('양의 유한값만', () => {
    expect(extractMarketCap({ marketCap: 4195058188288 })).toBe(4195058188288)
    expect(extractMarketCap({ marketCap: 0 })).toBeNull()
    expect(extractMarketCap({})).toBeNull()
    expect(extractMarketCap({ marketCap: '1e9' })).toBeNull()
  })
})
