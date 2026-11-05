import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { LOG_REDACT_PATHS } from '../logger'

// 회귀: 009 D-5 A2 — 최상위 Discord 토큰·웹훅이 MCP 로그에 그대로 남지 않는다
describe('LOG_REDACT_PATHS', () => {
  const render = (fields: Record<string, unknown>): string => {
    let out = ''
    const log = pino(
      { redact: { paths: [...LOG_REDACT_PATHS], censor: '[REDACTED]' } },
      { write: (line: string) => { out += line } },
    )
    log.info(fields, 'm')
    return out
  }

  it.each([
    'DISCORD_BOT_TOKEN_FINANCE',
    'DISCORD_BOT_TOKEN_FITNESS',
    'OPENDART_API_KEY',
    'DISCORD_WEBHOOK_FINANCE',
    'DISCORD_WEBHOOK_FITNESS',
    'DISCORD_WEBHOOK_ADMIN',
    'DISCORD_WEBHOOK_DEPLOY',
  ])('%s 값을 가린다', (key) => {
    const line = render({ [key]: 'SECRET-VALUE' })
    expect(line).not.toContain('SECRET-VALUE')
    expect(line).toContain('[REDACTED]')
  })

  it('다른 필드는 그대로 둔다', () => {
    expect(render({ ticker: 'AAPL' })).toContain('AAPL')
  })
})
