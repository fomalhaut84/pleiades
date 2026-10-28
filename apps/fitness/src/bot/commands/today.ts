import type { Bot } from "grammy";
import { htmlReply, plainReply, type BotReply } from "../core/reply";
import { sendTelegramReply } from "../utils/telegram-reply";
import prisma from "../prisma";

/** /today — 오늘 요약(판단 · pleiades#364). */
export async function decideToday(now: Date = new Date()): Promise<BotReply> {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [daily, sleep] = await Promise.all([
    prisma.dailySummary.findUnique({ where: { date: today } }),
    prisma.sleepRecord.findFirst({
      where: { date: { gte: yesterday, lte: today } },
      orderBy: { date: "desc" },
    }),
  ]);

  if (!daily && !sleep) {
    return plainReply("오늘 데이터가 아직 없습니다. /sync 로 싱크해보세요.");
  }

  const lines: string[] = ["📊 <b>오늘 요약</b>\n"];

  if (daily) {
    if (daily.steps !== null) lines.push(`👣 걸음 수: <b>${daily.steps.toLocaleString()}</b>`);
    if (daily.restingHR !== null) lines.push(`❤️ 안정시 심박: <b>${daily.restingHR}</b> bpm`);
    if (daily.bodyBatteryHigh !== null) lines.push(`🔋 바디배터리: <b>${daily.bodyBatteryHigh}</b> (기상 시)`);
    if (daily.avgStress !== null) lines.push(`😰 평균 스트레스: <b>${daily.avgStress}</b>`);
    if (daily.activeCalories !== null) lines.push(`🔥 활동 칼로리: <b>${daily.activeCalories}</b> kcal`);
  }

  if (sleep) {
    if (sleep.sleepScore !== null) lines.push(`😴 수면 점수: <b>${sleep.sleepScore}</b>`);
    if (sleep.hrvOvernight !== null) lines.push(`💓 야간 HRV: <b>${Math.round(sleep.hrvOvernight)}</b> ms`);
  }

  return htmlReply(lines.join("\n"));
}

export function registerTodayCommand(bot: Bot) {
  bot.command("today", async (ctx) => {
    await sendTelegramReply(ctx, await decideToday());
  });
}
