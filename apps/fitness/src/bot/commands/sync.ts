import type { Bot } from "grammy";
import { syncAll } from "../../lib/garmin/sync";
import { ACTIVITY_RECHECK_DAYS } from "../../lib/garmin/activity-recheck";
import { plainReply, type ReplyOutput } from "../core/reply";
import type { NotifyBot } from "../notifications/notifier";
import { telegramOutput } from "../utils/telegram-reply";
import { sanitizeError } from "../utils/error";

/** Discord 판 싱크 실패 안내 — 원문 대신(#365 · 서비스 유래 결함을 새 경로에 옮기지 않는다 · pleiades#367). */
export const SYNC_FAILED_STATIC = "❌ 싱크 실패 — 잠시 후 다시 시도해주세요.";

/**
 * /sync — 어제·오늘 Garmin 싱크(판단 · pleiades#364). 시작 안내 → 결과 안내 순으로 보낸다.
 * `bot` 은 Garmin 재인증 실패 admin alert 경로(lib 의 `!bot` = 웹 · 보내지 않는다 — 넘기지 않으면 alert 가 빠진다).
 * `staticErrors` 면 실패 원문을 내지 않고 정적 안내만(Discord 판 · pleiades#367) — 텔레그램 판은 넘기지 않는다(무변경).
 */
export async function decideSync(
  out: ReplyOutput,
  options: { now?: Date; bot?: NotifyBot; staticErrors?: boolean } = {},
): Promise<void> {
  await out.reply(plainReply("🔄 Garmin 데이터 싱크 시작..."));

  try {
    const today = new Date(options.now ?? new Date());
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // #256 Codex bot 릴리즈 PR #258 P2: 수동 /sync 도 Garmin 재인증 실패 시 admin alert.
    const results = await syncAll({
      startDate: yesterday,
      endDate: today,
      notifyBot: options.bot,
      // #414: 수동 싱크는 방금 Garmin 에서 바꾼 과거 활동을 반영하려는 경우가 많다 — 활동만 최근 30일
      activityRecheckDays: ACTIVITY_RECHECK_DAYS,
    });
    const total = results.reduce((s, r) => s + r.synced, 0);
    const failed = results.filter((r) => r.error).length;

    await out.reply(
      plainReply(`✅ 싱크 완료: ${total}건${failed > 0 ? ` (${failed}건 실패)` : ""}`)
    );
  } catch (error) {
    if (options.staticErrors) {
      console.error(`[bot/sync] 싱크 실패: ${sanitizeError(error)}`);
      await out.reply(plainReply(SYNC_FAILED_STATIC));
      return;
    }
    // 서비스 유래: 오류 원문 200자 노출(W10 과 같은 성질 · Q57 텔레그램 판 무변경)
    const msg = error instanceof Error ? error.message : String(error);
    await out.reply(plainReply(`❌ 싱크 실패: ${msg.slice(0, 200)}`));
  }
}

export function registerSyncCommand(bot: Bot) {
  bot.command("sync", async (ctx) => {
    await decideSync(telegramOutput(ctx), { bot });
  });
}
