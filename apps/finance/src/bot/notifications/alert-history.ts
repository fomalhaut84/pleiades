/**
 * Phase 33-A (#416) — 알림 발동 이력 저장.
 *
 * 각 알림 스캐너 (price-alert / ta-signal-alert / custom-strategy-alert) 에서
 * 이벤트 수집 후 배치 발송 → 결과와 함께 이 헬퍼로 저장.
 * 저장 실패는 로그만 (알림 자체 흐름에 영향 X).
 */

import { prisma } from '@/lib/prisma'

export type AlertKind =
  | 'surge'
  | 'drop'
  | 'fx'
  | 'target_hit'
  | 'stop_loss'
  | 'watch_buy'
  | 'watch_zone'
  | 'ta_signal'
  | 'custom_strategy'

export type DeliveryStatus = 'sent' | 'partial' | 'failed'

export interface AlertEventInput {
  kind: AlertKind
  ticker?: string | null
  price?: number | null
  changePercent?: number | null
  message: string
}

/**
 * 배치 발송 성공 카운트로부터 deliveryStatus 산출 (pure).
 *   total=0  → failed (수신자 없는 이벤트는 실질 미발송)
 *   all      → sent
 *   none     → failed
 *   partial  → partial
 */
export function computeDeliveryStatus(successCount: number, total: number): DeliveryStatus {
  if (total <= 0) return 'failed'
  if (successCount >= total) return 'sent'
  if (successCount <= 0) return 'failed'
  return 'partial'
}

/**
 * events 를 AlertHistory 로 일괄 저장. 빈 배열이면 no-op.
 * Prisma 실패는 삼키고 로그만 — 알림 흐름 유지 우선.
 */
export async function recordAlertHistory(
  events: AlertEventInput[],
  deliveryStatus: DeliveryStatus,
  recipientCount: number,
  errorMessage?: string,
): Promise<void> {
  if (events.length === 0) return
  try {
    await prisma.alertHistory.createMany({
      data: events.map((e) => ({
        kind: e.kind,
        ticker: e.ticker ?? null,
        price: e.price ?? null,
        changePercent: e.changePercent ?? null,
        message: e.message,
        deliveryStatus,
        recipientCount,
        errorMessage: errorMessage ?? null,
      })),
    })
  } catch (error) {
    console.error('[alert-history] 저장 실패:', error)
  }
}
