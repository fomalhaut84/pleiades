import type { Bot } from "grammy";
import prisma from "../prisma";
import { mdToHtml } from "../utils/telegram";
import { generateMorningReport, generateEveningReport } from "../../lib/daily-report";
import { htmlReply, plainReply, type ReplyOutput } from "../core/reply";
import type { NotifyBot } from "../notifications/notifier";
import { telegramOutput } from "../utils/telegram-reply";
import { sanitizeError } from "../utils/error";

/** Discord 판 재생성 실패 안내 — 원문 대신(W10 · #365 · pleiades#367). */
export const REPORT_REGENERATE_FAILED_STATIC = "❌ 재생성 실패 — 잠시 후 다시 시도해주세요.";

/**
 * /report [regenerate morning|evening] — 최근 리포트 표시 또는 재생성(판단 · pleiades#364).
 * `arg` 는 명령 뒤 인자(플랫폼 접두를 뗀 문자열 · 없으면 undefined). `bot` 은 preSync Garmin 실패 admin alert 경로.
 * `staticErrors` 면 재생성 실패 원문을 내지 않고 정적 안내만(Discord 판 · pleiades#367) — 텔레그램 판은 넘기지 않는다(무변경).
 */
export async function decideReport(
  arg: string | undefined,
  out: ReplyOutput,
  options: { bot?: NotifyBot; staticErrors?: boolean } = {},
): Promise<void> {
  const normalized = arg?.trim().toLowerCase();

  // /report regenerate morning|evening
  if (normalized?.startsWith("regenerate")) {
    const type = normalized.split(/\s+/)[1];
    if (type === "morning" || type === "evening") {
      await out.reply(plainReply(`🔄 ${type === "morning" ? "모닝" : "이브닝"} 리포트 재생성 중...`));
      try {
        // #256 Codex bot PR #258 P2: 수동 재생성도 preSync Garmin 실패 시 admin alert.
        const result =
          type === "morning"
            ? await generateMorningReport(true, undefined, { notifyBot: options.bot })
            : await generateEveningReport(true, undefined, { notifyBot: options.bot });
        const html = mdToHtml(result);
        await out.reply(htmlReply(`✅ 재생성 완료\n\n${html}`, { long: true }));
      } catch (error) {
        if (options.staticErrors) {
          console.error(`[bot/report] 재생성 실패: ${sanitizeError(error)}`);
          await out.reply(plainReply(REPORT_REGENERATE_FAILED_STATIC));
          return;
        }
        // 서비스 유래: 실패 원문 노출(W10 · Q57 — 텔레그램 판 무변경 · Discord 판은 위 정적 안내)
        const msg = error instanceof Error ? error.message : String(error);
        await out.reply(plainReply(`❌ 재생성 실패: ${msg.slice(0, 200)}`));
      }
      return;
    }
    await out.reply(plainReply("사용법: /report regenerate morning|evening"));
    return;
  }

  // 최근 리포트 표시
  const latest = await prisma.aIAdvice.findFirst({
    where: { category: { in: ["morning_report", "evening_report", "weekly_report"] } },
    orderBy: { createdAt: "desc" },
    select: { category: true, reportDate: true, response: true },
  });

  if (!latest) {
    await out.reply(plainReply("리포트가 아직 없습니다."));
    return;
  }

  const typeLabels: Record<string, string> = {
    morning_report: "☀️ 모닝 리포트",
    evening_report: "🌙 이브닝 리포트",
    weekly_report: "📊 주간 리포트",
  };

  const header = `<b>${typeLabels[latest.category] ?? latest.category}</b>`;
  const date = latest.reportDate ? ` (${latest.reportDate})` : "";
  const html = mdToHtml(latest.response);

  await out.reply(htmlReply(`${header}${date}\n\n${html}`, { long: true }));
}

export function registerReportCommand(bot: Bot) {
  bot.command("report", async (ctx) => {
    await decideReport(ctx.match?.toString(), telegramOutput(ctx), { bot });
  });
}
