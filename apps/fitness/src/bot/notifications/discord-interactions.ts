// pleiades M-6b-3 (pleiades#151 · 003 §6 1b-2b): Discord 버튼 클릭을 받는 gateway — 봇 프로세스에서 텔레그램 롱폴링과 함께 돈다.
// 토큰·채널이 설정돼 있으면 스위치(NOTIFY_INTERACTIVE_CHANNEL)와 무관하게 접속한다 — 스위치를 나중에 켜도(루트 .env)
// 재시작 없이 버튼이 동작하게. 허용 = DISCORD_ALLOWED_USER_IDS AND 그 채널(#147 결정). 판단은 텔레그램과 같은 decideAutoAdjust.
//
// pleiades 009 D-1 (pleiades#347): gateway 를 `@pleiades/chat` 으로 옮겼다 — IDENTIFY 보호(0-5)가 chat 에만 있다.
// intents 0(버튼만 · 포털 MESSAGE CONTENT 토글 불필요) · IDENTIFY 기록 `logs/identify-fit.json`(cwd = apps/fitness · 모든 태그에서 무시).
// 아래 두 로그 문구와 label `discord-fit` 은 deploy/discord-switch.sh 판정 문자열이다 — 바꾸지 않는다(deploy/test_discord_switch.py).

import path from "node:path";
import {
  createChat,
  createIdentifyGuard,
  createRouter,
  fileGuardStore,
  type ButtonContext,
  type Chat,
} from "@pleiades/chat";
import { Route, html } from "@pleiades/notify";
import { decideAutoAdjust } from "./auto-adjust-callback";
import { CALLBACK_PREFIX } from "./auto-adjust";
import { BOT_NOTIFY_CTX, discordBotConfig, notifierFor, type NotifyBot } from "./notifier";

const LABEL = "discord-fit";
/** cwd 상대 — pm2·run.sh 모두 apps/fitness 에서 띄운다(deploy/pleiades.config.cjs). */
export const IDENTIFY_RECORD = path.join("logs", "identify-fit.json");

/** 버튼 1건 처리 — `auto_adjust:` 만 다룬다. 다른 접두사는 안내만. */
export async function handleDiscordButton(ctx: ButtonContext): Promise<void> {
  if (!ctx.action.startsWith(`${CALLBACK_PREFIX}:`)) {
    await ctx.notice("알 수 없는 요청입니다.");
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

/** 모든 버튼을 handleDiscordButton 으로 — 접두사 판단은 핸들러가 한다(알 수 없는 접두사도 안내). */
export const discordRouter = createRouter().action(/^/, (ctx) => handleDiscordButton(ctx));

/**
 * 설정이 갖춰졌으면 gateway 를 시작해 돌려준다. 아니면 undefined(로그 1줄 · 텔레그램은 그대로).
 * `notifyBot` 은 IDENTIFY 차단 알림 경로 — Discord 봇 토큰과 무관한 notifier(웹훅 · 텔레그램)로 보낸다.
 */
export function startDiscordInteractions(notifyBot: NotifyBot): Chat | undefined {
  const cfg = discordBotConfig();
  if (!cfg.ready) {
    console.log("[discord-fit] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)");
    return undefined;
  }
  if (cfg.allowedUserIds.length === 0) {
    console.warn("[discord-fit] DISCORD_ALLOWED_USER_IDS 비어 있음 — 모든 버튼 클릭을 거부한다");
  }
  const chat = createChat({
    token: () => discordBotConfig().token,
    label: LABEL,
    intents: 0,
    router: discordRouter,
    allowedUserIds: () => discordBotConfig().allowedUserIds,
    allowedChannelIds: () => [discordBotConfig().channelId],
    identifyGuard: createIdentifyGuard({
      store: fileGuardStore(path.resolve(IDENTIFY_RECORD)),
      onBlocked: async (info) => {
        const msg =
          `⚠️ <b>fit Discord 봇 접속 중단</b>\nIDENTIFY 보호(${info.reason} · 24시간 ${info.count}/${info.limit}) — ` +
          `${new Date(info.retryAt).toISOString()} 이후 다시 시도한다. 재시작 루프가 있는지 확인한다.`;
        console.error(`[${LABEL}] IDENTIFY 보호 — ${info.reason} · ${info.count}/${info.limit}`);
        const r = await notifierFor(notifyBot).notify(Route.ALLOWED, html(msg), BOT_NOTIFY_CTX);
        // chat 의 guard 는 onBlocked 의 실패를 삼킨다 — 안 나갔으면 여기서 남긴다(PR-2 사전 리뷰 info 4)
        if (r.sent === 0) console.warn(`[${LABEL}] IDENTIFY 차단 알림 미전송 (sent=0/total=${r.total})`);
      },
    }),
  });
  chat.start();
  return chat;
}
