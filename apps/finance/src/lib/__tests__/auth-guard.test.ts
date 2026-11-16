import { describe, expect, it } from 'vitest'
import { clientKey, pinMatches } from '../auth-guard'

const h = (init: Record<string, string>) => new Headers(init)

// 회귀: #701 — 실패 횟수 제한 키를 요청자가 고를 수 없어야 한다
describe('clientKey', () => {
  it('프록시가 넣는 x-real-ip 를 먼저 쓴다', () => {
    expect(clientKey(h({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('x-forwarded-for 첫 값(요청자가 보낸 값)을 키로 쓰지 않는다 — 바꿔 보내도 같은 키', () => {
    const a = clientKey(h({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))
    const b = clientKey(h({ 'x-forwarded-for': '2.2.2.2, 203.0.113.7' }))
    expect(a).toBe('203.0.113.7')
    expect(b).toBe(a)
  })

  it('x-real-ip 가 있으면 x-forwarded-for 를 아무리 바꿔도 같은 키', () => {
    const keys = ['9.9.9.9', '8.8.8.8, 7.7.7.7', 'garbage'].map((xff) =>
      clientKey(h({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': xff })),
    )
    expect(new Set(keys)).toEqual(new Set(['203.0.113.7']))
  })

  it('x-forwarded-for 만 있으면 마지막 값(가장 가까운 프록시가 붙인 값)', () => {
    expect(clientKey(h({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7')
    expect(clientKey(h({ 'x-forwarded-for': ' a ,  b  ' }))).toBe('b')
  })

  it('빈 값 · 공백 · 헤더 없음은 unknown', () => {
    expect(clientKey(h({}))).toBe('unknown')
    expect(clientKey(h({ 'x-real-ip': '  ', 'x-forwarded-for': ' , ' }))).toBe('unknown')
  })
})

describe('pinMatches', () => {
  it('같으면 참 · 다르면 거짓', () => {
    expect(pinMatches('482915', '482915')).toBe(true)
    expect(pinMatches('482916', '482915')).toBe(false)
  })

  it('길이가 달라도 예외 없이 거짓', () => {
    expect(pinMatches('4829', '482915')).toBe(false)
    expect(pinMatches('4829150', '482915')).toBe(false)
  })

  it('입력이 문자열이 아니거나 비면 거짓', () => {
    expect(pinMatches(undefined, '482915')).toBe(false)
    expect(pinMatches(123456 as unknown, '123456')).toBe(false)
    expect(pinMatches('', '')).toBe(false)
  })

  it('한글 등 멀티바이트 입력도 예외 없이 비교', () => {
    expect(pinMatches('비밀번호', '비밀번호')).toBe(true)
    expect(pinMatches('비밀번호', '비밀번효')).toBe(false)
  })
})
