// pleiades M-6b-3 (pleiades#151 · 003 §6 1b-2b): Discord 버튼 클릭을 받는 gateway — 봇 프로세스에서 텔레그램 롱폴링과 함께 돈다.
// 토큰·채널이 설정돼 있으면 스위치(NOTIFY_INTERACTIVE_CHANNEL)와 무관하게 접속한다 — 스위치를 나중에 켜도(루트 .env)
// 재시작 없이 버튼이 동작하게. 허용 = DISCORD_ALLOWED_USER_IDS AND 그 채널(#147 결정). 판단은 텔레그램과 같은 decideAutoAdjust.

import { createDiscordGateway, type DiscordButtonContext, type DiscordGateway } from "@pleiades/notify";
import { decideAutoAdjust } from "./auto-adjust-callback";
import { CALLBACK_PREFIX } from "./auto-adjust";
import { discordBotConfig } from "./notifier";

/** 버튼 1건 처리 — `auto_adjust:` 만 다룬다. 다른 접두사는 안내만. */
export async function handleDiscordButton(ctx: DiscordButtonContext): Promise<void> {
  if (!ctx.customId.startsWith(`${CALLBACK_PREFIX}:`)) {
    await ctx.reply("알 수 없는 요청입니다.");
    return;
  }
  const { notice, removeKeyboard } = await decideAutoAdjust(ctx.customId);
  // 결정은 이미 반영됐다 — 안내가 실패해도(인터랙션 만료·네트워크) "처리 오류" 로 보이지 않게 여기서 삼키고 버튼 제거는 계속한다
  await ctx.reply(notice).catch((err: unknown) => {
    console.warn(`[discord-fit] 안내 전송 실패 (무시): ${err instanceof Error ? err.message : String(err)}`);
  });
  if (removeKeyboard) {
    // 수락·거절은 버튼을 지운다(중복 클릭 방지) — 오래된 메시지면 실패할 수 있다(텔레그램과 같이 무시)
    await ctx.removeButtons().catch((err: unknown) => {
      console.warn(`[discord-fit] 버튼 제거 실패 (무시): ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

/** 설정이 갖춰졌으면 gateway 를 시작해 돌려준다. 아니면 undefined(로그 1줄 · 텔레그램은 그대로). */
export function startDiscordInteractions(): DiscordGateway | undefined {
  const cfg = discordBotConfig();
  if (!cfg.ready) {
    console.log("[discord-fit] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)");
    return undefined;
  }
  if (cfg.allowedUserIds.length === 0) {
    console.warn("[discord-fit] DISCORD_ALLOWED_USER_IDS 비어 있음 — 모든 버튼 클릭을 거부한다");
  }
  const gateway = createDiscordGateway({
    token: cfg.token,
    label: "discord-fit",
    onButton: handleDiscordButton,
    allowedUserIds: () => discordBotConfig().allowedUserIds,
    allowedChannelIds: () => [discordBotConfig().channelId],
  });
  gateway.start();
  return gateway;
}
