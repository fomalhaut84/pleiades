import { Bot, webhookCallback } from 'grammy'
import { registerCommands } from './commands/start'
import { registerPortfolioCommands } from './commands/portfolio'
import { registerPriceCommands } from './commands/price'
import { registerTradeCommands } from './commands/trade'
import { registerExpenseCommands, registerExpenseFallback } from './commands/expense'
import { registerBudgetCommands } from './commands/budget'
import { authMiddleware } from './middleware/auth'

let bot: Bot | null = null

function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다')
  }

  const instance = new Bot(token)

  // Chat ID 화이트리스트 인증
  instance.use(authMiddleware)

  // 커맨드 등록
  registerCommands(instance)
  registerPortfolioCommands(instance)
  registerPriceCommands(instance)
  registerTradeCommands(instance)
  registerExpenseCommands(instance)
  registerBudgetCommands(instance)

  // 자연어 소비 입력은 반드시 마지막에 등록 (fallback)
  registerExpenseFallback(instance)

  return instance
}

export function getBot(): Bot {
  if (!bot) {
    bot = createBot()
  }
  return bot
}

export function createWebhookHandler() {
  return webhookCallback(getBot(), 'std/http')
}
