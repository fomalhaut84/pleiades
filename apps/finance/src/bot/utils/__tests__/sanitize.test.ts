/**
 * 회귀: pleiades#540 — 앱 판 `sanitizeMessage`·`sanitizeError` 는 `@pleiades/notify` 판과 같아야 한다.
 * 옛 앱 판은 텔레그램 봇 토큰만 가려서, 이 파일로 import 하면 웹훅·인터랙션·Discord 봇 토큰이 조용히 남았다.
 */

import * as notify from '@pleiades/notify'
import { describe, expect, it } from 'vitest'
import { sanitizeError, sanitizeMessage } from '../error'

const WEBHOOK = 'POST https://discord.com/api/webhooks/123456/abc_DEF-9?wait=true failed'
const INTERACTION = 'POST https://discord.com/api/v10/interactions/987/aW50ZXJhY3Rpb24tdG9rZW4/callback 404'
// 실제 토큰이 아닌 모양만 맞춘 값(`<base64 id>.<ts>.<hmac>`)
const BOT_TOKEN = `auth failed for ${'M' + 'x'.repeat(23)}.${'y'.repeat(6)}.${'z'.repeat(27)}`

describe('sanitizeMessage (앱 판 = 패키지 판)', () => {
  it('패키지 함수를 그대로 쓴다', () => {
    expect(sanitizeMessage).toBe(notify.sanitizeMessage)
    expect(sanitizeError).toBe(notify.sanitizeError)
  })

  it('웹훅 토큰을 가린다', () => {
    expect(sanitizeMessage(WEBHOOK)).toBe('POST https://discord.com/api/webhooks/123456/<REDACTED>?wait=true failed')
  })

  it('인터랙션 토큰을 가린다', () => {
    expect(sanitizeMessage(INTERACTION)).toBe('POST https://discord.com/api/v10/interactions/987/<REDACTED>/callback 404')
  })

  it('Discord 봇 토큰을 가린다', () => {
    expect(sanitizeMessage(BOT_TOKEN)).toBe('auth failed for <DISCORD_TOKEN_REDACTED>')
  })

  it('옛 텔레그램 봇 토큰도 계속 가린다', () => {
    expect(sanitizeMessage('call bot123456:ABC-def_78 failed')).toBe('call bot<REDACTED> failed')
  })

  it('sanitizeError 도 cause 안의 웹훅 토큰을 가린다', () => {
    const err = new Error('send failed', { cause: new TypeError(WEBHOOK) })
    expect(sanitizeError(err)).toBe(
      'Error: send failed | TypeError: POST https://discord.com/api/webhooks/123456/<REDACTED>?wait=true failed',
    )
  })
})
