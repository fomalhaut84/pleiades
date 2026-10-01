import { Bot, Context, InputFile } from 'grammy'
import { promises as fs } from 'fs'
import path from 'path'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import { replyHtml, h } from '../utils/telegram'

const REPORTS_DIR = path.join(process.cwd(), 'reports')

/**
 * /리포트 — 수동 분기 리포트 생성
 * /리포트 2026 1 — 특정 분기
 * /리포트 (기본) — 직전 분기
 */
async function handleReport(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const args = text.replace(/^(\/report(?:@\w+)?|리포트)\s*/i, '').trim()

  let year: number
  let quarter: number

  if (args) {
    const parts = args.split(/\s+/)
    year = parseInt(parts[0], 10)
    quarter = parseInt(parts[1], 10)

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      await ctx.reply('⚠️ 유효한 연도를 입력해주세요. (2020~2100)')
      return
    }
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      await ctx.reply('⚠️ 유효한 분기를 입력해주세요. (1~4)')
      return
    }
  } else {
    // 직전 분기 자동 판단
    const now = new Date()
    const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    const month = kst.getMonth() + 1
    year = kst.getFullYear()
    if (month <= 3) { year -= 1; quarter = 4 }
    else if (month <= 6) { quarter = 1 }
    else if (month <= 9) { quarter = 2 }
    else { quarter = 3 }
  }

  await replyHtml(ctx,
    `📊 ${h.b(`${year}년 ${quarter}분기 리포트`)} 생성 중... (2~3분 소요)`
  )

  // fire-and-forget
  generateReportPDF(year, quarter)
    .then(async ({ pdfPath }) => {
      const filePath = path.join(REPORTS_DIR, path.basename(pdfPath))
      const pdfBuffer = await fs.readFile(filePath)
      await ctx.replyWithDocument(new InputFile(pdfBuffer, path.basename(pdfPath)), {
        caption: `📊 ${year}년 ${quarter}분기 리포트`,
      })
    })
    .catch(async (error) => {
      console.error(`[bot] 리포트 생성 실패:`, error)
      await ctx.reply(`⚠️ 리포트 생성에 실패했습니다.`)
    })
}

export function registerReportCommands(bot: Bot): void {
  bot.command('report', handleReport)
  bot.hears(/^리포트(?:\s+.*)?$/, handleReport)
}
