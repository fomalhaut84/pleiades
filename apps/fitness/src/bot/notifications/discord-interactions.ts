// pleiades M-6b-3 (pleiades#151 · 003 §6 1b-2b): Discord 버튼 클릭을 받는 gateway — 봇 프로세스에서 텔레그램 롱폴링과 함께 돈다.
// 토큰·채널이 설정돼 있으면 스위치(NOTIFY_INTERACTIVE_CHANNEL)와 무관하게 접속한다 — 스위치를 나중에 켜도(루트 .env)
// 재시작 없이 버튼이 동작하게. 허용 = DISCORD_ALLOWED_USER_IDS AND 그 채널(#147 결정). 판단은 텔레그램과 같은 decideAutoAdjust.
//
// pleiades 009 D-1 (pleiades#347): gateway 를 `@pleiades/chat` 으로 옮겼다 — IDENTIFY 보호(0-5)가 chat 에만 있다.
// intents 0(버튼만 · 포털 MESSAGE CONTENT 토글 불필요) · IDENTIFY 기록 `logs/identify-fit.json`(cwd = apps/fitness · 모든 태그에서 무시).
// 아래 두 로그 문구와 label `discord-fit` 은 deploy/discord-switch.sh 판정 문자열이다 — 바꾸지 않는다(deploy/test_discord_switch.py).
//
// pleiades 009 D-2 PR-3 (pleiades#367 · 설계 K · F · H): 대화 채널 키 `DISCORD_CHANNEL_ID_FITNESS_CHAT`(루트 플랫폼 env · 선택)가
// 메시지 수신 스위치다 — 비면 D-1 과 같다(버튼만). 채우면 그 채널의 메시지를 명령·자유 텍스트·사진으로 받는다(discord/router.ts).
// 메시지 채널 = [대화] · 버튼 채널 = [알림, 대화](Ka3). 기동 로그 1줄(켜짐/꺼짐)은 deploy/discord-inbound.sh 판정 문자열.

import path from "node:path";
import {
  createChat,
  createIdentifyGuard,
  fileGuardStore,
  MESSAGE_INTENTS,
  type Chat,
} from "@pleiades/chat";
import { Route, html } from "@pleiades/notify";
import { createDiscordRouter } from "../discord/router";
import { FIT_ATTACHMENT_POLICY } from "../discord/photo";
import {
  BOT_NOTIFY_CTX,
  BOT_PROCESS_WITHOUT_TELEGRAM,
  discordBotConfig,
  discordChatChannelId,
  notifierFor,
  type NotifyBot,
} from "./notifier";

// 버튼 핸들러는 discord/auto-adjust-button.ts(pleiades#367) — 기존 import 경로를 지킨다
export { handleDiscordButton } from "../discord/auto-adjust-button";

const LABEL = "discord-fit";
/** cwd 상대 — pm2·run.sh 모두 apps/fitness 에서 띄운다(deploy/pleiades.config.cjs). */
export const IDENTIFY_RECORD = path.join("logs", "identify-fit.json");

/**
 * 기본 라우터 — 버튼은 notifyBot 을 쓰지 않으므로 테스트·호환용으로 텔레그램 없는 핸들로 만든다.
 * 기동 경로(startDiscordInteractions)는 standalone 의 notifyBot 으로 새로 만든다.
 */
export const discordRouter = createDiscordRouter(BOT_PROCESS_WITHOUT_TELEGRAM);

/** 기동 로그 — deploy/discord-inbound.sh 판정 문자열(009 D-2 Kb1 · pleiades#367). 바꾸지 않는다(deploy/test_discord_inbound.py). */
export const INBOUND_ON_LOG = "[discord-fit] 메시지 수신 켜짐(대화 채널)";
export const INBOUND_OFF_LOG = "[discord-fit] 메시지 수신 꺼짐(버튼만)";

/** 메시지 채널 = [대화 채널] — 부를 때마다 읽는다(실행 중 키를 비우면 다음 메시지부터 무시 · 2-3). */
export function messageChannels(): string[] {
  const chat = discordChatChannelId();
  return chat === "" ? [] : [chat];
}

/** 버튼 채널 = [알림 채널, 대화 채널] — 빈 값·중복 제거(대화 채널 = 알림 채널이어도 된다 · 사용자 2026-10-28). */
export function buttonChannels(): string[] {
  const ids = [discordBotConfig().channelId, discordChatChannelId()].filter((v) => v !== "");
  return [...new Set(ids)];
}

/** 4014 강등 알림 1회(F1) — IDENTIFY 차단 알림과 같은 경로(Route.ALLOWED · 봇 토큰과 무관한 notifier). */
export async function notifyIntentsFallback(notifyBot: NotifyBot): Promise<void> {
  const msg =
    "⚠️ <b>fit Discord 메시지 수신 꺼짐</b>\n개발자 포털 MESSAGE CONTENT 토글이 꺼져 있어(4014) 버튼만 받는다. " +
    "토글을 켠 뒤 봇을 재시작하거나 deploy/discord-inbound.sh fit off 로 끈다.";
  const r = await notifierFor(notifyBot).notify(Route.ALLOWED, html(msg), BOT_NOTIFY_CTX);
  // chat 은 콜백 실패를 삼킨다 — 안 나갔으면 여기서 남긴다
  if (r.sent === 0) console.warn(`[${LABEL}] 4014 강등 알림 미전송 (sent=0/total=${r.total})`);
}

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
  // 대화 채널 키가 스위치다(Kb1) — 기동 때 비었으면 D-1 그대로(intents 0 · 메시지 0). 채우면 메시지 intents + 4014 강등(F1)
  const inbound = discordChatChannelId() !== "";
  console.log(inbound ? INBOUND_ON_LOG : INBOUND_OFF_LOG);
  const chat = createChat({
    token: () => discordBotConfig().token,
    label: LABEL,
    intents: inbound ? MESSAGE_INTENTS : 0,
    ...(inbound ? { fallbackIntents: 0, onIntentsFallback: () => notifyIntentsFallback(notifyBot) } : {}),
    router: createDiscordRouter(notifyBot),
    allowedUserIds: () => discordBotConfig().allowedUserIds,
    allowedChannelIds: buttonChannels,
    messageChannelIds: messageChannels,
    attachmentPolicy: FIT_ATTACHMENT_POLICY,
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
