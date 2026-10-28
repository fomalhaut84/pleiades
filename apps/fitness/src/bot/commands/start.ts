import type { Bot } from "grammy";
import { htmlReply, plainReply, type BotReply } from "../core/reply";
import { sendTelegramReply } from "../utils/telegram-reply";

/** /start — 도움말(판단 · pleiades#364). */
export function decideStart(): BotReply {
  return htmlReply(
    "🏃 <b>myFitness 봇</b>\n\n" +
      "Garmin 데이터 기반 피트니스 어드바이저\n\n" +
      "<b>커맨드:</b>\n" +
      "/today — 오늘 요약\n" +
      "/run — 최근 러닝\n" +
      "/sleep — 어젯밤 수면\n" +
      "/weight — 최근 체중\n" +
      "/sync — 데이터 싱크\n" +
      "/report — 최근 리포트\n" +
      "/ai [질문] — AI 어드바이저\n" +
      "/reset — AI 세션 초기화\n\n" +
      "자유 텍스트로 질문하거나\n" +
      '"점심 김치찌개 밥" 형태로 식단 기록'
  );
}

/** /help — /start 안내(판단 · pleiades#364). */
export function decideHelp(): BotReply {
  return plainReply("/start 참조");
}

export function registerStartCommands(bot: Bot) {
  bot.command("start", (ctx) => sendTelegramReply(ctx, decideStart()));

  // 텔레그램은 리팩터 전과 같이 api.sendMessage(chat.id) 로 보낸다(ctx.reply 와 경로가 다르다 — 무변경 기준)
  bot.command("help", (ctx) => ctx.api.sendMessage(ctx.chat.id, decideHelp().text));
}
