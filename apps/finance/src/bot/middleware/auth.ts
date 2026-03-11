import { Context, NextFunction } from 'grammy'

const allowedChatIds: Set<number> = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n))
)

export async function authMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  if (allowedChatIds.size === 0) {
    console.error('[bot] TELEGRAM_ALLOWED_CHAT_IDS 미설정')
    return
  }

  if (!allowedChatIds.has(chatId)) {
    try {
      await ctx.reply(`⛔ 접근 권한이 없습니다.\nChat ID: ${chatId}`)
    } catch {
      // 응답 실패 무시 — webhook 200 유지
    }
    return
  }

  await next()
}
