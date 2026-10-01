import { describe, expect, it } from 'vitest'
import {
  KNOWN_KINDS, parseISOOrNull, kstDateKey, buildKstDayBuckets, parseKindsParam,
  resolveTimeWindow,
} from '../shared'

describe('KNOWN_KINDS', () => {
  it('9종 kind 를 모두 포함 (33-A AlertHistory 매핑과 동기화)', () => {
    for (const k of [
      'surge', 'drop', 'fx',
      'target_hit', 'stop_loss',
      'watch_buy', 'watch_zone',
      'ta_signal', 'custom_strategy',
    ]) {
      expect(KNOWN_KINDS.has(k)).toBe(true)
    }
    expect(KNOWN_KINDS.size).toBe(9)
  })

  it('알려지지 않은 값은 false', () => {
    expect(KNOWN_KINDS.has('unknown')).toBe(false)
    expect(KNOWN_KINDS.has('')).toBe(false)
  })
})

describe('parseISOOrNull', () => {
  it('ISO 문자열 → Date', () => {
    const d = parseISOOrNull('2026-07-08T00:00:00Z')
    expect(d?.toISOString()).toBe('2026-07-08T00:00:00.000Z')
  })

  it('잘못된 형식 → null', () => {
    expect(parseISOOrNull('not-a-date')).toBeNull()
    expect(parseISOOrNull('2026-13-40')).toBeNull()
  })

  it('undefined/null/빈문자열 → null', () => {
    expect(parseISOOrNull(undefined)).toBeNull()
    expect(parseISOOrNull(null)).toBeNull()
    expect(parseISOOrNull('')).toBeNull()
  })
})

describe('parseKindsParam (Codex #424 P2 회귀 방지)', () => {
  it('반복 파라미터 (`?kind=a&kind=b`) → kinds 배열', () => {
    const p = new URLSearchParams('kind=drop&kind=surge')
    const r = parseKindsParam(p)
    expect(new Set(r.kinds)).toEqual(new Set(['drop', 'surge']))
    expect(r.invalid).toEqual([])
  })

  it('CSV (`?kind=a,b`) 도 지원', () => {
    const p = new URLSearchParams('kind=drop,surge')
    const r = parseKindsParam(p)
    expect(new Set(r.kinds)).toEqual(new Set(['drop', 'surge']))
  })

  it('반복 + CSV 혼합, 중복 제거', () => {
    const p = new URLSearchParams('kind=drop,surge&kind=drop&kind=fx')
    const r = parseKindsParam(p)
    expect(new Set(r.kinds)).toEqual(new Set(['drop', 'surge', 'fx']))
  })

  it('알려지지 않은 kind → invalid 로 분리', () => {
    const p = new URLSearchParams('kind=drop&kind=nope&kind=xyz')
    const r = parseKindsParam(p)
    expect(r.kinds).toEqual(['drop'])
    expect(new Set(r.invalid)).toEqual(new Set(['nope', 'xyz']))
  })

  it('kind 파라미터 없음 → 빈 배열', () => {
    const r = parseKindsParam(new URLSearchParams(''))
    expect(r.kinds).toEqual([])
    expect(r.invalid).toEqual([])
  })

  it('공백/빈 문자열 제거', () => {
    const p = new URLSearchParams('kind=  ,,drop, ')
    const r = parseKindsParam(p)
    expect(r.kinds).toEqual(['drop'])
  })
})

describe('kstDateKey', () => {
  it('UTC 00:00 → KST 09:00 → 같은 날짜', () => {
    expect(kstDateKey(new Date('2026-07-08T00:00:00Z'))).toBe('2026-07-08')
  })
  it('UTC 15:00 → KST 00:00 (다음날)', () => {
    expect(kstDateKey(new Date('2026-07-07T15:00:00Z'))).toBe('2026-07-08')
  })
  it('UTC 14:59 → KST 23:59 (같은 날)', () => {
    expect(kstDateKey(new Date('2026-07-07T14:59:00Z'))).toBe('2026-07-07')
  })
})

