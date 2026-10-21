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
import { sanitizeError } from '@/bot/utils/error'
import { h } from '@/bot/utils/telegram'
import { fileRecipientCount, notifierFor, Route, htmlContent, sendFileIfDiscord, telegramRecipients } from './notifier'

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

const REPORT_CTX = { label: 'report' } as const

export async function sendQuarterlyReport(): Promise<void> {
  // notifier 를 PDF 생성(2~3분) 동안 쥐지 않는다 — 그 사이 루트 .env 로 채널을 바꾸면 캐시된 transport 와 대상이 어긋난다
  // (PR #144 Codex P2). 보낼 때마다 새로 만든다.
  // PDF 를 받을 곳이 없으면 생성(AI·PDF·DB·파일)부터 하지 않는다 (PR #148 Codex P2)
  if (fileRecipientCount(Route.ALLOWED) === 0) {
    console.warn('[report] 분기 리포트 수신자 0 (채널 선택 기준) — 생성 건너뜀')
    return
  }
  const bot = getBot()
  const { year, quarter } = getPreviousQuarter()

  // 생성 시작 알림
  await notifierFor(bot).notify(
    Route.ALLOWED,
    htmlContent(`📊 ${h.b(`${year}년 ${quarter}분기 리포트`)} 생성 중... (2~3분 소요)`),
    REPORT_CTX,
  )

  try {
    const { pdfPath } = await generateReportPDF(year, quarter)
    const filePath = path.join(REPORTS_DIR, path.basename(pdfPath))
    const pdfBuffer = await fs.readFile(filePath)

    const fileName = path.basename(pdfPath)
    const caption = `📊 ${year}년 ${quarter}분기 리포트`

    // M-6b-1 (#147): ALLOWED 가 Discord 면 #finance 웹훅에 첨부(003 §7-4 — 포트 밖 헬퍼). 아니면 아래 텔레그램(구 동작).
    let discord: Awaited<ReturnType<typeof sendFileIfDiscord>> | 'failed' = 'not-discord'
    try {
      discord = await sendFileIfDiscord(
        Route.ALLOWED,
        { name: fileName, data: new Uint8Array(pdfBuffer), contentType: 'application/pdf' },
        caption,
      )
      if (discord === 'no-webhook') console.warn('[report] Discord 선택 · 웹훅 없음 — PDF 수신자 0')
    } catch (error) {
      discord = 'failed' // 텔레그램으로 우회하지 않는다(채널 선택 존중) — 같은 채널에 텍스트로 알린다
      console.error(`[report] PDF Discord 발송 실패: ${sanitizeError(error)}`)
      await notifierFor(bot).notify(
        Route.ALLOWED,
        htmlContent(`⚠️ ${year}년 ${quarter}분기 리포트 PDF 첨부에 실패했습니다.\n웹 리포트 페이지에서 받아주세요.`),
        REPORT_CTX,
      )
    }

    // 003 §7-4: 텔레그램 API 직접 — Discord 를 고르지 않았을 때만.
    for (const chatId of discord === 'not-discord' ? telegramRecipients(Route.ALLOWED) : []) {
      try {
        await bot.api.sendDocument(chatId, new InputFile(pdfBuffer, fileName), { caption })
      } catch (error) {
        console.error(`[report] PDF 발송 실패 (chatId: ${chatId}):`, error)
      }
    }

    if (discord !== 'failed') console.log(`[report] ${year}년 ${quarter}분기 리포트 발송 완료`)
  } catch (error) {
    console.error('[report] 분기 리포트 생성 실패:', error)

    await notifierFor(bot).notify(
      Route.ALLOWED,
      htmlContent(`⚠️ ${year}년 ${quarter}분기 리포트 생성에 실패했습니다.\n웹에서 수동 생성해주세요.`),
      REPORT_CTX,
    )
  }
}
