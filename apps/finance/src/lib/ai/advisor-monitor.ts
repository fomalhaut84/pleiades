/**
 * Phase 40-A (#468) — AI 어드바이저 실패 감지 + 관리자 alert.
 *
 * `askAdvisor` 가 연속으로 실패하면 관리자 텔레그램 chat 에 alert 발송.
 * 지금까지는 사용자가 브리핑 fallback 안내를 받아야만 관리자가 발견 → detect/
 * recover 사이클 단축을 위해 백그라운드 감시 도입.
 *
 * **트리거:** caller 별 연속 실패 count ≥ FAIL_THRESHOLD (기본 3) · 예산 초과는 첫 실패에 (pleiades#269)
 * **재발송 억제:** 마지막 alert 후 REPEAT_INTERVAL_MS (기본 30분) 이내 재발송 안 함
 * **Recovery:** 다음 성공 시 count 리셋 + (선택) 복구 알림
 *
 * **caller 별 (pleiades#269):** 전역 카운트 하나면 다른 호출의 성공이 카운트를 리셋해
 * 한 경로의 반복 실패가 가려진다 (TA 가이드 10-21~23 실패 6회 · 알림 1회).
 * **기록 (pleiades#269):** 실패마다 `recordHistory` sink 로 남긴다 — 웹 [알림 이력] 에서 본다.
 *
 * **상태 저장:** in-memory Map — 봇 프로세스 lifetime 동안 유지. 재시작 시 리셋
 * 허용 (재시작 자체가 관리자 개입이라 리셋 OK).
 */

import { recipients, Route } from '@/bot/notifications/notifier'

/** Advisor 계층에서 던지는 실패 계열 — AdvisorError · AdvisorTimeoutError 등 공통 계약. */
export interface AdvisorFailure extends Error {
  detail?: string
  /** AdvisorError.code — 예산 초과(`quota_exceeded`)는 첫 실패에 알린다 */
  code?: string
}

/** caller 를 넘기지 않은 호출의 상태 키 */
export const UNKNOWN_CALLER = 'unknown'

/**
 * pleiades#269 — 재시도해도 결과가 같은 실패. 임계 3회를 기다리지 않고 첫 실패에 알린다.
 * `quota_exceeded` = CLI 예산 한도(`error_max_budget_usd`) · 총 예산 cap · 플랜 사용량 한도.
 */
export const IMMEDIATE_ALERT_CODES: ReadonlySet<string> = new Set(['quota_exceeded'])

/** 연속 실패 몇 회 이상에서 alert 발송할지. */
export const FAIL_THRESHOLD = 3

/** 지속 실패 시 alert 재발송 간격 (스팸 방지). */
export const REPEAT_INTERVAL_MS = 30 * 60 * 1000

/**
 * Alert 발송 sink (테스트 주입 가능).
 * 반환은 발송 성공 여부 — 실패해도 monitor 상태는 진행 (재시도는 다음 tick).
 */
export type AlertSender = (message: string) => Promise<boolean>

/** pleiades#269 — 실패 1건의 기록 (웹 알림 이력용). stderr detail 은 담지 않는다 */
export interface AdvisorFailureRecord {
  caller: string
  code: string
  message: string
  consecutiveFailures: number
  /** 이 실패로 관리자 알림이 실제로 나갔는지 */
  alerted: boolean
  at: number
}

/** 기록 sink. 실패해도 monitor 흐름은 계속된다 */
export type FailureRecorder = (record: AdvisorFailureRecord) => Promise<void>

export interface AdvisorMonitorState {
  consecutiveFailures: number
  lastFailureAt: number | null
  lastAlertAt: number | null
  lastError: { message: string; detail?: string; caller?: string; code?: string } | null
}

export interface AdvisorMonitor {
  recordFailure(err: AdvisorFailure, caller?: string, now?: number): Promise<void>
  /** 그 caller 의 연속 실패만 리셋한다 (pleiades#269) */
  recordSuccess(now?: number, caller?: string): Promise<void>
  /** 그 caller 의 상태 (기록이 없으면 빈 상태) */
  getState(caller?: string): Readonly<AdvisorMonitorState>
  reset(): void
}

/**
 * Alert 본문 구성 — 실패 회수 · 마지막 에러 요약 · 진단 명령 힌트.
 * pure 함수라 테스트 assertion 편함.
 */
