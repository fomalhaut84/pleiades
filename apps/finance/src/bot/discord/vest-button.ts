/**
 * pleiades M-6b-4 (pleiades#155): RSU vest 확정 버튼(`vest:`) — 판단은 텔레그램과 같은 decideVest.
 * pleiades 009 D-3 PR-3 (pleiades#398): `notifications/discord-interactions.ts` 에서 옮겼다 — 라우터(`./router`)가 부르고
 * gateway 모듈은 다시 내보낸다(기존 import 경로 유지 · 두 모듈이 서로를 import 하지 않게).
 */

import type { ButtonContext } from '@pleiades/chat'
import { decideVest } from '@/bot/commands/vest-confirm'
import { sanitizeError } from '@/bot/utils/error'

/** 알 수 없는 버튼 접두 — D-1 과 같은 안내. */
export const UNKNOWN_BUTTON_TEXT = '알 수 없는 요청입니다.'

/** 버튼 1건 처리 — `vest:` 만 다룬다. 다른 접두사는 안내만. */
export async function handleDiscordButton(ctx: ButtonContext): Promise<void> {
  if (!ctx.action.startsWith('vest:')) {
    await ctx.notice(UNKNOWN_BUTTON_TEXT)
    return
  }
  const decision = await decideVest(ctx.action)
  if (decision.kind === 'alert') {
    // 원본·버튼은 그대로 — 다시 누를 수 있다(텔레그램 show_alert 와 같다)
    await ctx.notice(decision.text)
    return
  }
  // 확정이면 vest 는 이미 DB 반영됐다 — 원본 수정이 실패해도 throw 하지 않는다(chat 의 "처리 중 오류" 안내가 거짓이 된다).
  // 본문은 plain 그대로(chat 의 문자열 = plain) · 버튼은 지운다(edit 기본).
  try {
    await ctx.edit(decision.text)
  } catch (err) {
    console.warn(`[discord-fin] 원본 수정 실패 (${decision.toast}) — 본인 안내로 대신: ${sanitizeError(err)}`)
    await ctx.notice(decision.text).catch((e: unknown) => {
      console.warn(`[discord-fin] 안내 전송 실패 (무시): ${sanitizeError(e)}`)
    })
  }
}
