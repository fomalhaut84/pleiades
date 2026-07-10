/**
 * Phase 34-A (#419) — EarningsCache 접근 헬퍼.
 */

import { prisma } from '@/lib/prisma'
import type { EarningsFetchResult } from './fetcher'

export interface EarningsSnapshot {
  ticker: string
  nextEarningsDate: Date | null
  lastFetchedAt: Date
}

export async function getEarnings(ticker: string): Promise<EarningsSnapshot | null> {
  const row = await prisma.earningsCache.findUnique({ where: { ticker } })
  if (!row) return null
  return {
    ticker: row.ticker,
    nextEarningsDate: row.nextEarningsDate,
    lastFetchedAt: row.lastFetchedAt,
  }
}

export async function getEarningsMany(tickers: string[]): Promise<Map<string, EarningsSnapshot>> {
  if (tickers.length === 0) return new Map()
  const rows = await prisma.earningsCache.findMany({
    where: { ticker: { in: tickers } },
  })
  return new Map(rows.map((r) => [
    r.ticker,
    { ticker: r.ticker, nextEarningsDate: r.nextEarningsDate, lastFetchedAt: r.lastFetchedAt },
  ]))
}

/**
 * fetcher 결과를 upsert. 실패한 티커 (error 있음) 는 nextEarningsDate 를
 * 이전 값 유지 (best-effort — 일시적 네트워크 오류로 캐시 무효화 방지).
 * 성공한 티커는 nextEarningsDate 를 새 값으로 갱신 (null 도 유효한 성공값).
 */
export async function upsertEarningsResults(results: EarningsFetchResult[]): Promise<{
  ok: number
  failed: number
}> {
  let ok = 0
  let failed = 0
  for (const r of results) {
    if (r.error) {
      failed++
      // 실패 시엔 lastFetchedAt 만 업데이트 (row 없으면 새로 생성 X — noise 방지)
      try {
        await prisma.earningsCache.updateMany({
          where: { ticker: r.ticker },
          data: { lastFetchedAt: new Date() },
        })
      } catch {
        // ignore
      }
      continue
    }
    ok++
    try {
      await prisma.earningsCache.upsert({
        where: { ticker: r.ticker },
        create: {
          ticker: r.ticker,
          nextEarningsDate: r.nextEarningsDate,
          lastFetchedAt: new Date(),
        },
        update: {
          nextEarningsDate: r.nextEarningsDate,
          lastFetchedAt: new Date(),
        },
      })
    } catch (error) {
      console.error(`[earnings/cache] upsert 실패 (${r.ticker}):`, error)
    }
  }
  return { ok, failed }
}
