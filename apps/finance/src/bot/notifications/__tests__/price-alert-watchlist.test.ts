import { describe, expect, it } from 'vitest'
import { shouldSkipWatchlistAlert } from '../price-alert'

describe('shouldSkipWatchlistAlert (Phase 33-D / #415)', () => {
  const OPEN = () => true
  const CLOSED = () => false

  it('marketHoursOnly=off + 장중 → skip 안 함 (24h 동작)', () => {
    expect(shouldSkipWatchlistAlert(false, 'US', 'AAPL', OPEN)).toBe(false)
  })

  it('marketHoursOnly=off + 장외 → skip 안 함 (하위호환: 24h 동작 유지)', () => {
    expect(shouldSkipWatchlistAlert(false, 'US', 'AAPL', CLOSED)).toBe(false)
  })

  it('marketHoursOnly=on + 장중 → skip 안 함 (발동)', () => {
    expect(shouldSkipWatchlistAlert(true, 'KR', '005930.KS', OPEN)).toBe(false)
  })

  it('marketHoursOnly=on + 장외 → skip (알림 차단)', () => {
    expect(shouldSkipWatchlistAlert(true, 'KR', '005930.KS', CLOSED)).toBe(true)
  })

  it('marketOpen 판정 함수 인자로 market/ticker 를 그대로 전달', () => {
    const seen: Array<[string, string]> = []
    const spy = (m: string, t: string) => {
      seen.push([m, t])
      return true
    }
    shouldSkipWatchlistAlert(true, 'KR', '005930.KS', spy)
    expect(seen).toEqual([['KR', '005930.KS']])
  })
})
