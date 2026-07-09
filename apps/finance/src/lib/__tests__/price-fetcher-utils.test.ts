import { describe, expect, it } from 'vitest'
// price-fetcher 본체 (Prisma / yahoo top-level 로드) 대신 순수 유틸 모듈에서 직접 import →
// Prisma generate / DATABASE_URL 없이도 테스트 가능 (Codex #429 P2).
import { mergeCrossTickersIntoMeta } from '../price-fetcher-utils'

describe('mergeCrossTickersIntoMeta (Codex #428 P2 회귀 방지)', () => {
  it('신규 크로스 티커를 placeholder 로 삽입', () => {
    const meta = new Map()
    mergeCrossTickersIntoMeta(meta, ['SPY', 'VIX'])
    expect(meta.get('SPY')).toEqual({ displayName: 'SPY', market: '?', currency: 'USD' })
    expect(meta.get('VIX')).toEqual({ displayName: 'VIX', market: '?', currency: 'USD' })
  })

  it('KRX suffix (.KS/.KQ) 는 KRW 통화 부여', () => {
    const meta = new Map()
    mergeCrossTickersIntoMeta(meta, ['005930.KS', '035720.KS', '091990.KQ'])
    expect(meta.get('005930.KS')?.currency).toBe('KRW')
    expect(meta.get('091990.KQ')?.currency).toBe('KRW')
  })

  it('이미 등록된 티커는 덮어쓰지 않음 (holdings/watchlist 메타 우선)', () => {
    const meta = new Map([['SPY', { displayName: 'S&P 500 ETF', market: 'US', currency: 'USD' }]])
    mergeCrossTickersIntoMeta(meta, ['SPY', 'VIX'])
    expect(meta.get('SPY')).toEqual({ displayName: 'S&P 500 ETF', market: 'US', currency: 'USD' })
    expect(meta.get('VIX')?.displayName).toBe('VIX')
  })

  it('빈 crossTickers → 원본 그대로', () => {
    const meta = new Map([['AAPL', { displayName: 'Apple', market: 'US', currency: 'USD' }]])
    const before = new Map(meta)
    mergeCrossTickersIntoMeta(meta, [])
    expect(meta).toEqual(before)
  })

  it('Set 타입도 수용 (Iterable 인터페이스)', () => {
    const meta = new Map()
    mergeCrossTickersIntoMeta(meta, new Set(['SPY', 'QQQ']))
    expect(meta.has('SPY')).toBe(true)
    expect(meta.has('QQQ')).toBe(true)
  })
})
