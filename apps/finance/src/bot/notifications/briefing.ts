/**
 * 모닝 브리핑 생성 + 텔레그램 발송
 *
 * AI(askAdvisor)로 보유 종목 전략별 맞춤 브리핑 생성.
 * 한국장 08:30 KST / 미국장 23:00 KST 자동 발송.
 */

import { getBot } from '@/bot/index'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { splitMessage } from '@/bot/utils/formatter'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'

type MarketSession = 'KR' | 'US'

function buildBriefingPrompt(session: MarketSession): string {
  const sessionLabel = session === 'KR' ? '🇰🇷 한국장' : '🇺🇸 미국장'

  return [
    `${sessionLabel} 모닝 브리핑을 작성해줘.\n`,
    '다음 단계로 진행해:',
    '1. get_all_strategies로 전체 종목 전략 확인',
    '2. get_portfolio(전체)로 현재 보유 현황 확인',
    session === 'US'
      ? '3. 미국주(USD) 종목 중 스윙/모멘텀/단타 전략은 get_technical_analysis로 TA 확인'
      : '3. 한국주(KRW) 종목 중 스윙/모멘텀/단타 전략은 get_technical_analysis로 TA 확인',
    '4. firecrawl_search로 보유 종목 관련 최신 뉴스 검색',
    '',
    '브리핑 구성:',
    '- 시장 동향 요약 (주요 지수, 이슈)',
    '- 장기보유 종목: 간략 (뉴스 요약만, 특이사항 있을 때만)',
    '- 스윙/모멘텀 종목: TA 기반 매수/매도 타이밍 + 목표가/손절 대비',
    '- 감시 종목: 점검 기준 대비 현재 상태',
    '- 오늘 주목 이벤트 (실적, FOMC, 점검일 등)',
    '',
    '계좌별로 섹션 분리 (소담/다솜 장기 vs 세진 능동).',
  ].join('\n')
}

export async function sendBriefing(
  chatIds: number[],
  session: MarketSession
): Promise<void> {
  const bot = getBot()
  const prompt = buildBriefingPrompt(session)

  try {
    const result = await askAdvisor(prompt, {
      model: 'sonnet',
      timeout: 300_000,
      maxBudgetUsd: 1.0,
    })

    const html = markdownToTelegramHtml(result.response)

    for (const chatId of chatIds) {
      try {
        if (html.length <= 4096) {
          try {
            await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' })
          } catch {
            await bot.api.sendMessage(chatId, result.response)
          }
        } else {
          const chunks = splitMessage(result.response)
          for (const chunk of chunks) {
            await bot.api.sendMessage(chatId, chunk)
          }
        }
      } catch (error) {
        console.error(`[briefing] 발송 실패 (chatId: ${chatId}):`, error)
      }
    }

    const label = session === 'KR' ? '한국장' : '미국장'
    console.log(`[briefing] ${label} 모닝 브리핑 발송 완료`)
  } catch (error) {
    console.error('[briefing] 브리핑 생성 실패:', error)

    const label = session === 'KR' ? '🇰🇷 한국장' : '🇺🇸 미국장'
    const fallback = `📊 ${label} 모닝 브리핑 생성에 실패했습니다.\n/ai 에서 직접 질문해주세요.`
    for (const chatId of chatIds) {
      try {
        await bot.api.sendMessage(chatId, fallback)
      } catch {
        // 무시
      }
    }
  }
}
