import "dotenv/config";
import { startBotScheduler } from "./notifications/scheduler";
import { startDiscordInteractions } from "./notifications/discord-interactions";
import { BOT_PROCESS } from "./notifications/notifier";
import { sanitizeError } from "./utils/error";
import { sweepOrphanedJobs, startOrphanSweeper } from "@/lib/report-job";
import { ensureDefaults } from "@/lib/prompts/resolve";
import {
  sweepStalePhotoTempFiles,
  startPhotoTempSweeper,
} from "@/lib/nutrition/photo-temp-cleanup";

// pleiades 009 D-5 B2 (pleiades#504): 텔레그램 폴링·토큰을 지웠다 — 봇 프로세스 = 크론·스케줄러 + Discord gateway.

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

  // 알림 스케줄러 시작
  startBotScheduler(BOT_PROCESS);

  // pleiades M-6b-3 (pleiades#151): Discord 버튼·메시지 수신(gateway) — 봇 토큰·채널이 있을 때만
  const discordGateway = startDiscordInteractions(BOT_PROCESS);

  const shutdown = () => {
    console.log("[bot] 종료 중...");
    discordGateway?.stop();
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
