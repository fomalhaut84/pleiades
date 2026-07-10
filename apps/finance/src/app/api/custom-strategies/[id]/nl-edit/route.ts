/**
 * Phase 35-B (#434) — 자연어 전략 편집 미리보기.
 * POST /api/custom-strategies/[id]/nl-edit
 *
 * 입력: { instruction: string }
 * 출력: { before, after, diff }  — **저장 X**. 사용자 승인 후 PUT 로 저장.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'
import { editStrategyByNL } from '@/lib/custom-strategy/parser'
import { computeStrategyDiff } from '@/lib/custom-strategy/diff'
import type { Condition, LogicOp, Frequency, ParsedStrategy } from '@/lib/custom-strategy/types'
import { validateCondition } from '@/lib/custom-strategy/types'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) return fail('전략 id가 필요합니다.', 400)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }

    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
    if (!instruction) return fail('편집 지시를 입력해주세요.', 400)

    const existing = await prisma.customStrategy.findUnique({ where: { id } })
    if (!existing) return fail('전략을 찾을 수 없습니다.', 404)

    const rawConds = Array.isArray(existing.conditions) ? (existing.conditions as unknown[]) : []
    const before: ParsedStrategy = {
      name: existing.name,
      ticker: existing.ticker,
      conditions: rawConds.filter(validateCondition) as Condition[],
      logic: (existing.logic === 'OR' ? 'OR' : 'AND') as LogicOp,
      frequency: (['once', 'daily', 'always'].includes(existing.frequency)
        ? existing.frequency
        : 'daily') as Frequency,
    }

    let after: ParsedStrategy
    try {
      after = await editStrategyByNL(before, instruction)
    } catch (error) {
      return fail(error instanceof Error ? error.message : '편집 실패', 400)
    }

    // self-review P1 (#434): ticker 변경은 지원 밖 (PUT 도 ticker 무시).
    // AI 가 지시로 ticker 를 바꿔 돌려주더라도 여기서 명시 거부 → 조건이 새 티커에
    // 맞춰 재조정된 상태로 원래 티커에 저장돼 잘못된 트리거 되는 상황 방지.
    if (after.ticker !== before.ticker) {
      return fail(
        `티커 변경 (${before.ticker} → ${after.ticker}) 은 지원되지 않습니다. 다른 종목으로 바꾸려면 이 전략을 삭제 후 재등록해주세요.`,
        400,
      )
    }

    const diff = computeStrategyDiff(before, after)
    return ok({ before, after, diff })
  } catch (error) {
    console.error('[api/custom-strategies/id/nl-edit] POST 실패:', error)
    return fail('편집 미리보기에 실패했습니다.', 500)
  }
}
