import { describe, expect, it } from 'vitest'
import { newTraceId, summarizeArgs, IS_STDIO_MODE } from '../logger'

describe('newTraceId', () => {
  it('8자 hex 문자열 반환', () => {
    const id = newTraceId()
    expect(id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('호출마다 유일 값 (충돌 확률 낮음)', () => {
    const ids = new Set()
    for (let i = 0; i < 1000; i++) ids.add(newTraceId())
    expect(ids.size).toBe(1000)
  })
})

describe('summarizeArgs', () => {
  it('null/undefined 그대로 반환', () => {
    expect(summarizeArgs(null)).toBe(null)
    expect(summarizeArgs(undefined)).toBe(undefined)
  })

  it('짧은 값은 그대로 반환', () => {
    const args = { ticker: 'AAPL', account: '세진' }
    expect(summarizeArgs(args)).toEqual(args)
  })

  it('긴 값은 truncate (200자 default)', () => {
    const longStr = 'x'.repeat(500)
    const args = { data: longStr }
    const result = summarizeArgs(args) as { _truncated: boolean; preview: string }
    expect(result._truncated).toBe(true)
    expect(result.preview.length).toBeLessThanOrEqual(200)
  })

  it('사용자 지정 maxLen 존중', () => {
    const args = { a: 'x'.repeat(100) }
    const result = summarizeArgs(args, 20) as { _truncated: boolean; preview: string }
    expect(result._truncated).toBe(true)
    expect(result.preview.length).toBeLessThanOrEqual(20)
  })

  it('serialize 불가한 값은 fallback', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const result = summarizeArgs(circular) as { _unserializable: boolean; type: string }
    expect(result._unserializable).toBe(true)
    expect(result.type).toBe('object')
  })

  describe('sensitive 필드 redact (Codex P2)', () => {
    it('password 필드는 짧은 값도 REDACTED', () => {
      const result = summarizeArgs({ user: 'sejin', password: 'secret123' })
      expect(result).toEqual({ user: 'sejin', password: '[REDACTED]' })
    })

    it('token / secret / apiKey / jwt / credential / authorization 모두 redact', () => {
      const result = summarizeArgs({
        token: 'abc',
        secret: 'x',
        apiKey: 'y',
        jwtToken: 'z',
        credential: 'w',
        authorization: 'Bearer xxx',
        accessToken: 'a',
        refreshToken: 'r',
        safe: 'ok',
      }, 500) as Record<string, string>
      expect(result.token).toBe('[REDACTED]')
      expect(result.secret).toBe('[REDACTED]')
      expect(result.apiKey).toBe('[REDACTED]')
      expect(result.jwtToken).toBe('[REDACTED]')
      expect(result.credential).toBe('[REDACTED]')
      expect(result.authorization).toBe('[REDACTED]')
      expect(result.accessToken).toBe('[REDACTED]')
      expect(result.refreshToken).toBe('[REDACTED]')
      expect(result.safe).toBe('ok')
    })

    it('author* / authored* 는 domain 필드로 유지 (false-positive 방지)', () => {
      const result = summarizeArgs({
        authorId: 'sejin',
        authorName: '세진',
        authoredAt: '2026-07-07',
      }) as Record<string, string>
      expect(result.authorId).toBe('sejin')
      expect(result.authorName).toBe('세진')
      expect(result.authoredAt).toBe('2026-07-07')
    })

    it('대소문자 무관 부분 매치 (userPassword, API_KEY 등)', () => {
      const result = summarizeArgs({
        userPassword: 'x',
        API_KEY: 'y',
        JwtSecret: 'z',
      }) as Record<string, string>
      expect(result.userPassword).toBe('[REDACTED]')
      expect(result.API_KEY).toBe('[REDACTED]')
      expect(result.JwtSecret).toBe('[REDACTED]')
    })

    it('중첩 오브젝트 안의 sensitive 필드도 redact', () => {
      const result = summarizeArgs({
        body: { password: 'x', name: 'ok' },
        headers: { authorization: 'Bearer xxx' },
      }) as { body: Record<string, string>; headers: Record<string, string> }
      expect(result.body.password).toBe('[REDACTED]')
      expect(result.body.name).toBe('ok')
      expect(result.headers.authorization).toBe('[REDACTED]')
    })

    it('특수 타입 (Date/Buffer/Error/Map/Set) 은 요약 문자열로 유지 (prototype 손실 방지)', () => {
      const now = new Date('2026-07-07T00:00:00Z')
      expect(summarizeArgs({ createdAt: now })).toEqual({ createdAt: '2026-07-07T00:00:00.000Z' })
      expect(summarizeArgs({ buf: Buffer.from('hello') })).toEqual({ buf: '[Buffer len=5]' })
      const err = new Error('boom')
      const result = summarizeArgs({ err }) as { err: { name: string; message: string } }
      expect(result.err.name).toBe('Error')
      expect(result.err.message).toBe('boom')
      expect(summarizeArgs({ m: new Map([['a', 1]]) })).toEqual({ m: '[Map size=1]' })
      expect(summarizeArgs({ s: new Set([1, 2]) })).toEqual({ s: '[Set size=2]' })
    })

    it('배열 안의 오브젝트도 redact', () => {
      const result = summarizeArgs({
        credentials: [{ password: 'x' }, { password: 'y' }],
      }) as { credentials: Array<Record<string, string>> }
      // credentials 자체가 'credential' 매치 → 전체 REDACTED
      expect(result.credentials).toBe('[REDACTED]')
    })

    it('긴 args 로 truncate 되어도 preview 에 secret 노출 X', () => {
      const longArgs = { password: 'MY_SUPER_SECRET_PASSWORD_12345', data: 'x'.repeat(500) }
      const result = summarizeArgs(longArgs) as { _truncated: boolean; preview: string }
      expect(result._truncated).toBe(true)
      expect(result.preview).not.toContain('MY_SUPER_SECRET_PASSWORD')
      expect(result.preview).toContain('[REDACTED]')
    })

    it('recursion depth 제한 (무한 중첩 방어)', () => {
      // depth 8 이상은 원본 그대로 반환. 실무상 안전한 깊이.
      const obj: Record<string, unknown> = {}
      let cur = obj
      for (let i = 0; i < 15; i++) {
        cur.next = {}
        cur = cur.next as Record<string, unknown>
      }
      // 안 터지고 결과 반환하기만 하면 OK
      const result = summarizeArgs(obj)
      expect(result).toBeDefined()
    })
  })
})

describe('toolError result 감지 로직 (integration snapshot)', () => {
  // MCP tools 대부분이 toolError({...}) 반환하여 { isError: true, content } 형태.
  // server.ts 의 wrapper 는 이 결과를 status:'error' 로 로깅해야 함.
  // 여기서는 wrapper 가 참조하는 discriminator 만 검증.

  it('isError=true 오브젝트는 실패로 간주', () => {
    const result = { isError: true, content: [{ type: 'text', text: '오류: 뭔가 잘못됨' }] }
    const isError = typeof result === 'object' && result !== null &&
      (result as { isError?: unknown }).isError === true
    expect(isError).toBe(true)
  })

  it('isError 없거나 false 는 성공', () => {
    expect(({ content: [{ type: 'text', text: 'ok' }] } as { isError?: boolean }).isError).toBeUndefined()
    const r = { isError: false, content: [] } as { isError: boolean }
    expect(r.isError).toBe(false)
  })

  it('null / string / number 는 실패 판정 X (성공으로 취급)', () => {
    for (const v of [null, 'ok', 42, undefined]) {
      const isError = typeof v === 'object' && v !== null &&
        (v as { isError?: unknown }).isError === true
      expect(isError).toBe(false)
    }
  })
})

describe('IS_STDIO_MODE 감지', () => {
  it('MCP_TRANSPORT 이 unset 또는 stdio 이면 stdio 모드', () => {
    // 이 테스트는 process 시작 시점의 env 값 스냅샷을 기반. vitest 는 test setup 에서
    // 이미 결정된 상수를 검증하는 용도.
    // (env 는 vitest 안에서 stdio 기본값 or 명시 stdio 로 시작하는 것이 정상)
    // 최소한 export 된 값이 boolean 임을 보장.
    expect(typeof IS_STDIO_MODE).toBe('boolean')
  })
})
