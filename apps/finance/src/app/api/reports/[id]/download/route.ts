import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { promises as fs } from 'fs'
import path from 'path'
import { fail } from '@/lib/api-response'

const REPORTS_DIR = path.join(process.cwd(), 'reports')

/**
 * GET /api/reports/[id]/download — PDF 다운로드
 *
 * 성공 path 는 raw NextResponse(buffer) — Content-Disposition 헤더 필요.
 * 에러 path 만 envelope (`fail()`).
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const report = await prisma.quarterlyReport.findUnique({
      where: { id: params.id },
    })

    if (!report) {
      return fail('리포트를 찾을 수 없습니다.', 404)
    }

    if (!report.pdfPath) {
      return fail('PDF가 아직 생성되지 않았습니다.', 404)
    }

    // path traversal 방지: basename만 사용
    const safeName = path.basename(report.pdfPath)
    const filePath = path.join(REPORTS_DIR, safeName)

    try {
      const buffer = await fs.readFile(filePath)
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${report.pdfPath}"`,
        },
      })
    } catch {
      return fail('PDF 파일을 찾을 수 없습니다.', 404)
    }
  } catch (error) {
    console.error('GET /api/reports/[id]/download error:', error)
    return fail('다운로드에 실패했습니다.', 500)
  }
}
