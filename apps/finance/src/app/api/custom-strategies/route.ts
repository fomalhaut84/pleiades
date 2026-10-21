import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'
import { parseStrategyText } from '@/lib/custom-strategy/parser'

export const dynamic = 'force-dynamic'

const MAX_ACTIVE_STRATEGIES = 50

/**
 * GET /api/custom-strategies — 등록된 커스텀 전략 목록.
 *
 * 정렬: 활성 우선 (isActive DESC) → 최신 (createdAt DESC).
 */
export async function GET() {
  try {
    const items = await prisma.customStrategy.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    })

    const serialized = items.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      ticker: s.ticker,
      conditions: s.conditions,
      logic: s.logic,
      frequency: s.frequency,
      isActive: s.isActive,
      lastTriggeredAt: s.lastTriggeredAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }))

    return ok(serialized)
  } catch (error) {
    console.error('[api/custom-strategies] GET 실패:', error)
    return fail('커스텀 전략 조회에 실패했습니다.', 500)
  }
}

/**
 * POST /api/custom-strategies — 자연어 → 파싱 → 저장 (즉시 활성).
 *
 * 봇 커맨드와 동일 파이프라인 (parseStrategyText + validateParsedStrategy) 사용.
 * 활성 상한 50개 초과 시 409 Conflict.
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }

    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return fail('전략 텍스트를 입력해주세요.', 400)
    if (text.length > 500) return fail('전략 텍스트는 500자 이하여야 합니다.', 400)

    const activeCount = await prisma.customStrategy.count({ where: { isActive: true } })
    if (activeCount >= MAX_ACTIVE_STRATEGIES) {
      return fail(`활성 전략은 최대 ${MAX_ACTIVE_STRATEGIES}개까지만 등록 가능합니다.`, 409)
    }

    let parsed
    try {
      parsed = await parseStrategyText(text)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '전략 파싱에 실패했습니다.'
      return fail(msg, 400)
    }

    const created = await prisma.customStrategy.create({
      data: {
        name: parsed.name.trim(),
        description: text,
        ticker: parsed.ticker,
        // Prisma JSON 타입 — 검증 이미 validateParsedStrategy 통과.
        conditions: parsed.conditions as unknown as Parameters<typeof prisma.customStrategy.create>[0]['data']['conditions'],
        logic: parsed.logic,
        frequency: parsed.frequency,
      },
    })

    return ok(
      {
        id: created.id,
        name: created.name,
        description: created.description,
        ticker: created.ticker,
        conditions: created.conditions,
        logic: created.logic,
        frequency: created.frequency,
        isActive: created.isActive,
        lastTriggeredAt: null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[api/custom-strategies] POST 실패:', error)
    return fail('전략 등록에 실패했습니다.', 500)
  }
}
