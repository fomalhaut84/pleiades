import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SINGLETON_ID = 'whooing-config'

/**
 * GET /api/settings/whooing — 후잉 설정 조회
 */
export async function GET() {
  try {
    const config = await prisma.whooingConfig.findUnique({ where: { id: SINGLETON_ID } })
    return NextResponse.json({
      webhookUrl: config?.webhookUrl ?? null,
      isActive: config?.isActive ?? false,
      defaultRight: config?.defaultRight ?? null,
    })
  } catch (error) {
    console.error('[api/settings/whooing] GET 실패:', error)
    return NextResponse.json({ error: '후잉 설정 조회에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * PUT /api/settings/whooing — 후잉 설정 변경 (싱글톤 upsert)
 */
export async function PUT(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 }) }

    const existing = await prisma.whooingConfig.findUnique({ where: { id: SINGLETON_ID } })

    const data = {
      webhookUrl: typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() || null : existing?.webhookUrl ?? null,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : existing?.isActive ?? false,
      defaultRight: typeof body.defaultRight === 'string' ? body.defaultRight.trim() || null : existing?.defaultRight ?? null,
    }

    const config = await prisma.whooingConfig.upsert({
      where: { id: SINGLETON_ID },
      update: data,
      create: { id: SINGLETON_ID, ...data },
    })

    return NextResponse.json({
      webhookUrl: config.webhookUrl,
      isActive: config.isActive,
      defaultRight: config.defaultRight,
    })
  } catch (error) {
    console.error('[api/settings/whooing] PUT 실패:', error)
    return NextResponse.json({ error: '후잉 설정 저장에 실패했습니다.' }, { status: 500 })
  }
}
