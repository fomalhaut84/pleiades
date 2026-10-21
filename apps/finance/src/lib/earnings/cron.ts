/**
 * Phase 34-A (#419) — 어닝 캘린더 갱신 cron.
 * 매일 KST 06:00 (미국장 마감 후, 한국장 시작 전).
 * 대상 = 활성 CustomStrategy 티커 ∪ Watchlist ∪ 보유 종목 (shares > 0).
 */

import { prisma } from '@/lib/prisma'
import { fetchEarningsMany } from './fetcher'
import { upsertEarningsResults } from './cache'

/**
 * DB 에서 대상 티커 3소스 조회 → 중복 제거된 정렬 배열 반환 (테스트 가능하도록 export).
 * concurrency 를 유지하기 위해 안정된 순서 (알파벳순) 로 반환.
 */
export async function gatherTargetTickers(): Promise<string[]> {
  const [strategies, watchlist, holdings] = await Promise.all([
    prisma.customStrategy.findMany({
      where: { isActive: true },
      select: { ticker: true },
    }),
    prisma.watchlist.findMany({ select: { ticker: true } }),
    prisma.holding.findMany({
      where: { shares: { gt: 0 } },
      select: { ticker: true },
      distinct: ['ticker'],
    }),
  ])

  const set = new Set<string>()
  for (const row of strategies) set.add(row.ticker)
  for (const row of watchlist) set.add(row.ticker)
  for (const row of holdings) set.add(row.ticker)
  return Array.from(set).sort()
}

/**
 * 한 번의 어닝 스캔 실행 — 대상 티커 수집 → fetch → upsert.
 * 결과 요약을 반환 (로그 및 테스트용).
 */
export async function runEarningsScan(): Promise<{
  attempted: number
  ok: number
  failed: number
}> {
  const tickers = await gatherTargetTickers()
  if (tickers.length === 0) return { attempted: 0, ok: 0, failed: 0 }
  const results = await fetchEarningsMany(tickers, 5)
  const { ok, failed } = await upsertEarningsResults(results)
  return { attempted: tickers.length, ok, failed }
}
