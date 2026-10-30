import type { Bot, Context } from 'grammy'
import { promises as fs } from 'fs'
import path from 'path'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import { h } from '../utils/telegram'
import { plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · D · H2): 분기 리포트.
 * 판단(decideReport)은 인자와 중립 응답 모델만 안다 — PDF 는 응답 모델의 파일 단계(`replyFile`)로 보낸다.
 * 특성 테스트 `__tests__/special-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

export const REPORT_RE = /^리포트(?:\s+.*)?$/

/** 텔레그램 원문 → 인자 — `/report[@bot]` · `리포트` 를 벗기고 trim(대소문자 무시). */
export function reportArgsFromText(text: string): string {
  return text.replace(/^(\/report(?:@\w+)?|리포트)\s*/i, '').trim()
}

const REPORTS_DIR = path.join(process.cwd(), 'reports')

/**
 * /리포트 — 수동 분기 리포트 생성
 * /리포트 2026 1 — 특정 분기
 * /리포트 (기본) — 직전 분기
 */
export async function decideReport(args: string, out: ReplyOutput): Promise<void> {

  let year: number
  let quarter: number

  if (args) {
    const parts = args.split(/\s+/)
    year = parseInt(parts[0], 10)
    quarter = parseInt(parts[1], 10)

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      await out.reply(plainReply('⚠️ 유효한 연도를 입력해주세요. (2020~2100)'))
      return
    }
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      await out.reply(plainReply('⚠️ 유효한 분기를 입력해주세요. (1~4)'))
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

  await out.replyLong(
    `📊 ${h.b(`${year}년 ${quarter}분기 리포트`)} 생성 중... (2~3분 소요)`
  )

  // fire-and-forget
  generateReportPDF(year, quarter)
    .then(async ({ pdfPath }) => {
      const filePath = path.join(REPORTS_DIR, path.basename(pdfPath))
      const pdfBuffer = await fs.readFile(filePath)
      await out.replyFile({
        name: path.basename(pdfPath),
        data: pdfBuffer,
        contentType: 'application/pdf',
        caption: `📊 ${year}년 ${quarter}분기 리포트`,
      })
    })
    .catch(async (error) => {
      console.error(`[bot] 리포트 생성 실패:`, error)
      await out.reply(plainReply(`⚠️ 리포트 생성에 실패했습니다.`))
    })
}

export function registerReportCommands(bot: Bot): void {
  // 등록에 try/catch 가 없다 — 판단 밖으로 던진 오류는 지금처럼 grammY bot.catch 로 간다
  const handle = (ctx: Context) => decideReport(reportArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))
  bot.command('report', handle)
  bot.hears(REPORT_RE, handle)
}
