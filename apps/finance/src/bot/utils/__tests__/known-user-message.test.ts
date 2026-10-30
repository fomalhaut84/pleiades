/**
 * pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3) — `knownUserMessage`: 알려진 사용자용 안내만 통과 · `원문:` 줄 제거.
 */

import { describe, expect, it } from 'vitest'
import { knownUserMessage } from '../error'

const PREFIXES = ['데이터 부족:', 'AI 파싱 응답'] as const

describe('knownUserMessage', () => {
  it('알려진 접두면 그대로', () => {
    expect(knownUserMessage(new Error('데이터 부족: NVDA (12일)'), PREFIXES)).toBe('데이터 부족: NVDA (12일)')
  })

  it('원문: 줄은 뗀다', () => {
    const err = new Error('AI 파싱 응답에 JSON 오브젝트가 없습니다. 표현을 바꿔서 재시도해주세요.\n원문: {"secret": 1')
    expect(knownUserMessage(err, PREFIXES)).toBe('AI 파싱 응답에 JSON 오브젝트가 없습니다. 표현을 바꿔서 재시도해주세요.')
  })

  it('모르는 메시지 · Error 아님 → null', () => {
    expect(knownUserMessage(new Error('connect ECONNREFUSED 127.0.0.1:5432'), PREFIXES)).toBeNull()
    expect(knownUserMessage('데이터 부족: x', PREFIXES)).toBeNull()
    expect(knownUserMessage(undefined, PREFIXES)).toBeNull()
  })

  it('접두는 시작에서만 본다', () => {
    expect(knownUserMessage(new Error('오류 — 데이터 부족: x'), PREFIXES)).toBeNull()
  })
})

describe('knownUserMessage — 여러 줄 원문 (9-1 리뷰 major)', () => {
  it('원문: 뒤 여러 줄을 모두 뗀다', () => {
    const err = new Error('AI 파싱 응답이 JSON 이 아닙니다. 재시도 하거나 표현을 바꿔주세요.\n원문: {\n  "ticker": "SECRET",\n  "x": 1\n}')
    expect(knownUserMessage(err, PREFIXES)).toBe('AI 파싱 응답이 JSON 이 아닙니다. 재시도 하거나 표현을 바꿔주세요.')
  })
})
