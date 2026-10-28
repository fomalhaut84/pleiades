import type { Bot } from "grammy";
import { htmlReply, plainReply, type BotReply } from "../core/reply";
import { sendTelegramReply } from "../utils/telegram-reply";
import prisma from "../prisma";
import { formatDateKST } from "../../lib/format";

/** /weight — 최근 체중 5건(판단 · pleiades#364). */
export async function decideWeight(): Promise<BotReply> {
  const recent = await prisma.bodyComposition.findMany({
    orderBy: { date: "desc" },
    take: 5,
    select: { date: true, weight: true, bodyFat: true },
  });

  if (recent.length === 0) {
    return plainReply("체중 기록이 없습니다.");
  }

  const lines = ["⚖️ <b>체중 추세</b>\n"];
  for (const r of recent) {
    const date = formatDateKST(r.date, { month: "short", day: "numeric" }); // #365
    const fat = r.bodyFat ? ` · ${r.bodyFat.toFixed(1)}%` : "";
    lines.push(`${date}: <b>${r.weight.toFixed(1)}</b> kg${fat}`);
  }

  return htmlReply(lines.join("\n"));
}

export function registerWeightCommand(bot: Bot) {
  bot.command("weight", async (ctx) => {
    await sendTelegramReply(ctx, await decideWeight());
  });
}
