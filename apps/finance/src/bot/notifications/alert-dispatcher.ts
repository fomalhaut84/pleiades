/**
 * Phase 37-B (#445) — 알림 재발송 공용 dispatcher.
 *
 * 배포 오류 등으로 발송 실패한 AlertHistory row 를 사용자 수동 트리거로 재발송한다.
 * 원본 row 는 그대로 두고 새 row 를 append (`retriedFrom` 마커) 해 이력 소실을 방지.
 *
 * 자동 재시도 (exponential backoff) 은 스코프 밖 (스펙 §6 명시).
 */

import type { Bot } from 'grammy'
import { sendHtml, escapeHtml } from '@/bot/utils/telegram'
import { computeDeliveryStatus, recordAlertHistory, type AlertKind } from './alert-history'
import { getBot } from '../index'
import type { AlertHistoryContext } from '@/lib/alert-history/context'

/** 동일 id 재발송 최소 간격 (스팸 방지 — 스펙 5분). */
export const RETRY_COOLDOWN_MS = 5 * 60 * 1000

/**
 * 재발송 rate limit tracker. 프로세스 in-memory Map — 프로세스 재시작 시 초기화 허용
 * (DB 컬럼 없이 스팸만 방지). 스코프상 사용자 수동 트리거이므로 이 정도로 충분.
 */
export interface RetryRateLimiter {
  check(id: string, now?: number): { allowed: boolean; retryAfterMs: number }
  markAttempt(id: string, now?: number): void
  reset(): void
}

export function createRetryRateLimiter(cooldownMs: number = RETRY_COOLDOWN_MS): RetryRateLimiter {
  const lastAttempt = new Map<string, number>()
  return {
    check(id, now = Date.now()) {
      const prev = lastAttempt.get(id)
      if (prev === undefined) return { allowed: true, retryAfterMs: 0 }
      const elapsed = now - prev
      if (elapsed >= cooldownMs) return { allowed: true, retryAfterMs: 0 }
      return { allowed: false, retryAfterMs: cooldownMs - elapsed }
    },
    markAttempt(id, now = Date.now()) {
      lastAttempt.set(id, now)
    },
    reset() {
      lastAttempt.clear()
    },
  }
}

/** 프로세스 전역 rate limiter (route handler 재사용). 테스트는 인스턴스를 직접 생성. */
export const globalRetryLimiter = createRetryRateLimiter()

/**
 * HTML entity → literal char (재발송 preprocessing 전용, Codex #463 P2).
 * `escapeHtml` 의 역함수 (5개 entity: `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`).
 * `&amp;` 를 먼저 처리하면 `&amp;lt;` 같은 nested 는 `&lt;` → `<` 두 스텝이 되지만,
 * 저장 시엔 nested 가 발생하지 않으므로 순서 무관. 정규식 하나로 처리:
 */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => {
    switch (e) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case '#39': return "'"
      default: return _
    }
  })
}

/**
 * 원본 AlertHistory row 를 재발송 대상 subset 으로 좁힌 인터페이스.
 * Prisma AlertHistory 모델과 호환 (Date → firedAt 필드는 미사용이라 생략).
 */
export interface RedispatchTargetRow {
  id: string
  kind: string
  ticker: string | null
  price: number | null
  changePercent: number | null
  message: string
  contextJson: unknown
}

export interface RedispatchResult {
  successCount: number
  totalChats: number
  status: 'sent' | 'partial' | 'failed'
  lastError: string | undefined
}

/**
 * 순수 재발송 — 지정 chatIds 로 sendHtml 호출 후 성공 카운트/에러 반환.
 * DB 기록은 caller (route handler) 가 수행 — pure/impure 분리로 테스트 용이.
 */
/**
 * Codex #463 P2 (2차): 저장 시점에 escapeHtml 을 이미 적용하는 kind 화이트리스트.
 * price-alert.ts 에서 `${escapeHtml(name)}` 로 build 후 그대로 store 되는 kind 들.
 * 나머지 (custom_strategy · drop · surge · fx · ta_signal 등) 는 raw 로 store.
 */
const PRE_ESCAPED_KINDS = new Set<string>(['target_hit', 'stop_loss', 'watch_buy', 'watch_zone'])

