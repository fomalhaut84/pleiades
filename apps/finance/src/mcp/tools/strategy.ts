import { prisma } from '@/lib/prisma'
import { toolResult, toolError } from '../utils'

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
