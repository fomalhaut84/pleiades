import { describe, expect, it } from 'vitest'
import { normalizeMarket } from '../market-hours'

describe('normalizeMarket — Yahoo raw exchange 코드 (#502)', () => {
  it.each([
    ['ASE', 'NYSE American (IMO)'],
    ['BTS', 'Cboe US (ARKB)'],
    ['NMS', 'NasdaqGS'],
    ['NGM', 'NasdaqGM'],
    ['NYQ', 'NYSE'],
    ['PCX', 'NYSE Arca'],
  ])('%s → US (%s)', (code) => {
    expect(normalizeMarket(code)).toBe('US')
  })

  it('소문자 raw 코드도 US', () => {
    expect(normalizeMarket('ase')).toBe('US')
  })

  it('한국 코드는 그대로 KR', () => {
    expect(normalizeMarket('KSC')).toBe('KR')
  })
})
