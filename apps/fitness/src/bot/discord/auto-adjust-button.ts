// pleiades M-6b-3 (pleiades#151): Discord `auto_adjust:` 버튼 — 판단은 텔레그램과 같은 decideAutoAdjust.
// pleiades 009 D-2 PR-3 (pleiades#367): notifications/discord-interactions.ts 에서 옮겼다(라우터와의 순환 import 를 피해) —
// 그 파일이 다시 내보낸다. 동작 무변경.

import type { ButtonContext } from "@pleiades/chat";
import { decideAutoAdjust } from "../notifications/auto-adjust-callback";
import { CALLBACK_PREFIX } from "../notifications/auto-adjust";

const LABEL = "discord-fit";

/** 알 수 없는 버튼 접두 안내 — 텔레그램과 같은 문구. */
export const UNKNOWN_BUTTON_TEXT = "알 수 없는 요청입니다.";

/** 버튼 1건 처리 — `auto_adjust:` 만 다룬다. 다른 접두사는 안내만. */
export async function handleDiscordButton(ctx: ButtonContext): Promise<void> {
  if (!ctx.action.startsWith(`${CALLBACK_PREFIX}:`)) {
    await ctx.notice(UNKNOWN_BUTTON_TEXT);
    return;
  }
  const { notice, removeKeyboard } = await decideAutoAdjust(ctx.action);
  // 결정은 이미 반영됐다 — 안내가 실패해도(인터랙션 만료·네트워크) "처리 오류" 로 보이지 않게 여기서 삼키고 버튼 제거는 계속한다
  await ctx.notice(notice).catch((err: unknown) => {
    console.warn(`[${LABEL}] 안내 전송 실패 (무시): ${err instanceof Error ? err.message : String(err)}`);
  });
  if (removeKeyboard) {
    // 수락·거절은 버튼을 지운다(중복 클릭 방지) — 오래된 메시지면 실패할 수 있다(텔레그램과 같이 무시)
    await ctx.setButtons([]).catch((err: unknown) => {
      console.warn(`[${LABEL}] 버튼 제거 실패 (무시): ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}
