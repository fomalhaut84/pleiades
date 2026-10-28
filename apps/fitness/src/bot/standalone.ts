import "dotenv/config";
import { getBot } from "./index";
import { startBotScheduler } from "./notifications/scheduler";
import { startDiscordInteractions } from "./notifications/discord-interactions";
import { BOT_NOTIFY_CTX, BOT_PROCESS_WITHOUT_TELEGRAM, notifierFor } from "./notifications/notifier";
import { filePollingStateStore, pollingDisabled, startTelegramPolling } from "./telegram-polling";
import { sanitizeError } from "./utils/error";
import { Route, html } from "@pleiades/notify";
import { sweepOrphanedJobs, startOrphanSweeper } from "@/lib/report-job";
import { ensureDefaults } from "@/lib/prompts/resolve";
import {
  sweepStalePhotoTempFiles,
  startPhotoTempSweeper,
} from "@/lib/nutrition/photo-temp-cleanup";

// pleiades 009 D-1 (pleiades#347): 텔레그램은 기다리지 않는 곁가지다 — 크론·스케줄러·Discord gateway 가 먼저 뜨고,
// 텔레그램 토큰 부재·폴링 실패는 프로세스를 끝내지 않는다(재시작마다 Discord IDENTIFY 가 늘던 경로 · 009 R5).
const POLLING_STATE_FILE = "logs/telegram-polling-fit.json";

async function main() {
  console.log("[bot] myFitness 봇 시작...");

  // #309 (Codex P2 PR #312 2회차): photo temp sweep 은 로컬 fs 만 접근 — 네트워크 의존 이전에 실행.
  // 봇 프로세스만 재시작하는 경우 웹 프로세스 sweep 은 트리거 안 되므로 이 sweep 이 유일한 정리 시점.
  // Codex P2 (PR #312 3회차): startup sweep 은 5분 이상 지난 파일만 삭제 — periodic sweeper 병행.
  await sweepStalePhotoTempFiles().catch((err) => {
    console.error("[photo-cleanup] sweep failed:", err);
  });
  startPhotoTempSweeper();

  // M#191: 봇 프로세스 부팅 시 orphan 된 ReportJob 정리 + periodic sweep 시작.
  await sweepOrphanedJobs().catch((err) => {
    console.error("[report-job] sweep failed:", err);
  });
  startOrphanSweeper();

  // #552 R2: 코드 기본값 → DB 프롬프트 버전 동기화 — 첫 cron 리포트 전에 끝나도록 await.
  // gateway 보다 앞 — DB 실패로 끝나는 기동은 IDENTIFY 를 내지 않는다(009 D-1 E1).
  await ensureDefaults();

  // 텔레그램 토큰이 있으면 아웃바운드용 인스턴스 하나(폴링 인스턴스와 별개 — 폴링을 다시 시작해도 알림 경로는 그대로)
  const hasToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim() !== "";
  const notifyBot = hasToken ? getBot() : BOT_PROCESS_WITHOUT_TELEGRAM;

  // 알림 스케줄러 시작
  startBotScheduler(notifyBot);

  // pleiades M-6b-3 (pleiades#151): Discord 버튼 수신(gateway) — 봇 토큰·채널이 있을 때만
  const discordGateway = startDiscordInteractions(notifyBot);

  const telegram = startTelegramPolling({
    createBot: hasToken ? getBot : undefined,
    state: filePollingStateStore(POLLING_STATE_FILE),
    disabled: pollingDisabled(),
    // 401 로 텔레그램을 멈출 때 1회 — 텔레그램 토큰과 무관한 경로(Discord 라우트)로만 간다
    onFatal: async (reason) => {
      const r = await notifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(
        Route.ALLOWED,
        html(`⚠️ <b>fit 텔레그램 수신 중단</b>\n${reason} — 크론·Discord 는 계속 돈다.`),
        BOT_NOTIFY_CTX,
      );
      if (r.sent === 0) console.warn(`[bot] 텔레그램 중지 알림 미전송 (sent=0/total=${r.total} — Discord 라우트가 아니면 수신자 0)`);
    },
  });

  // Graceful shutdown — bot.stop()을 await해야 마지막 getUpdates offset이 확정되어
  // 재시작 시 중복 update 전달이 방지됨.
  const shutdown = async () => {
    console.log("[bot] 종료 중...");
    discordGateway?.stop();
    try {
      await telegram.stop();
    } catch (err) {
      console.error(`[bot] bot.stop() 에러: ${sanitizeError(err)}`);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// 최후 안전망: missed promise reject / sync throw가 PM2 crash로 떨어지지 않도록.
// 토큰 마스킹된 로그 남기고, 회복 가능성 차이로 unhandledRejection은 로깅만, uncaughtException은 종료.
process.on("unhandledRejection", (reason) => {
  console.error(`[bot] unhandledRejection: ${sanitizeError(reason)}`);
});
process.on("uncaughtException", (err) => {
  console.error(`[bot] uncaughtException: ${sanitizeError(err)}`);
  process.exit(1);
});

main().catch((error) => {
  console.error(`[bot] 시작 실패: ${sanitizeError(error)}`);
  process.exit(1);
});
