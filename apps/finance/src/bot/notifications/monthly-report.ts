/**
 * 월간 리포트 자동 발송
 *
 * 매월 지정일에 askAdvisor로 전월 리포트를 생성하여 텔레그램 발송.
 */

import { getBot } from '@/bot/index'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { splitMessage } from '@/bot/utils/formatter'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'

function getPrevMonth(): { year: number; month: number } {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  let year = kst.getFullYear()
  let month = kst.getMonth() // 0-indexed, 현재 월
  if (month === 0) {
    year -= 1
    month = 12
  }
  return { year, month }
}

export async function sendMonthlyReport(chatIds: number[]): Promise<void> {
  const bot = getBot()
  const { year, month } = getPrevMonth()

  const prompt =
    `${year}년 ${month}월 월간 리포트를 작성해줘. 다음 항목을 포함해:\n` +
    `1. 전체 포트폴리오 현황 (계좌별 평가금, 수익률)\n` +
    `2. 지난 달 거래 내역 요약\n` +
    `3. 배당금 수령 내역\n` +
    `4. 소비/수입 요약\n` +
    `5. 증여세 한도 현황 (소담, 다솜)\n` +
    `6. 주요 관찰 사항 및 다음 달 체크포인트`

  try {
    const result = await askAdvisor(prompt, { model: 'sonnet', timeout: 300_000 })

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
        console.error(`[notification] 월간 리포트 발송 실패 (chatId: ${chatId}):`, error)
      }
    }

    console.log(`[notification] ${year}년 ${month}월 월간 리포트 발송 완료`)
  } catch (error) {
    console.error('[notification] 월간 리포트 생성 실패:', error)

    // AI 실패 시 간단 안내 메시지 발송
    const fallback = `📊 ${year}년 ${month}월 월간 리포트 생성에 실패했습니다.\n웹 AI 분석 페이지에서 직접 조회해주세요.`
    for (const chatId of chatIds) {
      try {
        await bot.api.sendMessage(chatId, fallback)
      } catch {
        // 무시
      }
    }
  }
}
