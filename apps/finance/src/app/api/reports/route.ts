import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateReportPDF } from '@/lib/report/pdf-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/reports — 리포트 목록
 */
export async function GET() {
  try {
    const reports = await prisma.quarterlyReport.findMany({
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
    })
    return NextResponse.json({ reports })
  } catch (error) {
    console.error('GET /api/reports error:', error)
    return NextResponse.json({ error: '리포트 목록을 불러올 수 없습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/reports — 리포트 생성
 * body: { year: number, quarter: number }
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }

    const { year, quarter } = body as { year?: unknown; quarter?: unknown }

    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: '유효한 연도를 입력해주세요.' }, { status: 400 })
    }
    if (typeof quarter !== 'number' || ![1, 2, 3, 4].includes(quarter)) {
      return NextResponse.json({ error: '유효한 분기를 입력해주세요. (1~4)' }, { status: 400 })
    }

    const { pdfPath, reportId } = await generateReportPDF(year, quarter)
    return NextResponse.json({ reportId, pdfPath, message: '리포트 생성 완료' }, { status: 201 })
  } catch (error) {
    console.error('POST /api/reports error:', error)
    return NextResponse.json({ error: '리포트 생성에 실패했습니다.' }, { status: 500 })
  }
}
