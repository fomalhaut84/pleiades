import { Bot, Context } from 'grammy'
import {
  askAdvisor,
  AdvisorTimeoutError,
  AdvisorError,
} from '@/lib/ai/claude-advisor'
import { getRateLimitStatus, checkAndIncrement } from '@/lib/ai/rate-limiter'
import { splitMessage } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'

const TYPING_INTERVAL_MS = 5000
const MIN_AI_TEXT_LENGTH = 3

/**
 * AI 질문을 비동기로 처리 (fire-and-forget)
 *
 * claude -p subprocess는 수십 초~2분 소요되므로,
 * webhook 핸들러에서 await하면 Telegram이 타임아웃 → ECONNRESET.
 * 대신 rate limit만 선체크 후 즉시 "생각 중" 응답을 보내고,
 * 백그라운드에서 AI 호출 + 결과 전송.
 */
function fireAiQuestion(ctx: Context, question: string): void {
  // rate limit 선체크 (동기)
  const rateLimit = checkAndIncrement()
  if (!rateLimit.allowed) {
    ctx.reply(`⚠️ 일일 AI 호출 한도에 도달했습니다. (리셋: ${rateLimit.resetDate})\n내일 다시 이용해주세요.`)
      .catch((e) => console.error('[bot] rate limit 응답 실패:', e))
    return
  }

  // 즉시 "생각 중" 응답
  ctx.reply('🤔 생각 중...')
    .catch((e) => console.error('[bot] 생각 중 응답 실패:', e))

  // typing indicator
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing')
      .catch(() => { /* 무시 */ })
  }, TYPING_INTERVAL_MS)

  // 백그라운드 AI 호출 (rate limit은 이미 증가했으므로 skipRateLimit)
  askAdvisor(question, { skipRateLimit: true })
    .then(async (result) => {
      const chunks = splitMessage(result.response)
      for (const chunk of chunks) {
        await ctx.reply(chunk)
      }
      await ctx.reply(`💡 남은 AI 질문: ${rateLimit.remaining}회/일`)
    })
    .catch(async (error) => {
      if (error instanceof AdvisorTimeoutError) {
        await ctx.reply('⚠️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
      } else if (error instanceof AdvisorError) {
        await ctx.reply(`⚠️ ${error.message}`)
      } else {
        console.error('[bot] AI 질문 처리 실패:', error)
        await ctx.reply('⚠️ AI 질문 처리에 실패했습니다.')
      }
    })
    .catch((e) => console.error('[bot] AI 응답 전송 실패:', e))
    .finally(() => clearInterval(typingInterval))
}

/**
 * /ai 커맨드 등록
 */
export function registerAiCommands(bot: Bot): void {
  bot.command('ai', async (ctx) => {
    const question = ctx.match?.toString().trim()

    if (!question) {
      const status = getRateLimitStatus()
      await ctx.reply(
        '🤖 AI 어드바이저에게 질문하세요.\n\n' +
          '사용법: /ai 전체 포트폴리오 현황 분석해줘\n' +
          '또는 그냥 자연어로 질문하면 됩니다.\n\n' +
          `남은 질문: ${status.remaining}회/일`
      )
      return
    }

    fireAiQuestion(ctx, question)
  })
}

/**
 * AI 자연어 fallback
 * expense fallback이 next()로 통과시킨 메시지만 수신
 */
export function registerAiFallback(bot: Bot): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text

    if (text.startsWith('/')) return
    if (text.trim().length < MIN_AI_TEXT_LENGTH) return
    if (!isAiQuestion(text)) return

    fireAiQuestion(ctx, text)
  })
}
