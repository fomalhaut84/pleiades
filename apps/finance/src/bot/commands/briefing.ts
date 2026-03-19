import { Bot, Context } from 'grammy'
import { sendBriefing } from '@/bot/notifications/briefing'
import { askAdvisor, AdvisorError } from '@/lib/ai/claude-advisor'
import { splitMessage } from '@/bot/utils/formatter'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'

const TYPING_INTERVAL_MS = 5000

const SESSION_KEYWORDS = new Set(['한국', '미국', 'kr', 'KR', 'us', 'US'])

function getChatId(ctx: Context): number | null {
  return ctx.chat?.id ?? null
}

/**
 * /브리핑 — 수동 모닝 브리핑 트리거
 * /브리핑 한국 — 한국장 브리핑
 * /브리핑 미국 — 미국장 브리핑
 * /브리핑 NVDA — 종목 심층 분석
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

  // 종목 심층 분석: 한국/미국 키워드가 아닌 인자 → 종목으로 판단
  if (args && !SESSION_KEYWORDS.has(args)) {
    await ctx.reply(`🔍 ${args.toUpperCase()} 심층 분석 중... (1~2분 소요)`)
    fireTickerAnalysis(ctx, chatId, args.toUpperCase())
    return
  }

  // 전체 모닝 브리핑
  await ctx.reply('📊 브리핑 생성 중... (1~2분 소요)')

  let session: 'KR' | 'US'
  if (args === '한국' || args === 'kr' || args === 'KR') {
    session = 'KR'
  } else if (args === '미국' || args === 'us' || args === 'US') {
    session = 'US'
  } else {
    const now = new Date()
    const kstHour = (now.getUTCHours() + 9) % 24
    session = kstHour >= 6 && kstHour < 15 ? 'KR' : 'US'
  }

  sendBriefing([chatId], session).catch((e) =>
    console.error('[bot] 브리핑 발송 실패:', e)
  )
}

/**
 * 종목 심층 분석 (fire-and-forget)
 */
function fireTickerAnalysis(ctx: Context, chatId: number, ticker: string): void {
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => { /* 무시 */ })
  }, TYPING_INTERVAL_MS)

  const prompt = [
    `${ticker} 종목 심층 분석을 해줘.\n`,
    '다음 단계로 진행해:',
    `1. get_holding_strategy(${ticker})로 전략/목표가/손절가 확인`,
    `2. get_technical_analysis(${ticker})로 TA 리포트 확인`,
    `3. get_portfolio(전체)에서 ${ticker} 보유 현황 확인`,
    `4. firecrawl_search로 "${ticker} 최신 뉴스" 검색`,
    '',
    '분석 내용:',
    '- 현재 보유 현황 (수량, 평단, 수익률)',
    '- 전략 설정 (목표가/손절 대비 현재 위치)',
    '- 기술적 분석 요약 (RSI, MACD, BB, SMA, 지지/저항, 종합 시그널)',
    '- 최신 뉴스/이슈 요약 (2~3건)',
    '- 전략별 맞춤 조언 (장기보유→간략, 스윙→타이밍, 감시→점검기준)',
    '- 종합 판단 + 주의사항',
  ].join('\n')

  askAdvisor(prompt, { model: 'sonnet', timeout: 300_000, maxBudgetUsd: 1.0 })
    .then(async (result) => {
      const html = markdownToTelegramHtml(result.response)
      if (html.length <= 4096) {
        try {
          await ctx.reply(html, { parse_mode: 'HTML' })
        } catch {
          await ctx.reply(result.response)
        }
      } else {
        const chunks = splitMessage(result.response)
        for (const chunk of chunks) {
          await ctx.reply(chunk)
        }
      }
    })
    .catch(async (error) => {
      if (error instanceof AdvisorError) {
        await ctx.reply(`⚠️ ${error.message}`)
      } else {
        console.error(`[bot] ${ticker} 심층 분석 실패:`, error)
        await ctx.reply(`⚠️ ${ticker} 분석에 실패했습니다. 잠시 후 다시 시도해주세요.`)
      }
    })
    .catch((e) => console.error('[bot] 분석 응답 전송 실패:', e))
    .finally(() => clearInterval(typingInterval))
}

export function registerBriefingCommands(bot: Bot): void {
  bot.command('briefing', handleBriefing)
  bot.hears(/^브리핑(?:\s+.*)?$/, handleBriefing)
}
