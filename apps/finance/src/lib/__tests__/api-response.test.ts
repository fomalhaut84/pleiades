import { describe, expect, it } from 'vitest'
import { ok, fail, noContent, paginated } from '../api-response'

describe('ok — 단순 성공', () => {
  it('data 임베드 + success: true + status 200', async () => {
    const res = ok({ id: 'abc', name: 'Test' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { id: 'abc', name: 'Test' } })
  })

  it('status 옵션으로 201 Created', async () => {
    const res = ok({ id: 'new' }, { status: 201 })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ id: 'new' })
  })

  it('meta 옵션 포함 시 응답에 meta 노출', async () => {
    const res = ok([1, 2, 3], { meta: { total: 100, limit: 10, offset: 20 } })
    const body = await res.json()
    expect(body).toEqual({
      success: true,
      data: [1, 2, 3],
      meta: { total: 100, limit: 10, offset: 20 },
    })
  })

  it('meta 미지정 시 응답에 meta 키 없음', async () => {
    const res = ok({ x: 1 })
    const body = await res.json()
    expect(body.meta).toBeUndefined()
  })

  it('null 데이터도 임베드', async () => {
    const res = ok(null)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: null })
  })
})

describe('fail — 실패 응답', () => {
  it('error 메시지 + success: false + status 400', async () => {
    const res = fail('잘못된 요청')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: '잘못된 요청' })
  })

  it('status 옵션으로 404', async () => {
    const res = fail('Not Found', 404)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Not Found')
  })

  it('status 500 (서버 오류)', async () => {
    const res = fail('서버 오류', 500)
    expect(res.status).toBe(500)
  })
})

describe('noContent — 본문 없는 응답', () => {
  it('기본 status 204 + 빈 body', async () => {
    const res = noContent()
    expect(res.status).toBe(204)
    const text = await res.text()
    expect(text).toBe('')
  })

  it('205 / 304 status 허용', () => {
    expect(noContent(205).status).toBe(205)
    expect(noContent(304).status).toBe(304)
  })

  it('body 허용 status 는 throw', () => {
    expect(() => noContent(200)).toThrow(/no-body status/)
    expect(() => noContent(400)).toThrow(/no-body status/)
  })
})

describe('ok — no-body status 자동 분기', () => {
  it('status 204 시 NextResponse.json TypeError 회피 (data 무시)', async () => {
    const res = ok({ should: 'be-ignored' }, { status: 204 })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('status 304 도 자동 분기', async () => {
    const res = ok(null, { status: 304 })
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })

  it('no-body status 시 meta 도 운반 불가 (silent drop, 의도된 동작)', async () => {
    // RFC 9110: 204/205/304 는 body 자체가 없으므로 meta 도 표현 불가.
    // 호출자가 실수로 전달해도 status 가 우선 — body 없이 통과.
    const res = ok([1, 2, 3], { status: 204, meta: { total: 100, limit: 10, offset: 0 } })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })
})

describe('paginated — 페이지네이션 응답', () => {
  it('data + meta + status 200', async () => {
    const res = paginated([{ a: 1 }, { a: 2 }], 50, 10, 0)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      success: true,
      data: [{ a: 1 }, { a: 2 }],
      meta: { total: 50, limit: 10, offset: 0 },
    })
  })

  it('빈 데이터도 통과 (total=0)', async () => {
    const res = paginated([], 0, 10, 0)
    const body = await res.json()
    expect(body.data).toEqual([])
    expect(body.meta).toEqual({ total: 0, limit: 10, offset: 0 })
  })

  it('status 옵션으로 201 (드물지만 가능)', async () => {
    const res = paginated([], 0, 10, 0, 201)
    expect(res.status).toBe(201)
  })
})
