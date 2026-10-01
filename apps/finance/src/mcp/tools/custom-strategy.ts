/**
 * MCP tools — Phase 29-E 커스텀 전략 CRUD.
 *
 * 사용자 자연어 → parseStrategyText → CustomStrategy 저장.
 * cron 이 evaluator 로 순수 코드 평가 → 조건 만족 시 텔레그램 알림.
 */

import { prisma } from '@/lib/prisma'
import { parseStrategyText } from '@/lib/custom-strategy/parser'
import { conditionToString, type Condition, type Frequency, type LogicOp } from '@/lib/custom-strategy/types'
import { toolResult, toolError, ToolInputError } from '../utils'

const MAX_STRATEGIES = 50

function formatStrategyLine(s: {
  id: string
  name: string
  ticker: string
  conditions: unknown
  logic: string
  frequency: string
  isActive: boolean
  lastTriggeredAt: Date | null
  description: string | null
}): string {
  const conds = Array.isArray(s.conditions)
    ? (s.conditions as Condition[]).map(conditionToString).join(` ${s.logic} `)
    : '(파싱 오류)'
  const status = s.isActive ? '🟢' : '⚫'
  const last = s.lastTriggeredAt ? ` | 최근 ${s.lastTriggeredAt.toISOString().slice(0, 10)}` : ''
  return `${status} [${s.id.slice(-6)}] ${s.name} (${s.ticker})\n   ${conds} | ${s.frequency}${last}`
}

/**
 * create_custom_strategy: 자연어 → 파싱 → 저장
 */
export async function createCustomStrategy(args: { text: string }) {
  try {
    const text = args?.text?.trim()
    if (!text) throw new ToolInputError('전략 텍스트가 필요합니다.')

    const count = await prisma.customStrategy.count({ where: { isActive: true } })
    if (count >= MAX_STRATEGIES) {
      throw new ToolInputError(`활성 전략은 최대 ${MAX_STRATEGIES}개까지만 등록 가능합니다.`)
    }

    const parsed = await parseStrategyText(text)

    const created = await prisma.customStrategy.create({
      data: {
        name: parsed.name.trim(),
        description: text,
        ticker: parsed.ticker,
        conditions: parsed.conditions as unknown as Parameters<typeof prisma.customStrategy.create>[0]['data']['conditions'],
        logic: parsed.logic,
        frequency: parsed.frequency,
      },
    })

    const condSummary = parsed.conditions.map(conditionToString).join(` ${parsed.logic} `)
    return toolResult(
      [
        `✅ 커스텀 전략 등록: ${created.name} (${created.ticker})`,
        `조건: ${condSummary}`,
        `빈도: ${created.frequency}`,
        `id: ${created.id}`,
      ].join('\n')
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * list_custom_strategies: 전체 전략 조회
 */
export async function listCustomStrategies(args?: { ticker?: string; activeOnly?: boolean }) {
  try {
    const where: { ticker?: string; isActive?: boolean } = {}
    if (args?.ticker) where.ticker = args.ticker.trim().toUpperCase()
    if (args?.activeOnly !== false) where.isActive = true

    const items = await prisma.customStrategy.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    })

    if (items.length === 0) {
      return toolResult('등록된 커스텀 전략이 없습니다.')
    }

    const lines = ['## 커스텀 전략 목록', '', ...items.map(formatStrategyLine)]
    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * update_custom_strategy: 활성 여부 / 빈도 등 부분 업데이트.
 * 조건을 바꾸려면 삭제 후 재등록 권장 (자연어 재파싱).
 */
export async function updateCustomStrategy(args: {
  id: string
  isActive?: boolean
  frequency?: Frequency
  logic?: LogicOp
  name?: string
}) {
  try {
    const id = args?.id?.trim()
    if (!id) throw new ToolInputError('전략 id가 필요합니다.')

    const existing = await prisma.customStrategy.findUnique({ where: { id } })
    if (!existing) throw new ToolInputError(`전략을 찾을 수 없습니다: ${id}`)

    const data: {
      isActive?: boolean
      frequency?: string
      logic?: string
      name?: string
    } = {}
    if (args.isActive !== undefined) data.isActive = args.isActive
    if (args.frequency !== undefined) {
      if (!['once', 'daily', 'always'].includes(args.frequency)) {
        throw new ToolInputError('frequency 는 once/daily/always 중 하나여야 합니다.')
      }
      data.frequency = args.frequency
    }
    if (args.logic !== undefined) {
      if (!['AND', 'OR'].includes(args.logic)) {
        throw new ToolInputError('logic 은 AND/OR 중 하나여야 합니다.')
      }
      data.logic = args.logic
    }
    if (args.name !== undefined) {
      const trimmed = args.name.trim()
      if (!trimmed) throw new ToolInputError('name 은 빈 값이 될 수 없습니다.')
      data.name = trimmed
    }
    if (Object.keys(data).length === 0) {
      throw new ToolInputError('변경할 필드가 없습니다.')
    }

    const updated = await prisma.customStrategy.update({ where: { id }, data })
    return toolResult(`✅ 전략 수정: ${updated.name} (${updated.ticker}) — 활성:${updated.isActive} 빈도:${updated.frequency}`)
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_custom_strategy: 완전 삭제
 */
export async function deleteCustomStrategy(args: { id: string }) {
  try {
    const id = args?.id?.trim()
    if (!id) throw new ToolInputError('전략 id가 필요합니다.')

    const existing = await prisma.customStrategy.findUnique({ where: { id } })
    if (!existing) throw new ToolInputError(`전략을 찾을 수 없습니다: ${id}`)

    await prisma.customStrategy.delete({ where: { id } })
    return toolResult(`🗑️ 전략 삭제: ${existing.name} (${existing.ticker})`)
  } catch (error) {
    return toolError(error)
  }
}

