/**
 * PDF 생성 엔진
 *
 * react-pdf로 분기 리포트 PDF를 생성하고 파일로 저장.
 */

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { collectQuarterlyData } from './data-collector'
import { generateQuarterlyReview } from './ai-review'
import { QuarterlyReportPDF } from './pdf-template'

const REPORTS_DIR = path.join(process.cwd(), 'reports')

/**
 * 분기 리포트 PDF 생성 + 저장
 */
export async function generateReportPDF(
  year: number,
  quarter: number
): Promise<{ pdfPath: string; reportId: string }> {
  // 1. 데이터 수집
  const data = await collectQuarterlyData(year, quarter)

  // 2. AI 분석 코멘트
  const { id: reportId, aiComment } = await generateQuarterlyReview(year, quarter, data)

  // 3. PDF 생성
  // renderToBuffer expects a Document element directly
  const pdfBuffer = await renderToBuffer(
    React.createElement(QuarterlyReportPDF, { data, aiComment }) as React.ReactElement
  )

  // 4. 파일 저장
  await fs.mkdir(REPORTS_DIR, { recursive: true })
  const fileName = `myfinance-report-${year}-Q${quarter}.pdf`
  const pdfPath = path.join(REPORTS_DIR, fileName)
  await fs.writeFile(pdfPath, pdfBuffer)

  // 5. DB 업데이트
  await prisma.quarterlyReport.update({
    where: { id: reportId },
    data: { pdfPath: fileName },
  })

  console.log(`[report] PDF 생성 완료: ${fileName}`)
  return { pdfPath, reportId }
}
