/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 S · B): 상태 키 형식 · 본인 확인 경계 · 응답 생성기.
 * 옛 채널 어댑터 케이스는 009 D-5 B3b(pleiades#508)에서 어댑터와 함께 지웠다 — Discord 짝은 `discord/__tests__/reply.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import { htmlReply, isSameRequester, plainReply } from '../reply'
import { discordMessageKey, discordStateKey, pendingKey } from '../state-key'

describe('상태 키 · 메시지 키', () => {
  it('형식 — 플랫폼 접두', () => {
    expect(discordStateKey('2002', '9')).toBe('discord:2002:9')
    expect(discordMessageKey('100', '5')).toBe('discord:100:5')
    expect(pendingKey(discordMessageKey('100', '5'), 'tx1')).toBe('discord:100:5:tx1')
  })

  it('채널·사용자가 다르면 키가 다르다', () => {
    expect(pendingKey(discordMessageKey('100', '5'), 'a')).not.toBe(pendingKey(discordMessageKey('101', '5'), 'a'))
    expect(discordStateKey('7', '7')).not.toBe(discordStateKey('7', '8'))
  })
})

describe('본인 확인 — 누른 사람 ID 가 없으면 거부(T17)', () => {
  it.each([
    [undefined, '0', false],
    [undefined, '7', false],
    ['7', '7', true],
    ['8', '7', false],
    ['0', '0', true],
  ] as const)('clicker %s · requester %s → %s', (clicker, requester, ok) => {
    expect(isSameRequester(clicker, requester)).toBe(ok)
  })
})

describe('응답 생성기', () => {
  it('버튼 없으면 buttons 키가 없다', () => {
    expect(plainReply('a')).toEqual({ text: 'a', format: 'plain' })
    expect('buttons' in plainReply('a')).toBe(false)
    expect(htmlReply('b', [[{ label: 'x', action: 'y' }]])).toEqual({
      text: 'b',
      format: 'html',
      buttons: [[{ label: 'x', action: 'y' }]],
    })
  })
})
