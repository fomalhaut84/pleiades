import { Bot, Context } from 'grammy'
import {
  askAdvisor,
  AdvisorRateLimitError,
  AdvisorTimeoutError,
  AdvisorError,
} from '@/lib/ai/claude-advisor'
import { getRateLimitStatus } from '@/lib/ai/rate-limiter'
import { splitMessage } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'

const TYPING_INTERVAL_MS = 5000
const MIN_AI_TEXT_LENGTH = 3

/**
 * AI 질문 처리 (공통 핸들러)
 */
async function handleAiQuestion(ctx: Context, question: string): Promise<void> {
  await ctx.replyWithChatAction('typing')

  const typingInterval = setInterval(async () => {
    try {
      await ctx.replyWithChatAction('typing')
    } catch {
      // typing 전송 실패 무시
    }
  }, TYPING_INTERVAL_MS)

  try {
    const result = await askAdvisor(question)

    const chunks = splitMessage(result.response)
    for (const chunk of chunks) {
      await ctx.reply(chunk)
    }

    await ctx.reply(
      `💡 남은 AI 질문: ${result.rateLimitRemaining}회/일`
    )
  } catch (error) {
    if (error instanceof AdvisorRateLimitError) {
      await ctx.reply(
        `⚠️ ${error.message}\n내일 다시 이용해주세요.`
      )
      return
    }

    if (error instanceof AdvisorTimeoutError) {
      await ctx.reply(
        '⚠️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
      )
      return
    }

    if (error instanceof AdvisorError) {
      await ctx.reply(`⚠️ ${error.message}`)
      return
    }

    console.error('[bot] AI 질문 처리 실패:', error)
    await ctx.reply('⚠️ AI 질문 처리에 실패했습니다.')
  } finally {
    clearInterval(typingInterval)
  }
}

/**
 * /ai 커맨드 + AI fallback 등록
 */
export function registerAiCommands(bot: Bot): void {
  bot.command('ai', async (ctx) => {
    try {
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

      await handleAiQuestion(ctx, question)
    } catch (error) {
      console.error('[bot] /ai 커맨드 실패:', error)
      await ctx.reply('⚠️ AI 질문 처리에 실패했습니다.')
    }
  })
}

/**
 * AI 자연어 fallback
 * expense fallback이 next()로 통과시킨 메시지만 수신
 */
export function registerAiFallback(bot: Bot): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text

    // 슬래시 커맨드는 AI로 보내지 않음
    if (text.startsWith('/')) return

    if (text.trim().length < MIN_AI_TEXT_LENGTH) return

    if (!isAiQuestion(text)) return

    try {
      await handleAiQuestion(ctx, text)
    } catch (error) {
      console.error('[bot] AI fallback 실패:', error)
      await ctx.reply('⚠️ AI 질문 처리에 실패했습니다.')
    }
  })
}
