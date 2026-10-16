/**
 * RSU 베스팅 확정/취소 inline keyboard callback handler.
 *
 * callback_data 형식: `vest:confirm:<rsuId>` 또는 `vest:cancel:<rsuId>`
 *
 * confirm 시: vest-preview 재호출 → 최신 종가로 vest 트랜잭션 → 결과 메시지 갱신
 * cancel 시: 알림 메시지를 "취소됨" 으로 갱신 (실제 schedule 상태는 변경 없음)
 *
 * pleiades M-6b-4 (pleiades#155): 판단은 채널 중립 `decideVest` — 텔레그램 핸들러와 Discord gateway
 * (`notifications/discord-interactions.ts`)가 같은 결정을 쓴다.
 */

import { Bot } from 'grammy'
import {
  getRsuVestPreview,
  processRsuVest,
  RsuVestError,
  rsuVestErrorMessage,
} from '@/lib/rsu-vest-service'
import { isSafeBusinessError } from '@/lib/api-errors'
import { formatKRWFull } from '@/bot/utils/formatter'
import { sanitizeError } from '@/bot/utils/error'

export const VEST_CALLBACK_RE = /^vest:(confirm|cancel):(.+)$/

/**
 * 버튼 1건의 결과.
 *   edit  → 원본 메시지를 `text`(plain)로 바꾸고 버튼을 없앤다 + 짧은 안내 `toast`
 *   alert → 원본은 그대로(다시 누를 수 있다) · 누른 사람에게만 `text` 안내
 */
export type VestDecision =
  | { kind: 'edit'; text: string; toast: string }
  | { kind: 'alert'; text: string }

/** 확정 성공 시 원본 메시지 본문(plain). */
function vestDoneText(
  preview: Awaited<ReturnType<typeof getRsuVestPreview>>,
  result: Awaited<ReturnType<typeof processRsuVest>>,
): string {
  const lines = [
    '✅ RSU 베스팅 처리 완료',
    '',
    `종목: ${preview.displayName} (${preview.ticker})`,
    `계좌: ${preview.accountName}`,
    `종가: ${formatKRWFull(result.vestPrice)} (${preview.vestPriceSource})`,
    `매수: ${result.buyShares}주`,
  ]
  if (result.sellShares > 0) lines.push(`매도: ${result.sellShares}주`)
  if (result.holding) lines.push(`보유: ${result.holding.shares}주 (평단 ${formatKRWFull(Math.round(result.holding.avgPrice))})`)
  return lines.join('\n')
}

/** 확정 — 최신 preview 재조회 (D-1 → 베스팅일 당일 종가 fetch) → vest 트랜잭션. */
async function decideConfirm(rsuId: string): Promise<VestDecision> {
  let preview
  try {
    preview = await getRsuVestPreview(rsuId)
  } catch (err) {
    if (err instanceof RsuVestError) return { kind: 'alert', text: rsuVestErrorMessage(err) }
    console.error(`[vest-confirm] preview 실패: ${sanitizeError(err)}`)
    return { kind: 'alert', text: '미리보기 실패. 웹에서 확인해주세요.' }
  }

  if (preview.vestPrice == null) {
    return { kind: 'alert', text: '종가 자동 조회 실패. 웹 페이지에서 직접 처리해주세요.' }
  }

  // commit 단계 — vest 트랜잭션 실패만 처리. 성공하면 result 보장.
  let result
  try {
    result = await processRsuVest(rsuId, preview.vestPrice, preview.autoSellDefault)
  } catch (err) {
    if (err instanceof RsuVestError) return { kind: 'alert', text: rsuVestErrorMessage(err) }
    // recalcHolding 의 한국어 비즈니스 예외 (예: "보유 수량 부족: ...")
    if (isSafeBusinessError(err)) return { kind: 'alert', text: err.message }
    console.error(`[vest-confirm] processRsuVest 실패: ${sanitizeError(err)}`)
    return { kind: 'alert', text: '처리 실패. 잠시 후 다시 시도하거나 웹에서 처리해주세요.' }
  }

  return { kind: 'edit', text: vestDoneText(preview, result), toast: '완료' }
}

/** callback_data(= Discord custom_id) 하나를 판단한다. 던지지 않는다. */
export async function decideVest(data: string): Promise<VestDecision> {
  const m = VEST_CALLBACK_RE.exec(data)
  if (!m) return { kind: 'alert', text: '알 수 없는 요청입니다.' }
  if (m[1] === 'cancel') return { kind: 'edit', text: '🚫 RSU 베스팅 처리가 취소되었습니다.', toast: '취소됨' }
  return decideConfirm(m[2])
}

export function registerVestConfirmHandler(bot: Bot): void {
  bot.callbackQuery(VEST_CALLBACK_RE, async (ctx) => {
    const decision = await decideVest(ctx.match[0])

    if (decision.kind === 'alert') {
      await ctx.answerCallbackQuery({ text: decision.text, show_alert: true })
      return
    }

    // 확정이면 vest 는 이미 DB 반영됐다 — 이후의 telegram API 호출은 best-effort.
    // 실패해도 사용자에 '처리 실패' 메시지를 보여서는 안 됨.
    try {
      await ctx.editMessageText(decision.text)
    } catch (err) {
      console.error(`[vest-confirm] editMessageText 실패 (결정 후 · ${decision.toast}): ${sanitizeError(err)}`)
    }
    try {
      await ctx.answerCallbackQuery({ text: decision.toast })
    } catch (err) {
      console.error(`[vest-confirm] answerCallbackQuery 실패 (결정 후 · ${decision.toast}): ${sanitizeError(err)}`)
    }
  })
}
