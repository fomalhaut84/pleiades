/**
 * 분기 리포트 자동 생성 + 텔레그램 PDF 발송
 *
 * 1/4/7/10월 첫째 주 자동 실행.
 */

import { promises as fs } from 'fs'
import path from 'path'
import { InputFile } from 'grammy'
import { getBot } from '@/bot/index'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import { sendHtml, h } from '@/bot/utils/telegram'

const REPORTS_DIR = path.join(process.cwd(), 'reports')

/**
 * 직전 분기 계산
 */
function getPreviousQuarter(): { year: number; quarter: number } {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const month = kst.getMonth() + 1
  const year = kst.getFullYear()

  // 현재 월 기준 직전 분기
  if (month <= 3) return { year: year - 1, quarter: 4 }
  if (month <= 6) return { year, quarter: 1 }
  if (month <= 9) return { year, quarter: 2 }
  return { year, quarter: 3 }
}

export async function sendQuarterlyReport(chatIds: number[]): Promise<void> {
  const bot = getBot()
  const { year, quarter } = getPreviousQuarter()

  // 생성 시작 알림
  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId,
        `📊 ${h.b(`${year}년 ${quarter}분기 리포트`)} 생성 중... (2~3분 소요)`
      )
    } catch {
      // 무시
    }
  }

  try {
    const { pdfPath } = await generateReportPDF(year, quarter)
    const filePath = path.join(REPORTS_DIR, path.basename(pdfPath))
    const pdfBuffer = await fs.readFile(filePath)

    for (const chatId of chatIds) {
      try {
        await bot.api.sendDocument(chatId, new InputFile(pdfBuffer, path.basename(pdfPath)), {
          caption: `📊 ${year}년 ${quarter}분기 리포트`,
        })
      } catch (error) {
        console.error(`[report] PDF 발송 실패 (chatId: ${chatId}):`, error)
      }
    }

    console.log(`[report] ${year}년 ${quarter}분기 리포트 발송 완료`)
  } catch (error) {
    console.error('[report] 분기 리포트 생성 실패:', error)

    for (const chatId of chatIds) {
      try {
        await sendHtml(bot, chatId,
          `⚠️ ${year}년 ${quarter}분기 리포트 생성에 실패했습니다.\n웹에서 수동 생성해주세요.`
        )
      } catch {
        // 무시
      }
    }
  }
}
