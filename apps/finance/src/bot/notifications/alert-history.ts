/**
 * Phase 33-A (#416) — 알림 발동 이력 저장.
 *
 * 각 알림 스캐너 (price-alert / ta-signal-alert / custom-strategy-alert) 에서
 * 이벤트 수집 후 배치 발송 → 결과와 함께 이 헬퍼로 저장.
 * 저장 실패는 로그만 (알림 자체 흐름에 영향 X).
 */

import { prisma } from '@/lib/prisma'
import { isValidContext, type AlertHistoryContext } from '@/lib/alert-history/context'
// Prisma 는 런타임 값 (`Prisma.JsonNull`) 을 사용하므로 `import type` 금지.
import { Prisma } from '@prisma/client'

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
  /**
   * Phase 37-A (#444) — kind 별 최소 스냅샷.
   * hook 이 이미 확보한 데이터만 채운다 (추가 fetch 금지).
   * shape 검증 실패 시 저장 단계에서 null 로 저장 (조회 UI 는 "컨텍스트 없음" 표시).
   */
  context?: AlertHistoryContext | null
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
        // Phase 37-A (#444): 손상된 context 는 조용히 null 로 저장 —
        // 이력 자체는 남겨야 하므로 (알림 흐름 유지 원칙과 동일).
        contextJson: e.context && isValidContext(e.context)
          ? (e.context as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      })),
    })
  } catch (error) {
    console.error('[alert-history] 저장 실패:', error)
  }
}