export function buildFailureAlert(state: AdvisorMonitorState, caller?: string): string {
  const count = state.consecutiveFailures
  const err = state.lastError
  const callerLine = caller ? `caller: ${caller}\n` : ''
  const errMsg = err?.message ?? '(unknown)'
  // Codex #473 P2: AdvisorError.detail 은 `stderr.slice(-1024)` (claude-advisor.ts) 라
  // 이미 stderr **끝** 1KB. slice(0, 300) 로 앞을 자르면 오래된 output 만 남고 정말
  // actionable 한 마지막 에러 라인 (예: `Error: session expired`) 이 잘림.
  // 뒤 300자 (`slice(-300)`) 로 tail 을 유지.
  const detail = err?.detail ? `\n<code>${escapeForTelegram(err.detail.slice(-300))}</code>` : ''
  const budget = err?.code !== undefined && IMMEDIATE_ALERT_CODES.has(err.code)
  // pleiades#269: 예산 초과는 재시도로 풀리지 않는다 — 첫 실패에 오고, 진단도 한도부터
  const title = budget
    ? `💸 <b>AI 어드바이저 예산·사용량 초과 (${count}회)</b>`
    : `🚨 <b>AI 어드바이저 실패 지속 (${count}회)</b>`
  const budgetHint = budget
    ? `0. 호출 예산 한도 초과 → 메시지의 <code>cost=</code> 와 호출부 <code>maxBudgetUsd</code> 비교 · 플랜 사용량 한도면 대기\n`
    : ''
  // pleiades#269: pm2 이름은 pleiades 전환 뒤 이름 (deploy/pleiades.config.cjs)
  return (
    `${title}\n\n` +
    callerLine +
    `<b>마지막 에러:</b> ${escapeForTelegram(errMsg)}${detail}\n\n` +
    `<b>진단 후보 (우선순위):</b>\n` +
    budgetHint +
    `1. <code>claude</code> CLI 인증 만료 → 서버 shell 에서 <code>claude</code> 대화형 재실행\n` +
    `2. MCP 서버 다운 → <code>pm2 status | grep pleiades-fin-mcp</code>\n` +
    `3. 봇 로그 상세 → <code>pm2 logs pleiades-fin-bot --err --lines 100</code>\n` +
    `4. 웹 [알림 이력] → 유형 "AI 실패"`
  )
}

export function buildRecoveryAlert(previousFailures: number, caller?: string): string {
  const callerLine = caller ? `caller: ${caller}\n` : ''
  return (
    `✅ <b>AI 어드바이저 복구됨</b>\n\n` +
    callerLine +
    `직전 연속 실패 ${previousFailures}회 후 정상 응답 확인.`
  )
}