export async function redispatchAlert(
  row: Pick<RedispatchTargetRow, 'message' | 'kind'>,
  chatIds: number[],
  bot: Bot = getBot(),
): Promise<RedispatchResult> {
  // Codex #462 · #463 P2 (2차): 저장 상태가 kind 별로 mixed —
  //   - PRE_ESCAPED_KINDS: `A &amp; B` (이미 escape 된 상태로 store)
  //   - 그 외: `SOXL < 40` (raw)
  //
  // sendHtml (parse_mode=HTML) 로 raw 를 그대로 넘기면 parser 오류. 하지만 모든
  // kind 를 decode→escape round-trip 하면 raw 케이스에서 사용자가 literal `&amp;`
  // 를 이름으로 넣었을 때 decoder 가 `&` 로 오해석 → 원본과 다른 문자 렌더.
  //
  // **Fix (kind gating):** pre-escaped kind 만 decode 후 재escape (원본 복원).
  // raw kind 는 그대로 escape (안전 처리 + 사용자 literal entity 존중).
  const isPreEscaped = PRE_ESCAPED_KINDS.has(row.kind)
  const normalized = isPreEscaped ? decodeHtmlEntities(row.message) : row.message
  const safeMessage = escapeHtml(normalized)
  let successCount = 0
  let lastError: string | undefined
  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, safeMessage)
      successCount++
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`[alert-retry] 재발송 실패 (chatId: ${chatId}, alertId: unknown):`, error)
    }
  }
  const status = computeDeliveryStatus(successCount, chatIds.length)
  return { successCount, totalChats: chatIds.length, status, lastError }
}

/**
 * 원본 context 에 `retriedFrom` 마커를 얹은 새 컨텍스트를 반환.
 * 원본이 없거나 shape 불명이면 최소 shape (`{ type: kind, retriedFrom }`) 만 생성 —
 * `isValidContext` 통과 위해 `type` 을 kind 로 세팅 (kind 는 이미 whitelist 통과 상태).
 *
 * **Root id 전파 (Codex #454 P2)**: 원본이 이미 retry row 인 경우 (contextJson.retriedFrom
 * 존재), `retriedFrom` 은 chain 을 따라가지 않고 **가장 처음 원본** 을 가리킨다. retry-of-retry
 * chain 이 있어도 모든 후속 retry 는 동일 root id 를 참조 → rate limiter 가 chain 을
 * 하나의 cooldown 그룹으로 처리 가능.
 *
 * shape 확장은 각 interface 에 `retriedFrom?` 를 추가한 것과 정합 (`context.ts`).
 */
export function buildRetryContext(
  originalContext: unknown,
  originalId: string,
  kind: AlertKind,
): AlertHistoryContext | null {
  // Root id 계산 — 원본 context 에 이미 retriedFrom 이 있으면 그 값 (chain root) 을 사용.
  const existingRoot =
    originalContext && typeof originalContext === 'object'
      ? (originalContext as { retriedFrom?: unknown }).retriedFrom
      : undefined
  const rootId = typeof existingRoot === 'string' ? existingRoot : originalId
  const marker = { retriedFrom: rootId }

  if (originalContext && typeof originalContext === 'object') {
    // 원본 shape 유지 + retriedFrom 덮어쓰기 (spread — 원본 mutate 방지, marker 가 chain root 로 override).
    return { ...(originalContext as object), ...marker } as unknown as AlertHistoryContext
  }
  // v1 (context 없는) row 재발송 시 최소 컨텍스트 — kind 를 그대로 type 으로 사용.
  // isValidContext 는 type 화이트리스트 체크만 하므로 통과.
  return { type: kind as AlertHistoryContext['type'], ...marker } as unknown as AlertHistoryContext
}

/**
 * 재발송 성공/실패 후 새 AlertHistory row 를 append.
 * `retriedFrom` 은 contextJson 안에 저장 (schema 컬럼 추가 없이 마커만 남김).
 * 실패해도 caller 는 이미 재발송 시도를 한 상태 → recordAlertHistory 내부에서 삼킴 (원본 유지).
 */
export async function persistRetryHistory(
  original: RedispatchTargetRow,
  result: RedispatchResult,
): Promise<void> {
  await recordAlertHistory(
    [
      {
        kind: original.kind as AlertKind,
        ticker: original.ticker,
        price: original.price,
        changePercent: original.changePercent,
        message: original.message,
        context: buildRetryContext(original.contextJson, original.id, original.kind as AlertKind),
      },
    ],
    result.status,
    result.totalChats,
    result.status === 'sent' ? undefined : result.lastError,
  )
}
