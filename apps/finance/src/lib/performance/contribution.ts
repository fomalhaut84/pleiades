import { prisma } from '@/lib/prisma'
import { periodToStartDate } from './constants'
import { sharesDiffer } from './shares'

export interface HoldingContribution {
  ticker: string
  displayName: string
  weightStart: number   // 시작 시점 비중 (%)
  weightEnd: number     // 종료 시점 비중 (%)
  returnPct: number     // 개별 수익률 (%)
  contribution: number  // 기여도 (%)
  sharesStart: number   // 시작 시점 수량 (없으면 0)
  sharesEnd: number     // 종료 시점 수량 (없으면 0)
  sharesChanged: boolean // 기간 안에 수량이 바뀌었다 — 수익률·기여도에 매수·매도가 섞여 있다 (pleiades#262)
}

export interface ContributionResult {
  accountId: string
  accountName: string
  period: string
  holdings: HoldingContribution[]
  totalReturn: number   // 전체 수익률 (%)
  hasData: boolean
}

/**
 * 종목별 기여도 분석
 *
 * 시작/종료 시점의 HoldingSnapshot을 비교하여:
 * - weight_i = startValue_i / totalStartValue
 * - return_i = (endValue_i - startValue_i) / startValue_i
 * - contribution_i = weight_i * return_i
 *
 * 기간 안의 매수·매도·이체는 빼지 않는다 — 평가액 변화만 본다. 그래서 수량이 바뀐 종목은
 * `sharesChanged` 로 표시해 수익률·기여도를 실제 손익으로 읽지 않게 한다(pleiades#262 B).
 * 현금흐름 보정(Modified Dietz · #262 A)은 별도 설계다.
 */
export async function calculateContribution(
  accountId: string,
  period: string
): Promise<ContributionResult> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { name: true },
  })

  const startDate = periodToStartDate(period)

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      accountId,
      ...(startDate ? { snapshotDate: { gte: startDate } } : {}),
    },
    orderBy: { snapshotDate: 'asc' },
    include: { holdingSnapshots: true },
    take: 1,
  })

  const latestSnapshot = await prisma.portfolioSnapshot.findFirst({
    where: {
      accountId,
      ...(startDate ? { snapshotDate: { gte: startDate } } : {}),
    },
    orderBy: { snapshotDate: 'desc' },
    include: { holdingSnapshots: true },
  })

  if (snapshots.length === 0 || !latestSnapshot || snapshots[0].id === latestSnapshot.id) {
    return {
      accountId,
      accountName: account.name,
      period,
      holdings: [],
      totalReturn: 0,
      hasData: false,
    }
  }

  const startSnapshot = snapshots[0]
  const endSnapshot = latestSnapshot

  const startTotal = startSnapshot.totalValueKRW
  const endTotal = endSnapshot.totalValueKRW

  if (startTotal === 0) {
    return {
      accountId,
      accountName: account.name,
      period,
      holdings: [],
      totalReturn: 0,
      hasData: false,
    }
  }

  // 시작 시점 종목별 가치 매핑
  const startMap = new Map<string, { valueKRW: number; shares: number }>()
  for (const h of startSnapshot.holdingSnapshots) {
    const existing = startMap.get(h.ticker)
    startMap.set(h.ticker, {
      valueKRW: (existing?.valueKRW ?? 0) + h.valueKRW,
      shares: (existing?.shares ?? 0) + h.shares,
    })
  }

  // 종료 시점 종목별 가치 매핑
  const endMap = new Map<string, { valueKRW: number; shares: number; displayName: string }>()
  for (const h of endSnapshot.holdingSnapshots) {
    const existing = endMap.get(h.ticker)
    endMap.set(h.ticker, {
      valueKRW: (existing?.valueKRW ?? 0) + h.valueKRW,
      shares: (existing?.shares ?? 0) + h.shares,
      displayName: h.displayName,
    })
  }

  // 모든 종목 합집합
  const allTickers = new Set<string>()
  startMap.forEach((_, k) => allTickers.add(k))
  endMap.forEach((_, k) => allTickers.add(k))
  const holdings: HoldingContribution[] = []

  allTickers.forEach((ticker) => {
    const startValue = startMap.get(ticker)?.valueKRW ?? 0
    const endValue = endMap.get(ticker)?.valueKRW ?? 0
    const sharesStart = startMap.get(ticker)?.shares ?? 0
    const sharesEnd = endMap.get(ticker)?.shares ?? 0
    const displayName = endMap.get(ticker)?.displayName
      ?? startSnapshot.holdingSnapshots.find((h) => h.ticker === ticker)?.displayName
      ?? ticker

    const weightStart = startTotal > 0 ? (startValue / startTotal) * 100 : 0
    const weightEnd = endTotal > 0 ? (endValue / endTotal) * 100 : 0
    const returnPct = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0
    const contribution = (weightStart / 100) * returnPct

    holdings.push({
      ticker,
      displayName,
      weightStart,
      weightEnd,
      returnPct,
      contribution,
      sharesStart,
      sharesEnd,
      sharesChanged: sharesDiffer(sharesStart, sharesEnd),
    })
  })

  // 기여도 절대값 순 정렬
  holdings.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

  const totalReturn = startTotal > 0 ? ((endTotal - startTotal) / startTotal) * 100 : 0

  return {
    accountId,
    accountName: account.name,
    period,
    holdings,
    totalReturn,
    hasData: true,
  }
}
