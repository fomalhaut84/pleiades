import { prisma } from '@/lib/prisma'
import { toolResult, toolError } from '../utils'

const VALID_STRATEGIES = ['long_hold', 'swing', 'momentum', 'value', 'watch', 'scalp']

/** YYYY-MM-DD 엄격 파싱 */
function parseStrictDate(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null
  }
  return date
}

const STRATEGY_LABELS: Record<string, string> = {
  long_hold: '장기보유',
  swing: '스윙',
  momentum: '모멘텀',
  value: '가치투자',
  watch: '감시',
  scalp: '단타',
}

/**
 * get_holding_strategy: 종목의 전략 태그, 목표가, 손절가, 메모, 점검일 조회
 */
export async function getHoldingStrategy(args: { ticker: string }) {
  try {
    const ticker = args.ticker.toUpperCase()

    const holdings = await prisma.holding.findMany({
      where: { ticker },
      include: {
        strategy: true,
        account: { select: { name: true } },
      },
    })

    if (holdings.length === 0) {
      return toolResult(`보유 종목에서 ${ticker}을(를) 찾을 수 없습니다.`)
    }

    const lines: string[] = []

    for (const h of holdings) {
      const s = h.strategy
      const strat = STRATEGY_LABELS[s?.strategy ?? 'long_hold'] ?? s?.strategy ?? 'long_hold'

      lines.push(`## ${h.displayName} (${h.ticker}) — ${h.account.name}`)
      lines.push(`전략: ${strat}`)
      lines.push(`보유: ${h.shares}주, 평단 ${h.avgPrice}`)
      if (s?.memo) lines.push(`메모: ${s.memo}`)
      if (s?.targetPrice != null) lines.push(`목표가: ${s.targetPrice}`)
      if (s?.stopLoss != null) lines.push(`손절가: ${s.stopLoss}`)
      if (s?.entryLow != null && s?.entryHigh != null) lines.push(`매수구간: ${s.entryLow} ~ ${s.entryHigh}`)
      if (s?.reviewDate) lines.push(`점검일: ${s.reviewDate.toISOString().slice(0, 10)}`)
      lines.push('')
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * get_all_strategies: 전체 보유 종목의 전략 현황
 */
export async function getAllStrategies() {
  try {
    const accounts = await prisma.account.findMany({
      include: {
        holdings: {
          include: { strategy: true },
          orderBy: { ticker: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const lines: string[] = ['## 전체 종목 전략 현황\n']

    for (const account of accounts) {
      if (account.holdings.length === 0) continue
      lines.push(`**${account.name}**`)
      for (const h of account.holdings) {
        const s = h.strategy
        const strat = STRATEGY_LABELS[s?.strategy ?? 'long_hold'] ?? 'long_hold'
        let detail = `- ${h.displayName} (${h.ticker}): ${strat}`
        if (s?.targetPrice != null) detail += ` | 목표 ${s.targetPrice}`
        if (s?.stopLoss != null) detail += ` | 손절 ${s.stopLoss}`
        if (s?.memo) detail += ` | ${s.memo}`
        lines.push(detail)
      }
      lines.push('')
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * set_holding_strategy: 보유 종목 전략/목표가/손절가/매수구간/메모/점검일 설정 (upsert)
 */
export async function setHoldingStrategy(args: {
  ticker: string
  account_name?: string
  strategy?: string
  targetPrice?: number | null
  stopLoss?: number | null
  entryLow?: number | null
  entryHigh?: number | null
  reviewDate?: string | null
  memo?: string | null
}) {
  try {
    const ticker = args.ticker.trim().toUpperCase()
    if (!ticker) return toolError('ticker가 필요합니다.')

    if (args.strategy !== undefined && !VALID_STRATEGIES.includes(args.strategy)) {
      return toolError(`유효한 전략: ${VALID_STRATEGIES.join(', ')}`)
    }

    const where: Record<string, unknown> = { ticker }
    if (args.account_name) where.account = { name: args.account_name }
    const holdings = await prisma.holding.findMany({
      where,
      include: { account: { select: { name: true } }, strategy: true },
    })

    if (holdings.length === 0) {
      return toolError(`보유 종목을 찾을 수 없습니다: ${ticker}${args.account_name ? ` (${args.account_name})` : ''}`)
    }
    if (holdings.length > 1) {
      if (!args.account_name) {
        const accounts = holdings.map((h) => h.account.name).join(', ')
        return toolError(`여러 계좌가 보유 중입니다. account_name을 지정해주세요: ${accounts}`)
      }
      // account_name 지정해도 여러 건 매칭 → 동명 계좌 다중 존재 (데이터 모호성 → 거부)
      return toolError(`'${args.account_name}' 이름의 계좌가 여러 개 있습니다. 관리자가 계좌 이름을 정리한 후 다시 시도해주세요.`)
    }

    const holding = holdings[0]
    const existing = holding.strategy
    const nextLow = args.entryLow !== undefined ? args.entryLow : existing?.entryLow ?? null
    const nextHigh = args.entryHigh !== undefined ? args.entryHigh : existing?.entryHigh ?? null
    if (nextLow != null && nextHigh != null && nextLow > nextHigh) {
      return toolError('매수 구간 하한(entryLow)은 상한(entryHigh)보다 작거나 같아야 합니다.')
    }

    let reviewDateValue: Date | null | undefined
    if (args.reviewDate === null) {
      reviewDateValue = null
    } else if (args.reviewDate !== undefined) {
      const parsed = parseStrictDate(args.reviewDate)
      if (!parsed) return toolError('reviewDate는 YYYY-MM-DD 형식이어야 합니다.')
      reviewDateValue = parsed
    }

    const updateData: Record<string, unknown> = {}
    if (args.strategy !== undefined) updateData.strategy = args.strategy
    if (args.targetPrice !== undefined) updateData.targetPrice = args.targetPrice
    if (args.stopLoss !== undefined) updateData.stopLoss = args.stopLoss
    if (args.entryLow !== undefined) updateData.entryLow = args.entryLow
    if (args.entryHigh !== undefined) updateData.entryHigh = args.entryHigh
    if (args.memo !== undefined) updateData.memo = args.memo === null ? null : args.memo.trim() || null
    if (reviewDateValue !== undefined) updateData.reviewDate = reviewDateValue

    if (Object.keys(updateData).length === 0) {
      return toolError('변경할 필드가 없습니다.')
    }

    const created = await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: updateData,
      create: {
        holdingId: holding.id,
        strategy: args.strategy ?? 'long_hold',
        targetPrice: args.targetPrice ?? null,
        stopLoss: args.stopLoss ?? null,
        entryLow: args.entryLow ?? null,
        entryHigh: args.entryHigh ?? null,
        memo: args.memo === null ? null : args.memo?.trim() || null,
        reviewDate: reviewDateValue ?? null,
      },
    })

    const stratLabel = STRATEGY_LABELS[created.strategy] ?? created.strategy
    const lines = [
      `✅ 전략 설정 완료: ${holding.displayName} (${holding.ticker}) — ${holding.account.name}`,
      `- 전략: ${stratLabel}`,
    ]
    if (created.targetPrice != null) lines.push(`- 목표가: ${created.targetPrice}`)
    if (created.stopLoss != null) lines.push(`- 손절가: ${created.stopLoss}`)
    if (created.entryLow != null && created.entryHigh != null) lines.push(`- 매수 구간: ${created.entryLow} ~ ${created.entryHigh}`)
    if (created.reviewDate) lines.push(`- 점검일: ${created.reviewDate.toISOString().slice(0, 10)}`)
    if (created.memo) lines.push(`- 메모: ${created.memo}`)

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
