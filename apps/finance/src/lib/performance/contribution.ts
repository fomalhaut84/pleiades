import { prisma } from '@/lib/prisma'
import { periodToStartDate } from './constants'
import { modifiedDietzFromSnapshots } from './modified-dietz'

export interface HoldingContribution {
  ticker: string
  displayName: string
  weightStart: number           // 시작 스냅샷 비중 (%)
  weightEnd: number             // 종료 스냅샷 비중 (%)
  returnPct: number | null      // 종목 수익률 r_i (%) — 분모가 작으면 null("—")
  contribution: number | null   // 기여도 c_i (%p) — 계좌 분모가 작으면 null
  gainKRW: number               // 손익 G_i(원) = 끝 − 시작 − 순유입 + 배당
  netFlowKRW: number            // 기간 순매수(+)·순매도(−) — 스냅샷 수량 차분
  dividendKRW: number           // 기간 세후 배당
}

export interface ContributionResult {
  accountId: string
  accountName: string
  period: string
  holdings: HoldingContribution[]
  totalReturn: number | null    // 기간 수익률 R (%) = Σ 기여도 · Modified Dietz — TWR 이 아니다
  hasData: boolean
}

/**
 * 종목별 기여도 — 현금흐름 보정(Modified Dietz · docs/specs/010-fin-cashflow-return.md · pleiades#554).
 *
 * 경계는 "보유 종목만"(스냅샷에 현금이 없다)이라 매수·매도·vest 가 외부 흐름이다. 흐름은 기간 안 스냅샷 전체의
 * 수량 차분에서 얻는다(거래 기록 날짜는 스냅샷과 맞지 않는다 · 010 §3-3). 세후 배당은 수익에 넣는다.
 * 기여도 합 = 기간 수익률. 분할은 기록 경로가 없어 매매로 보일 수 있다.
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
  const empty: ContributionResult = {
    accountId,
    accountName: account.name,
    period,
    holdings: [],
    totalReturn: null,
    hasData: false,
  }

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      accountId,
      ...(startDate ? { snapshotDate: { gte: startDate } } : {}),
    },
    orderBy: { snapshotDate: 'asc' },
    select: {
      snapshotDate: true,
      totalValueKRW: true,
      holdingSnapshots: { select: { ticker: true, displayName: true, shares: true, valueKRW: true } },
    },
  })
  if (snapshots.length < 2) return empty

  const first = snapshots[0]
  const last = snapshots[snapshots.length - 1]

  // 배당 지급일 [S, E) — modifiedDietz 가 다시 거른다(반열린 구간 · 010 §2 정정 블록)
  const dividends = await prisma.dividend.findMany({
    where: { accountId, payDate: { gte: first.snapshotDate, lt: last.snapshotDate } },
    select: { ticker: true, payDate: true, amountKRW: true },
  })

  const result = modifiedDietzFromSnapshots(
    snapshots.map((s) => ({ date: s.snapshotDate, holdings: s.holdingSnapshots })),
    dividends.map((d) => ({ ticker: d.ticker, date: d.payDate, amountKRW: d.amountKRW }))
  )
  if (!result) return empty

  // 표시 이름 — 가장 늦게 나온 스냅샷의 이름(전량 매도 종목은 마지막 보유 때 이름)
  const names = new Map<string, string>()
  for (const s of snapshots) for (const h of s.holdingSnapshots) names.set(h.ticker, h.displayName)

  const startTotal = first.totalValueKRW
  const endTotal = last.totalValueKRW
  const holdings: HoldingContribution[] = result.holdings
    .map((h) => ({
      ticker: h.ticker,
      displayName: names.get(h.ticker) ?? h.ticker,
      weightStart: startTotal > 0 ? (h.startKRW / startTotal) * 100 : 0,
      weightEnd: endTotal > 0 ? (h.endKRW / endTotal) * 100 : 0,
      returnPct: h.returnPct,
      contribution: h.contributionPct,
      gainKRW: h.gainKRW,
      netFlowKRW: h.flowKRW,
      dividendKRW: h.dividendKRW,
    }))
    // 기여도가 null(계좌 분모가 작다)이어도 순서가 같도록 손익 절대값 순
    .sort((a, b) => Math.abs(b.gainKRW) - Math.abs(a.gainKRW))

  return {
    accountId,
    accountName: account.name,
    period,
    holdings,
    totalReturn: result.returnPct,
    hasData: true,
  }
}
