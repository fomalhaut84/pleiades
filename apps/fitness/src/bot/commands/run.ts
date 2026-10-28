import type { Bot } from "grammy";
import { htmlReply, plainReply, type BotReply } from "../core/reply";
import { sendTelegramReply } from "../utils/telegram-reply";
import prisma from "../prisma";
import { fmtDistance, fmtPace, fmtDuration } from "../utils/formatter";
import { formatDateKST } from "../../lib/format";

/** /run — 최근 러닝 3건(판단 · pleiades#364). */
export async function decideRun(): Promise<BotReply> {
  const recent = await prisma.activity.findMany({
    where: { activityType: { contains: "running" } },
    orderBy: { startTime: "desc" },
    take: 3,
    select: {
      name: true,
      startTime: true,
      duration: true,
      distance: true,
      avgPace: true,
      avgHR: true,
      trainingEffect: true,
    },
  });

  if (recent.length === 0) {
    return plainReply("최근 러닝 기록이 없습니다.");
  }

  const lines = ["🏃 <b>최근 러닝</b>\n"];

  for (const r of recent) {
    const date = formatDateKST(r.startTime, { month: "short", day: "numeric" }); // #365: 아침 러닝이 UTC 호스트에서 전날로 찍히던 라벨
    lines.push(
      `<b>${r.name}</b> (${date})`,
      `  ${fmtDistance(r.distance)} · ${fmtDuration(r.duration)} · ${fmtPace(r.avgPace)}`,
      r.avgHR ? `  ❤️ ${r.avgHR} bpm${r.trainingEffect ? ` · TE ${r.trainingEffect.toFixed(1)}` : ""}` : "",
      ""
    );
  }

  return htmlReply(lines.filter(Boolean).join("\n"));
}

export function registerRunCommand(bot: Bot) {
  bot.command("run", async (ctx) => {
    await sendTelegramReply(ctx, await decideRun());
  });
}
