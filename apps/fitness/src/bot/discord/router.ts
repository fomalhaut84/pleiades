// pleiades 009 D-2 PR-3 (pleiades#367 · 설계 H): fit Discord 라우터 — 판단은 텔레그램과 같은 decide* 를 쓴다.
//   명령 11(접두 `!` · X-1) · 나머지 텍스트 = 자유 텍스트 4 분기(텔레그램과 같은 순서 · 상태 키 discord:<채널>:<사용자> · AI 세션 "discord")
//   첨부 = 사진(P) · 버튼 = `auto_adjust:` · `food:` · 마지막에 알 수 없는 접두 안내.
// 답은 받은 채널로만(C-4). `bot` 은 standalone 의 notifyBot — lib 의 `!bot`(= 웹) 의미를 지킨다(1-7).
// 서비스 유래 결함(#365 · W10): Discord 판의 싱크·리포트 재생성 실패는 원문 대신 정적 안내(텔레그램 판은 그대로).

import { createRouter, type MessageContext, type Router } from "@pleiades/chat";
import { DISCORD_AI_CHANNEL, decideAi, decideReset } from "../commands/ai";
import { decideFoodKcal } from "../commands/food";
import { CALLBACK_PREFIX as FOOD_PREFIX, decideFoodButton } from "../commands/food-edit-callback";
import { decideFreeText } from "../commands/free-text";
import { decideReport } from "../commands/report";
import { decideRun } from "../commands/run";
import { decideSleep } from "../commands/sleep";
import { decideHelp, decideStart } from "../commands/start";
import { decideSync } from "../commands/sync";
import { decideToday } from "../commands/today";
import { decideWeight } from "../commands/weight";
import { discordStateKey } from "../core/state-key";
import type { BotReply } from "../core/reply";
import { CALLBACK_PREFIX as AUTO_ADJUST_PREFIX } from "../notifications/auto-adjust";
import type { NotifyBot } from "../notifications/notifier";
import { UNKNOWN_BUTTON_TEXT, handleDiscordButton } from "./auto-adjust-button";
import { handleDiscordAttachment } from "./photo";
import { DISCORD_COMMAND_PREFIX, discordButtonOutput, discordOutput, withTyping } from "./reply";

const out = (ctx: MessageContext) => discordOutput(ctx);
const send = (ctx: MessageContext, message: BotReply) => out(ctx).reply(message);
/** 오래 걸리는 처리 — 끝날 때까지 "입력 중" 을 잇는다. */
const slow = (ctx: MessageContext, task: () => Promise<void>) => withTyping(() => ctx.typing(), task);

/** 자유 텍스트 — 텔레그램 `message:text` 와 같은 4 분기. 등록되지 않은 `!foo` 는 편집 입력으로 먹지 않는다(텔레그램 `/foo` 와 같다). */
export async function handleDiscordText(ctx: MessageContext, bot: NotifyBot): Promise<void> {
  const text = ctx.text.trim();
  const stateKey = text.startsWith(DISCORD_COMMAND_PREFIX) ? undefined : discordStateKey(ctx.channelId, ctx.userId);
  await slow(ctx, () => decideFreeText(text, out(ctx), { stateKey, aiChannel: DISCORD_AI_CHANNEL, bot }));
}

/** 텍스트 경로(명령 + 자유 텍스트) — 첨부 경로가 이미지 0 일 때 이리로 넘긴다. */
function textRouter(bot: NotifyBot): Router {
  return createRouter({ commandPrefix: DISCORD_COMMAND_PREFIX })
    .command("start", (ctx) => send(ctx, decideStart()))
    .command("help", (ctx) => send(ctx, decideHelp()))
    .command("today", async (ctx) => send(ctx, await decideToday()))
    .command("run", async (ctx) => send(ctx, await decideRun()))
    .command("sleep", async (ctx) => send(ctx, await decideSleep()))
    .command("weight", async (ctx) => send(ctx, await decideWeight()))
    .command("sync", (ctx) => slow(ctx, () => decideSync(out(ctx), { bot, staticErrors: true })))
    .command("report", (ctx, args) =>
      slow(ctx, () => decideReport(args === "" ? undefined : args, out(ctx), { bot, staticErrors: true })),
    )
    .command("ai", (ctx, args) => slow(ctx, () => decideAi(args, out(ctx), { channel: DISCORD_AI_CHANNEL, bot })))
    .command("reset", (ctx) => send(ctx, decideReset(DISCORD_AI_CHANNEL)))
    // 판단은 `/food_kcal <id> <kcal>` 원문을 받는다 — 접두만 맞춰 넘긴다
    .command("food_kcal", (ctx, args) => decideFoodKcal(`/food_kcal ${args}`.trim(), out(ctx)))
    .fallback((ctx) => handleDiscordText(ctx, bot));
}

/** fit Discord 라우터 — 메시지(명령 · 자유 텍스트 · 사진)와 버튼. */
export function createDiscordRouter(bot: NotifyBot): Router {
  const text = textRouter(bot);
  return text
    .attachment((ctx) =>
      handleDiscordAttachment(ctx, {
        handleText: async (c) => {
          await text.handleMessage(c);
        },
      }),
    )
    .action(`${AUTO_ADJUST_PREFIX}:`, (ctx) => handleDiscordButton(ctx))
    .action(`${FOOD_PREFIX}:`, (ctx) =>
      decideFoodButton(ctx.action, discordStateKey(ctx.channelId, ctx.userId), discordButtonOutput(ctx)),
    )
    // 마지막 — 알 수 없는 접두도 처리됨으로(chat 의 실패 안내가 나가지 않게 · D-1 과 같은 결과)
    .action(/^/, (ctx) => ctx.notice(UNKNOWN_BUTTON_TEXT));
}
