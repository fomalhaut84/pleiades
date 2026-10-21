import { describe, expect, it } from 'vitest'
import { pickStaleSessions, resolveSessionRequest } from '../session-utils'

interface Entry { lastActivityAt: number }

describe('pickStaleSessions', () => {
  const NOW = 1_000_000
  const TTL = 60_000 // 1 minute

  it('빈 map → 빈 배열', () => {
    expect(pickStaleSessions(new Map<string, Entry>(), NOW, TTL)).toEqual([])
  })

  it('모든 세션이 TTL 이내 → 빈 배열', () => {
    const map = new Map<string, Entry>([
      ['a', { lastActivityAt: NOW }],
      ['b', { lastActivityAt: NOW - 30_000 }], // 30s ago
    ])
    expect(pickStaleSessions(map, NOW, TTL)).toEqual([])
  })

  it('TTL 초과 세션만 반환', () => {
    const map = new Map<string, Entry>([
      ['fresh', { lastActivityAt: NOW - 10_000 }], // 10s ago
      ['stale1', { lastActivityAt: NOW - 120_000 }], // 2min ago
      ['stale2', { lastActivityAt: NOW - 300_000 }], // 5min ago
    ])
    expect(pickStaleSessions(map, NOW, TTL).sort()).toEqual(['stale1', 'stale2'])
  })

  it('경계 — 정확히 TTL 만큼 idle 이면 유지, 1ms 초과부터 stale', () => {
    const map = new Map<string, Entry>([
      ['on-boundary', { lastActivityAt: NOW - TTL }], // exact TTL → keep
      ['just-past', { lastActivityAt: NOW - TTL - 1 }], // 1ms over → stale
    ])
    expect(pickStaleSessions(map, NOW, TTL)).toEqual(['just-past'])
  })

  it('과거 lastActivityAt (음수 시간 차) → stale 판정 안 함', () => {
    // 시계 skew 등 예외 상황 방어
    const map = new Map<string, Entry>([['future', { lastActivityAt: NOW + 5_000 }]])
    expect(pickStaleSessions(map, NOW, TTL)).toEqual([])
  })

  it('임의의 이터러블 (Map#entries 외 Array) 도 처리', () => {
    const arr: Array<[string, Entry]> = [
      ['a', { lastActivityAt: NOW - 90_000 }],
      ['b', { lastActivityAt: NOW - 30_000 }],
    ]
    expect(pickStaleSessions(arr, NOW, TTL)).toEqual(['a'])
  })
})

describe('resolveSessionRequest', () => {
  it('reuse — sessionId 존재 + hasSession=true', () => {
    expect(
      resolveSessionRequest({ sessionIdHeader: 'abc', hasSession: true, isInitialize: false }),
    ).toBe('reuse')
  })

  it('reuse 는 initialize 여부와 무관', () => {
    expect(
      resolveSessionRequest({ sessionIdHeader: 'abc', hasSession: true, isInitialize: true }),
    ).toBe('reuse')
  })

  it('create — sessionId 없고 initialize 요청', () => {
    expect(
      resolveSessionRequest({ sessionIdHeader: null, hasSession: false, isInitialize: true }),
    ).toBe('create')
  })

  it('expired — sessionId 있지만 hasSession=false (sweeper 정리 후 재요청 or 프로세스 재시작)', () => {
    expect(
      resolveSessionRequest({ sessionIdHeader: 'stale', hasSession: false, isInitialize: false }),
    ).toBe('expired')
  })

  it('expired — sessionId 있고 initialize 요청이지만 hasSession=false 도 expired 로 분류', () => {
    // Client 가 재시도로 initialize 를 보낼 수도 있지만 명시 session id 를 함께 보냈다면
    // 이는 stale 세션에 대한 재시도로 간주하고 expired 로 응답 (클라이언트가 sid 폐기).
    expect(
      resolveSessionRequest({ sessionIdHeader: 'stale', hasSession: false, isInitialize: true }),
    ).toBe('expired')
  })

  it('invalid — sessionId 없고 initialize 도 아님', () => {
    expect(
      resolveSessionRequest({ sessionIdHeader: null, hasSession: false, isInitialize: false }),
    ).toBe('invalid')
  })
})
