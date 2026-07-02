import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'
import {
  categoryOf,
  inputTypeOf,
  ALERT_KEY_DESCRIPTION,
} from '@/lib/alert-config/categories'

export const dynamic = 'force-dynamic'

/**
 * GET /api/alerts/config — 전체 알림 설정 조회.
 * 응답에 category / inputType / description 을 첨부 (Phase 31-B).
 */
export async function GET() {
  try {
    const configs = await prisma.alertConfig.findMany({
      orderBy: { key: 'asc' },
    })
    const enriched = configs.map((c) => ({
      ...c,
      category: categoryOf(c.key),
      inputType: inputTypeOf(c.key, c.value),
      description: ALERT_KEY_DESCRIPTION[c.key] ?? null,
    }))
    return ok(enriched)
  } catch (error) {
    console.error('GET /api/alerts/config error:', error)
    return fail('알림 설정을 불러올 수 없습니다.', 500)
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
      return fail('잘못된 요청 형식입니다.', 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    const { key, value } = body as { key?: unknown; value?: unknown }

    if (!key || typeof key !== 'string') {
      return fail('설정 키를 지정해주세요.', 400)
    }
    if (value === undefined || value === null || String(value).trim() === '') {
      return fail('값을 입력해주세요.', 400)
    }

    const existing = await prisma.alertConfig.findUnique({
      where: { key },
    })
    if (!existing) {
      return fail(`존재하지 않는 설정입니다: ${key}`, 404)
    }

    const updated = await prisma.alertConfig.update({
      where: { key },
      data: { value: String(value) },
    })

    return ok(updated)
  } catch (error) {
    console.error('PUT /api/alerts/config error:', error)
    return fail('알림 설정 변경에 실패했습니다.', 500)
  }
}
