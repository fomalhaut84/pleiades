import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/alerts/config — 전체 알림 설정 조회
 */
export async function GET() {
  try {
    const configs = await prisma.alertConfig.findMany({
      orderBy: { key: 'asc' },
    })
    return NextResponse.json({ configs })
  } catch (error) {
    console.error('GET /api/alerts/config error:', error)
    return NextResponse.json(
      { error: '알림 설정을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/alerts/config — 알림 설정 변경
 * body: { key: string, value: string }
 */
export async function PUT(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      )
    }

    const { key, value } = body as { key?: unknown; value?: unknown }

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: '설정 키를 지정해주세요.' },
        { status: 400 }
      )
    }
    if (value === undefined || value === null || String(value).trim() === '') {
      return NextResponse.json(
        { error: '값을 입력해주세요.' },
        { status: 400 }
      )
    }

    const existing = await prisma.alertConfig.findUnique({
      where: { key },
    })
    if (!existing) {
      return NextResponse.json(
        { error: `존재하지 않는 설정입니다: ${key}` },
        { status: 404 }
      )
    }

    const updated = await prisma.alertConfig.update({
      where: { key },
      data: { value: String(value) },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PUT /api/alerts/config error:', error)
    return NextResponse.json(
      { error: '알림 설정 변경에 실패했습니다.' },
      { status: 500 }
    )
  }
}
