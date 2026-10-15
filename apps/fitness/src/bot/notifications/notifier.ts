// pleiades 1a-3 (pleiades#95 · 003 §5-1): 아웃바운드 알림을 @pleiades/notify 파사드로 보낸다.
// 구 send.ts(sendToAll / sendToAllWithKeyboard) 를 대체 — 재시도 [2000, 8000, 30000] · HTML→plain 폴백 ·
// 4096 초과 줄 경계 분할(Q10-L ①) 은 패키지 코어가 소유하고, 키보드 전송도 같은 정책을 탄다(003 §4-1(a)).
// 수신자는 fit 규칙 그대로 TELEGRAM_ALLOWED_CHAT_IDS (Route.ALLOWED · fit 은 ADMIN 미매핑 — 003 §4-2 Q25 하위 A).
//
// pleiades M-6a-2 (pleiades#143 · 003 §6 1b-1): `NOTIFY_ALLOWED_CHANNEL=discord` 이면 ALLOWED 텍스트 알림을
// Discord `#fitness` 웹훅(`DISCORD_WEBHOOK_FITNESS`)으로 보낸다. 미설정이면 지금과 같다(텔레그램).
// 값은 pleiades 루트 `.env`(`platformEnv` · 프로세스 env 우선)에서 읽는다 — 앱 실행 방식과 무관.
// 키보드(인터랙션) 메시지는 `interactiveNotifierFor` — 별도 스위치 `NOTIFY_INTERACTIVE_CHANNEL=discord` 면 Discord 봇(M-6b-3 #151),
// 아니면 텔레그램(혼합 운영 Q11). 버튼 클릭은 봇 프로세스의 gateway(`discord-interactions.ts`)가 받는다.

import type { Bot } from "grammy";
import {
  createDiscordBotTransport,
  createDiscordTransport,
  createNotifier,
  createTelegramTransport,
  csvEnv,
  platformEnv,
  type Notifier,
  type NotifyContext,
  type Transport,
} from "@pleiades/notify";

/**
 * 호출부 공통 로그 컨텍스트 — `[bot] 전송 재시도 …` · `[bot] 메시지 전송 실패 …` 형식 보존(#48 I2 · U-5).
 * 빠뜨리면 패키지 기본값 `[notify]` 가 찍힌다.
 */
export const BOT_NOTIFY_CTX: NotifyContext = Object.freeze({ label: "bot" });

const TELEGRAM_ALLOWED = csvEnv("TELEGRAM_ALLOWED_CHAT_IDS");
const DISCORD_ALIAS = "fitness";

/** ALLOWED 를 Discord 로 보내는가 — 호출 시점마다 읽는다(프로세스 env → 루트 `.env` · 파일은 수정 시각이 바뀌면 다시 읽는다). */
export function allowedUsesDiscord(): boolean {
  return (platformEnv("NOTIFY_ALLOWED_CHANNEL") ?? "").trim().toLowerCase() === "discord";
}

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

/** Discord 를 골랐는데 웹훅이 비면 수신자 0 — 텔레그램 env 미설정과 같은 의미(가드가 건너뛴다). */
function allowedTargets(): string[] {
  if (!allowedUsesDiscord()) return TELEGRAM_ALLOWED();
  return discordWebhooks()[DISCORD_ALIAS] === "" ? [] : [DISCORD_ALIAS];
}

/**
 * 봇 인스턴스로 파사드를 만든다. 호출부가 이미 `bot` 을 인자로 받으므로 `bot.api` 를 그대로 넘긴다(D-2).
 * transport 는 인스턴스의 첫 전송 때 정해지므로 인스턴스를 오래 쥐지 않고 보낼 때마다 만든다(PR #144 Codex P2).
 */
export function notifierFor(bot: Bot): Notifier {
  const transport = (): Transport =>
    allowedUsesDiscord()
      ? createDiscordTransport({ webhooks: discordWebhooks })
      : createTelegramTransport({ api: bot.api });
  return createNotifier({ transport, targets: { ALLOWED: allowedTargets } });
}

/**
 * 키보드가 붙은 메시지 전용 — 텍스트 스위치(`NOTIFY_ALLOWED_CHANNEL`)는 보지 않고 `NOTIFY_INTERACTIVE_CHANNEL` 만 본다.
 *   미설정 → 텔레그램: `first.ref` = 텔레그램 message_id · `first.target` = chat id
 *   discord → fit 봇: `first.ref` = Discord 메시지 id · `first.target` = 별칭 `fitness` · 봇 설정이 없으면 수신자 0
 * 어느 쪽이든 `WorkoutAdjustment.telegramMessageId`·`telegramChatId` 에 그대로 저장된다(003 §6-2 D-a · 읽기 경로 0 · Q61).
 */
export function interactiveNotifierFor(bot: Bot): Notifier {
  if (!interactiveUsesDiscord()) {
    return createNotifier({
      transport: createTelegramTransport({ api: bot.api }),
      targets: { ALLOWED: TELEGRAM_ALLOWED },
    });
  }
  // Discord 봇 — first.ref(Discord 메시지 id)·target(별칭)이 telegramMessageId·ChatId 에 들어간다(003 §6-2 D-a · 읽기 경로 0)
  const discord = discordBotConfig();
  return createNotifier({
    transport: createDiscordBotTransport({ token: discord.token, channels: { [DISCORD_ALIAS]: discord.channelId } }),
    targets: { ALLOWED: () => (discord.ready ? [DISCORD_ALIAS] : []) },
  });
}

/** 키보드 메시지를 Discord 봇으로 보내는가 — 텍스트 스위치(`NOTIFY_ALLOWED_CHANNEL`)와 따로 켜고 끈다(#147 결정). */
export function interactiveUsesDiscord(): boolean {
  return (platformEnv("NOTIFY_INTERACTIVE_CHANNEL") ?? "").trim().toLowerCase() === "discord";
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
