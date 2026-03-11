import { Context, NextFunction } from 'grammy'

function getAllowedChatIds(): Set<number> {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? ''
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n))

  return new Set(ids)
}

export async function authMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const allowed = getAllowedChatIds()

  if (allowed.size === 0) {
    await ctx.reply('⚠️ TELEGRAM_ALLOWED_CHAT_IDS가 설정되지 않았습니다.')
    return
  }

  if (!allowed.has(chatId)) {
    await ctx.reply(
      `⛔ 접근 권한이 없습니다.\n\n이 봇은 등록된 사용자만 이용할 수 있습니다.\nChat ID: ${chatId}`
    )
    return
  }

  await next()
}
