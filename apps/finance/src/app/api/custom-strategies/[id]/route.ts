import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail, noContent } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

const VALID_FREQUENCY = new Set(['once', 'daily', 'always'])
const VALID_LOGIC = new Set(['AND', 'OR'])

/**
 * PUT /api/custom-strategies/[id] — 부분 수정.
 *
 * 편집 가능 필드: name / isActive / frequency / logic.
 * 조건 자체 (conditions, ticker) 편집은 v1 지원 X — 삭제 후 재등록.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) return fail('전략 id가 필요합니다.', 400)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }

    const existing = await prisma.customStrategy.findUnique({ where: { id } })
    if (!existing) return fail('전략을 찾을 수 없습니다.', 404)

    const data: {
      name?: string
      isActive?: boolean
      frequency?: string
      logic?: string
    } = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return fail('전략 이름을 입력해주세요.', 400)
      if (name.length > 100) return fail('전략 이름은 100자 이하여야 합니다.', 400)
      data.name = name
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') return fail('isActive 는 boolean 이어야 합니다.', 400)
      data.isActive = body.isActive
    }

    if (body.frequency !== undefined) {
      if (typeof body.frequency !== 'string' || !VALID_FREQUENCY.has(body.frequency)) {
        return fail('frequency 는 once / daily / always 중 하나여야 합니다.', 400)
      }
      data.frequency = body.frequency
    }

    if (body.logic !== undefined) {
      if (typeof body.logic !== 'string' || !VALID_LOGIC.has(body.logic)) {
        return fail('logic 은 AND / OR 중 하나여야 합니다.', 400)
      }
      data.logic = body.logic
    }

    if (Object.keys(data).length === 0) {
      return fail('변경할 필드가 없습니다.', 400)
    }

    const updated = await prisma.customStrategy.update({
      where: { id },
      data,
    })

    return ok({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      ticker: updated.ticker,
      conditions: updated.conditions,
      logic: updated.logic,
      frequency: updated.frequency,
      isActive: updated.isActive,
      lastTriggeredAt: updated.lastTriggeredAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('[api/custom-strategies/id] PUT 실패:', error)
    return fail('전략 수정에 실패했습니다.', 500)
  }
}

/**
 * DELETE /api/custom-strategies/[id] — 삭제.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) return fail('전략 id가 필요합니다.', 400)

    const existing = await prisma.customStrategy.findUnique({ where: { id } })
    if (!existing) return fail('전략을 찾을 수 없습니다.', 404)

    await prisma.customStrategy.delete({ where: { id } })

    return noContent()
  } catch (error) {
    console.error('[api/custom-strategies/id] DELETE 실패:', error)
    return fail('전략 삭제에 실패했습니다.', 500)
  }
}
