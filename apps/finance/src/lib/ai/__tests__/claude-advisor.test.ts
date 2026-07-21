/**
 * Phase 40-B (#469) — AdvisorError code 판정 + fallback 메시지 unit tests.
 *
 * askAdvisor 자체는 subprocess 를 spawn 하는 통합 성격이라 unit 커버 대상 아님.
 * pure 함수 (classifyAdvisorError, describeAdvisorError) 와 AdvisorError.code
 * 계약만 여기서 검증.
 */

import { describe, expect, it } from 'vitest'
import {
  AdvisorError,
  AdvisorTimeoutError,
  classifyAdvisorError,
  describeAdvisorError,
} from '../claude-advisor'

describe('classifyAdvisorError', () => {
  it('빈 stderr → unknown', () => {
    expect(classifyAdvisorError('')).toBe('unknown')
    expect(classifyAdvisorError(undefined)).toBe('unknown')
  })

  it('인증 만료 계열 → auth_expired', () => {
    expect(classifyAdvisorError('Error: not logged in')).toBe('auth_expired')
    expect(classifyAdvisorError('401 Unauthorized')).toBe('auth_expired')
    expect(classifyAdvisorError('Invalid credentials')).toBe('auth_expired')
    expect(classifyAdvisorError('Please login first')).toBe('auth_expired')
    expect(classifyAdvisorError('Session expired, please re-authenticate')).toBe('auth_expired')
    expect(classifyAdvisorError('Authentication failed')).toBe('auth_expired')
  })

  it('쿼터 초과 계열 → quota_exceeded', () => {
    expect(classifyAdvisorError('Daily quota exceeded')).toBe('quota_exceeded')
    expect(classifyAdvisorError('Rate limit reached')).toBe('quota_exceeded')
    expect(classifyAdvisorError('Usage limit exceeded')).toBe('quota_exceeded')
    expect(classifyAdvisorError('Too many requests')).toBe('quota_exceeded')
    expect(classifyAdvisorError('HTTP 429 Too Many Requests')).toBe('quota_exceeded')
  })

  it('MCP 서버 실패 계열 → server_down', () => {
    expect(classifyAdvisorError('connect ECONNREFUSED 127.0.0.1:4210')).toBe('server_down')
    expect(classifyAdvisorError('Error: connection refused')).toBe('server_down')
    expect(classifyAdvisorError('MCP server timeout at connect')).toBe('server_down')
    expect(classifyAdvisorError('MCP connect failed')).toBe('server_down')
    expect(classifyAdvisorError('server not responding')).toBe('server_down')
  })

  it('알려지지 않은 stderr → unknown', () => {
    expect(classifyAdvisorError('Random error message')).toBe('unknown')
    expect(classifyAdvisorError('SyntaxError: unexpected token')).toBe('unknown')
  })

  it('대소문자 무관 매치', () => {
    expect(classifyAdvisorError('NOT LOGGED IN')).toBe('auth_expired')
    expect(classifyAdvisorError('QUOTA EXCEEDED')).toBe('quota_exceeded')
  })

  it('여러 패턴 매치 시 우선순위 (auth > quota > server)', () => {
    // 인증 문구가 있으면 다른 것보다 우선
    expect(classifyAdvisorError('unauthorized quota exceeded')).toBe('auth_expired')
    // 인증 없고 quota + server 동시 → quota 우선
    expect(classifyAdvisorError('rate limit and connection refused')).toBe('quota_exceeded')
  })
})

describe('describeAdvisorError', () => {
  it('auth_expired → 관리자 문의 안내', () => {
    const err = new AdvisorError('x', undefined, 'auth_expired')
    const msg = describeAdvisorError(err)
    expect(msg).toContain('인증 갱신')
    expect(msg).toContain('관리자')
    // stderr detail 이 노출되면 안 됨
    expect(msg).not.toContain('stderr')
  })

  it('quota_exceeded → 사용량 초과 안내', () => {
    const err = new AdvisorError('x', undefined, 'quota_exceeded')
    const msg = describeAdvisorError(err)
    expect(msg).toContain('사용량 초과')
    expect(msg).toContain('관리자')
  })

  it('server_down → 서버 접근 실패', () => {
    const err = new AdvisorError('x', undefined, 'server_down')
    const msg = describeAdvisorError(err)
    expect(msg).toContain('서버 접근 실패')
  })

  it('timeout → 시간 초과', () => {
    const err = new AdvisorTimeoutError(60_000)
    const msg = describeAdvisorError(err)
    expect(msg).toContain('시간 초과')
    expect(msg).toContain('다시 시도')
  })

  it('parse_error → 응답 처리 실패', () => {
    const err = new AdvisorError('x', undefined, 'parse_error')
    const msg = describeAdvisorError(err)
    expect(msg).toContain('처리할 수 없습니다')
  })

  it('unknown (기본) → 일시 중단', () => {
    const err = new AdvisorError('x')
    expect(err.code).toBe('unknown')
    const msg = describeAdvisorError(err)
    expect(msg).toContain('일시 중단')
    expect(msg).toContain('관리자')
  })

  it('AdvisorError/Timeout 이 아닌 일반 Error → unknown 처리', () => {
    const err = new Error('random')
    const msg = describeAdvisorError(err)
    expect(msg).toContain('일시 중단')
  })

  // Codex #473 P2 pattern — stderr detail 은 사용자 노출 금지 원칙 재확인
  it('detail 이 있어도 fallback 메시지에는 노출 안 됨', () => {
    const err = new AdvisorError(
      'Claude CLI 종료 코드: 1',
      'stderr: 401 Unauthorized - credentials expired at line ...',
      'auth_expired',
    )
    const msg = describeAdvisorError(err)
    expect(msg).not.toContain('stderr')
    expect(msg).not.toContain('401')
    expect(msg).not.toContain('credentials')
  })
})

describe('AdvisorError.code 계약', () => {
  it('기본값 unknown', () => {
    expect(new AdvisorError('x').code).toBe('unknown')
  })

  it('detail 만 지정해도 code 는 기본값', () => {
    expect(new AdvisorError('x', 'stderr').code).toBe('unknown')
  })

  it('code 명시 시 그대로', () => {
    for (const c of ['auth_expired', 'quota_exceeded', 'server_down', 'parse_error'] as const) {
      expect(new AdvisorError('x', undefined, c).code).toBe(c)
    }
  })
})

describe('AdvisorTimeoutError.code', () => {
  it('항상 timeout', () => {
    expect(new AdvisorTimeoutError(30_000).code).toBe('timeout')
    expect(new AdvisorTimeoutError(180_000).code).toBe('timeout')
  })
})
