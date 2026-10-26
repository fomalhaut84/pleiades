import { createYahooFinance } from '@/lib/yahoo-client'
import { prisma } from '@/lib/prisma'

const yahooFinance = createYahooFinance()

export interface BackfillResult {
  ticker: string
  inserted: number
  skipped: number
}

/**
 * 벤치마크 히스토리를 Yahoo Finance에서 조회하여 DB에 저장한다.
 * 기본 1년치 backfill.
 */
export async function backfillBenchmark(
  ticker: string,
  months: number = 12
): Promise<BackfillResult> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)
  startDate.setUTCHours(0, 0, 0, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any[] = await yahooFinance.historical(ticker, {
    period1: startDate,
    period2: new Date(),
    interval: '1d',
  })

  let inserted = 0
  let skipped = 0

  for (const row of history) {
    const close = Number(row.close)
    if (!close || isNaN(close)) {
      skipped++
      continue
    }

    const priceDate = new Date(row.date)
    priceDate.setUTCHours(0, 0, 0, 0)

    try {
      await prisma.benchmarkPrice.upsert({
        where: {
          ticker_priceDate: { ticker, priceDate },
        },
        update: { close },
        create: {
          ticker,
          priceDate,
          close,
          currency: 'USD',
        },
      })
      inserted++
    } catch {
      skipped++
    }
  }

  console.log(`[benchmark] ${ticker}: ${inserted} inserted, ${skipped} skipped`)
  return { ticker, inserted, skipped }
}

/**
 * 모든 계좌의 벤치마크를 backfill한다.
 */
export async function backfillAllBenchmarks(months: number = 12): Promise<BackfillResult[]> {
  const accounts = await prisma.account.findMany({
    where: { benchmarkTicker: { not: null } },
    select: { benchmarkTicker: true },
  })

  const uniqueTickers = Array.from(
    new Set(accounts.map((a) => a.benchmarkTicker!))
  )

  const results: BackfillResult[] = []
  for (const ticker of uniqueTickers) {
    const result = await backfillBenchmark(ticker, months)
    results.push(result)
  }

  return results
}

/** #261 — 일일 적재의 최대 범위(개월). 시세가 아예 없거나 아주 오래 멈췄으면 웹 버튼과 같은 12개월 */
const REFRESH_MAX_MONTHS = 12
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * #261 — 마지막 적재일부터 지금까지를 덮는 개월 수. pure.
 * 고정 1개월이면 크론이 한 달 넘게 멈췄을 때 공백이 남고, calculateBenchmarkReturn 이
 * 구간 첫 시세만 보므로 3M·6M 알파가 null 대신 틀린 값이 된다 (사전 리뷰 major).
 * 28일 단위 올림 + 1 — setMonth 의 말일 넘침(3/31 → 3/3)으로 범위가 줄어도 마지막 적재일을 덮는다.
 */
export function refreshMonths(lastPriceDate: Date | null, now: Date): number {
  if (!lastPriceDate) return REFRESH_MAX_MONTHS
  const days = Math.max(0, (now.getTime() - lastPriceDate.getTime()) / DAY_MS)
  return Math.min(REFRESH_MAX_MONTHS, Math.ceil(days / 28) + 1)
}

export interface RefreshResult extends BackfillResult {
  /** 이번에 받은 범위(개월). 실패면 시도한 값 */
  months: number
  /** 이 티커만 실패했을 때의 원인 — 다른 티커 적재는 계속된다 */
  error?: string
}

/**
 * #261 — 크론용 일일 적재. 티커마다 마지막 적재일부터 받고(refreshMonths),
 * 한 티커가 실패해도 나머지는 계속한다 (사전 리뷰 major — 무인 실행이라 하나가 막히면 전부 다시 멈춘다).
 * 웹 버튼 경로(backfillAllBenchmarks · 12개월)는 그대로다.
 */
export async function refreshAllBenchmarks(now: Date = new Date()): Promise<RefreshResult[]> {
  const accounts = await prisma.account.findMany({
    where: { benchmarkTicker: { not: null } },
    select: { benchmarkTicker: true },
  })
  const uniqueTickers = Array.from(new Set(accounts.map((a) => a.benchmarkTicker!)))

  const results: RefreshResult[] = []
  for (const ticker of uniqueTickers) {
    let months = REFRESH_MAX_MONTHS
    try {
      const last = await prisma.benchmarkPrice.findFirst({
        where: { ticker },
        orderBy: { priceDate: 'desc' },
        select: { priceDate: true },
      })
      months = refreshMonths(last?.priceDate ?? null, now)
      const result = await backfillBenchmark(ticker, months)
      results.push({ ...result, months })
    } catch (error) {
      console.error(`[benchmark] ${ticker} 적재 실패:`, error)
      const message = error instanceof Error ? error.message : String(error)
      results.push({ ticker, inserted: 0, skipped: 0, months, error: message })
    }
  }
  return results
}
