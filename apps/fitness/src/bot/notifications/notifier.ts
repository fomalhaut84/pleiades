// pleiades 1a-3 (pleiades#95 · 003 §5-1): 아웃바운드 알림을 @pleiades/notify 파사드로 보낸다.
// 재시도 · HTML→plain 폴백 · 길이 분할은 패키지 코어가 소유한다(003 §4-1(a)).
//
// pleiades 009 D-5 B2 (pleiades#504): 텔레그램을 지웠다 — 스위치(`NOTIFY_ALLOWED_CHANNEL`·`NOTIFY_INTERACTIVE_CHANNEL`)를 읽지 않고
// 늘 Discord 로 보낸다(009 §5-4). 텍스트 = `#fitness` 웹훅(`DISCORD_WEBHOOK_FITNESS`) · 키보드 = fit Discord 봇.
// 설정이 비면 수신자 0(호출부 가드의 `total === 0`). 값은 pleiades 루트 `.env`(`platformEnv` · 프로세스 env 우선)에서 읽는다.
// 버튼 클릭은 봇 프로세스의 gateway(`discord-interactions.ts`)가 받는다.

import {
  createDiscordBotTransport,
  createDiscordTransport,
  createNotifier,
  platformEnv,
  type Notifier,
  type NotifyContext,
} from "@pleiades/notify";

/**
 * 호출부 공통 로그 컨텍스트 — `[bot] 전송 재시도 …` · `[bot] 메시지 전송 실패 …` 형식 보존(#48 I2 · U-5).
 * 빠뜨리면 패키지 기본값 `[notify]` 가 찍힌다.
 */
export const BOT_NOTIFY_CTX: NotifyContext = Object.freeze({ label: "bot" });

const DISCORD_ALIAS = "fitness";

/**
 * Discord 웹훅 URL 형식 — 아니면 비운다(수신자 0). 잘못된 값을 그대로 쓰면 undici 오류 메시지에 토큰 담긴 URL 이 실린다
 * (#143 사전 리뷰 info).
 */
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+(?:\?[\w=&-]*)?$/;
export function webhookEnv(name: string): string {
  const v = (platformEnv(name) ?? "").trim();
  return WEBHOOK_RE.test(v) ? v : "";
}

const discordWebhooks = () => ({ [DISCORD_ALIAS]: webhookEnv("DISCORD_WEBHOOK_FITNESS") });

/**
 * 봇 프로세스 표지 — **봇 프로세스만** 넘긴다. 웹은 넘기지 않는다(undefined) — admin-alerts 의 `!bot` 은
 * "웹은 alert 를 보내지 않는다" 는 뜻이다(009 1-7 · §4-3). 전송 경로와는 무관하다.
 */
export type BotProcess = { readonly botProcess: true };

/** 봇 프로세스의 표지 — 하나뿐이다. */
export const BOT_PROCESS: BotProcess = Object.freeze({ botProcess: true });

/**
 * 텍스트 알림 파사드 — 웹훅이 비면 수신자 0.
 * transport 는 인스턴스의 첫 전송 때 정해지므로 인스턴스를 오래 쥐지 않고 보낼 때마다 만든다(PR #144 Codex P2).
 */
export function notifierFor(): Notifier {
  return createNotifier({
    transport: () => createDiscordTransport({ webhooks: discordWebhooks }),
    targets: { ALLOWED: () => (discordWebhooks()[DISCORD_ALIAS] === "" ? [] : [DISCORD_ALIAS]) },
  });
}

/**
 * 키보드가 붙은 메시지 전용 — fit Discord 봇. 봇 설정이 없으면 수신자 0.
 * `first.ref`(Discord 메시지 id)·`first.target`(별칭 `fitness`)이 `WorkoutAdjustment.telegramMessageId`·`telegramChatId` 에
 * 그대로 저장된다(003 §6-2 D-a · 읽기 경로 0 · Q61 · 컬럼명은 S-8 로 유지).
 */
export function interactiveNotifierFor(): Notifier {
  const discord = discordBotConfig();
  return createNotifier({
    transport: createDiscordBotTransport({ token: discord.token, channels: { [DISCORD_ALIAS]: discord.channelId } }),
    targets: { ALLOWED: () => (discord.ready ? [DISCORD_ALIAS] : []) },
  });
}

/** fit Discord 봇 설정 — 토큰·채널 ID·허용 사용자. `ready` 는 토큰과 채널 ID 형식이 갖춰졌는지. 값은 로그에 쓰지 않는다. */
export function discordBotConfig(): { token: string; channelId: string; allowedUserIds: string[]; ready: boolean } {
  const token = (platformEnv("DISCORD_BOT_TOKEN_FITNESS") ?? "").trim();
  const channelId = (platformEnv("DISCORD_CHANNEL_ID_FITNESS") ?? "").trim();
  const allowedUserIds = (platformEnv("DISCORD_ALLOWED_USER_IDS") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d{5,25}$/.test(v));
  return { token, channelId, allowedUserIds, ready: token !== "" && /^\d{5,25}$/.test(channelId) };
}

/** 대화 채널 키(009 D-2 Kb1 · pleiades#367) — 비어 있거나 형식이 아니면 메시지 수신을 켜지 않는다(스위치를 겸한다). */
export const DISCORD_CHAT_CHANNEL_KEY = "DISCORD_CHANNEL_ID_FITNESS_CHAT";

/**
 * fit 대화 채널 ID — 부를 때마다 읽는다(프로세스 env → 루트 `.env`). 형식(숫자 5~25자리)이 아니면 "".
 * 알림 채널(`DISCORD_CHANNEL_ID_FITNESS`)과 같은 값이어도 된다(사용자 2026-10-28 · `_workspace/009/d2/05_live_chat.md` D-1).
 * 값은 로그에 쓰지 않는다.
 */
export function discordChatChannelId(): string {
  const v = (platformEnv(DISCORD_CHAT_CHANNEL_KEY) ?? "").trim();
  return /^\d{5,25}$/.test(v) ? v : "";
}
