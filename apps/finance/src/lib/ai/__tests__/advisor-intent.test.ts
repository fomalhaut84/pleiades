import { describe, expect, it } from 'vitest'
import { pickModel } from '../claude-advisor'

describe('pickModel (Phase 35-A / #433)', () => {
  it('명시 model 이 있으면 intent 무시하고 그대로', () => {
    expect(pickModel('sonnet', 'parse')).toBe('sonnet')
    expect(pickModel('haiku', 'conversation')).toBe('haiku')
    expect(pickModel('sonnet', undefined)).toBe('sonnet')
  })

  it('conversation → sonnet (사용자 자유 질문)', () => {
    expect(pickModel(undefined, 'conversation')).toBe('sonnet')
  })

  it('parse → haiku (구조 JSON 파싱)', () => {
    expect(pickModel(undefined, 'parse')).toBe('haiku')
  })

  it('guide → haiku (짧은 1~2줄 가이드)', () => {
    expect(pickModel(undefined, 'guide')).toBe('haiku')
  })

  it('intent 도 없으면 haiku (하위호환)', () => {
    expect(pickModel(undefined, undefined)).toBe('haiku')
  })
})