describe('buildKstDayBuckets (self-review P1 회귀 방지 #417)', () => {
  it('간단 3일 범위, 이벤트 없음 → 연속 버킷 3개', () => {
    const from = new Date('2026-07-01T00:00:00Z')
    const to = new Date('2026-07-03T00:00:00Z')
    const buckets = buildKstDayBuckets(new Map(), from, to)
    expect(buckets.map((b) => b.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(buckets.every((b) => b.count === 0)).toBe(true)
  })

  it('KST 자정 넘어가는 from/to (UTC 시각 불일치) 도 trailing 날짜 포함', () => {
    // effectiveFrom = 07-01 14:59 UTC = 07-01 23:59 KST → key 07-01
    // effectiveTo   = 07-08 15:00 UTC = 07-09 00:00 KST → key 07-09
    // 이전 버그: cursor 가 UTC 14:59 고정으로 진행 → 07-08 14:59 UTC 에서 종료 → 07-09 누락.
    const from = new Date('2026-07-01T14:59:00Z')
    const to = new Date('2026-07-08T15:00:00Z')
    const buckets = buildKstDayBuckets(new Map(), from, to)
    const dates = buckets.map((b) => b.date)
    expect(dates[0]).toBe('2026-07-01')
    expect(dates[dates.length - 1]).toBe('2026-07-09')
    expect(dates).toContain('2026-07-08')
    expect(dates).toContain('2026-07-09')
    // 중복/누락 없이 연속 KST 날짜 9개
    expect(dates.length).toBe(9)
  })

  it('countsByKey 값이 있으면 해당 날짜 count 반영', () => {
    const counts = new Map([['2026-07-02', 3], ['2026-07-03', 1]])
    const from = new Date('2026-07-01T00:00:00Z')
    const to = new Date('2026-07-03T00:00:00Z')
    const buckets = buildKstDayBuckets(counts, from, to)
    expect(buckets).toEqual([
      { date: '2026-07-01', count: 0 },
      { date: '2026-07-02', count: 3 },
      { date: '2026-07-03', count: 1 },
    ])
  })

  it('to < from → 빈 배열', () => {
    const buckets = buildKstDayBuckets(
      new Map(),
      new Date('2026-07-05T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    )
    expect(buckets).toEqual([])
  })

  it('같은 날 (from == to) → 1개 버킷', () => {
    const d = new Date('2026-07-08T05:00:00Z')
    const buckets = buildKstDayBuckets(new Map([['2026-07-08', 2]]), d, d)
    expect(buckets).toEqual([{ date: '2026-07-08', count: 2 }])
  })
})

describe('resolveTimeWindow (Codex #428 P2 회귀 방지)', () => {
  const now = new Date('2026-07-09T00:00:00Z')
  const DAY = 24 * 60 * 60 * 1000

  it('both null → now anchored, from = now - N일', () => {
    const r = resolveTimeWindow(null, null, 7, now)
    expect(r.effectiveTo).toBe(now)
    expect(r.effectiveFrom.getTime()).toBe(now.getTime() - 7 * DAY)
  })

  it('to 만 지정 (과거) → from = to - N일 (inverted range 방지)', () => {
    const to = new Date('2026-06-01T00:00:00Z')
    const r = resolveTimeWindow(null, to, 7, now)
    expect(r.effectiveTo).toBe(to)
    expect(r.effectiveFrom.getTime()).toBe(to.getTime() - 7 * DAY)
    // 실제 위험 조건: from <= to (기존 버그 재현 방지)
    expect(r.effectiveFrom.getTime()).toBeLessThanOrEqual(r.effectiveTo.getTime())
  })

  it('from 만 지정 → to = now', () => {
    const from = new Date('2026-06-01T00:00:00Z')
    const r = resolveTimeWindow(from, null, 7, now)
    expect(r.effectiveFrom).toBe(from)
    expect(r.effectiveTo).toBe(now)
  })

  it('both 지정 → 그대로', () => {
    const from = new Date('2026-05-01T00:00:00Z')
    const to = new Date('2026-06-01T00:00:00Z')
    const r = resolveTimeWindow(from, to, 7, now)
    expect(r.effectiveFrom).toBe(from)
    expect(r.effectiveTo).toBe(to)
  })
})
