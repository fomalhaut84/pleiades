/**
 * Phase 40-A (#468) — advisor-monitor unit tests.
 *
 * 커버:
 *  - 임계 미달 실패 → alert 발송 안 함
 *  - 임계 도달 첫 시점 → alert 1회
 *  - repeat interval 내 재발동 → 억제
 *  - interval 경과 후 재발송 → 새 alert
 *  - 성공 → 카운트 리셋, alert 상태 리셋
 *  - 임계 이상 실패 후 성공 → 복구 알림
 *  - 임계 미달 실패 후 성공 → 복구 알림 없음 (조용)
 *  - sendAlert 실패 → lastAlertAt 미갱신 (다음 tick 재시도)
 *  - notifyRecovery=false → 복구 알림 발송 안 함
 *  - buildFailureAlert / buildRecoveryAlert — pure 계약
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createAdvisorMonitor,
  buildFailureAlert,
  buildRecoveryAlert,
  FAIL_THRESHOLD,
  REPEAT_INTERVAL_MS,
  type AdvisorFailureRecord,
} from '../advisor-monitor'
import { AdvisorError } from '../claude-advisor'

function makeError(msg = 'Claude CLI 종료 코드: 1', detail?: string): AdvisorError {
  return new AdvisorError(msg, detail)
}

describe('createAdvisorMonitor — 실패 카운트 + alert', () => {
  it('임계 미달 실패는 alert 발송 안 함', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD - 1; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    expect(sender).not.toHaveBeenCalled()
    expect(m.getState('briefing').consecutiveFailures).toBe(FAIL_THRESHOLD - 1)
  })

  it('임계 도달 시 alert 1회 발송', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledWith(expect.stringContaining('AI 어드바이저 실패 지속'))
  })

  it('REPEAT_INTERVAL_MS 이내 추가 실패는 alert 억제', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    // 한 번 발송 후 interval 이내 추가 실패
    await m.recordFailure(makeError(), 'briefing', 1000 + FAIL_THRESHOLD)
    await m.recordFailure(makeError(), 'briefing', 1000 + FAIL_THRESHOLD + 1)
    expect(sender).toHaveBeenCalledTimes(1)  // 재발송 없음
  })

  it('REPEAT_INTERVAL_MS 경과 후 재실패 → 새 alert', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    // 최초 alert 발동 — 3번째 실패 시각 = 1002. lastAlertAt = 1002.
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    expect(sender).toHaveBeenCalledTimes(1)
    // lastAlertAt (=1002) + interval 이 지난 시점. `now - lastAlertAt >= interval` 조건 통과.
    await m.recordFailure(makeError(), 'briefing', 1002 + REPEAT_INTERVAL_MS)
    expect(sender).toHaveBeenCalledTimes(2)
  })

  it('성공 → consecutiveFailures 리셋 + lastAlertAt 리셋', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    expect(m.getState('briefing').consecutiveFailures).toBe(FAIL_THRESHOLD)

    await m.recordSuccess(2000, 'briefing')
    expect(m.getState('briefing').consecutiveFailures).toBe(0)
    expect(m.getState('briefing').lastAlertAt).toBeNull()
    expect(m.getState('briefing').lastError).toBeNull()
  })

  it('임계 이상 실패 후 성공 → 복구 알림 발송', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    // 1st call: failure alert. 2nd: recovery.
    sender.mockClear()
    await m.recordSuccess(2000, 'briefing')
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledWith(expect.stringContaining('복구됨'))
  })

  it('임계 미달 실패 후 성공 → 복구 알림 없음 (조용)', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    await m.recordFailure(makeError(), 'briefing', 1000)
    await m.recordSuccess(2000, 'briefing')
    expect(sender).not.toHaveBeenCalled()
  })

  it('notifyRecovery=false → 복구 알림 발송 안 함', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender, { notifyRecovery: false })
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    sender.mockClear()
    await m.recordSuccess(2000, 'briefing')
    expect(sender).not.toHaveBeenCalled()
  })

  it('sendAlert 예외 → lastAlertAt 원복 → 다음 실패에서 재시도 (self-review P1)', async () => {
    const sender = vi.fn().mockRejectedValueOnce(new Error('네트워크')).mockResolvedValue(true)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    // 첫 발송 예외 → lastAlertAt 원복 (여전히 null)
    expect(m.getState('briefing').lastAlertAt).toBeNull()
    // 다음 실패에서 (interval 로직 우회) 재시도
    await m.recordFailure(makeError(), 'briefing', 1000 + FAIL_THRESHOLD)
    expect(sender).toHaveBeenCalledTimes(2)
    expect(m.getState('briefing').lastAlertAt).not.toBeNull()
    errSpy.mockRestore()
  })

  // Self-review P1 회귀 방지 — sender false 리턴 (web 프로세스 getBot 실패,
  // TELEGRAM_ALLOWED_CHAT_IDS 미설정, 모든 chat 발송 실패 등) 은 미발송으로 취급.
  // 이전 코드는 boolean 무시하고 lastAlertAt 세팅 → 30분 억제 + 관리자 알림 0건.
  it('sender false 리턴 → lastAlertAt 원복 → 다음 실패에서 재시도', async () => {
    const sender = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    // 첫 발송 false → lastAlertAt 원복 (null 유지)
    expect(m.getState('briefing').lastAlertAt).toBeNull()
    // 다음 실패에서 재시도 → 이번엔 true
    await m.recordFailure(makeError(), 'briefing', 1000 + FAIL_THRESHOLD)
    expect(sender).toHaveBeenCalledTimes(2)
    expect(m.getState('briefing').lastAlertAt).toBe(1000 + FAIL_THRESHOLD)
  })

  // Self-review P1 회귀 방지 — 동시 recordFailure race 시 두 번째 호출이 첫 번째의
  // `await sendAlert` 중에 shouldSend=true 판정하는 window 를 좁힘.
  // lastAlertAt 을 낙관적으로 세팅 → 두 번째 호출은 shouldSend=false.
  it('동시 recordFailure race → 중복 alert 없이 1회만 발송', async () => {
    // sender 를 지연 (await 로 microtask 흐름 시뮬레이션)
    let resolveFirst!: () => void
    const sender = vi.fn().mockImplementation(async () => {
      await new Promise<void>((r) => { resolveFirst = r })
      return true
    })
    const m = createAdvisorMonitor(sender)
    // 3회 실패 미리 쌓기 (아직 alert 발동 전 상태 세팅)
    for (let i = 0; i < FAIL_THRESHOLD - 1; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    // 3번째 = 첫 alert trigger. await 하지 않고 in-flight 유지.
    const p1 = m.recordFailure(makeError(), 'briefing', 1002)
    // 즉시 4번째 실패 유입 (concurrent) — lastAlertAt 이 이미 세팅됐으니 shouldSend=false
    await m.recordFailure(makeError(), 'briefing', 1003)
    // 이제 첫 발송 resolve
    resolveFirst()
    await p1
    // sender 1회만 호출 (중복 없음)
    expect(sender).toHaveBeenCalledTimes(1)
  })

  it('failThreshold override', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender, { failThreshold: 5 })
    for (let i = 0; i < 4; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    expect(sender).not.toHaveBeenCalled()
    await m.recordFailure(makeError(), 'briefing', 1004)
    expect(sender).toHaveBeenCalledTimes(1)
  })

  it('reset() → 모든 상태 초기화', async () => {
    const sender = vi.fn(async () => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'briefing', 1000 + i)
    }
    m.reset()
    const s = m.getState('briefing')
    expect(s.consecutiveFailures).toBe(0)
    expect(s.lastFailureAt).toBeNull()
    expect(s.lastAlertAt).toBeNull()
    expect(s.lastError).toBeNull()
  })
})

describe('buildFailureAlert', () => {
  it('실패 회수 · 에러 메시지 · 진단 후보 포함', () => {
    const s = {
      consecutiveFailures: 3,
      lastFailureAt: 1000,
      lastAlertAt: null,
      lastError: { message: 'Claude CLI 종료 코드: 1' },
    }
    const alert = buildFailureAlert(s, 'briefing')
    expect(alert).toContain('실패 지속 (3회)')
    expect(alert).toContain('briefing')
    expect(alert).toContain('Claude CLI 종료 코드: 1')
    expect(alert).toContain('진단 후보')
    // <code>claude</code> 태그가 사이에 들어가 붙은 substring 매치 불가 → 분리 매치.
    expect(alert).toContain('대화형 재실행')
    expect(alert).toContain('MCP 서버 다운')
  })

  it('caller 없음 → caller 라인 생략', () => {
    const s = {
      consecutiveFailures: 3, lastFailureAt: 1000, lastAlertAt: null,
      lastError: { message: 'x' },
    }
    const alert = buildFailureAlert(s)
    expect(alert).not.toContain('caller:')
  })

  it('detail 있으면 <code> 블록 삽입 + HTML metacharacter escape', () => {
    const s = {
      consecutiveFailures: 3, lastFailureAt: 1000, lastAlertAt: null,
      lastError: { message: 'x', detail: 'Error <script> & "quote"' },
    }
    const alert = buildFailureAlert(s)
    expect(alert).toContain('<code>')
    expect(alert).toContain('&lt;script&gt;')
    expect(alert).toContain('&amp;')
  })

  it('긴 detail 은 뒤에서 300 자로 truncate (Codex #473 P2 — stderr tail 유지)', () => {
    // stderr 는 대개 마지막 라인이 actionable 한 에러라 뒤쪽을 잘라내면 안됨.
    // AdvisorError.detail = stderr.slice(-1024) 로 이미 tail. alert 도 slice(-300) 유지.
    const prefix = 'a'.repeat(200)  // 오래된 output
    const tail = 'FINAL_ERROR_XYZ'
    const long = prefix + 'b'.repeat(200) + tail
    const s = {
      consecutiveFailures: 3, lastFailureAt: 1000, lastAlertAt: null,
      lastError: { message: 'y', detail: long },
    }
    const alert = buildFailureAlert(s)
    // 뒤 300자 유지 → tail (actionable) 포함
    expect(alert).toContain(tail)
    // 앞 부분 (200자 a) 은 잘림
    expect(alert).not.toContain(prefix)
  })
})

describe('buildRecoveryAlert', () => {
  it('직전 실패 회수 표시', () => {
    const alert = buildRecoveryAlert(5)
    expect(alert).toContain('복구됨')
    expect(alert).toContain('5회')
  })
})

// 회귀: pleiades#269 — 전역 카운트 하나면 다른 호출의 성공이 카운트를 리셋해
// TA 가이드 반복 실패가 가려졌다(10-21~23 실패 6회 · 알림 1회). 예산 초과는 첫 실패에 알린다.
describe('createAdvisorMonitor — caller 별 · 예산 초과 즉시 · 기록 (pleiades#269)', () => {
  const budgetError = () =>
    new AdvisorError('Claude CLI 종료 코드: 1 (subtype=error_max_budget_usd cost=$0.1020)', undefined, 'quota_exceeded')

  it('다른 caller 의 성공이 이 caller 의 연속 실패를 지우지 않는다', async () => {
    const sender = vi.fn(async (_message: string) => true)
    const m = createAdvisorMonitor(sender)
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      await m.recordFailure(makeError(), 'cron:ta_signal', 1000 + i * 10)
      await m.recordSuccess(1005 + i * 10, 'ai:chat')
    }
    expect(m.getState('cron:ta_signal').consecutiveFailures).toBe(FAIL_THRESHOLD)
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0][0]).toContain('cron:ta_signal')
  })

  it('예산 초과(quota_exceeded)는 첫 실패에 알린다 — 제목·진단도 예산부터', async () => {
    const sender = vi.fn(async (_message: string) => true)
    const m = createAdvisorMonitor(sender)
    await m.recordFailure(budgetError(), 'cron:ta_signal', 1000)
    expect(sender).toHaveBeenCalledTimes(1)
    const alert = sender.mock.calls[0][0] as string
    expect(alert).toContain('예산·사용량 초과 (1회)')
    expect(alert).toContain('maxBudgetUsd')
    expect(alert).toContain('cost=$0.1020')
  })

  it('예산 초과도 repeat interval 안에서는 다시 알리지 않는다', async () => {
    const sender = vi.fn(async (_message: string) => true)
    const m = createAdvisorMonitor(sender)
    await m.recordFailure(budgetError(), 'cron:ta_signal', 1000)
    await m.recordFailure(budgetError(), 'cron:ta_signal', 2000)
    expect(sender).toHaveBeenCalledTimes(1)
  })

  it('즉시 알림 뒤 성공하면 1회 실패여도 복구 알림을 보낸다', async () => {
    const sender = vi.fn(async (_message: string) => true)
    const m = createAdvisorMonitor(sender)
    await m.recordFailure(budgetError(), 'cron:ta_signal', 1000)
    await m.recordSuccess(2000, 'cron:ta_signal')
    expect(sender).toHaveBeenCalledTimes(2)
    expect(sender.mock.calls[1][0]).toContain('복구됨')
    expect(sender.mock.calls[1][0]).toContain('cron:ta_signal')
  })

  it('실패마다 기록한다 — 알림 여부·연속 횟수·코드 포함, detail 은 넣지 않는다', async () => {
    const records: AdvisorFailureRecord[] = []
    const m = createAdvisorMonitor(vi.fn(async () => true), {
      recordHistory: async (r) => { records.push(r) },
    })
    await m.recordFailure(makeError('x', 'secret stderr'), 'briefing', 1000)
    await m.recordFailure(budgetError(), 'cron:ta_signal', 1001)
    expect(records).toEqual([
      { caller: 'briefing', code: 'unknown', message: 'x', consecutiveFailures: 1, alerted: false, at: 1000 },
      expect.objectContaining({ caller: 'cron:ta_signal', code: 'quota_exceeded', consecutiveFailures: 1, alerted: true }),
    ])
    expect(JSON.stringify(records)).not.toContain('secret stderr')
  })

  it('기록 sink 가 실패해도 알림 흐름은 계속된다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sender = vi.fn(async (_message: string) => true)
    const m = createAdvisorMonitor(sender, { recordHistory: async () => { throw new Error('db down') } })
    await expect(m.recordFailure(budgetError(), 'cron:ta_signal', 1000)).resolves.toBeUndefined()
    expect(sender).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('알림 진단 힌트는 pleiades pm2 이름을 쓴다', () => {
    const alert = buildFailureAlert(
      { consecutiveFailures: 3, lastFailureAt: 1, lastAlertAt: null, lastError: { message: 'x' } },
      'briefing',
    )
    expect(alert).toContain('pleiades-fin-mcp')
    expect(alert).toContain('pleiades-fin-bot')
    expect(alert).not.toContain('myfinance-')
  })
})

