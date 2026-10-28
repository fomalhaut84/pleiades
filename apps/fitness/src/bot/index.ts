import { Bot } from "grammy";
import { Agent } from "https";
import { authMiddleware } from "./middleware/auth";
import { registerStartCommands } from "./commands/start";
import { registerTodayCommand } from "./commands/today";
import { registerRunCommand } from "./commands/run";
import { registerSleepCommand } from "./commands/sleep";
import { registerWeightCommand } from "./commands/weight";
import { registerSyncCommand } from "./commands/sync";
import { registerReportCommand } from "./commands/report";
import { registerAiCommands, TELEGRAM_AI_CHANNEL } from "./commands/ai";
import { registerFoodEditCallback } from "./commands/food-edit-callback";
import { registerFoodPhotoHandler } from "./commands/food-photo";
import { decideFreeText } from "./commands/free-text";
import { registerAutoAdjustCallback } from "./notifications/auto-adjust-callback";
import { telegramStateKeyOf } from "./core/state-key";
import { telegramOutput } from "./utils/telegram-reply";

// IPv6 라우트가 없는 환경(국내 ISP 등)에서 node-fetch의 IPv6 우선 시도가
// ETIMEDOUT으로 누적되는 것을 방지하기 위해 IPv4 강제. keepAlive로 cron 호출 시
// TCP/TLS 핸드셰이크 비용도 절감. 자세한 배경은 docs/specs/bot-telegram-ipv6-timeout-202606.md 참조.
// #309: food-photo download 도 같은 agent 재사용. export 로 노출.
export const telegramAgent = new Agent({ family: 4, keepAlive: true });

// grammy client.timeoutSeconds는 모든 API 호출(getUpdates 포함) 공통 abort timer.
// long-polling의 Telegram side hold 기본값(30s) 위에 충분한 마진 확보 필요.
// 60s = polling 30s + 네트워크 RTT/처리 여유 30s. cron sendMessage도 60s면 충분히 짧음.
const CLIENT_TIMEOUT_SECONDS = 60;

export function getBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN 환경변수가 필요합니다.");

  const bot = new Bot(token, {
    client: {
      baseFetchConfig: { agent: telegramAgent },
      timeoutSeconds: CLIENT_TIMEOUT_SECONDS,
    },
  });

  // 미들웨어
  bot.use(authMiddleware);

  // 커맨드 등록
  registerStartCommands(bot);
  registerTodayCommand(bot);
  registerRunCommand(bot);
  registerSleepCommand(bot);
  registerWeightCommand(bot);
  registerSyncCommand(bot);
  registerReportCommand(bot);
  registerAiCommands(bot);

  // M13 Phase 2 (#249): auto-adjust inline keyboard callback (Accept/Reject/Snooze).
  registerAutoAdjustCallback(bot);
  // #292 (M14 Phase 2 #1): food kcal 인라인 편집 callback (수정/삭제).
  registerFoodEditCallback(bot);
  // #309 (M14 Phase 2 #5): 음식 사진 → Vision 자동 로그.
  registerFoodPhotoHandler(bot);

  // 자연어 fallback — 4 분기(/food_kcal → 편집 대기 → 식단 → AI) 판단은 commands/free-text.ts (pleiades#364).
  // 상태 키 `telegram:<chatId>` — chat id 가 숫자가 아니면 편집 대기 분기를 건너뛴다(옛 가드와 같다).
  // bot = 이 폴링 인스턴스 — 인증 만료 감지 시 관리자 alert (#253).
  bot.on("message:text", async (ctx) => {
    await decideFreeText(ctx.message.text.trim(), telegramOutput(ctx), {
      stateKey: telegramStateKeyOf(ctx.chat),
      aiChannel: TELEGRAM_AI_CHANNEL,
      bot,
    });
  });

  return bot;
}
