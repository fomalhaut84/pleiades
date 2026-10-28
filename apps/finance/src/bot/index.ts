import { Bot } from 'grammy'
import { BOT_PROCESS_WITHOUT_TELEGRAM, telegramTokenSet, type NotifyBot } from './notifications/notifier'
import { Agent } from 'https'
import { registerCommands } from './commands/start'
import { registerPortfolioCommands } from './commands/portfolio'
import { registerPriceCommands } from './commands/price'
import { registerTradeCommands } from './commands/trade'
import { registerExpenseCommands, registerExpenseFallback } from './commands/expense'
import { registerBudgetCommands } from './commands/budget'
import { registerAiCommands, registerAiFallback } from './commands/ai'
import { registerAlertCommands } from './commands/alert'
import { registerStrategyCommands } from './commands/strategy'
import { registerCustomStrategyCommands } from './commands/custom-strategy'
import { registerWatchlistCommands } from './commands/watchlist'
import { registerAnalysisCommands } from './commands/analysis'
import { registerBriefingCommands } from './commands/briefing'
import { registerNetWorthCommands } from './commands/networth'
import { registerReportCommands } from './commands/report'
import { registerBacktestCommands } from './commands/backtest'
import { registerVestConfirmHandler } from './commands/vest-confirm'
import { authMiddleware } from './middleware/auth'

// IPv6 라우트가 없는 환경(운영 서버 등)에서 node-fetch의 IPv6 우선 시도가
// ETIMEDOUT으로 누적되는 것을 방지하기 위해 IPv4 강제. keepAlive로 cron 호출 시
// TCP/TLS 핸드셰이크 비용도 절감. docs/specs/354-bot-ipv6-token-fix.md 참조.
const telegramAgent = new Agent({ family: 4, keepAlive: true })

// grammy client.timeoutSeconds는 모든 API 호출(getUpdates 포함) 공통 abort timer.
// long-polling Telegram side hold 기본값(30s) 위에 마진 확보 (60s = polling 30s + RTT 30s).
const CLIENT_TIMEOUT_SECONDS = 60

let bot: Bot | null = null

function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다')
  }

  const instance = new Bot(token, {
    client: {
      baseFetchConfig: { agent: telegramAgent },
      timeoutSeconds: CLIENT_TIMEOUT_SECONDS,
    },
  })

  // Chat ID 화이트리스트 인증
  instance.use(authMiddleware)

  // 커맨드 등록
  registerCommands(instance)
  registerPortfolioCommands(instance)
  registerPriceCommands(instance)
  registerTradeCommands(instance)
  registerExpenseCommands(instance)
  registerBudgetCommands(instance)
  registerAiCommands(instance)
  registerAlertCommands(instance)
  registerStrategyCommands(instance)
  registerCustomStrategyCommands(instance)
  registerWatchlistCommands(instance)
  registerAnalysisCommands(instance)
  registerBriefingCommands(instance)
  registerNetWorthCommands(instance)
  registerReportCommands(instance)
  registerBacktestCommands(instance)
  registerVestConfirmHandler(instance)

  // fallback 순서: 소비 입력 → AI 질문 (질문형 키워드 포함 시)
  registerExpenseFallback(instance)
  registerAiFallback(instance)

  return instance
}

/**
 * 봇 싱글턴. `fresh` 면 새로 만들어 바꾼다 — 텔레그램 폴링이 실패 뒤 다시 시작할 때만 쓴다
 * (grammY 는 start 뒤 미들웨어 등록을 막는다 · 009 D-1 · pleiades#349).
 */
export function getBot(opts?: { fresh?: boolean }): Bot {
  if (!bot || opts?.fresh === true) {
    bot = createBot()
  }
  return bot
}

/**
 * 아웃바운드 핸들 — 텔레그램 토큰이 있으면 봇 인스턴스, 없으면 텔레그램 없는 핸들(Discord 라우트만 · 009 D-1 · pleiades#349).
 * 알림 경로는 `getBot()` 대신 이것을 쓴다 — 토큰이 없어도 throw 하지 않는다(웹 3경로 포함).
 */
export function notifyBot(): NotifyBot {
  return telegramTokenSet() ? getBot() : BOT_PROCESS_WITHOUT_TELEGRAM
}

