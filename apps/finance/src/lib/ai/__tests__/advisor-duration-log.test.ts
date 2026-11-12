// #624: fin advisor 로그에 지연(ms)을 남긴다 — 성공 호출 지연이 서버 어디에도 없었다(#239 W1).
// 형식은 fit `[askAdvisor] … duration=<ms>ms` 와 같게 · 줄 끝에 붙여 기존 정규식(수집 스크립트)을 깨지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const plan = vi.hoisted(() => ({ exit: 0, result: { type: 'result', is_error: false, result: '답', session_id: 's', total_cost_usd: 0.0123, num_turns: 2 } as Record<string, unknown> }))

vi.mock('child_process', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  return {
    spawn: () => {
      const child = Object.assign(new Emitter(), { stdout: new Emitter(), stderr: new Emitter(), kill: () => true })
      void Promise.resolve().then(() => {
        child.stdout.emit('data', Buffer.from(`${JSON.stringify(plan.result)}\n`))
        child.emit('close', plan.exit)
      })
      return child
    },
  }
})

vi.mock('../advisor-monitor', () => ({
  getGlobalAdvisorMonitor: () => ({ recordSuccess: async () => undefined, recordFailure: async () => undefined }),
}))

import { askAdvisor } from '../claude-advisor'

const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith('[advisor]'))

describe('advisor 로그 지연 (#624)', () => {
  let log: ReturnType<typeof vi.spyOn>
  let err: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    plan.exit = 0
    plan.result = { type: 'result', is_error: false, result: '답', session_id: 's', total_cost_usd: 0.0123, num_turns: 2 }
  })
  afterEach(() => vi.restoreAllMocks())

  it('ok 줄 끝에 duration=<ms>ms · 앞부분 형식은 그대로', async () => {
    await askAdvisor('질문', { caller: 'bot:ai_chat' })
    const [ok] = lines(log)
    expect(ok).toMatch(/^\[advisor\] ok caller=bot:ai_chat model=\S+ used=\S+ cost=\$0\.0123 turns=2 tools=0 duration=\d+ms$/)
  })

  it('is_error 실패 줄에도 duration', async () => {
    plan.result = { type: 'result', is_error: true, result: 'x', subtype: 'error_during_execution', total_cost_usd: 0.001, num_turns: 1 }
    await expect(askAdvisor('질문', { caller: 'bot:ai_chat' })).rejects.toThrow()
    expect(lines(err).some((l) => /^\[advisor\] fail caller=bot:ai_chat .* duration=\d+ms$/.test(l))).toBe(true)
  })

  it('종료 코드 실패 줄에도 duration', async () => {
    plan.exit = 1
    await expect(askAdvisor('질문', { caller: 'bot:ai_chat' })).rejects.toThrow()
    expect(lines(err).some((l) => /^\[advisor\] fail caller=bot:ai_chat .*exit=1 .* duration=\d+ms$/.test(l))).toBe(true)
  })
})
