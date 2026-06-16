import { describe, expect, it } from 'vitest'
import {
  buildMonthGrid,
  groupEventsByDate,
  toKSTDateString,
  toVestingEvents,
  upcomingEvents,
  type VestingEvent,
} from '../vesting-events'

describe('toKSTDateString', () => {
  it('Date → YYYY-MM-DD (KST 변환)', () => {
    // 2026-06-15 15:00 UTC = 2026-06-16 00:00 KST
    expect(toKSTDateString(new Date('2026-06-15T15:00:00Z'))).toBe('2026-06-16')
  })
  it('ISO 문자열 입력 허용', () => {
    expect(toKSTDateString('2026-06-15T00:00:00Z')).toBe('2026-06-15')
  })
})

describe('toVestingEvents', () => {
  const baseRsu = {
    id: 'rsu1',
    vestingDate: new Date('2026-06-15T00:00:00Z'),
    shares: 300,
    accountId: 'acc1',
    status: 'pending',
    basisValue: 5_000_000,
    account: { name: '세진' },
  }
  const baseOption = {
    id: 'opt1',
    ticker: 'AAPL',
    displayName: 'Apple',
    strikePrice: 130,
    accountId: 'acc1',
    account: { name: '세진' },
    vestings: [
      { id: 'v1', vestingDate: new Date('2026-06-30T00:00:00Z'), shares: 500, status: 'pending' },
      { id: 'v2', vestingDate: new Date('2026-09-30T00:00:00Z'), shares: 500, status: 'exercised' },
    ],
  }

  it('RSU + 옵션 통합 + 정렬', () => {
    const events = toVestingEvents([baseRsu], [baseOption])
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.id)).toEqual(['rsu_rsu1', 'opt_v1', 'opt_v2'])
    expect(events[0].type).toBe('RSU')
    expect(events[1].type).toBe('OPTION')
  })

  it('RSU status 매핑 (vested 외 모두 pending)', () => {
    const events = toVestingEvents(
      [
        { ...baseRsu, id: 'r1', status: 'pending' },
        { ...baseRsu, id: 'r2', status: 'vested' },
        { ...baseRsu, id: 'r3', status: 'random' },
      ],
      [],
    )
    expect(events.find((e) => e.id === 'rsu_r1')?.status).toBe('pending')
    expect(events.find((e) => e.id === 'rsu_r2')?.status).toBe('vested')
    expect(events.find((e) => e.id === 'rsu_r3')?.status).toBe('pending')
  })

  it('옵션 status 매핑', () => {
    const events = toVestingEvents([], [baseOption])
    expect(events.find((e) => e.id === 'opt_v1')?.status).toBe('pending')
    expect(events.find((e) => e.id === 'opt_v2')?.status).toBe('exercised')
  })

  it('옵션 meta 전달', () => {
    const events = toVestingEvents([], [baseOption])
    expect(events[0].meta?.strikePrice).toBe(130)
    expect(events[0].ticker).toBe('AAPL')
    expect(events[0].link).toBe('/stock-options')
  })

  it('RSU link', () => {
    const events = toVestingEvents([baseRsu], [])
    expect(events[0].link).toBe('/rsu')
    expect(events[0].displayName).toBe('RSU')
    expect(events[0].meta?.basisValue).toBe(5_000_000)
  })
})

describe('groupEventsByDate', () => {
  it('같은 날짜 이벤트 묶음', () => {
    const events: VestingEvent[] = [
      { id: 'a', type: 'RSU', date: '2026-06-15', accountId: 'a', accountName: '세진', ticker: null, displayName: 'RSU', shares: 100, status: 'pending', link: '/rsu' },
      { id: 'b', type: 'OPTION', date: '2026-06-15', accountId: 'a', accountName: '세진', ticker: 'AAPL', displayName: 'AAPL', shares: 200, status: 'pending', link: '/stock-options' },
      { id: 'c', type: 'RSU', date: '2026-07-15', accountId: 'a', accountName: '세진', ticker: null, displayName: 'RSU', shares: 300, status: 'pending', link: '/rsu' },
    ]
    const grouped = groupEventsByDate(events)
    expect(grouped.get('2026-06-15')).toHaveLength(2)
    expect(grouped.get('2026-07-15')).toHaveLength(1)
    expect(grouped.size).toBe(2)
  })
})

describe('upcomingEvents', () => {
  const today = Date.UTC(2026, 5, 16) // 2026-06-16 UTC = 2026-06-16 KST (오전 9시 offset)
  const events: VestingEvent[] = [
    { id: 'past', type: 'RSU', date: '2026-05-15', accountId: 'a', accountName: '세진', ticker: null, displayName: 'RSU', shares: 100, status: 'vested', link: '/rsu' },
    { id: 'today', type: 'RSU', date: '2026-06-16', accountId: 'a', accountName: '세진', ticker: null, displayName: 'RSU', shares: 100, status: 'pending', link: '/rsu' },
    { id: 'within', type: 'OPTION', date: '2026-07-30', accountId: 'a', accountName: '세진', ticker: 'AAPL', displayName: 'AAPL', shares: 200, status: 'pending', link: '/stock-options' },
    { id: 'beyond', type: 'RSU', date: '2026-12-15', accountId: 'a', accountName: '세진', ticker: null, displayName: 'RSU', shares: 300, status: 'pending', link: '/rsu' },
    { id: 'exercised', type: 'OPTION', date: '2026-06-20', accountId: 'a', accountName: '세진', ticker: 'AAPL', displayName: 'AAPL', shares: 100, status: 'exercised', link: '/stock-options' },
    { id: 'expired', type: 'OPTION', date: '2026-06-25', accountId: 'a', accountName: '세진', ticker: 'NFLX', displayName: 'NFLX', shares: 100, status: 'expired', link: '/stock-options' },
  ]

  it('90일 안 이벤트만 (오늘 포함, exercised/expired 제외)', () => {
    const result = upcomingEvents(events, 90, today)
    const ids = result.map((e) => e.id).sort()
    expect(ids).toEqual(['today', 'within'])
  })

  it('과거 이벤트 제외', () => {
    const result = upcomingEvents(events, 365, today)
    expect(result.find((e) => e.id === 'past')).toBeUndefined()
  })

  it('exercised/expired 상태 제외', () => {
    const result = upcomingEvents(events, 90, today)
    expect(result.find((e) => e.id === 'exercised')).toBeUndefined()
    expect(result.find((e) => e.id === 'expired')).toBeUndefined()
  })
})

describe('buildMonthGrid', () => {
  it('2026-06 (6/1=월요일) — 5/31 부터 시작, 42 셀', () => {
    const cells = buildMonthGrid(2026, 5) // month 0-index: 5 = 6월
    expect(cells).toHaveLength(42)
    expect(cells[0].getDay()).toBe(0) // 일요일 시작
    expect(cells[0].getDate()).toBe(31) // 5/31
    expect(cells[0].getMonth()).toBe(4) // 5월
  })

  it('첫 셀의 요일이 항상 일요일', () => {
    expect(buildMonthGrid(2026, 0)[0].getDay()).toBe(0)
    expect(buildMonthGrid(2026, 1)[0].getDay()).toBe(0)
    expect(buildMonthGrid(2026, 11)[0].getDay()).toBe(0)
  })

  it('월 첫날 포함', () => {
    const cells = buildMonthGrid(2026, 5)
    const june1 = cells.find((d) => d.getMonth() === 5 && d.getDate() === 1)
    expect(june1).toBeDefined()
  })
})
