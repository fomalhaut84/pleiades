// pleiades#419 회귀(9-1 major): 보안 기본값이 실제 CLI 명령까지 이어지는가. `claude` 는 띄우지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawned = vi.hoisted(() => ({ commands: [] as string[] }))

vi.mock('child_process', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  return {
    spawn: (_shell: string, args: string[]) => {
      spawned.commands.push(args[1])
      const child = Object.assign(new Emitter(), { stdout: new Emitter(), stderr: new Emitter(), kill: () => true })
      void Promise.resolve().then(() => {
        const result = { type: 'result', is_error: false, result: '답', session_id: 's', total_cost_usd: 0.001, num_turns: 1 }
        child.stdout.emit('data', Buffer.from(`${JSON.stringify(result)}\n`))
        child.emit('close', 0)
      })
      return child
    },
  }
})

vi.mock('../advisor-monitor', () => ({
  getGlobalAdvisorMonitor: () => ({
    recordSuccess: async () => undefined,
    recordFailure: async () => undefined,
  }),
}))

import { READ_ONLY_PROMPT_NOTICE } from '../advisor-tools'
import { askAdvisor, RETRY_BACKOFF_MS } from '../claude-advisor'

const WRITE = 'mcp__myfinance__create_transaction'

function allowedTools(cmd: string): string {
  const m = /'--allowedTools' '([^']*)'/.exec(cmd)
  if (m === null) throw new Error('--allowedTools 없음')
  return m[1]
}

describe('askAdvisor 가 만드는 CLI 명령', () => {
  beforeEach(() => {
    spawned.commands.length = 0
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // 회귀: #635 — 서버 user settings 의 플러그인 hook 이 운영 호출마다 돌았다(맥락 주입 · 세션 요약 파일)
  it('--setting-sources project 로 user settings·플러그인을 읽지 않는다', async () => {
    await askAdvisor('질문')
    const [cmd] = spawned.commands
    expect(cmd).toMatch(/ --setting-sources '?project'?( |$)/)
  })

  it('옵션이 없으면 쓰기를 빼고 명시 금지하며 읽기 전용임을 알린다', async () => {
    await askAdvisor('질문')
    const [cmd] = spawned.commands
    expect(allowedTools(cmd)).not.toContain(WRITE)
    expect(allowedTools(cmd)).toContain('mcp__myfinance__get_portfolio')
    expect(cmd).toMatch(new RegExp(`'--disallowedTools' '[^']*${WRITE}`))
    expect(cmd).toContain(READ_ONLY_PROMPT_NOTICE.trim().split('\n')[0])
  })

  it('allowWriteTools 는 쓰기를 허용하고 금지 인자와 읽기 전용 안내를 넣지 않는다', async () => {
    await askAdvisor('질문', { allowWriteTools: true })
    const [cmd] = spawned.commands
    expect(allowedTools(cmd)).toContain(WRITE)
    expect(cmd).not.toContain('--disallowedTools')
    expect(cmd).not.toContain(READ_ONLY_PROMPT_NOTICE.trim().split('\n')[0])
  })

  it('--resume 대화에도 쓰기 허용이 붙는다', async () => {
    await askAdvisor('질문', { allowWriteTools: true, sessionId: 'abc' })
    const [cmd] = spawned.commands
    expect(cmd).toContain('--resume')
    expect(allowedTools(cmd)).toContain(WRITE)
  })

  it.each([
    ['기본', false],
    ['쓰기 허용', true],
  ])('재시도에서도 옵션이 유지된다 — %s', async (_name, allowWriteTools) => {
    vi.useFakeTimers()
    const pending = askAdvisor('질문', { allowWriteTools, expectsTools: true, retryOnNoToolUsed: 1 }).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS + 1)
    await pending
    expect(spawned.commands).toHaveLength(2)
    for (const cmd of spawned.commands) {
      expect(allowedTools(cmd).includes(WRITE)).toBe(allowWriteTools)
    }
  })
})
