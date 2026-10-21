import { describe, expect, it } from 'vitest'
import { selectAiGuideTargets } from '../ta-signal-alert'

const COOLDOWN = 6 * 60 * 60 * 1000

describe('selectAiGuideTargets', () => {
  const A = { ticker: 'AAA' }
  const B = { ticker: 'BBB' }
  const C = { ticker: 'CCC' }
  const D = { ticker: 'DDD' }
  const NOW = 1_700_000_000_000

  it('빈 map + 후보 4 → topN 3 로 잘림', () => {
    const result = selectAiGuideTargets([A, B, C, D], new Map(), NOW, COOLDOWN, 3)
    expect(result).toEqual([A, B, C])
  })

  it('쿨다운 중인 티커는 제외', () => {
    const last = new Map<string, number>([
      [A.ticker, NOW - 1000], // just now → cooling
      [B.ticker, NOW - COOLDOWN + 1], // still cooling
    ])
    const result = selectAiGuideTargets([A, B, C, D], last, NOW, COOLDOWN, 3)
    expect(result).toEqual([C, D])
  })

  it('쿨다운 만료된 티커는 재포함', () => {
    const last = new Map<string, number>([
      [A.ticker, NOW - COOLDOWN], // 정확히 경계 → 재포함 (>=)
      [B.ticker, NOW - COOLDOWN - 1000], // 오래된 → 재포함
    ])
    const result = selectAiGuideTargets([A, B, C], last, NOW, COOLDOWN, 3)
    expect(result).toEqual([A, B, C])
  })

  it('쿨다운 스킵 후 topN 슬롯 낭비 없음', () => {
    // A 는 쿨다운, B/C/D 는 통과 → topN=3 슬롯 낭비 없이 B,C,D 반환
    const last = new Map<string, number>([[A.ticker, NOW - 1]])
    const result = selectAiGuideTargets([A, B, C, D], last, NOW, COOLDOWN, 3)
    expect(result).toEqual([B, C, D])
  })

  it('topN=0 → 빈 배열', () => {
    const result = selectAiGuideTargets([A, B], new Map(), NOW, COOLDOWN, 0)
    expect(result).toEqual([])
  })

  it('candidates 빈 → 빈 배열', () => {
    const result = selectAiGuideTargets([], new Map(), NOW, COOLDOWN, 3)
    expect(result).toEqual([])
  })
})
