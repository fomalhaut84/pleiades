import { Bot, Context } from 'grammy'
import { sendBriefing } from '@/bot/notifications/briefing'

function getChatId(ctx: Context): number | null {
  return ctx.chat?.id ?? null
}

/**
 * /브리핑 — 수동 모닝 브리핑 트리거
 * /브리핑 한국 — 한국장 브리핑
 * /브리핑 미국 — 미국장 브리핑
 * /브리핑 (기본) — 현재 시간 기준 자동 판단
 */
async function handleBriefing(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const args = text.replace(/^(\/briefing(?:@\w+)?|브리핑)\s*/i, '').trim()

  const chatId = getChatId(ctx)
  if (!chatId) {
    await ctx.reply('⚠️ 채팅 정보를 확인할 수 없습니다.')
    return
  }

  await ctx.reply('📊 브리핑 생성 중... (1~2분 소요)')
  await ctx.replyWithChatAction('typing')

  let session: 'KR' | 'US'

  if (args === '한국' || args === 'kr' || args === 'KR') {
    session = 'KR'
  } else if (args === '미국' || args === 'us' || args === 'US') {
    session = 'US'
  } else {
    // 시간 기준 자동 판단: KST 6~15시 → 한국장, 그 외 → 미국장
    const now = new Date()
    const kstHour = (now.getUTCHours() + 9) % 24
    session = kstHour >= 6 && kstHour < 15 ? 'KR' : 'US'
  }

  // fire-and-forget (비동기, webhook 타임아웃 방지)
  sendBriefing([chatId], session).catch((e) =>
    console.error('[bot] 브리핑 발송 실패:', e)
  )
}

export function registerBriefingCommands(bot: Bot): void {
  bot.command('briefing', handleBriefing)
  bot.hears(/^브리핑(?:\s+.*)?$/, handleBriefing)
}