/** 텔레그램 HTML parse 방어 (`<`, `>`, `&`). */
function escapeForTelegram(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Monitor factory — dependency 를 명시 주입해 테스트 격리.
 *
 * @param sendAlert 관리자 chat 에 alert 발송하는 함수 (production: @pleiades/notify Route.ADMIN)
 * @param options.failThreshold  기본 3
 * @param options.repeatIntervalMs 기본 30분
 * @param options.notifyRecovery  기본 true — 실패 후 첫 성공 시 복구 알림 발송
 */
export function createAdvisorMonitor(
  sendAlert: AlertSender,
  options: {
    failThreshold?: number
    repeatIntervalMs?: number
    notifyRecovery?: boolean
    /** pleiades#269 — 실패 기록 sink (production: AlertHistory). 기본 없음 */
    recordHistory?: FailureRecorder
  } = {},
): AdvisorMonitor {
  const threshold = options.failThreshold ?? FAIL_THRESHOLD
  const interval = options.repeatIntervalMs ?? REPEAT_INTERVAL_MS
  const notifyRecovery = options.notifyRecovery ?? true
  const recordHistory = options.recordHistory

  const emptyState = (): AdvisorMonitorState => ({
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastAlertAt: null,
    lastError: null,
  })
  // pleiades#269: caller 별 상태 — 한 경로의 성공이 다른 경로의 실패 카운트를 지우지 않게
  const states = new Map<string, AdvisorMonitorState>()
  const stateFor = (key: string): AdvisorMonitorState => {
    const existing = states.get(key)
    if (existing) return existing
    const created = emptyState()
    states.set(key, created)
    return created
  }

  async function record(entry: AdvisorFailureRecord): Promise<void> {
    if (!recordHistory) return
    try {
      await recordHistory(entry)
    } catch (recordErr) {
      console.error('[advisor-monitor] 실패 기록 저장 실패:', recordErr)
    }
  }

  return {
    async recordFailure(err, caller, now = Date.now()) {
      const key = caller ?? UNKNOWN_CALLER
      const state = stateFor(key)
      state.consecutiveFailures++
      state.lastFailureAt = now
      state.lastError = {
        message: err.message,
        detail: err.detail,
        caller,
        code: err.code,
      }

      const effectiveThreshold =
        err.code !== undefined && IMMEDIATE_ALERT_CODES.has(err.code) ? 1 : threshold
      let alerted = false

      // 임계 도달 첫 시점 또는 repeat interval 경과 시 발송 (임계 미달이면 카운트만)
      const shouldSend =
        state.consecutiveFailures >= effectiveThreshold &&
        (state.lastAlertAt === null || (now - state.lastAlertAt) >= interval)
      if (shouldSend) {
        // Self-review P1: `await sendAlert` 전에 `lastAlertAt` 을 낙관적으로 세팅
        // (동시 recordFailure 경합에서 락 역할 — 두 microtask 가 동시에 shouldSend=true
        // 판정해 중복 alert 발송하는 것 방지). 실패/미발송 시 원복.
        const prevAlertAt = state.lastAlertAt
        state.lastAlertAt = now
        try {
          alerted = await sendAlert(buildFailureAlert(state, caller))
          // Self-review P1: sender 가 false 리턴 시 (예: web 프로세스 getBot 실패,
          // 관리자 수신자 미설정, 모든 chat 발송 실패) 실제 관리자에게
          // 도달 안 함 → lastAlertAt 원복해 다음 실패에서 재시도 가능하게.
          if (!alerted) {
            state.lastAlertAt = prevAlertAt
          }
        } catch (sendErr) {
          console.error('[advisor-monitor] alert 발송 실패:', sendErr)
          // sender 예외도 미발송으로 취급 → lastAlertAt 원복
          state.lastAlertAt = prevAlertAt
        }
      }

      await record({
        caller: key,
        code: err.code ?? 'unknown',
        message: err.message,
        consecutiveFailures: state.consecutiveFailures,
        alerted,
        at: now,
      })
    },

    async recordSuccess(now = Date.now(), caller) {
      const key = caller ?? UNKNOWN_CALLER
      const state = states.get(key)
      if (!state) return
      const previousFailures = state.consecutiveFailures

      // 복구 알림: 알림이 실제로 나간 실패 뒤에만 (일회성 실패는 조용히 지나감)
      if (notifyRecovery && previousFailures > 0 && state.lastAlertAt !== null) {
        try {
          await sendAlert(buildRecoveryAlert(previousFailures, caller))
        } catch (sendErr) {
          console.error('[advisor-monitor] recovery 알림 발송 실패:', sendErr)
        }
      }
      states.delete(key)
      void now // 파라미터 유지 (future timestamp 로깅용)
    },

    getState(caller) {
      return states.get(caller ?? UNKNOWN_CALLER) ?? emptyState()
    },

    reset() {
      states.clear()
    },
  }
}

// ---- Production singleton (bot process 에서만 사용, test 는 factory 직접 사용) ----

let productionMonitor: AdvisorMonitor | null = null

/**
 * Production 용 lazy singleton. bot 프로세스에서 최초 호출 시 초기화.
 * 봇 모듈에 대한 의존성을 lazy require 로 해결 → 순환 참조 방지.
 *
 * **Alert 대상 (Codex #473 P2):** `TELEGRAM_ADMIN_CHAT_IDS` (관리자 전용, 콤마 구분).
 * `TELEGRAM_ALLOWED_CHAT_IDS` (봇 사용자 화이트리스트, 가족 chat 포함) 는 alert
 * 대상으로 사용 금지 — alert 본문에 `AdvisorError.detail` (stderr tail) 이 포함되며
 * claude-advisor.ts 는 이를 "사용자 노출 불가 디버깅 정보" 로 명시. 관리자가 아닌
 * 가족 chat 에 internal 진단이 노출되면 안 됨.
 *
 * 미설정 시 alert 스킵 (console.warn) — 조용히 fallback 하지 않음 (`TELEGRAM_ALLOWED_
 * CHAT_IDS` 첫 값 재사용 같은 heuristic 은 secure default 원칙 위반).
 */
export function getGlobalAdvisorMonitor(): AdvisorMonitor {
  if (productionMonitor === null) {
    productionMonitor = createAdvisorMonitor(async (message) => {
      // pleiades#136 (003 Q25 ADMIN A): 수신자 해석은 파사드(Route.ADMIN = TELEGRAM_ADMIN_CHAT_IDS · fin 숫자 규칙).
      if (recipients.targetCount(Route.ADMIN) === 0) {
        console.warn(
          '[advisor-monitor] TELEGRAM_ADMIN_CHAT_IDS 미설정 → 관리자 alert 발송 스킵. ' +
            '이 env 는 봇 사용자 화이트리스트 (TELEGRAM_ALLOWED_CHAT_IDS) 와 분리 관리해야 함 ' +
            '(alert 본문에 stderr detail 포함, non-admin 노출 금지).',
        )
        return false
      }
      // Lazy require — advisor-monitor 는 lib/ 아래 있어 web/bot 양쪽에서 load 됨.
      // web 프로세스는 bot 인스턴스 없어서 require 자체를 지연.
      try {
        const { getBot } = await import('@/bot')
        const { notifierFor, htmlContent } = await import('@/bot/notifications/notifier')
        const delivery = await notifierFor(getBot()).notify(Route.ADMIN, htmlContent(message), {
          label: 'advisor-monitor',
        })
        return delivery.sent > 0
      } catch (err) {
        console.error('[advisor-monitor] bot 모듈 로드 실패 (web 프로세스에서 호출됨?):', err)
        return false
      }
    }, {
      // pleiades#269: 실패마다 AlertHistory(kind ai_failure)에 — 웹 [알림 이력] · web·bot 프로세스 모두.
      // lazy import — 이 모듈을 쓰는 테스트가 Prisma 를 로드하지 않게
      recordHistory: async (record) => {
        const { recordAdvisorFailureHistory } = await import('@/bot/notifications/alert-history')
        await recordAdvisorFailureHistory(record)
      },
    })
  }
  return productionMonitor
}

/** 테스트용 — production singleton 재설정 (프로세스 lifetime 유지되는 상태 초기화). */
export function resetGlobalAdvisorMonitorForTest(): void {
  productionMonitor = null
}
