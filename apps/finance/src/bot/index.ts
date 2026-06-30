import { Bot } from 'grammy'
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
import { registerWatchlistCommands } from './commands/watchlist'
import { registerAnalysisCommands } from './commands/analysis'
import { registerBriefingCommands } from './commands/briefing'
import { registerNetWorthCommands } from './commands/networth'
import { registerReportCommands } from './commands/report'
import { registerBacktestCommands } from './commands/backtest'
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
  registerWatchlistCommands(instance)
  registerAnalysisCommands(instance)
  registerBriefingCommands(instance)
  registerNetWorthCommands(instance)
  registerReportCommands(instance)
  registerBacktestCommands(instance)

  // fallback 순서: 소비 입력 → AI 질문 (질문형 키워드 포함 시)
  registerExpenseFallback(instance)
  registerAiFallback(instance)

  return instance
}

export function getBot(): Bot {
  if (!bot) {
    bot = createBot()
  }
  return bot
}

