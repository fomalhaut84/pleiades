import { Bot, Context } from 'grammy'
import {
  askAdvisor,
  AdvisorTimeoutError,
  AdvisorError,
} from '@/lib/ai/claude-advisor'
import { splitMessage } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'

const TYPING_INTERVAL_MS = 5000
const MIN_AI_TEXT_LENGTH = 3

/**
 * AI 질문을 비동기로 처리 (fire-and-forget)
 */
function fireAiQuestion(ctx: Context, question: string): void {
  ctx.reply('🤔 생각 중...')
    .catch((e) => console.error('[bot] 생각 중 응답 실패:', e))

  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing')
      .catch(() => { /* 무시 */ })
  }, TYPING_INTERVAL_MS)

  askAdvisor(question)
    .then(async (result) => {
      const chunks = splitMessage(result.response)
      for (const chunk of chunks) {
        await ctx.reply(chunk)
      }
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
      await ctx.reply(
        '🤖 AI 어드바이저에게 질문하세요.\n\n' +
          '사용법: /ai 전체 포트폴리오 현황 분석해줘\n' +
          '또는 그냥 자연어로 질문하면 됩니다.'
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
