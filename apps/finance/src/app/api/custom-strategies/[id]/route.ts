import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, fail, noContent } from '@/lib/api-response'
import { validateCondition } from '@/lib/custom-strategy/types'
import { conditionsEqual } from '@/lib/custom-strategy/diff'
import type { Condition } from '@/lib/custom-strategy/types'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

const VALID_FREQUENCY = new Set(['once', 'daily', 'always'])
const VALID_LOGIC = new Set(['AND', 'OR'])

/**
 * PUT /api/custom-strategies/[id] — 부분 수정.
 *
 * 편집 가능 필드: name / isActive / frequency / logic / conditions.
 * conditions 편집은 Phase 35-B (#434) 부터 지원 — 자연어 편집 (POST .../nl-edit)
 * 미리보기 결과를 사용자가 승인한 뒤 이 필드로 저장.
 * ticker 편집은 여전히 지원 X (다른 종목으로 바꾸려면 삭제 후 재등록).
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

    const data: Prisma.CustomStrategyUpdateInput = {}

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

    if (body.conditions !== undefined) {
      if (!Array.isArray(body.conditions) || body.conditions.length === 0) {
        return fail('conditions 는 최소 1개 이상의 조건 배열이어야 합니다.', 400)
      }
      if (!body.conditions.every(validateCondition)) {
        return fail('conditions 에 유효하지 않은 항목이 있습니다.', 400)
      }
      // Codex #440 재리뷰 P2: 실제로 변경됐을 때만 conditions/lastTriggeredAt 갱신.
      // 순서 무관 비교 (`conditionsEqual`): `JSON.stringify` 는 필드 순서에 민감해서
      // `{type, operator, value}` vs `{value, operator, type}` 를 다르다고 오판 →
      // 무변경인데 lastTriggeredAt 리셋 → `once` 재무장 / `daily` 중복 발동.
      const existingConds = (Array.isArray(existing.conditions)
        ? (existing.conditions as unknown[])
        : []
      ).filter(validateCondition) as Condition[]
      const newConds = body.conditions as unknown as Condition[]
      if (!conditionsEqual(existingConds, newConds)) {
        data.conditions = body.conditions as unknown as Prisma.InputJsonValue
        // 조건이 실제 바뀔 때만 발동 이력 리셋 → fresh signal 로 평가.
        data.lastTriggeredAt = null
      }
      // 같으면 아무것도 안 함 → PUT 이 name/logic 등 다른 필드만 수정.
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
